# Reconstrução da tab Variantes & preços — exclusão + status

**Goal:** Permitir, na tab Variantes & preços do perfil de ferramenta, ocultar uma variante do site (status), excluir uma variante específica e excluir a ferramenta inteira — com guards e mensagens de erro intuitivas.

**Architecture:** Nova coluna `visibleOnSite` em `tool_variant` (espelha `tool.visibleOnSite`). A tab ganha uma coluna de visibilidade (badge + toggle) e uma de ação (excluir, order-aware), mais uma zona de perigo para excluir a ferramenta. Server actions order-aware com mensagens tratadas. O delete da ferramenta sai do header e passa a viver aqui.

**Tech Stack:** Next 16 / React 19 / Drizzle (push-only) / base-ui (`AlertDialog`, `Switch`/toggle) / vitest (node).

---

## 1. Estado atual & motivação

- A tab (`tools/[id]/_components/variants-tab.tsx`) é uma tabela editável (SKU, Voltagem, Preço, Custo, Padrão) — **sem** excluir e **sem** status. Hoje não há como remover ou ocultar uma variante.
- `tool_variant` **não tem** coluna de status. Tem `visibleOnSite`? **Não** — só `tool.visibleOnSite` (nível ferramenta). Precisa de coluna nova.
- FKs que referenciam a variante: `stockLevel` (cascade), `stockMovement` (set null), **`orderItem` (restrict)**. → Variante com pedido **não pode** ser hard-deletada; a alternativa é ocultar.
- `deleteTool` existe mas devolve o erro cru do banco no catch; o trash vive no header (`tool-detail-actions.tsx`).
- Guards de domínio: ferramenta exige ≥1 variante e exatamente uma `isDefault` (constraint `tool_variant_one_default_per_tool`).

## 2. Decisões (validadas)

- **Escopo unificado:** excluir variante específica **e** a ferramenta inteira, nesta tab (move o delete do header pra cá).
- **Status = visibilidade no site:** variante oculta não aparece no ecommerce, mas **continua no dashboard** com badge "Oculta". É um booleano, não um enum.
- **Layout A (ações inline):** status (badge + toggle) e excluir por linha; zona de perigo embaixo só para a ferramenta.
- **Variante padrão excluída:** reatribuir a padrão automaticamente (não bloquear).

## 3. Modelo de dados

Adicionar a `tool_variant` (`packages/db/src/schema/tools.ts`):

```ts
visibleOnSite: boolean("visible_on_site").notNull().default(true),
```

- Push-only: `bun db:sync` após editar o schema. Sem migration versionada (ADR-0006).
- **Cross-repo (ADR-0009):** o app ecommerce passa a filtrar variantes por `visibleOnSite = true`. O schema TS sincroniza via CI PR; o contrato é documentado em `docs/integration/admin-ecommerce.md` (variante oculta = invisível no site, incluindo a seleção de variante padrão).
- `ToolDetailVariant` (`tool-detail-data.ts`) herda o campo automaticamente (`typeof toolVariant.$inferSelect`).

## 4. Dados da tab

A query de variantes em `tool-detail-data.ts` passa a expor, por variante, **se há pedidos** (para a UI order-aware). Adicionar um campo derivado:

- `hasOrders: boolean` — `EXISTS (SELECT 1 FROM order_item WHERE order_item.variant_id = tool_variant.id)`, via subquery/left-join agregado.

Tipo novo na tab (não polui `ToolDetailVariant`): a tab recebe `variants` enriquecidas. Opções de implementação no plano; o spec exige apenas que a tab saiba `hasOrders` por variante.

## 5. UI — `variants-tab.tsx` reconstruída (layout A)

Mantém a edição inline de SKU/Voltagem/Preço/Custo/Padrão. Adiciona:

- **Coluna "Visível no site":** badge `Ativa` (success) / `Oculta` (muted) + um toggle (`Switch`). Alternar chama `setVariantVisibility` e salva na hora (não-destrutivo, com toast). Otimista ou via `useTransition`.
- **Coluna de ação (excluir):**
  - `hasOrders = false` → ícone lixeira (`destructive`) → abre `AlertDialog` de confirmação → `deleteToolVariant`.
  - `hasOrders = true` → ícone cadeado desabilitado + tooltip "Tem pedidos — não pode excluir. Oculte do site."
  - **Última variante** (variants.length === 1) → excluir desabilitado + tooltip "A ferramenta precisa de ao menos uma variante."
- **Zona de perigo** (card `border-destructive/40`, abaixo da tabela): título "Excluir ferramenta" + descrição + botão `destructive`/`outline` → `AlertDialog` → `deleteTool`. Botão desabilitado com tooltip quando a ferramenta tem qualquer variante com pedidos.
- `canMutate = false` → tab read-only atual (sem toggles, sem excluir, sem zona de perigo).

Confirmações seguem o padrão `AlertDialog` controlado (DESIGN.md §4): `useState` para `open`, `e.preventDefault()` no action, fechar no sucesso. Botão destrutivo nunca coral.

## 6. Server actions (`tools/actions.ts`)

Todas: `"use server"`, `await requireCapability(...)` (mesma cap das mutações de variante já existentes / `tools.delete` para delete), `ActionResult<T>`, `revalidatePath` após mutar. Nunca devolver erro cru — sempre mensagem tratada.

- **`setVariantVisibility({ variantId, visible })`** — `UPDATE tool_variant SET visible_on_site = $visible`. Se `visible = false` e a variante é a `isDefault`, retornar `{ ok: true, data: { warning: "default_hidden" } }` (a UI mostra toast de aviso "a variante padrão está oculta do site"). Revalidar `/dashboard/tools/[id]`.
- **`deleteToolVariant({ variantId })`**:
  1. Carregar a variante (toolId, isDefault) + contar irmãs e checar pedidos (`order_item`).
  2. **Pré-check pedidos:** se houver → `{ ok: false, error: "Esta variante tem pedidos e não pode ser excluída. Oculte-a do site." }` (nunca tenta o delete que estouraria o FK restrict).
  3. **Guard última:** se for a única variante da ferramenta → `{ ok: false, error: "A ferramenta precisa de ao menos uma variante." }`.
  4. **Reatribuir padrão:** se a variante é `isDefault`, em transação: deletar + setar `isDefault = true` na variante restante de menor `sortOrder`. Retornar `{ ok: true, data: { reassignedDefaultSku } }` para o toast ("Variante padrão reatribuída para X").
  5. Caso comum: deletar (cascade limpa `stockLevel`; `stockMovement` vira `set null`). Revalidar.
- **`deleteTool(id)`** (existente) — adicionar **pré-check de pedidos** em qualquer variante da ferramenta antes do delete; se houver → `{ ok: false, error: "Esta ferramenta tem pedidos e não pode ser excluída. Oculte-a do site (visibilidade) em vez disso." }`. Manter a limpeza de imagens. Continuar retornando mensagem tratada no catch como fallback.

## 7. Header

Em `tools/[id]/_components/tool-detail-actions.tsx`, **remover** o `DeleteToolDialog` (e a prop `canDelete` se ficar órfã). O delete da ferramenta passa a existir só na zona de perigo da tab Variantes & preços. Verificar que `canDelete` não fica sem uso na page.

## 8. Guards & edge cases (resumo)

| Situação | Comportamento |
|---|---|
| Variante com pedidos | Excluir bloqueado (pré-check + UI cadeado); ocultar é a saída |
| Última variante | Excluir bloqueado (≥1 obrigatória) |
| Excluir a variante padrão | Reatribui padrão p/ menor `sortOrder` restante, avisa no toast |
| Ocultar a variante padrão | Permite, mas warning (site precisa de padrão visível) |
| Ferramenta com pedidos | Excluir ferramenta bloqueado; mensagem orienta a ocultar |
| `canMutate = false` | Tab read-only (sem toggle/excluir/zona de perigo) |

## 9. Testes (vitest, node)

- **`delete-tool-variant`** (lógica das guards, mockando o query builder como em `__tests__/activity.test.ts`): bloqueia última variante; bloqueia com pedidos; reatribui padrão ao excluir a default.
- **`set-variant-visibility`**: retorna warning ao ocultar a padrão.
- Smoke visual: tab com variante normal (excluir ok), variante com pedidos (cadeado), toggle de visibilidade refletindo badge, zona de perigo (excluir ferramenta bloqueado quando há pedidos), read-only com `canMutate=false`.

## 10. Fora de escopo

- Enum de status com múltiplos estados (escolhido booleano).
- Reordenar variantes (drag) — fora deste trabalho.
- Mudanças no app ecommerce (consome via schema sincronizado; o filtro lá é trabalho do outro repo).
