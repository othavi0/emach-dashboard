# Branch Stock Filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir tabs de filial por chips scrolláveis, adicionar filtros de status/sort/categoria e remover elementos redundantes em `/dashboard/stock/branches`.

**Architecture:** Três tarefas independentes em sequência: (1) estender tipos e SQL em `branch-stock-data.ts`; (2) criar `BranchStockFilters` client component; (3) atualizar `branches/page.tsx` e remover `BranchSearchInput`. Nenhuma alteração em `BranchStockInfinite`, `BranchStockCard` ou server actions de mutação.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM (raw SQL via `db.execute`), shadcn/ui (FiltersBar, Select, Input), `useFilterState` + `useDebouncedParam` hooks existentes.

**Spec:** `docs/superpowers/specs/2026-05-25-branch-stock-filters.md`

---

## Mapa de arquivos

| Arquivo | Status |
|---|---|
| `apps/web/src/app/dashboard/stock/branch-stock-data.ts` | Modificar |
| `apps/web/src/app/dashboard/stock/_components/branch-stock-filters.tsx` | Criar |
| `apps/web/src/app/dashboard/stock/branches/page.tsx` | Modificar |
| `apps/web/src/app/dashboard/stock/_components/branch-search-input.tsx` | Remover |

---

## Task 1: Estender `branch-stock-data.ts`

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/branch-stock-data.ts`

### Contexto

O arquivo atual tem `BranchStockSort = "newest" | "name"` e nenhum filtro de status ou categoria. Precisamos:
- Trocar sort para `"urgency" | "name" | "stockLow" | "stockHigh"`
- Adicionar `BranchStockStatus` type
- Expandir `BranchStockFiltersInput` com `status` e `categoryId`
- Atualizar WHERE e ORDER BY no SQL
- Atualizar cursor encoding para novos sorts

- [ ] **Step 1: Substituir o conteúdo completo de `branch-stock-data.ts`**

```ts
"use server";

import { db } from "@emach/db";
import { sql } from "drizzle-orm";

import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

export interface BranchStockRow {
	imageUrl: string | null;
	minQty: number;
	quantity: number;
	reorderPoint: number;
	sku: string;
	toolId: string;
	toolName: string;
	variantId: string;
	voltage: string | null;
}

export type BranchStockSort = "urgency" | "name" | "stockLow" | "stockHigh";
export type BranchStockStatus = "all" | "critical" | "reorder" | "ok";

export interface BranchStockFiltersInput {
	branchId: string;
	categoryId?: string;
	search?: string;
	sort: BranchStockSort;
	status?: BranchStockStatus;
}

interface BranchStockDbRow extends Record<string, unknown> {
	image_url: string | null;
	min_qty: number;
	quantity: number;
	reorder_point: number;
	sku: string;
	tool_id: string;
	tool_name: string;
	variant_id: string;
	voltage: string | null;
}

function buildBranchCursorPredicate(
	decoded: ReturnType<typeof decodeCursor> | null,
	sort: BranchStockSort
) {
	if (!decoded) return null;
	if (sort === "name" && decoded.sort === "name") {
		return sql`(t.name, tv.id) > (${decoded.name}, ${decoded.id})`;
	}
	if (sort === "stockLow" && decoded.sort === "stockLow") {
		return sql`(COALESCE(sl.quantity, 0), tv.id) > (${decoded.quantity}, ${decoded.id})`;
	}
	if (sort === "stockHigh" && decoded.sort === "stockHigh") {
		return sql`(COALESCE(sl.quantity, 0), tv.id) < (${decoded.quantity}, ${decoded.id})`;
	}
	// "urgency": sem cursor persistido
	return null;
}

function buildBranchOrderClause(sort: BranchStockSort) {
	if (sort === "name") {
		return sql`ORDER BY t.name ASC, tv.id ASC`;
	}
	if (sort === "stockLow") {
		return sql`ORDER BY COALESCE(sl.quantity, 0) ASC, tv.id ASC`;
	}
	if (sort === "stockHigh") {
		return sql`ORDER BY COALESCE(sl.quantity, 0) DESC, tv.id DESC`;
	}
	// "urgency" (default): crítico → repor → ok; dentro de cada grupo, quantidade ASC
	return sql`ORDER BY
		CASE
			WHEN COALESCE(sl.quantity, 0) <= COALESCE(sl.min_qty, 0) AND COALESCE(sl.min_qty, 0) > 0 THEN 1
			WHEN COALESCE(sl.quantity, 0) > COALESCE(sl.min_qty, 0)
				AND COALESCE(sl.quantity, 0) <= COALESCE(sl.reorder_point, 0)
				AND COALESCE(sl.reorder_point, 0) > 0 THEN 2
			ELSE 3
		END ASC,
		COALESCE(sl.quantity, 0) ASC,
		tv.id ASC`;
}

function buildBranchStatusPredicate(status: BranchStockStatus | undefined) {
	if (status === "critical") {
		return sql`(COALESCE(sl.quantity, 0) <= COALESCE(sl.min_qty, 0) AND COALESCE(sl.min_qty, 0) > 0)`;
	}
	if (status === "reorder") {
		return sql`(
			COALESCE(sl.quantity, 0) > COALESCE(sl.min_qty, 0)
			AND COALESCE(sl.quantity, 0) <= COALESCE(sl.reorder_point, 0)
			AND COALESCE(sl.reorder_point, 0) > 0
		)`;
	}
	if (status === "ok") {
		return sql`(
			COALESCE(sl.quantity, 0) > COALESCE(sl.reorder_point, 0)
			OR (COALESCE(sl.min_qty, 0) = 0 AND COALESCE(sl.reorder_point, 0) = 0)
		)`;
	}
	return null;
}

export async function fetchBranchStockPage({
	filters,
	cursor,
}: {
	filters: BranchStockFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<BranchStockRow>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const trimmedSearch = filters.search?.trim();

	const whereParts: ReturnType<typeof sql>[] = [];

	if (trimmedSearch) {
		whereParts.push(
			sql`(t.name ILIKE ${`%${trimmedSearch}%`} OR tv.sku ILIKE ${`%${trimmedSearch}%`})`
		);
	}

	if (filters.categoryId) {
		whereParts.push(
			sql`EXISTS (
				SELECT 1 FROM tool_category tc
				WHERE tc.tool_id = t.id AND tc.category_id = ${filters.categoryId}
			)`
		);
	}

	const statusPred = buildBranchStatusPredicate(filters.status);
	if (statusPred) {
		whereParts.push(statusPred);
	}

	const cursorPred = buildBranchCursorPredicate(decoded, filters.sort);
	if (cursorPred) {
		whereParts.push(cursorPred);
	}

	const whereClause = whereParts.length
		? sql`WHERE ${sql.join(whereParts, sql` AND `)}`
		: sql``;

	const orderClause = buildBranchOrderClause(filters.sort);

	const result = await db.execute<BranchStockDbRow>(sql`
		SELECT
			t.id AS tool_id,
			t.name AS tool_name,
			tv.id AS variant_id,
			tv.sku,
			tv.voltage::text AS voltage,
			(
				SELECT ti.url FROM tool_image ti
				WHERE ti.tool_id = t.id
				ORDER BY ti.sort_order ASC
				LIMIT 1
			) AS image_url,
			COALESCE(sl.quantity, 0)::int AS quantity,
			COALESCE(sl.min_qty, 0)::int AS min_qty,
			COALESCE(sl.reorder_point, 0)::int AS reorder_point
		FROM tool t
		JOIN tool_variant tv ON tv.tool_id = t.id
		LEFT JOIN stock_level sl ON sl.variant_id = tv.id AND sl.branch_id = ${filters.branchId}
		${whereClause}
		${orderClause}
		LIMIT ${BATCH_SIZE + 1}
	`);

	const all = result.rows.map((row) => ({
		toolId: row.tool_id,
		toolName: row.tool_name,
		variantId: row.variant_id,
		sku: row.sku,
		voltage: row.voltage,
		imageUrl: row.image_url,
		quantity: Number(row.quantity ?? 0),
		minQty: Number(row.min_qty ?? 0),
		reorderPoint: Number(row.reorder_point ?? 0),
	}));

	const hasMore = all.length > BATCH_SIZE;
	const items = hasMore ? all.slice(0, BATCH_SIZE) : all;
	const last = items.at(-1);
	let nextCursor: string | null = null;

	if (hasMore && last) {
		if (filters.sort === "name") {
			nextCursor = encodeCursor({ v: 1, sort: "name", name: last.toolName, id: last.variantId });
		} else if (filters.sort === "stockLow") {
			nextCursor = encodeCursor({ v: 1, sort: "stockLow", quantity: last.quantity, id: last.variantId });
		} else if (filters.sort === "stockHigh") {
			nextCursor = encodeCursor({ v: 1, sort: "stockHigh", quantity: last.quantity, id: last.variantId });
		}
		// "urgency": nextCursor permanece null
	}

	return { items, nextCursor };
}
```

**Nota:** O campo `tool_created_at` foi removido do SELECT pois não era mais usado no cursor. O type `BranchStockDbRow` não precisa mais de `__createdAt`.

- [ ] **Step 2: Verificar tipos**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types
```

Esperado: zero erros. Se aparecer erro em `BranchStockInfinite` ou `page.tsx` sobre campos removidos/renomeados, verificar se os tipos ainda batem.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/stock/branch-stock-data.ts
git commit -m "feat: estender branch-stock-data — sort, status, categoria, cursor"
```

---

## Task 2: Criar `BranchStockFilters`

**Files:**
- Create: `apps/web/src/app/dashboard/stock/_components/branch-stock-filters.tsx`

### Contexto

Componente client que unifica busca + segmented control de status + select de sort + select de categoria. Segue o mesmo padrão de `StockFilters` em `_components/stock-filters.tsx` — usar `FiltersBar`, `useFilterState`, `useDebouncedParam`.

Antes de criar, leia `apps/web/src/app/dashboard/stock/_components/stock-filters.tsx` para entender o padrão exato de `FiltersBar`, `useFilterState`, `useDebouncedParam`.

- [ ] **Step 1: Criar `branch-stock-filters.tsx`**

```tsx
"use client";

import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";

import { FiltersBar } from "@/components/filters-bar";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";

interface CategoryOption {
	depth: number;
	id: string;
	name: string;
}

interface BranchStockFiltersProps {
	categories: CategoryOption[];
}

const SORT_OPTIONS = [
	{ label: "Urgência", value: "urgency" },
	{ label: "Nome A–Z", value: "name" },
	{ label: "Menor estoque", value: "stock-low" },
	{ label: "Maior estoque", value: "stock-high" },
] as const;

type StatusValue = "all" | "critical" | "reorder" | "ok";

const STATUS_OPTIONS: Array<{ label: string; value: StatusValue }> = [
	{ label: "Todos", value: "all" },
	{ label: "Crítico", value: "critical" },
	{ label: "Repor", value: "reorder" },
	{ label: "OK", value: "ok" },
];

function statusClass(value: StatusValue, active: boolean): string {
	const base =
		"px-3 py-1.5 text-xs font-medium transition-colors border-r last:border-r-0 border-border";
	if (!active) {
		return `${base} text-muted-foreground hover:text-foreground`;
	}
	if (value === "critical") return `${base} bg-red-950/50 text-red-400`;
	if (value === "reorder") return `${base} bg-amber-950/50 text-amber-400`;
	if (value === "ok") return `${base} bg-green-950/50 text-green-400`;
	return `${base} bg-muted text-foreground`;
}

const ALL = "__all__";
const BASE = "/dashboard/stock/branches";
const TRACKED = ["search", "status", "sort", "categoryId"] as const;

export function BranchStockFilters({ categories }: BranchStockFiltersProps) {
	const { searchParams, setParam, clearAll, hasActive } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({ basePath: BASE, key: "search" });
	const currentStatus = (searchParams.get("status") ?? "all") as StatusValue;
	const currentSort = searchParams.get("sort") ?? "urgency";
	const currentCategory = searchParams.get("categoryId") ?? ALL;

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			{/* Busca */}
			<div className="flex min-w-[140px] flex-1 flex-col gap-1">
				<label className="text-muted-foreground text-xs" htmlFor="bs-search">
					Buscar ferramenta
				</label>
				<Input
					id="bs-search"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Nome ou SKU"
					value={search}
				/>
			</div>

			{/* Status segmentado */}
			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Status</span>
				<div className="flex overflow-hidden rounded-md border border-border">
					{STATUS_OPTIONS.map((opt) => (
						<button
							className={statusClass(opt.value, currentStatus === opt.value)}
							key={opt.value}
							onClick={() =>
								setParam("status", opt.value === "all" ? null : opt.value)
							}
							type="button"
						>
							{opt.label}
						</button>
					))}
				</div>
			</div>

			{/* Sort */}
			<div className="flex flex-col gap-1 md:w-44">
				<label className="text-muted-foreground text-xs" htmlFor="bs-sort">
					Ordenar por
				</label>
				<Select
					onValueChange={(v) =>
						setParam("sort", v === "urgency" ? null : v)
					}
					value={currentSort}
				>
					<SelectTrigger id="bs-sort">
						<SelectValue>
							{(v: string) =>
								SORT_OPTIONS.find((o) => o.value === v)?.label ?? "Urgência"
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{SORT_OPTIONS.map((o) => (
								<SelectItem key={o.value} value={o.value}>
									{o.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			{/* Categoria (oculto se não há categorias) */}
			{categories.length > 0 && (
				<div className="flex flex-col gap-1 md:w-52">
					<label className="text-muted-foreground text-xs" htmlFor="bs-category">
						Categoria
					</label>
					<Select
						onValueChange={(v) =>
							setParam("categoryId", v === ALL ? null : v)
						}
						value={currentCategory}
					>
						<SelectTrigger id="bs-category">
							<SelectValue>
								{(v: string) => {
									if (v === ALL) return "Todas";
									return (
										categories.find((c) => c.id === v)?.name ?? "Todas"
									);
								}}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={ALL}>Todas</SelectItem>
								{categories.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{"— ".repeat(c.depth)}
										{c.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			)}
		</FiltersBar>
	);
}
```

- [ ] **Step 2: Verificar tipos**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types
```

Esperado: zero erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/stock/_components/branch-stock-filters.tsx
git commit -m "feat: criar BranchStockFilters — status, sort, categoria integrados"
```

---

## Task 3: Atualizar `branches/page.tsx` e remover `BranchSearchInput`

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/branches/page.tsx`
- Delete: `apps/web/src/app/dashboard/stock/_components/branch-search-input.tsx`

### Contexto

Antes de editar, leia o arquivo atual `apps/web/src/app/dashboard/stock/branches/page.tsx` para confirmar os imports e a estrutura exata. O arquivo atual usa `Tabs`/`TabsList`/`TabsTrigger` e `BranchSearchInput`. Tudo isso será substituído.

- [ ] **Step 1: Substituir o conteúdo de `branches/page.tsx`**

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
import Link from "next/link";

import { listBranches } from "@/app/dashboard/branches/actions";
import { PageHeader } from "@/components/page-header";
import { getUserBranchScope } from "@/lib/branch-scope";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";

import { BranchStockFilters } from "../_components/branch-stock-filters";
import { BranchStockInfinite } from "../_components/branch-stock-infinite";
import {
	type BranchStockFiltersInput,
	type BranchStockSort,
	type BranchStockStatus,
	fetchBranchStockPage,
} from "../branch-stock-data";

export const dynamic = "force-dynamic";

interface BranchesStockPageProps {
	searchParams: Promise<{
		branch?: string;
		categoryId?: string;
		search?: string;
		sort?: string;
		status?: string;
	}>;
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

function branchHref(
	branchId: string,
	sp: {
		categoryId?: string;
		search?: string;
		sort?: string;
		status?: string;
	}
): string {
	const params = new URLSearchParams({ branch: branchId });
	if (sp.search) params.set("search", sp.search);
	if (sp.status) params.set("status", sp.status);
	if (sp.sort) params.set("sort", sp.sort);
	if (sp.categoryId) params.set("categoryId", sp.categoryId);
	return `/dashboard/stock/branches?${params.toString()}`;
}

export default async function BranchesStockPage({
	searchParams,
}: BranchesStockPageProps) {
	const session = await requireCurrentSession();
	const canMutate = can(session.user.role, "stock.adjust");
	const sp = await searchParams;

	const scope = await getUserBranchScope(session);
	const [allBranches, categories] = await Promise.all([
		listBranches(),
		db
			.select({ depth: category.depth, id: category.id, name: category.name })
			.from(category)
			.where(eq(category.isActive, true))
			.orderBy(asc(category.path)),
	]);

	const branches =
		scope === null
			? allBranches
			: allBranches.filter((b) => scope.includes(b.id));

	const selectedBranch =
		branches.find((b) => b.id === sp.branch) ?? branches[0];

	if (!selectedBranch) {
		return (
			<>
				<PageHeader
					description="Consulte o estoque local de cada filial."
					title="Estoque por Filiais"
				/>
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma filial cadastrada</EmptyTitle>
						<EmptyDescription>
							Cadastre uma filial para acompanhar estoque separado por unidade.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/branches/new"
						>
							Nova filial
						</Link>
					</EmptyContent>
				</Empty>
			</>
		);
	}

	const filters: BranchStockFiltersInput = {
		branchId: selectedBranch.id,
		categoryId: sp.categoryId || undefined,
		search: sp.search?.trim() || undefined,
		sort: SORT_MAP[sp.sort ?? ""] ?? "urgency",
		status: STATUS_MAP[sp.status ?? ""] ?? undefined,
	};

	const first = await fetchBranchStockPage({ filters, cursor: null });

	return (
		<>
			<PageHeader
				description="Selecione uma filial para ver e ajustar o estoque local de cada ferramenta."
				title="Estoque por Filiais"
			/>

			{/* Chips de filial */}
			<div className="flex gap-1.5 overflow-x-auto pb-0.5">
				{branches.map((b) => (
					<Link
						className={`flex-shrink-0 whitespace-nowrap rounded-[7px] border px-3.5 py-1.5 text-sm font-medium transition-colors ${
							b.id === selectedBranch.id
								? "border-border bg-card text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
						href={branchHref(b.id, sp)}
						key={b.id}
					>
						{b.name}
					</Link>
				))}
			</div>

			<BranchStockFilters categories={categories} />

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
							href={branchHref(selectedBranch.id, {})}
						>
							Limpar filtros
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<BranchStockInfinite
					branchName={selectedBranch.name}
					canMutate={canMutate}
					filters={filters}
					initial={first.items}
					initialCursor={first.nextCursor}
				/>
			)}
		</>
	);
}
```

**Nota sobre `can`:** verificar se `can` é export nomeado de `@/lib/permissions`. Se o import falhar em check-types, ler `apps/web/src/lib/permissions.ts` e ajustar o import para o nome correto.

- [ ] **Step 2: Remover `branch-search-input.tsx`**

```bash
git rm apps/web/src/app/dashboard/stock/_components/branch-search-input.tsx
```

- [ ] **Step 3: Verificar tipos**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types
```

Esperado: zero erros. Erros mais prováveis:
- `can` não encontrado → ler `permissions.ts` e ajustar import
- `BranchStockStatus` not exported → verificar export em `branch-stock-data.ts`

- [ ] **Step 4: Smoke test visual**

Abrir `http://localhost:3001/dashboard/stock/branches`. Verificar:
- Chips scrolláveis substituíram as tabs (clicar em outro chip troca de filial preservando filtros)
- Filter bar com busca + segmented Todos/Crítico/Repor/OK + sort + categoria
- Cards reordenam ao trocar sort (Urgência padrão: críticos primeiro)
- Filtro Crítico mostra só ferramentas com `quantity <= minQty`
- Sem "Abrir rota da filial"
- Sem heading intermediário com nome da filial

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/stock/branches/page.tsx
git commit -m "feat: chips de filial, filtros integrados, remover elementos redundantes"
```
