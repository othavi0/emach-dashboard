"use client";

import { Input } from "@emach/ui/components/input";
import { Switch } from "@emach/ui/components/switch";

import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { decimalMask } from "@/lib/masks";

import type { BoxFormValues } from "./box-schema";

type Patch = (next: Partial<BoxFormValues>) => void;

interface Props {
	disabled?: boolean;
	errors?: Partial<Record<keyof BoxFormValues, string>>;
	onPatch: Patch;
	values: BoxFormValues;
}

export function BoxFormFields({
	values,
	onPatch,
	disabled,
	errors = {},
}: Props) {
	return (
		<div className="flex flex-col gap-4">
			<LabeledField error={errors.name} id="box-name" label="Nome" required>
				{(field) => (
					<Input
						{...field}
						disabled={disabled}
						onChange={(e) => onPatch({ name: e.target.value })}
						placeholder="Ex: Caixa Pequena"
						value={values.name}
					/>
				)}
			</LabeledField>

			<div className="grid grid-cols-3 gap-3">
				<LabeledField
					error={errors.internalLengthCm}
					id="box-length"
					label="Comprimento (cm)"
					required
				>
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={decimalMask}
							onChange={(v) => onPatch({ internalLengthCm: v ?? 0 })}
							placeholder="30"
							value={values.internalLengthCm}
						/>
					)}
				</LabeledField>
				<LabeledField
					error={errors.internalWidthCm}
					id="box-width"
					label="Largura (cm)"
					required
				>
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={decimalMask}
							onChange={(v) => onPatch({ internalWidthCm: v ?? 0 })}
							placeholder="20"
							value={values.internalWidthCm}
						/>
					)}
				</LabeledField>
				<LabeledField
					error={errors.internalHeightCm}
					id="box-height"
					label="Altura (cm)"
					required
				>
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={decimalMask}
							onChange={(v) => onPatch({ internalHeightCm: v ?? 0 })}
							placeholder="15"
							value={values.internalHeightCm}
						/>
					)}
				</LabeledField>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<LabeledField
					error={errors.maxWeightKg}
					id="box-max-weight"
					label="Peso máx. (kg)"
					required
				>
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={decimalMask}
							onChange={(v) => onPatch({ maxWeightKg: v ?? 0 })}
							placeholder="20"
							value={values.maxWeightKg}
						/>
					)}
				</LabeledField>
				<LabeledField
					error={errors.tareWeightKg}
					id="box-tare"
					label="Tara (kg)"
				>
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={decimalMask}
							onChange={(v) => onPatch({ tareWeightKg: v ?? 0 })}
							placeholder="0,5"
							value={values.tareWeightKg}
						/>
					)}
				</LabeledField>
			</div>

			<div className="flex items-center gap-3">
				<Switch
					checked={values.active}
					disabled={disabled}
					id="box-active"
					onCheckedChange={(checked) => onPatch({ active: checked })}
				/>
				<label className="cursor-pointer text-sm" htmlFor="box-active">
					Ativa
				</label>
			</div>
		</div>
	);
}
