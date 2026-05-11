# Listagens em cards — Tools / Estoque Geral / Estoque por Filial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir as tabelas de `/dashboard/tools`, `/dashboard/stock` e `/dashboard/stock/branches` por grids de cards inspirados em `/dashboard/promotions`.

**Architecture:** Um `ToolCard` compartilhado em `apps/web/src/app/dashboard/_components/` com duas variantes (`catalog`, `stock-overview`), e um `BranchStockCard` próprio para estoque por filial. Páginas existentes apenas mapeiam suas linhas para `ToolCardData` e trocam o componente de listagem. Server actions, schemas, capabilities e helpers permanecem intocados.

**Tech Stack:** Next 16 (App Router, RSC) · React 19 · Tailwind 4 · shadcn/ui · Drizzle 0.45 + Postgres (raw SQL via `db.execute`) · Bun · Biome/Ultracite.

**Spec de referência:** `docs/superpowers/specs/2026-05-11-cards-listings-design.md`.

**Convenções do projeto que afetam este plano:**
- Suite de testes não existe ainda; validação = `bun check-types` + `bun fix` + smoke manual em `bun dev:web`. Cada task substitui o passo "Write the failing test" pela validação correspondente (lint + types + smoke da rota).
- Commits exigem aprovação explícita do usuário (rule `ask` em `Bash(git commit:*)`). Inclua o `git add` no passo de commit, mas pause antes de executar `git commit` esperando o ok do usuário.
- `docs/superpowers/` está em `.gitignore` — este plano não é commitado.
- Auto-format roda como PostToolUse hook após `Write`/`Edit`; pode reordenar imports. Se um Edit subsequente falhar com "string não encontrada", re-leia o arquivo.

---

## Mapa de arquivos

**Criados:**
- `apps/web/src/app/dashboard/_components/tool-card.tsx` — componente `ToolCard` + tipo `ToolCardData`.
- `apps/web/src/app/dashboard/_components/tool-card-grid.tsx` — wrapper `<div>` grid responsivo.
- `apps/web/src/app/dashboard/tools/_components/tool-card-actions.tsx` — botões edit/stock/delete (extrai lógica de `tools-table.tsx`).
- `apps/web/src/app/dashboard/stock/_components/stock-card-actions.tsx` — botão "Gerenciar estoque por filial".
- `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx` — card por variante.
- `apps/web/src/app/dashboard/stock/_components/branch-stock-card-grid.tsx` — grid wrapper.

**Modificados:**
- `apps/web/src/app/dashboard/tools/page.tsx` — query ganha `branches_breakdown`, `reorder_count`, `variant_voltages`; substitui `<ToolsTable>` por `<ToolCardGrid variant="catalog">`.
- `apps/web/src/app/dashboard/stock/page.tsx` — `params.ordem` aceita `"urgencia"`; default sort por urgência; substitui `<StockTable>` por `<ToolCardGrid variant="stock-overview">`.
- `apps/web/src/app/dashboard/stock/_components/stock-filters.tsx` — adiciona opção "Urgência" (default) no select Ordenar.
- `apps/web/src/app/dashboard/stock/branches/page.tsx` — substitui `<BranchStockTable>` por `<BranchStockCardGrid>`.

**Deletados:**
- `apps/web/src/app/dashboard/tools/_components/tools-table.tsx`
- `apps/web/src/app/dashboard/stock/_components/stock-table.tsx`
- `apps/web/src/app/dashboard/stock/_components/branch-stock-table.tsx`

---

## Task 1 — `ToolCardData` + `ToolCard` (variantes `catalog` e `stock-overview`)

**Files:**
- Create: `apps/web/src/app/dashboard/_components/tool-card.tsx`

- [ ] **Step 1: Criar o componente com tipo e ambas variantes**

```tsx
// apps/web/src/app/dashboard/_components/tool-card.tsx
import { Badge } from "@emach/ui/components/badge";
import { AlertTriangleIcon } from "lucide-react";
import Link from "next/link";

import {
	TOOL_STATUS_LABELS,
	type ToolStatusValue,
} from "@/app/dashboard/tools/_components/tool-schema";

const STATUS_BADGE_VARIANT: Record<
	ToolStatusValue,
	"destructive" | "outline" | "secondary" | "success"
> = {
	active: "success",
	draft: "secondary",
	discontinued: "outline",
	out_of_stock: "destructive",
};

const MAX_VARIANT_CHIPS = 4;
const MAX_BRANCH_BREAKDOWN = 3;

export interface ToolCardBranchSummary {
	branchId: string;
	branchName: string;
	quantity: number;
}

export interface ToolCardData {
	id: string;
	name: string;
	slug: string | null;
	imageUrl: string | null;
	sku: string | null;
	voltage: string | null;
	variantCount: number;
	variantSummaries: string[];
	primaryCategoryName: string | null;
	supplierName: string | null;
	status: ToolStatusValue;
	visibleOnSite: boolean;
	totalStock: number;
	reorderCount: number;
	branches: ToolCardBranchSummary[];
}

export type ToolCardVariant = "catalog" | "stock-overview";

interface ToolCardProps {
	tool: ToolCardData;
	variant: ToolCardVariant;
	canMutate: boolean;
	actions?: React.ReactNode;
}

function formatMeta(tool: ToolCardData): string {
	const parts: string[] = [];
	if (tool.sku) {
		parts.push(`SKU ${tool.sku}`);
	}
	if (tool.voltage) {
		parts.push(tool.voltage);
	}
	if (tool.supplierName) {
		parts.push(tool.supplierName);
	}
	return parts.join(" · ");
}

function formatBranches(branches: ToolCardBranchSummary[]): string {
	const top = branches
		.slice()
		.sort((a, b) => b.quantity - a.quantity)
		.slice(0, MAX_BRANCH_BREAKDOWN);
	const rest = branches.length - top.length;
	const base = top
		.map((b) => `${b.branchName} ${b.quantity}`)
		.join(" · ");
	return rest > 0 ? `${base} · +${rest} filiais` : base;
}

export function ToolCard({
	tool,
	variant,
	canMutate,
	actions,
}: ToolCardProps) {
	const visibleVariants = tool.variantSummaries.slice(0, MAX_VARIANT_CHIPS);
	const overflowVariants = tool.variantSummaries.length - visibleVariants.length;
	const showVariantsBlock = tool.variantCount > 1 && tool.variantSummaries.length > 0;
	const showReorderHeader = variant === "stock-overview" && tool.reorderCount > 0;
	const stockIsCritical = tool.reorderCount > 0 && tool.totalStock === 0;

	return (
		<div className="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-colors hover:border-border/80">
			<div className="overflow-hidden rounded-[8px] border border-border">
				{tool.imageUrl ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
					<img
						alt={tool.name}
						className="aspect-[16/9] w-full object-cover"
						src={tool.imageUrl}
					/>
				) : (
					<div className="aspect-[16/9] w-full border-dashed bg-muted/40" />
				)}
			</div>

			<div className="flex items-start justify-between gap-2">
				{tool.primaryCategoryName ? (
					<Badge variant="outline">{tool.primaryCategoryName}</Badge>
				) : (
					<span />
				)}
				{showReorderHeader ? (
					<Badge variant="warning">
						<AlertTriangleIcon aria-hidden="true" className="size-3" />
						Repor{tool.reorderCount > 1 ? ` (${tool.reorderCount})` : ""}
					</Badge>
				) : (
					<Badge variant={STATUS_BADGE_VARIANT[tool.status] ?? "outline"}>
						{TOOL_STATUS_LABELS[tool.status] ?? tool.status}
					</Badge>
				)}
			</div>

			<div className="flex flex-col gap-1">
				<Link
					className="line-clamp-2 font-medium font-serif text-[17px] text-foreground leading-[1.3] hover:underline"
					href={`/dashboard/tools/${tool.id}`}
				>
					{tool.name}
				</Link>
				<p className="line-clamp-1 text-muted-foreground text-xs">
					{formatMeta(tool) || "—"}
				</p>
				{variant === "catalog" && (
					<p className="text-muted-foreground text-xs">
						{tool.visibleOnSite ? "Visível no site" : "Oculto no site"}
					</p>
				)}
			</div>

			{showVariantsBlock && (
				<div className="flex flex-col gap-1">
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Variantes
					</span>
					<div className="flex flex-wrap gap-1">
						{visibleVariants.map((v) => (
							<span
								className="max-w-full truncate rounded bg-muted px-2 py-0.5 text-xs"
								key={v}
								title={v}
							>
								{v}
							</span>
						))}
						{overflowVariants > 0 && (
							<span className="rounded bg-muted px-2 py-0.5 text-muted-foreground text-xs">
								+{overflowVariants}
							</span>
						)}
					</div>
				</div>
			)}

			<hr className="border-border" />

			<div className="flex items-end justify-between gap-3">
				<div>
					<div className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Estoque
						{tool.branches.length > 0
							? ` · ${tool.branches.length} ${tool.branches.length === 1 ? "filial" : "filiais"}`
							: ""}
					</div>
					<div
						className={`font-medium text-[28px] tabular-nums leading-none ${stockIsCritical ? "text-destructive" : "text-primary"}`}
					>
						{tool.totalStock}
					</div>
					{tool.branches.length > 0 && (
						<div className="mt-1 line-clamp-1 text-muted-foreground text-xs">
							{formatBranches(tool.branches)}
						</div>
					)}
				</div>
				{canMutate && actions ? (
					<div className="flex shrink-0 items-center gap-2">{actions}</div>
				) : null}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Lint + types**

Run: `bun --filter web check-types && bun fix apps/web/src/app/dashboard/_components/tool-card.tsx`
Expected: zero erros.

- [ ] **Step 3: Stage e pausa para aprovação de commit**

Run: `git add apps/web/src/app/dashboard/_components/tool-card.tsx`
Mensagem proposta (NÃO executar `git commit` sem aprovação): `feat: card compartilhado ToolCard para listagens`

---

## Task 2 — `ToolCardGrid` wrapper

**Files:**
- Create: `apps/web/src/app/dashboard/_components/tool-card-grid.tsx`

- [ ] **Step 1: Criar wrapper grid responsivo**

```tsx
// apps/web/src/app/dashboard/_components/tool-card-grid.tsx
import {
	ToolCard,
	type ToolCardData,
	type ToolCardVariant,
} from "./tool-card";

interface ToolCardGridProps {
	tools: ToolCardData[];
	variant: ToolCardVariant;
	canMutate: boolean;
	renderActions?: (tool: ToolCardData) => React.ReactNode;
}

export function ToolCardGrid({
	tools,
	variant,
	canMutate,
	renderActions,
}: ToolCardGridProps) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{tools.map((tool) => (
				<ToolCard
					actions={renderActions?.(tool)}
					canMutate={canMutate}
					key={tool.id}
					tool={tool}
					variant={variant}
				/>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Lint + types**

Run: `bun --filter web check-types && bun fix apps/web/src/app/dashboard/_components/tool-card-grid.tsx`
Expected: zero erros.

- [ ] **Step 3: Stage e pausa para aprovação**

Run: `git add apps/web/src/app/dashboard/_components/tool-card-grid.tsx`
Mensagem proposta: `feat: ToolCardGrid responsivo 1/2/3/4 colunas`

---

## Task 3 — Página `/dashboard/tools` migra para cards

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/page.tsx`
- Create: `apps/web/src/app/dashboard/tools/_components/tool-card-actions.tsx`
- Delete: `apps/web/src/app/dashboard/tools/_components/tools-table.tsx`

- [ ] **Step 1: Criar `tool-card-actions.tsx`**

```tsx
// apps/web/src/app/dashboard/tools/_components/tool-card-actions.tsx
"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Boxes, Pencil } from "lucide-react";
import Link from "next/link";

import { DeleteToolDialog } from "./delete-tool-dialog";

interface ToolCardActionsProps {
	toolId: string;
	toolName: string;
}

export function ToolCardActions({ toolId, toolName }: ToolCardActionsProps) {
	return (
		<>
			<Link
				aria-label={`Gerenciar estoque de ${toolName}`}
				className={buttonVariants({ size: "icon-sm", variant: "secondary" })}
				href={`/dashboard/tools/${toolId}/stock`}
			>
				<Boxes aria-hidden className="size-3.5" />
			</Link>
			<Link
				aria-label={`Editar ferramenta ${toolName}`}
				className={buttonVariants({ size: "icon-sm", variant: "secondary" })}
				href={`/dashboard/tools/${toolId}/edit`}
			>
				<Pencil aria-hidden className="size-3.5" />
			</Link>
			<DeleteToolDialog toolId={toolId} toolName={toolName} />
		</>
	);
}
```

- [ ] **Step 2: Atualizar `tools/page.tsx` — query + render**

A query existente já retorna `image_url`, `total_stock`, etc. Adicionar três campos: `variant_voltages` (array), `reorder_count` (int) e `branches_breakdown` (json).

Editar `fetchTools` em `apps/web/src/app/dashboard/tools/page.tsx` para que a query SQL passe a incluir:

```sql
(
	SELECT COALESCE(array_agg(DISTINCT tv.voltage::text ORDER BY tv.voltage::text), ARRAY[]::text[])
	FROM tool_variant tv
	WHERE tv.tool_id = t.id
) AS variant_voltages,
COALESCE((
	SELECT COUNT(*)::int FROM stock_level sl
	JOIN tool_variant tv ON tv.id = sl.variant_id
	WHERE tv.tool_id = t.id
		AND sl.reorder_point > 0
		AND sl.quantity <= sl.reorder_point
), 0) AS reorder_count,
COALESCE((
	SELECT json_agg(
		json_build_object(
			'branch_id', b.id,
			'branch_name', b.name,
			'quantity', branch_total
		)
		ORDER BY b.name ASC
	)
	FROM (
		SELECT b2.id AS bid, SUM(sl2.quantity)::int AS branch_total
		FROM stock_level sl2
		JOIN tool_variant tv2 ON tv2.id = sl2.variant_id
		JOIN branch b2 ON b2.id = sl2.branch_id
		WHERE tv2.tool_id = t.id
		GROUP BY b2.id
	) g
	JOIN branch b ON b.id = g.bid
), '[]'::json) AS branches_breakdown
```

Atualizar o tipo genérico de `db.execute<{ ... }>` para incluir `variant_voltages: string[]`, `reorder_count: number`, `branches_breakdown: Array<{ branch_id: string; branch_name: string; quantity: number; }> | null`.

Substituir o map final por:

```ts
return rows.rows.map<ToolCardData>((r) => ({
	id: r.id,
	name: r.name,
	slug: r.slug,
	imageUrl: r.image_url,
	sku: r.default_sku,
	voltage: r.default_voltage,
	variantCount: Number(r.variant_count ?? 0),
	variantSummaries: r.variant_voltages ?? [],
	primaryCategoryName: r.primary_category_name,
	supplierName: r.supplier_name,
	status: r.status as ToolStatusValue,
	visibleOnSite: r.visible_on_site,
	totalStock: Number(r.total_stock ?? 0),
	reorderCount: Number(r.reorder_count ?? 0),
	branches: (r.branches_breakdown ?? []).map((b) => ({
		branchId: b.branch_id,
		branchName: b.branch_name,
		quantity: b.quantity,
	})),
}));
```

Trocar o import e o uso do componente de listagem:

```tsx
// remover:
// import { type ToolRow, ToolsTable } from "./_components/tools-table";
// adicionar:
import {
	ToolCardGrid,
} from "@/app/dashboard/_components/tool-card-grid";
import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import type { ToolStatusValue } from "./_components/tool-schema";
import { ToolCardActions } from "./_components/tool-card-actions";

// e no JSX, em vez de <ToolsTable canMutate={canMutate} tools={tools} />:
<ToolCardGrid
	canMutate={canMutate}
	renderActions={(tool) => (
		<ToolCardActions toolId={tool.id} toolName={tool.name} />
	)}
	tools={tools}
	variant="catalog"
/>
```

Renomear o tipo de retorno de `fetchTools` para `Promise<ToolCardData[]>`.

- [ ] **Step 3: Deletar `tools-table.tsx`**

Run: `rm apps/web/src/app/dashboard/tools/_components/tools-table.tsx`

- [ ] **Step 4: Types + lint**

Run: `bun --filter web check-types && bun fix apps/web/src/app/dashboard/tools`
Expected: zero erros (em particular: nenhuma referência remanescente a `ToolsTable` ou `ToolRow`).

- [ ] **Step 5: Smoke**

Run em terminal separado: `bun dev:web`
Abrir `http://localhost:3001/dashboard/tools` (login admin).
Verificar:
- Grid renderiza 4 colunas em viewport >=1280px.
- Imagem (ou placeholder dashed) aparece em cada card.
- Nome é Link funcional para o detalhe.
- Badges de categoria + status aparecem no header.
- Chips de variantes só aparecem quando `variantCount > 1`.
- Número de estoque grande em terracotta; breakdown SP/RJ/etc abaixo.
- Botões edit/stock/delete funcionam quando logado como admin.
- Filtros (`ToolFilters`) ainda filtram corretamente.

Se algo SSR falhar: `mcp__next-devtools__nextjs_call 3001 get_errors`.

- [ ] **Step 6: Stage + pausa**

Run: `git add apps/web/src/app/dashboard/tools/`
Mensagem proposta: `feat: cards na listagem de ferramentas`

---

## Task 4 — Página `/dashboard/stock` migra para cards + sort por urgência

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/page.tsx`
- Modify: `apps/web/src/app/dashboard/stock/_components/stock-filters.tsx`
- Create: `apps/web/src/app/dashboard/stock/_components/stock-card-actions.tsx`
- Delete: `apps/web/src/app/dashboard/stock/_components/stock-table.tsx`

- [ ] **Step 1: Criar `stock-card-actions.tsx`**

```tsx
// apps/web/src/app/dashboard/stock/_components/stock-card-actions.tsx
"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Boxes } from "lucide-react";
import Link from "next/link";

interface StockCardActionsProps {
	toolId: string;
	toolName: string;
}

export function StockCardActions({ toolId, toolName }: StockCardActionsProps) {
	return (
		<Link
			aria-label={`Gerenciar estoque de ${toolName}`}
			className={buttonVariants({ size: "icon-sm", variant: "secondary" })}
			href={`/dashboard/tools/${toolId}/stock`}
		>
			<Boxes aria-hidden className="size-3.5" />
		</Link>
	);
}
```

- [ ] **Step 2: Atualizar `stock/page.tsx` — aceitar `"urgencia"`, default por urgência, render cards**

Editar `StockPageParams` para incluir `"urgencia"`:

```ts
interface StockPageParams {
	categoryId?: string;
	ordem?: "urgencia" | "nome" | "maior" | "menor";
	q?: string;
	search?: string;
}
```

Editar o cálculo de `orderClause` para:

```ts
let orderClause = sql`ORDER BY reorder_count DESC, total_stock ASC, t.name ASC`;
if (params.ordem === "nome") {
	orderClause = sql`ORDER BY t.name ASC`;
} else if (params.ordem === "maior") {
	orderClause = sql`ORDER BY total_stock DESC NULLS LAST, t.name ASC`;
} else if (params.ordem === "menor") {
	orderClause = sql`ORDER BY total_stock ASC NULLS FIRST, t.name ASC`;
}
// ausência ou "urgencia" → default acima
```

Adicionar `variant_voltages` na query (mesmo SQL do Task 3 Step 2). `total_stock`, `reorder_count`, `branches_breakdown`, `image_url` etc já existem.

Editar `StockPageRow` para incluir `variant_voltages: string[]`. Editar o map final para retornar `ToolCardData[]`:

```ts
return result.rows.map<ToolCardData>((r) => ({
	id: r.id,
	name: r.name,
	slug: r.slug,
	imageUrl: r.image_url,
	sku: r.default_sku,
	voltage: r.default_voltage,
	variantCount: Number(r.variant_count ?? 0),
	variantSummaries: r.variant_voltages ?? [],
	primaryCategoryName: null,
	supplierName: null,
	status: "active",
	visibleOnSite: true,
	totalStock: Number(r.total_stock ?? 0),
	reorderCount: Number(r.reorder_count ?? 0),
	branches: (r.branches_breakdown ?? []).map((b) => ({
		branchId: b.branch_id,
		branchName: b.branch_name,
		quantity: b.quantity,
	})),
}));
```

> Nota: status/categoria/supplier não são exibidos na variante `stock-overview` (o header da direita usa reorder badge ou fallback status), mas a interface exige preencher. `status: "active"` + fallback funciona porque `showReorderHeader` cobre quando há reposição pendente. Se quiser exibir categoria, adicionar `primary_category_name` na query — opcional, fora do escopo principal.

> Para também mostrar a categoria primária na variante stock-overview, adicionar à query (mesmo subselect do Task 3) e popular `primaryCategoryName`. Recomendado para paridade visual.

Substituir uso do componente:

```tsx
import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { ToolCardGrid } from "@/app/dashboard/_components/tool-card-grid";
import { StockCardActions } from "./_components/stock-card-actions";
import { requireCurrentSession } from "@/lib/session";

// no body:
const session = await requireCurrentSession();
const role = session.user.role ?? "user";
const canMutate = role === "admin" || role === "manager";

// e no JSX:
<ToolCardGrid
	canMutate={canMutate}
	renderActions={(tool) => (
		<StockCardActions toolId={tool.id} toolName={tool.name} />
	)}
	tools={rows}
	variant="stock-overview"
/>
```

- [ ] **Step 3: Atualizar `stock-filters.tsx` para ter "Urgência"**

Abrir `apps/web/src/app/dashboard/stock/_components/stock-filters.tsx`. Encontrar o select de "Ordenar" e adicionar a primeira opção:

```tsx
<option value="urgencia">Urgência (padrão)</option>
<option value="nome">Nome</option>
<option value="maior">Maior estoque</option>
<option value="menor">Menor estoque</option>
```

Garantir que o componente leia/escreva o searchParam `ordem` corretamente. Default visível quando ausente: rotular como "Urgência (padrão)".

> Se o componente atual usar shadcn `Select` em vez de `<select>` nativo, replicar o mesmo padrão dentro do `SelectContent`. Manter as outras opções em ordem: urgencia, nome, maior, menor.

- [ ] **Step 4: Deletar `stock-table.tsx`**

Run: `rm apps/web/src/app/dashboard/stock/_components/stock-table.tsx`

- [ ] **Step 5: Types + lint**

Run: `bun --filter web check-types && bun fix apps/web/src/app/dashboard/stock`
Expected: zero erros.

- [ ] **Step 6: Smoke**

Em `bun dev:web`, abrir `http://localhost:3001/dashboard/stock`.
Verificar:
- Cards renderizam em grid 4col em desktop.
- Default sort: ferramentas com `reorderCount > 0` no topo, depois menor estoque, depois nome.
- Trocar filtro Ordenar para "Maior estoque" reordena.
- Badge `Repor (N)` aparece no header de cards com reposição pendente.
- Botão "Gerenciar estoque" leva para `/dashboard/tools/{id}/stock`.

- [ ] **Step 7: Stage + pausa**

Run: `git add apps/web/src/app/dashboard/stock/`
Mensagem proposta: `feat: cards na listagem de estoque geral com sort urgência`

---

## Task 5 — `BranchStockCard` (componente)

**Files:**
- Create: `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`

- [ ] **Step 1: Criar componente**

```tsx
// apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import { Eye } from "lucide-react";
import Link from "next/link";

import type { BranchStockRow } from "../branch-stock-data";
import { BranchStockThresholdInputs } from "./branch-stock-threshold-inputs";
import { StockAdjustButton } from "./stock-adjust-button";

interface BranchStockCardProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	row: BranchStockRow;
}

function StatusBadge({
	minQty,
	quantity,
	reorderPoint,
}: {
	minQty: number;
	quantity: number;
	reorderPoint: number;
}) {
	if (minQty > 0 && quantity <= minQty) {
		return <Badge variant="destructive">Crítico</Badge>;
	}
	if (reorderPoint > 0 && quantity > minQty && quantity <= reorderPoint) {
		return <Badge variant="warning">Repor</Badge>;
	}
	return null;
}

export function BranchStockCard({
	branchId,
	branchName,
	canMutate,
	row,
}: BranchStockCardProps) {
	const stockIsCritical = row.minQty > 0 && row.quantity <= row.minQty;

	return (
		<div className="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-colors hover:border-border/80">
			<div className="overflow-hidden rounded-[8px] border border-border">
				{row.imageUrl ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
					<img
						alt={row.toolName}
						className="aspect-[16/9] w-full object-cover"
						src={row.imageUrl}
					/>
				) : (
					<div className="aspect-[16/9] w-full border-dashed bg-muted/40" />
				)}
			</div>

			<div className="flex items-start justify-between gap-2">
				<Link
					className="line-clamp-1 rounded bg-muted px-2 py-0.5 text-xs hover:underline"
					href={`/dashboard/tools/${row.toolId}`}
					title={row.toolName}
				>
					{row.toolName}
				</Link>
				<StatusBadge
					minQty={row.minQty}
					quantity={row.quantity}
					reorderPoint={row.reorderPoint}
				/>
			</div>

			<h3 className="font-medium font-serif text-[15px] text-foreground leading-[1.3]">
				SKU {row.sku}
				{row.voltage ? ` · ${row.voltage}` : ""}
			</h3>

			<hr className="border-border" />

			<div className="flex items-end justify-between gap-3">
				<div>
					<div className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Qtd nesta filial
					</div>
					<div
						className={`font-medium text-[26px] tabular-nums leading-none ${stockIsCritical ? "text-destructive" : "text-primary"}`}
					>
						{row.quantity}
					</div>
				</div>
				{canMutate && (
					<div>
						<div className="text-[10px] text-muted-foreground uppercase tracking-wider">
							Min · Reposição
						</div>
						<div className="mt-1 flex justify-end">
							<BranchStockThresholdInputs
								branchId={branchId}
								initialMinQty={row.minQty}
								initialReorderPoint={row.reorderPoint}
								variantId={row.variantId}
							/>
						</div>
					</div>
				)}
			</div>

			<div className="flex items-center justify-between gap-2 border-border border-t pt-3">
				<Link
					aria-label={`Ver detalhes de estoque de ${row.toolName}`}
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href={`/dashboard/tools/${row.toolId}/stock`}
				>
					<Eye aria-hidden className="size-3.5" />
					Ver
				</Link>
				{canMutate && (
					<StockAdjustButton
						branchId={branchId}
						branchName={branchName}
						currentQty={row.quantity}
						variantId={row.variantId}
					/>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Types + lint**

Run: `bun --filter web check-types && bun fix apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`
Expected: zero erros.

- [ ] **Step 3: Stage + pausa**

Run: `git add apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`
Mensagem proposta: `feat: BranchStockCard por variante`

---

## Task 6 — `BranchStockCardGrid` + página `/dashboard/stock/branches`

**Files:**
- Create: `apps/web/src/app/dashboard/stock/_components/branch-stock-card-grid.tsx`
- Modify: `apps/web/src/app/dashboard/stock/branches/page.tsx`
- Delete: `apps/web/src/app/dashboard/stock/_components/branch-stock-table.tsx`

- [ ] **Step 1: Criar wrapper grid**

```tsx
// apps/web/src/app/dashboard/stock/_components/branch-stock-card-grid.tsx
import type { BranchStockRow } from "../branch-stock-data";
import { BranchStockCard } from "./branch-stock-card";

interface BranchStockCardGridProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	rows: BranchStockRow[];
}

export function BranchStockCardGrid({
	branchId,
	branchName,
	canMutate,
	rows,
}: BranchStockCardGridProps) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{rows.map((row) => (
				<BranchStockCard
					branchId={branchId}
					branchName={branchName}
					canMutate={canMutate}
					key={row.variantId}
					row={row}
				/>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Atualizar `stock/branches/page.tsx`**

Trocar import:

```tsx
// remover:
// import { BranchStockTable } from "../_components/branch-stock-table";
// adicionar:
import { BranchStockCardGrid } from "../_components/branch-stock-card-grid";
```

Trocar JSX:

```tsx
<BranchStockCardGrid
	branchId={selectedBranch.id}
	branchName={selectedBranch.name}
	canMutate={canMutate}
	rows={rows}
/>
```

- [ ] **Step 3: Deletar `branch-stock-table.tsx`**

Run: `rm apps/web/src/app/dashboard/stock/_components/branch-stock-table.tsx`

- [ ] **Step 4: Types + lint**

Run: `bun --filter web check-types && bun fix apps/web/src/app/dashboard/stock`
Expected: zero erros.

- [ ] **Step 5: Smoke**

Em `bun dev:web`, abrir `http://localhost:3001/dashboard/stock/branches`.
Verificar:
- Tabs de filial funcionam.
- Cards por variante (não por ferramenta) — uma variante = um card.
- Chip do nome do tool é Link clicável.
- Badge Crítico/Repor aparece no header quando aplicável.
- Inputs min/reorder inline editáveis (apenas admin).
- Botão Ajustar abre o dialog (`StockAdjustButton`).
- Botão Ver leva para `/dashboard/tools/{toolId}/stock`.
- `BranchSearchInput` filtra a lista.

- [ ] **Step 6: Stage + pausa**

Run: `git add apps/web/src/app/dashboard/stock/`
Mensagem proposta: `feat: cards por variante em estoque por filial`

---

## Task 7 — Verificação cruzada e visual review

**Files:** nenhum modificado nesta task — só verificação.

- [ ] **Step 1: Type check do workspace inteiro**

Run: `bun check-types`
Expected: zero erros em todos os workspaces.

- [ ] **Step 2: Lint completo**

Run: `bun check`
Expected: zero erros e zero warnings.

- [ ] **Step 3: Comparação visual com `/dashboard/promotions`**

Em `bun dev:web`, abrir lado a lado:
- `/dashboard/promotions`
- `/dashboard/tools`
- `/dashboard/stock`
- `/dashboard/stock/branches`

Verificar paridade de:
- Border radius (10px).
- Ring shadow (`0 0 0 1px rgba(20,20,19,0.04)`).
- Gap entre cards (16px = `gap-4`).
- Cor do título (serif weight 500, near black).
- Cor da métrica destacada (terracotta).
- Espaçamento interno do card (`p-4`).

Se algum desvio for visualmente óbvio, corrigir no `ToolCard` ou `BranchStockCard` e re-rodar `bun fix`.

- [ ] **Step 4: Smoke de regressão em rotas correlatas**

Verificar que rotas que não foram tocadas continuam funcionando:
- `/dashboard/tools/[id]` — detalhe.
- `/dashboard/tools/[id]/stock` — stock por ferramenta (continua existindo).
- `/dashboard/tools/new` — criação.
- `/dashboard/branches/[id]/stock` — rota da filial.

- [ ] **Step 5: Stage e mensagem final**

Se algum ajuste foi feito no Step 3 ou 4:

Run: `git add apps/web/src/app/dashboard/`
Mensagem proposta: `style: paridade visual entre cards de listagem e promotions`

Caso contrário, nada para commitar.

---

## Self-review

**1. Cobertura do spec.**
- Decisão #1 (cards substituem tabelas) → Tasks 3, 4, 6 deletam as tabelas. ✓
- Decisão #2 (densidade rich) → Task 1 implementa todos os blocos: imagem, badges header, nome serif, meta, variantes chips, divider, estoque grande, breakdown filiais. ✓
- Decisão #3 (1 card por variante em branches) → Tasks 5 e 6 usam `variantId` como key e SKU+voltage como nome. ✓
- Decisão #4 (mesmo card + sort urgência em Stock Geral) → Task 4 reusa `ToolCardGrid` com `variant="stock-overview"` e altera `orderClause` default + filtro. ✓
- Decisão #5 (4 col fixas) → Task 2 wrapper usa `xl:grid-cols-4`. ✓

**2. Placeholders.** Nenhum "TBD"/"TODO"/"similar to". Cada step traz o código que precisa rodar.

**3. Consistência de tipos.** `ToolCardData` definido na Task 1 é o mesmo consumido por Tasks 3 e 4. `BranchStockRow` (já existente em `branch-stock-data.ts`) é o tipo consumido por Tasks 5 e 6 — nenhum tipo novo entre elas. `ToolCardVariant` exportado pelo `tool-card.tsx` e consumido pelo `tool-card-grid.tsx`. Sem divergência de nomes.

**4. Pendências do backlog do spec.** Nenhuma entra neste plano (intencional — fora de escopo).

---

## Execução

Plano salvo em `docs/superpowers/plans/2026-05-11-cards-listings.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — eu disparo um subagent fresh por task, reviso entre tasks, iteração rápida.

**2. Inline Execution** — executo as tasks nesta sessão usando `executing-plans`, batch com checkpoints.

Qual abordagem?
