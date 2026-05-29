# Tool status lifecycle: retirar `out_of_stock` (esgotado vira derivado)

**Data:** 2026-05-29
**Issue:** #77 (item A — out_of_stock manual vs derivado)
**Goal:** Remover `out_of_stock` do status de catálogo da ferramenta. "Esgotado" passa a ser estado **derivado** de `in_stock` (`SUM(stock_level.quantity) > 0`), ao vivo, eliminando drift. `tool.status` fica lifecycle puro: `draft / active / discontinued`.

---

## Contexto / por que

A buyability já é derivada e correta em ambos os apps:

- **Storefront (ecommerce):** "Esgotado" e o gate de compra vêm de `inStock` (derivado), **não** de `tool.status`:
  - `apps/web/src/components/product-card.tsx` — badge "Esgotado" de `!tool.inStock`.
  - `apps/web/src/app/product/[slug]/_components/product-info.tsx` — add-to-cart `disabled={!inStock}`.
  - `apps/web/src/app/checkout/_lib/place-order.ts` — gate é `SUM(stockLevel.quantity) < qty` (live).
- **`in_stock`** é computado em `packages/db/src/queries/catalog.ts` (`SUM(sl.quantity) > 0` por tool e por variante).

Logo, `out_of_stock` como **status manual** é um label redundante e sujeito a drift (tool `active` com 0 estoque já aparece esgotada via `in_stock`; tool `out_of_stock` com estoque vira contradição). O único uso de `tool.status` que importa pro storefront é o filtro de **visibilidade** (`STOREFRONT_STATUS_SQL`), que vive em `catalog.ts` (sincronizado dashboard→ecommerce via CI, ADR-0009).

**Descoberta que de-risca:** `tool.status` é `text("status").$type<ToolStatus>()` + **CHECK constraint** `valid_tool_status` — **não é pgEnum**. Remover um valor = migrar dados + atualizar o CHECK (drizzle-kit push faz drop&recreate). Sem `ALTER TYPE`/recriação de enum.

---

## Design

### Estado final
- `ToolStatus = "draft" | "active" | "discontinued"`.
- CHECK `valid_tool_status`: `status IN ('draft','active','discontinued')`.
- "Esgotado" = `active && !in_stock`, renderizado como badge derivado (admin) — storefront já faz isso.

### Separação de conceitos (altitude)
- **`tool.status`** = ciclo de vida do catálogo (rascunho → ativo → descontinuado). Manual.
- **`in_stock`** = estado de inventário, derivado de `stock_level`. Live, per-variante e per-tool.
- Nunca mais conflar os dois.

---

## Arquivos afetados

### `packages/db` (compartilhado — sincroniza pro ecommerce via CI)
- `src/schema/tools.ts`
  - `ToolStatus` → remover `"out_of_stock"`.
  - CHECK `valid_tool_status` → `IN ('draft','active','discontinued')`.
- `src/queries/catalog.ts`
  - `STOREFRONT_STATUS_SQL` (`t.status IN ('active','out_of_stock','discontinued')`) → `IN ('active','discontinued')`.
  - Lista de status do storefront (~linha 43, `"out_of_stock"`) → remover.
- `src/queries/dashboard.ts`
  - `getToolStatusBreakdown` (~linha 258, `AND t.status IN ('active','out_of_stock')`) → remover `out_of_stock`.

### `apps/web` (admin)
- `tools/_components/tool-schema.ts` — `TOOL_STATUS_OPTIONS` e `TOOL_STATUS_LABELS`: remover `out_of_stock`.
- `tools/[id]/_components/tool-detail-header.tsx` — badge "Esgotado" derivado de `detail.stockSummary` (`in_stock`/critical), não do status.
- `_components/tool-card.tsx` — remover `out_of_stock` do map de variante de status; se mostrar "Esgotado", derivar de `in_stock`.
- `suppliers/[id]/_components/tools-tab.tsx` — map de labels: remover `out_of_stock`.
- `suppliers/data.ts` (~linha 130) — type union `status`: remover `out_of_stock`.
- `stock/actions.ts` (~linha 760) — `inArray(tool.status, ["active","out_of_stock"])` → `["active"]` (revisar intenção: provavelmente "tools vendáveis").
- **Filtro "esgotado" na lista de tools:** a opção de filtro por `status=out_of_stock` sai. Preservar a capacidade de achar tools esgotadas via filtro **derivado de `in_stock`** (a lista já tem `mode=repor` e `branchId`; avaliar adicionar `?stock=out` derivado). Decidir no plano.
- Donut "Ferramentas por status" no dashboard: 3 fatias. Se `TOOL_STATUS_CONFIG` deriva de `TOOL_STATUS_LABELS`, atualiza sozinho.

### `emach-ecommerce` (repo separado)
- `packages/db/*` chega via PR de sync do CI (catalog.ts, schema/tools.ts). **Não editar à mão** (ADR-0009).
- Storefront UI (`product-card`, `product-info`, `place-order`): **nenhuma mudança** — já derivam de `inStock`. (Verificado.)

---

## Migração (push-only, ADR-0006; DB compartilhada, ADR-0004)

Ordem importa — o CHECK só pode ser apertado depois que não há linhas com `out_of_stock`.

1. **Dados (primeiro):** `UPDATE "tool" SET status = 'active' WHERE status = 'out_of_stock';` — script one-off em `packages/db/scripts/` ou SQL direto. Tools esgotadas já aparecem esgotadas via `in_stock`, então virar `active` é correto.
2. **Schema:** editar `tools.ts` (type + CHECK) → `bun db:sync`. drizzle-kit push recria o CHECK. (TTY em dev; sem rows `out_of_stock` o push é limpo.)
3. **Código compartilhado:** `catalog.ts` + `dashboard.ts` → o PR de sync do CI propaga pro ecommerce.
4. **Admin:** atualizar os arquivos de `apps/web` acima.

**Pré-produção (estado atual):** banco é dev/demo → fazer tudo numa janela coordenada (rodar o UPDATE, push, deploy de ambos). **Quando produção entrar:** usar expand-migrate-contract — (a) admin para de emitir `out_of_stock` + deriva o badge (sem mexer no CHECK), (b) migrar dados, (c) apertar CHECK + remover do `STOREFRONT_STATUS_SQL` por último.

---

## Verificação

- `bun check-types` (dashboard) verde.
- Após `db:sync`: nenhuma linha `tool.status = 'out_of_stock'` (query de sanidade).
- Smoke admin: lista de tools, detalhe (badge "Esgotado" aparece em tool `active` com `in_stock=false`), donut com 3 fatias, form de tool sem a opção "Sem estoque".
- Smoke storefront (ecommerce, pós-sync): produto com 0 estoque mostra "Esgotado" e add-to-cart desabilitado (comportamento inalterado).
- `bun test` sem regressão (134 pass; 1 fail pré-existente `server-only`).

---

## Fora de escopo
- Itens B (consolidar rotas `/dashboard/stock`) e C (atalho de reposição na sidebar) do #77 — issues separadas.
- Notificação/alerta de "voltou ao estoque" — feature futura.
- Reservas/estoque comprometido por pedidos em aberto — não muda aqui.
