# Tools × Stock Unification — Slice 2: shell de `/tools/[id]` com tabs + Visão geral

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` para tracking.

**Goal:** Reescrever `/dashboard/tools/[id]` em formato hub com tabs. Header sticky com identidade + ações inline. Strip de alerta condicional. 5 tabs: Visão geral (default, conteúdo novo em 2 colunas), Variantes & preços (legacy read-only), Estoque (tabela legacy read-only), Atividade (placeholder), Avaliações (mantém).

**Architecture:** Reuse `EntityTabs` (já usado em suppliers/users/branches/[id]). Reuse `EntityKpisRow` pattern só se necessário (aside cards são suficientes). Extrair SQL inline da page atual pra `_lib/tool-detail-data.ts` com função `getToolDetail(id)`. Strip de alerta lê `stockSummary` calculado nessa mesma query.

**Tech Stack:** Next 16 RSC + EntityTabs client component, Drizzle, shadcn Card/Badge/Separator/Tooltip.

**Spec:** `docs/superpowers/specs/2026-05-25-tools-stock-unification-design.md` § Detalhe `/dashboard/tools/[id]`

**Out of scope desta slice** (continuam até slices subsequentes):
- Edição inline de variantes (slice 3)
- Matriz variante×filial + sheet de ajuste (slice 4)
- Tab Atividade com timeline real (slice 5)
- Server actions novas: `toggleVisibility`, `setStatus`, `duplicateTool` — botões terciários renderizam **disabled com tooltip "em breve"**
- Edit via sheet `?edit=1` — botão "Editar" continua linkando pra `/tools/[id]/edit` existente

---

## Mapa de arquivos

| Arquivo | Status | Função |
|---|---|---|
| `apps/web/src/app/dashboard/tools/[id]/page.tsx` | **Reescrever** | Orchestrator slim: fetch via `getToolDetail`, monta `EntityTabs` |
| `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts` | **Criar** | `getToolDetail(id)` agregando os 7 fetches atuais + computa `stockSummary` |
| `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-header.tsx` | **Criar** | Server component: identidade + breadcrumb + status + strip de alerta + slot de ações |
| `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx` | **Criar** | Client component: barra de botões inline (primária + secundária + terciárias disabled + delete) |
| `apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx` | **Criar** | Visão geral: 2 colunas — main (galeria + descrição + accordion fiscal/specs) + aside (estoque resumo + metadados) |
| `apps/web/src/app/dashboard/tools/[id]/_components/fiscal-specs-accordion.tsx` | **Criar** | Accordion colapsado com fiscal (HS/NCM/CEST) + specs fixas (modelo, fabricante, potência, peso, dimensões) + specs dinâmicas |
| `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx` | **Criar** | Tabela read-only de variantes (movida de page.tsx, mesmo shape — editor inline fica pra slice 3) |
| `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab-legacy.tsx` | **Criar** | Tabela legacy "Estoque por variante e filial" (movida de page.tsx, read-only — matriz vem na slice 4) |
| `apps/web/src/app/dashboard/tools/[id]/_components/placeholder-tab.tsx` | **Criar** | Empty state genérico "Em breve" pra tab Atividade |
| `apps/web/src/app/dashboard/tools/[id]/_components/tool-reviews-section.tsx` | Inalterado | Reusa pra tab Avaliações |
| `apps/web/src/app/dashboard/tools/[id]/_lib/reviews-data.ts` | Inalterado | Mantém |

---

## Task 1: Criar `_lib/tool-detail-data.ts` — extração da query

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts`

### Contexto

`page.tsx` atual faz 1 query síncrona inicial + 6 paralelas inline. Vamos consolidar em `getToolDetail(id)` que retorna um shape único `ToolDetail` agregando tudo, mais um derivado `stockSummary` (totais + filiais críticas/repor) usado pelo header e pelo aside.

### Steps

- [ ] **Step 1: Criar o arquivo com o seguinte conteúdo**

```typescript
import { db } from "@emach/db";
import { category, toolCategory } from "@emach/db/schema/categories";
import { branch, stockLevel } from "@emach/db/schema/inventory";
import { supplier } from "@emach/db/schema/suppliers";
import {
	attributeDefinition,
	tool,
	toolAttributeValue,
	toolImage,
	toolVariant,
} from "@emach/db/schema/tools";
import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";

export type ToolDetailRow = typeof tool.$inferSelect & {
	supplierName: string | null;
};

export interface ToolDetailCategory {
	categoryId: string;
	categoryName: string;
	isPrimary: boolean;
}

export interface ToolDetailImage {
	id: string;
	url: string;
}

export type ToolDetailVariant = typeof toolVariant.$inferSelect;

export interface ToolDetailAttribute {
	slug: string;
	label: string;
	inputType: string;
	unit: string | null;
	valueText: string | null;
	valueNumeric: number | null;
	valueNumericMax: number | null;
	valueBool: boolean | null;
}

export interface ToolStockRow {
	variantId: string;
	variantSku: string;
	variantVoltage: string;
	branchId: string;
	branchName: string;
	quantity: number;
	minQty: number;
	reorderPoint: number;
}

export interface ToolStockAlert {
	branchId: string;
	branchName: string;
	variantSku: string;
	variantVoltage: string;
	quantity: number;
	reorderPoint: number;
	level: "critical" | "reorder";
}

export interface ToolStockSummary {
	totalStock: number;
	branchCount: number;
	criticalCount: number;
	reorderCount: number;
	alerts: ToolStockAlert[];
}

export interface ToolDetail {
	tool: ToolDetailRow;
	categories: ToolDetailCategory[];
	images: ToolDetailImage[];
	variants: ToolDetailVariant[];
	attributes: ToolDetailAttribute[];
	stockRows: ToolStockRow[];
	stockSummary: ToolStockSummary;
}

export const getToolDetail = cache(
	async (id: string): Promise<ToolDetail | null> => {
		const [row] = await db
			.select({
				tool: tool,
				supplierName: supplier.name,
			})
			.from(tool)
			.leftJoin(supplier, eq(tool.supplierId, supplier.id))
			.where(eq(tool.id, id));

		if (!row) {
			return null;
		}

		const [categories, images, variants, attributes, stockRows] =
			await Promise.all([
				db
					.select({
						categoryId: category.id,
						categoryName: category.name,
						isPrimary: toolCategory.isPrimary,
					})
					.from(toolCategory)
					.innerJoin(category, eq(toolCategory.categoryId, category.id))
					.where(eq(toolCategory.toolId, id))
					.orderBy(asc(toolCategory.isPrimary)),
				db
					.select({ id: toolImage.id, url: toolImage.url })
					.from(toolImage)
					.where(eq(toolImage.toolId, id))
					.orderBy(asc(toolImage.sortOrder)),
				db
					.select()
					.from(toolVariant)
					.where(eq(toolVariant.toolId, id))
					.orderBy(asc(toolVariant.sortOrder)),
				db
					.select({
						slug: attributeDefinition.slug,
						label: attributeDefinition.label,
						inputType: attributeDefinition.inputType,
						unit: attributeDefinition.unit,
						valueText: toolAttributeValue.valueText,
						valueNumeric: toolAttributeValue.valueNumeric,
						valueNumericMax: toolAttributeValue.valueNumericMax,
						valueBool: toolAttributeValue.valueBool,
					})
					.from(toolAttributeValue)
					.innerJoin(
						attributeDefinition,
						eq(
							toolAttributeValue.attributeDefinitionId,
							attributeDefinition.id
						)
					)
					.where(eq(toolAttributeValue.toolId, id)),
				db
					.select({
						variantId: toolVariant.id,
						variantSku: toolVariant.sku,
						variantVoltage: toolVariant.voltage,
						branchId: branch.id,
						branchName: branch.name,
						quantity: stockLevel.quantity,
						minQty: stockLevel.minQty,
						reorderPoint: stockLevel.reorderPoint,
					})
					.from(stockLevel)
					.innerJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
					.innerJoin(branch, eq(branch.id, stockLevel.branchId))
					.where(eq(toolVariant.toolId, id))
					.orderBy(asc(branch.name), asc(toolVariant.sortOrder)),
			]);

		const stockSummary = computeStockSummary(stockRows);

		return {
			tool: { ...row.tool, supplierName: row.supplierName },
			categories,
			images,
			variants,
			attributes: attributes.map((a) => ({
				...a,
				valueNumeric: a.valueNumeric === null ? null : Number(a.valueNumeric),
				valueNumericMax:
					a.valueNumericMax === null ? null : Number(a.valueNumericMax),
			})),
			stockRows,
			stockSummary,
		};
	}
);

function computeStockSummary(rows: ToolStockRow[]): ToolStockSummary {
	const branchIds = new Set<string>();
	const alerts: ToolStockAlert[] = [];
	let totalStock = 0;

	for (const r of rows) {
		totalStock += r.quantity;
		branchIds.add(r.branchId);

		if (r.reorderPoint > 0 && r.quantity <= r.reorderPoint) {
			const isCritical = r.minQty > 0 && r.quantity <= r.minQty;
			alerts.push({
				branchId: r.branchId,
				branchName: r.branchName,
				variantSku: r.variantSku,
				variantVoltage: r.variantVoltage,
				quantity: r.quantity,
				reorderPoint: r.reorderPoint,
				level: isCritical ? "critical" : "reorder",
			});
		}
	}

	const criticalCount = alerts.filter((a) => a.level === "critical").length;
	const reorderCount = alerts.filter((a) => a.level === "reorder").length;

	return {
		totalStock,
		branchCount: branchIds.size,
		criticalCount,
		reorderCount,
		alerts,
	};
}
```

**Atenção:** mantenha exatamente os mesmos shapes que o `page.tsx` atual produzia pra que o restante do código (que vamos modular nas próximas tasks) não precise re-mapear. `valueNumeric`/`valueNumericMax` voltam como string do Drizzle pra numeric — coerço a Number aqui.

- [ ] **Step 2:** `bun check-types` → 0 erros.
- [ ] **Step 3:** **NÃO COMMITAR** — junto com Task 2 (page reescrita).

---

## Task 2: Reescrever `page.tsx` como orchestrator slim + componentes de tab

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/page.tsx`
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-header.tsx`
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx`
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx`
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/fiscal-specs-accordion.tsx`
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx`
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab-legacy.tsx`
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/placeholder-tab.tsx`

### Contexto

7 arquivos coordenados (1 modificar + 6 criar). Combinar num único commit no fim. Use o conteúdo atual de `page.tsx` como base de copia pra preencher os componentes — vamos só **redistribuir** markup existente em peças menores, não reinventar visuais.

A árvore final:

```
ToolDetailPage (RSC)
├── ToolDetailHeader (RSC) ─── imagem thumb + breadcrumb + nome + status badge + supplier · visibilidade
│   ├── StripDeAlerta (inline, condicional)
│   └── ToolDetailActions (client) ── Duplicar [disabled] · Ocultar [disabled] · Descontinuar [disabled] · Deletar | Editar · Ajustar estoque
└── EntityTabs (client)
    ├── tab "visao-geral" → OverviewTab (RSC) — main 2-col com galeria/descrição/fiscal-specs-accordion + aside (estoque resumo + metadados)
    ├── tab "variantes" → VariantsTab (RSC) — tabela read-only
    ├── tab "estoque" → EstoqueLegacyTab (RSC) — tabela read-only
    ├── tab "atividade" → PlaceholderTab "Em breve"
    └── tab "avaliacoes" → ToolReviewsSection (RSC, existente)
```

### Steps

- [ ] **Step 1: Criar `placeholder-tab.tsx`** — componente trivial primeiro pra outros referenciarem.

```tsx
interface PlaceholderTabProps {
	title?: string;
	description?: string;
}

export function PlaceholderTab({
	title = "Em breve",
	description = "Esta seção será habilitada numa próxima entrega.",
}: PlaceholderTabProps) {
	return (
		<div className="flex flex-col items-center gap-2 py-16 text-center">
			<p className="font-medium text-sm">{title}</p>
			<p className="text-muted-foreground text-xs">{description}</p>
		</div>
	);
}
```

- [ ] **Step 2: Criar `variants-tab.tsx`** — extrair a tabela "Variantes" atual de `page.tsx` (linhas aprox. 165–215 da versão atual). Recebe `variants: ToolDetailVariant[]`. Sem mudanças visuais.

```tsx
import { Badge } from "@emach/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";

import type { ToolDetailVariant } from "../_lib/tool-detail-data";

interface VariantsTabProps {
	variants: ToolDetailVariant[];
}

const PRICE_FORMATTER = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function formatPrice(value: string | null): string {
	if (value === null) return "—";
	return PRICE_FORMATTER.format(Number(value));
}

export function VariantsTab({ variants }: VariantsTabProps) {
	if (variants.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Nenhuma variante cadastrada.
			</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>SKU</TableHead>
					<TableHead>Voltagem</TableHead>
					<TableHead className="text-right">Preço</TableHead>
					<TableHead className="text-right">Custo</TableHead>
					<TableHead className="text-center">Padrão</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{variants.map((v) => (
					<TableRow key={v.id}>
						<TableCell className="font-mono text-xs">{v.sku}</TableCell>
						<TableCell>{v.voltage}</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatPrice(v.priceAmount)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatPrice(v.costAmount)}
						</TableCell>
						<TableCell className="text-center">
							{v.isDefault && <Badge variant="success">●</Badge>}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
```

- [ ] **Step 3: Criar `estoque-tab-legacy.tsx`** — extrair a tabela "Estoque por variante e filial" da `page.tsx` atual (linhas ~270–320). Tabela read-only. Recebe `stockRows: ToolStockRow[]`. Botão "Gerenciar estoque" em destaque no topo linka pra `/dashboard/tools/{toolId}/stock` (rota existente).

```tsx
import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import Link from "next/link";

import type { ToolStockRow } from "../_lib/tool-detail-data";

interface EstoqueLegacyTabProps {
	canMutate: boolean;
	stockRows: ToolStockRow[];
	toolId: string;
}

export function EstoqueLegacyTab({
	canMutate,
	stockRows,
	toolId,
}: EstoqueLegacyTabProps) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-sm">
					Estoque atual por variante × filial. A matriz editável e a ação de
					ajuste virão numa próxima entrega — por enquanto, abra "Gerenciar
					estoque" pra ajustar.
				</p>
				{canMutate && (
					<Link
						className={buttonVariants({ variant: "default", size: "sm" })}
						href={`/dashboard/tools/${toolId}/stock`}
					>
						Gerenciar estoque →
					</Link>
				)}
			</div>
			{stockRows.length === 0 ? (
				<p className="py-12 text-center text-muted-foreground text-sm">
					Sem estoque registrado.
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>SKU</TableHead>
							<TableHead>Voltagem</TableHead>
							<TableHead>Filial</TableHead>
							<TableHead className="text-right">Quantidade</TableHead>
							<TableHead className="text-right">Mín · Repor</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{stockRows.map((r) => (
							<TableRow key={`${r.variantId}-${r.branchId}`}>
								<TableCell className="font-mono text-xs">
									{r.variantSku}
								</TableCell>
								<TableCell>{r.variantVoltage}</TableCell>
								<TableCell>{r.branchName}</TableCell>
								<TableCell className="text-right tabular-nums">
									{r.quantity}
								</TableCell>
								<TableCell className="text-right text-muted-foreground text-xs tabular-nums">
									{r.minQty} · {r.reorderPoint}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Criar `fiscal-specs-accordion.tsx`** — accordion shadcn (collapsed por default) com os 3 grupos: fiscal, specs fixas, specs dinâmicas. Extrair markup atual das seções "Classificação fiscal", "Especificações fixas" e "Especificações técnicas dinâmicas" do `page.tsx`.

```tsx
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@emach/ui/components/accordion";

import type {
	ToolDetailAttribute,
	ToolDetailRow,
} from "../_lib/tool-detail-data";

interface FiscalSpecsAccordionProps {
	attributes: ToolDetailAttribute[];
	tool: ToolDetailRow;
}

function formatAttributeValue(a: ToolDetailAttribute): string {
	if (a.inputType === "boolean") {
		return a.valueBool === null ? "—" : a.valueBool ? "Sim" : "Não";
	}
	if (a.inputType === "numeric_range") {
		const lo = a.valueNumeric ?? "—";
		const hi = a.valueNumericMax ?? "—";
		const unit = a.unit ? ` ${a.unit}` : "";
		return `${lo} – ${hi}${unit}`;
	}
	if (a.inputType === "number") {
		const v = a.valueNumeric ?? "—";
		const unit = a.unit ? ` ${a.unit}` : "";
		return `${v}${unit}`;
	}
	return a.valueText ?? "—";
}

export function FiscalSpecsAccordion({
	tool,
	attributes,
}: FiscalSpecsAccordionProps) {
	const hasFiscal = tool.hsCode || tool.ncm || tool.cest;
	const hasFixedSpecs =
		tool.model ||
		tool.invoiceModel ||
		tool.manufacturerName ||
		tool.powerWatts !== null ||
		tool.weightKg !== null ||
		tool.lengthCm !== null ||
		tool.widthCm !== null ||
		tool.heightCm !== null;
	const hasDynamicSpecs = attributes.length > 0;

	if (!hasFiscal && !hasFixedSpecs && !hasDynamicSpecs) {
		return null;
	}

	return (
		<Accordion collapsible type="single">
			{hasFiscal && (
				<AccordionItem value="fiscal">
					<AccordionTrigger>Classificação fiscal</AccordionTrigger>
					<AccordionContent>
						<dl className="grid grid-cols-3 gap-3 text-sm">
							<div>
								<dt className="text-muted-foreground text-xs uppercase">
									HS Code
								</dt>
								<dd>{tool.hsCode ?? "—"}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs uppercase">NCM</dt>
								<dd>{tool.ncm ?? "—"}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs uppercase">CEST</dt>
								<dd>{tool.cest ?? "—"}</dd>
							</div>
						</dl>
					</AccordionContent>
				</AccordionItem>
			)}
			{hasFixedSpecs && (
				<AccordionItem value="fixed">
					<AccordionTrigger>Especificações fixas</AccordionTrigger>
					<AccordionContent>
						<dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
							<SpecField label="Modelo" value={tool.model} />
							<SpecField label="Modelo NF" value={tool.invoiceModel} />
							<SpecField label="Fabricante" value={tool.manufacturerName} />
							<SpecField
								label="Potência"
								value={tool.powerWatts !== null ? `${tool.powerWatts} W` : null}
							/>
							<SpecField
								label="Peso"
								value={tool.weightKg !== null ? `${tool.weightKg} kg` : null}
							/>
							<SpecField
								label="Dimensões"
								value={
									tool.lengthCm !== null &&
									tool.widthCm !== null &&
									tool.heightCm !== null
										? `${tool.lengthCm} × ${tool.widthCm} × ${tool.heightCm} cm`
										: null
								}
							/>
						</dl>
					</AccordionContent>
				</AccordionItem>
			)}
			{hasDynamicSpecs && (
				<AccordionItem value="dynamic">
					<AccordionTrigger>Especificações técnicas</AccordionTrigger>
					<AccordionContent>
						<dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
							{attributes.map((a) => (
								<SpecField
									key={a.slug}
									label={a.label}
									value={formatAttributeValue(a)}
								/>
							))}
						</dl>
					</AccordionContent>
				</AccordionItem>
			)}
		</Accordion>
	);
}

function SpecField({
	label,
	value,
}: {
	label: string;
	value: string | null;
}) {
	return (
		<div>
			<dt className="text-muted-foreground text-xs uppercase">{label}</dt>
			<dd>{value ?? "—"}</dd>
		</div>
	);
}
```

**Confirmado:** `@emach/ui/components/accordion` existe.

- [ ] **Step 5: Criar `overview-tab.tsx`** — Visão geral em 2 colunas. Main: galeria + descrição (Markdown) + accordion. Aside: card "Estoque resumo" + card "Metadados".

```tsx
import { Card, CardContent } from "@emach/ui/components/card";
import { Separator } from "@emach/ui/components/separator";
import { buttonVariants } from "@emach/ui/components/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Image from "next/image";
import Link from "next/link";

import { ToolDescription } from "@/components/tool-description";
import { FiscalSpecsAccordion } from "./fiscal-specs-accordion";
import type {
	ToolDetailAttribute,
	ToolDetailCategory,
	ToolDetailImage,
	ToolDetailRow,
	ToolStockSummary,
} from "../_lib/tool-detail-data";

interface OverviewTabProps {
	attributes: ToolDetailAttribute[];
	categories: ToolDetailCategory[];
	images: ToolDetailImage[];
	stockSummary: ToolStockSummary;
	tool: ToolDetailRow;
}

export function OverviewTab({
	tool,
	images,
	categories,
	attributes,
	stockSummary,
}: OverviewTabProps) {
	const primaryCategory = categories.find((c) => c.isPrimary);
	const otherCategories = categories.filter((c) => !c.isPrimary);

	return (
		<div className="grid gap-6 lg:grid-cols-[1fr_280px]">
			<div className="flex flex-col gap-4 min-w-0">
				{/* Galeria */}
				{images.length > 0 ? (
					<div className="grid grid-cols-4 gap-2">
						{images.slice(0, 8).map((img) => (
							// biome-ignore lint/performance/noImgElement: Supabase public URL
							<img
								alt=""
								className="aspect-square w-full rounded-md object-cover"
								key={img.id}
								src={img.url}
							/>
						))}
					</div>
				) : (
					<div className="aspect-video rounded-md bg-muted" />
				)}

				{/* Descrição */}
				{tool.description && (
					<Card>
						<CardContent className="pt-6">
							<ToolDescription markdown={tool.description} />
						</CardContent>
					</Card>
				)}

				{/* Fiscal & Specs */}
				<FiscalSpecsAccordion attributes={attributes} tool={tool} />
			</div>

			{/* Aside */}
			<aside className="flex flex-col gap-4">
				<Card>
					<CardContent className="pt-6">
						<p className="text-muted-foreground text-xs uppercase tracking-wide">
							Estoque resumo
						</p>
						<p className="mt-1 font-semibold text-2xl tabular-nums">
							{stockSummary.totalStock}{" "}
							<span className="font-normal text-muted-foreground text-sm">
								unid.
							</span>
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							em {stockSummary.branchCount}{" "}
							{stockSummary.branchCount === 1 ? "filial" : "filiais"}
							{stockSummary.criticalCount + stockSummary.reorderCount > 0 && (
								<>
									{" · "}
									<span className="text-destructive">
										{stockSummary.criticalCount + stockSummary.reorderCount} em
										alerta
									</span>
								</>
							)}
						</p>
						<Separator className="my-3" />
						<Link
							className={buttonVariants({
								variant: "outline",
								size: "sm",
								className: "w-full",
							})}
							href={`/dashboard/tools/${tool.id}?tab=estoque`}
						>
							Ver na aba Estoque →
						</Link>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="pt-6">
						<p className="text-muted-foreground text-xs uppercase tracking-wide">
							Metadados
						</p>
						<dl className="mt-3 flex flex-col gap-2 text-sm">
							<div>
								<dt className="text-muted-foreground text-xs">Categoria</dt>
								<dd>{primaryCategory?.categoryName ?? "—"}</dd>
								{otherCategories.length > 0 && (
									<dd className="text-muted-foreground text-xs">
										+{" "}
										{otherCategories.map((c) => c.categoryName).join(", ")}
									</dd>
								)}
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">Fornecedor</dt>
								<dd>{tool.supplierName ?? "—"}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">Visibilidade</dt>
								<dd>
									{tool.visibleOnSite ? (
										<span className="text-success">● No site</span>
									) : (
										<span className="text-muted-foreground">○ Oculta</span>
									)}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">Criada</dt>
								<dd>
									{format(tool.createdAt, "dd 'de' MMM 'de' yyyy", {
										locale: ptBR,
									})}
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>
			</aside>
		</div>
	);
}
```

**Confirmado:** `ToolDescription` mora em `apps/web/src/components/tool-description.tsx` (global, acessado via alias `@/components/tool-description`).

- [ ] **Step 6: Criar `tool-detail-actions.tsx`** — barra de ações inline, client component.

```tsx
"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import {
	Copy,
	EyeOff,
	PackagePlus,
	Pencil,
	StopCircle,
	Trash2,
} from "lucide-react";
import Link from "next/link";

import { DeleteToolDialog } from "../../_components/delete-tool-dialog";

interface ToolDetailActionsProps {
	canDelete: boolean;
	canMutate: boolean;
	toolId: string;
	toolName: string;
}

export function ToolDetailActions({
	toolId,
	toolName,
	canMutate,
	canDelete,
}: ToolDetailActionsProps) {
	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex items-center gap-1.5">
				{/* Terciárias — disabled em slice 2, ainda não há server actions */}
				<DisabledIconButton icon={Copy} label="Duplicar (em breve)" />
				<DisabledIconButton icon={EyeOff} label="Ocultar do site (em breve)" />
				<DisabledIconButton
					icon={StopCircle}
					label="Marcar descontinuada (em breve)"
				/>

				{/* Destrutiva — habilitada */}
				{canDelete && (
					<DeleteToolDialog id={toolId} name={toolName}>
						<Button
							className="border-destructive/40 text-destructive"
							size="sm"
							variant="outline"
						>
							<Trash2 className="size-3.5" />
						</Button>
					</DeleteToolDialog>
				)}

				<div className="mx-2 h-6 w-px bg-border" />

				{/* Secundária */}
				{canMutate && (
					<Link
						className={buttonVariants({ variant: "outline", size: "sm" })}
						href={`/dashboard/tools/${toolId}/edit`}
					>
						<Pencil className="mr-1.5 size-3.5" />
						Editar
					</Link>
				)}

				{/* Primária */}
				{canMutate && (
					<Link
						className={buttonVariants({ variant: "default", size: "sm" })}
						href={`/dashboard/tools/${toolId}/stock`}
					>
						<PackagePlus className="mr-1.5 size-3.5" />
						Ajustar estoque
					</Link>
				)}
			</div>
		</TooltipProvider>
	);
}

interface DisabledIconButtonProps {
	icon: typeof Copy;
	label: string;
}

function DisabledIconButton({ icon: Icon, label }: DisabledIconButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					aria-label={label}
					className="text-muted-foreground"
					disabled
					size="sm"
					variant="outline"
				>
					<Icon className="size-3.5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
```

**Confirmado:** `DeleteToolDialog` está em `apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx` (relative path `../../_components/delete-tool-dialog` da localização do novo arquivo). `canDelete` = `can(role, "tools.delete")` — capability já existe em `apps/web/src/lib/permissions.ts`.

- [ ] **Step 7: Criar `tool-detail-header.tsx`** — server component.

```tsx
import { Badge } from "@emach/ui/components/badge";
import Link from "next/link";

import type { ToolDetail } from "../_lib/tool-detail-data";
import { ToolDetailActions } from "./tool-detail-actions";

const STATUS_LABEL: Record<string, string> = {
	active: "Ativa",
	draft: "Rascunho",
	discontinued: "Descontinuada",
	out_of_stock: "Sem estoque",
};

const STATUS_VARIANT: Record<
	string,
	"default" | "destructive" | "outline" | "secondary" | "success"
> = {
	active: "success",
	draft: "secondary",
	discontinued: "outline",
	out_of_stock: "destructive",
};

interface ToolDetailHeaderProps {
	canDelete: boolean;
	canMutate: boolean;
	detail: ToolDetail;
}

export function ToolDetailHeader({
	detail,
	canMutate,
	canDelete,
}: ToolDetailHeaderProps) {
	const { tool, images, stockSummary } = detail;
	const defaultVariant = detail.variants.find((v) => v.isDefault);
	const cover = images[0];

	return (
		<header className="sticky top-0 z-10 flex flex-col gap-3 border-border border-b bg-background pt-2 pb-4">
			<div className="flex items-center gap-4">
				{cover ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					<img
						alt=""
						className="size-14 flex-shrink-0 rounded-md object-cover"
						src={cover.url}
					/>
				) : (
					<div className="size-14 flex-shrink-0 rounded-md bg-muted" />
				)}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<Link
						className="text-muted-foreground text-xs hover:underline"
						href="/dashboard/tools"
					>
						/ Ferramentas /
					</Link>
					<h1 className="truncate font-semibold text-lg">{tool.name}</h1>
					<div className="flex items-center gap-2 text-muted-foreground text-xs">
						<Badge variant={STATUS_VARIANT[tool.status] ?? "secondary"}>
							{STATUS_LABEL[tool.status] ?? tool.status}
						</Badge>
						{defaultVariant && (
							<>
								<span>·</span>
								<span className="font-mono">SKU: {defaultVariant.sku}</span>
							</>
						)}
						{tool.supplierName && (
							<>
								<span>·</span>
								<span>{tool.supplierName}</span>
							</>
						)}
						<span>·</span>
						<span>
							{tool.visibleOnSite ? (
								<span className="text-success">● Visível no site</span>
							) : (
								<span>○ Oculta</span>
							)}
						</span>
					</div>
				</div>
				<ToolDetailActions
					canDelete={canDelete}
					canMutate={canMutate}
					toolId={tool.id}
					toolName={tool.name}
				/>
			</div>

			{(stockSummary.criticalCount > 0 || stockSummary.reorderCount > 0) && (
				<div className="rounded-md border border-destructive/40 bg-destructive/15 px-3 py-2 text-destructive text-xs">
					⚠️{" "}
					{stockSummary.alerts.length === 1 ? (
						<>
							{stockSummary.alerts[0]?.branchName} ·{" "}
							{stockSummary.alerts[0]?.variantSku} (
							{stockSummary.alerts[0]?.quantity} ≤{" "}
							{stockSummary.alerts[0]?.reorderPoint}) abaixo do ponto de
							reposição
						</>
					) : (
						<>
							{stockSummary.alerts.length} alertas de reposição —{" "}
							{stockSummary.alerts
								.slice(0, 3)
								.map(
									(a) =>
										`${a.branchName} (${a.quantity} ≤ ${a.reorderPoint})`
								)
								.join(", ")}
							{stockSummary.alerts.length > 3 &&
								`, e mais ${stockSummary.alerts.length - 3}`}
						</>
					)}
				</div>
			)}
		</header>
	);
}
```

- [ ] **Step 8: Reescrever `page.tsx`** como orchestrator slim.

Substituir **TODO** o conteúdo de `apps/web/src/app/dashboard/tools/[id]/page.tsx` por:

```tsx
import { notFound } from "next/navigation";

import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { can } from "@/lib/permissions";
import type { UserRole } from "@/lib/session";
import { requireCurrentSession } from "@/lib/session";

import { EstoqueLegacyTab } from "./_components/estoque-tab-legacy";
import { OverviewTab } from "./_components/overview-tab";
import { PlaceholderTab } from "./_components/placeholder-tab";
import { ToolDetailHeader } from "./_components/tool-detail-header";
import { ToolReviewsSection } from "./_components/tool-reviews-section";
import { VariantsTab } from "./_components/variants-tab";
import { getToolDetail } from "./_lib/tool-detail-data";
import { getToolReviewsSummary } from "./_lib/reviews-data";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function ToolDetailPage({ params }: PageProps) {
	const session = await requireCurrentSession();
	const role = (session.user.role ?? "user") as UserRole;
	const canMutate = can(role, "tools.update");
	const canDelete = can(role, "tools.delete");

	const { id } = await params;
	const detail = await getToolDetail(id);

	if (!detail) {
		notFound();
	}

	const reviewsSummary = await getToolReviewsSummary(id);

	const tabs: EntityTab[] = [
		{
			value: "visao-geral",
			label: "Visão geral",
			content: (
				<OverviewTab
					attributes={detail.attributes}
					categories={detail.categories}
					images={detail.images}
					stockSummary={detail.stockSummary}
					tool={detail.tool}
				/>
			),
		},
		{
			value: "variantes",
			label: "Variantes & preços",
			content: <VariantsTab variants={detail.variants} />,
		},
		{
			value: "estoque",
			label: "Estoque",
			badge:
				detail.stockSummary.criticalCount + detail.stockSummary.reorderCount >
				0 ? (
					<span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
						{detail.stockSummary.criticalCount +
							detail.stockSummary.reorderCount}
					</span>
				) : undefined,
			content: (
				<EstoqueLegacyTab
					canMutate={canMutate}
					stockRows={detail.stockRows}
					toolId={detail.tool.id}
				/>
			),
		},
		{
			value: "atividade",
			label: "Atividade",
			content: (
				<PlaceholderTab description="Movimentações + pedidos chegam na próxima entrega." />
			),
		},
		{
			value: "avaliacoes",
			label: "Avaliações",
			content: (
				<ToolReviewsSection summary={reviewsSummary} toolId={detail.tool.id} />
			),
		},
	];

	return (
		<div className="flex flex-col gap-4">
			<ToolDetailHeader
				canDelete={canDelete}
				canMutate={canMutate}
				detail={detail}
			/>
			<EntityTabs defaultValue="visao-geral" tabs={tabs} />
		</div>
	);
}
```

**Confirmado:**
- `EntityTab.badge?: ReactNode` — aceita JSX (verificado em `apps/web/src/components/entity/entity-tabs.tsx`).
- `ToolReviewsSection` está em `apps/web/src/app/dashboard/tools/[id]/_components/tool-reviews-section.tsx` — relative `./_components/tool-reviews-section`.
- `ToolDescription` mora em `@/components/tool-description` (já corrigido no overview-tab).

- [ ] **Step 9:** `bun check-types` → 0 erros.

- [ ] **Step 10: Commit (Tasks 1 + 2 combinadas)**

```bash
git add apps/web/src/app/dashboard/tools/\[id\]/
git commit -m "feat(tools): shell de /tools/[id] com tabs + tab Visão geral"
```

---

## Task 3: Smoke test em browser

**Files:** (nenhum)

### Steps

- [ ] **Step 1: `bun dev:web`** se ainda não estiver rodando.

- [ ] **Step 2: Login como admin** (`othavioquiliao@gmail.com`) e navegar pra `/dashboard/tools`.

- [ ] **Step 3: Abrir uma ferramenta qualquer.** Verificar:
- ✅ Header com thumb + breadcrumb "/ Ferramentas /" + nome + status badge + SKU + supplier + visibilidade.
- ✅ Barra de ações inline à direita: 3 ícones disabled (Duplicar, Ocultar, Descontinuar) com tooltip "em breve", ícone Deletar habilitado, separador, "Editar" outline, "Ajustar estoque" laranja primário.
- ✅ Header é **sticky** ao scrollar.
- ✅ Strip de alerta vermelha aparece se houver `criticalCount` ou `reorderCount` > 0 — caso contrário, ausente.
- ✅ Tabs visíveis: Visão geral · Variantes & preços · Estoque (com badge se houver alertas) · Atividade · Avaliações.
- ✅ Tab "Visão geral" ativa por default.

- [ ] **Step 4: Navegar entre tabs.** Verificar:
- ✅ Click em "Variantes & preços" → URL muda pra `?tab=variantes`, tabela renderiza.
- ✅ Click em "Estoque" → URL `?tab=estoque`, tabela legacy + botão "Gerenciar estoque →" no topo.
- ✅ Click em "Atividade" → placeholder "Em breve".
- ✅ Click em "Avaliações" → reviews section conforme antes.
- ✅ Browser back navega entre tabs sem refresh.

- [ ] **Step 5: Verificar Visão geral em duas colunas (≥lg):**
- ✅ Main: galeria 4-col + descrição em card + accordion fiscal/specs colapsado.
- ✅ Aside (~280px): card "Estoque resumo" com total + filiais + botão "Ver na aba Estoque →" (click vai pra tab estoque), card "Metadados".

- [ ] **Step 6: Click no botão "Editar"** → navega pra `/dashboard/tools/[id]/edit` (rota antiga, intocada).

- [ ] **Step 7: Click no botão "Ajustar estoque"** → navega pra `/dashboard/tools/[id]/stock` (rota antiga, intocada).

- [ ] **Step 8: Click no ícone Deletar** → abre `DeleteToolDialog` (existente). Cancelar (não deletar de verdade no smoke).

- [ ] **Step 9: Verificar `next-devtools` MCP** (opcional): `nextjs_call <port> get_errors` — sem erros novos relacionados aos novos componentes.

---

## Definition of done

- ✅ `getToolDetail(id)` cacheada por request, retorna shape completo + `stockSummary` derivado.
- ✅ Página `[id]/page.tsx` slim — só orquestra Header + EntityTabs.
- ✅ Header sticky com identidade + ações inline. Strip de alerta condicional.
- ✅ 5 tabs com URL bookmarkable (`?tab=...`).
- ✅ Tab Visão geral em 2 colunas com aside.
- ✅ Botões Editar/Ajustar estoque continuam funcionando via rotas legacy (sem regressão).
- ✅ `bun check-types` 0 erros.
- ✅ Smoke manual passou.

## Pontos abertos / próximas slices

1. **Mini-KPIs no aside** (Pedidos atendidos 30d, Última saída/entrada, Giro) — deferido pra slice 5 quando `stock_movement` ganhar query agregada.
2. **Server actions terciárias** (`toggleVisibility`, `setStatus`, `duplicateTool`) — ficam `disabled` até serem implementadas. Próxima vez que abrir o arquivo: criar as actions em batch.
3. **Editor inline de variantes** — slice 3.
4. **Matriz variante×filial + sheet ajuste** — slice 4.
5. **Edit via sheet (`?edit=1`)** — uma slice futura troca o link "Editar" pelo sheet.
