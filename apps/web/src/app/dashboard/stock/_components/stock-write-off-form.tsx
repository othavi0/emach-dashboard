"use client";

import { Button } from "@emach/ui/components/button";
import { Label } from "@emach/ui/components/label";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useState, useTransition } from "react";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";

import { recordStockWriteOff } from "../actions";
import {
	type StockWriteOffInput,
	type StockWriteOffReason,
	stockWriteOffSchema,
} from "./stock-movement-schema";

// Redefinido localmente — stock-movement-schema.ts é out-of-scope neste refactor.
// Se outros componentes precisarem desta constante, mover para stock-movement-schema.ts.
const WRITE_OFF_REASON_LABEL: Record<StockWriteOffReason, string> = {
	perda: "Perda",
	outro: "Outro",
};

interface StockWriteOffFormProps {
	branchId: string;
	isDisabled: boolean;
	onSuccess: () => void;
	variantId: string;
}

export function StockWriteOffForm({
	branchId,
	isDisabled,
	onSuccess,
	variantId,
}: StockWriteOffFormProps) {
	const [qty, setQty] = useState<number | undefined>(undefined);
	const [writeOffReason, setWriteOffReason] =
		useState<StockWriteOffReason>("perda");
	const [note, setNote] = useState("");

	const { errors, reportValidationError, clearErrors } =
		useFormErrors<StockWriteOffInput>();

	const [isPending, start] = useTransition();

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		clearErrors();

		const input: StockWriteOffInput = {
			variantId,
			branchId,
			quantity: qty ?? Number.NaN,
			reason: writeOffReason,
			note: note.trim() === "" ? undefined : note.trim(),
		};

		const parsed = stockWriteOffSchema.safeParse(input);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}

		start(async () => {
			const result = await recordStockWriteOff(parsed.data);
			if (result.ok) {
				notify.success("Baixa registrada");
				onSuccess();
			} else {
				notify.error(result.error || "Não foi possível registrar a baixa");
			}
		});
	}

	const disabled = isPending || isDisabled;

	return (
		<form className="flex flex-col gap-3" onSubmit={handleSubmit}>
			<LabeledField
				error={errors.quantity}
				id="sheet-baixa-qty"
				label="Quantidade a remover"
				required
			>
				{(field) => (
					<MaskedInput
						{...field}
						disabled={disabled}
						mask={integerMask}
						onChange={setQty}
						placeholder="0"
						value={qty}
					/>
				)}
			</LabeledField>

			<div className="flex flex-col gap-1.5">
				<Label>Motivo</Label>
				<div className="flex gap-2">
					{(["perda", "outro"] as StockWriteOffReason[]).map((r) => (
						<Button
							disabled={disabled}
							key={r}
							onClick={() => setWriteOffReason(r)}
							size="sm"
							type="button"
							variant={writeOffReason === r ? "default" : "outline"}
						>
							{WRITE_OFF_REASON_LABEL[r]}
						</Button>
					))}
				</div>
			</div>

			<LabeledField
				error={errors.note}
				id="sheet-baixa-note"
				label="Observação"
				required={writeOffReason === "outro"}
			>
				{(field) => (
					<Textarea
						{...field}
						disabled={disabled}
						onChange={(e) => setNote(e.target.value)}
						placeholder={
							writeOffReason === "outro"
								? "Descreva o motivo da baixa…"
								: "Opcional"
						}
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
					"Registrar baixa"
				)}
			</Button>
		</form>
	);
}
