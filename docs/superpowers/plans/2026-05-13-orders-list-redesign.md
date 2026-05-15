# Orders List Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 3 KPI cards no topo de `/dashboard/orders`, coluna "Itens" na tabela, polish nas Tabs e remover "Voltar ao painel" do header — preservando PendingList + ActivityFeed.

**Architecture:** Estender `orders/data.ts` com `getOrderKpis` (uma query agregada). Criar `OrderKpisRow` componente. Modificar `page.tsx` para `Promise.all` incluindo KPIs e renderizar a row acima das pendências. Adicionar `itemsCount` à query de `fetchOrdersPage` + à tabela. Refazer Tabs em `order-list-filters.tsx` para count inline.

**Tech Stack:** Next 16 RSC, Drizzle ORM 0.45 + node-postgres, Tailwind 4, shadcn Card/Tabs.

Spec de referência: `docs/superpowers/specs/2026-05-13-orders-list-redesign-design.md`.

Sem testes unitários novos — verificação via type-check + smoke `bun dev:web`.

---

### Task 1: `getOrderKpis` em `data.ts`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/data.ts`

- [ ] **Step 1: Append interface + function at the end of file**

```ts
export interface OrderKpis {
	revenueToday: number;
	revenueYesterday: number;
	averageTicket: number;
	paidPercent: number;
}

export async function getOrderKpis(): Promise<OrderKpis> {
	const result = await db.execute<{
		revenue_today: string | null;
		revenue_yesterday: string | null;
		average_ticket: string | null;
		paid_percent: string | null;
	}>(sql`
		SELECT
			SUM(total_amount) FILTER (
				WHERE status IN ('paid', 'preparing', 'shipped', 'delivered')
				AND created_at::date = CURRENT_DATE
			) AS revenue_today,
			SUM(total_amount) FILTER (
				WHERE status IN ('paid', 'preparing', 'shipped', 'delivered')
				AND created_at::date = CURRENT_DATE - INTERVAL '1 day'
			) AS revenue_yesterday,
			AVG(total_amount) FILTER (
				WHERE status IN ('paid', 'preparing', 'shipped', 'delivered')
				AND created_at > now() - INTERVAL '30 days'
			) AS average_ticket,
			CASE
				WHEN COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days') = 0 THEN 0
				ELSE (
					COUNT(*) FILTER (
						WHERE status IN ('paid', 'preparing', 'shipped', 'delivered')
						AND created_at > now() - INTERVAL '30 days'
					)::numeric
					/ COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days')::numeric
					* 100
				)
			END AS paid_percent
		FROM "order"
	`);

	const row = result.rows[0];
	return {
		revenueToday: Number(row?.revenue_today ?? 0),
		revenueYesterday: Number(row?.revenue_yesterday ?? 0),
		averageTicket: Number(row?.average_ticket ?? 0),
		paidPercent: Number(row?.paid_percent ?? 0),
	};
}
```

Imports `db` and `sql` já presentes no topo do arquivo.

- [ ] **Step 2: Verify types**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "orders/data\.ts" | grep -v "drizzle-orm" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/data.ts
git commit -m "feat(orders/data): getOrderKpis (receita hoje/ontem, ticket médio, % pagos)"
```

---

### Task 2: Adicionar `itemsCount` em `OrderListItem` e na query

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/data.ts`

- [ ] **Step 1: Read file to locate `OrderListItem` interface and `fetchOrdersPage`**

Use Read tool on the file. Find:
- `export interface OrderListItem { ... }` — add `itemsCount: number;`.
- The `fetchOrdersPage` function's `SELECT` — add `(SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.id)::int AS items_count` to the projected columns.
- The mapping/`map((r) => ({...}))` after the query — add `itemsCount: r.items_count`.
- The corresponding `db.execute<{...}>` row type — add `items_count: number;`.

- [ ] **Step 2: Apply edits**

Maintain alphabetical order in interface + row type (`itemsCount`/`items_count` between existing fields). Use TAB indent.

- [ ] **Step 3: Verify types**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "orders/data\.ts" | grep -v "drizzle-orm" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/data.ts
git commit -m "feat(orders/data): expõe itemsCount em OrderListItem"
```

---

### Task 3: Criar `OrderKpisRow` componente

**Files:**
- Create: `apps/web/src/app/dashboard/orders/_components/order-kpis.tsx`

- [ ] **Step 1: Criar o arquivo**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@emach/ui/components/card";

import type { OrderKpis } from "../data";

const CURRENCY = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

const PERCENT = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 1,
	minimumFractionDigits: 0,
});

const DELTA = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 1,
	minimumFractionDigits: 0,
	signDisplay: "always",
});

interface OrderKpisRowProps {
	kpis: OrderKpis;
}

export function OrderKpisRow({ kpis }: OrderKpisRowProps) {
	const deltaPercent =
		kpis.revenueYesterday > 0
			? ((kpis.revenueToday - kpis.revenueYesterday) / kpis.revenueYesterday) * 100
			: null;

	const deltaClass =
		deltaPercent === null
			? "text-muted-foreground"
			: deltaPercent >= 0
				? "text-success"
				: "text-destructive";

	const deltaLabel =
		deltaPercent === null
			? "—"
			: `${DELTA.format(deltaPercent)}% vs ontem`;

	return (
		<section className="grid gap-3 md:grid-cols-3">
			<Card>
				<CardHeader className="pb-1">
					<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
						Receita Hoje
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium text-2xl tabular-nums tracking-tight">
						{CURRENCY.format(kpis.revenueToday)}
					</p>
					<p className={`text-xs ${deltaClass}`}>{deltaLabel}</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-1">
					<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
						Ticket Médio
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium text-2xl tabular-nums tracking-tight">
						{CURRENCY.format(kpis.averageTicket)}
					</p>
					<p className="text-muted-foreground text-xs">últimos 30 dias</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-1">
					<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
						% Pagos
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium text-2xl tabular-nums tracking-tight">
						{PERCENT.format(kpis.paidPercent)}%
					</p>
					<p className="text-muted-foreground text-xs">últimos 30 dias</p>
				</CardContent>
			</Card>
		</section>
	);
}
```

- [ ] **Step 2: Verify types**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "order-kpis\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/order-kpis.tsx
git commit -m "feat(orders): componente OrderKpisRow"
```

---

### Task 4: Atualizar `page.tsx` — KPIs + remover "Voltar ao painel"

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/page.tsx`

- [ ] **Step 1: Adicionar imports e fetch**

No bloco de imports, adicionar:

```ts
import { OrderKpisRow } from "./_components/order-kpis";
```

E adicionar `getOrderKpis` ao import de `./data`:

```ts
import {
	fetchOrdersPage,
	getOrderKpis,
	getOrdersTabCounts,
	getRecentOrderActivity,
	listOrderBranches,
	type OrderListFilters,
	type OrdersPageFiltersInput,
} from "./data";
```

Atualizar o `Promise.all` para incluir `getOrderKpis()`:

```ts
const [branches, counts, kpis, recentActivity, result] = await Promise.all([
	listOrderBranches(),
	getOrdersTabCounts(),
	getOrderKpis(),
	getRecentOrderActivity(),
	fetchOrdersPage({ filters: pageFilters, cursor: null }),
]);
```

- [ ] **Step 2: Remover botão "Voltar ao painel" e ajustar PageHeader action**

Substituir:

```tsx
action={
	<div className="flex items-center gap-2">
		{canExport && <ExportCsvLink filters={filters} />}
		<Link
			className={buttonVariants({ variant: "ghost" })}
			href="/dashboard"
		>
			Voltar ao painel
		</Link>
	</div>
}
```

Por:

```tsx
action={canExport ? <ExportCsvLink filters={filters} /> : null}
```

Remover imports não-utilizados (`buttonVariants`, `Link`) — verificar com grep antes de remover (são usados na `Empty` mais abaixo? sim, no link "Limpar filtros"). Manter os imports.

- [ ] **Step 3: Renderizar `<OrderKpisRow>` acima da seção atual**

Logo após o `<PageHeader />` e antes da `<section className="grid gap-3 lg:grid-cols-2">`, inserir:

```tsx
<OrderKpisRow kpis={kpis} />
```

- [ ] **Step 4: Verify types**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "orders/page\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/page.tsx
git commit -m "feat(orders/page): KPIs row + remove Voltar ao painel"
```

---

### Task 5: Tabela `order-table.tsx` — col "Itens"

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/order-table.tsx`

- [ ] **Step 1: Adicionar `<TableHead>` entre Filial e Total**

No `<TableHeader>`, entre `<TableHead>Filial</TableHead>` e `<TableHead className="text-right">Total</TableHead>`:

```tsx
<TableHead className="w-16 text-right">Itens</TableHead>
```

- [ ] **Step 2: Adicionar `<TableCell>` na posição correspondente**

No `<TableBody>`, entre a cell de filial e a cell de total:

```tsx
<TableCell className="text-right font-mono text-sm tabular-nums">
	{item.itemsCount}
</TableCell>
```

- [ ] **Step 3: Verify types**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "order-table\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/order-table.tsx
git commit -m "feat(orders/table): +col Itens entre Filial e Total"
```

---

### Task 6: Tabs polish — count inline

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`

- [ ] **Step 1: Substituir `<Badge>` por `<span>` inline com bg condicional**

Localizar o `map` que renderiza `<TabsTrigger>` (atualmente:

```tsx
return (
	<TabsTrigger
		key={tab.key}
		nativeButton={false}
		render={<Link href={buildTabHref(filters, tab.key)} />}
		value={tab.key}
	>
		<span>{tab.label}</span>
		<Badge className="ml-1.5" variant="secondary">
			{count}
		</Badge>
	</TabsTrigger>
);
```

Substituir por:

```tsx
return (
	<TabsTrigger
		key={tab.key}
		nativeButton={false}
		render={<Link href={buildTabHref(filters, tab.key)} />}
		value={tab.key}
	>
		<span>{tab.label}</span>
		<span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground group-data-[state=active]/tab:bg-primary group-data-[state=active]/tab:text-primary-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
			{count}
		</span>
	</TabsTrigger>
);
```

Nota sobre a Tabs do shadcn no projeto: cada `<TabsTrigger>` tem o atributo `data-state="active"` quando selecionado. A regra `data-[state=active]:` funciona direto se o Tailwind detectar o atributo no próprio elemento; como o `<span>` é descendente, a forma confiável é usar `group-data-[state=active]/tab:` com um `group/tab` no trigger. Como adicionar um data group ao `<TabsTrigger>` exige um wrapper, simplificar usando apenas o estado próprio do trigger via parent CSS:

**Versão final pragmática (substituir o snippet acima por esta):**

```tsx
return (
	<TabsTrigger
		key={tab.key}
		nativeButton={false}
		render={<Link href={buildTabHref(filters, tab.key)} />}
		value={tab.key}
	>
		<span>{tab.label}</span>
		<span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground tabs-trigger-count">
			{count}
		</span>
	</TabsTrigger>
);
```

Adicionar no topo do arquivo (após `"use client";`), via Tailwind inline arbitrary não funciona — preferir CSS module ou regra no globals. **Mais simples**: manter `Badge` mas trocar variante para `outline` quando inativo e `default` quando ativo. Mas isso requer `useSearchParams` para saber qual está ativo.

**Implementação aceita (escolhida)**: usar `Badge` com variante controlada por `isActive`:

```tsx
{ORDER_TABS.map((tab) => {
	const count = tabCount(counts, tab.key, tab.statuses);
	const isActive = currentTab === tab.key;
	return (
		<TabsTrigger
			key={tab.key}
			nativeButton={false}
			render={<Link href={buildTabHref(filters, tab.key)} />}
			value={tab.key}
		>
			<span>{tab.label}</span>
			<Badge className="ml-2" variant={isActive ? "default" : "secondary"}>
				{count}
			</Badge>
		</TabsTrigger>
	);
})}
```

`currentTab` já é calculado no topo do componente (`const currentTab = filters.tab ?? "all";`).

- [ ] **Step 2: Verify types**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "order-list-filters\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx
git commit -m "feat(orders/filters): badge ativa destacada nas Tabs"
```

---

### Task 7: Verificação final + smoke

- [ ] **Step 1: Type-check**

Run: `bun --cwd apps/web check-types 2>&1 | grep -v "drizzle-orm\|branches/actions.ts\|lib/permissions.ts" | tail -10`
Expected: nenhum erro novo.

- [ ] **Step 2: Smoke**

`bun dev:web` (ou usar o que já está rodando) → visitar:
1. `/dashboard/orders` — sem botão "Voltar ao painel"; 3 KPI cards no topo (valores reais ou zero/—); PendingList + ActivityFeed preservados; Tabs com badge destaque na ativa; tabela com coluna "Itens" entre Filial e Total.
2. `?tab=paid` — badge `Pagos` muda variant para `default` (mais saturada), demais ficam `secondary`.
3. Clicar pedido → navega para `/dashboard/orders/[id]`.
4. Receita Hoje: se zero, mostra "R$ 0,00" e delta "—".

- [ ] **Step 3: Commit specs/plan untracked**

```bash
git add docs/superpowers/specs/2026-05-13-orders-list-redesign-design.md docs/superpowers/plans/2026-05-13-orders-list-redesign.md
git commit -m "docs(superpowers): spec e plan do orders list redesign"
```

---

## Self-review do plano

- **Cobertura do spec:**
  - Spec §1 (remover botão) → Task 4 step 2.
  - Spec §2 (KPIs) → Tasks 1, 3, 4.
  - Spec §3 (Tabs polish) → Task 6.
  - Spec §4 (col Itens) → Tasks 2, 5.
  - Spec §6 (preservar) → não tocado em nenhuma task (correto).
- **Placeholders:** zero "TBD"/"add appropriate"/"similar to". Toda task tem código.
- **Consistência de tipos:**
  - `OrderKpis` (Task 1) consumido por `OrderKpisRow` (Task 3) — campos `revenueToday`, `revenueYesterday`, `averageTicket`, `paidPercent` consistentes.
  - `itemsCount: number` adicionado em `OrderListItem` (Task 2) e consumido em `order-table.tsx` (Task 5).
  - `currentTab` já existe em `order-list-filters.tsx` — Task 6 reusa, não introduz.
- **Risco residual:** Task 6 propõe `Badge variant="default"` para ativa — verificar que `default` no projeto não conflita visualmente; é a variante padrão (cor primária = copper). Se ficar muito chamativo, fallback é `outline` no inativo e `default` no ativo, mas isso é decisão de polish e pode ser ajustada inline durante smoke.
