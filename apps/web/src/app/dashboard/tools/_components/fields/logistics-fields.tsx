"use client";

import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import type { Mask } from "@/lib/masks";
import { decimalMask, integerMask } from "@/lib/masks";
import type { ToolFieldGroupProps } from "./types";

export function LogisticsFields({
	values,
	onPatch,
	errors,
	disabled,
}: ToolFieldGroupProps) {
	return (
		<div className="flex flex-col gap-4">
			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				A loja usa peso e medidas para cotar o frete no checkout.
				<HelpTooltip
					body="A loja consolida os itens do carrinho nas caixas de envio cadastradas e cota o frete na Frenet. Sem esses valores, o cliente não consegue fechar o pedido. Item que não cabe na maior caixa ativa aparece como 'Frete a combinar'."
					example="Peso 2,5 kg · 30×20×10 cm"
					title="Por que peso e dimensões são obrigatórios"
				/>
			</p>
			<div className="grid gap-4 md:grid-cols-5">
				<FieldNum
					disabled={disabled}
					error={errors.weightKg}
					id="weightKg"
					label="Peso (kg)"
					mask={decimalMask}
					onChange={(v) => onPatch({ weightKg: v })}
					placeholder="Ex: 2,5"
					required
					value={values.weightKg}
				/>
				<FieldNum
					disabled={disabled}
					error={errors.lengthCm}
					id="lengthCm"
					label="Comprimento (cm)"
					mask={decimalMask}
					onChange={(v) => onPatch({ lengthCm: v })}
					placeholder="Ex: 30"
					required
					value={values.lengthCm}
				/>
				<FieldNum
					disabled={disabled}
					error={errors.widthCm}
					id="widthCm"
					label="Largura (cm)"
					mask={decimalMask}
					onChange={(v) => onPatch({ widthCm: v })}
					placeholder="Ex: 10"
					required
					value={values.widthCm}
				/>
				<FieldNum
					disabled={disabled}
					error={errors.heightCm}
					id="heightCm"
					label="Altura (cm)"
					mask={decimalMask}
					onChange={(v) => onPatch({ heightCm: v })}
					placeholder="Ex: 20"
					required
					value={values.heightCm}
				/>
				<FieldNum
					disabled={disabled}
					id="powerWatts"
					label="Potência (W)"
					mask={integerMask}
					onChange={(v) => onPatch({ powerWatts: v })}
					placeholder="Ex: 700"
					value={values.powerWatts}
				/>
			</div>
		</div>
	);
}

function FieldNum({
	id,
	label,
	required,
	error,
	disabled,
	mask,
	placeholder,
	value,
	onChange,
}: {
	id: string;
	label: string;
	required?: boolean;
	error?: string;
	disabled?: boolean;
	mask: Mask<number>;
	placeholder: string;
	value?: number;
	onChange: (v: number | undefined) => void;
}) {
	return (
		<LabeledField error={error} id={id} label={label} required={required}>
			{(field) => (
				<MaskedInput
					{...field}
					aria-required={required ? "true" : undefined}
					disabled={disabled}
					mask={mask}
					onChange={onChange}
					placeholder={placeholder}
					value={value}
				/>
			)}
		</LabeledField>
	);
}
