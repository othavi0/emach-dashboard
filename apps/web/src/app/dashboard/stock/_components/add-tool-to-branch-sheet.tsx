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
		if (!open) {
			return;
		}
		const handle = setTimeout(() => {
			startSearch(async () => {
				const rows = await searchVariantsNotInBranch(branchId, search, 20);
				setResults(rows);
			});
		}, 200);
		return () => clearTimeout(handle);
	}, [branchId, search, open]);

	function handleSubmit() {
		if (!selected) {
			return;
		}
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

				{selected ? (
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
								<div className="flex flex-col gap-1">
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
								<div className="flex flex-col gap-1">
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
				) : (
					<div className="flex flex-col gap-2">
						<Label>Ferramenta</Label>
						<Combobox
							items={results}
							onInputValueChange={(value) => setSearch(value)}
							onValueChange={(value) => {
								if (
									value &&
									typeof value === "object" &&
									"variantId" in value
								) {
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
				)}
			</SheetContent>
		</Sheet>
	);
}
