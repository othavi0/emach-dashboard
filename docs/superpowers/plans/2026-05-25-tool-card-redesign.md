# Tool Card Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar `ToolCard` com overlay de badges na imagem, rodapé mínimo ("Estoque: N"), card inteiro clicável e altura uniforme entre cards com e sem variantes.

**Architecture:** Reescrita de `tool-card.tsx` (único arquivo modificado). Adiciona `"use client"` + `useRouter` para navegação no card-click. Ações envolvidas em `stopPropagation`. Nenhuma alteração de interface de dados (`ToolCardData` inalterado) nem nos componentes consumidores.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS, shadcn/ui Badge, `next/navigation` useRouter.

---

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/_components/tool-card.tsx` | **Modificar** | Reescrita completa da UI — único arquivo tocado |
| `apps/web/src/app/dashboard/_components/tool-card-grid.tsx` | Inalterado | Nenhuma alteração |
| `apps/web/src/app/dashboard/tools/_components/tool-card-actions.tsx` | Inalterado | `stopPropagation` aplicado no wrapper em tool-card.tsx |
| `apps/web/src/app/dashboard/stock/_components/stock-card-actions.tsx` | Inalterado | Idem |

---

## Task 1: Reescrever `tool-card.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/tool-card.tsx`

### Contexto

O arquivo atual tem `p-4` no wrapper externo (padding envolve a imagem). Na nova estrutura a imagem é edge-to-edge — o padding migra para um `<div>` interno (`px-4 pb-4 pt-3`). As funções `VariantsBlock`, `StockFooter` e `formatBranches` são removidas (inlinadas ou descartadas).

Ambos os contextos de uso — `ToolsInfinite` (`variant="catalog"`) e `StockInfinite` (`variant="stock-overview"`) — já são `"use client"`, então adicionar `"use client"` ao card é seguro.

- [ ] **Step 1: Substituir o conteúdo completo de `tool-card.tsx`**

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { AlertTriangleIcon } from "lucide-react";
import { useRouter } from "next/navigation";

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

export interface ToolCardBranchSummary {
	branchId: string;
	branchName: string;
	quantity: number;
}

export interface ToolCardData {
	branches: ToolCardBranchSummary[];
	id: string;
	imageUrl: string | null;
	name: string;
	primaryCategoryName: string | null;
	reorderCount: number;
	sku: string | null;
	slug: string | null;
	status: ToolStatusValue;
	supplierName: string | null;
	totalStock: number;
	variantCount: number;
	variantSummaries: string[];
	visibleOnSite: boolean;
	voltage: string | null;
}

export type ToolCardVariant = "catalog" | "stock-overview";

interface ToolCardProps {
	actions?: React.ReactNode;
	canMutate: boolean;
	tool: ToolCardData;
	variant: ToolCardVariant;
}

function formatMeta(tool: ToolCardData): string {
	const parts: string[] = [];
	if (tool.sku) parts.push(`SKU ${tool.sku}`);
	if (tool.voltage) parts.push(tool.voltage);
	if (tool.supplierName) parts.push(tool.supplierName);
	return parts.join(" · ");
}

export function ToolCard({ tool, variant, canMutate, actions }: ToolCardProps) {
	const router = useRouter();
	const showVariantsBlock =
		tool.variantCount > 1 && tool.variantSummaries.length > 0;
	const showReorderHeader =
		variant === "stock-overview" && tool.reorderCount > 0;
	const stockIsCritical = tool.totalStock === 0;

	return (
		<div
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm"
			onClick={() => router.push(`/dashboard/tools/${tool.id}`)}
		>
			{/* Imagem com badges sobrepostos */}
			<div className="relative overflow-hidden">
				{tool.imageUrl ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
					<img
						alt={tool.name}
						className="aspect-[16/9] w-full object-cover transition-[filter] duration-150 group-hover:brightness-110"
						src={tool.imageUrl}
					/>
				) : (
					<div className="aspect-[16/9] w-full border-dashed bg-muted/40" />
				)}
				{tool.primaryCategoryName && (
					<div className="absolute bottom-2 left-2">
						<Badge
							className="bg-card/80 text-[10px] backdrop-blur-sm"
							variant="outline"
						>
							{tool.primaryCategoryName}
						</Badge>
					</div>
				)}
				<div className="absolute right-2 top-2">
					{showReorderHeader ? (
						<Badge className="bg-card/80 backdrop-blur-sm" variant="warning">
							<AlertTriangleIcon aria-hidden className="size-3" />
							Repor{tool.reorderCount > 1 ? ` (${tool.reorderCount})` : ""}
						</Badge>
					) : (
						<Badge
							className="bg-card/80 backdrop-blur-sm"
							variant={STATUS_BADGE_VARIANT[tool.status] ?? "outline"}
						>
							{TOOL_STATUS_LABELS[tool.status] ?? tool.status}
						</Badge>
					)}
				</div>
			</div>

			{/* Corpo */}
			<div className="flex flex-col gap-2 px-4 pb-4 pt-3">
				{/* Nome + meta */}
				<div className="flex flex-col gap-1">
					<span className="line-clamp-2 text-[14px] font-semibold leading-[1.3] tracking-tight text-foreground">
						{tool.name}
					</span>
					<p className="line-clamp-1 text-muted-foreground text-xs">
						{formatMeta(tool) || "—"}
					</p>
					{variant === "catalog" && (
						<div className="mt-0.5 flex items-center gap-1.5">
							<span
								className={`size-[5px] flex-shrink-0 rounded-full ${
									tool.visibleOnSite
										? "bg-green-500/60"
										: "bg-muted-foreground/30"
								}`}
							/>
							<p className="text-[10px] text-muted-foreground">
								{tool.visibleOnSite ? "Visível no site" : "Oculto no site"}
							</p>
						</div>
					)}
				</div>

				{/* Slot de variantes — sempre presente para altura uniforme */}
				<div className="flex min-h-[20px] flex-wrap gap-1">
					{showVariantsBlock && (
						<>
							{tool.variantSummaries.slice(0, MAX_VARIANT_CHIPS).map((v) => (
								<span
									className="rounded border border-border/50 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
									key={v}
									title={v}
								>
									{v}
								</span>
							))}
							{tool.variantSummaries.length > MAX_VARIANT_CHIPS && (
								<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
									+{tool.variantSummaries.length - MAX_VARIANT_CHIPS}
								</span>
							)}
						</>
					)}
				</div>

				<hr className="border-border" />

				{/* Rodapé */}
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-baseline gap-1">
						<span className="text-muted-foreground text-xs">Estoque:</span>
						<span
							className={`text-[15px] font-semibold tabular-nums leading-none ${
								stockIsCritical ? "text-destructive" : "text-primary"
							}`}
						>
							{tool.totalStock}
						</span>
					</div>
					{canMutate && actions ? (
						<div
							className="flex shrink-0 items-center gap-1.5"
							onClick={(e) => e.stopPropagation()}
						>
							{actions}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verificar tipos**

```bash
bun check-types
```

Esperado: zero erros. Se aparecer erro de import não utilizado (ex: `Link` removido), verificar se o formatter já limpou — o hook `PostToolUse` roda `bun fix` automaticamente após Write/Edit.

---

## Task 2: Smoke test visual + commit

**Files:**
- Browser: `http://localhost:3001/dashboard/tools`
- Browser: `http://localhost:3001/dashboard/stock` (variant `stock-overview`)

- [ ] **Step 1: Abrir `/dashboard/tools` no browser e verificar checklist**

Checklist:
- [ ] Grade sem variação de altura entre cards com e sem variantes
- [ ] Badges (categoria + status) sobrepostos na foto, legíveis
- [ ] Nome em sans-serif (não Cormorant/serif)
- [ ] Rodapé mostra `Estoque: N` — sem breakdown de filiais
- [ ] `Estoque: 0` aparece em vermelho (card "Disco de Corte Inox")
- [ ] Clicar em qualquer área do card (fora dos botões) navega para a página de detalhe
- [ ] Clicar no botão de editar/estoque/excluir NÃO abre a página de detalhe
- [ ] Hover na imagem → leve aumento de brilho

- [ ] **Step 2: Abrir `/dashboard/stock` e verificar variante `stock-overview`**

Checklist adicional:
- [ ] Badge de "Repor (N)" aparece no canto superior direito da imagem (não o badge de status)
- [ ] Card clicável da mesma forma

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/_components/tool-card.tsx
git commit -m "feat: redesign tool card — overlay badges, rodapé mínimo, card clicável"
```
