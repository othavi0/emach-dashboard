"use client";

import { Button } from "@emach/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@emach/ui/components/dialog";
import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ZodError } from "zod";

import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";

import { adjustStock } from "../actions";
import {
	type StockAdjustmentInput,
	stockAdjustmentSchema,
} from "./stock-adjustment-schema";

interface AdjustStockDialogProps {
	branchId: string;
	branchName: string;
	currentQty: number;
	variantId: string;
}

const REASON_OPTIONS = [
	{ label: "Sem motivo", value: "__none__" },
	{ label: "Entrada de compra", value: "entrada_compra" },
	{ label: "Saída de venda", value: "saida_venda" },
	{ label: "Ajuste de inventário", value: "ajuste_inventario" },
	{ label: "Perda", value: "perda" },
	{ label: "Outro", value: "outro" },
] as const;

function zodErrorsToFieldMap(
	error: ZodError<StockAdjustmentInput>
): Partial<Record<keyof StockAdjustmentInput, string>> {
	const map: Partial<Record<keyof StockAdjustmentInput, string>> = {};
	for (const issue of error.issues) {
		const key = issue.path[0] as keyof StockAdjustmentInput | undefined;
		if (key && !map[key]) {
			map[key] = issue.message;
		}
	}
	return map;
}

export function AdjustStockDialog({
	branchId,
	branchName,
	currentQty,
	variantId,
}: AdjustStockDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [newQty, setNewQty] = useState<number | undefined>(currentQty);
	const [reason, setReason] = useState<string>("__none__");
	const [reasonNote, setReasonNote] = useState("");
	const [errors, setErrors] = useState<
		Partial<Record<keyof StockAdjustmentInput, string>>
	>({});

	function resetForm() {
		setNewQty(currentQty);
		setReason("__none__");
		setReasonNote("");
		setErrors({});
	}

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			resetForm();
		}
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});

		const parsedQty = newQty ?? Number.NaN;
		const resolvedReason =
			reason === "__none__"
				? undefined
				: (reason as StockAdjustmentInput["reason"]);
		const resolvedNote =
			reasonNote.trim() === "" ? undefined : reasonNote.trim();

		const input: StockAdjustmentInput = {
			variantId,
			branchId,
			newQty: parsedQty,
			reason: resolvedReason,
			reasonNote: resolvedNote,
		};

		const parsed = stockAdjustmentSchema.safeParse(input);
		if (!parsed.success) {
			setErrors(zodErrorsToFieldMap(parsed.error));
			return;
		}

		startTransition(async () => {
			const result = await adjustStock(parsed.data);
			if (result.ok) {
				toast.success("Estoque atualizado");
				handleOpenChange(false);
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível ajustar o estoque");
			}
		});
	}

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogTrigger render={<Button size="sm" variant="outline" />}>
				Ajustar
			</DialogTrigger>
			<DialogContent>
				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Ajustar estoque — {branchName}</DialogTitle>
						<DialogDescription>
							Quantidade atual:{" "}
							<span className="font-medium font-mono text-foreground">
								{currentQty}
							</span>
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-2">
						<Label htmlFor="adjust-new-qty">
							Nova quantidade
							<span className="text-destructive"> *</span>
						</Label>
						<MaskedInput
							disabled={isPending}
							id="adjust-new-qty"
							mask={integerMask}
							onChange={setNewQty}
							placeholder="Ex: 10"
							value={newQty}
						/>
						{errors.newQty && (
							<p className="text-destructive text-sm">{errors.newQty}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="adjust-reason">Motivo</Label>
						<Select
							disabled={isPending}
							onValueChange={(value) => setReason(value ?? "__none__")}
							value={reason}
						>
							<SelectTrigger id="adjust-reason">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{REASON_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>

					{reason === "outro" && (
						<div className="flex flex-col gap-2">
							<Label htmlFor="adjust-reason-note">Observação</Label>
							<Textarea
								disabled={isPending}
								id="adjust-reason-note"
								onChange={(event) => setReasonNote(event.target.value)}
								placeholder="Descreva o motivo do ajuste"
								rows={3}
								value={reasonNote}
							/>
							{errors.reasonNote && (
								<p className="text-destructive text-sm">{errors.reasonNote}</p>
							)}
						</div>
					)}

					<DialogFooter>
						<Button
							disabled={isPending}
							onClick={() => handleOpenChange(false)}
							type="button"
							variant="ghost"
						>
							Cancelar
						</Button>
						<Button disabled={isPending} type="submit">
							{isPending ? (
								<>
									<Spinner /> Salvando…
								</>
							) : (
								"Salvar ajuste"
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
