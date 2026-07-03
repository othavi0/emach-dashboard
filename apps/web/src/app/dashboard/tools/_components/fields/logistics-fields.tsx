"use client";

import { Switch } from "@emach/ui/components/switch";
import { TriangleAlert } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import type { Mask } from "@/lib/masks";
import { decimalMask, integerMask } from "@/lib/masks";
import { fitsAnyActiveBox } from "../../_lib/fits-shipping-box";
import { useToolFormContext } from "../tool-form-context";
import type { ToolFormState } from "../tool-form-state";
import type { ToolFieldGroupProps } from "./types";

function dimsReady(v: ToolFormState): boolean {
	return [v.weightKg, v.lengthCm, v.widthCm, v.heightCm].every(
		(n) => typeof n === "number" && n > 0
	);
}

export function LogisticsFields({
	values,
	onPatch,
	errors,
	disabled,
}: ToolFieldGroupProps) {
	const { activeBoxes } = useToolFormContext();
	const showNoFit =
		dimsReady(values) &&
		!values.shipsInOwnBox &&
		!fitsAnyActiveBox(
			{
				lengthCm: values.lengthCm ?? 0,
				widthCm: values.widthCm ?? 0,
				heightCm: values.heightCm ?? 0,
				weightKg: values.weightKg ?? 0,
				packagingWeightKg: values.packagingWeightKg ?? 0,
				stackable: values.stackable,
			},
			activeBoxes
		);
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

			<div className="flex flex-col gap-3">
				<h3 className="flex items-center gap-1.5 font-medium text-sm">
					Embalagem & envio
					<HelpTooltip
						body="Como o item entra na consolidação de caixas do frete. O peso da embalagem (espuma/proteção) soma ao peso do produto no despacho."
						example="Compressor: produto 58 kg + embalagem 1,5 kg"
						title="Consolidação de frete"
					/>
				</h3>
				<div className="flex max-w-xs flex-col gap-2">
					<LabeledField
						error={errors.packagingWeightKg}
						hint="Somado ao peso do produto no despacho."
						id="packagingWeightKg"
						label="Peso da embalagem (kg)"
					>
						{(field) => (
							<MaskedInput
								{...field}
								disabled={disabled}
								mask={decimalMask}
								onChange={(v) => onPatch({ packagingWeightKg: v })}
								placeholder="0"
								value={values.packagingWeightKg}
							/>
						)}
					</LabeledField>
				</div>
				<div className="flex items-center gap-3">
					<Switch
						checked={values.stackable}
						disabled={disabled}
						id="stackable"
						onCheckedChange={(checked) => onPatch({ stackable: checked })}
					/>
					<label
						className="flex cursor-pointer items-center gap-1.5 text-sm"
						htmlFor="stackable"
					>
						Empilhável
						<HelpTooltip text="Pode ir sobre/sob outros itens dentro da caixa. Desligado, o item reserva a coluna inteira acima dele na consolidação." />
					</label>
				</div>
				<div className="flex items-center gap-3">
					<Switch
						checked={values.shipsInOwnBox}
						disabled={disabled}
						id="shipsInOwnBox"
						onCheckedChange={(checked) => onPatch({ shipsInOwnBox: checked })}
					/>
					<label
						className="flex cursor-pointer items-center gap-1.5 text-sm"
						htmlFor="shipsInOwnBox"
					>
						Viaja na própria embalagem
						<HelpTooltip text="Não consolida com outros itens: a cotação usa as próprias dimensões do produto (ex.: item de 180 cm que não entra em caixa)." />
					</label>
				</div>
				{showNoFit && (
					<div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
						<TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
						<p className="text-foreground text-xs leading-relaxed">
							Não cabe em nenhuma caixa de envio ativa — na loja este item
							aparece como <strong>"Frete a combinar"</strong>. Se ele viaja em
							embalagem própria, ligue a opção acima.
						</p>
					</div>
				)}
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
