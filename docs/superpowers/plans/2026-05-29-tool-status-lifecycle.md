# Tool Status Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirar `out_of_stock` do `tool.status`; "Esgotado" passa a ser derivado de estoque (`in_stock`/`total_stock`), eliminando drift.

**Architecture:** `tool.status` é `text` + CHECK `valid_tool_status` (não pgEnum) → migração = `UPDATE` dados + recriar CHECK via `bun db:sync`. Buyability/"Esgotado" já são derivados no storefront (`inStock`) e a row da lista admin já traz `total_stock`. Mudança em `packages/db` propaga pro ecommerce via CI (ADR-0009); UI do storefront não muda.

**Tech Stack:** Drizzle 0.45 (push-only, ADR-0006), Next 16 / React 19, Postgres compartilhado (ADR-0004).

**Ordem crítica:** dados primeiro (zerar `out_of_stock`) → depois apertar o CHECK. Código que lê/emite `out_of_stock` é removido junto.

---

### Task 1: Migração de dados — zerar `out_of_stock`

**Files:**
- Create: `packages/db/scripts/migrate-out-of-stock-status.ts`

- [ ] **Step 1: Escrever o script idempotente**

```ts
// packages/db/scripts/migrate-out-of-stock-status.ts
import { sql } from "drizzle-orm";
import { db } from "../src/index";

async function main() {
	const res = await db.execute(
		sql`UPDATE "tool" SET status = 'active' WHERE status = 'out_of_stock'`
	);
	console.info(`tools migradas out_of_stock -> active: ${res.rowCount ?? 0}`);
	const [remaining] = (
		await db.execute<{ n: number }>(
			sql`SELECT COUNT(*)::int AS n FROM "tool" WHERE status = 'out_of_stock'`
		)
	).rows;
	if ((remaining?.n ?? 0) > 0) {
		throw new Error(`Ainda há ${remaining?.n} tools out_of_stock`);
	}
	console.info("OK: 0 tools out_of_stock restantes");
}

main().then(() => process.exit(0)).catch((e) => {
	console.error(e);
	process.exit(1);
});
```

- [ ] **Step 2: Rodar contra o banco de dev**

Run: `cd packages/db && bun run scripts/migrate-out-of-stock-status.ts`
Expected: `OK: 0 tools out_of_stock restantes`

- [ ] **Step 3: Commit**

```bash
git add packages/db/scripts/migrate-out-of-stock-status.ts
git commit -m "chore(db): script de migração out_of_stock -> active"
```

---

### Task 2: Schema — remover `out_of_stock` do type + CHECK

**Files:**
- Modify: `packages/db/src/schema/tools.ts:16` (type) e `:88` (CHECK)

- [ ] **Step 1: Editar o type `ToolStatus`**

```ts
// packages/db/src/schema/tools.ts:16
export type ToolStatus = "draft" | "active" | "discontinued";
```

- [ ] **Step 2: Editar o CHECK `valid_tool_status`**

```ts
// packages/db/src/schema/tools.ts (constraint valid_tool_status)
check(
	"valid_tool_status",
	sql`${table.status} IN ('draft','active','discontinued')`
),
```

- [ ] **Step 3: Aplicar no banco**

Run: `bun db:sync` (raiz) — drizzle-kit push recria o CHECK. Pré-condição: 0 rows `out_of_stock` (Task 1).
Expected: push aplica a alteração do CHECK sem erro (TTY em dev).

- [ ] **Step 4: Sanity**

Run: `cd packages/db && bun run scripts/migrate-out-of-stock-status.ts`
Expected: `tools migradas ... : 0` + `OK: 0 ... restantes` (idempotente, confirma estado).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/tools.ts
git commit -m "feat(db): tool.status lifecycle puro (remove out_of_stock)"
```

---

### Task 3: Queries compartilhadas — tirar `out_of_stock` dos filtros

**Files:**
- Modify: `packages/db/src/queries/catalog.ts` (`STOREFRONT_TOOL_STATUSES` ~41, `STOREFRONT_STATUS_SQL` :204)
- Modify: `packages/db/src/queries/dashboard.ts` (`getReorderTable`, filtro `t.status IN (...)` ~:258)

- [ ] **Step 1: `catalog.ts` — lista de status do storefront**

```ts
// packages/db/src/queries/catalog.ts (~41)
const STOREFRONT_TOOL_STATUSES = ["active", "discontinued"] as const;
```

- [ ] **Step 2: `catalog.ts` — `STOREFRONT_STATUS_SQL`**

```ts
// packages/db/src/queries/catalog.ts:204
const STOREFRONT_STATUS_SQL = sql`t.status IN ('active','discontinued')`;
```

- [ ] **Step 3: `dashboard.ts` — filtro do reorder table**

```ts
// packages/db/src/queries/dashboard.ts (getReorderTable, ~:258)
		WHERE sl.quantity <= sl.reorder_point
			AND t.status IN ('active')
			AND b.status = 'active' ${branchFilter}
```

- [ ] **Step 4: check-types**

Run: `bun check-types` (raiz)
Expected: 5/5 verde.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/queries/catalog.ts packages/db/src/queries/dashboard.ts
git commit -m "refactor(db): remove out_of_stock dos filtros de status"
```

> **Nota:** `getToolStatusBreakdown` (donut) faz `GROUP BY status` sem lista hardcoded — auto-ajusta para 3 fatias, nenhuma mudança.

---

### Task 4: Admin — labels, options e tipos sem `out_of_stock`

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` (`TOOL_STATUS_OPTIONS`, `TOOL_STATUS_LABELS`)
- Modify: `apps/web/src/app/dashboard/suppliers/data.ts:130` (type union)
- Modify: `apps/web/src/app/dashboard/suppliers/[id]/_components/tools-tab.tsx` (maps de label/variant)
- Modify: `apps/web/src/app/dashboard/stock/actions.ts:760` (`inArray`)
- Modify: `apps/web/src/app/dashboard/_components/tool-card.tsx` (map de status)
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-header.tsx` (`STATUS_LABEL`/`STATUS_VARIANT`)

- [ ] **Step 1: `tool-schema.ts` — remover a opção/label**

```ts
// TOOL_STATUS_OPTIONS: remover a string "out_of_stock"
export const TOOL_STATUS_OPTIONS = ["draft", "active", "discontinued"] as const;

// TOOL_STATUS_LABELS: remover a chave out_of_stock
export const TOOL_STATUS_LABELS: Record<
	(typeof TOOL_STATUS_OPTIONS)[number],
	string
> = {
	draft: "Rascunho",
	active: "Ativo",
	discontinued: "Descontinuado",
};
```

- [ ] **Step 2: `suppliers/data.ts:130` — type union**

```ts
	status: "draft" | "active" | "discontinued";
```

- [ ] **Step 3: `suppliers/[id]/_components/tools-tab.tsx` — remover entradas `out_of_stock`**

Remover a chave `out_of_stock: "Sem estoque"` do map de labels e `out_of_stock: "destructive"` do map de variant (deixar apenas draft/active/discontinued).

- [ ] **Step 4: `stock/actions.ts:760` — `inArray`**

```ts
		inArray(tool.status, ["active"]),
```

- [ ] **Step 5: `_components/tool-card.tsx` — map de status**

Remover `out_of_stock: "destructive"` de `STATUS_BADGE_VARIANT`. (Usa `TOOL_STATUS_LABELS` da Task 4.1 — já fica sem a chave.)

- [ ] **Step 6: `tool-detail-header.tsx` — maps `STATUS_LABEL`/`STATUS_VARIANT`**

Remover as entradas `out_of_stock` dos dois maps locais (linhas ~11 e ~21). O badge de status passa a refletir só lifecycle.

- [ ] **Step 7: check-types**

Run: `bun check-types`
Expected: verde. (Erros de chave faltante apontam call-sites esquecidos — corrigir.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-schema.ts apps/web/src/app/dashboard/suppliers/data.ts apps/web/src/app/dashboard/suppliers/[id]/_components/tools-tab.tsx apps/web/src/app/dashboard/stock/actions.ts apps/web/src/app/dashboard/_components/tool-card.tsx apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-header.tsx
git commit -m "refactor(web): remove out_of_stock dos status de catálogo"
```

---

### Task 5: Admin — badge "Esgotado" derivado + filtro de estoque

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts` (`ToolStockSummary` + `computeStockSummary`)
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-header.tsx` (badge derivado)
- Modify: `apps/web/src/app/dashboard/_components/tool-card.tsx` (badge derivado por `total_stock`)
- Modify: `apps/web/src/app/dashboard/tools/page.tsx` + `tools/_components/tool-filters.tsx` + `tools/actions.ts` (filtro `?stock=out` derivado)

- [ ] **Step 1: `tool-detail-data.ts` — adicionar `inStock` ao summary**

Em `ToolStockSummary` adicionar `inStock: boolean;`. Em `computeStockSummary(stockRows)`, computar e retornar:

```ts
	const inStock = stockRows.some((r) => r.quantity > 0);
	return { criticalCount, reorderCount, alerts, inStock };
```

- [ ] **Step 2: `tool-detail-header.tsx` — badge "Esgotado" quando ativo e sem estoque**

Ao lado do badge de status, quando `tool.status === "active" && !stockSummary.inStock`, renderizar `<Badge variant="destructive">Esgotado</Badge>`.

- [ ] **Step 3: `_components/tool-card.tsx` — badge por `total_stock`**

Onde a row traz `total_stock` (ou `quantity`), quando `tool.status === "active" && total_stock === 0`, mostrar badge `Esgotado` (variant destructive) além do status.

- [ ] **Step 4: Filtro derivado `?stock=out` na lista**

Substituir a antiga opção de filtro `status=out_of_stock` por um filtro derivado: em `tools/actions.ts` aceitar `stock?: "out"` no `ToolsFiltersInput` e, quando `stock === "out"`, adicionar `AND COALESCE((SELECT SUM(sl.quantity)::int FROM stock_level sl JOIN tool_variant tv ON tv.id = sl.variant_id WHERE tv.tool_id = t.id), 0) = 0` ao WHERE. Expor a opção em `tool-filters.tsx` ("Esgotadas") e ler `params.stock` em `tools/page.tsx`.

- [ ] **Step 5: check-types**

Run: `bun check-types`
Expected: verde.

- [ ] **Step 6: Smoke visual (dev :3005 ou porta livre)**

Subir `cd apps/web && bun run next dev --port 3005` e verificar:
- Detalhe de uma tool `active` com 0 estoque → badge "Esgotado".
- Lista: filtro "Esgotadas" retorna só tools com `total_stock = 0`.
- Form de tool: select de status sem "Sem estoque".
- Dashboard donut "Ferramentas por status": 3 fatias.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-header.tsx apps/web/src/app/dashboard/_components/tool-card.tsx apps/web/src/app/dashboard/tools/page.tsx apps/web/src/app/dashboard/tools/_components/tool-filters.tsx apps/web/src/app/dashboard/tools/actions.ts
git commit -m "feat(web): badge Esgotado derivado + filtro de estoque"
```

---

### Task 6: Verificação final

- [ ] **Step 1: Suite + tipos**

Run: `bun check-types && bun test` (raiz)
Expected: check-types 5/5 verde; testes 134 pass, 1 fail pré-existente (`server-only` em `activity.test.ts` — não-regressão).

- [ ] **Step 2: Sanity de dados**

Run: `cd packages/db && bun run scripts/migrate-out-of-stock-status.ts`
Expected: `OK: 0 tools out_of_stock restantes`.

- [ ] **Step 3: Smoke storefront (ecommerce, após PR de sync do CI mergear)**

No repo `emach-ecommerce`, produto com 0 estoque mostra "Esgotado" e add-to-cart desabilitado — **comportamento inalterado** (já derivava de `inStock`). Confirmar que nenhuma query quebrou com o novo `STOREFRONT_STATUS_SQL`.

- [ ] **Step 4: `/code-review` (effort medium) e aplicar simplificações inline.**

---

## Self-Review (autor do plano)

**Spec coverage:**
- Enum lifecycle puro → Task 2 ✅ · Esgotado derivado → Task 5 ✅ · migração dados-primeiro → Tasks 1→2 ✅ · catalog.ts/dashboard.ts compartilhados → Task 3 ✅ · admin labels/options → Task 4 ✅ · filtro esgotado derivado (decisão do spec) → Task 5.4 ✅ · storefront sem mudança → Task 6.3 (verificação) ✅ · donut auto-ajusta → nota na Task 3 ✅.

**Placeholders:** nenhum "TBD". Os arquivos `suppliers/tools-tab.tsx` e maps em `tool-detail-header`/`tool-card` são descritos por chave a remover (não mostro o arquivo inteiro porque a edição é "remover a entrada `out_of_stock`" — ação concreta).

**Type consistency:** `ToolStatus` (3 valores) usado em schema, suppliers/data, e implícito via `TOOL_STATUS_OPTIONS`. `ToolStockSummary.inStock` definido na Task 5.1 e consumido na 5.2. `stock` param em `ToolsFiltersInput` definido e lido na 5.4.

**Ordem/segurança:** Task 1 (dados) precede Task 2 (CHECK) — pré-condição explícita. Task 3/4 removem leitura/emissão do valor. Banco compartilhado: o PR de sync do CI leva catalog.ts/schema pro ecommerce; storefront UI não muda (verificado no spec).
