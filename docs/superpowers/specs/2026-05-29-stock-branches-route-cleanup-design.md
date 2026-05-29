# Consolidação de rotas de estoque — matar `/dashboard/stock/branches` + limpar código morto (#77, item B)

**Data:** 2026-05-29
**Issue:** [#77](https://github.com/othavioquiliao/emach-dashboard/issues/77) — item B
**Branch:** `issue-77`

## Contexto

A issue #77 nasceu de `/dashboard/tools` estar "sobrecarregada conceitualmente" (catálogo × estoque). O núcleo já foi resolvido (badge, tabs, tool-status lifecycle via PR #86). Restavam os itens B (consolidar rotas de estoque) e C (atalho de reposição na sidebar).

Ao investigar o item B, o estado real divergiu do comentário da issue:

- A **"matriz global" `/dashboard/stock`** mencionada na proposta **não existe mais como rota própria** — o PR #66 ("unificação tools×stock") a transformou em `redirect → /dashboard/tools?mode=repor`. A reposição cross-filial já vive dentro de Ferramentas (com filtro `branchId` opcional e breakdown de estoque por filial no card).
- A única página de estoque "real" que sobrou é **`/dashboard/stock/branches`** (estoque por filial), e ela está **órfã**: nenhum item de navegação aponta para ela (só `revalidatePath` interno). Acessível apenas digitando a URL.

### Duas granularidades de dados de estoque (mapeadas no código)

| Visão | Fetcher | Granularidade | Edita saldo? | Onde aparece |
|---|---|---|---|---|
| **Catálogo / reposição** | `fetchToolsPage` (`tools/actions.ts`) | TOOL (perfil) | Não (navegação) | `/dashboard/tools` — modos Catálogo/Repor/Esgotadas + filtro de filial |
| **Saldo por filial** | `fetchBranchStockPage` (`stock/branch-stock-data.ts`) | VARIANTE × FILIAL | Sim (sheet inline) | `branches/[id]?tab=stock` (`StockTab`) **e** `/dashboard/stock/branches` (mesmos componentes + chips de filial) |

`/dashboard/stock/branches` e a `StockTab` de Filiais usam **exatamente os mesmos** componentes (`BranchStockFilters`, `BranchStockInfinite`, `fetchBranchStockPage`). A única feature extra de `/stock/branches` são os chips para trocar de filial — que apenas duplicam o fluxo natural "Filiais → escolher filial → tab Estoque".

### Código morto pré-existente (descoberto na investigação)

Ao aposentar a matriz global `/dashboard/stock`, o PR #66 deixou órfãos os componentes da antiga visão por-tool:

- `stock/_components/stock-infinite.tsx` (`StockInfinite`) — importado por ninguém.
- `stock/_components/stock-filters.tsx` (`StockFilters`) — importado por ninguém.
- `stock/_components/stock-card-actions.tsx` (`StockCardActions`) — componente de apresentação puro (não chama actions); consumido só por `stock-infinite`.
- `fetchStockPage` + `StockFiltersInput` em `stock/actions.ts` — consumidos só por `stock-infinite`.

Confirmado que **não afetam outras regiões**: `adjustStock`, `updateStockThresholds`, `stock-threshold-schema`, `stock-adjustment-schema` e todos os `branch-stock-*` permanecem vivos (usados por `branch-stock-edit-sheet` e `stock-cell-sheet`, ambos ativos).

## Decisão

Executado em duas fases:

- **Fase 1 (escopo mínimo):** matar a rota órfã `/dashboard/stock/branches` e limpar o código morto da mesma área.
- **Fase 2 (item B completo + decisão sobre C):** resolver a ambiguidade da sidebar **removendo o item "Estoque"** do grupo Operação. Passa a haver uma porta só — "Ferramentas" (Catálogo), com o toggle Catálogo/Repor/Esgotadas e o badge de estoque. Reposição vira filtro interno de Ferramentas. O **item C** (#79 — atalho de reposição na sidebar) fica **descartado por decisão consciente**: "sem atalho direto na nav".

A `/dashboard/stock` (redirect → `tools?mode=repor`) **permanece**, pois deep-links internos (ReorderTable, pending-data, KPI de filial) ainda a usam.

## Mudanças

### 1. `apps/web/src/app/dashboard/stock/branches/page.tsx` → redirect inteligente

Substituir a página inteira por um `permanentRedirect` (308), espelhando o padrão de `branches/[id]/stock/page.tsx` e `tools/[id]/stock/page.tsx`:

- Se `searchParams.branch` presente → `/dashboard/branches/{branch}?tab=stock` **preservando** `categoryId`, `search`, `sort`, `status` (os 4 params que a `StockTab` lê em `branches/[id]/page.tsx:87-90`).
- Caso contrário → `/dashboard/branches` (lista; o usuário escolhe a filial e abre a tab Estoque).

A pasta `stock/branches/` deixa de ter `page.tsx` real — vira só o redirect.

### 2. `apps/web/src/app/dashboard/stock/actions.ts` → corrigir `revalidatePath`

As 2 chamadas `revalidatePath("/dashboard/stock/branches")` (em `adjustStock` e `updateStockThresholds`) revalidam uma rota que agora é redirect. Trocar para revalidar a rota viva onde o ajuste acontece:

- `revalidatePath(\`/dashboard/branches/${branchId}\`)` — usando o `branchId` já disponível no escopo da action.

Verificar na implementação se `branchId` está acessível em ambas as actions; se não, derivar do input.

### 3. Remover código morto órfão

Deletar:
- `apps/web/src/app/dashboard/stock/_components/stock-infinite.tsx`
- `apps/web/src/app/dashboard/stock/_components/stock-filters.tsx`
- `apps/web/src/app/dashboard/stock/_components/stock-card-actions.tsx`

Em `apps/web/src/app/dashboard/stock/actions.ts`:
- Remover `export async function fetchStockPage(...)`, a interface `StockFiltersInput` e quaisquer helpers exclusivos dela (`buildStock*WhereClause`/cursor) que não sejam compartilhados com `fetchBranchStockPage` ou outras actions vivas.

Após remover, rodar `bun check-types` para confirmar que nenhum import pendente quebrou.

### 4. Remover item "Estoque" da sidebar (Fase 2)

Em `apps/web/src/app/dashboard/_components/nav-config.ts`:
- Remover o item `Estoque` (`href: /dashboard/stock`, `badgeKey: "stock"`) do grupo "Operação". O grupo passa a ter Pedidos + Filiais.
- Remover o ícone `Boxes` do import de `lucide-react` (fica órfão).
- "Ferramentas" (grupo Catálogo) mantém `badgeKey: "stock"` e o toggle de modos — vira a porta única de estoque/reposição.

## O que NÃO muda

- "Ferramentas" (`nav-config.ts`, grupo Catálogo): mantém `badgeKey: "stock"` e o toggle Catálogo/Repor/Esgotadas.
- `/dashboard/stock` (redirect → `tools?mode=repor`): permanece — deep-links internos (ReorderTable, pending-data, KPI de filial) seguem válidos.
- `branches/[id]?tab=stock` (`StockTab`) e toda a cadeia `branch-stock-*` — permanecem.
- Edição de saldo (`adjustStock`, `updateStockThresholds`, sheets, schemas) — permanece.
- `/dashboard/stock` (redirect → tools), `branches/[id]/stock` e `tools/[id]/stock` (já redirects) — intactos.
- `ReorderTable`, `pending-data`, badge "stock" — intactos (linkam `/dashboard/stock`, que segue válido).

## Verificação

`bun check-types` + smoke run-time (`bun dev:web`, porta 3001) com revisão visual via claude-in-chrome:

1. `/dashboard/stock/branches` → redireciona para `/dashboard/branches` (lista).
2. `/dashboard/stock/branches?branch={id}&status=critical` → redireciona para `/dashboard/branches/{id}?tab=stock&status=critical` e a tab carrega com o filtro aplicado.
3. `/dashboard/branches/{id}?tab=stock` → tab Estoque funcional (lista, filtros, sheet de ajuste).
4. Ajustar saldo na tab → valor persiste e a página revalida (sem erro de `revalidatePath`).
5. `/dashboard/tools?mode=repor` e `/dashboard/stock` (redirect) → seguem funcionando.
6. Sem regressão visual nas rotas de estoque/ferramentas.

## Riscos

- **Baixo.** A rota removida é órfã (sem links de entrada). O redirect cobre bookmarks/histórico. O código morto removido não tem consumidores vivos (verificado).
- Atenção ao remover helpers de `fetchStockPage` em `actions.ts`: confirmar que não são compartilhados antes de deletar (`bun check-types` pega).

## Decisões registradas (não são "futuro")

- **Item C** (#79): atalho de reposição na sidebar — **descartado**. A reposição é acessível via Ferramentas (toggle "Repor agora", badge) e via deep-links internos; não haverá item dedicado na navegação.
- Ambiguidade "Estoque" × "Ferramentas": **resolvida** removendo o item "Estoque" (Fase 2). Porta única = Ferramentas.
