# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/dashboard` num painel operacional com 6 KPIs, painéis de ação evoluídos, filtro global de filial e gráficos de tendência/contexto, construído sobre Cache Components do Next 16.

**Architecture:** Queries agregadas centralizadas em `packages/db/src/queries/dashboard.ts` (parametrizadas por `db`, sem `select *`, com coerção de timestamp). A página é um Server Component com seções em `<Suspense>` (streaming); cada gráfico é um client island recebendo dados já agregados. Filtro de filial via URL param lido em `searchParams`. Performance via `use cache` + `cacheTag`/`revalidateTag`.

**Tech Stack:** Next 16 (Cache Components), React 19 (+ React Compiler), shadcn chart (Recharts, já instalado), motion (NumberTicker copiado de magicui), drizzle.

**Pré-requisitos:** Plano de sidebar concluído (instala `motion`). Spec em `docs/superpowers/specs/2026-05-28-sidebar-dashboard-redesign-design.md`. Convenções de query em `packages/db/CLAUDE.md` (db.execute → snake_case + timestamp string; alias `AS "camelCase"`; `toDate`). Cache em `apps/web/CLAUDE.md` (`cacheTag` por feature; skill `next-cache-components`).

> **Branch-scoping:** os gates ADR-0012 estão no-op; o selector de filial é funcional (filtra queries) mas não impõe escopo por usuário até religar. Documentar no PR.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `packages/db/src/queries/dashboard.ts` (create) | Todas as queries agregadas (KPIs, séries, tabelas) + tipos exportados |
| `packages/db/src/queries/__tests__/dashboard-helpers.test.ts` (create) | Testes dos helpers puros (média móvel, ordenação de funil, bucketing) |
| `apps/web/src/app/dashboard/_lib/dashboard-params.ts` (create) | Parse/validação do `branch` param + tipo `DashboardParams` |
| `apps/web/src/app/dashboard/_lib/__tests__/dashboard-params.test.ts` (create) | Testes do parse de params |
| `apps/web/src/app/dashboard/_components/number-ticker.tsx` (create) | NumberTicker (magicui, copiado) com motion |
| `apps/web/src/app/dashboard/_components/kpi-card.tsx` (create) | Card de KPI individual (label, valor, subtexto, tom) |
| `apps/web/src/app/dashboard/_components/kpi-row.tsx` (create) | Linha de 6 KPIs (Server Component) |
| `apps/web/src/app/dashboard/_components/branch-filter.tsx` (create) | Selector de filial (client, escreve URL param) |
| `apps/web/src/app/dashboard/_components/charts/*.tsx` (create) | 1 client island por gráfico |
| `apps/web/src/app/dashboard/dashboard-data.ts` (create) | Fetchers cacheados (`use cache` + cacheTag) que chamam as queries |
| `apps/web/src/app/dashboard/page.tsx` (rewrite) | Layout com Suspense, branch filter, KPIs, painéis, charts |

---

## Task 1: Helpers puros das queries (TDD)

**Files:**
- Create: `packages/db/src/queries/dashboard.ts` (só os helpers neste task)
- Test: `packages/db/src/queries/__tests__/dashboard-helpers.test.ts`

- [ ] **Step 1: Testes dos helpers**

```ts
// packages/db/src/queries/__tests__/dashboard-helpers.test.ts
import { describe, expect, it } from "vitest";
import { movingAverage, ORDER_STATUS_FUNNEL, sortByFunnel } from "../dashboard";

describe("dashboard helpers", () => {
	it("movingAverage janela 3 calcula média trailing", () => {
		expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([1, 1.5, 2, 3, 4]);
	});
	it("sortByFunnel ordena pelo ciclo de vida, não alfabético", () => {
		const input = [
			{ status: "delivered", count: 1 },
			{ status: "pending_payment", count: 9 },
			{ status: "paid", count: 5 },
		];
		expect(sortByFunnel(input).map((r) => r.status)).toEqual([
			"pending_payment",
			"paid",
			"delivered",
		]);
	});
	it("ORDER_STATUS_FUNNEL tem a ordem canônica", () => {
		expect(ORDER_STATUS_FUNNEL[0]).toBe("pending_payment");
	});
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `cd packages/db && bun test dashboard-helpers`
Expected: FAIL ("Cannot find module ../dashboard").

- [ ] **Step 3: Implementar os helpers**

```ts
// packages/db/src/queries/dashboard.ts (início do arquivo)
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type AnyDb = NodePgDatabase<Record<string, unknown>>;

/** Ordem canônica do ciclo de vida (não a ordem de ADD VALUE do enum). */
export const ORDER_STATUS_FUNNEL = [
	"pending_payment",
	"paid",
	"preparing",
	"shipped",
	"delivered",
	"canceled",
	"refunded",
	"payment_failed",
	"returned",
] as const;

export function sortByFunnel<T extends { status: string }>(rows: T[]): T[] {
	const pos = (s: string) => {
		const i = ORDER_STATUS_FUNNEL.indexOf(s as (typeof ORDER_STATUS_FUNNEL)[number]);
		return i === -1 ? Number.MAX_SAFE_INTEGER : i;
	};
	return [...rows].sort((a, b) => pos(a.status) - pos(b.status));
}

/** Média móvel trailing (janela cresce até `window`). */
export function movingAverage(values: number[], window: number): number[] {
	return values.map((_, i) => {
		const start = Math.max(0, i - window + 1);
		const slice = values.slice(start, i + 1);
		return slice.reduce((a, b) => a + b, 0) / slice.length;
	});
}
```

- [ ] **Step 4: Rodar — deve passar**

Run: `cd packages/db && bun test dashboard-helpers`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/queries/dashboard.ts packages/db/src/queries/__tests__/dashboard-helpers.test.ts
git commit -m "feat: helpers puros das queries de dashboard (TDD)"
```

---

## Task 2: Queries agregadas (KPIs + séries + tabelas)

**Files:**
- Modify: `packages/db/src/queries/dashboard.ts` (adicionar as funções de query)

> Todas recebem `db: AnyDb` e `branchId: string | null`. SQL com colunas explícitas e alias `AS "camelCase"` onde o tipo é camelCase. Timestamps coeridos com `toDate`/`new Date`. Sem `select *`.

- [ ] **Step 1: KPIs (1 query consolidada)**

```ts
// packages/db/src/queries/dashboard.ts (append)
export interface DashboardKpis {
	revenueToday: number;
	activeOrders: number;
	pendingReviews: number;
	oldestPendingReviewHours: number | null;
	stockOutages: number;
	activeClients: number;
	activePromotions: number;
	promotionsExpiring7d: number;
}

export async function getDashboardKpis(db: AnyDb, branchId: string | null): Promise<DashboardKpis> {
	const branchFilter = branchId ? sql`AND o.branch_id = ${branchId}` : sql``;
	const stockBranchFilter = branchId ? sql`AND sl.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{
		revenue_today: string;
		active_orders: number;
		pending_reviews: number;
		oldest_pending_review_hours: string | null;
		stock_outages: number;
		active_clients: number;
		active_promotions: number;
		promotions_expiring_7d: number;
	}>(sql`
		SELECT
			(SELECT COALESCE(SUM(o.total_amount), 0) FROM "order" o
				WHERE o.status IN ('paid','preparing','shipped','delivered')
				AND o.created_at >= date_trunc('day', now()) ${branchFilter}) AS revenue_today,
			(SELECT COUNT(*)::int FROM "order" o
				WHERE o.status IN ('paid','preparing','shipped') ${branchFilter}) AS active_orders,
			(SELECT COUNT(*)::int FROM review WHERE status = 'pending') AS pending_reviews,
			(SELECT ROUND(EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 3600)::text
				FROM review WHERE status = 'pending') AS oldest_pending_review_hours,
			(SELECT COUNT(*)::int FROM stock_level sl WHERE sl.quantity = 0 ${stockBranchFilter}) AS stock_outages,
			(SELECT COUNT(*)::int FROM client WHERE status = 'active') AS active_clients,
			(SELECT COUNT(*)::int FROM promotion WHERE active = true
				AND (starts_at IS NULL OR starts_at <= now())
				AND (ends_at IS NULL OR ends_at > now())) AS active_promotions,
			(SELECT COUNT(*)::int FROM promotion WHERE active = true
				AND ends_at IS NOT NULL AND ends_at BETWEEN now() AND now() + INTERVAL '7 days') AS promotions_expiring_7d
	`);
	const r = res.rows[0];
	if (!r) {
		throw new Error("getDashboardKpis: 0 linhas");
	}
	return {
		revenueToday: Number(r.revenue_today),
		activeOrders: r.active_orders,
		pendingReviews: r.pending_reviews,
		oldestPendingReviewHours: r.oldest_pending_review_hours === null ? null : Number(r.oldest_pending_review_hours),
		stockOutages: r.stock_outages,
		activeClients: r.active_clients,
		activePromotions: r.active_promotions,
		promotionsExpiring7d: r.promotions_expiring_7d,
	};
}
```

> `total_amount` é `numeric` → chega como string via db.execute; coerço com `Number()`.

- [ ] **Step 2: Série de receita diária 30d**

```ts
// dashboard.ts (append)
export interface RevenuePoint { day: Date; revenue: number; movingAvg: number; }

export async function getDailyRevenue(db: AnyDb, branchId: string | null): Promise<RevenuePoint[]> {
	const branchFilter = branchId ? sql`AND o.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{ day: string; revenue: string }>(sql`
		SELECT date_trunc('day', o.created_at)::date AS day, COALESCE(SUM(o.total_amount), 0) AS revenue
		FROM "order" o
		WHERE o.status IN ('paid','preparing','shipped','delivered')
			AND o.created_at >= now() - INTERVAL '30 days' ${branchFilter}
		GROUP BY 1 ORDER BY 1 ASC
	`);
	const revenues = res.rows.map((r) => Number(r.revenue));
	const ma = movingAverage(revenues, 7);
	return res.rows.map((r, i) => ({ day: new Date(r.day), revenue: revenues[i], movingAvg: Number(ma[i].toFixed(2)) }));
}
```

- [ ] **Step 3: Funil de status**

```ts
// dashboard.ts (append)
export interface FunnelRow { status: string; count: number; }

export async function getOrderFunnel(db: AnyDb, branchId: string | null): Promise<FunnelRow[]> {
	const branchFilter = branchId ? sql`AND o.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{ status: string; count: number }>(sql`
		SELECT o.status, COUNT(*)::int AS count FROM "order" o
		WHERE o.created_at >= now() - INTERVAL '30 days' ${branchFilter}
		GROUP BY o.status
	`);
	return sortByFunnel(res.rows);
}
```

- [ ] **Step 4: Distribuição de notas, tabela de reposição, donut catálogo, novos clientes, donut promoções, entradas×saídas**

```ts
// dashboard.ts (append)
export interface RatingRow { rating: number; count: number; }
export async function getRatingDistribution(db: AnyDb): Promise<RatingRow[]> {
	const res = await db.execute<{ rating: number; count: number }>(sql`
		SELECT rating, COUNT(*)::int AS count FROM review
		WHERE status = 'approved' AND created_at >= now() - INTERVAL '30 days'
		GROUP BY rating ORDER BY rating ASC
	`);
	return res.rows;
}

export interface ReorderRow { branchName: string; toolName: string; sku: string; quantity: number; reorderPoint: number; deficit: number; }
export async function getReorderTable(db: AnyDb, branchId: string | null): Promise<ReorderRow[]> {
	const branchFilter = branchId ? sql`AND sl.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{ branch_name: string; tool_name: string; sku: string; quantity: number; reorder_point: number; deficit: number }>(sql`
		SELECT b.name AS branch_name, t.name AS tool_name, tv.sku, sl.quantity, sl.reorder_point,
			(sl.reorder_point - sl.quantity) AS deficit
		FROM stock_level sl
		JOIN branch b ON b.id = sl.branch_id
		JOIN tool_variant tv ON tv.id = sl.variant_id
		JOIN tool t ON t.id = tv.tool_id
		WHERE sl.quantity <= sl.reorder_point AND t.status IN ('active','out_of_stock') AND b.status = 'active' ${branchFilter}
		ORDER BY deficit DESC LIMIT 50
	`);
	return res.rows.map((r) => ({ branchName: r.branch_name, toolName: r.tool_name, sku: r.sku, quantity: r.quantity, reorderPoint: r.reorder_point, deficit: r.deficit }));
}

export interface StatusSlice { key: string; count: number; }
export async function getToolStatusBreakdown(db: AnyDb): Promise<StatusSlice[]> {
	const res = await db.execute<{ status: string; count: number }>(sql`
		SELECT status, COUNT(*)::int AS count FROM tool GROUP BY status ORDER BY count DESC
	`);
	return res.rows.map((r) => ({ key: r.status, count: r.count }));
}

export interface NewClientPoint { week: Date; count: number; }
export async function getNewClients(db: AnyDb): Promise<NewClientPoint[]> {
	const res = await db.execute<{ week: string; count: number }>(sql`
		SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS count FROM client
		WHERE created_at >= now() - INTERVAL '90 days' GROUP BY 1 ORDER BY 1 ASC
	`);
	return res.rows.map((r) => ({ week: new Date(r.week), count: r.count }));
}

export async function getPromotionStatusBreakdown(db: AnyDb): Promise<StatusSlice[]> {
	const res = await db.execute<{ key: string; count: number }>(sql`
		SELECT CASE
			WHEN active = false THEN 'inativa'
			WHEN starts_at IS NOT NULL AND starts_at > now() THEN 'agendada'
			WHEN ends_at IS NOT NULL AND ends_at <= now() THEN 'expirada'
			ELSE 'ativa' END AS key,
			COUNT(*)::int AS count
		FROM promotion GROUP BY 1
	`);
	return res.rows;
}

export interface StockFlowPoint { week: Date; entradas: number; saidas: number; }
export async function getStockFlow(db: AnyDb, branchId: string | null): Promise<StockFlowPoint[]> {
	const branchFilter = branchId ? sql`AND sm.branch_id = ${branchId}` : sql``;
	const res = await db.execute<{ week: string; entradas: number; saidas: number }>(sql`
		SELECT date_trunc('week', sm.created_at)::date AS week,
			COALESCE(SUM(sm.delta) FILTER (WHERE sm.delta > 0), 0)::int AS entradas,
			COALESCE(ABS(SUM(sm.delta) FILTER (WHERE sm.delta < 0)), 0)::int AS saidas
		FROM stock_movement sm
		WHERE sm.created_at >= now() - INTERVAL '12 weeks' ${branchFilter}
		GROUP BY 1 ORDER BY 1 ASC
	`);
	return res.rows.map((r) => ({ week: new Date(r.week), entradas: r.entradas, saidas: r.saidas }));
}

/** Lista de filiais para o selector. */
export interface BranchOption { id: string; name: string; }
export async function getBranchOptions(db: AnyDb): Promise<BranchOption[]> {
	const res = await db.execute<{ id: string; name: string }>(sql`
		SELECT id, name FROM branch WHERE status = 'active' ORDER BY name ASC
	`);
	return res.rows;
}
```

- [ ] **Step 5: Verificar tipos**

Run: `cd packages/db && bun check-types` (ou `bun check-types` na raiz se centralizado).
Expected: PASS.

- [ ] **Step 6: Atualizar barrel se necessário + smoke**

`queries/` não é re-exportado pelo barrel de schema; consumidores importam de `@emach/db/queries/dashboard`. Confirmar que o subpath export existe em `packages/db/package.json` (`./queries/*`). Se não, adicionar.

Smoke: criar script temporário ou rodar via rota (Task 7). Validar que nenhuma query lança (colunas/tabelas existem).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/queries/dashboard.ts packages/db/package.json
git commit -m "feat: queries agregadas do dashboard (KPIs, séries, tabelas)"
```

---

## Task 3: Parse de params do dashboard (TDD)

**Files:**
- Create: `apps/web/src/app/dashboard/_lib/dashboard-params.ts`
- Test: `apps/web/src/app/dashboard/_lib/__tests__/dashboard-params.test.ts`

- [ ] **Step 1: Teste**

```ts
// apps/web/src/app/dashboard/_lib/__tests__/dashboard-params.test.ts
import { describe, expect, it } from "vitest";
import { parseBranchParam } from "../dashboard-params";

describe("parseBranchParam", () => {
	it("retorna null para 'all' ou ausente", () => {
		expect(parseBranchParam(undefined)).toBeNull();
		expect(parseBranchParam("all")).toBeNull();
	});
	it("retorna o id quando string não-vazia", () => {
		expect(parseBranchParam("branch_123")).toBe("branch_123");
	});
	it("ignora array (pega o primeiro)", () => {
		expect(parseBranchParam(["b1", "b2"])).toBe("b1");
	});
});
```

- [ ] **Step 2: Rodar — falha** · Run: `cd apps/web && bun test dashboard-params` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// apps/web/src/app/dashboard/_lib/dashboard-params.ts
export function parseBranchParam(value: string | string[] | undefined): string | null {
	const v = Array.isArray(value) ? value[0] : value;
	if (!v || v === "all") {
		return null;
	}
	return v;
}
```

- [ ] **Step 4: Rodar — passa** · Run: `cd apps/web && bun test dashboard-params` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_lib/dashboard-params.ts apps/web/src/app/dashboard/_lib/__tests__/dashboard-params.test.ts
git commit -m "feat: parse do branch param do dashboard"
```

---

## Task 4: Fetchers cacheados (Cache Components)

**Files:**
- Create: `apps/web/src/app/dashboard/dashboard-data.ts`

> KPIs/tabela de reposição: dinâmicos (curto/none). Séries de tendência: `use cache` + `cacheLife` 10min + `cacheTag` por domínio. Mutations existentes já chamam `revalidateTag('orders'|'stock'|...)`.

- [ ] **Step 1: Implementar fetchers**

```ts
// apps/web/src/app/dashboard/dashboard-data.ts
import "server-only";
import { db } from "@emach/db";
import {
	getDailyRevenue, getDashboardKpis, getNewClients, getOrderFunnel,
	getPromotionStatusBreakdown, getRatingDistribution, getReorderTable,
	getStockFlow, getToolStatusBreakdown, getBranchOptions,
} from "@emach/db/queries/dashboard";

// KPIs — dinâmico (sem use cache) para refletir o dia em tempo (quase) real
export const fetchKpis = (branchId: string | null) => getDashboardKpis(db, branchId);
export const fetchReorderTable = (branchId: string | null) => getReorderTable(db, branchId);
export const fetchBranchOptions = () => getBranchOptions(db);

// Tendências — cacheadas por 10min, invalidadas por tag nas mutations
export async function fetchDailyRevenue(branchId: string | null) {
	"use cache";
	const { cacheLife, cacheTag } = await import("next/cache");
	cacheLife("minutes");
	cacheTag("orders");
	return getDailyRevenue(db, branchId);
}
export async function fetchOrderFunnel(branchId: string | null) {
	"use cache";
	const { cacheLife, cacheTag } = await import("next/cache");
	cacheLife("minutes");
	cacheTag("orders");
	return getOrderFunnel(db, branchId);
}
export async function fetchRatingDistribution() {
	"use cache";
	const { cacheLife, cacheTag } = await import("next/cache");
	cacheLife("minutes");
	cacheTag("reviews");
	return getRatingDistribution(db);
}
export async function fetchToolStatus() {
	"use cache";
	const { cacheLife, cacheTag } = await import("next/cache");
	cacheLife("hours");
	cacheTag("tools");
	return getToolStatusBreakdown(db);
}
export async function fetchNewClients() {
	"use cache";
	const { cacheLife, cacheTag } = await import("next/cache");
	cacheLife("hours");
	cacheTag("clients");
	return getNewClients(db);
}
export async function fetchPromotionStatus() {
	"use cache";
	const { cacheLife, cacheTag } = await import("next/cache");
	cacheLife("minutes");
	cacheTag("promotions");
	return getPromotionStatusBreakdown(db);
}
export async function fetchStockFlow(branchId: string | null) {
	"use cache";
	const { cacheLife, cacheTag } = await import("next/cache");
	cacheLife("minutes");
	cacheTag("stock");
	return getStockFlow(db, branchId);
}
```

> Confirmar na skill `next-cache-components` a forma correta de importar `cacheLife`/`cacheTag` (top-level `import { unstable_cacheLife }` vs `next/cache`). Ajustar nomes conforme a versão do Next 16 instalada (ver `find-docs`). O `branchId` como argumento de função `use cache` entra na chave de cache — comportamento desejado (cache por filial).

- [ ] **Step 2: Verificar tipos** · Run: `bun check-types` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/dashboard-data.ts
git commit -m "feat: fetchers cacheados do dashboard (Cache Components)"
```

---

## Task 5: NumberTicker + KPI cards (F1)

**Files:**
- Create: `apps/web/src/app/dashboard/_components/number-ticker.tsx`
- Create: `apps/web/src/app/dashboard/_components/kpi-card.tsx`
- Create: `apps/web/src/app/dashboard/_components/kpi-row.tsx`

- [ ] **Step 1: NumberTicker (magicui copiado, com reduced-motion)**

```tsx
// apps/web/src/app/dashboard/_components/number-ticker.tsx
"use client";

import { useReducedMotion } from "motion/react";
import { animate, useMotionValue, useTransform, motion } from "motion/react";
import { useEffect } from "react";

export function NumberTicker({
	value,
	format,
}: {
	value: number;
	format?: (n: number) => string;
}) {
	const reduce = useReducedMotion();
	const mv = useMotionValue(0);
	const display = useTransform(mv, (n) => (format ? format(n) : Math.round(n).toLocaleString("pt-BR")));

	useEffect(() => {
		if (reduce) {
			mv.set(value);
			return;
		}
		const controls = animate(mv, value, { duration: 0.6, ease: "easeOut" });
		return () => controls.stop();
	}, [value, reduce, mv]);

	return <motion.span>{display}</motion.span>;
}
```

- [ ] **Step 2: KpiCard**

```tsx
// apps/web/src/app/dashboard/_components/kpi-card.tsx
import { Card, CardContent } from "@emach/ui/components/card";
import { cn } from "@emach/ui/lib/utils";
import type { ReactNode } from "react";
import { NumberTicker } from "./number-ticker";

export function KpiCard({
	label, value, sub, tone = "default", format,
}: {
	label: string;
	value: number;
	sub?: ReactNode;
	tone?: "default" | "warning" | "destructive";
	format?: (n: number) => string;
}) {
	return (
		<Card className={cn(tone === "destructive" && "border-destructive/40", tone === "warning" && "border-amber-500/40")}>
			<CardContent className="flex flex-col gap-1 p-4">
				<p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
				<p className={cn("font-semibold text-2xl tabular-nums", tone === "destructive" && "text-destructive")}>
					<NumberTicker value={value} format={format} />
				</p>
				{sub && <p className="text-muted-foreground text-xs">{sub}</p>}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 3: KpiRow (Server Component)**

```tsx
// apps/web/src/app/dashboard/_components/kpi-row.tsx
import { fetchKpis } from "../dashboard-data";
import { KpiCard } from "./kpi-card";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function KpiRow({ branchId }: { branchId: string | null }) {
	const k = await fetchKpis(branchId);
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
			<KpiCard label="Receita do dia" value={k.revenueToday} format={brl} />
			<KpiCard label="Pedidos ativos" value={k.activeOrders} />
			<KpiCard
				label="Reviews pendentes" value={k.pendingReviews} tone={k.pendingReviews > 0 ? "warning" : "default"}
				sub={k.oldestPendingReviewHours != null ? `mais antiga: ${k.oldestPendingReviewHours}h` : undefined}
			/>
			<KpiCard label="Rupturas de estoque" value={k.stockOutages} tone={k.stockOutages > 0 ? "destructive" : "default"} />
			<KpiCard label="Clientes ativos" value={k.activeClients} />
			<KpiCard
				label="Promoções ativas" value={k.activePromotions}
				sub={k.promotionsExpiring7d > 0 ? `+${k.promotionsExpiring7d} expirando 7d` : undefined}
			/>
		</div>
	);
}
```

- [ ] **Step 4: Verificar tipos** · `bun check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/number-ticker.tsx apps/web/src/app/dashboard/_components/kpi-card.tsx apps/web/src/app/dashboard/_components/kpi-row.tsx
git commit -m "feat: KPI cards com NumberTicker (F1)"
```

---

## Task 6: Branch filter + montagem da página F1 (Suspense)

**Files:**
- Create: `apps/web/src/app/dashboard/_components/branch-filter.tsx`
- Rewrite: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Branch filter (client, escreve URL param)**

```tsx
// apps/web/src/app/dashboard/_components/branch-filter.tsx
"use client";

import {
	Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@emach/ui/components/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function BranchFilter({
	options, value,
}: {
	options: { id: string; name: string }[];
	value: string | null;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	const onChange = (next: string) => {
		const sp = new URLSearchParams(params.toString());
		if (next === "all") {
			sp.delete("branch");
		} else {
			sp.set("branch", next);
		}
		router.push(`${pathname}?${sp.toString()}`);
	};

	return (
		<Select value={value ?? "all"} onValueChange={onChange}>
			<SelectTrigger className="w-48">
				<SelectValue placeholder="Todas as filiais" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">Todas as filiais</SelectItem>
				{options.map((o) => (
					<SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
```

- [ ] **Step 2: Reescrever page.tsx (F1 — KPIs + painéis + filtro)**

```tsx
// apps/web/src/app/dashboard/page.tsx
import { Suspense } from "react";
import { Skeleton } from "@emach/ui/components/skeleton";
import { ActivityFeed } from "@/components/activity-feed";
import { PendingPanel, type PendingTab } from "@/components/pending-panel";
import { requireCurrentSession } from "@/lib/session";
import { parseBranchParam } from "./_lib/dashboard-params";
import { fetchBranchOptions } from "./dashboard-data";
import { BranchFilter } from "./_components/branch-filter";
import { KpiRow } from "./_components/kpi-row";
import {
	fetchDashboardActivity, fetchDashboardCounts, fetchPendingOrders,
	fetchPendingReviews, fetchPendingStock,
} from "./actions";

export default async function DashboardPage({
	searchParams,
}: {
	searchParams: Promise<{ branch?: string | string[] }>;
}) {
	const session = await requireCurrentSession();
	const sp = await searchParams;
	const branchId = parseBranchParam(sp.branch);
	const branchOptions = await fetchBranchOptions();

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-2 py-4">
			<section className="flex items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<p className="text-muted-foreground text-sm">Painel</p>
					<h1 className="font-medium font-serif text-3xl tracking-tight">
						Olá, {session.user.name?.split(" ")[0] ?? "admin"}
					</h1>
				</div>
				<BranchFilter options={branchOptions} value={branchId} />
			</section>

			<Suspense fallback={<KpiSkeleton />}>
				<KpiRow branchId={branchId} />
			</Suspense>

			<Suspense fallback={<Skeleton className="h-72 w-full" />}>
				<PendingSection branchId={branchId} />
			</Suspense>

			{/* F2/F3 charts entram aqui em tasks seguintes */}
		</main>
	);
}

function KpiSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
			{Array.from({ length: 6 }, (_, i) => (
				<Skeleton className="h-24 w-full" key={`kpi-skeleton-${i}`} />
			))}
		</div>
	);
}

async function PendingSection({ branchId }: { branchId: string | null }) {
	const [counts, stock, orders, reviews, activity] = await Promise.all([
		fetchDashboardCounts(),
		fetchPendingStock(null),
		fetchPendingOrders(null),
		fetchPendingReviews(null),
		fetchDashboardActivity(null),
	]);
	const tabs: PendingTab[] = [
		{ id: "stock", label: "Estoque", count: counts.stock, role: "warning", initial: stock.items, initialCursor: stock.nextCursor, fetchPage: fetchPendingStock },
		{ id: "orders", label: "Pedidos", count: counts.orders, role: "info", initial: orders.items, initialCursor: orders.nextCursor, fetchPage: fetchPendingOrders },
		{ id: "reviews", label: "Moderação", count: counts.reviews, role: "warning", initial: reviews.items, initialCursor: reviews.nextCursor, fetchPage: fetchPendingReviews },
	];
	return (
		<section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<PendingPanel compact tabs={tabs} />
			<div className="relative min-h-[18rem] min-w-0">
				<div className="absolute inset-0">
					<ActivityFeed fetchPage={fetchDashboardActivity} initialCursor={activity.nextCursor} initialEvents={activity.items} />
				</div>
			</div>
		</section>
	);
}
```

> A página deixa de ser `force-dynamic` (remover o export). Mantém o QUICK_ACTIONS antigo? Decisão: remover — os atalhos viram redundantes com a sidebar reagrupada (Estoque agora no menu). Se quiser manter, reintroduzir como seção secundária.

- [ ] **Step 3: Smoke run** · `bun dev:web` → `/dashboard`. KPIs animam, painéis carregam com streaming (skeleton → conteúdo), filtro de filial muda a URL e recarrega os KPIs. Trocar filial e ver `revenueToday`/`activeOrders`/`stockOutages` mudarem.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/_components/branch-filter.tsx apps/web/src/app/dashboard/page.tsx
git commit -m "feat: dashboard F1 — KPIs + painéis + filtro de filial (Suspense)"
```

---

## Task 7: Charts F2 (receita, funil, notas, tabela reposição)

**Files:**
- Create: `apps/web/src/app/dashboard/_components/charts/revenue-area.tsx`
- Create: `apps/web/src/app/dashboard/_components/charts/order-funnel.tsx`
- Create: `apps/web/src/app/dashboard/_components/charts/rating-bars.tsx`
- Create: `apps/web/src/app/dashboard/_components/reorder-table.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx` (montar F2 + wrappers Server que fazem fetch)

- [ ] **Step 1: RevenueArea (client island)**

```tsx
// apps/web/src/app/dashboard/_components/charts/revenue-area.tsx
"use client";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@emach/ui/components/chart";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

const config = {
	revenue: { label: "Receita", color: "var(--chart-1)" },
	movingAvg: { label: "Média 7d", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function RevenueArea({ data }: { data: { day: string; revenue: number; movingAvg: number }[] }) {
	return (
		<ChartContainer config={config} className="h-64 w-full">
			<AreaChart data={data}>
				<CartesianGrid vertical={false} />
				<XAxis dataKey="day" tickLine={false} axisLine={false} />
				<YAxis tickLine={false} axisLine={false} width={48} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Area dataKey="revenue" type="monotone" fill="var(--color-revenue)" fillOpacity={0.2} stroke="var(--color-revenue)" />
				<Line dataKey="movingAvg" type="monotone" stroke="var(--color-movingAvg)" dot={false} strokeDasharray="4 4" />
			</AreaChart>
		</ChartContainer>
	);
}
```

> Datas: formatar `day`/`week` como string `dd/MM` no Server wrapper antes de passar (Recharts eixo lida melhor com string curta). Usar `date-fns` (`format(d, "dd/MM")`), já instalado.

- [ ] **Step 2: OrderFunnel + RatingBars (mesma estrutura ChartContainer + BarChart)**

```tsx
// apps/web/src/app/dashboard/_components/charts/order-funnel.tsx
"use client";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@emach/ui/components/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const config = { count: { label: "Pedidos", color: "var(--chart-1)" } } satisfies ChartConfig;

export function OrderFunnel({ data }: { data: { status: string; count: number }[] }) {
	return (
		<ChartContainer config={config} className="h-64 w-full">
			<BarChart data={data} layout="vertical">
				<CartesianGrid horizontal={false} />
				<XAxis type="number" tickLine={false} axisLine={false} />
				<YAxis type="category" dataKey="status" width={96} tickLine={false} axisLine={false} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Bar dataKey="count" fill="var(--color-count)" radius={4} />
			</BarChart>
		</ChartContainer>
	);
}
```

```tsx
// apps/web/src/app/dashboard/_components/charts/rating-bars.tsx
"use client";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@emach/ui/components/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const config = { count: { label: "Avaliações", color: "var(--chart-3)" } } satisfies ChartConfig;

export function RatingBars({ data }: { data: { rating: number; count: number }[] }) {
	return (
		<ChartContainer config={config} className="h-64 w-full">
			<BarChart data={data}>
				<CartesianGrid vertical={false} />
				<XAxis dataKey="rating" tickFormatter={(v) => `${v}★`} tickLine={false} axisLine={false} />
				<YAxis tickLine={false} axisLine={false} width={32} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Bar dataKey="count" fill="var(--color-count)" radius={4} />
			</BarChart>
		</ChartContainer>
	);
}
```

- [ ] **Step 3: ReorderTable (server-friendly, sem chart)**

```tsx
// apps/web/src/app/dashboard/_components/reorder-table.tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@emach/ui/components/table";
import { cn } from "@emach/ui/lib/utils";
import Link from "next/link";
import type { ReorderRow } from "@emach/db/queries/dashboard";

export function ReorderTable({ rows }: { rows: ReorderRow[] }) {
	if (rows.length === 0) {
		return <p className="text-muted-foreground text-sm">Nenhum item abaixo do ponto de reposição.</p>;
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Filial</TableHead><TableHead>Ferramenta</TableHead><TableHead>SKU</TableHead>
					<TableHead className="text-right">Estoque</TableHead><TableHead className="text-right">Ponto</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((r) => (
					<TableRow key={`${r.sku}-${r.branchName}`} className={cn(r.quantity === 0 && "bg-destructive/5")}>
						<TableCell>{r.branchName}</TableCell>
						<TableCell><Link className="hover:underline" href="/dashboard/stock">{r.toolName}</Link></TableCell>
						<TableCell className="font-mono text-xs">{r.sku}</TableCell>
						<TableCell className={cn("text-right tabular-nums", r.quantity === 0 && "font-semibold text-destructive")}>{r.quantity}</TableCell>
						<TableCell className="text-right tabular-nums">{r.reorderPoint}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
```

- [ ] **Step 4: Montar F2 na page com wrappers Server + Suspense**

Adicionar à `page.tsx` (após PendingSection) Server Components que fazem o fetch cacheado e passam dados formatados:

```tsx
// page.tsx (append imports)
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@emach/ui/components/card";
import { fetchDailyRevenue, fetchOrderFunnel, fetchRatingDistribution, fetchReorderTable } from "./dashboard-data";
import { RevenueArea } from "./_components/charts/revenue-area";
import { OrderFunnel } from "./_components/charts/order-funnel";
import { RatingBars } from "./_components/charts/rating-bars";
import { ReorderTable } from "./_components/reorder-table";

// dentro do main, após PendingSection Suspense:
<Suspense fallback={<Skeleton className="h-64 w-full" />}>
	<TrendsSection branchId={branchId} />
</Suspense>

// helpers no fim do arquivo:
async function TrendsSection({ branchId }: { branchId: string | null }) {
	const [revenue, funnel, ratings, reorder] = await Promise.all([
		fetchDailyRevenue(branchId), fetchOrderFunnel(branchId), fetchRatingDistribution(), fetchReorderTable(branchId),
	]);
	const revenueData = revenue.map((p) => ({ day: format(p.day, "dd/MM"), revenue: p.revenue, movingAvg: p.movingAvg }));
	return (
		<div className="flex flex-col gap-4">
			<Card><CardHeader><CardTitle>Receita diária (30d)</CardTitle></CardHeader><CardContent><RevenueArea data={revenueData} /></CardContent></Card>
			<div className="grid gap-4 lg:grid-cols-2">
				<Card><CardHeader><CardTitle>Funil de pedidos</CardTitle></CardHeader><CardContent><OrderFunnel data={funnel} /></CardContent></Card>
				<Card><CardHeader><CardTitle>Distribuição de notas</CardTitle></CardHeader><CardContent><RatingBars data={ratings} /></CardContent></Card>
			</div>
			<Card><CardHeader><CardTitle>Itens para repor</CardTitle></CardHeader><CardContent><ReorderTable rows={reorder} /></CardContent></Card>
		</div>
	);
}
```

- [ ] **Step 5: Smoke run** · `/dashboard` mostra os 4 charts F2 com dados reais; trocar filial atualiza receita/funil/reposição. Verificar console sem erro de SQL (`nextjs_call 3001 get_errors`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/_components/charts apps/web/src/app/dashboard/_components/reorder-table.tsx apps/web/src/app/dashboard/page.tsx
git commit -m "feat: dashboard F2 — receita, funil, notas, tabela de reposição"
```

---

## Task 8: Charts F3 (donuts catálogo/promoções, novos clientes, entradas×saídas)

**Files:**
- Create: `apps/web/src/app/dashboard/_components/charts/status-donut.tsx` (reutilizável p/ catálogo e promoções)
- Create: `apps/web/src/app/dashboard/_components/charts/new-clients-line.tsx`
- Create: `apps/web/src/app/dashboard/_components/charts/stock-flow-area.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx` (montar F3)

- [ ] **Step 1: StatusDonut (genérico)**

```tsx
// apps/web/src/app/dashboard/_components/charts/status-donut.tsx
"use client";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@emach/ui/components/chart";
import { Cell, Pie, PieChart } from "recharts";

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function StatusDonut({ data, config }: { data: { key: string; count: number }[]; config: ChartConfig }) {
	return (
		<ChartContainer config={config} className="h-56 w-full">
			<PieChart>
				<ChartTooltip content={<ChartTooltipContent nameKey="key" />} />
				<Pie data={data} dataKey="count" nameKey="key" innerRadius={48} strokeWidth={2}>
					{data.map((entry, i) => (
						<Cell key={entry.key} fill={PALETTE[i % PALETTE.length]} />
					))}
				</Pie>
			</PieChart>
		</ChartContainer>
	);
}
```

- [ ] **Step 2: NewClientsLine + StockFlowArea**

```tsx
// apps/web/src/app/dashboard/_components/charts/new-clients-line.tsx
"use client";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@emach/ui/components/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

const config = { count: { label: "Novos clientes", color: "var(--chart-2)" } } satisfies ChartConfig;

export function NewClientsLine({ data }: { data: { week: string; count: number }[] }) {
	return (
		<ChartContainer config={config} className="h-56 w-full">
			<LineChart data={data}>
				<CartesianGrid vertical={false} />
				<XAxis dataKey="week" tickLine={false} axisLine={false} />
				<YAxis tickLine={false} axisLine={false} width={32} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Line dataKey="count" type="monotone" stroke="var(--color-count)" dot={false} />
			</LineChart>
		</ChartContainer>
	);
}
```

```tsx
// apps/web/src/app/dashboard/_components/charts/stock-flow-area.tsx
"use client";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@emach/ui/components/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const config = {
	entradas: { label: "Entradas", color: "var(--chart-2)" },
	saidas: { label: "Saídas", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function StockFlowArea({ data }: { data: { week: string; entradas: number; saidas: number }[] }) {
	return (
		<ChartContainer config={config} className="h-64 w-full">
			<AreaChart data={data}>
				<CartesianGrid vertical={false} />
				<XAxis dataKey="week" tickLine={false} axisLine={false} />
				<YAxis tickLine={false} axisLine={false} width={40} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Area dataKey="entradas" type="monotone" stackId="1" fill="var(--color-entradas)" fillOpacity={0.2} stroke="var(--color-entradas)" />
				<Area dataKey="saidas" type="monotone" stackId="2" fill="var(--color-saidas)" fillOpacity={0.2} stroke="var(--color-saidas)" />
			</AreaChart>
		</ChartContainer>
	);
}
```

- [ ] **Step 3: Montar F3 na page**

```tsx
// page.tsx (append)
import { fetchNewClients, fetchPromotionStatus, fetchStockFlow, fetchToolStatus } from "./dashboard-data";
import { StatusDonut } from "./_components/charts/status-donut";
import { NewClientsLine } from "./_components/charts/new-clients-line";
import { StockFlowArea } from "./_components/charts/stock-flow-area";

// no main:
<Suspense fallback={<Skeleton className="h-56 w-full" />}>
	<StrategicSection branchId={branchId} />
</Suspense>

// helper:
const TOOL_STATUS_CONFIG = {
	draft: { label: "Rascunho" }, active: { label: "Ativo" },
	out_of_stock: { label: "Sem estoque" }, discontinued: { label: "Descontinuado" },
};
const PROMO_STATUS_CONFIG = {
	ativa: { label: "Ativa" }, agendada: { label: "Agendada" },
	expirada: { label: "Expirada" }, inativa: { label: "Inativa" },
};

async function StrategicSection({ branchId }: { branchId: string | null }) {
	const [toolStatus, newClients, promoStatus, stockFlow] = await Promise.all([
		fetchToolStatus(), fetchNewClients(), fetchPromotionStatus(), fetchStockFlow(branchId),
	]);
	const clientsData = newClients.map((p) => ({ week: format(p.week, "dd/MM"), count: p.count }));
	const flowData = stockFlow.map((p) => ({ week: format(p.week, "dd/MM"), entradas: p.entradas, saidas: p.saidas }));
	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-4 lg:grid-cols-3">
				<Card><CardHeader><CardTitle>Ferramentas por status</CardTitle></CardHeader><CardContent><StatusDonut config={TOOL_STATUS_CONFIG} data={toolStatus} /></CardContent></Card>
				<Card><CardHeader><CardTitle>Novos clientes (90d)</CardTitle></CardHeader><CardContent><NewClientsLine data={clientsData} /></CardContent></Card>
				<Card><CardHeader><CardTitle>Status de promoções</CardTitle></CardHeader><CardContent><StatusDonut config={PROMO_STATUS_CONFIG} data={promoStatus} /></CardContent></Card>
			</div>
			<Card><CardHeader><CardTitle>Entradas × Saídas de estoque (12 sem)</CardTitle></CardHeader><CardContent><StockFlowArea data={flowData} /></CardContent></Card>
		</div>
	);
}
```

- [ ] **Step 4: Smoke run** · todos os charts F3 renderizam; filtro de filial afeta entradas×saídas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/charts apps/web/src/app/dashboard/page.tsx
git commit -m "feat: dashboard F3 — donuts, novos clientes, fluxo de estoque"
```

---

## Task 9: Code review + verificação final

- [ ] **Step 1: Suite + tipos** · `bun test && bun check-types` (raiz) → tudo verde.

- [ ] **Step 2: Revalidação de cache** · Confirmar que mutations de orders/stock/reviews/promotions já chamam `revalidateTag` com a tag correta; se alguma usa só `revalidatePath`, adicionar a tag equivalente para os charts cacheados atualizarem.

- [ ] **Step 3: Verificação visual completa** · Cada fase, com e sem filtro de filial, com `prefers-reduced-motion` ativo (NumberTicker deve setar valor direto, sem contagem).

- [ ] **Step 4: Performance** · DevTools → Network: confirmar que reabrir `/dashboard` (sem mutation) serve os charts do cache (resposta rápida, sem re-query pesada). Lighthouse opcional.

- [ ] **Step 5: `/code-review`** (effort medium) e aplicar simplificações inline.

- [ ] **Step 6: Commit final**

```bash
git add -A && git commit -m "chore: ajustes finais do dashboard pós-review"
```

---

## Self-Review (preenchido pelo autor do plano)

**Spec coverage:**
- 6 Hero KPIs → Tasks 2,5 ✅ · PendingPanel mantido → Task 6 ✅ · selector de filial URL param → Tasks 3,6 ✅ · Cache Components → Task 4 ✅ · Suspense streaming → Tasks 6,7,8 ✅ · F2 (receita/funil/notas/reposição) → Task 7 ✅ · F3 (donuts/clientes/fluxo) → Task 8 ✅ · NumberTicker (magicui) + reduced-motion → Task 5 ✅ · métricas vanity fora → respeitado (não implementadas aqui) ✅
- **Gap consciente:** evolução do PendingPanel para 4 abas (Promoções expirando) + split ruptura/repor com cores — descrito no spec §5.1 mas **não implementado** neste plano (Task 6 mantém as 3 abas atuais). Marcar como Task follow-up ou incremento; requer alterar `PendingPanel`/`fetchDashboardCounts` para separar `stockOutages` de `reorderCount` e nova aba `fetchExpiringPromotions`. **Decisão:** sai do caminho crítico F1; criar issue dedicada para não inflar este plano.

**Placeholders:** nenhum "TBD" de lógica; pontos "confirmar API do next/cache" são verificações de versão (find-docs na execução), não lacunas.

**Type consistency:** `ReorderRow`, `StatusSlice`, `RevenuePoint`, `FunnelRow`, `StockFlowPoint`, `BranchOption`, `DashboardKpis` definidos em `dashboard.ts` e reusados nos componentes via import. `parseBranchParam` mesma assinatura em params/page.
