# Redesign da aba Estoque + drawer do perfil de ferramenta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a matriz da aba `/dashboard/tools/[id]?tab=estoque` por cards de filial agrupados por variante (stat-card do design system) e substituir o drawer quebrado pelo `BranchStockEditSheet` padrão-ouro, liderado pela filial.

**Architecture:** Dois helpers puros testáveis (status de estoque + agrupamento por variante), um card novo de filial, parametrização do header do `BranchStockEditSheet` por `lead`, e a reescrita da `EstoqueTab` que monta um `BranchStockRow` por célula e reusa o drawer. O drawer existente da aba de Filiais fica inalterado (prop opcional com default).

**Tech Stack:** Next 16 / React 19 / Tailwind v4 / base-ui `Sheet` / Drizzle / vitest (node).

Spec: `docs/superpowers/specs/2026-06-12-perfil-ferramenta-estoque-redesign-design.md`.

---

## File Structure

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Criar | `apps/web/src/app/dashboard/stock/_components/stock-status.ts` | `stockStatus(input)` — regra única de status de estoque. |
| Criar | `apps/web/src/app/dashboard/stock/_components/__tests__/stock-status.test.ts` | Testes da regra. |
| Criar | `apps/web/src/app/dashboard/tools/[id]/_lib/stock-grouping.ts` | `groupStockByVariant(...)` — agrupa células por variante, ordenado. |
| Criar | `apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/stock-grouping.test.ts` | Testes do agrupamento. |
| Criar | `apps/web/src/app/dashboard/tools/[id]/_components/tool-stock-branch-card.tsx` | Stat-card de filial com status de estoque. |
| Modificar | `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx` | Usar `stockStatus` compartilhado. |
| Modificar | `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` | Prop `lead` + usar `stockStatus` compartilhado. |
| Modificar | `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts` | `ToolStockRow` ganha `branchCity`/`branchState`. |
| Modificar | `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx` | Reescrita: seções por variante + cards + drawer reusado. |
| Modificar | `apps/web/src/app/dashboard/tools/[id]/page.tsx` | Passar `toolName`/`toolImageUrl` à `EstoqueTab`. |
| Deletar | `apps/web/src/app/dashboard/tools/[id]/_components/stock-cell-sheet.tsx` | Substituído pelo reuso. |

Comandos: testes `bun --cwd apps/web test`; tipos `bun check-types`; lint `bun check`.

---

### Task 1: Helper de status de estoque (regra única)

**Files:**
- Create: `apps/web/src/app/dashboard/stock/_components/stock-status.ts`
- Test: `apps/web/src/app/dashboard/stock/_components/__tests__/stock-status.test.ts`
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/stock/_components/__tests__/stock-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stockStatus } from "../stock-status";

describe("stockStatus", () => {
	it("critical quando há mínimo e qty <= mínimo", () => {
		expect(stockStatus({ quantity: 2, minQty: 4, reorderPoint: 8 })).toBe(
			"critical"
		);
		expect(stockStatus({ quantity: 4, minQty: 4, reorderPoint: 8 })).toBe(
			"critical"
		);
	});

	it("reorder quando acima do mínimo mas <= ponto de reposição", () => {
		expect(stockStatus({ quantity: 6, minQty: 4, reorderPoint: 8 })).toBe(
			"reorder"
		);
	});

	it("ok quando acima do ponto de reposição", () => {
		expect(stockStatus({ quantity: 20, minQty: 4, reorderPoint: 8 })).toBe("ok");
	});

	it("none quando não há limites configurados", () => {
		expect(stockStatus({ quantity: 5, minQty: 0, reorderPoint: 0 })).toBe(
			"none"
		);
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test stock-status`
Expected: FAIL — `Failed to resolve import "../stock-status"`.

- [ ] **Step 3: Implementar o helper**

Criar `apps/web/src/app/dashboard/stock/_components/stock-status.ts`:

```ts
export type StockStatus = "critical" | "none" | "ok" | "reorder";

export interface StockStatusInput {
	minQty: number;
	quantity: number;
	reorderPoint: number;
}

/** Regra única de status de estoque (usada por cards e drawer). */
export function stockStatus({
	quantity,
	minQty,
	reorderPoint,
}: StockStatusInput): StockStatus {
	if (minQty > 0 && quantity <= minQty) {
		return "critical";
	}
	if (reorderPoint > 0 && quantity > minQty && quantity <= reorderPoint) {
		return "reorder";
	}
	if (minQty === 0 && reorderPoint === 0) {
		return "none";
	}
	return "ok";
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test stock-status`
Expected: PASS (4 testes).

- [ ] **Step 5: Refatorar `branch-stock-card.tsx` para usar o helper**

No arquivo `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`, remover a função local `stockStatus` e o tipo `StockStatus` (linhas 13–30) e importar o compartilhado. Trocar o import block do topo para incluir:

```tsx
import { stockStatus } from "./stock-status";
```

E ajustar a chamada dentro de `BranchStockCard` (a assinatura mudou de `stockStatus(row)` para receber o objeto):

```tsx
const status = stockStatus({
	quantity: row.quantity,
	minQty: row.minQty,
	reorderPoint: row.reorderPoint,
});
```

Remover o bloco:

```tsx
type StockStatus = "critical" | "none" | "ok" | "reorder";

function stockStatus(row: BranchStockRow): StockStatus {
	if (row.minQty > 0 && row.quantity <= row.minQty) {
		return "critical";
	}
	if (
		row.reorderPoint > 0 &&
		row.quantity > row.minQty &&
		row.quantity <= row.reorderPoint
	) {
		return "reorder";
	}
	if (row.minQty === 0 && row.reorderPoint === 0) {
		return "none";
	}
	return "ok";
}
```

- [ ] **Step 6: Verificar tipos e lint**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/stock/_components/stock-status.ts \
  apps/web/src/app/dashboard/stock/_components/__tests__/stock-status.test.ts \
  apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx
git commit -m "refactor: extrai stockStatus para helper compartilhado"
```

---

### Task 2: Helper `groupStockByVariant`

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_lib/stock-grouping.ts`
- Test: `apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/stock-grouping.test.ts`

Contexto de tipos: `ToolStockRow` (em `../tool-detail-data`) tem os campos `branchId, branchName, branchCity, branchState, minQty, quantity, reorderPoint, variantId, variantSku, variantVoltage`. (Os campos `branchCity`/`branchState` chegam na Task 3; o teste abaixo já os inclui no factory para casar com o tipo final.)

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/stock-grouping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupStockByVariant } from "../stock-grouping";
import type { ToolStockRow } from "../tool-detail-data";

function cell(p: Partial<ToolStockRow>): ToolStockRow {
	return {
		branchId: "b1",
		branchName: "Matriz",
		branchCity: "São Paulo",
		branchState: "SP",
		minQty: 0,
		quantity: 0,
		reorderPoint: 0,
		variantId: "v1",
		variantSku: "SKU-1",
		variantVoltage: null,
		...p,
	};
}

describe("groupStockByVariant", () => {
	it("agrupa por variante e ordena com a default primeiro, depois por sortOrder", () => {
		const rows = [
			cell({ variantId: "v220", variantSku: "S-220", branchId: "b1" }),
			cell({ variantId: "v127", variantSku: "S-127", branchId: "b1" }),
			cell({ variantId: "v127", variantSku: "S-127", branchId: "b2" }),
		];
		const order = [
			{ id: "v220", isDefault: false, sortOrder: 1 },
			{ id: "v127", isDefault: true, sortOrder: 0 },
		];
		const groups = groupStockByVariant(rows, order);
		expect(groups.map((g) => g.variantId)).toEqual(["v127", "v220"]);
		expect(groups[0]?.variantSku).toBe("S-127");
		expect(groups[0]?.branches).toHaveLength(2);
		expect(groups[1]?.branches).toHaveLength(1);
	});

	it("ignora variantes sem nenhuma célula de estoque", () => {
		const rows = [cell({ variantId: "v1" })];
		const order = [
			{ id: "v1", isDefault: true, sortOrder: 0 },
			{ id: "v2", isDefault: false, sortOrder: 1 },
		];
		const groups = groupStockByVariant(rows, order);
		expect(groups.map((g) => g.variantId)).toEqual(["v1"]);
	});

	it("devolve [] para entrada vazia", () => {
		expect(groupStockByVariant([], [])).toEqual([]);
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test stock-grouping`
Expected: FAIL — `Failed to resolve import "../stock-grouping"`.

- [ ] **Step 3: Implementar o helper**

Criar `apps/web/src/app/dashboard/tools/[id]/_lib/stock-grouping.ts`:

```ts
import type { ToolStockRow } from "./tool-detail-data";

export interface VariantStockGroup {
	branches: ToolStockRow[];
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
}

interface VariantOrderInfo {
	id: string;
	isDefault: boolean;
	sortOrder: number;
}

/**
 * Agrupa células de estoque (variante × filial) por variante.
 * Ordena os grupos com a variante default primeiro, depois por sortOrder.
 * Variantes sem nenhuma célula são omitidas. SKU/voltagem vêm da própria célula.
 */
export function groupStockByVariant(
	stockRows: ToolStockRow[],
	variantOrder: VariantOrderInfo[]
): VariantStockGroup[] {
	const byVariant = new Map<string, ToolStockRow[]>();
	for (const row of stockRows) {
		const list = byVariant.get(row.variantId);
		if (list) {
			list.push(row);
		} else {
			byVariant.set(row.variantId, [row]);
		}
	}

	const rank = new Map(variantOrder.map((v) => [v.id, v]));
	const groups: VariantStockGroup[] = [];
	for (const [variantId, branches] of byVariant) {
		const first = branches[0];
		if (!first) {
			continue;
		}
		groups.push({
			branches,
			variantId,
			variantSku: first.variantSku,
			variantVoltage: first.variantVoltage,
		});
	}

	groups.sort((a, b) => {
		const va = rank.get(a.variantId);
		const vb = rank.get(b.variantId);
		const da = va?.isDefault ? 0 : 1;
		const db = vb?.isDefault ? 0 : 1;
		if (da !== db) {
			return da - db;
		}
		return (va?.sortOrder ?? 0) - (vb?.sortOrder ?? 0);
	});

	return groups;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test stock-grouping`
Expected: PASS (3 testes).

> Nota: este teste já referencia `branchCity`/`branchState` no factory. Se a Task 3 ainda não rodou, `bun check-types` vai acusar campos faltando em `ToolStockRow` — é esperado; a Task 3 fecha isso. O teste em si (vitest) passa porque o objeto literal apenas adiciona campos.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_lib/stock-grouping.ts" \
  "apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/stock-grouping.test.ts"
git commit -m "feat: helper groupStockByVariant para a aba de estoque"
```

---

### Task 3: Dados — `branchCity`/`branchState` em `ToolStockRow`

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts`

- [ ] **Step 1: Estender a interface `ToolStockRow`**

No arquivo, localizar a interface (atualmente linhas 46–55) e adicionar `branchCity` e `branchState`:

```ts
export interface ToolStockRow {
	branchCity: string | null;
	branchId: string;
	branchName: string;
	branchState: string | null;
	minQty: number;
	quantity: number;
	reorderPoint: number;
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
}
```

- [ ] **Step 2: Adicionar os campos ao `select` da query de estoque**

No `select` da query `stockRows` (atualmente linhas 146–155), adicionar `branchCity` e `branchState` lendo de `branch`:

```ts
db
	.select({
		variantId: toolVariant.id,
		variantSku: toolVariant.sku,
		variantVoltage: toolVariant.voltage,
		branchId: branch.id,
		branchName: branch.name,
		branchCity: branch.city,
		branchState: branch.state,
		quantity: stockLevel.quantity,
		minQty: stockLevel.minQty,
		reorderPoint: stockLevel.reorderPoint,
	})
	.from(stockLevel)
	.innerJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
	.innerJoin(branch, eq(branch.id, stockLevel.branchId))
	.where(eq(toolVariant.toolId, id))
	.orderBy(asc(branch.name), asc(toolVariant.sortOrder)),
```

(O `branch` já está importado e já participa do `innerJoin`; `branch.city`/`branch.state` existem no schema `packages/db/src/schema/inventory.ts`.)

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: sem erros (a Task 2, se já aplicada, agora encontra os campos no tipo).

- [ ] **Step 4: Rodar testes do agrupamento (regressão)**

Run: `bun --cwd apps/web test stock-grouping`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts"
git commit -m "feat: ToolStockRow expõe cidade/UF da filial"
```

---

### Task 4: Prop `lead` no `BranchStockEditSheet`

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx`

Objetivo: o mesmo drawer serve dois contextos. `lead="tool"` (default) preserva o comportamento atual da aba de Filiais; `lead="branch"` lidera pela filial (contexto da ferramenta) e oculta o link "Editar ficha".

- [ ] **Step 1: Trocar a função local `resolveStatus` pelo helper compartilhado**

No topo, adicionar o import do helper e o ícone `Wrench` (lucide) ao import existente de `lucide-react` (que já traz `ArrowRight`, `ExternalLink`):

```tsx
import { stockStatus } from "./stock-status";
```

```tsx
import { ArrowRight, ExternalLink, Wrench } from "lucide-react";
```

Remover a função local `resolveStatus` e o `type StockStatus` (atualmente linhas 40–57). Onde o componente calcula `const status = resolveStatus(row);` (dentro de `BranchStockEditSheet`, perto da linha 356), trocar por:

```tsx
const status = stockStatus({
	quantity: row.quantity,
	minQty: row.minQty,
	reorderPoint: row.reorderPoint,
});
```

Manter os mapas `STATUS_LABEL` e `STATUS_CLASS` como estão (passam a tipar pela `StockStatus` importada — se o TS reclamar do tipo de chave, importar o tipo junto: `import { type StockStatus, stockStatus } from "./stock-status";`).

- [ ] **Step 2: Adicionar a prop `lead` à interface e à assinatura**

Atualizar `BranchStockEditSheetProps` (linhas 241–247) e o destructuring (linhas 250–256):

```tsx
interface BranchStockEditSheetProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	lead?: "branch" | "tool";
	onClose: () => void;
	row: BranchStockRow | null;
}
```

```tsx
export function BranchStockEditSheet({
	branchId,
	branchName,
	canMutate,
	lead = "tool",
	onClose,
	row,
}: BranchStockEditSheetProps) {
```

- [ ] **Step 3a: Fallback do avatar por `lead`**

No contexto da ferramenta (`lead="branch"`), a ferramenta já é conhecida — usar o ícone `Wrench` no fallback. Manter as iniciais no contexto da filial (`lead="tool"`), onde elas identificam a ferramenta. Para não criar ternário aninhado (`noNestedTernary`), extrair o fallback numa const logo antes do `return (` (depois do guard `if (!row) return null;`):

```tsx
const fallbackAvatar =
	lead === "branch" ? (
		<div className="flex size-full items-center justify-center text-muted-foreground">
			<Wrench aria-hidden className="size-6" />
		</div>
	) : (
		<div className="flex size-full items-center justify-center font-semibold text-[18px] text-muted-foreground">
			{row.toolName.slice(0, 2).toUpperCase()}
		</div>
	);
```

E no avatar do header (atualmente linhas 382–396), trocar o ramo `else` por `fallbackAvatar`:

```tsx
<div className="size-14 flex-shrink-0 overflow-hidden rounded-[8px] bg-muted">
	{row.imageUrl ? (
		// biome-ignore lint/performance/noImgElement: Supabase public URL
		// biome-ignore lint/correctness/useImageSize: fixed size via Tailwind
		<img alt="" className="size-full object-cover" src={row.imageUrl} />
	) : (
		fallbackAvatar
	)}
</div>
```

- [ ] **Step 3b: Ramificar o bloco de texto do header por `lead`**

Substituir o bloco `<div className="min-w-0 flex-1">…</div>` dentro do `SheetHeader` (atualmente linhas 398–426) por:

```tsx
<div className="min-w-0 flex-1">
	<div className="flex flex-wrap items-start gap-2">
		<SheetTitle className="text-[15px] leading-snug">
			{lead === "branch" ? branchName : row.toolName}
		</SheetTitle>
		{statusLabel && (
			<span
				className={`inline-flex items-center rounded-md px-2 py-0.5 font-medium text-[11px] ${STATUS_CLASS[status]}`}
			>
				{statusLabel}
			</span>
		)}
	</div>
	<p className="mt-0.5 text-muted-foreground text-xs">
		{lead === "branch" ? (
			<>
				{row.toolName} · SKU {row.sku}
				{row.voltage ? ` · ${row.voltage}` : ""}
			</>
		) : (
			<>
				SKU {row.sku}
				{row.voltage ? ` · ${row.voltage}` : ""} · {branchName}
			</>
		)}
	</p>
	{lead === "tool" && (
		<a
			className="mt-2 inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
			href={`/dashboard/tools/${row.toolId}`}
			rel="noopener noreferrer"
			target="_blank"
		>
			<ExternalLink aria-hidden className="size-3" />
			Editar ficha da ferramenta
		</a>
	)}
</div>
```

(O avatar acima desse bloco — imagem da ferramenta com fallback de iniciais — permanece igual nos dois contextos: a ferramenta é a única com imagem.)

- [ ] **Step 4: Verificar tipos e lint**

Run: `bun check-types`
Expected: sem erros.

Run: `bun check`
Expected: sem novos erros nos arquivos tocados.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx
git commit -m "feat: BranchStockEditSheet aceita lead (tool|branch) no header"
```

---

### Task 5: Card de filial `ToolStockBranchCard`

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/tool-stock-branch-card.tsx`

- [ ] **Step 1: Criar o componente**

Criar `apps/web/src/app/dashboard/tools/[id]/_components/tool-stock-branch-card.tsx`:

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";

import { stockStatus } from "@/app/dashboard/stock/_components/stock-status";
import { getInitials } from "@/lib/format/name";
import type { ToolStockRow } from "../_lib/tool-detail-data";

interface ToolStockBranchCardProps {
	cell: ToolStockRow;
	onSelect: (cell: ToolStockRow) => void;
}

export function ToolStockBranchCard({
	cell,
	onSelect,
}: ToolStockBranchCardProps) {
	const status = stockStatus({
		quantity: cell.quantity,
		minQty: cell.minQty,
		reorderPoint: cell.reorderPoint,
	});

	let quantityColor = "text-foreground";
	if (status === "critical" || cell.quantity === 0) {
		quantityColor = "text-destructive";
	} else if (status === "reorder") {
		quantityColor = "text-amber-500";
	}

	const meta = [cell.branchCity, cell.branchState].filter(Boolean).join("/");

	return (
		// biome-ignore lint/a11y/useSemanticElements: card clicável (padrão DESIGN.md §4) — div role=button com onKeyDown
		<div
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => onSelect(cell)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(cell);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-10 flex-shrink-0 items-center justify-center rounded-[8px] bg-muted font-semibold text-[13px] text-muted-foreground">
					{getInitials(cell.branchName)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-[14px] text-foreground leading-tight tracking-tight">
						{cell.branchName}
					</p>
					{meta && (
						<p className="truncate text-muted-foreground text-xs">{meta}</p>
					)}
				</div>
				{status !== "none" && (
					<div className="flex-shrink-0">
						{status === "critical" && <Badge variant="destructive">Crítico</Badge>}
						{status === "reorder" && <Badge variant="warning">Repor</Badge>}
						{status === "ok" && <Badge variant="success">OK</Badge>}
					</div>
				)}
			</div>

			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className={`font-bold text-[18px] tabular-nums ${quantityColor}`}>
						{cell.quantity}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Qtd
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{cell.minQty > 0 ? cell.minQty : "—"}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Mín
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{cell.reorderPoint > 0 ? cell.reorderPoint : "—"}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Repor
					</span>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_components/tool-stock-branch-card.tsx"
git commit -m "feat: ToolStockBranchCard (stat-card de filial com status de estoque)"
```

---

### Task 6: Reescrever `EstoqueTab` + ligar na page + remover drawer antigo

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx`
- Modify: `apps/web/src/app/dashboard/tools/[id]/page.tsx`
- Delete: `apps/web/src/app/dashboard/tools/[id]/_components/stock-cell-sheet.tsx`

- [ ] **Step 1: Reescrever `estoque-tab.tsx`**

Substituir todo o conteúdo de `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx` por:

```tsx
"use client";

import { useState } from "react";

import { BranchStockEditSheet } from "@/app/dashboard/stock/_components/branch-stock-edit-sheet";
import type { BranchStockRow } from "@/app/dashboard/stock/branch-stock-data";

import { groupStockByVariant } from "../_lib/stock-grouping";
import type { ToolDetailVariant, ToolStockRow } from "../_lib/tool-detail-data";
import { ToolStockBranchCard } from "./tool-stock-branch-card";

interface EstoqueTabProps {
	canMutate: boolean;
	stockRows: ToolStockRow[];
	toolId: string;
	toolImageUrl: string | null;
	toolName: string;
	variants: ToolDetailVariant[];
}

export function EstoqueTab({
	canMutate,
	stockRows,
	toolId,
	toolImageUrl,
	toolName,
	variants,
}: EstoqueTabProps) {
	const [selected, setSelected] = useState<ToolStockRow | null>(null);

	const groups = groupStockByVariant(stockRows, variants);

	if (groups.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Sem variantes ou filiais com estoque registrado.
			</p>
		);
	}

	const selectedRow: BranchStockRow | null = selected
		? {
				imageUrl: toolImageUrl,
				minQty: selected.minQty,
				quantity: selected.quantity,
				reorderPoint: selected.reorderPoint,
				sku: selected.variantSku,
				toolId,
				toolName,
				variantId: selected.variantId,
				voltage: selected.variantVoltage,
			}
		: null;

	return (
		<div className="flex flex-col gap-6">
			{groups.map((group) => (
				<section key={group.variantId}>
					<div className="mb-3 flex flex-wrap items-center gap-2">
						<span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-foreground text-xs">
							SKU {group.variantSku}
							{group.variantVoltage ? ` · ${group.variantVoltage}` : ""}
						</span>
						<span className="text-muted-foreground text-xs">
							{group.branches.reduce((sum, b) => sum + b.quantity, 0)} un ·{" "}
							{group.branches.length}{" "}
							{group.branches.length === 1 ? "filial" : "filiais"}
						</span>
					</div>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
						{group.branches.map((cell) => (
							<ToolStockBranchCard
								cell={cell}
								key={`${cell.variantId}:${cell.branchId}`}
								onSelect={setSelected}
							/>
						))}
					</div>
				</section>
			))}

			<BranchStockEditSheet
				branchId={selected?.branchId ?? ""}
				branchName={selected?.branchName ?? ""}
				canMutate={canMutate}
				lead="branch"
				onClose={() => setSelected(null)}
				row={selectedRow}
			/>
		</div>
	);
}
```

(O `BranchStockEditSheet` já só renderiza quando `row !== null` — passar `branchId`/`branchName` vazios quando `selected` é nulo é inócuo porque o componente retorna `null` antes de usá-los.)

- [ ] **Step 2: Passar `toolName`/`toolImageUrl` na page**

Em `apps/web/src/app/dashboard/tools/[id]/page.tsx`, no render do `<EstoqueTab>` (atualmente linhas 92–97), adicionar as duas props:

```tsx
<EstoqueTab
	canMutate={canMutate}
	stockRows={detail.stockRows}
	toolId={detail.tool.id}
	toolImageUrl={detail.images[0]?.url ?? null}
	toolName={detail.tool.name}
	variants={detail.variants}
/>
```

- [ ] **Step 3: Remover o drawer antigo**

```bash
git rm "apps/web/src/app/dashboard/tools/[id]/_components/stock-cell-sheet.tsx"
```

Conferir que ninguém mais o importa:

Run: `rg -n "stock-cell-sheet|StockCellSheet" apps/web/src`
Expected: sem resultados.

- [ ] **Step 4: Verificar tipos e lint**

Run: `bun check-types`
Expected: sem erros.

Run: `bun check`
Expected: sem novos erros nos arquivos tocados.

- [ ] **Step 5: Rodar a suíte de testes**

Run: `bun --cwd apps/web test stock`
Expected: PASS (`stock-status`, `stock-grouping`).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx" \
  "apps/web/src/app/dashboard/tools/[id]/page.tsx"
git commit -m "feat: aba de estoque em cards de filial por variante + drawer padrão-ouro"
```

---

### Task 7: Verificação final (smoke visual)

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir o dev server na porta 3006**

Run (background): `cd apps/web && ./node_modules/.bin/next dev --port 3006 > /tmp/dev-here-3006.log 2>&1`
Aguardar o bind: `until ss -ltn "sport = :3006" | grep -q LISTEN; do sleep 0.5; done`

- [ ] **Step 2: Conferir a aba e o drawer (Furadeira)**

Abrir `http://localhost:3006/dashboard/tools/b3be9615-35e4-4849-8ad2-c1cb821d4cf9?tab=estoque`. Confirmar:
- Seções por variante (SKU · voltagem) com cards de filial (avatar de iniciais + cidade/UF + badge de status + footer Qtd/Mín/Repor).
- Clicar num card abre o drawer **liderado pela filial** (título = filial, ferramenta no subtítulo, sem link "Editar ficha").
- Salvar um ajuste atualiza o número no card **na hora** (sem reload manual).
- Console sem erros (`read_console_messages`, `onlyErrors`).

- [ ] **Step 3: Conferir um segundo caso (Disco de Corte)**

Abrir `http://localhost:3006/dashboard/tools/fb265dfa-0d23-41e8-af6d-4bcf20ac4b5d?tab=estoque` e repetir as checagens.

- [ ] **Step 4: Confirmar que a aba de Filiais não regrediu**

Abrir `http://localhost:3006/dashboard/branches/7b2b8bb5-e85d-4c6b-872d-3dbbe0dc307d?tab=stock`, abrir o drawer de uma ferramenta e confirmar que ainda lidera pela **ferramenta** (título = ferramenta, link "Editar ficha" presente).

- [ ] **Step 5: Rodar a suíte completa**

Run: `bun --cwd apps/web test`
Expected: sem novas falhas além das pré-existentes em `promotions/promotion-schema.test.ts` (não relacionadas a este diff).

---

## Notas de execução

- **Reads antes de Edit:** cada subagente implementer deve `Read` o arquivo antes de `Edit` (não herda estado do parent) e rodar `bun check-types` antes do commit.
- **Hook de auto-format:** `.claude/settings.json` roda `bun fix` após `Write`/`Edit` e pode reordenar campos — re-ler o arquivo se um `Edit` subsequente falhar por `old_string`.
- **Ordem de Task 2 × 3:** a Task 2 referencia `branchCity`/`branchState` (que a Task 3 adiciona). Se executadas em ordem, `check-types` só fica verde após a Task 3 — esperado e documentado na Task 2 Step 4.
- **Pool Supabase:** se o dev server logar `EMAXCONNSESSION`/saturação de pool, reiniciar o server (`fuser -k 3006/tcp` + subir de novo) libera as conexões — é config server-side do pooler, não regressão deste diff.
