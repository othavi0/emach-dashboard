# Atrasados como overlay — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pedido atrasado (≥72h em `paid`/`preparing`) permanece na aba do seu status E aparece em "Atrasados" (que vai pro fim da fileira, com sub-abas por status), com chip "ATRASADO" no card fora da aba Atrasados.

**Architecture:** Mudança declarativa no modelo de abas existente (`status-meta.ts`) + fold de contagens e builder único de WHERE (`_lib/orders-where.ts`). Nenhuma mudança de SQL agregado nem de banco. Spec aprovada: `docs/superpowers/specs/2026-07-13-atrasados-overlay-design.md`.

**Tech Stack:** Next 16 / React 19, Drizzle (SQL template), Zod, Vitest, Tailwind.

## Global Constraints

- **Banco Supabase é ÚNICO e COMPARTILHADO (dev=prod=ecommerce).** Nenhum seed/truncate/reset/db:push. Este plano não toca banco.
- CWD é a **raiz** do monorepo (turbo/bun) — nunca `cd apps/web`; paths absolutos.
- Read cada arquivo antes de Edit; se Edit falhar com `string not found`, re-Read antes de re-tentar (o hook PostToolUse roda `bun fix` e pode reformatar).
- Proibido: `console.*` (usar `logger`), `any`, `@ts-ignore`, `key={index}` sem justificativa, `useMemo`/`useCallback` manuais (React Compiler ativo).
- Commits: Conventional Commits em PT, subject ≤50 chars, **zero** atribuição de AI. O lefthook roda `bun fix` + `git add -u` no commit.
- Testes: `bun --cwd apps/web test <arquivo>` (vitest, env node).
- Gate final: `bun verify` (check-types + check + test) com cache limpo.
- Dev server já está de pé na porta **3006** (log `/tmp/dev-up-3006.log`) para smoke visual.

---

### Task 1: Modelo de abas — overlay + ordem + sub-abas

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/status-meta.ts:15-58`
- Test: `apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts`

**Interfaces:**
- Consumes: nada (folha).
- Produces: `ORDER_FLOW_TABS` na ordem `paid, preparing, shipped, delivered, late` (sem `lateness: "exclude"`); `type TabLateness = "only"`; `type LateSubTabKey = "all" | "paid" | "preparing"`; `const LATE_SUB_TABS: readonly { key: LateSubTabKey; label: string }[]` com labels `Todos`/`Pagos`/`Em preparação`.

- [ ] **Step 1: Atualizar o teste para o comportamento novo (falhará)**

Em `apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts`, substituir os testes `"tem um chip por status do funil, na ordem do fluxo"` e `"aba computada 'late' cobre paid+preparing e é exclusiva"` por:

```ts
	it("tem um chip por status do funil; 'late' fecha a fileira", () => {
		expect(ORDER_FLOW_TABS.map((t) => t.key)).toEqual([
			"paid",
			"preparing",
			"shipped",
			"delivered",
			"late",
		]);
		expect(ORDER_FLOW_TABS.map((t) => t.label)).toEqual([
			"Pago",
			"Em preparação",
			"Enviados",
			"Entregues",
			"Atrasados",
		]);
	});

	it("aba computada 'late' cobre paid+preparing como OVERLAY (spec 2026-07-13)", () => {
		const late = ORDER_FLOW_TABS.find((t) => t.key === "late");
		expect(late?.statuses).toEqual(["paid", "preparing"]);
		expect(late?.lateness).toBe("only");
		// Overlay: pedido atrasado NÃO some das abas do próprio status.
		expect(
			ORDER_FLOW_TABS.find((t) => t.key === "paid")?.lateness
		).toBeUndefined();
		expect(
			ORDER_FLOW_TABS.find((t) => t.key === "preparing")?.lateness
		).toBeUndefined();
	});

	it("sub-abas de Atrasados: Todos, Pagos, Em preparação", () => {
		expect(LATE_SUB_TABS.map((t) => t.key)).toEqual([
			"all",
			"paid",
			"preparing",
		]);
		expect(LATE_SUB_TABS.map((t) => t.label)).toEqual([
			"Todos",
			"Pagos",
			"Em preparação",
		]);
	});
```

E adicionar `LATE_SUB_TABS` ao import de `../status-meta` no topo do arquivo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test __tests__/status-meta.test.ts`
Expected: FAIL (`LATE_SUB_TABS` não exportado; ordem/lateness divergem).

- [ ] **Step 3: Implementar em `status-meta.ts`**

**Não** mexer no tipo `TabLateness` nesta task — o builder em `orders-where.ts` ainda compara com `"exclude"` e o `check-types` quebraria neste commit; o estreitamento acontece na Task 2 junto com a limpeza do branch.

Substituir o bloco `ORDER_FLOW_TABS` inteiro (linhas 24–58) por:

```ts
// Fluxo ativo do operador interno (grupo da esquerda na barra de tabs).
// Um chip por status do funil (spec 2026-07-08); a antiga aba agregada
// "A preparar" (paid+preparing) foi dividida em "Pago" e "Em preparação".
// "Atrasados" fecha a fileira: é um OVERLAY (spec 2026-07-13), não uma
// etapa — o pedido atrasado continua na aba do próprio status.
export const ORDER_FLOW_TABS = [
	{
		key: "paid",
		label: "Pago",
		statuses: ["paid"] as DbOrderStatus[],
	},
	{
		key: "preparing",
		label: "Em preparação",
		statuses: ["preparing"] as DbOrderStatus[],
	},
	{
		key: "shipped",
		label: "Enviados",
		statuses: ["shipped"] as DbOrderStatus[],
	},
	{
		key: "delivered",
		label: "Entregues",
		statuses: ["delivered"] as DbOrderStatus[],
	},
	{
		// Tab computada: pedidos pagos/em preparação há ≥72h. Overlay — o
		// pedido também segue listado em "Pago"/"Em preparação" (spec 2026-07-13).
		key: "late",
		label: "Atrasados",
		statuses: ["paid", "preparing"] as DbOrderStatus[],
		lateness: "only",
	},
] as const satisfies readonly OrderTabDef[];

// Sub-abas (pills) dentro de "Atrasados": filtram o overlay por status.
export type LateSubTabKey = "all" | "paid" | "preparing";

export const LATE_SUB_TABS = [
	{ key: "all", label: "Todos" },
	{ key: "paid", label: "Pagos" },
	{ key: "preparing", label: "Em preparação" },
] as const satisfies readonly { key: LateSubTabKey; label: string }[];
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test __tests__/status-meta.test.ts`
Expected: PASS. (`__tests__/display-state.test.ts` ainda não muda — fica na Task 5.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/status-meta.ts apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts
git commit -m "feat(orders): atraso vira overlay e fecha a fileira"
```

---

### Task 2: Contagens e WHERE — fold overlay + `lateStatus`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_lib/orders-where.ts`
- Create: `apps/web/src/app/dashboard/orders/__tests__/orders-where.test.ts`

**Interfaces:**
- Consumes: `OrderTabDef`/`TabLateness` da Task 1.
- Produces: `OrdersWhereFilters.lateStatus?: "paid" | "preparing"`; `OrderTabCounts` com chaves novas `late_paid`/`late_preparing`; `foldTabCounts` somando atrasado no bucket do status **e** em `late`; helper puro `effectiveTabStatuses(tabDef, lateStatus?)` usado pelo builder.

- [ ] **Step 1: Escrever o teste (falhará)**

Criar `apps/web/src/app/dashboard/orders/__tests__/orders-where.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

// orders-where importa @/lib/branch-scope → @emach/db; as funções sob teste
// são puras e não tocam o client — stub evita abrir conexão/env no load.
vi.mock("@emach/db", () => ({ db: {} }));

import {
	effectiveTabStatuses,
	emptyTabCounts,
	foldTabCounts,
} from "../_lib/orders-where";
import { ORDER_FLOW_TABS } from "../status-meta";

const lateTab = ORDER_FLOW_TABS.find((t) => t.key === "late");
const paidTab = ORDER_FLOW_TABS.find((t) => t.key === "paid");

if (!(lateTab && paidTab)) {
	throw new Error("defs de tab ausentes");
}

describe("foldTabCounts (overlay, spec 2026-07-13)", () => {
	it("atrasado soma no bucket do próprio status E em late", () => {
		const counts = foldTabCounts([
			{ count: 3, is_late: false, status: "paid" },
			{ count: 2, is_late: true, status: "paid" },
			{ count: 1, is_late: true, status: "preparing" },
			{ count: 4, is_late: false, status: "shipped" },
		]);
		expect(counts.paid).toBe(5);
		expect(counts.preparing).toBe(1);
		expect(counts.late).toBe(3);
		expect(counts.late_paid).toBe(2);
		expect(counts.late_preparing).toBe(1);
		expect(counts.all_count).toBe(10);
	});

	it("all_count não dobra: cada pedido conta uma vez", () => {
		const counts = foldTabCounts([{ count: 7, is_late: true, status: "paid" }]);
		expect(counts.all_count).toBe(7);
		expect(counts.paid).toBe(7);
		expect(counts.late).toBe(7);
	});

	it("emptyTabCounts expõe as chaves das sub-abas zeradas", () => {
		const counts = emptyTabCounts();
		expect(counts.late_paid).toBe(0);
		expect(counts.late_preparing).toBe(0);
	});
});

describe("effectiveTabStatuses (sub-aba lateStatus)", () => {
	it("na aba late, lateStatus estreita para um único status", () => {
		expect(effectiveTabStatuses(lateTab, "paid")).toEqual(["paid"]);
		expect(effectiveTabStatuses(lateTab, "preparing")).toEqual(["preparing"]);
	});

	it("sem lateStatus, mantém os statuses da def", () => {
		expect(effectiveTabStatuses(lateTab, undefined)).toEqual([
			"paid",
			"preparing",
		]);
	});

	it("fora da aba late, lateStatus é ignorado", () => {
		expect(effectiveTabStatuses(paidTab, "preparing")).toEqual(["paid"]);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test __tests__/orders-where.test.ts`
Expected: FAIL (`effectiveTabStatuses` não existe; `late_paid` undefined; `paid` = 3).

- [ ] **Step 3: Implementar em `orders-where.ts` (+ estreitar o tipo em `status-meta.ts`)**

0. Em `status-meta.ts` (linha 15), agora sim estreitar o tipo — nenhuma def usa mais "exclude" e o branch do builder morre neste mesmo commit:

```ts
export type TabLateness = "only";
```

1. `OrdersWhereFilters` ganha o campo (interface, linhas 41–48):

```ts
	lateStatus?: "paid" | "preparing";
```

2. Helper puro exportado + uso no builder. Adicionar antes de `buildOrdersListConditions`:

```ts
// Sub-aba de Atrasados: estreita o par paid/preparing pra um status só.
// Só tem efeito na tab computada (lateness "only") — nas demais é ignorado.
export function effectiveTabStatuses(
	tabDef: OrderTabDef,
	lateStatus?: "paid" | "preparing"
): readonly OrderStatus[] | null {
	if (tabDef.lateness === "only" && lateStatus) {
		return tabDef.statuses?.filter((s) => s === lateStatus) ?? null;
	}
	return tabDef.statuses;
}
```

Dentro de `buildOrdersListConditions`, trocar o bloco `if (tabDef.statuses) { ... }` por:

```ts
	const statuses = effectiveTabStatuses(tabDef, filters.lateStatus);
	if (statuses && statuses.length > 0) {
		const placeholders = sql.join(
			statuses.map((s) => sql`${s}`),
			sql`, `
		);
		conditions.push(sql`o.status IN (${placeholders})`);
	}
```

E **remover** o branch morto do exclude (nenhuma def usa mais):

```ts
	if (tabDef.lateness === "exclude") { ... }   // ← deletar
```

(o branch `lateness === "only"` permanece).

3. `OrderTabCounts` + `emptyTabCounts` ganham as chaves novas:

```ts
	late_paid: number;
	late_preparing: number;
```

(e `late_paid: 0, late_preparing: 0` no objeto de `emptyTabCounts`).

4. `foldTabCounts` — overlay. Substituir o corpo do `for` por:

```ts
	for (const row of rows) {
		counts.all_count += row.count;
		// Overlay (spec 2026-07-13): atrasado soma em `late` (+ sub-bucket) E
		// TAMBÉM no bucket do próprio status — por isso os `+=` no switch
		// (duas linhas por status: is_late true/false).
		if (row.is_late && (row.status === "paid" || row.status === "preparing")) {
			counts.late += row.count;
			if (row.status === "paid") {
				counts.late_paid += row.count;
			} else {
				counts.late_preparing += row.count;
			}
		}
		switch (row.status) {
			case "canceled":
			case "refunded":
				counts.canceled += row.count;
				break;
			case "pending_payment":
			case "payment_failed":
			case "paid":
			case "preparing":
			case "shipped":
			case "delivered":
			case "returned":
				counts[row.status] += row.count;
				break;
			default:
				break;
		}
	}
```

Atualizar o comentário acima da função: `late` soma paid/preparing atrasados; os buckets `paid`/`preparing` agora incluem os atrasados (overlay).

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test __tests__/orders-where.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_lib/orders-where.ts apps/web/src/app/dashboard/orders/status-meta.ts apps/web/src/app/dashboard/orders/__tests__/orders-where.test.ts
git commit -m "feat(orders): counts overlay e filtro lateStatus"
```

---

### Task 3: Encanamento do `lateStatus` (URL → query → export)

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/schema.ts:10-30`
- Modify: `apps/web/src/app/dashboard/orders/data.ts:51-59,309-349,600-620`
- Modify: `apps/web/src/app/dashboard/orders/page.tsx:77-95`
- Modify: `apps/web/src/app/dashboard/orders/export/route.ts:118-133`
- Modify: `apps/web/src/app/dashboard/orders/_components/export-csv-link.tsx`
- Test: `apps/web/src/app/dashboard/orders/__tests__/orders-filters-schema.test.ts` (novo)

**Interfaces:**
- Consumes: `OrdersWhereFilters.lateStatus` (Task 2).
- Produces: `ordersListFiltersSchema` aceita `lateStatus`; `OrderListFilters`/`OrdersPageFiltersInput` com `lateStatus?: "paid" | "preparing"` — a Task 4 lê `filters.lateStatus` no client.

- [ ] **Step 1: Teste do schema (falhará)**

Criar `apps/web/src/app/dashboard/orders/__tests__/orders-filters-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ordersListFiltersSchema } from "../schema";

describe("ordersListFiltersSchema — lateStatus", () => {
	it("aceita paid e preparing", () => {
		expect(
			ordersListFiltersSchema.parse({ tab: "late", lateStatus: "paid" })
				.lateStatus
		).toBe("paid");
		expect(
			ordersListFiltersSchema.parse({ lateStatus: "preparing" }).lateStatus
		).toBe("preparing");
	});

	it("rejeita valor fora do enum (página cai no default)", () => {
		expect(
			ordersListFiltersSchema.safeParse({ lateStatus: "shipped" }).success
		).toBe(false);
	});

	it("é opcional", () => {
		expect(ordersListFiltersSchema.parse({}).lateStatus).toBeUndefined();
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test __tests__/orders-filters-schema.test.ts`
Expected: FAIL (chave desconhecida é descartada → `lateStatus` undefined no primeiro `it`).

- [ ] **Step 3: Implementar o encanamento**

1. `schema.ts` — dentro do `z.object({...})` do `ordersListFiltersSchema`, após `productId`:

```ts
		// Sub-aba de Atrasados (?tab=late&lateStatus=paid) — spec 2026-07-13.
		lateStatus: z.enum(["paid", "preparing"]).optional(),
```

2. `data.ts` — adicionar `lateStatus?: "paid" | "preparing";` em **ambas** as interfaces `OrderListFilters` (linha ~51) e `OrdersPageFiltersInput` (linha ~309). Nos **dois** call sites de `buildOrdersListConditions` (em `fetchOrdersPage` ~linha 338 e em `fetchOrdersProductSummary` ~linha 614), adicionar ao objeto `filters`:

```ts
				lateStatus: filters.lateStatus,
```

3. `page.tsx` — nos objetos `filters` e `pageFilters`, após `toolId`:

```ts
		// Só faz sentido dentro da aba Atrasados; fora dela não propaga.
		lateStatus: activeTab === "late" ? data.lateStatus : undefined,
```

4. `export/route.ts` — no objeto `filters` do call de `buildOrdersListConditions` (linha ~121):

```ts
					lateStatus: filters.lateStatus,
```

5. `export-csv-link.tsx` — após o bloco do `productId`:

```ts
	if (filters.lateStatus) {
		params.set("lateStatus", filters.lateStatus);
	}
```

- [ ] **Step 4: Rodar testes + type-check**

Run: `bun --cwd apps/web test __tests__/orders-filters-schema.test.ts` → PASS
Run: `bun check-types --force` → PASS (o `--force` evita PASS velho do cache do turbo).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/schema.ts apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/orders/page.tsx apps/web/src/app/dashboard/orders/export/route.ts apps/web/src/app/dashboard/orders/_components/export-csv-link.tsx apps/web/src/app/dashboard/orders/__tests__/orders-filters-schema.test.ts
git commit -m "feat(orders): lateStatus da URL ao export"
```

---

### Task 4: Pills de sub-aba na aba Atrasados

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`

**Interfaces:**
- Consumes: `LATE_SUB_TABS`/`LateSubTabKey` (Task 1); `counts.late`/`late_paid`/`late_preparing` (Task 2); `filters.lateStatus` (Task 3).
- Produces: UI apenas — nada consumido por outras tasks.

- [ ] **Step 1: Implementar (componente client; sem teste unitário — verificação visual no Step 2)**

1. Imports: adicionar `LATE_SUB_TABS` e `type LateSubTabKey` ao import de `../status-meta`, e `cn` de `@emach/ui/lib/utils`.

2. `buildTabHref` ganha o 3º parâmetro opcional (só a aba late usa; trocar de aba descarta o filtro naturalmente):

```ts
function buildTabHref(
	filters: OrderListFilterState,
	tabKey: string,
	lateStatus?: LateSubTabKey
): string {
```

e, logo após o `params.set("tab", tabKey)`:

```ts
	if (tabKey === "late" && lateStatus && lateStatus !== "all") {
		params.set("lateStatus", lateStatus);
	}
```

3. Dentro de `OrderFiltersPanel`, depois do fechamento do `</Tabs>` e antes do `<FiltersBar>`, renderizar os pills (só na aba late). Contagens caem em `?? 0` — o `unstable_cache` dos counts (TTL 30s) pode servir por instantes um shape antigo sem as chaves novas:

```tsx
			{currentTab === "late" && (
				<div className="flex flex-wrap items-center gap-1.5">
					{LATE_SUB_TABS.map((sub) => {
						const isActive =
							sub.key === "all"
								? !filters.lateStatus
								: filters.lateStatus === sub.key;
						const count =
							sub.key === "all"
								? (counts.late ?? 0)
								: (counts[`late_${sub.key}`] ?? 0);
						return (
							<Link
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
									isActive
										? "border-warning/60 bg-warning/15 font-medium text-warning"
										: "border-border bg-muted text-muted-foreground hover:text-foreground"
								)}
								href={buildTabHref(filters, "late", sub.key)}
								key={sub.key}
							>
								{sub.label}
								<span className="font-mono text-[10.5px] tabular-nums">
									{count}
								</span>
							</Link>
						);
					})}
				</div>
			)}
```

- [ ] **Step 2: Smoke visual (o dev server já roda na porta 3006)**

Abrir `http://localhost:3006/dashboard/orders?tab=late`:
- Pills `Todos · Pagos · Em preparação` abaixo da barra, "Todos" ativo em âmbar, contagens em mono.
- Clicar "Pagos" → URL vira `?tab=late&lateStatus=paid`, lista só pagos, pill ativo muda.
- Clicar a aba "Pago" → `lateStatus` some da URL; nenhum pill nas outras abas.
- Barra na ordem `Todos · Pago · Em preparação · Enviados · Entregues · Atrasados`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx
git commit -m "feat(orders): pills de status na aba Atrasados"
```

---

### Task 5: Card — chip "ATRASADO" + badge de status na aba late

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_lib/display-state.ts`
- Modify: `apps/web/src/app/dashboard/orders/_components/order-card.tsx:62-84`
- Test: `apps/web/src/app/dashboard/orders/__tests__/display-state.test.ts`

**Interfaces:**
- Consumes: `latenessOf` (existente), `orderBadgeSource` (assinatura muda aqui).
- Produces: `orderBadgeSource(status, fulfillmentState, tabKey?)` — 3º parâmetro opcional; `tabKey === "late"` força `"status"`.

- [ ] **Step 1: Atualizar o teste (falhará)**

Adicionar ao `describe` de `display-state.test.ts`:

```ts
	it("na aba Atrasados o status manda, mesmo com sub-estado (spec 2026-07-13)", () => {
		expect(orderBadgeSource("preparing", "awaiting_picking", "late")).toBe(
			"status"
		);
		expect(orderBadgeSource("preparing", "picked", "late")).toBe("status");
		expect(orderBadgeSource("paid", null, "late")).toBe("status");
	});

	it("fora da aba Atrasados o comportamento não muda", () => {
		expect(orderBadgeSource("preparing", "picked", "preparing")).toBe(
			"fulfillment"
		);
		expect(orderBadgeSource("preparing", "picked", "all")).toBe("fulfillment");
	});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test __tests__/display-state.test.ts`
Expected: FAIL (assinatura de 2 parâmetros ignora o 3º → "fulfillment").

- [ ] **Step 3: Implementar**

1. `display-state.ts` — substituir `orderBadgeSource` por:

```ts
// Badge único do card (spec 2026-07-08): dentro de `preparing` o sub-estado
// da separação é mais informativo que o status; fora dele, o status manda.
// Nunca dois badges de estado no mesmo card.
// Exceção consciente (spec 2026-07-13): na aba Atrasados a pergunta é "em
// que etapa travou?" — o card mostra o status real; o sub-estado de picking
// vive na página Separação.
export function orderBadgeSource(
	status: OrderStatus,
	fulfillmentState: FulfillmentState | null | undefined,
	tabKey?: string
): "fulfillment" | "status" {
	if (tabKey === "late") {
		return "status";
	}
	return status === "preparing" && fulfillmentState ? "fulfillment" : "status";
}
```

2. `order-card.tsx` — no JSX do canto direito do header (linhas 62–75), passar a aba e adicionar o chip. Substituir o bloco:

```tsx
				<div className="flex flex-shrink-0 flex-col items-end gap-3">
					{orderBadgeSource(item.status, item.fulfillmentState) ===
						"fulfillment" && item.fulfillmentState ? (
```

por:

```tsx
				<div className="flex flex-shrink-0 flex-col items-end gap-3">
					<div className="flex items-center gap-1.5">
						{/* Chip de atraso: flag temporal, não segundo badge de estado
						    (spec 2026-07-13). Omitido na aba Atrasados — lá todos estão. */}
						{lateness === "late" && tabKey !== "late" && (
							<Badge
								className={cn(
									STATUS_BADGE_CAPS,
									"bg-warning text-warning-foreground"
								)}
							>
								Atrasado
							</Badge>
						)}
						{orderBadgeSource(item.status, item.fulfillmentState, tabKey) ===
							"fulfillment" && item.fulfillmentState ? (
```

e fechar o `<div>` novo logo após o `</Badge>`/`<OrderStatusBadge>` do ternário (antes do chip de transportadora):

```tsx
						) : (
							<OrderStatusBadge status={item.status} />
						)}
					</div>
```

(o restante — chip 🚚, `ShippingUnverifiedBadge` — fica como está, irmão do novo `<div>`).

- [ ] **Step 4: Rodar testes**

Run: `bun --cwd apps/web test __tests__/display-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Smoke visual**

- `?tab=paid`: cards atrasados com chip âmbar "ATRASADO" + badge "Pago" lado a lado, borda âmbar.
- `?tab=late`: **sem** chip; pedidos em preparação mostram badge "Em preparação" (não "Separado"/"A separar").
- `?tab=all`: pedido atrasado mostra o chip.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_lib/display-state.ts apps/web/src/app/dashboard/orders/_components/order-card.tsx apps/web/src/app/dashboard/orders/__tests__/display-state.test.ts
git commit -m "feat(orders): chip Atrasado e status real na aba late"
```

---

### Task 6: Docs + verificação final (3 provas)

**Files:**
- Modify: `apps/web/CLAUDE.md` (seção "Orders — filter-builder único")

**Interfaces:**
- Consumes: tudo acima.
- Produces: estado final verificado.

- [ ] **Step 1: Atualizar a doc que descreve a exclusividade antiga**

Em `apps/web/CLAUDE.md`, seção "Orders — filter-builder único (redesign 2026-07-10)", substituir a frase final:

> Tab `late` é computada (não é status): `paid`/`preparing` ≥72h desde `COALESCE(paid_at, created_at)`; tabs `paid`/`preparing` carregam a condição inversa — mexeu na regra, mexa em `_lib/lateness.ts` (48/72h) e nos counts juntos.

por:

> Tab `late` é computada (não é status): `paid`/`preparing` ≥72h desde `COALESCE(paid_at, created_at)`. É **overlay** (spec 2026-07-13): o pedido atrasado também segue nas tabs do próprio status, e a sub-aba `?lateStatus=paid|preparing` estreita a listagem dentro de `late`. Mexeu na regra, mexa em `_lib/lateness.ts` (48/72h) e no `foldTabCounts` juntos (`late_paid`/`late_preparing` alimentam os pills).

- [ ] **Step 2: Prova funcional**

Run: `bun verify` (raiz do monorepo)
Expected: check-types + check (ultracite) + test — tudo PASS. Warnings pré-existentes documentados no CLAUDE.md não contam como falha.

- [ ] **Step 3: Prova perceptual + de dados (browser, porta 3006)**

Com o seed atual do banco (28 pedidos, 10 atrasados na data do plano):
1. `?tab=paid` — badge da aba = nº de cards listados (inclui atrasados); atrasados com chip.
2. `?tab=late` — pills somam o total da aba (`Todos N = Pagos X + Em preparação Y`); badges de card mostram "Pago"/"Em preparação".
3. Screenshot lado a lado com os mockups aprovados em `.superpowers/brainstorm/152347-1783953346/content/` (chip = mockup B da 1ª tela; pills = variante A da 3ª).
4. Toast "N pedidos atrasados" segue apontando pra `?tab=late`.
5. Export CSV na aba late com pill "Pagos" ativo → arquivo só com pedidos `paid` (conferir coluna `status`).

- [ ] **Step 4: Commit final**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs: overlay de atrasados no mistakes-log de orders"
```
