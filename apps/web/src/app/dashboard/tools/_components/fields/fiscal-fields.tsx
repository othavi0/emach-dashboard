"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";

import { HelpTooltip } from "@/components/help-tooltip";
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
				<div className="flex flex-col gap-2">
					<Label className="flex items-center gap-1.5" htmlFor="model">
						Modelo comercial
						<HelpTooltip text={MODEL_HELP.model} />
					</Label>
					<Input
						disabled={disabled}
						id="model"
						onChange={(e) => onPatch({ model: e.target.value })}
						placeholder="Ex: ELT 800"
						value={values.model ?? ""}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label className="flex items-center gap-1.5" htmlFor="invoiceModel">
						Modelo da fábrica
						<HelpTooltip text={MODEL_HELP.invoiceModel} />
					</Label>
					<Input
						disabled={disabled}
						id="invoiceModel"
						onChange={(e) => onPatch({ invoiceModel: e.target.value })}
						placeholder="Ex: FG-S225L-3-220V"
						value={values.invoiceModel ?? ""}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="manufacturerName">Marca / fabricante</Label>
				<Input
					disabled={disabled}
					id="manufacturerName"
					onChange={(e) => onPatch({ manufacturerName: e.target.value })}
					placeholder="Ex: Bosch, Makita"
					value={values.manufacturerName ?? ""}
				/>
			</div>
			<div className="grid gap-4 border-border border-t pt-4 md:grid-cols-3">
				<div className="flex flex-col gap-2">
					<Label className="flex items-center gap-1.5" htmlFor="ncm">
						NCM
						<HelpTooltip {...FISCAL_HELP.ncm} />
					</Label>
					<MaskedInput
						disabled={disabled}
						id="ncm"
						mask={ncmMask}
						onChange={(v) => onPatch({ ncm: v ?? "" })}
						value={values.ncm ?? ""}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label className="flex items-center gap-1.5" htmlFor="cest">
						CEST
						<HelpTooltip {...FISCAL_HELP.cest} />
					</Label>
					<MaskedInput
						disabled={disabled}
						id="cest"
						mask={cestMask}
						onChange={(v) => onPatch({ cest: v ?? "" })}
						value={values.cest ?? ""}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label className="flex items-center gap-1.5" htmlFor="hsCode">
						HS Code
						<HelpTooltip {...FISCAL_HELP.hsCode} />
					</Label>
					<MaskedInput
						disabled={disabled}
						id="hsCode"
						mask={hsCodeMask}
						onChange={(v) => onPatch({ hsCode: v ?? "" })}
						value={values.hsCode ?? ""}
					/>
				</div>
			</div>
		</div>
	);
}
