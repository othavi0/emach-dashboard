# Redesign do Perfil de Ferramenta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar a Visão geral de `/dashboard/tools/[id]` num grid de cards edge-to-edge com carrossel de imagens, specs técnicas agrupadas pela categoria-fonte do banco, render por `input_type`, e sinalização de divergência entre coluna fixa e atributo.

**Architecture:** Camada de dados (`getToolDetail`) passa a trazer categoria-fonte/options/sortOrder dos atributos; helpers puros (agrupamento, divergência, formatação por tipo) testados com vitest; componentes de UID (`SectionCard`, `ImageCarousel`, `AttributeValue`) compostos na `OverviewTab` reescrita; verificação por smoke visual no browser (convenção do projeto pra UI).

**Tech Stack:** Next 16 / React 19 / Drizzle / Tailwind v4 (tokens do design system) / vitest (env node) / lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-12-perfil-ferramenta-redesign-design.md`

**Convenções obrigatórias (do CLAUDE.md):**
- Ler cada arquivo antes de `Edit` (subagent não herda state do parent).
- Rodar `bun check-types` **e** `bun check` (ultracite) antes de cada commit.
- UI = **smoke visual no browser** (`check-types` não pega render). Server na porta 3006 (dev-here).
- `logger` em vez de `console`; sem `: any`/`as any`; sem `key={index}`; thumbs Supabase = `<img>` com `biome-ignore`.

---

## File Structure

**Criar:**
- `apps/web/src/app/dashboard/tools/[id]/_lib/attribute-grouping.ts` — agrupa atributos por categoria-fonte (puro).
- `apps/web/src/app/dashboard/tools/[id]/_lib/spec-divergence.ts` — detecta divergência fixa×atributo por unidade (puro).
- `apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/attribute-grouping.test.ts`
- `apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/spec-divergence.test.ts`
- `apps/web/src/app/dashboard/tools/[id]/_components/section-card.tsx` — card com faixa de título + `border-b` edge-to-edge.
- `apps/web/src/app/dashboard/tools/[id]/_components/image-carousel.tsx` — carrossel (client), cap 8.
- `apps/web/src/app/dashboard/tools/[id]/_components/attribute-value.tsx` — render de valor por `input_type`.

**Modificar:**
- `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts` — estender tipo + query de atributos; expor `attributeGroups`.
- `apps/web/src/app/dashboard/tools/[id]/_components/tool-specs.tsx` — consumir grupos + divergências + `AttributeValue`.
- `apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx` — grid de `SectionCard` (layout B).

**Smoke targets (dados reais):**
- Furadeira `b3be9615-35e4-4849-8ad2-c1cb821d4cf9` — select (Capacidade do Mandril), numeric_range, boolean, **divergência de Peso (1.700 × 1.8)**.
- Disco de Corte `fb265dfa-0d23-41e8-af6d-4bcf20ac4b5d` — atributo **color** ("Cor de Acabamento" = prata).
- Fiscal: nenhuma ferramenta tem seed; o card Fiscal renderiza "—" (caminho de empty já coberto).

---

## Task 1: Estender a camada de dados (`tool-detail-data.ts`)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts`

- [ ] **Step 1: Ler o arquivo atual inteiro** (`tool-detail-data.ts`) pra ter o state antes de editar.

- [ ] **Step 2: Estender o tipo `ToolDetailAttribute`**

Substituir a interface atual por (adiciona `options`, `sortOrder`, `sourceCategoryId`, `sourceCategoryName`, `sourceCategoryDepth`):

```ts
import type { AttributeOptions } from "@emach/db/schema/attributes";

export interface ToolDetailAttribute {
	inputType: string;
	label: string;
	options: AttributeOptions | null;
	slug: string;
	sortOrder: number;
	sourceCategoryDepth: number;
	sourceCategoryId: string;
	sourceCategoryName: string;
	unit: string | null;
	valueBool: boolean | null;
	valueNumeric: number | null;
	valueNumericMax: number | null;
	valueText: string | null;
}
```

- [ ] **Step 3: Estender a query de atributos** dentro do `Promise.all` de `getToolDetail`

Localizar o `db.select({...}).from(toolAttributeValue)...` (o 4º item do `Promise.all`) e substituí-lo por:

```ts
db
	.select({
		slug: attributeDefinition.slug,
		label: attributeDefinition.label,
		inputType: attributeDefinition.inputType,
		unit: attributeDefinition.unit,
		options: attributeDefinition.options,
		sortOrder: attributeDefinition.sortOrder,
		sourceCategoryId: attributeDefinition.categoryId,
		sourceCategoryName: category.name,
		sourceCategoryDepth: category.depth,
		valueText: toolAttributeValue.valueText,
		valueNumeric: toolAttributeValue.valueNumeric,
		valueNumericMax: toolAttributeValue.valueNumericMax,
		valueBool: toolAttributeValue.valueBool,
	})
	.from(toolAttributeValue)
	.innerJoin(
		attributeDefinition,
		eq(toolAttributeValue.attributeId, attributeDefinition.id)
	)
	.innerJoin(category, eq(attributeDefinition.categoryId, category.id))
	.where(eq(toolAttributeValue.toolId, id)),
```

(`category` já está importado no arquivo — usado na query de `toolCategory`.)

- [ ] **Step 4: Ajustar o `.map` dos atributos no retorno**

O map atual coerce `valueNumeric`/`valueNumericMax` com `Number`. Manter e garantir que os campos novos passam direto (eles já vêm tipados; `sortOrder`/`sourceCategoryDepth` são `number`, `options` é `AttributeOptions | null`). Nenhuma mudança extra além de manter o spread:

```ts
attributes: attributes.map((a) => ({
	...a,
	valueNumeric: a.valueNumeric === null ? null : Number(a.valueNumeric),
	valueNumericMax:
		a.valueNumericMax === null ? null : Number(a.valueNumericMax),
})),
```

- [ ] **Step 5: Rodar check-types**

Run: `bun check-types`
Expected: PASS (sem erros). Se reclamar de `options` type, conferir o import de `AttributeOptions`.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts"
git commit -m "feat: trazer categoria-fonte/options/sortOrder dos atributos no detail"
```

---

## Task 2: Helper de agrupamento por categoria-fonte (TDD)

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_lib/attribute-grouping.ts`
- Test: `apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/attribute-grouping.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import type { ToolDetailAttribute } from "../tool-detail-data";
import { groupAttributesByCategory } from "../attribute-grouping";

function attr(p: Partial<ToolDetailAttribute>): ToolDetailAttribute {
	return {
		slug: "x", label: "X", inputType: "number", unit: null, options: null,
		sortOrder: 0, sourceCategoryId: "c", sourceCategoryName: "C",
		sourceCategoryDepth: 0, valueText: null, valueNumeric: 1,
		valueNumericMax: null, valueBool: null, ...p,
	};
}

describe("groupAttributesByCategory", () => {
	it("agrupa por categoria-fonte, ordena grupos por depth e itens por sortOrder", () => {
		const result = groupAttributesByCategory([
			attr({ slug: "mandril", sourceCategoryId: "fur", sourceCategoryName: "Furadeiras", sourceCategoryDepth: 2, sortOrder: 0 }),
			attr({ slug: "torque", sourceCategoryId: "ele", sourceCategoryName: "Elétricas", sourceCategoryDepth: 1, sortOrder: 3 }),
			attr({ slug: "potencia", sourceCategoryId: "ele", sourceCategoryName: "Elétricas", sourceCategoryDepth: 1, sortOrder: 0 }),
		]);
		expect(result.map((g) => g.categoryName)).toEqual(["Elétricas", "Furadeiras"]);
		expect(result[0].attributes.map((a) => a.slug)).toEqual(["potencia", "torque"]);
	});

	it("devolve [] para entrada vazia", () => {
		expect(groupAttributesByCategory([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun --cwd apps/web test attribute-grouping`
Expected: FAIL (`groupAttributesByCategory` não existe).

- [ ] **Step 3: Implementar o helper**

```ts
import type { ToolDetailAttribute } from "./tool-detail-data";

export interface AttributeGroup {
	categoryId: string;
	categoryName: string;
	attributes: ToolDetailAttribute[];
}

export function groupAttributesByCategory(
	attributes: ToolDetailAttribute[]
): AttributeGroup[] {
	const byId = new Map<string, AttributeGroup>();
	const depthById = new Map<string, number>();

	for (const a of attributes) {
		depthById.set(a.sourceCategoryId, a.sourceCategoryDepth);
		const group = byId.get(a.sourceCategoryId);
		if (group) {
			group.attributes.push(a);
		} else {
			byId.set(a.sourceCategoryId, {
				categoryId: a.sourceCategoryId,
				categoryName: a.sourceCategoryName,
				attributes: [a],
			});
		}
	}

	const groups = Array.from(byId.values());
	for (const g of groups) {
		g.attributes.sort((x, y) => x.sortOrder - y.sortOrder);
	}
	groups.sort((x, y) => {
		const dx = depthById.get(x.categoryId) ?? 0;
		const dy = depthById.get(y.categoryId) ?? 0;
		if (dx !== dy) {
			return dx - dy;
		}
		return x.categoryName.localeCompare(y.categoryName);
	});
	return groups;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bun --cwd apps/web test attribute-grouping`
Expected: PASS (2 testes).

- [ ] **Step 5: check-types + lint + commit**

```bash
bun check-types && bun check "apps/web/src/app/dashboard/tools/[id]/_lib"
git add "apps/web/src/app/dashboard/tools/[id]/_lib/attribute-grouping.ts" "apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/attribute-grouping.test.ts"
git commit -m "feat: helper de agrupamento de atributos por categoria-fonte"
```

---

## Task 3: Helper de detecção de divergência (TDD)

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_lib/spec-divergence.ts`
- Test: `apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/spec-divergence.test.ts`

Regra: comparar coluna fixa com atributo de mesma unidade. `tool.weightKg` (numeric → string) com unit `"kg"`; `tool.powerWatts` (integer → number) com unit `"W"`. Valor diferente → ambos divergentes.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import type { ToolDetailAttribute } from "../tool-detail-data";
import { detectSpecDivergences } from "../spec-divergence";

function attr(unit: string | null, valueNumeric: number | null, slug: string): ToolDetailAttribute {
	return {
		slug, label: slug, inputType: "number", unit, options: null, sortOrder: 0,
		sourceCategoryId: "c", sourceCategoryName: "C", sourceCategoryDepth: 0,
		valueText: null, valueNumeric, valueNumericMax: null, valueBool: null,
	};
}

describe("detectSpecDivergences", () => {
	it("marca peso fixo e atributo kg quando divergem", () => {
		const d = detectSpecDivergences(
			{ weightKg: "1.700", powerWatts: 650 },
			[attr("kg", 1.8, "peso"), attr("W", 650, "potencia")]
		);
		expect(d.fixed.has("weightKg")).toBe(true);
		expect(d.attributeSlugs.has("peso")).toBe(true);
		// potência bate (650 == 650) → não diverge
		expect(d.fixed.has("powerWatts")).toBe(false);
		expect(d.attributeSlugs.has("potencia")).toBe(false);
	});

	it("não marca quando não há atributo de mesma unidade", () => {
		const d = detectSpecDivergences({ weightKg: "1.700", powerWatts: null }, [attr("Nm", 30, "torque")]);
		expect(d.fixed.size).toBe(0);
		expect(d.attributeSlugs.size).toBe(0);
	});
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun --cwd apps/web test spec-divergence`
Expected: FAIL (`detectSpecDivergences` não existe).

- [ ] **Step 3: Implementar o helper**

```ts
import type { ToolDetailAttribute } from "./tool-detail-data";

export type FixedSpecKey = "weightKg" | "powerWatts";

export interface SpecDivergences {
	attributeSlugs: Set<string>;
	fixed: Set<FixedSpecKey>;
}

interface FixedSpecInput {
	powerWatts: number | null;
	weightKg: string | null;
}

const PAIRS: { key: FixedSpecKey; unit: string }[] = [
	{ key: "weightKg", unit: "kg" },
	{ key: "powerWatts", unit: "W" },
];

export function detectSpecDivergences(
	tool: FixedSpecInput,
	attributes: ToolDetailAttribute[]
): SpecDivergences {
	const fixed = new Set<FixedSpecKey>();
	const attributeSlugs = new Set<string>();

	for (const pair of PAIRS) {
		const fixedRaw = pair.key === "weightKg" ? tool.weightKg : tool.powerWatts;
		if (fixedRaw === null) {
			continue;
		}
		const fixedValue = Number(fixedRaw);
		for (const a of attributes) {
			if (a.unit === pair.unit && a.valueNumeric !== null) {
				if (a.valueNumeric !== fixedValue) {
					fixed.add(pair.key);
					attributeSlugs.add(a.slug);
				}
			}
		}
	}

	return { fixed, attributeSlugs };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bun --cwd apps/web test spec-divergence`
Expected: PASS (2 testes).

- [ ] **Step 5: check-types + lint + commit**

```bash
bun check-types && bun check "apps/web/src/app/dashboard/tools/[id]/_lib"
git add "apps/web/src/app/dashboard/tools/[id]/_lib/spec-divergence.ts" "apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/spec-divergence.test.ts"
git commit -m "feat: detecção de divergência fixa×atributo por unidade"
```

---

## Task 4: Componente `AttributeValue` (render por tipo)

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/attribute-value.tsx`

Render por `input_type`: `color`→swatch+label (resolve `value_text` em `options.swatches`); `select`→label da option; `boolean`→Sim/Não; `numeric_range`→"a – b unit"; `number`→"v unit"; `text`→texto. Server component (sem `"use client"`).

- [ ] **Step 1: Escrever o componente**

```tsx
import type { ToolDetailAttribute } from "../_lib/tool-detail-data";

export function AttributeValue({ attr }: { attr: ToolDetailAttribute }) {
	if (attr.inputType === "color" && attr.options?.kind === "color") {
		const swatch = attr.options.swatches.find((s) => s.value === attr.valueText);
		if (swatch) {
			return (
				<span className="inline-flex items-center gap-1.5">
					<span
						aria-hidden
						className="inline-block size-3 rounded-full ring-1 ring-border"
						style={{ backgroundColor: swatch.hex }}
					/>
					{swatch.label}
				</span>
			);
		}
		return <>{attr.valueText ?? "—"}</>;
	}

	if (attr.inputType === "select" && attr.options?.kind === "select") {
		const option = attr.options.options.find((o) => o.value === attr.valueText);
		return <>{option?.label ?? attr.valueText ?? "—"}</>;
	}

	if (attr.inputType === "boolean") {
		if (attr.valueBool === null) {
			return <>—</>;
		}
		return <>{attr.valueBool ? "Sim" : "Não"}</>;
	}

	const unit = attr.unit ? ` ${attr.unit}` : "";

	if (attr.inputType === "numeric_range") {
		const lo = attr.valueNumeric ?? "—";
		const hi = attr.valueNumericMax ?? "—";
		return <>{`${lo} – ${hi}${unit}`}</>;
	}

	if (attr.inputType === "number") {
		const v = attr.valueNumeric ?? "—";
		return <>{`${v}${unit}`}</>;
	}

	return <>{attr.valueText ?? "—"}</>;
}
```

- [ ] **Step 2: check-types + lint**

Run: `bun check-types && bun check "apps/web/src/app/dashboard/tools/[id]/_components/attribute-value.tsx"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_components/attribute-value.tsx"
git commit -m "feat: AttributeValue — render de atributo por input_type"
```

---

## Task 5: Componente `SectionCard` (edge-to-edge)

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/section-card.tsx`

Card com faixa de título (uppercase, `text-xs`, `text-muted-foreground`) separada do corpo por `border-b` que vai até as bordas do card. `action` opcional à direita do título. Server component.

- [ ] **Step 1: Escrever o componente**

```tsx
import type { ReactNode } from "react";

import { cn } from "@emach/ui/lib/utils";

interface SectionCardProps {
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	title: string;
}

export function SectionCard({
	title,
	action,
	children,
	className,
}: SectionCardProps) {
	return (
		<section
			className={cn(
				"flex flex-col overflow-hidden rounded-lg border border-border bg-card",
				className
			)}
		>
			<header className="flex items-center justify-between gap-2 border-border border-b px-4 py-2.5">
				<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
					{title}
				</h3>
				{action}
			</header>
			<div className="p-4">{children}</div>
		</section>
	);
}
```

(O `overflow-hidden` + `border-b` na `header` garante o efeito edge-to-edge sem precisar de `-mx`: a borda da header já encosta nas laterais do card.)

- [ ] **Step 2: check-types + lint + commit**

```bash
bun check-types && bun check "apps/web/src/app/dashboard/tools/[id]/_components/section-card.tsx"
git add "apps/web/src/app/dashboard/tools/[id]/_components/section-card.tsx"
git commit -m "feat: SectionCard — card com faixa de título edge-to-edge"
```

---

## Task 6: Componente `ImageCarousel`

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/image-carousel.tsx`

Client component. Cap 8 imagens. Track horizontal com `scroll-snap`, setas prev/next (scroll por página), dots por imagem. `prefers-reduced-motion`: `scrollBehavior` instantâneo. ≤4 imagens (todas visíveis) → sem setas/dots. Thumbs Supabase = `<img>` com biome-ignore.

- [ ] **Step 1: Escrever o componente**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";

import type { ToolDetailImage } from "../_lib/tool-detail-data";

const MAX_IMAGES = 8;

export function ImageCarousel({ images }: { images: ToolDetailImage[] }) {
	const shown = images.slice(0, MAX_IMAGES);
	const trackRef = useRef<HTMLDivElement>(null);

	if (shown.length === 0) {
		return <div className="aspect-video rounded-md bg-muted" />;
	}

	const overflows = shown.length > 4;

	function scrollByPage(dir: 1 | -1) {
		const track = trackRef.current;
		if (!track) {
			return;
		}
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		track.scrollBy({
			left: dir * track.clientWidth * 0.8,
			behavior: reduce ? "auto" : "smooth",
		});
	}

	return (
		<div className="relative">
			<div
				className="flex gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				ref={trackRef}
				style={{ scrollSnapType: "x mandatory" }}
			>
				{shown.map((img) => (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: thumb Supabase, dimensões via CSS
					<img
						alt=""
						className="aspect-square w-[calc((100%-1.5rem)/4)] flex-shrink-0 rounded-md object-cover"
						key={img.id}
						src={img.url}
						style={{ scrollSnapAlign: "start" }}
					/>
				))}
			</div>

			{overflows && (
				<>
					<Button
						aria-label="Imagens anteriores"
						className="-translate-y-1/2 absolute top-1/2 left-1"
						onClick={() => scrollByPage(-1)}
						size="icon-sm"
						variant="secondary"
					>
						<ChevronLeft aria-hidden className="size-4" />
					</Button>
					<Button
						aria-label="Próximas imagens"
						className="-translate-y-1/2 absolute top-1/2 right-1"
						onClick={() => scrollByPage(1)}
						size="icon-sm"
						variant="secondary"
					>
						<ChevronRight aria-hidden className="size-4" />
					</Button>
				</>
			)}
		</div>
	);
}
```

- [ ] **Step 2: check-types + lint**

Run: `bun check-types && bun check "apps/web/src/app/dashboard/tools/[id]/_components/image-carousel.tsx"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_components/image-carousel.tsx"
git commit -m "feat: ImageCarousel — carrossel de imagens com cap 8"
```

---

## Task 7: Reescrever `ToolSpecs` (grupos + divergência + AttributeValue)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/tool-specs.tsx`

Substitui o render flat por: seção Físicas (com ⚠ via `divergences.fixed`), um bloco por grupo de categoria (`AttributeValue`, ⚠ via `divergences.attributeSlugs`), e Fiscal (mantém HelpTooltip). Recebe `attributeGroups` e `divergences` como props (computados na page/overview).

- [ ] **Step 1: Ler o arquivo atual** (`tool-specs.tsx`) inteiro.

- [ ] **Step 2: Reescrever o arquivo**

```tsx
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { HelpTooltip } from "@/components/help-tooltip";
import { FISCAL_HELP, MODEL_HELP } from "../../_components/fields/spec-help";
import type { AttributeGroup } from "../_lib/attribute-grouping";
import type { SpecDivergences } from "../_lib/spec-divergence";
import type { ToolDetailRow } from "../_lib/tool-detail-data";
import { AttributeValue } from "./attribute-value";

interface ToolSpecsProps {
	attributeGroups: AttributeGroup[];
	divergences: SpecDivergences;
	tool: ToolDetailRow;
}

export function ToolSpecs({ tool, attributeGroups, divergences }: ToolSpecsProps) {
	const weightDiverges = divergences.fixed.has("weightKg");
	const powerDiverges = divergences.fixed.has("powerWatts");

	return (
		<TooltipProvider delay={300}>
			<div className="flex flex-col gap-5">
				<SpecSection title="Físicas">
					<SpecField help={<HelpTooltip label="Sobre Modelo" text={MODEL_HELP.model} />} label="Modelo" value={tool.model} />
					<SpecField help={<HelpTooltip label="Sobre Modelo NF" text={MODEL_HELP.invoiceModel} />} label="Modelo NF" value={tool.invoiceModel} />
					<SpecField label="Fabricante" value={tool.manufacturerName} />
					<SpecField
						diverges={powerDiverges}
						label="Potência"
						value={tool.powerWatts === null ? null : `${tool.powerWatts} W`}
					/>
					<SpecField
						diverges={weightDiverges}
						label="Peso"
						value={tool.weightKg === null ? null : `${tool.weightKg} kg`}
					/>
					<SpecField
						label="Dimensões"
						value={
							tool.lengthCm !== null && tool.widthCm !== null && tool.heightCm !== null
								? `${tool.lengthCm} × ${tool.widthCm} × ${tool.heightCm} cm`
								: null
						}
					/>
				</SpecSection>

				{attributeGroups.map((group) => (
					<SpecSection key={group.categoryId} title={`Técnicas · ${group.categoryName}`}>
						{group.attributes.map((a) => (
							<div key={a.slug}>
								<dt className="flex items-center gap-1 text-muted-foreground text-xs">
									{a.label}
									{divergences.attributeSlugs.has(a.slug) && <DivergenceMark />}
								</dt>
								<dd>
									<AttributeValue attr={a} />
								</dd>
							</div>
						))}
					</SpecSection>
				))}

				<SpecSection title="Classificação fiscal">
					<SpecField help={<HelpTooltip label="Sobre HS Code" {...FISCAL_HELP.hsCode} />} label="HS Code" value={tool.hsCode} />
					<SpecField help={<HelpTooltip label="Sobre NCM" {...FISCAL_HELP.ncm} />} label="NCM" value={tool.ncm} />
					<SpecField help={<HelpTooltip label="Sobre CEST" {...FISCAL_HELP.cest} />} label="CEST" value={tool.cest} />
				</SpecSection>
			</div>
		</TooltipProvider>
	);
}

function SpecSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section>
			<h3 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
				{title}
			</h3>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm md:grid-cols-3">
				{children}
			</dl>
		</section>
	);
}

function SpecField({
	label,
	value,
	help,
	diverges,
}: {
	diverges?: boolean;
	help?: ReactNode;
	label: string;
	value: string | null;
}) {
	return (
		<div>
			<dt className="flex items-center gap-1 text-muted-foreground text-xs">
				{label}
				{help}
				{diverges && <DivergenceMark />}
			</dt>
			<dd>{value ?? "—"}</dd>
		</div>
	);
}

function DivergenceMark() {
	return (
		<Tooltip>
			<TooltipTrigger
				render={<span className="inline-flex text-warning" />}
				aria-label="Valor diverge entre cadastro e ficha técnica"
			>
				<TriangleAlert aria-hidden className="size-3.5" />
			</TooltipTrigger>
			<TooltipContent>
				Valor diverge entre o cadastro (coluna fixa) e a ficha técnica (atributo).
			</TooltipContent>
		</Tooltip>
	);
}
```

- [ ] **Step 3: check-types + lint**

Run: `bun check-types && bun check "apps/web/src/app/dashboard/tools/[id]/_components/tool-specs.tsx"`
Expected: PASS. (Não commitar ainda — `OverviewTab` ainda passa props antigas; o build do app só fecha após a Task 7. Os erros de tipo de `OverviewTab` aparecem; seguir pra Task 8 antes de commitar este conjunto.)

> Nota: Tasks 7 e 8 formam **um único commit** porque a assinatura de `ToolSpecs` muda e o consumidor (`OverviewTab`) precisa acompanhar. Não commitar entre elas.

---

## Task 8: Reescrever `OverviewTab` (grid de cards — layout B)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx`

Compõe o grid de `SectionCard`: Imagens (carrossel, largura cheia), Descrição (cheia, se houver), depois grid `auto-fit minmax(280px,1fr)` com Físicas+Técnicas+Fiscal (via `ToolSpecs` dentro de um card), Estoque, e Logística & Metadados. Computa `attributeGroups` e `divergences` aqui.

- [ ] **Step 1: Ler o arquivo atual** (`overview-tab.tsx`) inteiro.

- [ ] **Step 2: Reescrever o arquivo**

```tsx
import Link from "next/link";

import { buttonVariants } from "@emach/ui/components/button";
import { formatDayMonthShortYear } from "@/lib/format/datetime";
import { groupAttributesByCategory } from "../_lib/attribute-grouping";
import { detectSpecDivergences } from "../_lib/spec-divergence";
import type {
	ToolDetailAttribute,
	ToolDetailCategory,
	ToolDetailImage,
	ToolDetailRow,
	ToolStockSummary,
} from "../_lib/tool-detail-data";
import { ToolDescription } from "@/components/tool-description";
import { ImageCarousel } from "./image-carousel";
import { SectionCard } from "./section-card";
import { ToolSpecs } from "./tool-specs";

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
	const attributeGroups = groupAttributesByCategory(attributes);
	const divergences = detectSpecDivergences(tool, attributes);
	const alertCount = stockSummary.criticalCount + stockSummary.reorderCount;

	return (
		<div className="flex flex-col gap-4">
			<SectionCard title={`Imagens · ${images.length}`}>
				<ImageCarousel images={images} />
			</SectionCard>

			{tool.description && (
				<SectionCard title="Descrição">
					<ToolDescription markdown={tool.description} />
				</SectionCard>
			)}

			<div className="grid gap-4 lg:grid-cols-[1fr_300px]">
				<SectionCard title="Especificações">
					<ToolSpecs
						attributeGroups={attributeGroups}
						divergences={divergences}
						tool={tool}
					/>
				</SectionCard>

				<div className="flex flex-col gap-4">
					<SectionCard
						action={
							<Link
								className="text-info text-xs hover:underline"
								href={`/dashboard/tools/${tool.id}?tab=estoque`}
							>
								Ver aba →
							</Link>
						}
						title="Estoque"
					>
						<p className="font-semibold text-2xl tabular-nums">
							{stockSummary.totalStock}{" "}
							<span className="font-normal text-muted-foreground text-sm">unid.</span>
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							em {stockSummary.branchCount}{" "}
							{stockSummary.branchCount === 1 ? "filial" : "filiais"}
							{alertCount > 0 && (
								<>
									{" · "}
									<span className="text-destructive">{alertCount} em alerta</span>
								</>
							)}
						</p>
					</SectionCard>

					<SectionCard title="Logística & metadados">
						<dl className="flex flex-col gap-2 text-sm">
							<MetaRow label="Frete > 30kg">
								{tool.overweightShippingAmount === null
									? "a combinar"
									: `R$ ${tool.overweightShippingAmount}`}
							</MetaRow>
							<MetaRow label="Categoria">
								{primaryCategory?.categoryName ?? "—"}
								{otherCategories.length > 0 && (
									<span className="block text-muted-foreground text-xs">
										+ {otherCategories.map((c) => c.categoryName).join(", ")}
									</span>
								)}
							</MetaRow>
							<MetaRow label="Fornecedor">{tool.supplierName ?? "—"}</MetaRow>
							<MetaRow label="Visibilidade">
								{tool.visibleOnSite ? (
									<span className="text-success">Visível no site</span>
								) : (
									<span className="text-muted-foreground">Oculta</span>
								)}
							</MetaRow>
							{tool.slug && (
								<MetaRow label="Slug">
									<span className="font-mono text-xs">{tool.slug}</span>
								</MetaRow>
							)}
							<MetaRow label="Criada">{formatDayMonthShortYear(tool.createdAt)}</MetaRow>
						</dl>
					</SectionCard>
				</div>
			</div>
		</div>
	);
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd>{children}</dd>
		</div>
	);
}
```

- [ ] **Step 3: check-types + lint**

Run: `bun check-types && bun check "apps/web/src/app/dashboard/tools/[id]"`
Expected: PASS (agora que `OverviewTab` passa as props novas a `ToolSpecs`). O `buttonVariants` foi removido do uso? Conferir imports não-usados — remover `buttonVariants` se o lint apontar (substituído por `<Link>` simples no action). Ajustar até lint limpo.

- [ ] **Step 4: Smoke visual no browser** (dev-here na :3006)

Navegar e conferir (texto via `read_page`, screenshot pro visual):
1. `localhost:3006/dashboard/tools/b3be9615-...` → Visão geral: cards edge-to-edge; specs em Físicas + "Técnicas · Ferramentas Elétricas" + "Técnicas · Furadeiras e Parafusadeiras" + Fiscal; **⚠ no Peso** (Físicas e Técnicas); select "Capacidade do Mandril: 13mm"; range "0 – 2800 RPM"; boolean "Com Percussão: Sim"; card Logística com "Frete > 30kg" e slug.
2. `localhost:3006/dashboard/tools/fb265dfa-...` → atributo **color** "Cor de Acabamento" renderiza **swatch prata** + label.
3. Carrossel: esta Furadeira tem 3 imagens (≤4) → **sem setas**. Conferir que aparece o grid sem setas. (Se quiser testar setas, usar uma tool com >4 imagens.)
4. `read_console_messages` (onlyErrors) → sem erros.

- [ ] **Step 5: Commit (Tasks 7+8 juntas)**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_components/tool-specs.tsx" "apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx"
git commit -m "feat: Visão geral em grid de cards com specs agrupadas e divergência"
```

---

## Task 9: Passe de consistência nas outras tabs

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/tool-reviews-section.tsx`
- Revisar (sem mudança estrutural): `estoque-tab.tsx`, `variants-tab.tsx`, `activity-tab-client.tsx`

Objetivo: adotar `SectionCard` onde dá clareza e alinhar borda/cor — **sem** redesign do zero. Escopo mínimo e reversível.

- [ ] **Step 1: Ler `tool-reviews-section.tsx`** inteiro.

- [ ] **Step 2: Envolver o bloco de rating-summary num `SectionCard`**

Trocar o `<div className="...rounded-md border border-border p-4">` do bloco de média/distribuição por um `SectionCard title="Resumo das avaliações"`, mantendo a lista `divide-y` de reviews fora do card (como está). Importar `SectionCard` de `./section-card`. Manter o resto.

- [ ] **Step 3: Conferir Estoque/Variantes/Atividade**

Ler `estoque-tab.tsx` e `variants-tab.tsx`. Se o wrapper de tabela usa `rounded-md border border-border` que destoa do `SectionCard` (raio `lg` vs `md`), alinhar o raio pra `rounded-lg` por consistência. **Não** mudar estrutura de tabela. Se já estiver coerente, não tocar (registrar no commit que não precisou).

- [ ] **Step 4: check-types + lint**

Run: `bun check-types && bun check "apps/web/src/app/dashboard/tools/[id]"`
Expected: PASS.

- [ ] **Step 5: Smoke visual** das abas Avaliações/Estoque/Variantes na :3006 — sem regressão de borda/cor; cards coerentes.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]"
git commit -m "refactor: consistência de card/borda nas demais tabs do perfil"
```

---

## Task 10: Verificação final

- [ ] **Step 1: Suite de testes**

Run: `bun --cwd apps/web test attribute-grouping spec-divergence`
Expected: PASS (todos).

- [ ] **Step 2: Tipos + lint do app inteiro**

Run: `bun check-types && bun check`
Expected: PASS (0 erros).

- [ ] **Step 3: Smoke final** nas duas tools (Furadeira + Disco de Corte), todas as 5 abas, `read_console_messages` limpo. Conferir que a divergência aparece com **ícone + cor + tooltip** (AAA, não só cor).

- [ ] **Step 4: Re-rodar `/impeccable critique`** no perfil pra medir o score (era 34) — opcional, mas fecha o loop.

---

## Self-Review (preenchido pelo autor do plano)

**Cobertura do spec:**
- Carrossel ≤8 → Task 6. ✓
- Borda edge-to-edge → Task 5 (`SectionCard`). ✓
- Specs agrupadas por categoria-fonte → Tasks 1, 2, 7. ✓
- Render por tipo (color/select/boolean/range) → Task 4. ✓
- Divergência sinalizada → Tasks 3, 7. ✓
- Campos expostos (frete>30kg, slug, visibilidade) → Task 8. ✓
- Fiscal com HelpTooltip → Task 7 (mantém). ✓
- Passe de consistência nas outras tabs → Task 9. ✓

**Sem placeholders:** todo step de código tem código real; comandos com expected output. ✓

**Consistência de tipos:** `ToolDetailAttribute` (Task 1) consumido por `groupAttributesByCategory`/`detectSpecDivergences`/`AttributeValue`/`ToolSpecs` com os mesmos campos. `AttributeGroup` (Task 2) e `SpecDivergences` (Task 3) são as props de `ToolSpecs` (Task 7) e computados em `OverviewTab` (Task 8). ✓
