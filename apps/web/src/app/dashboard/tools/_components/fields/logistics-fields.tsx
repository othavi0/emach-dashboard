"use client";

import { Label } from "@emach/ui/components/label";
import { TriangleAlert } from "lucide-react";

import { HelpTooltip } from "@/components/help-tooltip";
import { MaskedInput } from "@/components/masked-input";
import type { Mask } from "@/lib/masks";
import { decimalMask, integerMask } from "@/lib/masks";
import type { ToolFormState } from "../tool-form-state";
import type { ToolFieldGroupProps } from "./types";

function exceedsShippingQuoteLimit(v: ToolFormState): boolean {
	return (
		(v.weightKg ?? 0) > 30 ||
		(v.lengthCm ?? 0) > 100 ||
		(v.widthCm ?? 0) > 100 ||
		(v.heightCm ?? 0) > 100
	);
}

export function LogisticsFields({
	values,
	onPatch,
	errors,
	disabled,
}: ToolFieldGroupProps) {
	const exceeds = exceedsShippingQuoteLimit(values);
	return (
		<div className="flex flex-col gap-4">
			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				A loja usa peso e medidas para cotar o frete no checkout.
				<HelpTooltip
					body="A loja cota o frete pelo SuperFrete usando esses valores. Sem eles, o cliente não consegue fechar o pedido. Cotação cobre até 30 kg e 100 cm por lado."
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
			{exceeds && (
				<div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
					<div className="flex items-start gap-2">
						<TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
						<p className="text-foreground text-xs leading-relaxed">
							Excede os limites do SuperFrete (máx. 30 kg e 100 cm por lado). A
							loja não cota automaticamente — o custo real pode sair{" "}
							<strong>mais caro do que o cliente pagou</strong>. Defina um frete
							fixo abaixo ou trate manualmente.
						</p>
					</div>
					<div className="flex max-w-xs flex-col gap-2">
						<Label
							className="flex items-center gap-1.5"
							htmlFor="overweightShippingAmount"
						>
							Frete para item pesado (R$)
							<HelpTooltip
								body="Acima de 30 kg / 100 cm a loja não cota. Esse valor fixo entra no lugar. Em branco = 'Frete a combinar' na loja."
								example="Ex: 250,00"
								title="Quando a cotação automática não cobre"
							/>
						</Label>
						<MaskedInput
							disabled={disabled}
							id="overweightShippingAmount"
							mask={decimalMask}
							onChange={(v) => onPatch({ overweightShippingAmount: v })}
							placeholder="Ex: 250,00"
							value={values.overweightShippingAmount}
						/>
						<p className="text-muted-foreground text-xs">
							Cobrado no lugar da cotação automática.
						</p>
					</div>
				</div>
			)}
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
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>
				{label}
				{required && <span className="text-destructive"> *</span>}
			</Label>
			<MaskedInput
				aria-invalid={error ? true : undefined}
				aria-required={required ? "true" : undefined}
				disabled={disabled}
				id={id}
				mask={mask}
				onChange={onChange}
				placeholder={placeholder}
				value={value}
			/>
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
}
