# Dashboard Cards Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar BranchStockCard, criar BranchCard (substituindo tabela) e criar UserCard (substituindo EntityCard genérico), todos seguindo a linguagem visual do ToolCard.

**Architecture:** Três tarefas independentes, cada uma toca superfícies isoladas. BranchStockCard é reescrita de arquivo existente; BranchCard e UserCard são novos componentes que substituem padrões anteriores. Nenhuma alteração em interfaces de dados ou rotas.

**Tech Stack:** Next.js 16 App Router, React 19, `"use client"` + `useRouter`, Tailwind CSS, shadcn/ui Badge + DropdownMenu, Lucide React.

**Spec:** `docs/superpowers/specs/2026-05-25-dashboard-cards-redesign.md`

---

## Mapa de arquivos

| Arquivo | Status |
|---|---|
| `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx` | Reescrever |
| `apps/web/src/app/dashboard/branches/_components/branch-card.tsx` | Criar |
| `apps/web/src/app/dashboard/branches/_components/branch-card-grid.tsx` | Criar |
| `apps/web/src/app/dashboard/branches/_components/branches-table.tsx` | Remover |
| `apps/web/src/app/dashboard/branches/page.tsx` | Modificar (trocar `BranchesTable` → `BranchCardGrid`) |
| `apps/web/src/app/dashboard/users/_components/user-card.tsx` | Criar |
| `apps/web/src/app/dashboard/users/_components/users-card-grid.tsx` | Modificar (trocar `EntityCard` → `UserCard`) |

---

## Task 1: Reescrever BranchStockCard

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`

### Contexto

O arquivo atual tem `font-serif` (P0 ban), imagem dentro de `div` com borda extra (não edge-to-edge), 26px de quantidade dominante, sem click-to-navigate. A nova estrutura espelha `ToolCard`: imagem edge-to-edge, badge de status overlay top-right, body com font-sans, rodapé "Qtd: N" + botão Ajustar.

Interface de dados (`BranchStockRow`) não muda:
```ts
// apps/web/src/app/dashboard/stock/branch-stock-data.ts
interface BranchStockRow {
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
```

- [ ] **Step 1: Substituir o conteúdo completo de `branch-stock-card.tsx`**

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { useRouter } from "next/navigation";

import type { BranchStockRow } from "../branch-stock-data";
import { BranchStockThresholdInputs } from "./branch-stock-threshold-inputs";
import { StockAdjustButton } from "./stock-adjust-button";

interface BranchStockCardProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	row: BranchStockRow;
}

type StockStatus = "critical" | "reorder" | "ok" | "none";

function stockStatus(row: BranchStockRow): StockStatus {
	if (row.minQty > 0 && row.quantity <= row.minQty) return "critical";
	if (
		row.reorderPoint > 0 &&
		row.quantity > row.minQty &&
		row.quantity <= row.reorderPoint
	)
		return "reorder";
	if (row.minQty === 0 && row.reorderPoint === 0) return "none";
	return "ok";
}

export function BranchStockCard({
	branchId,
	branchName,
	canMutate,
	row,
}: BranchStockCardProps) {
	const router = useRouter();
	const status = stockStatus(row);
	const quantityIsCritical = status === "critical";
	const hasThresholds = row.minQty > 0 || row.reorderPoint > 0;

	return (
		<div
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm"
			onClick={() => router.push(`/dashboard/tools/${row.toolId}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/dashboard/tools/${row.toolId}`);
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* Imagem com badge de status sobreposto */}
			<div className="relative overflow-hidden">
				{row.imageUrl ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
					<img
						alt={row.toolName}
						className="aspect-[16/9] w-full object-cover transition-[filter] duration-150 group-hover:brightness-110"
						src={row.imageUrl}
					/>
				) : (
					<div aria-hidden className="aspect-[16/9] w-full border-dashed bg-muted/40" />
				)}
				{status !== "none" && (
					<div className="absolute right-2 top-2">
						{status === "critical" && (
							<Badge className="shadow-sm backdrop-blur-sm" variant="destructive">
								Crítico
							</Badge>
						)}
						{status === "reorder" && (
							<Badge className="shadow-sm backdrop-blur-sm" variant="warning">
								Repor
							</Badge>
						)}
						{status === "ok" && (
							<Badge className="shadow-sm backdrop-blur-sm" variant="success">
								OK
							</Badge>
						)}
					</div>
				)}
			</div>

			{/* Corpo */}
			<div className="flex flex-col gap-2 px-4 pb-4 pt-3">
				<div>
					<span className="line-clamp-2 text-[14px] font-semibold leading-[1.3] tracking-tight text-foreground">
						{row.toolName}
					</span>
					<p className="line-clamp-1 text-muted-foreground text-xs">
						SKU {row.sku}
						{row.voltage ? ` · ${row.voltage}` : ""}
					</p>
				</div>

				<hr className="border-border" />

				{/* Rodapé */}
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-baseline gap-1">
						<span className="text-muted-foreground text-xs">Qtd:</span>
						<span
							className={`text-[15px] font-semibold tabular-nums leading-none ${
								quantityIsCritical ? "text-destructive" : "text-primary"
							}`}
						>
							{row.quantity}
						</span>
					</div>
					{canMutate && (
						<div
							className="flex shrink-0 items-center gap-1.5"
							onClick={(e) => e.stopPropagation()}
						>
							<StockAdjustButton
								branchId={branchId}
								branchName={branchName}
								currentQty={row.quantity}
								variantId={row.variantId}
							/>
						</div>
					)}
				</div>

				{/* Thresholds */}
				{canMutate && hasThresholds && (
					<div onClick={(e) => e.stopPropagation()}>
						<BranchStockThresholdInputs
							branchId={branchId}
							initialMinQty={row.minQty}
							initialReorderPoint={row.reorderPoint}
							variantId={row.variantId}
						/>
					</div>
				)}
				{!canMutate && hasThresholds && (
					<p className="text-[11px] text-muted-foreground/60">
						Mín: {row.minQty} · Reposição: {row.reorderPoint}
					</p>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verificar tipos**

```bash
bun check-types
```

Esperado: zero erros.

- [ ] **Step 3: Smoke test visual**

Abrir `http://localhost:3001/dashboard/branches` → clicar em qualquer filial → aba Estoque. Verificar:
- Imagem edge-to-edge (sem borda interna extra)
- Badge de status (Crítico/Repor/OK) no top-right da imagem
- Nome em sans-serif
- Footer "Qtd: N" com número colorido
- Clicar no card navega para `/dashboard/tools/{id}`
- Clicar em "Ajustar" não dispara navegação

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx
git commit -m "feat: redesign branch stock card — edge-to-edge, overlay badge, rodapé mínimo"
```

---

## Task 2: BranchCard + BranchCardGrid (substituir tabela)

**Files:**
- Create: `apps/web/src/app/dashboard/branches/_components/branch-card.tsx`
- Create: `apps/web/src/app/dashboard/branches/_components/branch-card-grid.tsx`
- Delete: `apps/web/src/app/dashboard/branches/_components/branches-table.tsx`
- Modify: `apps/web/src/app/dashboard/branches/page.tsx`

### Contexto

`BranchTableRow` é a interface de dados existente (sem alteração):
```ts
interface BranchTableRow {
  activeSkus: number;
  address: string | null;
  createdAt: Date;
  id: string;
  lowStock: number;
  name: string;
  teamCount: number;
}
```

`fetchBranchesTablePage` e `BranchesFiltersInput` já existem em `branches/actions.ts` e são reaproveitados. `DeleteBranchDialog` e `BranchesFilters` permanecem inalterados.

- [ ] **Step 1: Criar `branch-card.tsx`**

```tsx
"use client";

import { buttonVariants } from "@emach/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import { Boxes, MoreHorizontal, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

import type { BranchTableRow } from "../data";
import { DeleteBranchDialog } from "./delete-branch-dialog";

interface BranchCardProps {
	branch: BranchTableRow;
	canMutate: boolean;
}

function monogramColor(lowStock: number): { bg: string; text: string } {
	if (lowStock > 0) return { bg: "bg-amber-950", text: "text-amber-400" };
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

export function BranchCard({ branch, canMutate }: BranchCardProps) {
	const router = useRouter();
	const { bg, text } = monogramColor(branch.lowStock);

	return (
		<div
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm"
			onClick={() => router.push(`/dashboard/branches/${branch.id}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/dashboard/branches/${branch.id}`);
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* Header */}
			<div className="flex items-start gap-3 px-4 pb-3 pt-4">
				<div
					className={`flex size-12 flex-shrink-0 items-center justify-center rounded-[10px] text-[17px] font-bold ${bg} ${text}`}
				>
					{initials(branch.name)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-[15px] text-foreground leading-tight">
						{branch.name}
					</p>
					{branch.address && (
						<p className="line-clamp-1 text-muted-foreground text-xs">
							{branch.address}
						</p>
					)}
					<div className="mt-1.5">
						{branch.lowStock === 0 ? (
							<span className="inline-flex items-center gap-1.5 text-[11px] text-green-500">
								<span aria-hidden className="size-1.5 rounded-full bg-green-500" />
								Estoque OK
							</span>
						) : (
							<span className="inline-flex items-center gap-1.5 text-[11px] text-amber-500">
								<span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
								{branch.lowStock} abaixo do mín.
							</span>
						)}
					</div>
				</div>
				{canMutate && (
					<div
						className="flex shrink-0 items-center gap-1"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<DropdownMenu>
							<DropdownMenuTrigger
								aria-label={`Ações para ${branch.name}`}
								className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
							>
								<MoreHorizontal aria-hidden className="size-4" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									onClick={() =>
										router.push(`/dashboard/branches/${branch.id}/stock`)
									}
								>
									<Boxes aria-hidden className="size-4" />
									Estoque
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() =>
										router.push(`/dashboard/branches/${branch.id}?edit=1`)
									}
								>
									<Pencil aria-hidden className="size-4" />
									Editar
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<DeleteBranchDialog branchId={branch.id} branchName={branch.name} />
					</div>
				)}
			</div>

			{/* KPI grid */}
			<div className="grid grid-cols-3 border-t border-border">
				<div className="flex flex-col items-center border-r border-border py-3">
					<span className="text-[20px] font-bold tabular-nums text-foreground">
						{branch.teamCount}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Equipe
					</span>
				</div>
				<div className="flex flex-col items-center border-r border-border py-3">
					<span className="text-[20px] font-bold tabular-nums text-foreground">
						{branch.activeSkus}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						SKUs ativos
					</span>
				</div>
				<div className="flex flex-col items-center py-3">
					<span
						className={`text-[20px] font-bold tabular-nums ${
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

- [ ] **Step 2: Criar `branch-card-grid.tsx`**

```tsx
"use client";

import { Building2 } from "lucide-react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { type BranchesFiltersInput, fetchBranchesTablePage } from "../actions";
import type { BranchTableRow } from "../data";
import { BranchCard } from "./branch-card";

interface BranchCardGridProps {
	canMutate: boolean;
	filters: BranchesFiltersInput;
	initial: BranchTableRow[];
	initialCursor: string | null;
}

export function BranchCardGrid({
	canMutate,
	filters,
	initial,
	initialCursor,
}: BranchCardGridProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchBranchesTablePage({ filters, cursor }),
		resetKey,
	});

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Building2 aria-hidden className="size-12 opacity-40" />
				<p className="font-medium text-sm">Nenhuma filial encontrada</p>
				<p className="text-muted-foreground text-xs">
					Ajuste os filtros ou cadastre a primeira filial.
				</p>
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((b) => (
					<BranchCard branch={b} canMutate={canMutate} key={b.id} />
				))}
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
```

- [ ] **Step 3: Atualizar `branches/page.tsx`**

Substituir o import e uso de `BranchesTable` por `BranchCardGrid`. Diff exato:

```tsx
// Remover:
import { BranchesTable } from "./_components/branches-table";

// Adicionar:
import { BranchCardGrid } from "./_components/branch-card-grid";
```

E no JSX, substituir:

```tsx
// Remover:
<BranchesTable
  canMutate
  filters={filters}
  initial={firstPage.items}
  initialCursor={firstPage.nextCursor}
  key={JSON.stringify(filters)}
/>

// Adicionar:
<BranchCardGrid
  canMutate
  filters={filters}
  initial={firstPage.items}
  initialCursor={firstPage.nextCursor}
  key={JSON.stringify(filters)}
/>
```

- [ ] **Step 4: Deletar `branches-table.tsx`**

```bash
git rm apps/web/src/app/dashboard/branches/_components/branches-table.tsx
```

- [ ] **Step 5: Verificar tipos**

```bash
bun check-types
```

Esperado: zero erros. Se aparecer erro de import não resolvido em `branches-table.tsx`, já foi deletado — verificar se o page.tsx foi atualizado corretamente.

- [ ] **Step 6: Smoke test visual**

Abrir `http://localhost:3001/dashboard/branches`. Verificar:
- Grid de cards (não tabela)
- Monograma colorido: verde se `lowStock === 0`, âmbar se `lowStock > 0`
- KPI grid com 3 colunas: Equipe, SKUs ativos, Abaixo mín.
- Clicar no card navega para `/dashboard/branches/{id}`
- Dropdown de ações (MoreHorizontal) funciona e não dispara navegação do card

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-card.tsx \
        apps/web/src/app/dashboard/branches/_components/branch-card-grid.tsx \
        apps/web/src/app/dashboard/branches/page.tsx
git commit -m "feat: substituir tabela de filiais por BranchCard — monograma, KPI grid, clicável"
```

---

## Task 3: UserCard (substituir EntityCard no grid)

**Files:**
- Create: `apps/web/src/app/dashboard/users/_components/user-card.tsx`
- Modify: `apps/web/src/app/dashboard/users/_components/users-card-grid.tsx`

### Contexto

`UserListRow` é a interface existente (sem alteração):
```ts
interface UserListRow {
  branchIds: string[];
  branchNames: string[];
  createdAt: Date;
  email: string;
  id: string;
  image: string | null;
  lastLoginAt: Date | null;
  name: string;
  role: "super_admin" | "admin" | "manager" | "user";
  status: "pending" | "active" | "suspended";
}
```

`EntityCard` permanece inalterado — outros consumidores não são afetados.

Roles usam ícones Lucide (sem emoji): `Crown` (super_admin), `ShieldCheck` (admin), `Shield` (manager), `UserRound` (user).

- [ ] **Step 1: Criar `user-card.tsx`**

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import {
	Crown,
	Shield,
	ShieldCheck,
	UserRound,
	type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";

import type { UserListRow } from "../data";

const ROLE_META: Record<
	UserListRow["role"],
	{ icon: LucideIcon; avatarBg: string; avatarText: string; iconColor: string }
> = {
	super_admin: {
		icon: Crown,
		avatarBg: "bg-amber-950",
		avatarText: "text-amber-400",
		iconColor: "text-amber-400",
	},
	admin: {
		icon: ShieldCheck,
		avatarBg: "bg-blue-950",
		avatarText: "text-blue-400",
		iconColor: "text-blue-400",
	},
	manager: {
		icon: Shield,
		avatarBg: "bg-green-950",
		avatarText: "text-green-400",
		iconColor: "text-green-400",
	},
	user: {
		icon: UserRound,
		avatarBg: "bg-muted",
		avatarText: "text-muted-foreground",
		iconColor: "text-muted-foreground",
	},
};

const STATUS_VARIANT: Record<
	UserListRow["status"],
	"success" | "warning" | "destructive"
> = {
	active: "success",
	pending: "warning",
	suspended: "destructive",
};

const STATUS_LABEL: Record<UserListRow["status"], string> = {
	active: "Ativo",
	pending: "Pendente",
	suspended: "Suspenso",
};

const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

function formatRelative(date: Date): string {
	const diffMs = date.getTime() - Date.now();
	const diffDays = Math.round(diffMs / 86_400_000);
	if (Math.abs(diffDays) < 1) {
		const diffHours = Math.round(diffMs / 3_600_000);
		if (Math.abs(diffHours) < 1) {
			return RELATIVE.format(Math.round(diffMs / 60_000), "minute");
		}
		return RELATIVE.format(diffHours, "hour");
	}
	if (Math.abs(diffDays) < 30) return RELATIVE.format(diffDays, "day");
	return RELATIVE.format(Math.round(diffDays / 30), "month");
}

function initials(name: string): string {
	const parts = name.split(" ").filter(Boolean);
	const first = parts[0]?.[0]?.toUpperCase() ?? "";
	const last = parts.length > 1 ? (parts.at(-1)?.[0]?.toUpperCase() ?? "") : "";
	return first + last || "?";
}

const MAX_BRANCH_CHIPS = 3;

interface UserCardProps {
	user: UserListRow;
}

export function UserCard({ user }: UserCardProps) {
	const router = useRouter();
	const role = ROLE_META[user.role];
	const RoleIcon = role.icon;

	return (
		<div
			className="group flex cursor-pointer flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm"
			onClick={() => router.push(`/dashboard/users/${user.id}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/dashboard/users/${user.id}`);
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* Header: avatar + nome + role icon + status badge */}
			<div className="flex items-start gap-3">
				<div
					className={`flex size-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-[18px] font-bold ${role.avatarBg} ${role.avatarText}`}
				>
					{user.image ? (
						// biome-ignore lint/performance/noImgElement: avatar do usuário
						// biome-ignore lint/correctness/useImageSize: tamanho fixo via Tailwind
						<img alt="" className="size-full object-cover" src={user.image} />
					) : (
						initials(user.name)
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<RoleIcon
							aria-hidden
							className={`size-3.5 flex-shrink-0 ${role.iconColor}`}
						/>
						<span className="truncate font-semibold text-[14px] text-foreground leading-tight">
							{user.name}
						</span>
					</div>
					<p className="truncate text-muted-foreground text-xs">{user.email}</p>
				</div>
				<Badge className="flex-shrink-0" variant={STATUS_VARIANT[user.status]}>
					{STATUS_LABEL[user.status]}
				</Badge>
			</div>

			{/* Chips de filiais */}
			<div className="flex flex-wrap gap-1">
				{user.branchNames.length > 0 ? (
					<>
						{user.branchNames.slice(0, MAX_BRANCH_CHIPS).map((b) => (
							<span
								className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
								key={b}
							>
								{b}
							</span>
						))}
						{user.branchNames.length > MAX_BRANCH_CHIPS && (
							<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
								+{user.branchNames.length - MAX_BRANCH_CHIPS}
							</span>
						)}
					</>
				) : (
					<span className="text-[11px] text-muted-foreground/60">Sem filial</span>
				)}
			</div>

			{/* Footer */}
			<div className="border-t border-border pt-3">
				<span className="text-muted-foreground text-xs">
					{user.lastLoginAt
						? `Login ${formatRelative(user.lastLoginAt)}`
						: "Nunca logou"}
				</span>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Reescrever `users-card-grid.tsx`**

```tsx
"use client";

import { Users } from "lucide-react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchMoreUsersAction } from "../actions";
import type { UserListFilters, UserListRow } from "../data";
import { UserCard } from "./user-card";

interface Props {
	filters: UserListFilters;
	initialCursor: string | null;
	initialItems: UserListRow[];
}

export function UsersCardGrid({ initialItems, initialCursor, filters }: Props) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems,
		initialCursor,
		fetchPage: (cursor) => fetchMoreUsersAction(filters, cursor),
		resetKey,
	});

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-3 py-16 text-center">
				<Users aria-hidden className="size-12 opacity-40" />
				<p className="font-medium text-sm">Nenhum usuário encontrado</p>
				<p className="text-muted-foreground text-xs">
					Ajuste os filtros ou o status selecionado.
				</p>
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((user) => (
					<UserCard key={user.id} user={user} />
				))}
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
```

- [ ] **Step 3: Verificar tipos**

```bash
bun check-types
```

Esperado: zero erros.

- [ ] **Step 4: Smoke test visual**

Abrir `http://localhost:3001/dashboard/users`. Verificar:
- Avatar quadrado-arredondado colorido por role
- Ícone Lucide de role ao lado do nome (sem emoji)
- Status badge no canto: verde (Ativo), âmbar (Pendente), vermelho (Suspenso)
- Chips de filiais
- Clicar no card navega para `/dashboard/users/{id}`
- `EntityCard` em outras partes do app não foi afetado (abrir qualquer outra página que use EntityCard)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/_components/user-card.tsx \
        apps/web/src/app/dashboard/users/_components/users-card-grid.tsx
git commit -m "feat: criar UserCard com avatar por role, ícone Lucide e status badge"
```
