# Ajuste UI Filiais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refinar listagem `/dashboard/branches`, integrar estoque como tab interna lazy no detalhe, simplificar filtros e elevar KPIs.

**Architecture:** RSC com radix Tabs montando só o tab ativo; `?tab=stock` controla deep-link e dispara fetch da Stock tab. Rota antiga `/branches/[id]/stock` redireciona pra `?tab=stock`. Listagem perde dropdown `...` em favor de ícones inline (Estoque + Editar), e o delete migra pro footer do edit sheet.

**Tech Stack:** Next 16 App Router, React 19, Drizzle, shadcn/ui, Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-26-ajuste-ui-filiais-design.md`

---

## File Structure

**Create:**
- `apps/web/src/app/dashboard/branches/[id]/_components/stock-tab.tsx` — RSC que embarca KPIs + filtros + lista de estoque da filial, lazy via tree-shake do `tabs` array no parent.

**Modify:**
- `apps/web/src/components/entity/entity-kpis-row.tsx` — adicionar prop `iconSize?: "sm" | "lg"`.
- `apps/web/src/app/dashboard/branches/page.tsx` — remover `inactive`, passar `iconSize="lg"`.
- `apps/web/src/app/dashboard/branches/actions.ts` — remover `includeInactive` do filtro.
- `apps/web/src/app/dashboard/branches/_components/branches-filters.tsx` — remover botão "Mostrar inativas".
- `apps/web/src/app/dashboard/branches/_components/branch-card.tsx` — refinar; ações inline; sem dropdown; sem footer "Ver estoque".
- `apps/web/src/app/dashboard/branches/[id]/page.tsx` — tab Estoque vira `content` condicional (lazy).
- `apps/web/src/app/dashboard/branches/[id]/stock/page.tsx` — substituir por `redirect(308)` pra `?tab=stock`.
- `apps/web/src/app/dashboard/branches/[id]/_components/branch-edit-sheet.tsx` — adicionar `DeleteBranchDialog` no rodapé do form.

---

### Task 1: Prop `iconSize` em `EntityKpisRow`

**Files:**
- Modify: `apps/web/src/components/entity/entity-kpis-row.tsx`

- [ ] **Step 1: Adicionar prop e mapping**

Editar `apps/web/src/components/entity/entity-kpis-row.tsx`:

```tsx
const ICON_SIZE: Record<"sm" | "lg", string> = {
	sm: "size-4",
	lg: "size-5",
};

interface Props {
	items: KpiItem[];
	iconSize?: "sm" | "lg";
}

export function EntityKpisRow({ items, iconSize = "sm" }: Props) {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
			{items.map((item) => {
				const tone = item.tone ?? "default";
				const Icon = item.icon;
				const inner = (
					<Card className="h-full">
						<CardHeader className="flex flex-row items-center justify-between gap-2 pb-1">
							<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
								{item.label}
							</CardTitle>
							{Icon ? (
								<Icon aria-hidden className={cn(ICON_SIZE[iconSize], TONE_ICON[tone])} />
							) : null}
						</CardHeader>
```

- [ ] **Step 2: Verificar build**

Run: `bun check-types`
Expected: PASS (zero errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/entity/entity-kpis-row.tsx
git commit -m "feat(entity-kpis): prop iconSize sm|lg"
```

---

### Task 2: Remover `includeInactive` de `actions.ts`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts`

- [ ] **Step 1: Editar `BranchesFiltersInput` e `fetchBranchesPage`**

```tsx
// Antes
export interface BranchesFiltersInput {
	includeInactive?: boolean;
	search?: string;
	sort: BranchSort;
}
// ... em fetchBranchesPage
if (!filters.includeInactive) {
	conditions.push(eq(branch.status, "active"));
}
```

```tsx
// Depois
export interface BranchesFiltersInput {
	search?: string;
	sort: BranchSort;
}
// ... em fetchBranchesPage: remover o bloco if (!filters.includeInactive) inteiro.
```

- [ ] **Step 2: Verificar build**

Run: `bun check-types`
Expected: PASS — pode haver erros em call-sites (page.tsx) que serão corrigidos na próxima task. Se houver, prosseguir e validar ao final da Task 3.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/actions.ts
git commit -m "refactor(branches/actions): remove includeInactive filter"
```

---

### Task 3: Page listagem — remover param `inactive`, passar `iconSize="lg"`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/page.tsx`

- [ ] **Step 1: Aplicar mudanças**

Editar `apps/web/src/app/dashboard/branches/page.tsx`:

```tsx
// Antes
interface PageProps {
	searchParams: Promise<{
		search?: string;
		sort?: string;
		inactive?: string;
	}>;
}

// ... dentro do componente
const sp = await searchParams;

const filters: BranchesFiltersInput = {
	search: sp.search,
	sort: (sp.sort as BranchesFiltersInput["sort"]) ?? "newest",
	includeInactive: sp.inactive === "1",
};

// ... no JSX
<EntityKpisRow
	items={[
		// ...
	]}
/>
```

```tsx
// Depois
interface PageProps {
	searchParams: Promise<{
		search?: string;
		sort?: string;
	}>;
}

// ... dentro do componente
const sp = await searchParams;

const filters: BranchesFiltersInput = {
	search: sp.search,
	sort: (sp.sort as BranchesFiltersInput["sort"]) ?? "newest",
};

// ... no JSX
<EntityKpisRow
	iconSize="lg"
	items={[
		// ...
	]}
/>
```

- [ ] **Step 2: Verificar build**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/page.tsx
git commit -m "feat(branches): remove inactive param; iconSize lg em KPIs"
```

---

### Task 4: `BranchesFilters` — remover "Mostrar inativas"

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branches-filters.tsx`

- [ ] **Step 1: Aplicar mudanças**

```tsx
// Antes
const TRACKED = ["search", "sort", "inactive"] as const;

export function BranchesFilters() {
	const { setParam, clearAll, hasActive, searchParams } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	// ...
	const includeInactive = searchParams.get("inactive") === "1";

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			{/* busca, sort */}
			<div className="flex flex-col justify-end gap-1">
				<span className="text-muted-foreground text-xs">Status</span>
				<button
					/* Mostrar inativas */
				/>
			</div>
		</FiltersBar>
	);
}
```

```tsx
// Depois
const TRACKED = ["search", "sort"] as const;

export function BranchesFilters() {
	const { setParam, clearAll, hasActive, searchParams } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({
		basePath: BASE,
		key: "search",
	});

	const currentSort = searchParams.get("sort") ?? "newest";

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			<div className="flex flex-1 flex-col gap-1">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="branches-search"
				>
					Buscar filial
				</label>
				<Input
					id="branches-search"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Nome da filial"
					value={search}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-44">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="branches-sort"
				>
					Ordenar por
				</label>
				<Select
					onValueChange={(v) => setParam("sort", v === "newest" ? null : v)}
					value={currentSort}
				>
					<SelectTrigger id="branches-sort">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="newest">Mais recentes</SelectItem>
							<SelectItem value="name">Nome (A-Z)</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
		</FiltersBar>
	);
}
```

- [ ] **Step 2: Verificar build**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branches-filters.tsx
git commit -m "feat(branches/filters): remover toggle 'Mostrar inativas'"
```

---

### Task 5: `BranchCard` refinado — ações inline, sem dropdown, sem footer

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-card.tsx`

- [ ] **Step 1: Reescrever componente**

Conteúdo final:

```tsx
"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Boxes, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBranchAddress } from "@/lib/format/branch";

import type { BranchTableRow } from "../data";

interface BranchCardProps {
	branch: BranchTableRow;
	canManage: boolean;
}

function monogramColor(lowStock: number): { bg: string; text: string } {
	if (lowStock > 0) {
		return { bg: "bg-amber-950", text: "text-amber-400" };
	}
	return { bg: "bg-green-950", text: "text-green-400" };
}

function initials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

export function BranchCard({ branch, canManage }: BranchCardProps) {
	const router = useRouter();
	const { bg, text } = monogramColor(branch.lowStock);
	const detailHref = `/dashboard/branches/${branch.id}`;
	const stockHref = `/dashboard/branches/${branch.id}?tab=stock`;
	const editHref = `/dashboard/branches/${branch.id}?edit=1`;
	const primaryHref = canManage ? detailHref : stockHref;

	return (
		<div
			className={`group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${branch.status === "inactive" ? "opacity-70" : ""}`}
			onClick={() => router.push(primaryHref)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(primaryHref);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div
					className={`flex size-12 flex-shrink-0 items-center justify-center rounded-[10px] font-bold text-[17px] ${bg} ${text}`}
				>
					{initials(branch.name)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-[15px] text-foreground leading-tight">
						{branch.name}
					</p>
					{branch.status === "inactive" && (
						<span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
							Inativa
						</span>
					)}
					{(() => {
						const addr = formatBranchAddress(branch);
						return addr ? (
							<p className="line-clamp-1 text-muted-foreground text-xs">
								{addr}
							</p>
						) : null;
					})()}
					<div className="mt-1.5">
						{branch.lowStock === 0 ? (
							<span className="inline-flex items-center gap-1.5 text-[11px] text-green-500">
								<span
									aria-hidden
									className="size-1.5 rounded-full bg-green-500"
								/>
								Estoque OK
							</span>
						) : (
							<span className="inline-flex items-center gap-1.5 text-[11px] text-amber-500">
								<span
									aria-hidden
									className="size-1.5 rounded-full bg-amber-500"
								/>
								{branch.lowStock} abaixo do mín.
							</span>
						)}
					</div>
				</div>
				{canManage && (
					<div
						className="flex shrink-0 items-center gap-1"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<Link
							aria-label={`Ver estoque de ${branch.name}`}
							className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
							href={stockHref}
						>
							<Boxes aria-hidden className="size-4" />
						</Link>
						<Link
							aria-label={`Editar ${branch.name}`}
							className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
							href={editHref}
						>
							<Pencil aria-hidden className="size-4" />
						</Link>
					</div>
				)}
			</div>

			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-3">
					<span className="font-bold text-[20px] text-foreground tabular-nums">
						{branch.teamCount}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Equipe
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-3">
					<span className="font-bold text-[20px] text-foreground tabular-nums">
						{branch.activeSkus}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						SKUs ativos
					</span>
				</div>
				<div className="flex flex-col items-center py-3">
					<span
						className={`font-bold text-[20px] tabular-nums ${
							branch.lowStock > 0 ? "text-amber-500" : "text-foreground"
						}`}
					>
						{branch.lowStock}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Abaixo mín.
					</span>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Deletar `DeleteBranchDialog` import morto na listagem**

Já removido na reescrita (não importa mais `DeleteBranchDialog` nem `DropdownMenu*`).

- [ ] **Step 3: Verificar build**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-card.tsx
git commit -m "feat(branches/card): ações inline (Estoque + Editar); remove dropdown e footer"
```

---

### Task 6: Criar `StockTab` RSC

**Files:**
- Create: `apps/web/src/app/dashboard/branches/[id]/_components/stock-tab.tsx`

- [ ] **Step 1: Escrever o componente**

Conteúdo de `apps/web/src/app/dashboard/branches/[id]/_components/stock-tab.tsx`:

```tsx
import { db } from "@emach/db";
import { category } from "@emach/db/schema/categories";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { asc, eq } from "drizzle-orm";
import { Ban, CheckCircle2, Clock, Package } from "lucide-react";
import Link from "next/link";

import { BranchStockFilters } from "@/app/dashboard/stock/_components/branch-stock-filters";
import { BranchStockInfinite } from "@/app/dashboard/stock/_components/branch-stock-infinite";
import {
	type BranchStockFiltersInput,
	type BranchStockSort,
	type BranchStockStatus,
	fetchBranchStockPage,
	getBranchStockKpis,
} from "@/app/dashboard/stock/branch-stock-data";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { can, requireCapabilityWithContextOrRedirect } from "@/lib/permissions";

import { AddToolButton } from "../stock/_components/add-tool-button";

interface StockTabProps {
	branchId: string;
	branchName: string;
	categoryId?: string;
	search?: string;
	sort?: string;
	status?: string;
}

const SORT_MAP: Record<string, BranchStockSort> = {
	name: "name",
	"stock-low": "stockLow",
	"stock-high": "stockHigh",
};

const STATUS_MAP: Record<string, BranchStockStatus> = {
	critical: "critical",
	reorder: "reorder",
	ok: "ok",
};

export async function StockTab({
	branchId,
	branchName,
	categoryId,
	search,
	sort,
	status,
}: StockTabProps) {
	const session = await requireCapabilityWithContextOrRedirect("stock.adjust", {
		targetBranchIds: [branchId],
	});
	const canMutate = can(session.user.role, "stock.adjust");

	const [categories, kpis] = await Promise.all([
		db
			.select({ depth: category.depth, id: category.id, name: category.name })
			.from(category)
			.where(eq(category.isActive, true))
			.orderBy(asc(category.path)),
		getBranchStockKpis(branchId),
	]);

	const basePath = `/dashboard/branches/${branchId}`;

	const filters: BranchStockFiltersInput = {
		branchId,
		categoryId: categoryId || undefined,
		search: search?.trim() || undefined,
		sort: SORT_MAP[sort ?? ""] ?? "urgency",
		status: STATUS_MAP[status ?? ""] ?? undefined,
	};

	const first = await fetchBranchStockPage({ filters, cursor: null });

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-sm">
					Ajuste quantidades e configure limites de alerta por ferramenta.
				</p>
				{canMutate ? (
					<AddToolButton branchId={branchId} branchName={branchName} />
				) : null}
			</div>

			<EntityKpisRow
				items={[
					{
						icon: Package,
						label: "Itens em estoque",
						value: kpis.totalItems,
					},
					{
						icon: Ban,
						label: "Críticas",
						tone: kpis.criticalCount > 0 ? "danger" : "default",
						value: kpis.criticalCount,
					},
					{
						icon: Clock,
						label: "A repor",
						tone: kpis.reorderCount > 0 ? "warning" : "default",
						value: kpis.reorderCount,
					},
					{ icon: CheckCircle2, label: "OK", value: kpis.okCount },
				]}
			/>

			<BranchStockFilters basePath={basePath} categories={categories} />

			{first.items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma ferramenta encontrada</EmptyTitle>
						<EmptyDescription>
							Tente ajustar os filtros ou limpe a busca.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link
							className={buttonVariants({ variant: "ghost" })}
							href={`${basePath}?tab=stock`}
						>
							Limpar filtros
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<BranchStockInfinite
					branchId={branchId}
					branchName={branchName}
					canMutate={canMutate}
					filters={filters}
					initial={first.items}
					initialCursor={first.nextCursor}
				/>
			)}
		</div>
	);
}
```

**Nota importante sobre `basePath`:** `BranchStockFilters` usa `useFilterState`, que preserva params existentes via `new URLSearchParams(searchParams.toString())`. Como `?tab=stock` já está no URL quando a tab Estoque está ativa, ele é preservado automaticamente em qualquer mudança de filtro. `basePath` deve ser `/dashboard/branches/[id]` (sem `?tab=stock`) — o hook re-junta os params atuais.

- [ ] **Step 2: Verificar build**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/\[id\]/_components/stock-tab.tsx
git commit -m "feat(branches/detail): novo StockTab RSC lazy"
```

---

### Task 7: Detail page — embed Stock tab condicional

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/page.tsx`

- [ ] **Step 1: Atualizar `searchParams` e tabs**

```tsx
import { Building2, Package, ShoppingCart, Users } from "lucide-react";
import { notFound } from "next/navigation";
import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import {
	getBranchDetail,
	getBranchDetailKpis,
	getBranchRecentOrders,
	getBranchTeam,
} from "../data";
import { BranchEditSheet } from "./_components/branch-edit-sheet";
import { BranchIdentity } from "./_components/branch-identity";
import { OrdersTab } from "./_components/orders-tab";
import { OverviewTab } from "./_components/overview-tab";
import { StockTab } from "./_components/stock-tab";
import { TeamTab } from "./_components/team-tab";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{
		edit?: string;
		tab?: string;
		categoryId?: string;
		search?: string;
		sort?: string;
		status?: string;
	}>;
}

export default async function BranchDetailPage({
	params,
	searchParams,
}: PageProps) {
	await requireCapabilityOrRedirect("branches.manage");

	const { id } = await params;
	const sp = await searchParams;

	const [detail, kpis, team, recentOrders] = await Promise.all([
		getBranchDetail(id),
		getBranchDetailKpis(id),
		getBranchTeam(id),
		getBranchRecentOrders(id),
	]);

	if (!detail) {
		notFound();
	}

	const isStockTab = sp.tab === "stock";

	const tabs: EntityTab[] = [
		{
			value: "overview",
			label: "Visão geral",
			icon: <Building2 aria-hidden className="size-3.5" />,
			content: <OverviewTab detail={detail} kpis={kpis} />,
		},
		{
			value: "team",
			label: "Equipe",
			icon: <Users aria-hidden className="size-3.5" />,
			badge: (
				<span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">
					{team.length}
				</span>
			),
			content: <TeamTab branchId={id} team={team} />,
		},
		{
			value: "orders",
			label: "Pedidos",
			icon: <ShoppingCart aria-hidden className="size-3.5" />,
			content: <OrdersTab orders={recentOrders} />,
		},
		{
			value: "stock",
			label: "Estoque",
			icon: <Package aria-hidden className="size-3.5" />,
			content: isStockTab ? (
				<StockTab
					branchId={id}
					branchName={detail.name}
					categoryId={sp.categoryId}
					search={sp.search}
					sort={sp.sort}
					status={sp.status}
				/>
			) : null,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<BranchIdentity detail={detail} />
			<EntityTabs defaultValue="overview" tabs={tabs} />
			{sp.edit === "1" ? <BranchEditSheet branch={detail} /> : null}
		</div>
	);
}
```

**Nota sobre lazy:** quando `sp.tab !== "stock"`, `content` é `null` — `StockTab` não entra na árvore RSC e nenhuma query roda. Trocar pra Stock dispara `router.replace?tab=stock` → re-render → fetch.

- [ ] **Step 2: Verificar build**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/\[id\]/page.tsx
git commit -m "feat(branches/detail): Estoque vira tab interna lazy"
```

---

### Task 8: Stock route → redirect 308

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/stock/page.tsx`

- [ ] **Step 1: Substituir conteúdo**

Conteúdo final de `apps/web/src/app/dashboard/branches/[id]/stock/page.tsx`:

```tsx
import { permanentRedirect } from "next/navigation";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BranchStockRedirect({
	params,
	searchParams,
}: PageProps) {
	const { id } = await params;
	const sp = await searchParams;

	const qs = new URLSearchParams();
	qs.set("tab", "stock");
	for (const [key, value] of Object.entries(sp)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) {
			for (const v of value) qs.append(key, v);
		} else {
			qs.set(key, value);
		}
	}

	permanentRedirect(`/dashboard/branches/${id}?${qs.toString()}`);
}
```

**Nota:** `permanentRedirect` retorna 308 e preserva method/body. Query params (`categoryId`, `search`, `sort`, `status`) ficam na URL final.

- [ ] **Step 2: Verificar que `add-tool-button.tsx` continua sendo importado pela StockTab**

Já está. Path: `../stock/_components/add-tool-button` (do `_components/stock-tab.tsx`).

- [ ] **Step 3: Verificar build**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/\[id\]/stock/page.tsx
git commit -m "feat(branches/stock): redirect 308 pra ?tab=stock"
```

---

### Task 9: Delete migra pro `BranchEditSheet`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/branch-edit-sheet.tsx`

- [ ] **Step 1: Adicionar zona destrutiva no rodapé do form**

Inserir antes do `</EntityEditSheet>` final, depois do `<BranchFormFields />`:

```tsx
<div className="mt-8 border-border border-t pt-6">
	<div className="flex items-start justify-between gap-4">
		<div>
			<h3 className="font-medium text-destructive text-sm">Zona destrutiva</h3>
			<p className="mt-1 text-muted-foreground text-xs">
				Remove a filial. Estoque positivo e pedidos abertos bloqueiam a exclusão.
			</p>
		</div>
		<DeleteBranchDialog branchId={branch.id} branchName={branch.name} />
	</div>
</div>
```

Adicionar import no topo:

```tsx
import { DeleteBranchDialog } from "../../_components/delete-branch-dialog";
```

- [ ] **Step 2: Verificar build**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/\[id\]/_components/branch-edit-sheet.tsx
git commit -m "feat(branches/edit): zona destrutiva com DeleteBranchDialog"
```

---

### Task 10: Smoke + verificação visual

- [ ] **Step 1: `bun check-types` final**

Run: `bun check-types`
Expected: PASS, zero errors.

- [ ] **Step 2: `bun fix` (Biome auto-format)**

Run: `bun fix`
Expected: format applied, no errors.

- [ ] **Step 3: Recarregar dashboard no browser**

Dev server já está rodando em `http://localhost:3001` (Monitor armado em `/tmp/emach-dev.log`). Recarregar `/dashboard/branches`:
- Cards refinados (ícones inline Estoque + Editar, sem dropdown).
- KPIs do topo com ícones 20px.
- Filtro "Mostrar inativas" sumiu.
- Inativas mostram com opacity reduzida + badge.

Clicar numa filial → detalhe. Clicar tab "Estoque":
- URL vira `?tab=stock`.
- KPIs + filtros + lista de estoque renderizam dentro do contexto da filial.
- BranchIdentity continua no topo.

Acessar URL antiga `/dashboard/branches/<id>/stock` → 308 → `?tab=stock`.

Clicar Editar (lápis no card ou no detalhe) → BranchEditSheet abre, com zona destrutiva no rodapé.

- [ ] **Step 4: Commit final se houver formatação pendente**

```bash
git add -A
git commit -m "chore: format final"
```

---

## Self-Review (executada antes de salvar)

- **Spec coverage:** todas as 6 decisões do spec têm tasks (1: prop iconSize; 2/3: remover inactive; 4: filter; 5: card; 6/7: tab stock; 8: redirect; 9: delete).
- **Placeholders:** nenhum.
- **Type consistency:** `BranchesFiltersInput` perde `includeInactive` consistentemente (actions + page). `iconSize` é `"sm" | "lg"` em todos os sítios. `StockTab` recebe params nomeados, todos `string | undefined`.
- **Riscos remanescentes:** se `requireCapabilityOrRedirect("branches.manage")` no detail page já garante `stock.adjust`, o gate dentro de StockTab é redundante mas defensivo — fica.
