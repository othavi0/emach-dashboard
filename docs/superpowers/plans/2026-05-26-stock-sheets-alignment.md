# Alinhamento Stock Sheets — Implementation Plan

> **For agentic workers:** Spec em `docs/superpowers/specs/2026-05-26-stock-sheets-alignment.md`. Execução inline (sem subagent-driven — PR único, ~5 tasks coesas).

**Goal:** Alinhar `BranchStockEditSheet` ao pattern moderno do `StockCellSheet` (Slice 4) + bonus de hardening (Zod no StockCellSheet, cleanup 3 órfãos).

**Architecture:** PR único, 1 schema novo, 2 sheets refactorados, 3 arquivos deletados. Schema Zod separado UI (estrito 4 motivos, reason obrigatório) vs server (compat 5 motivos, opcional).

**Tech Stack:** Next 16 RSC + React 19 + Base UI + Zod + Drizzle.

---

## Task 1: Schema UI

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/_components/stock-adjustment-schema.ts`

- [ ] **Step 1:** Adicionar constante e schema UI no fim do arquivo:

```typescript
export const STOCK_MOVEMENT_REASONS_UI = [
	"entrada_compra",
	"ajuste_inventario",
	"perda",
	"outro",
] as const;

export type StockMovementReasonUi = (typeof STOCK_MOVEMENT_REASONS_UI)[number];

export const stockAdjustmentUiSchema = z
	.object({
		variantId: z.string().min(1, "Variante obrigatória"),
		branchId: z.string().min(1, "Filial obrigatória"),
		newQty: z
			.int("Quantidade deve ser inteira")
			.min(0, "Quantidade não pode ser negativa")
			.max(999_999, "Quantidade excede o limite permitido"),
		reason: z.enum(STOCK_MOVEMENT_REASONS_UI),
		reasonNote: z
			.string()
			.trim()
			.max(500, "Observação não pode exceder 500 caracteres")
			.optional(),
	})
	.refine(
		(data) =>
			data.reason !== "outro" ||
			(typeof data.reasonNote === "string" && data.reasonNote.length > 0),
		{
			path: ["reasonNote"],
			message: "Observação obrigatória quando motivo é 'Outro'",
		}
	);

export type StockAdjustmentUiInput = z.infer<typeof stockAdjustmentUiSchema>;
```

- [ ] **Step 2:** `bun check-types` → 0 erros.

---

## Task 2: Refactor BranchStockEditSheet

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx`

- [ ] **Step 1:** Trocar imports — remover `Select*`, `BranchStockThresholdInputs`. Adicionar `Separator`, `Textarea` (já tem), `updateStockThresholds`.

```typescript
import { Button } from "@emach/ui/components/button";
import { Label } from "@emach/ui/components/label";
import { Separator } from "@emach/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";

import {
	adjustStock,
	getStockMovementsByVariantBranch,
	type StockMovementRow,
	updateStockThresholds,
} from "../actions";
import type { BranchStockRow } from "../branch-stock-data";
import {
	type StockAdjustmentUiInput,
	STOCK_MOVEMENT_REASONS_UI,
	type StockMovementReasonUi,
	stockAdjustmentUiSchema,
} from "./stock-adjustment-schema";
```

- [ ] **Step 2:** Substituir `REASON_OPTIONS` e `REASON_LABELS` por:

```typescript
const REASON_LABEL_UI: Record<StockMovementReasonUi, string> = {
	entrada_compra: "Entrada compra",
	ajuste_inventario: "Ajuste inventário",
	perda: "Perda",
	outro: "Outro",
};

const REASON_LABEL_FULL: Record<string, string> = {
	entrada_compra: "Entrada compra",
	saida_venda: "Saída venda",
	ajuste_inventario: "Ajuste inventário",
	perda: "Perda",
	outro: "Outro",
};
```

- [ ] **Step 3:** Substituir `STATUS_CLASS` (cores hard-coded → tokens):

```typescript
const STATUS_CLASS: Record<StockStatus, string> = {
	critical: "bg-destructive/15 text-destructive",
	reorder: "bg-warning/15 text-warning",
	ok: "bg-success/15 text-success",
	none: "bg-muted text-muted-foreground",
};
```

- [ ] **Step 4:** Refatorar `useState` — `reason` agora é `StockMovementReasonUi`, default `entrada_compra`. Adicionar state pros limites:

```typescript
const [newQty, setNewQty] = useState<number | undefined>(undefined);
const [reason, setReason] = useState<StockMovementReasonUi>("entrada_compra");
const [reasonNote, setReasonNote] = useState("");
const [errors, setErrors] = useState<
	Partial<Record<keyof StockAdjustmentUiInput, string>>
>({});
const [isAdjusting, startAdjustTransition] = useTransition();

const [minQty, setMinQty] = useState<number | undefined>(undefined);
const [reorderPoint, setReorderPoint] = useState<number | undefined>(undefined);
const [isUpdatingLimits, startLimitsTransition] = useTransition();
```

- [ ] **Step 5:** Atualizar `useEffect` pra resetar todos os states (inclusive `minQty`, `reorderPoint`):

```typescript
useEffect(() => {
	if (!row) {
		setMovements([]);
		return;
	}
	setNewQty(row.quantity);
	setReason("entrada_compra");
	setReasonNote("");
	setMinQty(row.minQty);
	setReorderPoint(row.reorderPoint);
	setErrors({});

	startMovementsTransition(async () => {
		const data = await getStockMovementsByVariantBranch(
			row.variantId,
			branchId
		);
		setMovements(data);
	});
	// eslint-disable-next-line react-hooks/exhaustive-deps
}, [row?.variantId, branchId]);
```

- [ ] **Step 6:** Atualizar `handleAdjustSubmit` pra usar `stockAdjustmentUiSchema`:

```typescript
function handleAdjustSubmit(e: React.FormEvent<HTMLFormElement>) {
	e.preventDefault();
	setErrors({});

	const input: StockAdjustmentUiInput = {
		variantId: row!.variantId,
		branchId,
		newQty: newQty ?? Number.NaN,
		reason,
		reasonNote: reasonNote.trim() === "" ? undefined : reasonNote.trim(),
	};

	const parsed = stockAdjustmentUiSchema.safeParse(input);
	if (!parsed.success) {
		setErrors(zodErrorsToMap(parsed.error));
		return;
	}

	startAdjustTransition(async () => {
		const result = await adjustStock(parsed.data);
		if (result.ok) {
			toast.success("Estoque atualizado");
			router.refresh();
			onClose();
		} else {
			toast.error(result.error || "Não foi possível ajustar o estoque");
		}
	});
}
```

Ajustar `zodErrorsToMap` pra trabalhar com `StockAdjustmentUiInput`.

- [ ] **Step 7:** Adicionar handler `handleLimitsSubmit`:

```typescript
function handleLimitsSubmit() {
	if (minQty === undefined || reorderPoint === undefined) return;
	startLimitsTransition(async () => {
		const result = await updateStockThresholds({
			variantId: row!.variantId,
			branchId,
			minQty,
			reorderPoint,
		});
		if (result.ok) {
			toast.success("Limites atualizados");
			router.refresh();
		} else {
			toast.error(result.error || "Não foi possível atualizar os limites");
		}
	});
}
```

- [ ] **Step 8:** Substituir o bloco "Ajustar quantidade" (linhas ~327-406) pelo novo formulário com 4 botões toggle:

```tsx
{canMutate && (
	<div className="border-border border-b px-6 py-5">
		<p className="mb-3 font-medium text-sm">Ajustar quantidade</p>
		<form className="flex flex-col gap-3" onSubmit={handleAdjustSubmit}>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="sheet-new-qty">
					Nova quantidade
					<span className="text-destructive"> *</span>
				</Label>
				<MaskedInput
					disabled={isAdjusting}
					id="sheet-new-qty"
					mask={integerMask}
					onChange={setNewQty}
					placeholder={`Atual: ${row.quantity}`}
					value={newQty}
				/>
				{errors.newQty && (
					<p className="text-destructive text-xs">{errors.newQty}</p>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Motivo</Label>
				<div className="grid grid-cols-2 gap-2">
					{STOCK_MOVEMENT_REASONS_UI.map((r) => (
						<Button
							disabled={isAdjusting}
							key={r}
							onClick={() => setReason(r)}
							size="sm"
							type="button"
							variant={reason === r ? "default" : "outline"}
						>
							{REASON_LABEL_UI[r]}
						</Button>
					))}
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="sheet-reason-note">
					Observação{reason === "outro" && <span className="text-destructive"> *</span>}
				</Label>
				<Textarea
					disabled={isAdjusting}
					id="sheet-reason-note"
					onChange={(e) => setReasonNote(e.target.value)}
					placeholder="NF #1234, fornecedor X…"
					rows={2}
					value={reasonNote}
				/>
				{errors.reasonNote && (
					<p className="text-destructive text-xs">{errors.reasonNote}</p>
				)}
			</div>

			<Button
				className="self-start"
				disabled={isAdjusting}
				size="sm"
				type="submit"
			>
				{isAdjusting ? (
					<>
						<Spinner /> Salvando…
					</>
				) : (
					"Salvar ajuste"
				)}
			</Button>
		</form>
	</div>
)}
```

- [ ] **Step 9:** Substituir o bloco "Limites de alerta" (linhas ~408-425) pelo formulário inline:

```tsx
{canMutate && (
	<div className="border-border border-b px-6 py-5">
		<p className="mb-3 font-medium text-sm">Limites de alerta</p>
		<div className="grid grid-cols-2 gap-3">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="sheet-min-qty">Mínimo</Label>
				<MaskedInput
					disabled={isUpdatingLimits}
					id="sheet-min-qty"
					mask={integerMask}
					onChange={setMinQty}
					value={minQty}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="sheet-reorder-point">Reposição</Label>
				<MaskedInput
					disabled={isUpdatingLimits}
					id="sheet-reorder-point"
					mask={integerMask}
					onChange={setReorderPoint}
					value={reorderPoint}
				/>
			</div>
		</div>
		<Button
			className="mt-3"
			disabled={
				isUpdatingLimits ||
				(minQty === row.minQty && reorderPoint === row.reorderPoint)
			}
			onClick={handleLimitsSubmit}
			size="sm"
			type="button"
			variant="outline"
		>
			{isUpdatingLimits ? (
				<>
					<Spinner /> Salvando…
				</>
			) : (
				"Salvar limites"
			)}
		</Button>
	</div>
)}
```

Bloco read-only (quando `!canMutate`) some — limites já aparecem no header "Estoque atual" do sheet.

- [ ] **Step 10:** Atualizar histórico — usar `REASON_LABEL_FULL` (para `saida_venda` ainda aparecer em movimentos antigos):

Trocar `REASON_LABELS[m.reason]` por `REASON_LABEL_FULL[m.reason]`. Cores via tokens:
- `bg-green-950/60 text-green-400` → `bg-success/15 text-success`
- `bg-red-950/60 text-destructive` → `bg-destructive/15 text-destructive`

- [ ] **Step 11:** `bun check-types` → 0 erros.

---

## Task 3: Update StockCellSheet (Zod + histórico rico)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/stock-cell-sheet.tsx`

- [ ] **Step 1:** Imports — adicionar Zod schema + Textarea + tipos:

```typescript
import { Textarea } from "@emach/ui/components/textarea";
// ...
import {
	type StockAdjustmentUiInput,
	STOCK_MOVEMENT_REASONS_UI,
	type StockMovementReasonUi,
	stockAdjustmentUiSchema,
} from "@/app/dashboard/stock/_components/stock-adjustment-schema";
```

- [ ] **Step 2:** Remover tipo local `type Reason = ...` (substituído por `StockMovementReasonUi`).

- [ ] **Step 3:** Adicionar constante `REASON_LABEL_FULL`:

```typescript
const REASON_LABEL_FULL: Record<string, string> = {
	entrada_compra: "Entrada compra",
	saida_venda: "Saída venda",
	ajuste_inventario: "Ajuste inventário",
	perda: "Perda",
	outro: "Outro",
};
```

- [ ] **Step 4:** Atualizar tipo `Movement` pra incluir actor + id:

```typescript
interface Movement {
	actorName: string | null;
	createdAt: Date;
	delta: number;
	id: string;
	reason: string | null;
	reasonNote: string | null;
}
```

E mapping no `useEffect`:

```typescript
setMovements(
	rows.map((m) => ({
		actorName: m.actorName,
		createdAt: new Date(m.createdAt),
		delta: m.delta,
		id: m.id,
		reason: m.reason,
		reasonNote: m.reasonNote,
	}))
);
```

- [ ] **Step 5:** Adicionar helper `formatRelative` (copiar do BranchStockEditSheet):

```typescript
const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

function formatRelative(date: Date): string {
	const diffMs = date.getTime() - Date.now();
	const absDays = Math.abs(diffMs) / 86_400_000;
	if (absDays < 1) {
		const absHours = Math.abs(diffMs) / 3_600_000;
		if (absHours < 1) {
			return RELATIVE.format(Math.round(diffMs / 60_000), "minute");
		}
		return RELATIVE.format(Math.round(diffMs / 3_600_000), "hour");
	}
	const diffDays = Math.round(diffMs / 86_400_000);
	if (absDays < 30) {
		return RELATIVE.format(diffDays, "day");
	}
	return RELATIVE.format(Math.round(diffDays / 30), "month");
}
```

- [ ] **Step 6:** Atualizar `reason` state pra usar tipo importado, default `entrada_compra` permanece:

```typescript
const [reason, setReason] = useState<StockMovementReasonUi>("entrada_compra");
```

- [ ] **Step 7:** Atualizar `handleAdjust` pra usar `stockAdjustmentUiSchema`:

```typescript
const [errors, setErrors] = useState<
	Partial<Record<keyof StockAdjustmentUiInput, string>>
>({});

function handleAdjust() {
	setErrors({});

	const input: StockAdjustmentUiInput = {
		variantId,
		branchId,
		newQty: Number(newQty),
		reason,
		reasonNote: reasonNote.trim() === "" ? undefined : reasonNote.trim(),
	};

	const parsed = stockAdjustmentUiSchema.safeParse(input);
	if (!parsed.success) {
		setErrors(zodErrorsToMap(parsed.error));
		return;
	}

	startAdjust(async () => {
		const result = await adjustStock(parsed.data);
		if (result.ok) {
			toast.success("Estoque ajustado");
			onClose();
		} else {
			toast.error(result.error);
		}
	});
}
```

Adicionar helper `zodErrorsToMap` no topo do arquivo (copiar do BranchStockEditSheet, adaptar pra `StockAdjustmentUiInput`).

- [ ] **Step 8:** Renderizar erros inline abaixo dos inputs `newQty` e `reasonNote`:

```tsx
{errors.newQty && (
	<p className="text-destructive text-xs">{errors.newQty}</p>
)}
```

- [ ] **Step 9:** Substituir `Input` da nota por `Textarea rows={2}`:

```tsx
<Textarea
	onChange={(e) => setReasonNote(e.target.value)}
	placeholder="NF #1234, fornecedor X…"
	rows={2}
	value={reasonNote}
/>
{errors.reasonNote && (
	<p className="text-destructive text-xs">{errors.reasonNote}</p>
)}
```

- [ ] **Step 10:** Substituir mapping dos motivos por iteração sobre `STOCK_MOVEMENT_REASONS_UI`:

```tsx
{STOCK_MOVEMENT_REASONS_UI.map((r) => (
	<Button
		key={r}
		onClick={() => setReason(r)}
		size="sm"
		variant={reason === r ? "default" : "outline"}
	>
		{REASON_LABEL_UI[r]}
	</Button>
))}
```

Onde `REASON_LABEL_UI` é o mesmo objeto do BranchStockEditSheet:

```typescript
const REASON_LABEL_UI: Record<StockMovementReasonUi, string> = {
	entrada_compra: "Entrada compra",
	ajuste_inventario: "Ajuste inventário",
	perda: "Perda",
	outro: "Outro",
};
```

- [ ] **Step 11:** Substituir bloco "Últimos movimentos" (linhas ~275-311) pelo histórico rico:

```tsx
<div>
	<Label className="text-xs uppercase">Últimos movimentos</Label>
	{movements.length === 0 ? (
		<p className="mt-2 text-muted-foreground text-xs">
			Sem movimentos recentes.
		</p>
	) : (
		<ul className="mt-2 flex flex-col gap-2.5">
			{movements.map((m) => (
				<li className="flex items-start gap-3 text-xs" key={m.id}>
					<span
						className={`flex-shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums ${
							m.delta >= 0
								? "bg-success/15 text-success"
								: "bg-destructive/15 text-destructive"
						}`}
					>
						{m.delta >= 0 ? "+" : ""}
						{m.delta}
					</span>
					<div className="min-w-0 flex-1">
						<p>
							{m.reason
								? (REASON_LABEL_FULL[m.reason] ?? m.reason)
								: "Sem motivo"}
							{m.reasonNote ? (
								<span className="ml-1 text-muted-foreground">
									— {m.reasonNote}
								</span>
							) : null}
						</p>
						<p className="text-muted-foreground">
							{m.actorName ?? "Sistema"} · {formatRelative(m.createdAt)}
						</p>
					</div>
				</li>
			))}
		</ul>
	)}
</div>
```

- [ ] **Step 12:** `bun check-types` → 0 erros.

---

## Task 4: Cleanup órfãos

**Files:**
- Delete: `apps/web/src/app/dashboard/stock/_components/branch-stock-threshold-inputs.tsx`
- Delete: `apps/web/src/app/dashboard/stock/_components/adjust-stock-dialog.tsx`
- Delete: `apps/web/src/app/dashboard/stock/_components/stock-adjust-button.tsx`

- [ ] **Step 1:** Verificar zero consumidores:

```bash
rg "BranchStockThresholdInputs|AdjustStockDialog|StockAdjustButton" apps/web/src
```

Expected: zero matches (após Tasks 2-3 removerem o último import).

- [ ] **Step 2:** Deletar os 3 arquivos.

- [ ] **Step 3:** `bun check-types` → 0 erros.

---

## Task 5: Smoke + commit

- [ ] **Step 1:** Smoke `/dashboard/branches/[id]/stock`:
  - Abrir sheet → 4 botões grid 2×2
  - Default "Entrada compra" selecionado
  - Nota é Textarea (multi-linha)
  - Cores status seguem tokens
  - Limites inline com botão "Salvar limites"
  - Salvar ajuste com motivo="outro" sem nota → erro inline
  - Salvar ajuste válido → toast + sheet fecha + revalida

- [ ] **Step 2:** Smoke `/dashboard/tools/[id]?tab=estoque`:
  - Abrir sheet → mesmo pattern
  - Nota é Textarea rows={2}
  - Histórico mostra actor name + "há 2h"
  - Validação Zod ativa (qty vazia → erro inline)

- [ ] **Step 3:** Commit:

```bash
git add apps/web/src/app/dashboard/
git commit -m "refactor(stock): alinha BranchStockEditSheet ao pattern do StockCellSheet"
git push -u origin feat/stock-sheets-alignment
```

- [ ] **Step 4:** Abrir PR:

```bash
gh pr create --title "refactor(stock): alinhamento BranchStockEditSheet × StockCellSheet" \
  --body-file <descrição com decisões + smoke checklist>
```

---

## Riscos & mitigações

1. **`zodErrorsToMap` helper duplicado:** copiar entre sheets é OK pra esse escopo. Extrair pra `src/lib/zod-helpers.ts` se vier um terceiro consumidor.
2. **Bloco read-only de limites some no BranchStockEditSheet:** quando `!canMutate`, valores já aparecem no header "Estoque atual". Não regressão.
3. **`router.refresh()` no StockCellSheet:** atualmente não chama. Adicionar? `adjustStock` já faz `revalidatePath` server-side — RSC re-renderiza automaticamente. Manter sem `router.refresh()`.
