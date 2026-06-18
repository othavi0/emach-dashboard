"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useState, useTransition } from "react";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";
import { notify } from "@/lib/notify";
import type { ActiveSupplierOption } from "@/lib/suppliers";
import { useFormErrors } from "@/lib/use-form-errors";

import { recordStockEntry } from "../actions";
import {
	type StockEntryInput,
	stockEntrySchema,
} from "./stock-movement-schema";
import { SupplierCombobox } from "./supplier-combobox";

interface StockEntryFormProps {
	branchId: string;
	isDisabled: boolean;
	onSuccess: () => void;
	suppliers: ActiveSupplierOption[];
	variantId: string;
}

export function StockEntryForm({
	branchId,
	isDisabled,
	onSuccess,
	suppliers,
	variantId,
}: StockEntryFormProps) {
	const [qty, setQty] = useState<number | undefined>(undefined);
	const [supplierId, setSupplierId] = useState<string>("");
	const [note, setNote] = useState("");

	const { errors, reportValidationError, clearErrors } =
		useFormErrors<StockEntryInput>();

	const [isPending, start] = useTransition();

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		clearErrors();

		const input: StockEntryInput = {
			variantId,
			branchId,
			quantity: qty ?? Number.NaN,
			supplierId,
			note: note.trim() === "" ? undefined : note.trim(),
		};

		const parsed = stockEntrySchema.safeParse(input);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}

		start(async () => {
			const result = await recordStockEntry(parsed.data);
			if (result.ok) {
				notify.success("Entrada registrada");
				onSuccess();
			} else {
				notify.error(result.error || "Não foi possível registrar a entrada");
			}
		});
	}

	const disabled = isPending || isDisabled;

	return (
		<form className="flex flex-col gap-3" onSubmit={handleSubmit}>
			<LabeledField
				error={errors.quantity}
				id="sheet-entrada-qty"
				label="Quantidade a adicionar"
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

			<LabeledField
				error={errors.supplierId}
				id="sheet-entrada-supplier"
				label="Fornecedor"
				required
			>
				{(field) => (
					<SupplierCombobox
						ariaInvalid={field["aria-invalid"]}
						disabled={disabled}
						id={field.id}
						onChange={setSupplierId}
						suppliers={suppliers}
						value={supplierId}
					/>
				)}
			</LabeledField>

			<LabeledField
				error={errors.note}
				id="sheet-entrada-note"
				label="Observação"
			>
				{(field) => (
					<Textarea
						{...field}
						disabled={disabled}
						onChange={(e) => setNote(e.target.value)}
						placeholder="NF #1234, lote X…"
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
					"Registrar entrada"
				)}
			</Button>
		</form>
	);
}
