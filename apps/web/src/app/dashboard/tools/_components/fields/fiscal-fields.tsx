"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";

import { HelpTooltip } from "@/components/help-tooltip";
import { MaskedInput } from "@/components/masked-input";
import { cestMask, hsCodeMask, ncmMask } from "@/lib/masks";
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
						<HelpTooltip text="Nome curto pra catálogo e busca interna. Ex: ELT 800." />
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
						<HelpTooltip text="Identificação completa usada em invoice e importação. Diferente do modelo comercial (curto, pra catálogo)." />
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
						<HelpTooltip
							body="Classifica a mercadoria para impostos e importação. 8 dígitos. Pegue na ficha do fabricante."
							example="Ex: 8467.21.00"
							title="Nomenclatura Comum do Mercosul"
						/>
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
						<HelpTooltip
							body="Identifica mercadorias sujeitas a ICMS-ST. Usado na nota fiscal. 7 dígitos."
							example="Ex: 21.106.00"
							title="Código Especificador da Substituição Tributária"
						/>
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
						<HelpTooltip
							body="Código aduaneiro internacional usado em importação/exportação. 6+ dígitos."
							example="Ex: 8467.21"
							title="Harmonized System Code"
						/>
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
