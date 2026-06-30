# Dashboard: gráficos de monitoramento + filtros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Focar a `/dashboard` em monitorar Vendas, Pedidos e Estoque — cortar 4 gráficos secundários, adicionar filtro de período com Δ% vs. período anterior, e elevar o look dos gráficos com `motion`.

**Architecture:** Camada de dados (`packages/db/src/queries/dashboard.ts`) ganha um helper de período puro e queries period-aware + um `getDashboardSummary` com comparação de período. A `page.tsx` é recomposta no layout "principal + lateral" (Receita grande + Funil empilhado; Estoque agrupado), com os 4 gráficos cortados desplugados (arquivos preservados). Filtro de período novo via `?period=`. Motion aplicado de forma contida (AAA) via `motion` + `MotionConfig reducedMotion="user"`.

**Tech Stack:** Next 16 / React 19 (App Router, RSC), Drizzle (`db.execute` raw), recharts (via wrappers `@emach/ui`), `motion`, vitest (node env).

## Global Constraints

- **Sync ecommerce (ADR-0009):** `packages/db/src/queries/dashboard.ts` e qualquer arquivo novo em `queries/` é sincronizado por CI pro ecommerce. **Não importar de fora de `queries/`** (incidente #88). Mudança abre PR no ecommerce — esperado.
- **`db.execute` raw:** timestamp vem como **string**, colunas em **snake_case**. Aliasar `AS "camelCase"`, coercer `::date` com `localDate`. Nunca `SELECT *`.
- **`"use server"`:** só async functions podem ser exportadas. Reads/tipos ficam em `dashboard-data.ts` (`server-only`) ou módulos puros — nunca re-exportar não-async de `"use server"` (quebra só no `build`).
- **Sem PPR / sem `loading.tsx`** (ADR-0022): não habilitar `cacheComponents`.
- **AAA não-negociável:** contraste 7:1 body, status = ícone + label + cor (nunca só cor), `prefers-reduced-motion` respeitado em toda animação.
- **Tokens, nunca hex:** usar `--chart-1..5`, `bg-card`, `text-muted-foreground`, etc. (DESIGN.md).
- **Anti-patterns banidos:** sem `console.*` (usar `logger`), sem `: any`/`as any`, sem `key={index}`, `next/image` (não `<img>`), sem `useMemo`/`useCallback` manual (React Compiler ativo), sem barrel files novos.
- **Gate final:** `bun verify` (check-types + check + test) **e** `bun run build` passam. Smoke visual na 3008.

---

### Task 1: Helper de período + delta (puro, TDD)

Funções puras para mapear o período da UI em janela/bucket de SQL e calcular variação percentual. Ficam em `queries/` (superfície de sync), sem imports externos.

**Files:**
- Create: `packages/db/src/queries/dashboard-period.ts`
- Test: `packages/db/src/queries/__tests__/dashboard-period.test.ts`

**Interfaces:**
- Produces:
  - `type DashboardPeriod = "7d" | "30d" | "90d" | "12m"`
  - `const DASHBOARD_PERIODS: readonly DashboardPeriod[]`
  - `const DEFAULT_PERIOD: DashboardPeriod` (= `"30d"`)
  - `type PeriodBucket = "day" | "week" | "month"`
  - `periodToConfig(period: DashboardPeriod): { days: number; bucket: PeriodBucket; maWindow: number }`
  - `computeDeltaPct(current: number, previous: number): number | null` (null quando `previous === 0`; senão `((current - previous) / previous) * 100`, arredondado a 1 casa)

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/src/queries/__tests__/dashboard-period.test.ts
import { describe, expect, it } from "vitest";
import {
	computeDeltaPct,
	DASHBOARD_PERIODS,
	DEFAULT_PERIOD,
	periodToConfig,
} from "../dashboard-period";

describe("dashboard-period", () => {
	it("DEFAULT_PERIOD é 30d e está na lista", () => {
		expect(DEFAULT_PERIOD).toBe("30d");
		expect(DASHBOARD_PERIODS).toContain("30d");
	});
	it("periodToConfig mapeia janela e bucket adaptativo", () => {
		expect(periodToConfig("7d")).toEqual({ days: 7, bucket: "day", maWindow: 7 });
		expect(periodToConfig("30d")).toEqual({ days: 30, bucket: "day", maWindow: 7 });
		expect(periodToConfig("90d")).toEqual({ days: 90, bucket: "week", maWindow: 4 });
		expect(periodToConfig("12m")).toEqual({ days: 365, bucket: "month", maWindow: 3 });
	});
	it("computeDeltaPct: positivo, negativo e guarda divisão por zero", () => {
		expect(computeDeltaPct(110, 100)).toBe(10);
		expect(computeDeltaPct(90, 100)).toBe(-10);
		expect(computeDeltaPct(50, 0)).toBeNull();
		expect(computeDeltaPct(0, 0)).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd packages/db test dashboard-period`
Expected: FAIL — `Cannot find module "../dashboard-period"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/db/src/queries/dashboard-period.ts
// Helper puro de período da visão geral. Vive em queries/ (superfície de sync
// ecommerce, ADR-0009) — sem imports de fora de queries/.

export type DashboardPeriod = "7d" | "30d" | "90d" | "12m";
export type PeriodBucket = "day" | "week" | "month";

export const DASHBOARD_PERIODS: readonly DashboardPeriod[] = [
	"7d",
	"30d",
	"90d",
	"12m",
];

export const DEFAULT_PERIOD: DashboardPeriod = "30d";

const PERIOD_CONFIG: Record<
	DashboardPeriod,
	{ days: number; bucket: PeriodBucket; maWindow: number }
> = {
	"7d": { days: 7, bucket: "day", maWindow: 7 },
	"30d": { days: 30, bucket: "day", maWindow: 7 },
	"90d": { days: 90, bucket: "week", maWindow: 4 },
	"12m": { days: 365, bucket: "month", maWindow: 3 },
};

export function periodToConfig(period: DashboardPeriod) {
	return PERIOD_CONFIG[period];
}

export function computeDeltaPct(
	current: number,
	previous: number
): number | null {
	if (previous === 0) {
		return null;
	}
	return Math.round(((current - previous) / previous) * 1000) / 10;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd packages/db test dashboard-period`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/queries/dashboard-period.ts packages/db/src/queries/__tests__/dashboard-period.test.ts
git commit -m "feat(db): helper de período + delta para o dashboard"
```

---

### Task 2: Queries period-aware + getDashboardSummary

Parametrizar as 3 séries pelo período e criar a query de resumo (4 KPIs do núcleo com período corrente + anterior). SQL não é unit-testável (`db.execute`) — verificação por `check-types` + smoke (Task 8).

**Files:**
- Modify: `packages/db/src/queries/dashboard.ts`

**Interfaces:**
- Consumes: `periodToConfig`, `DashboardPeriod` (Task 1); `REVENUE_ORDER_STATUSES`, `ACTIVE_ORDER_STATUSES`, `sqlStatusList` (`./order-status-groups`); `localDate`, `movingAverage` (mesmo arquivo).
- Produces:
  - `getDailyRevenue(db, branchId, period)`, `getOrderFunnel(db, branchId, period)`, `getStockFlow(db, branchId, period)` — assinatura ganha `period: DashboardPeriod`.
  - `interface DashboardSummary { revenue: number; revenueDelta: number | null; activeOrders: number; stockOutages: number; ticket: number; ticketDelta: number | null; }`
  - `getDashboardSummary(db, branchId, period): Promise<DashboardSummary>`

- [ ] **Step 1: Importar o helper e adicionar `period` às 3 séries**

No topo do arquivo, somar ao import:

```ts
import {
	type DashboardPeriod,
	computeDeltaPct,
	periodToConfig,
} from "./dashboard-period";
```

Em `getDailyRevenue` — trocar a assinatura e a janela/bucket fixos:

```ts
export async function getDailyRevenue(
	db: AnyDb,
	branchId: string | null,
	period: DashboardPeriod
): Promise<RevenuePoint[]> {
	const { days, bucket, maWindow } = periodToConfig(period);
	const branchFilter = branchId ? sql`AND o.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{ day: string; revenue: string }>(sql`
		SELECT date_trunc(${bucket}, o.created_at)::date AS day,
			COALESCE(SUM(o.total_amount), 0) AS revenue
		FROM "order" o
		WHERE o.status IN (${sqlStatusList(REVENUE_ORDER_STATUSES)})
			AND o.created_at >= now() - make_interval(days => ${days}) ${branchFilter}
		GROUP BY 1 ORDER BY 1 ASC
	`);
	const revenues = res.rows.map((r) => Number(r.revenue));
	const ma = movingAverage(revenues, maWindow);
	return res.rows.map((r, i) => ({
		day: localDate(r.day),
		revenue: revenues[i] as number,
		movingAvg: Number(ma[i]?.toFixed(2) ?? 0),
	}));
}
```

Em `getOrderFunnel` — trocar assinatura e a janela fixa:

```ts
export async function getOrderFunnel(
	db: AnyDb,
	branchId: string | null,
	period: DashboardPeriod
): Promise<FunnelRow[]> {
	const { days } = periodToConfig(period);
	const branchFilter = branchId ? sql`AND o.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{ status: string; count: number }>(sql`
		SELECT o.status, COUNT(*)::int AS count FROM "order" o
		WHERE o.created_at >= now() - make_interval(days => ${days}) ${branchFilter}
		GROUP BY o.status
	`);
	return sortByFunnel(res.rows);
}
```

Em `getStockFlow` — trocar assinatura, janela e bucket (era sempre semanal):

```ts
export async function getStockFlow(
	db: AnyDb,
	branchId: string | null,
	period: DashboardPeriod
): Promise<StockFlowPoint[]> {
	const { days, bucket } = periodToConfig(period);
	const branchFilter = branchId ? sql`AND sm.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{
		week: string;
		entradas: number;
		saidas: number;
	}>(sql`
		SELECT date_trunc(${bucket}, sm.created_at)::date AS week,
			COALESCE(SUM(sm.delta) FILTER (WHERE sm.delta > 0), 0)::int AS entradas,
			COALESCE(ABS(SUM(sm.delta) FILTER (WHERE sm.delta < 0)), 0)::int AS saidas
		FROM stock_movement sm
		WHERE sm.created_at >= now() - make_interval(days => ${days}) ${branchFilter}
		GROUP BY 1 ORDER BY 1 ASC
	`);
	return res.rows.map((r) => ({
		week: localDate(r.week),
		entradas: r.entradas,
		saidas: r.saidas,
	}));
}
```

> Nota: `StockFlowPoint.week` mantém o nome `week` mesmo com bucket mensal/diário — é só o rótulo do eixo; renomear quebraria o componente sem ganho.

- [ ] **Step 2: Adicionar a interface e a query de resumo**

Junto às outras interfaces exportadas (perto de `DashboardKpis`):

```ts
export interface DashboardSummary {
	revenue: number;
	revenueDelta: number | null;
	activeOrders: number;
	stockOutages: number;
	ticket: number;
	ticketDelta: number | null;
}
```

Adicionar a função (pode ficar logo após `getDashboardKpis`):

```ts
// getDashboardSummary — 4 KPIs do núcleo (Receita, Pedidos ativos, Rupturas,
// Ticket médio) com período corrente vs. anterior de mesma duração.
export async function getDashboardSummary(
	db: AnyDb,
	branchId: string | null,
	period: DashboardPeriod
): Promise<DashboardSummary> {
	const { days } = periodToConfig(period);
	const branchFilter = branchId ? sql`AND o.branch_id = ${branchId}` : sql``;
	const stockBranchFilter = branchId
		? sql`AND sl.branch_id = ${branchId}`
		: sql``;
	const rev = sqlStatusList(REVENUE_ORDER_STATUSES);
	const active = sqlStatusList(ACTIVE_ORDER_STATUSES);
	const res = await db.execute<{
		revenue_cur: string;
		orders_cur: number;
		revenue_prev: string;
		orders_prev: number;
		active_orders: number;
		stock_outages: number;
	}>(sql`
		SELECT
			(SELECT COALESCE(SUM(o.total_amount), 0) FROM "order" o
				WHERE o.status IN (${rev})
				AND o.created_at >= now() - make_interval(days => ${days}) ${branchFilter}) AS revenue_cur,
			(SELECT COUNT(*)::int FROM "order" o
				WHERE o.status IN (${rev})
				AND o.created_at >= now() - make_interval(days => ${days}) ${branchFilter}) AS orders_cur,
			(SELECT COALESCE(SUM(o.total_amount), 0) FROM "order" o
				WHERE o.status IN (${rev})
				AND o.created_at >= now() - make_interval(days => ${days * 2})
				AND o.created_at < now() - make_interval(days => ${days}) ${branchFilter}) AS revenue_prev,
			(SELECT COUNT(*)::int FROM "order" o
				WHERE o.status IN (${rev})
				AND o.created_at >= now() - make_interval(days => ${days * 2})
				AND o.created_at < now() - make_interval(days => ${days}) ${branchFilter}) AS orders_prev,
			(SELECT COUNT(*)::int FROM "order" o
				WHERE o.status IN (${active}) ${branchFilter}) AS active_orders,
			(SELECT COUNT(*)::int FROM stock_level sl
				WHERE sl.quantity = 0 ${stockBranchFilter}) AS stock_outages
	`);
	const r = res.rows[0];
	if (!r) {
		throw new Error("getDashboardSummary: 0 linhas");
	}
	const revenueCur = Number(r.revenue_cur);
	const revenuePrev = Number(r.revenue_prev);
	const ticketCur = r.orders_cur > 0 ? revenueCur / r.orders_cur : 0;
	const ticketPrev = r.orders_prev > 0 ? revenuePrev / r.orders_prev : 0;
	return {
		revenue: revenueCur,
		revenueDelta: computeDeltaPct(revenueCur, revenuePrev),
		activeOrders: r.active_orders,
		stockOutages: r.stock_outages,
		ticket: ticketCur,
		ticketDelta: computeDeltaPct(ticketCur, ticketPrev),
	};
}
```

- [ ] **Step 3: Verificar tipos**

Run: `bun --cwd packages/db check-types` (ou `bun check-types` na raiz)
Expected: PASS. (Os call-sites em `dashboard-data.ts` vão acusar aridade — corrigidos na Task 3; se rodar a raiz inteira aqui, esperar erros lá. Rodar escopado no pacote db.)

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/queries/dashboard.ts
git commit -m "feat(db): queries de dashboard period-aware + getDashboardSummary"
```

---

### Task 3: Wrappers de dados + parser + filtro de período

Fiar o `period` nos wrappers `server-only`, criar o parser de URL e o componente de filtro.

**Files:**
- Modify: `apps/web/src/app/dashboard/dashboard-data.ts`
- Modify: `apps/web/src/app/dashboard/_lib/dashboard-params.ts`
- Create: `apps/web/src/app/dashboard/_components/period-filter.tsx`

**Interfaces:**
- Consumes: `getDashboardSummary`, `getDailyRevenue`, `getOrderFunnel`, `getStockFlow` (Task 2); `DashboardPeriod`, `DASHBOARD_PERIODS`, `DEFAULT_PERIOD` (Task 1); `useFilterState` (`@/lib/use-filter-state`).
- Produces:
  - `fetchDashboardSummary(branchId, period)`, e `fetchDailyRevenue/fetchOrderFunnel/fetchStockFlow` com `period`.
  - `parsePeriodParam(value): DashboardPeriod`
  - `<PeriodFilter value={DashboardPeriod} />`

- [ ] **Step 1: Atualizar `dashboard-data.ts`**

Trocar os wrappers afetados e adicionar o summary (manter os demais como estão). Importar o tipo:

```ts
import type { DashboardPeriod } from "@emach/db/queries/dashboard-period";
import {
	getBranchOptions,
	getDailyRevenue,
	getDashboardSummary,
	getOrderFunnel,
	getReorderTable,
	getStockFlow,
	// (getDashboardKpis, getNewClients, getRatingDistribution,
	//  getToolStatusBreakdown, getPromotionStatusBreakdown removidos dos imports
	//  — não são mais usados na overview; ver Task 5)
} from "@emach/db/queries/dashboard";
```

```ts
export const fetchDashboardSummary = (
	branchId: string | null,
	period: DashboardPeriod
) => getDashboardSummary(db, branchId, period);
export const fetchReorderTable = (branchId: string | null) =>
	getReorderTable(db, branchId);
export const fetchBranchOptions = () => getBranchOptions(db);
export const fetchDailyRevenue = (
	branchId: string | null,
	period: DashboardPeriod
) => getDailyRevenue(db, branchId, period);
export const fetchOrderFunnel = (
	branchId: string | null,
	period: DashboardPeriod
) => getOrderFunnel(db, branchId, period);
export const fetchStockFlow = (
	branchId: string | null,
	period: DashboardPeriod
) => getStockFlow(db, branchId, period);
```

> Remover `fetchKpis`, `fetchRatingDistribution`, `fetchToolStatus`, `fetchNewClients`, `fetchPromotionStatus` deste arquivo (não usados após a recuração). Se algum estiver importado em outro lugar além de `page.tsx`/`kpi-row.tsx`, manter — verificar com `rg "fetchToolStatus|fetchNewClients|fetchPromotionStatus|fetchRatingDistribution|fetchKpis" apps/web/src` antes de remover.

- [ ] **Step 2: Adicionar `parsePeriodParam`**

```ts
// apps/web/src/app/dashboard/_lib/dashboard-params.ts  (acrescentar)
import {
	DASHBOARD_PERIODS,
	type DashboardPeriod,
	DEFAULT_PERIOD,
} from "@emach/db/queries/dashboard-period";

export function parsePeriodParam(
	value: string | string[] | undefined
): DashboardPeriod {
	const v = Array.isArray(value) ? value[0] : value;
	return DASHBOARD_PERIODS.includes(v as DashboardPeriod)
		? (v as DashboardPeriod)
		: DEFAULT_PERIOD;
}
```

- [ ] **Step 3: Criar o `PeriodFilter`**

Toggle no padrão Tabs `default` do sistema (track `bg-muted` + ativa coral). Usa `useFilterState` (preserva `?branch=`).

```tsx
// apps/web/src/app/dashboard/_components/period-filter.tsx
"use client";

import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
import { usePathname } from "next/navigation";
import {
	DASHBOARD_PERIODS,
	type DashboardPeriod,
} from "@emach/db/queries/dashboard-period";
import { useFilterState } from "@/lib/use-filter-state";

const LABELS: Record<DashboardPeriod, string> = {
	"7d": "7 dias",
	"30d": "30 dias",
	"90d": "90 dias",
	"12m": "12 meses",
};

export function PeriodFilter({ value }: { value: DashboardPeriod }) {
	const pathname = usePathname();
	const { setParam } = useFilterState({ basePath: pathname });

	return (
		<Tabs
			onValueChange={(next) =>
				setParam("period", next === "30d" ? null : next)
			}
			value={value}
		>
			<TabsList>
				{DASHBOARD_PERIODS.map((p) => (
					<TabsTrigger key={p} value={p}>
						{LABELS[p]}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
```

> `30d` (default) limpa o param em vez de escrevê-lo — mantém a URL limpa no estado padrão, espelhando `BranchFilter` (`"all"` → null).

- [ ] **Step 4: Verificar tipos**

Run: `bun check-types`
Expected: PASS no `dashboard-data.ts` e nos novos arquivos. (Erros remanescentes em `page.tsx`/`kpi-row.tsx` são esperados — resolvidos nas Tasks 4–5; se quiser isolar, `rg` pelos call-sites.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/dashboard-data.ts apps/web/src/app/dashboard/_lib/dashboard-params.ts apps/web/src/app/dashboard/_components/period-filter.tsx
git commit -m "feat(web): wrappers period-aware + parser + PeriodFilter"
```

---

### Task 4: KpiCard com delta + KpiRow recurado

Estender o `KpiCard` para mostrar variação (ícone + sinal + cor), e recompor o `KpiRow` para os 4 KPIs do núcleo sobre `getDashboardSummary`.

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/kpi-card.tsx`
- Modify: `apps/web/src/app/dashboard/_components/kpi-row.tsx`
- Modify: `apps/web/src/app/dashboard/_lib/kpi-grid.ts`

**Interfaces:**
- Consumes: `fetchDashboardSummary` (Task 3); `DashboardPeriod` (Task 1); `NumberTicker`.
- Produces: `KpiCard` aceita `delta?: number | null`; `KpiRow({ branchId, period })` (sem `caps`).

- [ ] **Step 1: Estender `KpiCard` com delta**

```tsx
// apps/web/src/app/dashboard/_components/kpi-card.tsx
import { Card, CardContent } from "@emach/ui/components/card";
import { cn } from "@emach/ui/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { type NumberFormat, NumberTicker } from "./number-ticker";

function DeltaBadge({ delta }: { delta: number }) {
	const up = delta >= 0;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 font-medium text-xs tabular-nums",
				up ? "text-success" : "text-destructive"
			)}
		>
			{up ? (
				<TrendingUp aria-hidden className="size-3.5" />
			) : (
				<TrendingDown aria-hidden className="size-3.5" />
			)}
			{up ? "+" : ""}
			{delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
		</span>
	);
}

export function KpiCard({
	label,
	value,
	sub,
	delta,
	tone = "default",
	format,
}: {
	label: string;
	value: number;
	sub?: ReactNode;
	delta?: number | null;
	tone?: "default" | "warning" | "destructive";
	format?: NumberFormat;
}) {
	return (
		<Card
			className={cn(
				tone === "destructive" && "border-destructive/40",
				tone === "warning" && "border-amber-500/40"
			)}
		>
			<CardContent className="flex flex-col gap-1 p-4">
				<p className="text-muted-foreground text-xs uppercase tracking-wide">
					{label}
				</p>
				<p
					className={cn(
						"font-semibold text-2xl tabular-nums",
						tone === "destructive" && "text-destructive"
					)}
				>
					<NumberTicker format={format} value={value} />
				</p>
				{delta != null ? (
					<DeltaBadge delta={delta} />
				) : (
					sub && <p className="text-muted-foreground text-xs">{sub}</p>
				)}
			</CardContent>
		</Card>
	);
}
```

> Delta e `sub` são mutuamente exclusivos no layout (delta ganha a linha). Cor = `success`/`destructive` **com ícone** (TrendingUp/Down) — atende color-blindness (DESIGN.md §7).

- [ ] **Step 2: Recurar `KpiRow` para os 4 KPIs do núcleo**

```tsx
// apps/web/src/app/dashboard/_components/kpi-row.tsx
import { cn } from "@emach/ui/lib/utils";
import type { DashboardPeriod } from "@emach/db/queries/dashboard-period";
import { kpiGridClass } from "../_lib/kpi-grid";
import { fetchDashboardSummary } from "../dashboard-data";
import { KpiCard } from "./kpi-card";

export async function KpiRow({
	branchId,
	period,
}: {
	branchId: string | null;
	period: DashboardPeriod;
}) {
	const s = await fetchDashboardSummary(branchId, period);
	return (
		<div className={cn("grid grid-cols-2 gap-3", kpiGridClass(4))}>
			<KpiCard
				delta={s.revenueDelta}
				format="currency"
				label="Receita"
				value={s.revenue}
			/>
			<KpiCard label="Pedidos ativos" value={s.activeOrders} />
			<KpiCard
				label="Rupturas de estoque"
				tone={s.stockOutages > 0 ? "destructive" : "default"}
				value={s.stockOutages}
			/>
			<KpiCard
				delta={s.ticketDelta}
				format="currency"
				label="Ticket médio"
				value={s.ticket}
			/>
		</div>
	);
}
```

> Confirmar que `NumberFormat` aceita `"currency"` (`number-ticker.tsx`). Se o nome do formato divergir, usar o existente para moeda em BRL.

- [ ] **Step 3: Simplificar `kpi-grid.ts`**

O grid agora é sempre 4 cards fixos. Manter `kpiGridClass` (já tem entrada `4`), mas remover `KpiCaps`/`visibleKpiCount` se nada mais os usa:

```bash
rg "visibleKpiCount|KpiCaps" apps/web/src
```

Se só aparecerem em `page.tsx`/`kpi-row.tsx`/`kpi-grid.ts`, remover as duas exportações e o tipo `KpiCaps` do `kpi-grid.ts`, deixando só `kpiGridClass` + o mapa. Se aparecerem em outro lugar, manter.

- [ ] **Step 4: Verificar `NumberFormat`**

Run: `rg "NumberFormat|currency" apps/web/src/app/dashboard/_components/number-ticker.tsx`
Expected: confirma o identificador de formato de moeda. Ajustar o `format=` dos cards ao valor real.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/kpi-card.tsx apps/web/src/app/dashboard/_components/kpi-row.tsx apps/web/src/app/dashboard/_lib/kpi-grid.ts
git commit -m "feat(web): KPIs do núcleo com variação (delta)"
```

---

### Task 5: Recompor a página (layout C + cortes)

Recompor `page.tsx`: ler `period`, recurar o `KpiRow`, substituir `TrendsSection`/`StrategicSection` por `SalesOrdersSection` (Receita 2fr + Funil 1fr) e `StockSection` (Fluxo + Reposição), remover os imports/usos dos 4 gráficos cortados, e somar o `PeriodFilter` ao header.

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `fetchDailyRevenue/fetchOrderFunnel/fetchStockFlow` com `period` (Task 3), `fetchReorderTable`, `KpiRow({branchId, period})` (Task 4), `PeriodFilter` (Task 3), `parsePeriodParam` (Task 3); `RevenueArea`, `OrderFunnel`, `StockFlowArea` (lazy), `ReorderTable`, `PendingPanel`, `ActivityFeed`.

- [ ] **Step 1: Reescrever `page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Skeleton } from "@emach/ui/components/skeleton";
import { cn } from "@emach/ui/lib/utils";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { PendingPanel, type PendingTab } from "@/components/pending-panel";
import { formatDateShort } from "@/lib/format/datetime";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { BranchFilter } from "./_components/branch-filter";
import {
	OrderFunnel,
	RevenueArea,
	StockFlowArea,
} from "./_components/charts/lazy";
import { KpiRow } from "./_components/kpi-row";
import { PeriodFilter } from "./_components/period-filter";
import { ReorderTable } from "./_components/reorder-table";
import { parseBranchParam, parsePeriodParam } from "./_lib/dashboard-params";
import { kpiGridClass } from "./_lib/kpi-grid";
import {
	fetchDashboardActivity,
	fetchDashboardCounts,
	fetchExpiringPromotions,
	fetchPendingOrders,
	fetchPendingReviews,
	fetchPendingStock,
} from "./actions";
import {
	fetchBranchOptions,
	fetchDailyRevenue,
	fetchOrderFunnel,
	fetchReorderTable,
	fetchStockFlow,
} from "./dashboard-data";
import type { DashboardPeriod } from "@emach/db/queries/dashboard-period";

export const metadata: Metadata = {
	title: "Visão geral",
};

export default function DashboardPage({
	searchParams,
}: {
	searchParams: Promise<{ branch?: string | string[]; period?: string | string[] }>;
}) {
	return <DashboardPageContent searchParams={searchParams} />;
}

async function DashboardPageContent({
	searchParams,
}: {
	searchParams: Promise<{ branch?: string | string[]; period?: string | string[] }>;
}) {
	const session = await requireCurrentSession();
	const sp = await searchParams;
	const branchId = parseBranchParam(sp.branch);
	const period = parsePeriodParam(sp.period);

	const [canReadReviews, canReadPromotions] = await Promise.all([
		can(session, "reviews.read"),
		can(session, "promotions.read"),
	]);

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-2 py-4">
			<section className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<p className="text-muted-foreground text-sm">Painel</p>
					<h1 className="font-medium font-serif text-3xl tracking-tight">
						Olá, {session.user.name?.split(" ")[0] ?? "admin"}
					</h1>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<PeriodFilter value={period} />
					<Suspense fallback={<Skeleton className="h-9 w-48" />}>
						<BranchFilterSlot value={branchId} />
					</Suspense>
				</div>
			</section>

			<Suspense fallback={<KpiSkeleton />}>
				<KpiRow branchId={branchId} period={period} />
			</Suspense>

			<Suspense fallback={<Skeleton className="h-72 w-full" />}>
				<PendingSection
					canReadPromotions={canReadPromotions}
					canReadReviews={canReadReviews}
				/>
			</Suspense>

			<Suspense fallback={<Skeleton className="h-72 w-full" />}>
				<SalesOrdersSection branchId={branchId} period={period} />
			</Suspense>

			<Suspense fallback={<Skeleton className="h-64 w-full" />}>
				<StockSection branchId={branchId} period={period} />
			</Suspense>
		</main>
	);
}

async function BranchFilterSlot({ value }: { value: string | null }) {
	const options = await fetchBranchOptions();
	return <BranchFilter options={options} value={value} />;
}

function KpiSkeleton() {
	return (
		<div className={cn("grid grid-cols-2 gap-3", kpiGridClass(4))}>
			{Array.from({ length: 4 }, (_, i) => (
				<Skeleton className="h-24 w-full" key={`kpi-skeleton-${i}`} />
			))}
		</div>
	);
}

async function PendingSection({
	canReadReviews,
	canReadPromotions,
}: {
	canReadPromotions: boolean;
	canReadReviews: boolean;
}) {
	const [counts, stock, orders, activity, reviews, promos] = await Promise.all([
		fetchDashboardCounts(),
		fetchPendingStock(null),
		fetchPendingOrders(null),
		fetchDashboardActivity(null),
		canReadReviews ? fetchPendingReviews(null) : null,
		canReadPromotions ? fetchExpiringPromotions(null) : null,
	]);
	const tabs: PendingTab[] = [
		{
			id: "stock",
			label: "Estoque",
			count: counts.stock,
			role: "warning",
			initial: stock.items,
			initialCursor: stock.nextCursor,
			fetchPage: fetchPendingStock,
		},
		{
			id: "orders",
			label: "Pedidos",
			count: counts.orders,
			role: "info",
			initial: orders.items,
			initialCursor: orders.nextCursor,
			fetchPage: fetchPendingOrders,
		},
	];
	if (canReadReviews && reviews) {
		tabs.push({
			id: "reviews",
			label: "Moderação",
			count: counts.reviews,
			role: "warning",
			initial: reviews.items,
			initialCursor: reviews.nextCursor,
			fetchPage: fetchPendingReviews,
		});
	}
	if (canReadPromotions && promos) {
		tabs.push({
			id: "promotions",
			label: "Promoções",
			count: counts.promotionsExpiring,
			role: "warning",
			initial: promos.items,
			initialCursor: promos.nextCursor,
			fetchPage: fetchExpiringPromotions,
		});
	}
	return (
		<section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<PendingPanel tabs={tabs} />
			<div className="relative min-h-[18rem] min-w-0">
				<div className="absolute inset-0">
					<ActivityFeed
						fetchPage={fetchDashboardActivity}
						initialCursor={activity.nextCursor}
						initialEvents={activity.items}
					/>
				</div>
			</div>
		</section>
	);
}

// Layout C: Receita grande (2fr) + Funil empilhado (1fr).
async function SalesOrdersSection({
	branchId,
	period,
}: {
	branchId: string | null;
	period: DashboardPeriod;
}) {
	const [revenue, funnel] = await Promise.all([
		fetchDailyRevenue(branchId, period),
		fetchOrderFunnel(branchId, period),
	]);
	const revenueData = revenue.map((p) => ({
		day: formatDateShort(p.day),
		revenue: p.revenue,
		movingAvg: p.movingAvg,
	}));
	return (
		<section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
			<Card>
				<CardHeader>
					<CardTitle>Receita</CardTitle>
				</CardHeader>
				<CardContent>
					<RevenueArea data={revenueData} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Funil de pedidos</CardTitle>
				</CardHeader>
				<CardContent>
					<OrderFunnel data={funnel} />
				</CardContent>
			</Card>
		</section>
	);
}

// Estoque: Fluxo + Reposição lado a lado, em section band (ritmo vertical).
async function StockSection({
	branchId,
	period,
}: {
	branchId: string | null;
	period: DashboardPeriod;
}) {
	const [stockFlow, reorder] = await Promise.all([
		fetchStockFlow(branchId, period),
		fetchReorderTable(branchId),
	]);
	const flowData = stockFlow.map((p) => ({
		week: formatDateShort(p.week),
		entradas: p.entradas,
		saidas: p.saidas,
	}));
	return (
		<section className="-mx-6 grid gap-4 border-y border-border bg-muted/50 px-6 py-10 lg:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle>Entradas × Saídas de estoque</CardTitle>
				</CardHeader>
				<CardContent>
					<StockFlowArea data={flowData} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Itens para repor</CardTitle>
				</CardHeader>
				<CardContent>
					<ReorderTable rows={reorder} />
				</CardContent>
			</Card>
		</section>
	);
}
```

> Os 4 gráficos cortados (`RatingBars`, `StatusDonut`, `NewClientsLine`) e os configs `TOOL_STATUS_CONFIG`/`PROMO_STATUS_CONFIG` somem da `page.tsx`. Os arquivos dos componentes (`charts/rating-bars.tsx`, `charts/status-donut.tsx`, `charts/new-clients-line.tsx`) e as exports em `charts/lazy.tsx` **permanecem** (base da futura `/relatorios`) — não importados, não quebram lint.

- [ ] **Step 2: Verificar tipos do app inteiro**

Run: `bun check-types`
Expected: PASS. Resolver qualquer import órfão remanescente (`ChartConfig`, `TOOL_STATUS_LABELS`, `formatDateShort` se não usado, etc.).

- [ ] **Step 3: Lint**

Run: `bun check`
Expected: PASS (sem import não-usado, sem `key={index}` — o `KpiSkeleton`/flow usam keys estáveis).

- [ ] **Step 4: Smoke visual**

Run: servidor já roda na 3008. Abrir `http://localhost:3008/dashboard`.
Expected: 4 KPIs com delta, Receita grande + Funil ao lado, banda de Estoque (Fluxo + Reposição), Pendências/Atividade. Sem os 4 gráficos cortados. Trocar `?period=7d|90d|12m` e `?branch=` refiltra.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx
git commit -m "feat(web): recompõe visão geral (layout C) + corta gráficos secundários"
```

---

### Task 6: Elevar o look dos gráficos (rico)

Aplicar o tratamento "rico" aos 3 gráficos do núcleo: gradiente coral no fill, grid de referência sutil, linha de tendência rotulada genérica, tooltip já presente. Tokens only.

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/charts/revenue-area.tsx`
- Modify: `apps/web/src/app/dashboard/_components/charts/stock-flow-area.tsx`

**Interfaces:**
- Consumes: dados das séries (Task 5). Sem mudança de assinatura de props.

- [ ] **Step 1: Elevar `RevenueArea` (gradiente + tendência)**

```tsx
// apps/web/src/app/dashboard/_components/charts/revenue-area.tsx
"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

const config = {
	revenue: { label: "Receita", color: "var(--chart-1)" },
	movingAvg: { label: "Tendência", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function RevenueArea({
	data,
}: {
	data: { day: string; revenue: number; movingAvg: number }[];
}) {
	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<AreaChart data={data}>
				<defs>
					<linearGradient id="fill-revenue" x1="0" x2="0" y1="0" y2="1">
						<stop
							offset="0%"
							stopColor="var(--color-revenue)"
							stopOpacity={0.42}
						/>
						<stop
							offset="100%"
							stopColor="var(--color-revenue)"
							stopOpacity={0.02}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis axisLine={false} dataKey="day" tickLine={false} />
				<YAxis axisLine={false} tickLine={false} width={48} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Area
					dataKey="revenue"
					fill="url(#fill-revenue)"
					stroke="var(--color-revenue)"
					strokeWidth={2.5}
					type="monotone"
				/>
				<Line
					dataKey="movingAvg"
					dot={false}
					isAnimationActive={false}
					stroke="var(--color-movingAvg)"
					strokeDasharray="4 4"
					type="monotone"
				/>
			</AreaChart>
		</ChartContainer>
	);
}
```

> Manter o comentário sobre `isAnimationActive={false}` na linha tracejada (já existia — a animação de desenho do recharts conflita com `strokeDasharray`).

- [ ] **Step 2: Elevar `StockFlowArea` (gradientes duplos)**

```tsx
// apps/web/src/app/dashboard/_components/charts/stock-flow-area.tsx
"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const config = {
	entradas: { label: "Entradas", color: "var(--chart-4)" },
	saidas: { label: "Saídas", color: "var(--chart-5)" },
} satisfies ChartConfig;

export function StockFlowArea({
	data,
}: {
	data: { week: string; entradas: number; saidas: number }[];
}) {
	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<AreaChart data={data}>
				<defs>
					<linearGradient id="fill-entradas" x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%" stopColor="var(--color-entradas)" stopOpacity={0.4} />
						<stop offset="100%" stopColor="var(--color-entradas)" stopOpacity={0.02} />
					</linearGradient>
					<linearGradient id="fill-saidas" x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%" stopColor="var(--color-saidas)" stopOpacity={0.4} />
						<stop offset="100%" stopColor="var(--color-saidas)" stopOpacity={0.02} />
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis axisLine={false} dataKey="week" tickLine={false} />
				<YAxis axisLine={false} tickLine={false} width={40} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Area
					dataKey="entradas"
					fill="url(#fill-entradas)"
					stackId="1"
					stroke="var(--color-entradas)"
					strokeWidth={2}
					type="monotone"
				/>
				<Area
					dataKey="saidas"
					fill="url(#fill-saidas)"
					stackId="2"
					stroke="var(--color-saidas)"
					strokeWidth={2}
					type="monotone"
				/>
			</AreaChart>
		</ChartContainer>
	);
}
```

> `entradas` = jade (`--chart-4`, positivo), `saidas` = vermelho (`--chart-5`, saída) — semântica de cor coerente com o sistema. `OrderFunnel` já está com o look limpo (barras coral, grid horizontal); não precisa mudar.

- [ ] **Step 3: Smoke visual**

Abrir `http://localhost:3008/dashboard`. Conferir gradiente coral na Receita, tendência tracejada, gradientes jade/vermelho no Fluxo. Hover mostra tooltip.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/_components/charts/revenue-area.tsx apps/web/src/app/dashboard/_components/charts/stock-flow-area.tsx
git commit -m "feat(web): look rico nos gráficos do núcleo"
```

---

### Task 7: Motion (entrada contida + reduced-motion)

Instalar `motion` e aplicar uma entrada em cascata leve nos KPIs e seções, herdando `prefers-reduced-motion`. Contido por design (register product: motion transmite estado, não orquestra page-load decorativo).

**Files:**
- Modify: `apps/web/package.json` (dep)
- Create: `apps/web/src/app/dashboard/_components/stagger.tsx`
- Modify: `apps/web/src/app/dashboard/_components/kpi-row.tsx`

**Interfaces:**
- Produces: `<StaggerGrid className?>` e `<StaggerItem>` (client, motion); herdam reduced-motion.

- [ ] **Step 1: Instalar `motion`**

Run: `bun add motion --cwd apps/web`
Expected: `motion` em `apps/web/package.json > dependencies`. (Uso exclusivo do web — sem catalog.)

- [ ] **Step 2: Criar o wrapper de stagger**

```tsx
// apps/web/src/app/dashboard/_components/stagger.tsx
"use client";

import { cn } from "@emach/ui/lib/utils";
import { MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";

const container = {
	hidden: {},
	show: { transition: { staggerChildren: 0.05 } },
};
const item = {
	hidden: { opacity: 0, y: 8 },
	show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

export function StaggerGrid({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<MotionConfig reducedMotion="user">
			<motion.div
				animate="show"
				className={cn(className)}
				initial="hidden"
				variants={container}
			>
				{children}
			</motion.div>
		</MotionConfig>
	);
}

export function StaggerItem({ children }: { children: ReactNode }) {
	return <motion.div variants={item}>{children}</motion.div>;
}
```

> `reducedMotion="user"` faz o `motion` respeitar `prefers-reduced-motion` automaticamente (transforma em crossfade/instantâneo). Alinha ao reset global de transitions (DESIGN.md §7). `y: 8` é sutil — realça um default já visível, não esconde conteúdo (não gateia visibilidade).

- [ ] **Step 3: Aplicar stagger no `KpiRow`**

Envolver os 4 cards no grid de stagger (o `KpiRow` é server, mas pode renderizar os wrappers client passando children):

```tsx
// apps/web/src/app/dashboard/_components/kpi-row.tsx  (só o return muda)
import { StaggerGrid, StaggerItem } from "./stagger";
// ...
	return (
		<StaggerGrid className={cn("grid grid-cols-2 gap-3", kpiGridClass(4))}>
			<StaggerItem>
				<KpiCard delta={s.revenueDelta} format="currency" label="Receita" value={s.revenue} />
			</StaggerItem>
			<StaggerItem>
				<KpiCard label="Pedidos ativos" value={s.activeOrders} />
			</StaggerItem>
			<StaggerItem>
				<KpiCard
					label="Rupturas de estoque"
					tone={s.stockOutages > 0 ? "destructive" : "default"}
					value={s.stockOutages}
				/>
			</StaggerItem>
			<StaggerItem>
				<KpiCard delta={s.ticketDelta} format="currency" label="Ticket médio" value={s.ticket} />
			</StaggerItem>
		</StaggerGrid>
	);
```

- [ ] **Step 4: Verificar tipos + smoke + reduced-motion**

Run: `bun check-types && bun check`
Expected: PASS.
Smoke: recarregar `/dashboard` na 3008 — os KPIs entram em cascata curta. Em DevTools → Rendering → `prefers-reduced-motion: reduce`, a cascata vira aparição instantânea (sem deslocamento).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/app/dashboard/_components/stagger.tsx apps/web/src/app/dashboard/_components/kpi-row.tsx bun.lock
git commit -m "feat(web): entrada animada dos KPIs com motion (reduced-motion safe)"
```

---

### Task 8: Empty states + verificação final

Garantir estados vazios que ensinam (baixo volume / período sem dado) e fechar o gate completo.

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/charts/revenue-area.tsx`, `order-funnel.tsx`, `stock-flow-area.tsx` (guard de dados vazios)

**Interfaces:**
- Consumes: tudo das tasks anteriores.

- [ ] **Step 1: Empty state nos 3 gráficos**

No início de cada componente de chart, antes do `return` do `ChartContainer`, adicionar o guard (exemplo para `RevenueArea`; replicar com a mensagem do domínio em cada):

```tsx
	if (data.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
				Sem vendas no período
			</div>
		);
	}
```

Mensagens por componente: `RevenueArea` → "Sem vendas no período"; `OrderFunnel` → "Nenhum pedido no período"; `StockFlowArea` → "Sem movimentações no período". (Ensina, não diz "vazio" — register product.)

- [ ] **Step 2: Smoke do caminho vazio**

Com o seed atual (17 pedidos em mai–jun), `?period=7d` numa filial específica provavelmente zera alguma série. Abrir `http://localhost:3008/dashboard?period=7d&branch=<id>` e conferir que os gráficos sem dado mostram a mensagem, não erro nem eixo vazio. Pegar um `<id>` de filial pelo seletor.

- [ ] **Step 3: Gate completo**

```bash
bun verify        # check-types + check + test (apps/web)
bun --cwd packages/db test   # cobre dashboard-period
bun run build     # gate de "use server" / SQL
```
Expected: tudo PASS. Se `build` acusar `Only async functions...`, revisar que nada não-async foi exportado de `"use server"`.

- [ ] **Step 4: Smoke matricial final**

Na 3008, varrer `period ∈ {7d,30d,90d,12m} × branch ∈ {todas, uma}`: os 3 gráficos e os 4 KPIs (com Δ) refiltram coerentemente; reduced-motion ok; AAA (foco visível, contraste do delta).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/charts/revenue-area.tsx apps/web/src/app/dashboard/_components/charts/order-funnel.tsx apps/web/src/app/dashboard/_components/charts/stock-flow-area.tsx
git commit -m "feat(web): empty states dos gráficos do dashboard"
```

---

## Notas de verificação cruzada com o spec

- **Cortar 4 gráficos** → Task 5 (desplugados; arquivos preservados).
- **Núcleo Vendas/Pedidos/Estoque elevado** → Tasks 5 (layout) + 6 (look).
- **KPIs número+Δ** → Tasks 2 (summary) + 4 (card).
- **Filtro de período + agregação adaptativa** → Tasks 1 (config) + 2 (queries) + 3 (filtro UI).
- **Layout C** → Task 5.
- **Look rico** → Task 6.
- **motion + reduced-motion** → Task 7.
- **Empty states / baixo volume** → Task 8.
- **Gotchas** (sync ecommerce, db.execute, localDate, sem PPR, "use server", AAA) → Global Constraints + verificação por task.

## Decisão deixada ao executor

- **`getDashboardKpis` original:** após a Task 4, conferir `rg "getDashboardKpis|fetchKpis" apps/web/src packages/db/src` — se nada consome, removê-lo de `dashboard.ts` e `dashboard-data.ts` num commit de limpeza; senão, manter. (As queries `getNewClients/getRatingDistribution/get*StatusBreakdown` **ficam** — base da futura `/relatorios`.)
