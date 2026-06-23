"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Trash2 } from "lucide-react";

import { CepRangesEditor } from "@/app/dashboard/branches/_components/cep-ranges-editor";
import { FieldError } from "@/components/field-error";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { MoneyInput } from "@/components/money-input";
import { integerMask } from "@/lib/masks";
import type { ZoneDraft } from "./carrier-schema";
import { RateRowsEditor } from "./rate-rows-editor";

interface Props {
	disabled?: boolean;
	error?: string;
	index: number;
	onChange: (next: ZoneDraft) => void;
	onRemove?: () => void;
	value: ZoneDraft;
}

export function ZoneFieldset({
	value,
	onChange,
	onRemove,
	disabled,
	index,
	error,
}: Props) {
	const patch = (next: Partial<ZoneDraft>) => onChange({ ...value, ...next });

	return (
		<fieldset className="relative flex flex-col gap-4 rounded-md border border-border bg-card p-4">
			<legend className="px-1 font-semibold text-sm">Zona {index + 1}</legend>
			{onRemove ? (
				<Button
					className="absolute top-2 right-2"
					disabled={disabled}
					onClick={onRemove}
					size="icon"
					type="button"
					variant="ghost"
				>
					<Trash2 aria-hidden className="size-4" />
				</Button>
			) : null}

			<LabeledField id={`zone-${index}-name`} label="Nome da zona" required>
				{(field) => (
					<Input
						{...field}
						disabled={disabled}
						onChange={(e) => patch({ name: e.target.value })}
						placeholder="Ex: Sul"
						value={value.name}
					/>
				)}
			</LabeledField>

			<div className="flex flex-col gap-1">
				<span className="font-medium text-sm">Faixas de CEP</span>
				<CepRangesEditor
					disabled={disabled}
					onChange={(cepRanges) => patch({ cepRanges })}
					value={value.cepRanges}
				/>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<LabeledField id={`zone-${index}-days`} label="Prazo (dias úteis)">
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={integerMask}
							onChange={(v) => patch({ deliveryDays: v ?? null })}
							placeholder="5"
							value={value.deliveryDays ?? undefined}
						/>
					)}
				</LabeledField>
				<LabeledField id={`zone-${index}-min`} label="Frete mínimo (R$)">
					{(field) => (
						<MoneyInput
							aria-invalid={field["aria-invalid"]}
							disabled={disabled}
							id={field.id}
							onChange={(v) => patch({ minFreightAmount: v })}
							value={value.minFreightAmount ?? null}
						/>
					)}
				</LabeledField>
			</div>

			<div className="flex flex-col gap-1">
				<span className="font-medium text-sm">Tabela de peso</span>
				<RateRowsEditor
					disabled={disabled}
					onChange={(rates) => patch({ rates })}
					value={value.rates}
				/>
			</div>

			{error ? <FieldError>{error}</FieldError> : null}
		</fieldset>
	);
}
