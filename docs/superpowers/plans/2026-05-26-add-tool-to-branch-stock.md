# Adicionar tool ao estoque da filial — Implementation Plan

> Spec: `docs/superpowers/specs/2026-05-26-add-tool-to-branch-stock.md`. Execução inline, PR único.

**Goal:** Sheet lateral em `/branches/[id]/stock` com Combobox Base UI assíncrono pra cadastrar variant nova no estoque da filial.

**Architecture:** 5 arquivos (2 modify + 2 create + 1 page modify). Sheet usa `Combobox` Base UI controlled com `items` server-fetched (debounced).

**Tech Stack:** Next 16 + React 19 + Base UI `Combobox` + Server Actions + Drizzle.

---

## Task 1: Schema

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/_components/stock-adjustment-schema.ts`

- [ ] **Step 1:** Adicionar no fim do arquivo:

```typescript
export const addToolToBranchStockSchema = z.object({
	branchId: z.string().min(1, "Filial obrigatória"),
	variantId: z.string().min(1, "Variante obrigatória"),
	initialQty: z
		.int("Quantidade deve ser inteira")
		.min(0, "Quantidade não pode ser negativa")
		.max(999_999, "Quantidade excede o limite"),
	minQty: z.int().min(0).max(999_999),
	reorderPoint: z.int().min(0).max(999_999),
	reasonNote: z
		.string()
		.trim()
		.max(500, "Observação não pode exceder 500 caracteres")
		.optional(),
});

export type AddToolToBranchStockInput = z.infer<
	typeof addToolToBranchStockSchema
>;
```

- [ ] **Step 2:** `bun check-types` → 0 erros.

---

## Task 2: Server action + search query

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/actions.ts`

- [ ] **Step 1:** Verificar imports — precisamos de `tool`, `toolVariant`, `stockLevel`, `stockMovement`, `ilike`, `isNull`, `inArray`, `or`, `asc`, `and`, `eq`. Adicionar o que faltar.

- [ ] **Step 2:** Adicionar interface + função no fim do arquivo:

```typescript
export interface VariantNotInBranchRow {
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
	toolId: string;
	toolName: string;
}

export async function searchVariantsNotInBranch(
	branchId: string,
	query: string,
	limit = 20
): Promise<VariantNotInBranchRow[]> {
	await requireCapability("stock.read");

	const cleanQuery = query.trim();
	const conditions = [
		isNull(stockLevel.variantId),
		inArray(tool.status, ["active", "out_of_stock"]),
	];
	if (cleanQuery.length > 0) {
		const filter = or(
			ilike(tool.name, `%${cleanQuery}%`),
			ilike(toolVariant.sku, `%${cleanQuery}%`)
		);
		if (filter) {
			conditions.push(filter);
		}
	}

	return await db
		.select({
			variantId: toolVariant.id,
			variantSku: toolVariant.sku,
			variantVoltage: toolVariant.voltage,
			toolId: tool.id,
			toolName: tool.name,
		})
		.from(toolVariant)
		.innerJoin(tool, eq(tool.id, toolVariant.toolId))
		.leftJoin(
			stockLevel,
			and(
				eq(stockLevel.variantId, toolVariant.id),
				eq(stockLevel.branchId, branchId)
			)
		)
		.where(and(...conditions))
		.orderBy(asc(tool.name))
		.limit(limit);
}
```

- [ ] **Step 3:** Adicionar action `addToolToBranchStock`:

```typescript
export async function addToolToBranchStock(
	input: AddToolToBranchStockInput
): Promise<ActionResult<undefined>> {
	const session = await requireCapabilityWithContext("stock.adjust", {
		targetBranchIds: [input.branchId],
	});

	const parsed = addToolToBranchStockSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const { branchId, variantId, initialQty, minQty, reorderPoint, reasonNote } =
		parsed.data;

	try {
		await db.transaction(async (tx) => {
			await tx.insert(stockLevel).values({
				branchId,
				variantId,
				quantity: initialQty,
				minQty,
				reorderPoint,
				updatedAt: new Date(),
			});

			if (initialQty > 0) {
				await tx.insert(stockMovement).values({
					id: crypto.randomUUID(),
					branchId,
					variantId,
					previousQty: 0,
					newQty: initialQty,
					delta: initialQty,
					reason: "entrada_compra",
					reasonNote: reasonNote ?? null,
					actorType: "user",
					actorId: session.user.id,
				});
			}
		});
	} catch (error) {
		logger.error("addToolToBranchStock falhou", error);
		return {
			ok: false,
			error:
				"Não foi possível adicionar — verifique se já está cadastrada nesta filial",
		};
	}

	revalidatePath(`/dashboard/branches/${branchId}/stock`);
	revalidatePath("/dashboard", "layout");
	return { ok: true, data: undefined };
}
```

- [ ] **Step 4:** Importar `addToolToBranchStockSchema` + `AddToolToBranchStockInput` + `requireCapabilityWithContext` se faltar.

- [ ] **Step 5:** `bun check-types` → 0 erros.

---

## Task 3: Sheet

**Files:**
- Create: `apps/web/src/app/dashboard/stock/_components/add-tool-to-branch-sheet.tsx`

- [ ] **Step 1:** Criar arquivo com a estrutura:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@emach/ui/components/combobox";
import { Label } from "@emach/ui/components/label";
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
	addToolToBranchStock,
	searchVariantsNotInBranch,
	type VariantNotInBranchRow,
} from "../actions";

interface Props {
	branchId: string;
	branchName: string;
	onClose: () => void;
	open: boolean;
}

export function AddToolToBranchSheet({
	branchId,
	branchName,
	onClose,
	open,
}: Props) {
	const router = useRouter();
	const [search, setSearch] = useState("");
	const [results, setResults] = useState<VariantNotInBranchRow[]>([]);
	const [selected, setSelected] = useState<VariantNotInBranchRow | null>(null);
	const [initialQty, setInitialQty] = useState<number | undefined>(0);
	const [minQty, setMinQty] = useState<number | undefined>(0);
	const [reorderPoint, setReorderPoint] = useState<number | undefined>(0);
	const [reasonNote, setReasonNote] = useState("");
	const [submitting, startSubmit] = useTransition();
	const [, startSearch] = useTransition();

	useEffect(() => {
		if (!open) {
			setSearch("");
			setResults([]);
			setSelected(null);
			setInitialQty(0);
			setMinQty(0);
			setReorderPoint(0);
			setReasonNote("");
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const handle = setTimeout(() => {
			startSearch(async () => {
				const rows = await searchVariantsNotInBranch(branchId, search, 20);
				setResults(rows);
			});
		}, 200);
		return () => clearTimeout(handle);
	}, [branchId, search, open]);

	function handleSubmit() {
		if (!selected) return;
		startSubmit(async () => {
			const result = await addToolToBranchStock({
				branchId,
				variantId: selected.variantId,
				initialQty: initialQty ?? 0,
				minQty: minQty ?? 0,
				reorderPoint: reorderPoint ?? 0,
				reasonNote: reasonNote.trim() === "" ? undefined : reasonNote.trim(),
			});
			if (result.ok) {
				toast.success("Ferramenta adicionada ao estoque");
				router.refresh();
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	const initialQtyNum = initialQty ?? 0;

	return (
		<Sheet onOpenChange={(o) => !o && onClose()} open={open}>
			<SheetContent className="flex w-full flex-col gap-5 overflow-y-auto sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Adicionar ao estoque</SheetTitle>
					<p className="text-muted-foreground text-xs">Filial: {branchName}</p>
				</SheetHeader>

				{!selected ? (
					<div className="flex flex-col gap-2">
						<Label>Ferramenta</Label>
						<Combobox
							items={results}
							onInputValueChange={(value) => setSearch(value)}
							onValueChange={(value) => {
								if (value && typeof value === "object" && "variantId" in value) {
									setSelected(value as VariantNotInBranchRow);
								}
							}}
						>
							<ComboboxInput placeholder="Buscar por nome ou SKU…" />
							<ComboboxContent>
								<ComboboxList>
									<ComboboxEmpty>Nenhuma variante disponível.</ComboboxEmpty>
									{results.map((v) => (
										<ComboboxItem key={v.variantId} value={v}>
											<div className="flex flex-col">
												<span className="font-medium">{v.toolName}</span>
												<span className="text-muted-foreground text-xs">
													SKU {v.variantSku}
													{v.variantVoltage ? ` · ${v.variantVoltage}` : ""}
												</span>
											</div>
										</ComboboxItem>
									))}
								</ComboboxList>
							</ComboboxContent>
						</Combobox>
					</div>
				) : (
					<>
						<div className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
							<div className="flex flex-col">
								<span className="font-medium text-sm">{selected.toolName}</span>
								<span className="text-muted-foreground text-xs">
									SKU {selected.variantSku}
									{selected.variantVoltage
										? ` · ${selected.variantVoltage}`
										: ""}
								</span>
							</div>
							<Button
								onClick={() => setSelected(null)}
								size="sm"
								type="button"
								variant="ghost"
							>
								Trocar
							</Button>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="add-initial-qty">Quantidade inicial</Label>
							<MaskedInput
								disabled={submitting}
								id="add-initial-qty"
								mask={integerMask}
								onChange={setInitialQty}
								placeholder="0"
								value={initialQty}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label>Limites de alerta (opcional)</Label>
							<div className="grid grid-cols-2 gap-2">
								<div>
									<Label className="text-[10px]" htmlFor="add-min-qty">
										Mínimo
									</Label>
									<MaskedInput
										disabled={submitting}
										id="add-min-qty"
										mask={integerMask}
										onChange={setMinQty}
										value={minQty}
									/>
								</div>
								<div>
									<Label className="text-[10px]" htmlFor="add-reorder">
										Reposição
									</Label>
									<MaskedInput
										disabled={submitting}
										id="add-reorder"
										mask={integerMask}
										onChange={setReorderPoint}
										value={reorderPoint}
									/>
								</div>
							</div>
						</div>

						{initialQtyNum > 0 && (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="add-note">Nota (opcional)</Label>
								<Textarea
									disabled={submitting}
									id="add-note"
									onChange={(e) => setReasonNote(e.target.value)}
									placeholder="NF #1234, fornecedor X…"
									rows={2}
									value={reasonNote}
								/>
							</div>
						)}

						<Button
							className="self-start"
							disabled={submitting}
							onClick={handleSubmit}
							size="sm"
							type="button"
						>
							{submitting ? (
								<>
									<Spinner /> Adicionando…
								</>
							) : (
								"Adicionar"
							)}
						</Button>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
```

- [ ] **Step 2:** `bun check-types` → 0 erros.

---

## Task 4: Botão wrapper

**Files:**
- Create: `apps/web/src/app/dashboard/branches/[id]/stock/_components/add-tool-button.tsx`

- [ ] **Step 1:**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Plus } from "lucide-react";
import { useState } from "react";

import { AddToolToBranchSheet } from "@/app/dashboard/stock/_components/add-tool-to-branch-sheet";

interface Props {
	branchId: string;
	branchName: string;
}

export function AddToolButton({ branchId, branchName }: Props) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button onClick={() => setOpen(true)} size="sm">
				<Plus className="size-4" />
				Adicionar tool
			</Button>
			<AddToolToBranchSheet
				branchId={branchId}
				branchName={branchName}
				onClose={() => setOpen(false)}
				open={open}
			/>
		</>
	);
}
```

- [ ] **Step 2:** `bun check-types` → 0 erros.

---

## Task 5: Integrar no PageHeader

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/stock/page.tsx`

- [ ] **Step 1:** Adicionar import:

```typescript
import { AddToolButton } from "./_components/add-tool-button";
```

- [ ] **Step 2:** Conferir variável `canMutate` na page (provavelmente já existe). Se não, computar via `can(session, "stock.adjust")`.

- [ ] **Step 3:** Adicionar prop `action` no `<PageHeader>`:

```tsx
<PageHeader
	action={
		canMutate ? (
			<AddToolButton branchId={id} branchName={detail.name} />
		) : null
	}
	description="Ajuste quantidades e configure limites de alerta por ferramenta."
	title={`Estoque — ${detail.name}`}
/>
```

- [ ] **Step 4:** `bun check-types` → 0 erros.

---

## Task 6: Smoke + commit + PR

- [ ] **Step 1:** Smoke `/dashboard/branches/[id]/stock` logado como super_admin:
  - [ ] Botão "+ Adicionar tool" no header
  - [ ] Click abre sheet
  - [ ] Busca por nome → resultados
  - [ ] Busca por SKU → resultados
  - [ ] Variants já cadastradas não aparecem
  - [ ] Select variant → mostra summary + Trocar
  - [ ] Submit qty=0 → sucesso, sem stock_movement
  - [ ] Submit qty=10 → sucesso, stock_movement entrada_compra criado
  - [ ] Sheet fecha + lista revalida + tool aparece no grid

- [ ] **Step 2:** Smoke como user comum (sem `stock.adjust`):
  - [ ] Botão ausente.

- [ ] **Step 3:** Commit + push + PR:

```bash
git add apps/web/src/ docs/superpowers/
git commit -m "feat(branches): adicionar ferramenta ao estoque via sheet lateral"
git push -u origin feat/add-tool-to-branch-stock
gh pr create --title "feat(branches): adicionar tool ao estoque" --body-file <body>
```

---

## Riscos

1. **Combobox API Base UI:** se `onValueChange` retornar primitivo (não objeto), refatorar pra usar `valueAsString` + lookup. Verificar no dev.
2. **`requireCapabilityWithContext`** com targetBranchIds — confirmar que aceita filial única. (Já usado em outras actions.)
3. **Tool/SKU index pra `ilike`:** sem index pode ficar lento. Aceitar pra primeira versão; otimização futura.
