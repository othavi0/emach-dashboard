"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useState, useTransition } from "react";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";

import { adjustStock } from "../actions";
import {
	type StockRecountInput,
	stockRecountSchema,
} from "./stock-movement-schema";

interface StockRecountFormProps {
	branchId: string;
	currentQty: number;
	isDisabled: boolean;
	onSuccess: () => void;
	variantId: string;
}

export function StockRecountForm({
	branchId,
	currentQty,
	isDisabled,
	onSuccess,
	variantId,
}: StockRecountFormProps) {
	const [targetQty, setTargetQty] = useState<number | undefined>(undefined);
	const [note, setNote] = useState("");

	const { errors, reportValidationError, clearErrors } =
		useFormErrors<StockRecountInput>();

	const [isPending, start] = useTransition();

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		clearErrors();

		const input: StockRecountInput = {
			variantId,
			branchId,
			newQty: targetQty ?? Number.NaN,
			note: note.trim() === "" ? undefined : note.trim(),
		};

		const parsed = stockRecountSchema.safeParse(input);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}

		start(async () => {
			const result = await adjustStock(parsed.data);
			if (result.ok) {
				notify.success("Estoque ajustado");
				onSuccess();
			} else {
				notify.error(result.error || "Não foi possível ajustar o estoque");
			}
		});
	}

	const disabled = isPending || isDisabled;

	return (
		<form className="flex flex-col gap-3" onSubmit={handleSubmit}>
			<LabeledField
				error={errors.newQty}
				id="sheet-ajuste-qty"
				label="Quantidade contada"
				required
			>
				{(field) => (
					<MaskedInput
						{...field}
						disabled={disabled}
						mask={integerMask}
						onChange={setTargetQty}
						placeholder={`Atual: ${currentQty}`}
						value={targetQty}
					/>
				)}
			</LabeledField>

			<LabeledField
				error={errors.note}
				id="sheet-ajuste-note"
				label="Observação"
			>
				{(field) => (
					<Textarea
						{...field}
						disabled={disabled}
						onChange={(e) => setNote(e.target.value)}
						placeholder="Recontagem física, data…"
						rows={2}
						value={note}
					/>
				)}
			</LabeledField>

			<Button
				className="self-start"
				disabled={disabled}
				size="sm"
				type="submit"
			>
				{isPending ? (
					<>
						<Spinner /> Salvando…
					</>
				) : (
					"Salvar ajuste"
				)}
			</Button>
		</form>
	);
}
