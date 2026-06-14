"use client";

import { Input } from "@emach/ui/components/input";

import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { cestMask, hsCodeMask, ncmMask } from "@/lib/masks";
import { FISCAL_HELP, MODEL_HELP } from "./spec-help";
import type { ToolFieldGroupProps } from "./types";

export function FiscalFields({
	values,
	onPatch,
	disabled,
}: ToolFieldGroupProps) {
	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-4 md:grid-cols-2">
				<LabeledField
					help={<HelpTooltip text={MODEL_HELP.model} />}
					id="model"
					label="Modelo comercial"
				>
					{(field) => (
						<Input
							{...field}
							disabled={disabled}
							onChange={(e) => onPatch({ model: e.target.value })}
							placeholder="Ex: ELT 800"
							value={values.model ?? ""}
						/>
					)}
				</LabeledField>
				<LabeledField
					help={<HelpTooltip text={MODEL_HELP.invoiceModel} />}
					id="invoiceModel"
					label="Modelo da fábrica"
				>
					{(field) => (
						<Input
							{...field}
							disabled={disabled}
							onChange={(e) => onPatch({ invoiceModel: e.target.value })}
							placeholder="Ex: FG-S225L-3-220V"
							value={values.invoiceModel ?? ""}
						/>
					)}
				</LabeledField>
			</div>
			<LabeledField id="manufacturerName" label="Marca / fabricante">
				{(field) => (
					<Input
						{...field}
						disabled={disabled}
						onChange={(e) => onPatch({ manufacturerName: e.target.value })}
						placeholder="Ex: Bosch, Makita"
						value={values.manufacturerName ?? ""}
					/>
				)}
			</LabeledField>
			<div className="grid gap-4 border-border border-t pt-4 md:grid-cols-3">
				<LabeledField
					help={<HelpTooltip {...FISCAL_HELP.ncm} />}
					id="ncm"
					label="NCM"
				>
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={ncmMask}
							onChange={(v) => onPatch({ ncm: v ?? "" })}
							value={values.ncm ?? ""}
						/>
					)}
				</LabeledField>
				<LabeledField
					help={<HelpTooltip {...FISCAL_HELP.cest} />}
					id="cest"
					label="CEST"
				>
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={cestMask}
							onChange={(v) => onPatch({ cest: v ?? "" })}
							value={values.cest ?? ""}
						/>
					)}
				</LabeledField>
				<LabeledField
					help={<HelpTooltip {...FISCAL_HELP.hsCode} />}
					id="hsCode"
					label="HS Code"
				>
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={hsCodeMask}
							onChange={(v) => onPatch({ hsCode: v ?? "" })}
							value={values.hsCode ?? ""}
						/>
					)}
				</LabeledField>
			</div>
		</div>
	);
}
