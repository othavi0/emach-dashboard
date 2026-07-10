# Redesign da listagem de pedidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/dashboard/orders` na fila diária de expedição: itens (foto+nome+quantidade) e transportadora visíveis no card, filtros por produto/transportadora/período, aba Atrasados (48h âmbar / 72h move) com toast, e seed insert-only de 5 pedidos pagos.

**Architecture:** A query viva `fetchOrdersPage` ganha lateral de top-3 itens + agregados; um filter-builder único em `_lib/` passa a alimentar listagem, export CSV e resumo de produto. Tab "Atrasados" é computada (não é status novo — condição sobre `COALESCE(paid_at, created_at)`), com contagens estendidas por bucket late. UI: card C1 aprovado no companion, barra inline com Período único.

**Tech Stack:** Next 16 (App Router, server actions), React 19, drizzle (raw `db.execute` + `sql`), zod 4, Tailwind 4 + tokens do `@emach/ui`, sonner via `notify`, vitest, bun.

**Spec:** `docs/superpowers/specs/2026-07-10-orders-listing-redesign-design.md` (aprovada). Mockups aprovados: `.superpowers/brainstorm/171611-1783691326/content/{card-anatomy-v2,filters}.html`.

## Global Constraints

- Banco Supabase ÚNICO dev=prod=ecommerce: nenhuma task roda seed/truncate/push; a Task 11 só ESCREVE o script — executar exige OK explícito do user na sessão.
- CWD é a RAIZ do monorepo; paths absolutos; nunca `cd apps/web`.
- Proibido: `console.*` (usar `logger` de `apps/web/src/lib/logger.ts`), `any`/`@ts-ignore`, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler), `key={index}`, `<img>` sem biome-ignore documentado (exceção: thumb Supabase), cool blue-grays, `font-serif` fora de h1.
- Datas de exibição SEMPRE via `apps/web/src/lib/format/datetime.ts` (fuso `America/Sao_Paulo`); `db.execute` devolve numeric como string (`Number(...)`) e timestamp como string (`toDate` de `@emach/db/utils`).
- Server actions: `"use server"` + `await requireCapability(cap)` no topo, inclusive reads chamadas de client (ADR-0018). Funções em `data.ts` são `server-only` (guard no caller).
- `revalidateTag(tag, "max")` — forma de 2 args (Next 16).
- Hook PostToolUse roda `bun fix` após Write/Edit — se um Edit subsequente falhar com `string not found`, re-Read antes de re-tentar.
- Commits: Conventional Commits em PT, subject ≤50 chars. `bun check-types --force` + `bun check` antes de cada commit; `bun run build` obrigatório nas tasks que tocam arquivo `"use server"` (Tasks 4, 5, 10).
- Testes: `bun --cwd apps/web test` (vitest, environment node). Para módulos `server-only` o alias de mock já existe (`src/__mocks__/server-only.ts`).

---

### Task 1: Regra de lateness (48h/72h) + tab "Atrasados" no status-meta

**Files:**
- Create: `apps/web/src/app/dashboard/orders/_lib/lateness.ts`
- Create: `apps/web/src/app/dashboard/orders/_lib/__tests__/lateness.test.ts`
- Modify: `apps/web/src/app/dashboard/orders/status-meta.ts` (ORDER_FLOW_TABS, tipos)

**Interfaces:**
- Consumes: `OrderStatus` de `@emach/db/schema/orders`.
- Produces: `LATE_AMBER_HOURS = 48`, `LATE_TAB_HOURS = 72`, `latenessOf(status: OrderStatus, paidAt: Date | null, createdAt: Date, now: Date): "none" | "amber" | "late"`; tab defs ganham campo opcional `lateness?: "only" | "exclude"`; novo tab `{ key: "late", label: "Atrasados", statuses: ["paid","preparing"], lateness: "only" }` no `ORDER_FLOW_TABS` após "preparing". Tabs `paid` e `preparing` ganham `lateness: "exclude"`.

- [ ] **Step 1: Teste que falha**

```ts
// apps/web/src/app/dashboard/orders/_lib/__tests__/lateness.test.ts
import { describe, expect, it } from "vitest";
import { latenessOf } from "../lateness";

const NOW = new Date("2026-07-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("latenessOf", () => {
	it("none abaixo de 48h", () => {
		expect(latenessOf("paid", hoursAgo(47), hoursAgo(50), NOW)).toBe("none");
	});
	it("amber entre 48h e 72h", () => {
		expect(latenessOf("preparing", hoursAgo(50), hoursAgo(60), NOW)).toBe("amber");
	});
	it("late a partir de 72h", () => {
		expect(latenessOf("paid", hoursAgo(72), hoursAgo(80), NOW)).toBe("late");
	});
	it("usa createdAt como fallback quando paidAt é null", () => {
		expect(latenessOf("paid", null, hoursAgo(73), NOW)).toBe("late");
	});
	it("statuses fora do funil de expedição nunca atrasam", () => {
		expect(latenessOf("shipped", hoursAgo(200), hoursAgo(200), NOW)).toBe("none");
		expect(latenessOf("delivered", hoursAgo(200), hoursAgo(200), NOW)).toBe("none");
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test lateness`
Expected: FAIL — `Cannot find module '../lateness'`

- [ ] **Step 3: Implementação**

```ts
// apps/web/src/app/dashboard/orders/_lib/lateness.ts
import type { OrderStatus } from "@emach/db/schema/orders";

// Regra aprovada na spec 2026-07-10: relógio = paid_at (fallback created_at).
export const LATE_AMBER_HOURS = 48;
export const LATE_TAB_HOURS = 72;

const FULFILLMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
	"paid",
	"preparing",
]);

export type Lateness = "none" | "amber" | "late";

export function latenessOf(
	status: OrderStatus,
	paidAt: Date | null,
	createdAt: Date,
	now: Date
): Lateness {
	if (!FULFILLMENT_STATUSES.has(status)) {
		return "none";
	}
	const base = paidAt ?? createdAt;
	const ageHours = (now.getTime() - base.getTime()) / 3_600_000;
	if (ageHours >= LATE_TAB_HOURS) {
		return "late";
	}
	if (ageHours >= LATE_AMBER_HOURS) {
		return "amber";
	}
	return "none";
}
```

- [ ] **Step 4: status-meta.ts — tab Atrasados**

No tipo dos tab defs (as entradas de `ORDER_FLOW_TABS`/`ORDER_EXCEPTION_TABS` são objetos literais `as const`), inserir em `ORDER_FLOW_TABS` (entre "preparing" e "shipped"):

```ts
	{
		key: "preparing",
		label: "Em preparação",
		statuses: ["preparing"] as DbOrderStatus[],
		lateness: "exclude",
	},
	{
		// Tab computada (spec 2026-07-10): pedidos pagos/em preparação há ≥72h.
		// Exclusiva — some de "Pago"/"Em preparação" (lateness: "exclude" acima).
		key: "late",
		label: "Atrasados",
		statuses: ["paid", "preparing"] as DbOrderStatus[],
		lateness: "only",
	},
	{
		key: "shipped",
		...
```

E adicionar `lateness: "exclude"` também na entrada `paid`. Exportar o tipo:

```ts
export type TabLateness = "only" | "exclude";
export interface OrderTabDef {
	key: string;
	label: string;
	statuses: readonly DbOrderStatus[] | null;
	lateness?: TabLateness;
}
```

Tipar `ORDER_FLOW_TABS`/`ORDER_EXCEPTION_TABS`/`ALL_ORDERS_TAB` como `satisfies readonly OrderTabDef[]`/`satisfies OrderTabDef` (mantendo `as const`), pra `resolveTab` no data.ts (Task 3) enxergar `lateness` sem cast.

- [ ] **Step 5: Rodar testes e types**

Run: `bun --cwd apps/web test lateness && bun check-types --force`
Expected: PASS (o consumo do `lateness` novo só chega na Task 3; aqui nada quebra)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_lib/lateness.ts apps/web/src/app/dashboard/orders/_lib/__tests__/lateness.test.ts apps/web/src/app/dashboard/orders/status-meta.ts
git commit -m "feat: regra 48/72h e tab Atrasados no status-meta"
```

---

### Task 2: FIFO por paid_at — `ordersTabSort` (reusa `PaidAtAscCursor`, zero mudança no cursor.ts)

**Files:**
- Create: `apps/web/src/app/dashboard/orders/_lib/orders-where.ts` (versão inicial: só sort)
- Create: `apps/web/src/app/dashboard/orders/_lib/__tests__/orders-where.test.ts`

**Interfaces:**
- Consumes: `cursor.ts` JÁ TEM a variante `PaidAtAscCursor { paidAt: string; sort: "paidAtAsc" }` e o helper `decodeCursorAs(raw, sort)` — NÃO criar variante nova.
- Produces: `ordersTabSort(tabKey: string): "paidAtAsc" | "newest"` — `paidAtAsc` para `paid`/`preparing`/`late` (FIFO real: quem foi PAGO há mais tempo primeiro, via `COALESCE(o.paid_at, o.created_at)`), `newest` pro resto. Contrato de cursor documentado pro Task 3: FIFO usa `{v:1, sort:"paidAtAsc", paidAt: <COALESCE ISO>, id}`; demais tabs seguem `{v:1, sort:"newest", createdAt, id}`.

- [ ] **Step 1: Teste que falha**

```ts
// apps/web/src/app/dashboard/orders/_lib/__tests__/orders-where.test.ts
import { describe, expect, it } from "vitest";
import { ordersTabSort } from "../orders-where";

describe("ordersTabSort", () => {
	it("FIFO por paid_at nas filas de expedição", () => {
		expect(ordersTabSort("paid")).toBe("paidAtAsc");
		expect(ordersTabSort("preparing")).toBe("paidAtAsc");
		expect(ordersTabSort("late")).toBe("paidAtAsc");
	});
	it("mais recente primeiro no resto", () => {
		expect(ordersTabSort("all")).toBe("newest");
		expect(ordersTabSort("shipped")).toBe("newest");
		expect(ordersTabSort("canceled")).toBe("newest");
	});
});
```

Run: `bun --cwd apps/web test orders-where` → FAIL (módulo não existe)

- [ ] **Step 2: Implementar (arquivo nasce aqui; Task 3 o estende)**

```ts
// apps/web/src/app/dashboard/orders/_lib/orders-where.ts
const FIFO_TABS = new Set(["paid", "preparing", "late"]);

// FIFO das filas de expedição pagina por COALESCE(paid_at, created_at) via a
// variante PaidAtAscCursor JÁ existente em @/lib/cursor — não criar sort novo.
export function ordersTabSort(tabKey: string): "paidAtAsc" | "newest" {
	return FIFO_TABS.has(tabKey) ? "paidAtAsc" : "newest";
}
```

- [ ] **Step 3: Rodar testes**

Run: `bun --cwd apps/web test orders-where && bun check-types --force`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_lib/orders-where.ts apps/web/src/app/dashboard/orders/_lib/__tests__/orders-where.test.ts
git commit -m "feat: sort FIFO por paid_at nas filas de expedição"
```

---

### Task 3: Filter-builder único + fetchOrdersPage v2 (+ deletar listOrders)

**Files:**
- Create: `apps/web/src/app/dashboard/orders/_lib/orders-where.ts`
- Create: `apps/web/src/app/dashboard/orders/_lib/__tests__/orders-where.test.ts`
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (OrderListFilters, OrderListItem, fetchOrdersPage; DELETAR listOrders/OrderListResult/ORDERS_PAGE_SIZE)

**Interfaces:**
- Consumes: `latenessOf`/tab defs da Task 1, `ordersTabSort` + contrato de cursor da Task 2, `orderBranchCondition(scope)` de `@/lib/branch-scope`, `decodeCursorAs` de `@/lib/cursor`.
- Produces:
  - `OrderListFilters` (e `OrdersPageFiltersInput`) trocam `unverifiedShipping?: boolean` por `carrier?: string` (valor especial `"__none__"` = IS NULL) e `toolId?: string`.
  - `OrderListItem` ganha: `unitsCount: number`, `items: OrderCardItem[]` com `interface OrderCardItem { toolId: string; name: string; quantity: number; imageUrl: string | null }`, `shippingMethod: string | null`, `paidAt: Date | null`, `shippedAt: Date | null`, `deliveredAt: Date | null`. Mantém `itemsCount` (nº de LINHAS, usado pro "+N itens").
  - `buildOrdersListConditions({ filters, scope, tabDef })` → `SQL[]` (todas as condições exceto cursor) em `_lib/orders-where.ts` (arquivo criado na Task 2 — ESTENDER, não recriar).

- [ ] **Step 1: Estender `orders-where.ts` com o builder**

```ts
// apps/web/src/app/dashboard/orders/_lib/orders-where.ts (ADICIONAR ao arquivo da Task 2)
// Builder ÚNICO do WHERE da listagem — consumido por fetchOrdersPage,
// export CSV e resumo de produto. Não importa session/headers (puro + sql).
import { type SQL, sql } from "drizzle-orm";

import { type BranchScope, orderBranchCondition } from "@/lib/branch-scope";
import type { OrderTabDef } from "../status-meta";
import { LATE_TAB_HOURS } from "./lateness";

export interface OrdersWhereFilters {
	branchId?: string;
	carrier?: string; // "__none__" = frete a combinar (IS NULL)
	from?: string;
	q?: string;
	to?: string;
	toolId?: string;
}

export const CARRIER_NONE = "__none__";

// Relógio de atraso: COALESCE(paid_at, created_at) — espelha latenessOf().
const fulfillmentAge = sql`COALESCE(o.paid_at, o.created_at)`;
const lateCutoff = sql`now() - make_interval(hours => ${LATE_TAB_HOURS})`;

export function buildOrdersListConditions({
	filters,
	scope,
	tabDef,
}: {
	filters: OrdersWhereFilters;
	scope: BranchScope;
	tabDef: OrderTabDef;
}): SQL[] {
	const conditions: SQL[] = [];
	const branchCondition = orderBranchCondition(scope);
	if (branchCondition) {
		conditions.push(branchCondition);
	}
	if (tabDef.statuses) {
		const placeholders = sql.join(
			tabDef.statuses.map((s) => sql`${s}`),
			sql`, `
		);
		conditions.push(sql`o.status IN (${placeholders})`);
	}
	if (tabDef.lateness === "only") {
		conditions.push(sql`${fulfillmentAge} <= ${lateCutoff}`);
	}
	if (tabDef.lateness === "exclude") {
		conditions.push(sql`${fulfillmentAge} > ${lateCutoff}`);
	}
	const query = filters.q?.trim();
	if (query) {
		conditions.push(
			sql`(o.number ILIKE ${`%${query}%`} OR c.name ILIKE ${`%${query}%`})`
		);
	}
	if (filters.branchId) {
		conditions.push(sql`o.branch_id = ${filters.branchId}`);
	}
	if (filters.carrier === CARRIER_NONE) {
		conditions.push(sql`o.shipping_method IS NULL`);
	} else if (filters.carrier) {
		conditions.push(sql`o.shipping_method = ${filters.carrier}`);
	}
	if (filters.toolId) {
		conditions.push(
			sql`EXISTS (SELECT 1 FROM order_item oi_f WHERE oi_f.order_id = o.id AND oi_f.tool_id = ${filters.toolId})`
		);
	}
	if (filters.from) {
		conditions.push(sql`o.created_at >= ${filters.from}::date`);
	}
	if (filters.to) {
		conditions.push(sql`o.created_at < (${filters.to}::date + INTERVAL '1 day')`);
	}
	return conditions;
}
```

Nota: `normalizeDateParam` hoje vive no data.ts — mover a normalização pro caller (data.ts continua chamando antes de passar `filters` pro builder), pra manter o builder puro.

- [ ] **Step 2: fetchOrdersPage v2 em data.ts**

Substituir a construção inline de conditions por `buildOrdersListConditions` + cursor + sort. SELECT novo (diferenças marcadas):

```ts
const sort = ordersTabSort(tab.key);
// decodeCursorAs valida o discriminante — cursor de outra tab/sort estoura cedo.
const decoded = cursor ? decodeCursorAs(cursor, sort) : null;
if (decoded) {
	conditions.push(
		decoded.sort === "paidAtAsc"
			? sql`(COALESCE(o.paid_at, o.created_at), o.id) > (${decoded.paidAt}::timestamptz, ${decoded.id})`
			: sql`(o.created_at, o.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
	);
}
const orderBy =
	sort === "paidAtAsc"
		? sql`ORDER BY COALESCE(o.paid_at, o.created_at) ASC, o.id ASC`
		: sql`ORDER BY o.created_at DESC, o.id DESC`;
```

Incluir no SELECT o alias do relógio FIFO — `COALESCE(o.paid_at, o.created_at) AS fulfillment_age` — e no builder de nextCursor do `paginate`:

```ts
(last) =>
	sort === "paidAtAsc"
		? {
				v: 1 as const,
				sort: "paidAtAsc" as const,
				paidAt: toDate(last.fulfillment_age).toISOString(),
				id: last.id,
			}
		: {
				v: 1 as const,
				sort: "newest" as const,
				createdAt: toDate(last.created_at).toISOString(),
				id: last.id,
			}
```

```sql
SELECT
	o.id, o.number, o.status, o.total_amount, o.created_at,
	o.paid_at, o.shipped_at, o.delivered_at,
	o.shipping_unverified, o.shipping_method,
	c.name AS client_name, b.name AS branch_name,
	(SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.id)::int AS items_count,
	(SELECT COALESCE(SUM(oi.quantity), 0) FROM order_item oi WHERE oi.order_id = o.id)::int AS units_count,
	li.items AS item_lines,
	lp.status AS latest_picking_status
FROM "order" o
JOIN client c ON c.id = o.client_id
LEFT JOIN branch b ON b.id = o.branch_id
LEFT JOIN LATERAL (
	SELECT COALESCE(jsonb_agg(jsonb_build_object(
		'toolId', x.tool_id, 'name', x.name,
		'quantity', x.quantity, 'imageUrl', x.image_url
	)), '[]'::jsonb) AS items
	FROM (
		SELECT oi.tool_id, oi.name, oi.quantity,
			(SELECT ti.url FROM tool_image ti
			 WHERE ti.tool_id = oi.tool_id
			 ORDER BY ti.sort_order ASC LIMIT 1) AS image_url
		FROM order_item oi
		WHERE oi.order_id = o.id
		ORDER BY oi.quantity DESC, oi.name ASC
		LIMIT 3
	) x
) li ON true
LEFT JOIN LATERAL (
	SELECT op.status FROM order_picking op
	WHERE op.order_id = o.id
	ORDER BY op.started_at DESC, op.id DESC LIMIT 1
) lp ON o.status = 'preparing'
${whereClause}
${orderBy}
LIMIT ${BATCH_SIZE + 1}
```

Mapeamento novo no `paginate` (tipar a row com `item_lines: OrderCardItem[] | null` — jsonb chega parseado pelo driver; `paid_at`/`shipped_at`/`delivered_at` passam por `toDate` quando não-nulos):

```ts
paidAt: row.paid_at ? toDate(row.paid_at) : null,
shippedAt: row.shipped_at ? toDate(row.shipped_at) : null,
deliveredAt: row.delivered_at ? toDate(row.delivered_at) : null,
shippingMethod: row.shipping_method,
unitsCount: row.units_count,
items: row.item_lines ?? [],
```

E o cursor de saída usa o sort da tab: `sort: sort` (não mais literal `"newest"`).

- [ ] **Step 3: Deletar `listOrders`**

Remover `listOrders`, `OrderListResult`, `ORDERS_PAGE_SIZE` e o campo `page` de `OrderListFilters` se ficar órfão (verificar callers de `filters.page` — page.tsx só repassa; limpar junto). `rg -n "listOrders|OrderListResult|ORDERS_PAGE_SIZE" apps/web/src` deve retornar zero após a limpeza.

- [ ] **Step 4: Types + testes**

Run: `bun check-types --force`
Expected: erros APENAS nos consumers que as Tasks 4–8 vão atualizar (page.tsx passa `unverifiedShipping`; filtros; card). Corrigir aqui SOMENTE o mínimo em data.ts/actions.ts pra este arquivo compilar coeso; page.tsx/UI ficam vermelhos até as próximas tasks — rodar `bun check-types` de novo ao FIM da Task 5 e exigir zero erros lá.
Run: `bun --cwd apps/web test orders-where` → PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_lib/orders-where.ts apps/web/src/app/dashboard/orders/_lib/__tests__/orders-where.test.ts apps/web/src/app/dashboard/orders/data.ts
git commit -m "feat: fetchOrdersPage com itens, envio e builder único"
```

---

### Task 4: Counts com bucket late + facet de transportadora + resumo de produto

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (computeOrdersTabCounts, novos fns)
- Create: `apps/web/src/app/dashboard/orders/_lib/__tests__/fold-counts.test.ts`
- Modify: `apps/web/src/app/dashboard/orders/actions.ts` (wrapper read `fetchOrdersProductSummary`)

**Interfaces:**
- Consumes: builder da Task 3.
- Produces (todas em data.ts, `server-only`):
  - `foldTabCounts(rows: { status: OrderStatus; is_late: boolean; count: number }[]): OrderTabCounts` — pura, exportada de `_lib/orders-where.ts` p/ teste; `OrderTabCounts` ganha chave `late: number`.
  - `listOrderCarrierOptions(): Promise<{ methods: string[]; hasUnassigned: boolean }>` — DISTINCT shipping_method no escopo.
  - `fetchOrdersProductSummary({ filters }): Promise<{ orders: number; units: number }>`.
  - Em actions.ts: `fetchOrdersProductSummaryAction` com `"use server"` + `requireCapability("orders.read")` (chamada client na Task 7? Não — o resumo renderiza server-side no page.tsx; wrapper só se o client precisar; NÃO criar wrapper sem consumer. Ver Task 5: o resumo vem do server; portanto **não criar action** — anotar e pular).

- [ ] **Step 1: Teste que falha (fold puro)**

```ts
// apps/web/src/app/dashboard/orders/_lib/__tests__/fold-counts.test.ts
import { describe, expect, it } from "vitest";
import { foldTabCounts } from "../orders-where";

describe("foldTabCounts", () => {
	it("separa late de paid/preparing e soma all_count", () => {
		const counts = foldTabCounts([
			{ status: "paid", is_late: false, count: 3 },
			{ status: "paid", is_late: true, count: 2 },
			{ status: "preparing", is_late: true, count: 1 },
			{ status: "shipped", is_late: false, count: 4 },
		]);
		expect(counts.paid).toBe(3);
		expect(counts.preparing).toBe(0);
		expect(counts.late).toBe(3);
		expect(counts.shipped).toBe(4);
		expect(counts.all_count).toBe(10);
	});
	it("canceled+refunded agregam", () => {
		const counts = foldTabCounts([
			{ status: "canceled", is_late: false, count: 1 },
			{ status: "refunded", is_late: false, count: 2 },
		]);
		expect(counts.canceled).toBe(3);
	});
});
```

Run: `bun --cwd apps/web test fold-counts` → FAIL

- [ ] **Step 2: Implementar**

`foldTabCounts` em `orders-where.ts` — MOVER pra lá também `interface OrderTabCounts` e `emptyTabCounts` (o fold precisa dos dois; data.ts passa a importá-los). `OrderTabCounts`/`emptyTabCounts` ganham a chave `late: 0`. Mesma lógica do switch atual de computeOrdersTabCounts + bucket late. SQL novo em `computeOrdersTabCounts`:

```sql
SELECT status,
	(status IN ('paid','preparing')
	 AND COALESCE(paid_at, created_at) <= now() - make_interval(hours => ${LATE_TAB_HOURS})
	) AS is_late,
	COUNT(*)::int AS count
FROM "order"
${branchFilter ? sql`WHERE ${branchFilter}` : sql``}
GROUP BY 1, 2
```

`listOrderCarrierOptions` (espelha o shape de `listOrderBranches`, escopo incluído):

```ts
export async function listOrderCarrierOptions(): Promise<{
	methods: string[];
	hasUnassigned: boolean;
}> {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);
	if (isBlindScope(scope)) {
		return { methods: [], hasUnassigned: false };
	}
	const branchCondition = orderBranchCondition(scope);
	const rows = await db.execute<{ shipping_method: string | null }>(sql`
		SELECT DISTINCT o.shipping_method FROM "order" o
		${branchCondition ? sql`WHERE ${branchCondition}` : sql``}
		ORDER BY 1
	`);
	const methods = rows.rows
		.map((r) => r.shipping_method)
		.filter((m): m is string => m !== null);
	return { methods, hasUnassigned: rows.rows.some((r) => r.shipping_method === null) };
}
```

`fetchOrdersProductSummary` (usa o MESMO builder — o filtro de produto já está nas conditions):

```ts
export async function fetchOrdersProductSummary({
	filters,
}: {
	filters: OrdersPageFiltersInput;
}): Promise<{ orders: number; units: number } | null> {
	if (!filters.toolId) {
		return null;
	}
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);
	if (isBlindScope(scope)) {
		return { orders: 0, units: 0 };
	}
	const tab = resolveTab(filters.tab);
	const conditions = buildOrdersListConditions({ filters, scope, tabDef: tab });
	const whereClause = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;
	const rows = await db.execute<{ orders: number; units: number }>(sql`
		SELECT COUNT(DISTINCT o.id)::int AS orders,
			COALESCE(SUM(oi.quantity), 0)::int AS units
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		JOIN order_item oi ON oi.order_id = o.id AND oi.tool_id = ${filters.toolId}
		${whereClause}
	`);
	return rows.rows[0] ?? { orders: 0, units: 0 };
}
```

Também: `getLateOrdersCount(scope)` — export para a página de Separação (Task 9):

```ts
export async function getLateOrdersCount(scope: BranchScope): Promise<number> {
	if (isBlindScope(scope)) {
		return 0;
	}
	const counts = await computeOrdersTabCounts(scope);
	return counts.late;
}
```

- [ ] **Step 3: Testes + types**

Run: `bun --cwd apps/web test fold-counts && bun check-types --force`
Expected: fold-counts PASS; types ainda com pendências de UI (Tasks 5–8).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/orders/_lib/orders-where.ts apps/web/src/app/dashboard/orders/_lib/__tests__/fold-counts.test.ts
git commit -m "feat: counts com bucket atrasados e facets de filtro"
```

---

### Task 5: Zod schema + wiring do page.tsx

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/schema.ts` (ordersListFiltersSchema)
- Modify: `apps/web/src/app/dashboard/orders/page.tsx`

**Interfaces:**
- Consumes: data fns das Tasks 3–4; `LateOrdersToast` e `ProductFilterSummary` chegam nas Tasks 8–9 — page.tsx integra-os LÁ, não aqui.
- Produces: params de URL novos `?carrier=` (string ≤80, ou `__none__`) e `?productId=` (uuid); `?unverified` REMOVIDO do schema (zod object não-strict ignora a chave em bookmarks antigos); `?tab=late` resolve pela tab nova (nenhum código extra — `resolveTab` acha pelo key).

- [ ] **Step 1: schema.ts**

```ts
export const ordersListFiltersSchema = z
	.object({
		tab: z.string().optional(),
		q: z.string().trim().max(100).optional(),
		from: isoDate,
		to: isoDate,
		branchId: z.string().uuid().optional(),
		carrier: z.string().trim().max(80).optional(),
		productId: z.string().uuid().optional(),
		// CSV de IDs (export de selecionados). Quando presente, exporta só estes.
		ids: z.string().max(20_000).optional(),
	})
	.superRefine((data, ctx) => {
		if (data.from && data.to && data.to < data.from) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Data 'até' deve ser >= 'de'",
				path: ["to"],
			});
		}
	});
```

(`page`/`pageSize`/`unverified` saem — `page` era do listOrders morto; conferir com `rg -n "\.page\b" apps/web/src/app/dashboard/orders` que nenhum caller sobrou.)

- [ ] **Step 2: page.tsx**

- `filters`/`pageFilters` trocam `unverifiedShipping` por `carrier: data.carrier` e `toolId: data.productId`.
- `Promise.all` ganha `listOrderCarrierOptions()` e `fetchOrdersProductSummary({ filters: pageFilters })` (retorna null sem productId) e, quando `data.productId`, o nome da tool pro chip do resumo (SELECT name FROM tool WHERE id — criar helper `getToolName(id)` em data.ts com `requireCurrentSession`).
- `hasFilters` inclui `data.carrier || data.productId`, remove `unverifiedShipping`.
- Repassar `carrierOptions`, `productSummary`, `productName` pro `OrderFiltersPanel`/render (consumo real na Task 7/8).

- [ ] **Step 3: Gate de types完整**

Run: `bun check-types --force`
Expected: erros restantes SOMENTE em `_components/order-list-filters.tsx` / `order-card*.tsx` (props novas ainda não aceitas — Tasks 7–8). Se houver erro fora disso, resolver AGORA.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/schema.ts apps/web/src/app/dashboard/orders/page.tsx apps/web/src/app/dashboard/orders/data.ts
git commit -m "feat: params carrier/productId e wiring da página"
```

---

### Task 6: DateRangePicker com presets no @emach/ui

**Files:**
- Create: `packages/ui/src/components/date-range-picker.tsx`

**Interfaces:**
- Consumes: `Calendar` (repassa `mode` pro react-day-picker), `Button`, `Popover*` do próprio pacote; `date-fns` + `ptBR` (já deps do pacote — conferir `packages/ui/package.json`; `date-fns` está no catalog).
- Produces:

```ts
interface DateRangePickerProps {
	"aria-label"?: string;
	className?: string;
	from?: Date;
	id?: string;
	onChange: (range: { from?: Date; to?: Date }) => void;
	to?: Date;
}
export { DateRangePicker };
```

- [ ] **Step 1: Implementar**

```tsx
// packages/ui/src/components/date-range-picker.tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Calendar } from "@emach/ui/components/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import { cn } from "@emach/ui/lib/utils";
import { format, startOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

interface DateRangePickerProps {
	"aria-label"?: string;
	className?: string;
	from?: Date;
	id?: string;
	onChange: (range: { from?: Date; to?: Date }) => void;
	to?: Date;
}

const PRESETS = [
	{ key: "today", label: "Hoje", range: (now: Date) => ({ from: now, to: now }) },
	{ key: "7d", label: "Últimos 7 dias", range: (now: Date) => ({ from: subDays(now, 6), to: now }) },
	{ key: "30d", label: "Últimos 30 dias", range: (now: Date) => ({ from: subDays(now, 29), to: now }) },
	{ key: "month", label: "Este mês", range: (now: Date) => ({ from: startOfMonth(now), to: now }) },
] as const;

function label(from?: Date, to?: Date) {
	if (from && to) {
		return `${format(from, "dd/MM/yy", { locale: ptBR })} – ${format(to, "dd/MM/yy", { locale: ptBR })}`;
	}
	if (from) {
		return `A partir de ${format(from, "dd/MM/yy", { locale: ptBR })}`;
	}
	return null;
}

function DateRangePicker({
	from,
	to,
	onChange,
	id,
	className,
	"aria-label": ariaLabel,
}: DateRangePickerProps) {
	const [open, setOpen] = useState(false);
	const current = label(from, to);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				render={
					<Button
						aria-label={ariaLabel ?? "Período"}
						className={cn(
							"justify-start font-normal",
							!current && "text-muted-foreground",
							className
						)}
						id={id}
						type="button"
						variant="outline"
					>
						<CalendarIcon className="mr-2 size-4" />
						{current ?? <span>Período</span>}
					</Button>
				}
			/>
			<PopoverContent align="start" className="flex w-auto gap-2 p-2.5">
				<div className="flex flex-col gap-1 border-border border-r pr-2">
					{PRESETS.map((p) => (
						<Button
							key={p.key}
							onClick={() => {
								onChange(p.range(new Date()));
								setOpen(false);
							}}
							size="sm"
							type="button"
							variant="ghost"
						>
							{p.label}
						</Button>
					))}
					<Button
						onClick={() => {
							onChange({ from: undefined, to: undefined });
							setOpen(false);
						}}
						size="sm"
						type="button"
						variant="ghost"
					>
						Limpar
					</Button>
				</div>
				<Calendar
					autoFocus
					locale={ptBR}
					mode="range"
					numberOfMonths={2}
					onSelect={(range: { from?: Date; to?: Date } | undefined) =>
						onChange({ from: range?.from, to: range?.to })
					}
					selected={{ from, to }}
				/>
			</PopoverContent>
		</Popover>
	);
}

export { DateRangePicker };
```

Se o `Calendar` do pacote não repassar `mode="range"` (checar `packages/ui/src/components/calendar.tsx` — ele envelopa react-day-picker; `DatePicker` usa `mode="single"`), ajustar a tipagem do wrapper para aceitar as props de range do react-day-picker — NÃO trocar de lib.

- [ ] **Step 2: Types**

Run: `bun check-types --force`
Expected: PASS no pacote ui (consumo chega na Task 7).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/date-range-picker.tsx
git commit -m "feat: DateRangePicker com presets no ui"
```

---

### Task 7: Barra de filtros v2

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/product-filter-combobox.tsx`
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (`listOrderToolOptions`)

**Interfaces:**
- Consumes: `DateRangePicker` (Task 6), tab `late` (Task 1), `CARRIER_NONE` (Task 3).
- Produces: `OrderFiltersPanel` aceita props novas `carrierOptions: { methods: string[]; hasUnassigned: boolean }`, `toolOptions: { id: string; name: string }[]`; params de URL `carrier`/`productId`; tab Atrasados renderizada no grupo esquerdo com badge warning.
- `listOrderToolOptions(): Promise<{ id: string; name: string }[]>` em data.ts: `SELECT id, name FROM tool WHERE status = 'active' ORDER BY name` (page.tsx passa pro panel).

- [ ] **Step 1: ProductFilterCombobox (single-select, padrão do ToolCombobox de promotions)**

```tsx
// apps/web/src/app/dashboard/orders/_components/product-filter-combobox.tsx
"use client";

import {
	Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@emach/ui/components/command";
import {
	Popover, PopoverContent, PopoverTrigger,
} from "@emach/ui/components/popover";
import { ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";

interface ProductFilterComboboxProps {
	id?: string;
	onChange: (toolId: string | null) => void;
	options: { id: string; name: string }[];
	value: string | null;
}

export function ProductFilterCombobox({
	id, onChange, options, value,
}: ProductFilterComboboxProps) {
	const [open, setOpen] = useState(false);
	const selected = options.find((o) => o.id === value) ?? null;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				id={id}
				render={<button type="button" />}
			>
				<span className={selected ? "truncate" : "text-muted-foreground"}>
					{selected ? selected.name : "Todos os produtos"}
				</span>
				{selected ? (
					<X
						className="size-3.5 shrink-0 opacity-70 hover:opacity-100"
						onClick={(e) => {
							e.stopPropagation();
							onChange(null);
						}}
					/>
				) : (
					<ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
				)}
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-0">
				<Command>
					<CommandInput placeholder="Buscar produto…" />
					<CommandList>
						<CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
						<CommandGroup>
							{options.map((tool) => (
								<CommandItem
									data-checked={tool.id === value}
									key={tool.id}
									onSelect={() => {
										onChange(tool.id === value ? null : tool.id);
										setOpen(false);
									}}
									value={tool.name}
								>
									{tool.name}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
```

- [ ] **Step 2: order-list-filters.tsx**

- `TRACKED = ["q", "from", "to", "branchId", "carrier", "productId"]` (sai `page`/`unverified`).
- Remover o `<Button>` "Frete a revisar" + import `TriangleAlertIcon`.
- Substituir os dois blocos De/Até por um bloco "Período" com `DateRangePicker` (`from={parseDateParam(from)} to={parseDateParam(to)}`, `onChange={(r) => { setFrom(formatDateParam(r.from)); setTo(formatDateParam(r.to)); }}`).
- Bloco "Produto": `ProductFilterCombobox` com `value={searchParams.get("productId")}` e `onChange={(id) => setParam("productId", id)}`.
- Bloco "Transportadora": `Select` no padrão do de Filial — `__all__` sentinel, item "Todas", itens de `carrierOptions.methods` (label caps via `text-transform` não — exibir o valor cru; normalização visual `uppercase` só no chip do card), e se `carrierOptions.hasUnassigned` um item `CARRIER_NONE` com label "A combinar".
- `buildTabHref` inclui `carrier`/`productId` e para de escrever `unverified`.
- Tab Atrasados: `ORDER_FLOW_TABS` já a inclui (Task 1) — o render é automático; badge warning quando >0:

```tsx
{(isActive || count > 0) && (
	<TabsCountBadge
		className={tab.key === "late" && count > 0 ? "bg-warning text-warning-foreground" : undefined}
		value={count}
	/>
)}
```

- `tabCount`: adicionar `if (tabKey === "late") return counts.late ?? 0;` antes do reduce por statuses (senão somaria paid+preparing).

- [ ] **Step 3: Types + smoke**

Run: `bun check-types --force`
Expected: restam APENAS erros do card (Task 8). page.tsx passa `carrierOptions`/`toolOptions` — atualizar a interface de props aqui.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx apps/web/src/app/dashboard/orders/_components/product-filter-combobox.tsx apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/orders/page.tsx
git commit -m "feat: barra de filtros com produto/transportadora/período"
```

---

### Task 8: Card C1 + badges CAPSLOCK + grade 2 col + resumo de produto

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/order-card.tsx` (reescrita)
- Modify: `apps/web/src/app/dashboard/orders/_components/order-card-grid.tsx` (cols + prop highlight)
- Modify: `apps/web/src/app/dashboard/orders/_components/order-status-badge.tsx` (caps)
- Modify: `apps/web/src/components/status-visual.tsx` (const compartilhada de caps)
- Create: `apps/web/src/app/dashboard/orders/_components/product-filter-summary.tsx`
- Create: `apps/web/src/app/dashboard/orders/_lib/age-meta.ts` + `_lib/__tests__/age-meta.test.ts`
- Modify: `apps/web/src/app/dashboard/orders/page.tsx` e `_components/orders-infinite.tsx` (props `highlightToolId`, resumo)

**Interfaces:**
- Consumes: `OrderListItem` v2 (Task 3), `latenessOf` (Task 1).
- Produces:
  - `STATUS_BADGE_CAPS = "uppercase text-[10px] tracking-[0.05em]"` exportada de `status-visual.tsx`; aplicada no `OrderStatusBadge` e no badge de fulfillment do card.
  - `ageMetaForTab(tabKey: string, item: Pick<OrderListItem, "createdAt" | "paidAt" | "shippedAt" | "deliveredAt">): { label: string; value: string }` — label/valor prontos (usa `formatRelative`/`formatDate` de `@/lib/format/datetime`).
  - `OrderCard({ item, tabKey, highlightToolId })`; `OrderCardGrid` repassa ambos; `ProductFilterSummary({ name, orders, units, clearHref })`.

- [ ] **Step 1: Teste do age-meta (falha primeiro)**

```ts
// apps/web/src/app/dashboard/orders/_lib/__tests__/age-meta.test.ts
import { describe, expect, it } from "vitest";
import { ageMetaForTab } from "../age-meta";

const base = {
	createdAt: new Date("2026-07-01T12:00:00Z"),
	paidAt: new Date("2026-07-02T12:00:00Z"),
	shippedAt: new Date("2026-07-03T12:00:00Z"),
	deliveredAt: new Date("2026-07-04T12:00:00Z"),
};

describe("ageMetaForTab", () => {
	it("Pago há nas filas de expedição", () => {
		for (const tab of ["paid", "preparing", "late"]) {
			expect(ageMetaForTab(tab, base).label).toBe("Pago há");
		}
	});
	it("Enviado há / Entregue em / Criado há", () => {
		expect(ageMetaForTab("shipped", base).label).toBe("Enviado há");
		expect(ageMetaForTab("delivered", base).label).toBe("Entregue em");
		expect(ageMetaForTab("all", base).label).toBe("Criado há");
	});
	it("fallback para createdAt quando timestamp da etapa é null", () => {
		expect(ageMetaForTab("paid", { ...base, paidAt: null }).label).toBe("Pago há");
	});
});
```

Run: `bun --cwd apps/web test age-meta` → FAIL

- [ ] **Step 2: age-meta.ts**

```ts
// apps/web/src/app/dashboard/orders/_lib/age-meta.ts
import { formatDate, formatRelative } from "@/lib/format/datetime";

interface AgeSource {
	createdAt: Date;
	deliveredAt: Date | null;
	paidAt: Date | null;
	shippedAt: Date | null;
}

export function ageMetaForTab(
	tabKey: string,
	item: AgeSource
): { label: string; value: string } {
	switch (tabKey) {
		case "paid":
		case "preparing":
		case "late":
			return {
				label: "Pago há",
				value: formatRelative(item.paidAt ?? item.createdAt),
			};
		case "shipped":
			return {
				label: "Enviado há",
				value: formatRelative(item.shippedAt ?? item.createdAt),
			};
		case "delivered":
			return {
				label: "Entregue em",
				value: formatDate(item.deliveredAt ?? item.createdAt),
			};
		default:
			return { label: "Criado há", value: formatRelative(item.createdAt) };
	}
}
```

(`formatRelative` retorna "há 12 dias" — no card exibir só o valor; se o prefixo "há" duplicar com o label, strip: `value.replace(/^há /, "")` DENTRO do ageMetaForTab, e cobrir no teste com `expect(value).not.toMatch(/^há/)`.)

- [ ] **Step 3: STATUS_BADGE_CAPS + OrderStatusBadge**

Em `status-visual.tsx`:

```ts
// Badge de STATUS em caixa-alta (spec 2026-07-10) — só status/fulfillment,
// nunca no Badge base (não uppercasear "Inativa" de filiais etc.).
export const STATUS_BADGE_CAPS = "uppercase text-[10px] tracking-[0.05em]";
```

`order-status-badge.tsx`:

```tsx
<Badge className={STATUS_BADGE_CAPS} variant={TONE_BADGE_VARIANT[meta.tone]}>
```

- [ ] **Step 4: order-card.tsx (reescrita — mockup card-anatomy-v2 opção A)**

```tsx
import { Badge } from "@emach/ui/components/badge";
import { cn } from "@emach/ui/lib/utils";
import { MapPinIcon, PackageIcon, TruckIcon } from "lucide-react";
import Link from "next/link";

import { STATUS_BADGE_CAPS } from "@/components/status-visual";
import { FULFILLMENT_STATE_META } from "../../separacao/fulfillment-meta";
import { ageMetaForTab } from "../_lib/age-meta";
import { orderBadgeSource } from "../_lib/display-state";
import { latenessOf } from "../_lib/lateness";
import type { OrderListItem } from "../data";
import { OrderStatusBadge } from "./order-status-badge";
import { ShippingUnverifiedBadge } from "./shipping-unverified-badge";

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	maximumFractionDigits: 0,
	style: "currency",
});

const VISIBLE_ITEMS = 3;

export function OrderCard({
	item,
	tabKey,
	highlightToolId,
}: {
	highlightToolId?: string | null;
	item: OrderListItem;
	tabKey: string;
}) {
	const lateness = latenessOf(item.status, item.paidAt, item.createdAt, new Date());
	const age = ageMetaForTab(tabKey, item);
	const hiddenItems = item.itemsCount - item.items.length;

	return (
		<Link
			className={cn(
				"group flex flex-col overflow-hidden rounded-[10px] border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				lateness === "none"
					? "border-border hover:border-border/60"
					: "border-warning/40 hover:border-warning/60"
			)}
			href={`/dashboard/orders/${item.id}`}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="min-w-0 flex-1">
					<span className="block truncate font-mono font-semibold text-[13px] text-foreground leading-tight tracking-tight">
						{item.number}
					</span>
					<p className="truncate text-[13px] text-foreground/90">{item.clientName}</p>
					<p className="mt-0.5 flex items-center gap-1 truncate text-muted-foreground text-xs">
						<MapPinIcon aria-hidden className="size-3 shrink-0" />
						<span className="truncate">{item.branchName ?? "—"}</span>
					</p>
				</div>
				<div className="flex flex-shrink-0 flex-col items-end gap-3">
					{orderBadgeSource(item.status, item.fulfillmentState) === "fulfillment" &&
					item.fulfillmentState ? (
						<Badge
							className={STATUS_BADGE_CAPS}
							variant={FULFILLMENT_STATE_META[item.fulfillmentState].badgeVariant}
						>
							{FULFILLMENT_STATE_META[item.fulfillmentState].label}
						</Badge>
					) : (
						<OrderStatusBadge status={item.status} />
					)}
					<span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
						<TruckIcon aria-hidden className="size-3" />
						<span className="uppercase">{item.shippingMethod ?? "A combinar"}</span>
					</span>
					{item.shippingUnverified && <ShippingUnverifiedBadge compact />}
				</div>
			</div>

			<div className="flex flex-col gap-1.5 border-border/55 border-t px-4 pt-2 pb-2.5">
				{item.items.map((line) => (
					<div
						className={cn(
							"flex items-center gap-2.5",
							highlightToolId === line.toolId &&
								"-mx-1.5 rounded-md bg-primary/10 px-1.5 py-0.5 outline outline-1 outline-primary/35"
						)}
						key={`${line.toolId}-${line.name}`}
					>
						{line.imageUrl ? (
							// biome-ignore lint/performance/noImgElement: Supabase public URL
							<img
								alt=""
								className="size-[30px] shrink-0 rounded-md border border-border bg-muted object-cover"
								src={line.imageUrl}
							/>
						) : (
							<span className="flex size-[30px] shrink-0 items-center justify-center rounded-md border border-border bg-muted">
								<PackageIcon aria-hidden className="size-4 text-muted-foreground" />
							</span>
						)}
						<span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/90" title={line.name}>
							{line.name}
						</span>
						<span className="shrink-0 font-mono font-semibold text-[12px] tabular-nums">
							×{line.quantity}
						</span>
					</div>
				))}
				{hiddenItems > 0 && (
					<span className="pl-[40px] text-[11.5px] text-muted-foreground">
						+{hiddenItems} {hiddenItems === 1 ? "item" : "itens"}
					</span>
				)}
			</div>

			<div className="mt-auto grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{item.unitsCount}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Unidades
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{CURRENCY_FORMATTER.format(item.totalAmount)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Total
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span
						className={cn(
							"font-bold text-[13px] tabular-nums",
							lateness === "none" ? "text-foreground" : "text-warning"
						)}
					>
						{age.value}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						{age.label}
					</span>
				</div>
			</div>
		</Link>
	);
}
```

(Nota: `key={`${line.toolId}-${line.name}`}` — um pedido pode ter 2 linhas da mesma tool com variantes distintas; toolId sozinho colidiria.)

- [ ] **Step 5: Varredura do CAPSLOCK nas outras superfícies**

O caps vale pra TODO badge de status/fulfillment (spec §1). Varredura obrigatória:

Run: `rg -ln "FULFILLMENT_STATE_META|OrderStatusBadge" apps/web/src --glob '!**/orders/_components/order-card.tsx'`

Em cada call-site que renderiza `<Badge variant={FULFILLMENT_STATE_META[...].badgeVariant}>` (fila de separação, detalhe do pedido, etc.), aplicar `className={STATUS_BADGE_CAPS}`. `OrderStatusBadge` já cobre os seus call-sites por dentro (Step 3). NÃO tocar badges que não sejam de status (ex.: "Inativa", contadores).

- [ ] **Step 6: Grid 2 colunas + repasse de props**

`order-card-grid.tsx`: trocar as classes de colunas para `grid grid-cols-1 gap-3 lg:grid-cols-2`; aceitar e repassar `tabKey` e `highlightToolId` pro `OrderCard`. `orders-infinite.tsx`: aceitar `tabKey`/`highlightToolId` nas props e repassar; `page.tsx`: passar `tabKey={activeTab}` e `highlightToolId={data.productId ?? null}`.

- [ ] **Step 7: ProductFilterSummary**

```tsx
// apps/web/src/app/dashboard/orders/_components/product-filter-summary.tsx
import Link from "next/link";

export function ProductFilterSummary({
	clearHref,
	name,
	orders,
	units,
}: {
	clearHref: string;
	name: string;
	orders: number;
	units: number;
}) {
	return (
		<div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/8 px-3 py-2 text-[12.5px]">
			<span className="rounded-md bg-secondary/50 px-2 py-0.5">{name}</span>
			<span>
				em <b>{orders} {orders === 1 ? "pedido" : "pedidos"}</b> nesta aba ·{" "}
				<b>{units} {units === 1 ? "unidade" : "unidades"}</b> pra separar
			</span>
			<Link className="ml-auto text-muted-foreground text-xs hover:text-foreground" href={clearHref}>
				limpar filtro ✕
			</Link>
		</div>
	);
}
```

page.tsx renderiza entre `OrderFiltersPanel` e a grade quando `productSummary && productName` (clearHref = URL atual sem `productId`).

- [ ] **Step 8: Testes + types + build**

Run: `bun --cwd apps/web test && bun check-types --force && bun check`
Expected: PASS geral (zero pendências de types a partir daqui).

- [ ] **Step 9: Commit**

```bash
git add -A apps/web/src/app/dashboard/orders apps/web/src/components/status-visual.tsx
git commit -m "feat: card C1 com itens, caps e resumo de produto"
```

---

### Task 9: Toast de atrasados (Pedidos + Separação)

**Files:**
- Create: `apps/web/src/app/dashboard/orders/_components/late-orders-toast.tsx`
- Modify: `apps/web/src/app/dashboard/orders/page.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/page.tsx`

**Interfaces:**
- Consumes: `counts.late` (orders page), `getLateOrdersCount(scope)` (Task 4, separacao page), `notify` de `@/lib/notify`.
- Produces: `<LateOrdersToast count={n} />` — client component que dispara `notify.warning` no mount quando `count > 0`, com action navegando pra `/dashboard/orders?tab=late`. `id: "late-orders"` deduplica se as duas páginas dispararem na mesma sessão de tela.

- [ ] **Step 1: Componente**

```tsx
// apps/web/src/app/dashboard/orders/_components/late-orders-toast.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { notify } from "@/lib/notify";

export function LateOrdersToast({ count }: { count: number }) {
	const router = useRouter();
	useEffect(() => {
		if (count <= 0) {
			return;
		}
		notify.warning(
			`${count} ${count === 1 ? "pedido atrasado" : "pedidos atrasados"} aguardando expedição`,
			{
				id: "late-orders",
				action: {
					label: "Ver atrasados",
					onClick: () => router.push("/dashboard/orders?tab=late"),
				},
			}
		);
	}, [count, router]);
	return null;
}
```

- [ ] **Step 2: Integrar nas duas páginas**

- `orders/page.tsx`: `<LateOrdersToast count={counts.late ?? 0} />` no JSX (fora de condicionais de empty).
- `separacao/page.tsx`: adicionar `getLateOrdersCount` ao `Promise.all` existente (importar de `../orders/data` — módulo `server-only`, ok em Server Component) e renderizar `<LateOrdersToast count={lateCount} />` logo após `<AutoRefresh />`.

- [ ] **Step 3: Types + build**

Run: `bun check-types --force && bun run build`
Expected: PASS (build é gate: import cruzado separacao→orders/data precisa ficar server-side).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/late-orders-toast.tsx apps/web/src/app/dashboard/orders/page.tsx apps/web/src/app/dashboard/separacao/page.tsx
git commit -m "feat: toast de pedidos atrasados em pedidos/separação"
```

---

### Task 10: Export CSV no builder único + filtros novos

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/export/route.ts`

**Interfaces:**
- Consumes: `buildOrdersListConditions` + `resolveTab` (exportar de data.ts se privado — preferir mover `resolveTab` pra `_lib/orders-where.ts` junto dos tab defs) e `ordersListFiltersSchema` v2.
- Produces: export aceita `carrier`/`productId`; para de aceitar `unverified`. Colunas do CSV inalteradas.

- [ ] **Step 1: Substituir a construção duplicada de filtros**

No route.ts, remover o bloco local de conditions (linhas ~150-210) e usar:

```ts
const tab = resolveTab(parsed.tab);
const conditions = buildOrdersListConditions({
	filters: {
		q: parsed.q,
		branchId: parsed.branchId,
		carrier: parsed.carrier,
		toolId: parsed.productId,
		from: normalizeDateParam(parsed.from),
		to: normalizeDateParam(parsed.to),
	},
	scope,
	tabDef: tab,
});
```

(preservar o caminho `?ids=` que ignora filtros; `normalizeDateParam` importada do mesmo lugar que data.ts usa.)

- [ ] **Step 2: Types + teste manual do route**

Run: `bun check-types --force && bun check`
Expected: PASS. Smoke real na Task 12 (CSV baixado com filtro de produto ativo).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/export/route.ts apps/web/src/app/dashboard/orders/_lib/orders-where.ts apps/web/src/app/dashboard/orders/data.ts
git commit -m "refactor: export CSV no filter-builder único"
```

---

### Task 11: Seed insert-only de 5 pedidos pagos (ESCREVER, não rodar)

**Files:**
- Create: `packages/db/scripts/seed-test-orders.ts`
- Modify: `packages/db/package.json` (script `db:seed-test-orders`)

**Interfaces:**
- Consumes: singleton `db` (`../src/index`), schema tables (`order`, `orderItem`, `orderStatusHistory` de `@emach/db/schema/orders`; `stockMovement` de `@emach/db/schema/stock-movements`), padrão de guard do `seed-demo.ts`.
- Produces: script idempotente-com-falha-alta (unique em `order.number` e no índice parcial `stock_movement_sale_idempotency`); numbers `EM-TEST-9001..9005`.

⛔ **Esta task só ESCREVE e type-checka o script. NUNCA executá-lo — banco único dev=prod. A execução é um passo manual do orquestrador com OK explícito do user (ver Task 12).**

- [ ] **Step 1: Script completo**

```ts
// packages/db/scripts/seed-test-orders.ts
// Seed INSERT-ONLY de 5 pedidos pagos pra teste da listagem (spec 2026-07-10).
// Diferente do seed-demo: NÃO trunca nada; reusa clients/branches/variants reais.
// Única operação não-INSERT: decremento escopado de stock_level (espelha o
// débito que o ecommerce faz ao confirmar pagamento).
import { env } from "@emach/env/server";
import {
	order,
	orderItem,
	orderStatusHistory,
} from "@emach/db/schema/orders";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

const HOURS = 3_600_000;
// Idades desde o pagamento: 2h e 26h (normais), 50h (âmbar), 74h e 120h (Atrasados).
const PAID_AGES_HOURS = [2, 26, 50, 74, 120] as const;
const SHIPPING_METHODS = ["SEDEX", "PAC", null, "SEDEX", "PAC"] as const;

async function main() {
	const forced =
		process.argv.includes("--force") || process.env.SEED_FORCE === "1";
	if (!forced) {
		const host = new URL(env.DATABASE_URL).host;
		console.error(
			[
				"[seed-test-orders] ABORTADO.",
				"Insere 5 pedidos pagos de teste (EM-TEST-90NN) com débito de estoque.",
				`Alvo: ${host} (banco compartilhado dashboard + e-commerce).`,
				"Se tem certeza, rode novamente com --force (ou SEED_FORCE=1).",
			].join("\n")
		);
		process.exit(1);
	}

	await db.transaction(async (tx) => {
		// FKs reais — aborta com erro claro se faltar base (nunca fabrica catálogo).
		const branches = await tx.execute<{ id: string }>(
			sql`SELECT id FROM branch WHERE status = 'active' ORDER BY created_at LIMIT 1`
		);
		const branchId = branches.rows[0]?.id;
		if (!branchId) {
			throw new Error("[seed-test-orders] nenhuma branch ativa.");
		}

		const clients = await tx.execute<{ id: string; name: string }>(
			sql`SELECT id, name FROM client WHERE status = 'active' ORDER BY created_at LIMIT 5`
		);
		if (clients.rows.length === 0) {
			throw new Error("[seed-test-orders] nenhum client ativo.");
		}

		const variants = await tx.execute<{
			variant_id: string;
			tool_id: string;
			sku: string | null;
			price_amount: string;
			name: string;
			model: string | null;
			voltage: string | null;
			ncm: string | null;
			cest: string | null;
			manufacturer_name: string | null;
			stock_qty: number;
		}>(sql`
			SELECT tv.id AS variant_id, tv.tool_id, tv.sku, tv.price_amount,
				t.name, t.model, t.ncm, t.cest, t.manufacturer_name,
				sl.quantity AS stock_qty
			FROM tool_variant tv
			JOIN tool t ON t.id = tv.tool_id AND t.status = 'active'
			JOIN stock_level sl ON sl.variant_id = tv.id AND sl.branch_id = ${branchId}
			WHERE sl.quantity >= 5
			ORDER BY t.name
			LIMIT 12
		`);
		if (variants.rows.length < 4) {
			throw new Error(
				"[seed-test-orders] menos de 4 variantes ativas com estoque ≥5 na branch."
			);
		}

		const createdNumbers: string[] = [];

		for (let i = 0; i < PAID_AGES_HOURS.length; i++) {
			const orderId = crypto.randomUUID();
			const number = `EM-TEST-${9001 + i}`;
			const client = clients.rows[i % clients.rows.length];
			const paidAt = new Date(Date.now() - PAID_AGES_HOURS[i] * HOURS);
			const createdAt = new Date(paidAt.getTime() - 3 * HOURS);
			// 1 a 4 itens por pedido, girando pelo pool de variantes.
			const lineCount = (i % 4) + 1;
			const lines = Array.from({ length: lineCount }, (_, j) => {
				const v = variants.rows[(i * 2 + j) % variants.rows.length];
				return { v, quantity: (j % 3) + 1 };
			});

			const subtotal = lines
				.reduce(
					(sum, l) => sum + l.quantity * Number.parseFloat(l.v.price_amount),
					0
				)
				.toFixed(2);
			const shippingAmount = SHIPPING_METHODS[i] ? "39.90" : "0";
			const totalAmount = (
				Number.parseFloat(subtotal) + Number.parseFloat(shippingAmount)
			).toFixed(2);

			await tx.insert(order).values({
				id: orderId,
				number,
				clientId: client.id,
				branchId,
				status: "paid",
				paymentMethod: "pix",
				paymentProviderRef: `TEST-${orderId.slice(0, 8).toUpperCase()}`,
				subtotalAmount: subtotal,
				discountAmount: "0",
				shippingAmount,
				totalAmount,
				shippingAddress: {
					recipient: client.name,
					zipCode: "13010-000",
					street: "Rua de Teste",
					number: String(100 + i),
					neighborhood: "Centro",
					city: "Campinas",
					state: "SP",
					country: "BR",
				},
				shippingMethod: SHIPPING_METHODS[i],
				shippingTrackingCode: null,
				notes: null,
				createdAt,
				paidAt,
			});

			for (const line of lines) {
				const itemId = crypto.randomUUID();
				await tx.insert(orderItem).values({
					id: itemId,
					orderId,
					toolId: line.v.tool_id,
					variantId: line.v.variant_id,
					sku: line.v.sku,
					name: line.v.name,
					model: line.v.model,
					voltage: line.v.voltage,
					unitPrice: line.v.price_amount,
					quantity: line.quantity,
					lineTotal: (
						line.quantity * Number.parseFloat(line.v.price_amount)
					).toFixed(2),
					discountAmount: "0",
					ncm: line.v.ncm,
					cest: line.v.cest,
					manufacturerName: line.v.manufacturer_name,
				});

				// Débito de estoque — espelha o ecommerce na confirmação de pagamento.
				const current = await tx.execute<{ quantity: number }>(
					sql`SELECT quantity FROM stock_level WHERE variant_id = ${line.v.variant_id} AND branch_id = ${branchId}`
				);
				const currentQty = current.rows[0]?.quantity;
				if (currentQty === undefined || currentQty < line.quantity) {
					throw new Error(
						`[seed-test-orders] estoque insuficiente variant=${line.v.variant_id}`
					);
				}
				const newQty = currentQty - line.quantity;
				await tx.insert(stockMovement).values({
					id: crypto.randomUUID(),
					variantId: line.v.variant_id,
					branchId,
					previousQty: currentQty,
					newQty,
					delta: -line.quantity,
					reason: "saida_venda",
					reasonNote: null,
					orderId,
					orderItemId: itemId,
					actorType: "system",
					actorId: null,
				});
				await tx.execute(
					sql`UPDATE stock_level SET quantity = ${newQty} WHERE variant_id = ${line.v.variant_id} AND branch_id = ${branchId}`
				);
			}

			// Histórico coerente: criado → pago (gateway = system; CHECK actor_coherence).
			await tx.insert(orderStatusHistory).values({
				id: crypto.randomUUID(),
				orderId,
				fromStatus: "pending_payment",
				toStatus: "pending_payment",
				actorType: "system",
				actorUserId: null,
				reason: "criado",
				createdAt,
			});
			await tx.insert(orderStatusHistory).values({
				id: crypto.randomUUID(),
				orderId,
				fromStatus: "pending_payment",
				toStatus: "paid",
				actorType: "system",
				actorUserId: null,
				reason: null,
				createdAt: paidAt,
			});

			createdNumbers.push(number);
		}

		console.log(
			`[seed-test-orders] OK — criados: ${createdNumbers.join(", ")}\n` +
				"Limpeza manual: DELETE FROM \"order\" WHERE number LIKE 'EM-TEST-%' " +
				"(order_item/history caem por CASCADE; stock_movement/stock_level exigem reversão manual)."
		);
	});
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("[seed-test-orders] FAIL", err);
		process.exit(1);
	});
```

Nota de tipo: conferir os nomes exatos dos campos de `shippingAddress` no `$type` do jsonb em `orders.ts` (o seed-demo usa `recipient/zipCode/street/number/neighborhood/city/state/country`) e o import de `stockMovement` (packages/db/src/schema/stock-movements.ts). `console.log` é aceitável em script CLI de packages/db (padrão do seed-demo) — a proibição de console vale pro app.

- [ ] **Step 2: Registrar script**

Em `packages/db/package.json`, dentro de `scripts`:

```json
"db:seed-test-orders": "bun run scripts/seed-test-orders.ts",
```

- [ ] **Step 3: Type-check apenas**

Run: `bun check-types --force` (turbo cobre packages/db)
Expected: PASS. **NÃO RODAR O SCRIPT.**

- [ ] **Step 4: Commit**

```bash
git add packages/db/scripts/seed-test-orders.ts packages/db/package.json
git commit -m "feat: seed insert-only de pedidos pagos de teste"
```

---

### Task 12: Docs + verificação final (3 provas) — orquestrador

**Files:**
- Modify: `DESIGN.md` (§4: variação do stat-card com bloco de itens; regra STATUS_BADGE_CAPS; tab computada Atrasados)
- Modify: `apps/web/CLAUDE.md` (nota: WHERE da listagem/export/resumo vem de `_lib/orders-where.ts` — não reintroduzir cópias)

**Esta task é do orquestrador (não subagente): envolve rodar o seed com OK do user e smoke visual.**

- [ ] **Step 1: Docs** — atualizar os dois arquivos com as regras acima (3-6 linhas cada, tom mistakes-log).
- [ ] **Step 2: Gate funcional** — `bun verify && bun run build` na raiz. Expected: PASS.
- [ ] **Step 3: Seed (gate manual)** — pedir OK explícito ao user; com OK: `bun run packages/db/scripts/seed-test-orders.ts --force` a partir da RAIZ. Conferir output com os 5 numbers.
- [ ] **Step 4: Prova perceptual** — `bun dev:web` (ou porta da sessão) + screenshots das abas Pago/Em preparação/Atrasados lado a lado com os mockups aprovados e com a listagem de filiais.
- [ ] **Step 5: Prova de dados** — na UI: 2 pedidos em Atrasados (74h/120h), 1 âmbar na fila (50h), unidades somadas batendo com o seed, filtro de produto acendendo o item + resumo correto, filtro de transportadora (SEDEX/PAC/A combinar), CSV com filtro ativo, toast disparando em Pedidos e Separação.
- [ ] **Step 6: Commit docs**

```bash
git add DESIGN.md apps/web/CLAUDE.md
git commit -m "docs: pattern da listagem de pedidos e builder único"
```
