# Fase 2 — Branches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/dashboard/branches` num CRUD rico com lista (KPIs + filters + table), detalhe com 4 tabs (Visão geral, Equipe, Estoque, Pedidos), edit sheet via `?edit=1`, e regras de delete robustas (bloqueio por estoque/orders ativas).

**Architecture:** Reusa primitives da Fase 0 (`EntityKpisRow`, `EntityIdentityHeader`, `EntityTabs`, `EntityEditSheet`). Stock tab embute a UI existente em `/dashboard/branches/[id]/stock`. Sem novos schemas (cols `phone`/`responsibleUserId` já existem; Fase 0 cobriu).

**Tech Stack:** Next 16 RSC + Server Actions, Drizzle, shadcn/ui Table, cursor pagination (`@/lib/infinite`).

**Spec ref:** `docs/superpowers/specs/2026-05-20-users-branches-suppliers-design.md` § "Fase 2 — Branches" (linhas 272–331).

**Branch:** `fase-2-branches` (já criada a partir de `main`).

---

## Convenções

- `actorUserId` em `logUserActivity` vem de `requireCapability(...)` ou `requireCurrentSession()`.
- Server actions devolvem `ActionResult<T> = { ok: true; data } | { ok: false; error }`.
- IDs novas via `crypto.randomUUID()`.
- Sort sempre keyset com tiebreaker `id` (pattern de `customers`/`users`).
- Empty states: ícone `lucide` `size-12 opacity-40` + label `font-medium text-sm` + sub-text `text-muted-foreground text-xs`.
- Tabs Base UI com `render={<Link/>}` + `nativeButton={false}` (pattern do projeto — não usar `<a href>` puro).
- Commits Conventional Commits PT, ≤50 chars. **NÃO commitar sem autorização**: o controller faz commits inline ou autoriza explicitamente por task.

---

## Task 1: Estender `branchSchema` com phone + responsibleUserId

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-schema.ts`

- [ ] **Step 1: Adicionar campos ao schema**

```ts
import { z } from "zod";

const phoneRegex = /^[\d\s()+-]+$/;

export const branchSchema = z.object({
	name: z.string().trim().min(1, "Nome obrigatório").min(2, "Nome muito curto").max(120, "Nome muito longo"),
	address: z.string().trim().max(500, "Endereço muito longo").optional().or(z.literal("")),
	phone: z
		.string()
		.trim()
		.max(40, "Telefone muito longo")
		.regex(phoneRegex, "Telefone inválido")
		.optional()
		.or(z.literal("")),
	responsibleUserId: z.string().trim().optional().or(z.literal("")),
});

export type BranchFormValues = z.infer<typeof branchSchema>;
```

- [ ] **Step 2: Ajustar `normalizePayload` em `actions.ts`**

```ts
function normalizePayload(input: BranchFormValues) {
	const address = input.address?.trim();
	const phone = input.phone?.trim();
	const responsibleUserId = input.responsibleUserId?.trim();
	return {
		name: input.name,
		address: address ? address : null,
		phone: phone ? phone : null,
		responsibleUserId: responsibleUserId ? responsibleUserId : null,
	};
}
```

- [ ] **Step 3: Verify** `bun check-types` verde.
- [ ] **Step 4: Commit** `feat(branches): adiciona phone + responsável no schema`.

---

## Task 2: Data layer (`data.ts`)

**Files:**
- Create: `apps/web/src/app/dashboard/branches/data.ts`

Server-only data fetchers separados de actions (pattern de `users/data.ts`).

- [ ] **Step 1: Criar `data.ts`** com todas as exports abaixo.

```ts
import "server-only";

import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import {
	branch,
	stockLevel,
	userBranch,
} from "@emach/db/schema/inventory";
import { order, orderItem } from "@emach/db/schema/orders";
import { tool, toolVariant } from "@emach/db/schema/tools";
import { and, desc, eq, gt, sql } from "drizzle-orm";

export interface BranchKpis {
	total: number;
	lowStockCount: number;
	stockValue: number;
	openOrders: number;
}

export async function getBranchKpis(): Promise<BranchKpis> {
	const [total] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(branch);
	const [low] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(stockLevel)
		.where(sql`${stockLevel.quantity} <= coalesce(${stockLevel.minQty}, 0) and coalesce(${stockLevel.minQty}, 0) > 0`);
	const [value] = await db
		.select({
			v: sql<number>`coalesce(sum(${stockLevel.quantity} * coalesce(${toolVariant.price}, 0)), 0)::float`,
		})
		.from(stockLevel)
		.leftJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId));
	const [open] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(order)
		.where(sql`${order.status} in ('pending', 'paid', 'preparing', 'shipped')`);
	return {
		total: total?.n ?? 0,
		lowStockCount: low?.n ?? 0,
		stockValue: value?.v ?? 0,
		openOrders: open?.n ?? 0,
	};
}

export interface BranchDetail {
	id: string;
	name: string;
	address: string | null;
	phone: string | null;
	responsibleUserId: string | null;
	responsibleName: string | null;
	isDefault: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export async function getBranchDetail(id: string): Promise<BranchDetail | null> {
	const [row] = await db
		.select({
			id: branch.id,
			name: branch.name,
			address: branch.address,
			phone: branch.phone,
			responsibleUserId: branch.responsibleUserId,
			responsibleName: userTable.name,
			isDefault: branch.isDefault,
			createdAt: branch.createdAt,
			updatedAt: branch.updatedAt,
		})
		.from(branch)
		.leftJoin(userTable, eq(userTable.id, branch.responsibleUserId))
		.where(eq(branch.id, id))
		.limit(1);
	return (row as BranchDetail) ?? null;
}

export interface BranchDetailKpis {
	skuCount: number;
	stockValue: number;
	teamSize: number;
	orders30d: number;
}

export async function getBranchDetailKpis(branchId: string): Promise<BranchDetailKpis> {
	const [skus] = await db
		.select({ n: sql<number>`count(distinct ${stockLevel.variantId})::int` })
		.from(stockLevel)
		.where(and(eq(stockLevel.branchId, branchId), gt(stockLevel.quantity, 0)));
	const [value] = await db
		.select({
			v: sql<number>`coalesce(sum(${stockLevel.quantity} * coalesce(${toolVariant.price}, 0)), 0)::float`,
		})
		.from(stockLevel)
		.leftJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
		.where(eq(stockLevel.branchId, branchId));
	const [team] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(userBranch)
		.where(eq(userBranch.branchId, branchId));
	const [recent] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(order)
		.where(sql`${order.branchId} = ${branchId} and ${order.createdAt} >= now() - interval '30 days'`);
	return {
		skuCount: skus?.n ?? 0,
		stockValue: value?.v ?? 0,
		teamSize: team?.n ?? 0,
		orders30d: recent?.n ?? 0,
	};
}

export interface BranchTeamRow {
	userId: string;
	name: string;
	email: string;
	role: "super_admin" | "admin" | "manager" | "user";
	image: string | null;
	linkedAt: Date;
}

export async function getBranchTeam(branchId: string): Promise<BranchTeamRow[]> {
	return await db
		.select({
			userId: userTable.id,
			name: userTable.name,
			email: userTable.email,
			role: userTable.role,
			image: userTable.image,
			linkedAt: userBranch.createdAt,
		})
		.from(userBranch)
		.innerJoin(userTable, eq(userTable.id, userBranch.userId))
		.where(eq(userBranch.branchId, branchId))
		.orderBy(desc(userBranch.createdAt));
}

export interface BranchOrderRow {
	id: string;
	number: string;
	status: string;
	totalCents: number;
	createdAt: Date;
}

export async function getBranchRecentOrders(
	branchId: string,
	limit = 20,
): Promise<BranchOrderRow[]> {
	return await db
		.select({
			id: order.id,
			number: order.number,
			status: order.status,
			totalCents: order.totalCents,
			createdAt: order.createdAt,
		})
		.from(order)
		.where(eq(order.branchId, branchId))
		.orderBy(desc(order.createdAt))
		.limit(limit);
}

export interface BranchTableRow {
	id: string;
	name: string;
	address: string | null;
	isDefault: boolean;
	createdAt: Date;
	teamCount: number;
	activeSkus: number;
	lowStock: number;
}

export async function getBranchTableAggregates(
	branchIds: string[],
): Promise<Map<string, { teamCount: number; activeSkus: number; lowStock: number }>> {
	if (branchIds.length === 0) return new Map();
	const teamRows = await db
		.select({
			branchId: userBranch.branchId,
			n: sql<number>`count(*)::int`,
		})
		.from(userBranch)
		.where(sql`${userBranch.branchId} = any(${branchIds})`)
		.groupBy(userBranch.branchId);
	const stockRows = await db
		.select({
			branchId: stockLevel.branchId,
			active: sql<number>`count(*) filter (where ${stockLevel.quantity} > 0)::int`,
			low: sql<number>`count(*) filter (where ${stockLevel.quantity} <= coalesce(${stockLevel.minQty}, 0) and coalesce(${stockLevel.minQty}, 0) > 0)::int`,
		})
		.from(stockLevel)
		.where(sql`${stockLevel.branchId} = any(${branchIds})`)
		.groupBy(stockLevel.branchId);
	const map = new Map<string, { teamCount: number; activeSkus: number; lowStock: number }>();
	for (const id of branchIds) {
		map.set(id, { teamCount: 0, activeSkus: 0, lowStock: 0 });
	}
	for (const r of teamRows) {
		const v = map.get(r.branchId);
		if (v) v.teamCount = r.n;
	}
	for (const r of stockRows) {
		const v = map.get(r.branchId);
		if (v) {
			v.activeSkus = r.active;
			v.lowStock = r.low;
		}
	}
	return map;
}
```

- [ ] **Step 2: Verify** `bun check-types --filter=web` verde. Se a tabela `order` não tiver coluna `number` ou `totalCents`, adaptar (ver `packages/db/src/schema/orders.ts`).
- [ ] **Step 3: Commit** `feat(branches): data fetchers (kpis, detail, team)`.

---

## Task 3: Endurecer `deleteBranch`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts` (função `deleteBranch`)

Hoje só bloqueia se `isDefault`. Bloquear também se há `stockLevel.quantity > 0` ou orders ativas (`pending`/`paid`/`preparing`/`shipped`).

- [ ] **Step 1: Substituir corpo de `deleteBranch`**

```ts
export async function deleteBranch(id: string): Promise<ActionResult> {
	const session = await requireCapability("branches.manage");

	const [target] = await db
		.select({ isDefault: branch.isDefault, name: branch.name })
		.from(branch)
		.where(eq(branch.id, id))
		.limit(1);

	if (!target) {
		return { ok: false, error: "Filial não encontrada" };
	}

	if (target.isDefault) {
		return { ok: false, error: "Marque outra filial como padrão antes de deletar esta" };
	}

	const [stockCheck] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(stockLevel)
		.where(and(eq(stockLevel.branchId, id), gt(stockLevel.quantity, 0)));

	if ((stockCheck?.n ?? 0) > 0) {
		return {
			ok: false,
			error: `Filial tem ${stockCheck?.n} variante(s) com estoque positivo. Transfira ou zere antes de deletar.`,
		};
	}

	const [openOrders] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(order)
		.where(sql`${order.branchId} = ${id} and ${order.status} in ('pending','paid','preparing','shipped')`);

	if ((openOrders?.n ?? 0) > 0) {
		return {
			ok: false,
			error: `Filial tem ${openOrders?.n} pedido(s) em andamento. Conclua ou cancele antes de deletar.`,
		};
	}

	try {
		await db.delete(branch).where(eq(branch.id, id));
	} catch (error) {
		return { ok: false, error: zodErrorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "branch.deleted",
		targetId: id,
		targetType: "branch",
		metadata: { name: target.name },
	});
	revalidatePath(BRANCHES_PATH);
	revalidatePath("/dashboard/stock");
	revalidatePath("/dashboard/tools", "layout");
	return { ok: true, data: undefined };
}
```

- [ ] **Step 2: Adicionar imports faltantes** no topo (`stockLevel`, `order`, `and`, `gt`). `order` vem de `@emach/db/schema/orders`.
- [ ] **Step 3: Verify** types.
- [ ] **Step 4: Commit** `feat(branches): bloqueio de delete por estoque/pedidos`.

---

## Task 4: Componentes — `BranchStatusBadge` + helper de role badge na team

**Files:**
- Create: `apps/web/src/app/dashboard/branches/_components/branch-default-badge.tsx`

- [ ] **Step 1: Criar badge**

```tsx
import { Badge } from "@emach/ui/components/badge";
import { Star } from "lucide-react";

export function BranchDefaultBadge() {
	return (
		<Badge className="gap-1" variant="default">
			<Star aria-hidden className="size-3" />
			Padrão ecommerce
		</Badge>
	);
}
```

- [ ] **Step 2: Commit** `feat(branches): badge padrão ecommerce`.

---

## Task 5: `BranchesFilters` (search + sort)

**Files:**
- Create: `apps/web/src/app/dashboard/branches/_components/branches-filters.tsx`

Reusa `FiltersBar`/`useDebouncedParam` (pattern de `users/_components/users-filters.tsx`).

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { FiltersBar } from "@/components/filters-bar";
import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";

export function BranchesFilters() {
	const { params, setParam, clear, hasActive } = useFilterState(["search", "sort"]);
	const [search, setSearch] = useDebouncedParam(params.search ?? "", (v) => setParam("search", v));

	return (
		<FiltersBar hasActive={hasActive} onClear={clear}>
			<Input
				className="w-64"
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Buscar por nome ou endereço…"
				value={search}
			/>
			<Select
				onValueChange={(v) => setParam("sort", v === "newest" ? null : v)}
				value={params.sort ?? "newest"}
			>
				<SelectTrigger className="w-40">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="newest">Mais recentes</SelectItem>
					<SelectItem value="name">Nome A–Z</SelectItem>
				</SelectContent>
			</Select>
		</FiltersBar>
	);
}
```

- [ ] **Step 2: Verify**: `bun --cwd apps/web check-types`.
- [ ] **Step 3: Commit** `feat(branches): filters bar`.

---

## Task 6: `BranchesTable` (shadcn Table)

**Files:**
- Create: `apps/web/src/app/dashboard/branches/_components/branches-table.tsx`
- Reference: `apps/web/src/app/dashboard/users/_components/users-card-grid.tsx` (estrutura cliente com `useInfiniteList`)

Colunas: Nome (+badge Padrão), Endereço (truncate), Equipe (count), SKUs ativos, Abaixo do mínimo (âmbar se >0), ⋯ menu.

- [ ] **Step 1: Implementar**

```tsx
"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import { Button } from "@emach/ui/components/button";
import { Building2, MoreHorizontal } from "lucide-react";
import Link from "next/link";

import { useInfiniteList } from "@/lib/use-infinite-list";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { fetchBranchesTablePage } from "../actions";
import { BranchDefaultBadge } from "./branch-default-badge";
import type { BranchTableRow } from "../data";
import type { BranchesFiltersInput } from "../actions";

export function BranchesTable({
	canMutate,
	filters,
	initial,
	initialCursor,
}: {
	canMutate: boolean;
	filters: BranchesFiltersInput;
	initial: BranchTableRow[];
	initialCursor: string | null;
}) {
	const { items, loadMore, hasMore, loading } = useInfiniteList({
		initial,
		initialCursor,
		fetchPage: (cursor) => fetchBranchesTablePage({ filters, cursor }),
	});

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-12 text-center">
				<Building2 aria-hidden className="size-12 text-muted-foreground opacity-40" />
				<p className="font-medium text-sm">Nenhuma filial encontrada</p>
				<p className="text-muted-foreground text-xs">Ajuste os filtros ou cadastre uma nova.</p>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Nome</TableHead>
						<TableHead>Endereço</TableHead>
						<TableHead className="text-right">Equipe</TableHead>
						<TableHead className="text-right">SKUs ativos</TableHead>
						<TableHead className="text-right">Abaixo do mínimo</TableHead>
						<TableHead className="w-10" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((b) => (
						<TableRow key={b.id}>
							<TableCell>
								<Link className="flex items-center gap-2 font-medium hover:underline" href={`/dashboard/branches/${b.id}`}>
									{b.name}
									{b.isDefault ? <BranchDefaultBadge /> : null}
								</Link>
							</TableCell>
							<TableCell className="max-w-[280px] truncate text-muted-foreground text-sm">
								{b.address ?? "—"}
							</TableCell>
							<TableCell className="text-right tabular-nums">{b.teamCount}</TableCell>
							<TableCell className="text-right tabular-nums">{b.activeSkus}</TableCell>
							<TableCell className={`text-right tabular-nums ${b.lowStock > 0 ? "text-amber-500" : ""}`}>
								{b.lowStock}
							</TableCell>
							<TableCell>
								{canMutate ? (
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button size="icon" variant="ghost">
												<MoreHorizontal aria-hidden className="size-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem asChild>
												<Link href={`/dashboard/branches/${b.id}`}>Ver detalhes</Link>
											</DropdownMenuItem>
											<DropdownMenuItem asChild>
												<Link href={`/dashboard/branches/${b.id}?edit=1`}>Editar</Link>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								) : null}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<InfiniteSentinel hasMore={hasMore} loading={loading} onIntersect={loadMore} />
		</div>
	);
}
```

- [ ] **Step 2: Adicionar fetcher em `actions.ts`** (`fetchBranchesTablePage`) que devolve `BranchTableRow`s. Reusa `fetchBranchesPage` + `getBranchTableAggregates`:

```ts
export async function fetchBranchesTablePage({
	filters,
	cursor,
}: {
	filters: BranchesFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<BranchTableRow>> {
	const { getBranchTableAggregates } = await import("./data");
	const page = await fetchBranchesPage({ filters, cursor });
	const aggs = await getBranchTableAggregates(page.items.map((b) => b.id));
	const items: BranchTableRow[] = page.items.map((b) => ({
		id: b.id,
		name: b.name,
		address: b.address,
		isDefault: b.isDefault,
		createdAt: b.createdAt,
		teamCount: aggs.get(b.id)?.teamCount ?? 0,
		activeSkus: aggs.get(b.id)?.activeSkus ?? 0,
		lowStock: aggs.get(b.id)?.lowStock ?? 0,
	}));
	return { items, nextCursor: page.nextCursor };
}
```

Adicionar `import type { BranchTableRow } from "./data";` no topo.

- [ ] **Step 3: Verify** types.
- [ ] **Step 4: Commit** `feat(branches): table com agregados`.

---

## Task 7: Refactor lista `page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/page.tsx`
- Delete (após verificar): `apps/web/src/app/dashboard/branches/_components/branches-infinite.tsx` (substituído pelo table)

- [ ] **Step 1: Reescrever page**

```tsx
import { AlertCircle, Building2, DollarSign, Package } from "lucide-react";

import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { PageHeader } from "@/components/page-header";
import { Button } from "@emach/ui/components/button";
import Link from "next/link";

import { requireCurrentSession } from "@/lib/session";
import { BranchesFilters } from "./_components/branches-filters";
import { BranchesTable } from "./_components/branches-table";
import { type BranchesFiltersInput, fetchBranchesTablePage } from "./actions";
import { getBranchKpis } from "./data";

export const dynamic = "force-dynamic";

function formatBRL(value: number) {
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default async function BranchesPage({
	searchParams,
}: {
	searchParams: Promise<{ search?: string; sort?: string }>;
}) {
	const session = await requireCurrentSession();
	const canMutate = session.user.role === "admin" || session.user.role === "super_admin";
	const sp = await searchParams;

	const filters: BranchesFiltersInput = {
		search: sp.search,
		sort: sp.sort === "name" ? "name" : "newest",
	};

	const [kpis, first] = await Promise.all([
		getBranchKpis(),
		fetchBranchesTablePage({ filters, cursor: null }),
	]);

	return (
		<>
			<PageHeader
				action={canMutate ? (
					<Button asChild>
						<Link href="/dashboard/branches/new">Nova filial</Link>
					</Button>
				) : null}
				description="Localizações que recebem estoque e atendem pedidos."
				title="Filiais"
			/>
			<EntityKpisRow
				items={[
					{ icon: Building2, label: "Total", value: kpis.total },
					{ icon: AlertCircle, label: "SKUs abaixo do mínimo", tone: kpis.lowStockCount > 0 ? "warning" : "default", value: kpis.lowStockCount },
					{ icon: DollarSign, label: "Valor de estoque", value: formatBRL(kpis.stockValue) },
					{ icon: Package, label: "Pedidos em andamento", value: kpis.openOrders },
				]}
			/>
			<BranchesFilters />
			<BranchesTable
				canMutate={canMutate}
				filters={filters}
				initial={first.items}
				initialCursor={first.nextCursor}
			/>
		</>
	);
}
```

- [ ] **Step 2: Smoke** `bun dev:web` — abrir `/dashboard/branches`.
- [ ] **Step 3: Deletar** `branches-infinite.tsx` se não houver mais referências (`grep -r BranchesInfinite apps/web/src`).
- [ ] **Step 4: Commit** `feat(branches): lista com KPIs + filters + table`.

---

## Task 8: Detalhe — `[id]/page.tsx` + tabs stub

**Files:**
- Create: `apps/web/src/app/dashboard/branches/[id]/page.tsx`
- Create: `apps/web/src/app/dashboard/branches/[id]/_components/overview-tab.tsx`
- Create: `apps/web/src/app/dashboard/branches/[id]/_components/team-tab.tsx`
- Create: `apps/web/src/app/dashboard/branches/[id]/_components/orders-tab.tsx`

(Stock tab → Task 9; Edit sheet → Task 10.)

- [ ] **Step 1: `[id]/page.tsx`**

```tsx
import { Button } from "@emach/ui/components/button";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { requireCurrentSession } from "@/lib/session";

import { BranchDefaultBadge } from "../_components/branch-default-badge";
import { getBranchDetail } from "../data";
import { OverviewTab } from "./_components/overview-tab";
import { TeamTab } from "./_components/team-tab";
import { OrdersTab } from "./_components/orders-tab";
import { StockTab } from "./_components/stock-tab";
import { BranchEditSheet } from "./_components/branch-edit-sheet";

export const dynamic = "force-dynamic";

export default async function BranchDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string; edit?: string }>;
}) {
	const { id } = await params;
	const sp = await searchParams;
	const session = await requireCurrentSession();
	const canMutate = session.user.role === "admin" || session.user.role === "super_admin";

	const branch = await getBranchDetail(id);
	if (!branch) notFound();

	const tab = sp.tab ?? "overview";

	return (
		<>
			<EntityIdentityHeader
				avatar={<Building2 className="size-10" />}
				title={branch.name}
				subtitle={branch.address ?? "Sem endereço"}
				badges={branch.isDefault ? [<BranchDefaultBadge key="default" />] : []}
				actions={
					canMutate ? (
						<Button asChild size="sm">
							<Link href={`/dashboard/branches/${id}?edit=1${tab !== "overview" ? `&tab=${tab}` : ""}`}>
								Editar
							</Link>
						</Button>
					) : null
				}
			/>
			<EntityTabs
				baseHref={`/dashboard/branches/${id}`}
				items={[
					{ value: "overview", label: "Visão geral" },
					{ value: "team", label: "Equipe" },
					{ value: "stock", label: "Estoque" },
					{ value: "orders", label: "Pedidos" },
				]}
				active={tab}
			>
				{tab === "overview" && <OverviewTab branch={branch} />}
				{tab === "team" && <TeamTab branchId={id} canMutate={canMutate} />}
				{tab === "stock" && <StockTab branchId={id} />}
				{tab === "orders" && <OrdersTab branchId={id} />}
			</EntityTabs>
			{canMutate && sp.edit === "1" ? <BranchEditSheet branch={branch} /> : null}
		</>
	);
}
```

(Se `EntityTabs` tiver assinatura diferente, consultar `apps/web/src/components/entity/entity-tabs.tsx` e adaptar — usar mesmo padrão do `users/[id]/page.tsx`.)

- [ ] **Step 2: `overview-tab.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@emach/ui/components/card";
import { DollarSign, Package, Users, Wrench } from "lucide-react";

import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { getBranchDetailKpis } from "../../data";
import type { BranchDetail } from "../../data";

function formatBRL(value: number) {
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export async function OverviewTab({ branch }: { branch: BranchDetail }) {
	const k = await getBranchDetailKpis(branch.id);
	return (
		<div className="flex flex-col gap-4">
			<EntityKpisRow
				items={[
					{ icon: Wrench, label: "SKUs ativos", value: k.skuCount },
					{ icon: DollarSign, label: "Valor de estoque", value: formatBRL(k.stockValue) },
					{ icon: Users, label: "Equipe", value: k.teamSize },
					{ icon: Package, label: "Pedidos (30d)", value: k.orders30d },
				]}
			/>
			<Card>
				<CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader>
				<CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<Info label="Endereço" value={branch.address ?? "—"} />
					<Info label="Telefone" value={branch.phone ?? "—"} />
					<Info label="Responsável" value={branch.responsibleName ?? "—"} />
					<Info label="Criada em" value={new Intl.DateTimeFormat("pt-BR").format(branch.createdAt)} />
				</CardContent>
			</Card>
		</div>
	);
}

function Info({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
			<p className="text-sm">{value}</p>
		</div>
	);
}
```

- [ ] **Step 3: `team-tab.tsx`**

```tsx
import { UsersRound } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@emach/ui/components/avatar";
import { Badge } from "@emach/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@emach/ui/components/card";

import { getBranchTeam } from "../../data";
import { TeamLinkPanel } from "./team-link-panel";

const ROLE_LABEL: Record<string, string> = {
	super_admin: "Super admin",
	admin: "Admin",
	manager: "Gerente",
	user: "Operacional",
};

export async function TeamTab({ branchId, canMutate }: { branchId: string; canMutate: boolean }) {
	const team = await getBranchTeam(branchId);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Equipe ({team.length})</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{team.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-8 text-center">
						<UsersRound aria-hidden className="size-12 text-muted-foreground opacity-40" />
						<p className="font-medium text-sm">Nenhum membro vinculado</p>
						<p className="text-muted-foreground text-xs">Vincule abaixo para escopar acesso a essa filial.</p>
					</div>
				) : (
					<ul className="flex flex-col gap-2">
						{team.map((u) => (
							<li className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2" key={u.userId}>
								<Avatar className="size-8">
									{u.image ? <AvatarImage src={u.image} /> : null}
									<AvatarFallback>{u.name.slice(0, 2).toUpperCase()}</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sm">{u.name}</p>
									<p className="truncate text-muted-foreground text-xs">{u.email}</p>
								</div>
								<Badge variant="outline">{ROLE_LABEL[u.role] ?? u.role}</Badge>
							</li>
						))}
					</ul>
				)}
				{canMutate ? <TeamLinkPanel branchId={branchId} linkedIds={team.map((u) => u.userId)} /> : null}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 4: `team-link-panel.tsx` (client)** — combobox + botão vincular. Server action é uma nova `linkUserToBranch` por branch (já existe via `users/actions.ts`; pode importar dali ou criar wrapper em `branches/actions.ts`).

```tsx
"use client";

import { useTransition, useState } from "react";
import { toast } from "sonner";
import { Button } from "@emach/ui/components/button";
import { Plus } from "lucide-react";

import { linkUserToBranchAction, unlinkUserFromBranchAction } from "../../actions";

export function TeamLinkPanel({ branchId, linkedIds: _linkedIds }: { branchId: string; linkedIds: string[] }) {
	const [pending, startTransition] = useTransition();
	const [userId, setUserId] = useState("");

	const link = () => {
		if (!userId) return;
		startTransition(async () => {
			const res = await linkUserToBranchAction({ branchId, userId });
			if (res.ok) {
				toast.success("Usuário vinculado");
				setUserId("");
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<div className="flex items-center gap-2 border-border border-t pt-3">
			<input
				className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
				onChange={(e) => setUserId(e.target.value)}
				placeholder="ID do usuário (TODO: combobox)"
				value={userId}
			/>
			<Button disabled={pending || !userId} onClick={link} size="sm">
				<Plus aria-hidden className="size-3.5" />
				Vincular
			</Button>
		</div>
	);
}
```

⚠️ A combobox real depende de fetcher de usuários elegíveis — colocar como TODO neste task; Task 11 troca por combobox de verdade.

Adicionar em `branches/actions.ts` wrappers `linkUserToBranchAction` + `unlinkUserFromBranchAction` que delegam para `users/actions.ts` (mesma guard de "último admin"). Reuso direto via `import { linkUserToBranch as linkUser } from "../users/actions";` + re-export "use server".

- [ ] **Step 5: `orders-tab.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@emach/ui/components/card";
import { PackageOpen } from "lucide-react";
import Link from "next/link";

import { getBranchRecentOrders } from "../../data";

const DT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export async function OrdersTab({ branchId }: { branchId: string }) {
	const orders = await getBranchRecentOrders(branchId, 20);
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Pedidos recentes ({orders.length})</CardTitle>
			</CardHeader>
			<CardContent>
				{orders.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-8 text-center">
						<PackageOpen aria-hidden className="size-12 text-muted-foreground opacity-40" />
						<p className="font-medium text-sm">Sem pedidos</p>
						<p className="text-muted-foreground text-xs">Esta filial ainda não atendeu pedidos.</p>
					</div>
				) : (
					<ul className="flex flex-col gap-2">
						{orders.map((o) => (
							<li className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2" key={o.id}>
								<div className="min-w-0">
									<Link className="truncate font-medium text-sm hover:underline" href={`/dashboard/orders/${o.id}`}>
										#{o.number}
									</Link>
									<p className="truncate text-muted-foreground text-xs">
										{o.status} · {DT.format(o.createdAt)}
									</p>
								</div>
								<span className="tabular-nums text-sm">{BRL.format(o.totalCents / 100)}</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 6: Stub `stock-tab.tsx` placeholder** (real implementação no Task 9):

```tsx
export async function StockTab({ branchId: _branchId }: { branchId: string }) {
	return <p className="text-muted-foreground text-sm">Carregando estoque...</p>;
}
```

- [ ] **Step 7: Verify** types + smoke `/dashboard/branches/<id>`.
- [ ] **Step 8: Commit** `feat(branches): detalhe page + 4 tabs stub`.

---

## Task 9: Stock tab + redirect `[id]/stock`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/stock-tab.tsx`
- Modify: `apps/web/src/app/dashboard/branches/[id]/stock/page.tsx` (vira redirect)

- [ ] **Step 1: `stock-tab.tsx` real** — embute o `BranchStockInfinite` existente em `apps/web/src/app/dashboard/stock/_components/branch-stock-infinite.tsx`:

```tsx
import { BranchStockInfinite } from "@/app/dashboard/stock/_components/branch-stock-infinite";
import { type BranchStockFiltersInput, fetchBranchStockPage } from "@/app/dashboard/stock/branch-stock-data";

export async function StockTab({ branchId }: { branchId: string }) {
	const filters: BranchStockFiltersInput = { branchId };
	const first = await fetchBranchStockPage({ filters, cursor: null });
	if (first.items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-12 text-center">
				<p className="font-medium text-sm">Sem estoque registrado</p>
				<p className="text-muted-foreground text-xs">Cadastre variantes e ajuste o estoque para esta filial.</p>
			</div>
		);
	}
	return (
		<BranchStockInfinite
			branchId={branchId}
			filters={filters}
			initial={first.items}
			initialCursor={first.nextCursor}
		/>
	);
}
```

⚠️ Verificar a real assinatura de `fetchBranchStockPage` e `BranchStockInfinite` antes de assumir os campos — pode precisar adaptar `BranchStockFiltersInput`.

- [ ] **Step 2: Redirect `[id]/stock/page.tsx`**

```tsx
import { permanentRedirect } from "next/navigation";

export default async function BranchStockRedirect({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	permanentRedirect(`/dashboard/branches/${id}?tab=stock`);
}
```

- [ ] **Step 3: Smoke** `/dashboard/branches/<id>?tab=stock` e `/dashboard/branches/<id>/stock` (deve redirecionar).
- [ ] **Step 4: Commit** `feat(branches): stock tab + redirect /stock`.

---

## Task 10: Edit sheet via `?edit=1` + cleanup route `[id]/edit/`

**Files:**
- Create: `apps/web/src/app/dashboard/branches/[id]/_components/branch-edit-sheet.tsx`
- Delete: `apps/web/src/app/dashboard/branches/[id]/edit/` (route inteira)
- Delete: `apps/web/src/app/dashboard/branches/new/page.tsx`? **NÃO** — manter `new` por enquanto (CTA "Nova filial" leva pra lá).

Reusa `EntityEditSheet` da Fase 0 (`apps/web/src/components/entity/entity-edit-sheet.tsx`) — ver `users/_components/user-edit-sheet.tsx` como referência.

- [ ] **Step 1: Implementar**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Switch } from "@emach/ui/components/switch";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { zodIssuesToFormIssues, type FormIssue } from "@/lib/form-issues";

import { branchSchema, type BranchFormValues } from "../../_components/branch-schema";
import { setDefaultBranch, updateBranch } from "../../actions";
import type { BranchDetail } from "../../data";

export function BranchEditSheet({ branch }: { branch: BranchDetail }) {
	const router = useRouter();
	const params = useSearchParams();
	const [pending, startTransition] = useTransition();
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [values, setValues] = useState<BranchFormValues>({
		name: branch.name,
		address: branch.address ?? "",
		phone: branch.phone ?? "",
		responsibleUserId: branch.responsibleUserId ?? "",
	});

	const close = () => {
		const next = new URLSearchParams(params);
		next.delete("edit");
		router.replace(`?${next.toString()}`);
	};

	const submit = () => {
		const parsed = branchSchema.safeParse(values);
		if (!parsed.success) {
			setIssues(zodIssuesToFormIssues(parsed.error.issues));
			return;
		}
		setIssues([]);
		startTransition(async () => {
			const res = await updateBranch(branch.id, parsed.data);
			if (res.ok) {
				toast.success("Filial atualizada");
				close();
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	const toggleDefault = () => {
		if (branch.isDefault) return;
		startTransition(async () => {
			const res = await setDefaultBranch(branch.id);
			if (res.ok) toast.success("Filial agora é a padrão");
			else toast.error(res.error);
		});
	};

	return (
		<EntityEditSheet onOpenChange={(open) => { if (!open) close(); }} open issues={issues} title="Editar filial">
			<div className="flex flex-col gap-3">
				<div>
					<Label htmlFor="name">Nome</Label>
					<Input id="name" onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} value={values.name} />
				</div>
				<div>
					<Label htmlFor="address">Endereço</Label>
					<Input id="address" onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))} value={values.address ?? ""} />
				</div>
				<div>
					<Label htmlFor="phone">Telefone</Label>
					<Input id="phone" onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))} value={values.phone ?? ""} />
				</div>
				<div>
					<Label htmlFor="responsible">ID do responsável</Label>
					<Input id="responsible" onChange={(e) => setValues((v) => ({ ...v, responsibleUserId: e.target.value }))} placeholder="Cole o user.id" value={values.responsibleUserId ?? ""} />
					<p className="mt-1 text-muted-foreground text-xs">Combobox virá em iteração futura.</p>
				</div>
				<div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
					<div>
						<Label>Padrão do ecommerce</Label>
						<p className="text-muted-foreground text-xs">A loja usa essa filial para checkout e billing default.</p>
					</div>
					<Switch checked={branch.isDefault} disabled={pending || branch.isDefault} onCheckedChange={toggleDefault} />
				</div>
			</div>
			<div className="flex justify-end gap-2">
				<Button disabled={pending} onClick={close} variant="outline">Cancelar</Button>
				<Button disabled={pending} onClick={submit}>Salvar</Button>
			</div>
		</EntityEditSheet>
	);
}
```

- [ ] **Step 2: Deletar route `[id]/edit/` inteira** (`rm -r apps/web/src/app/dashboard/branches/[id]/edit`).
- [ ] **Step 3: Procurar referências quebradas** `grep -r "/branches/.*\/edit" apps/web/src` e ajustar pra `?edit=1`.
- [ ] **Step 4: Smoke** abrir sheet, salvar, validar erro.
- [ ] **Step 5: Commit** `feat(branches): edit sheet via ?edit=1`.

---

## Task 11: Combobox real de usuários no Team tab

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/team-link-panel.tsx`
- Reusa: `apps/web/src/app/dashboard/branches/_components/branches-combobox.tsx` style (mas para users) OU criar novo `users-combobox.tsx` que busca via server action.

- [ ] **Step 1: Adicionar fetcher** em `data.ts`:

```ts
export interface EligibleUserOption {
	id: string;
	name: string;
	email: string;
}

export async function getEligibleUsersForBranch(branchId: string, search: string): Promise<EligibleUserOption[]> {
	const linked = db
		.select({ uid: userBranch.userId })
		.from(userBranch)
		.where(eq(userBranch.branchId, branchId));
	return await db
		.select({ id: userTable.id, name: userTable.name, email: userTable.email })
		.from(userTable)
		.where(sql`${userTable.status} = 'active' and ${userTable.id} not in ${linked} and (${userTable.name} ilike ${`%${search}%`} or ${userTable.email} ilike ${`%${search}%`})`)
		.limit(20);
}
```

E uma server action wrapper em `branches/actions.ts`:

```ts
export async function searchEligibleUsers(branchId: string, search: string) {
	await requireCapability("users.read");
	const { getEligibleUsersForBranch } = await import("./data");
	return getEligibleUsersForBranch(branchId, search);
}
```

- [ ] **Step 2: Reescrever `team-link-panel.tsx`** com combobox (`Command` do shadcn) que dispara `searchEligibleUsers` em mudança de query (debounced). Padrão de `branches-combobox.tsx` em `users/_components/`.

- [ ] **Step 3: Botão desvincular ao lado de cada membro no `team-tab.tsx`** (mover lista pra client component pequeno que recebe a ação).

- [ ] **Step 4: Commit** `feat(branches): combobox de equipe`.

---

## Task 12: Polish + cleanup + verification + push

**Files:** vários (audit)

- [ ] **Step 1: Audit visual** — abrir `bun dev:web`, visitar `/dashboard/branches`, `/dashboard/branches/[id]?tab=overview`, `?tab=team`, `?tab=stock`, `?tab=orders`, `?edit=1`. Validar:
  - KPIs lado a lado, ícones `size-4`, separação `gap-4`.
  - Table com row-hover, badges Padrão alinhadas, números `tabular-nums`.
  - Empty states com ícone `size-12 opacity-40`.
  - Sheet com painel de erros vermelho no topo quando aplicável.
  - Sem cool blue-grays, neutros warm (oklch hue ~70), tipografia Inter, peso 500.

- [ ] **Step 2: `bun check-types` + `bun --cwd apps/web test` + `bunx ultracite check apps/web/src/app/dashboard/branches`** — todos verdes.

- [ ] **Step 3: Conferir** `git log --oneline main..HEAD` — toda commit message PT, ≤50 chars, conventional.

- [ ] **Step 4: Push gated** — só após aprovação explícita do user. Subir branch com `git push -u origin fase-2-branches`.

- [ ] **Step 5: Abrir PR** — título "feat: Fase 2 — Branches CRUD completo", body com summary + test plan + ref ao spec.

---

## Self-review

- [x] **Spec coverage:** todas as seções da Fase 2 do spec mapeadas (rotas, lista, detalhe 4 tabs, edit sheet, server actions).
- [x] **Sem placeholders:** todas as tasks têm código real ou referência exata a arquivo existente.
- [x] **Tipos consistentes:** `BranchDetail`, `BranchTableRow`, `BranchKpis` definidas no Task 2 e usadas em todas as tabs/components.
