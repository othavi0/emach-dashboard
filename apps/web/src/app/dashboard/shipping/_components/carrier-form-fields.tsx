"use client";

import { Input } from "@emach/ui/components/input";
import { Switch } from "@emach/ui/components/switch";
import { Textarea } from "@emach/ui/components/textarea";

import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { MoneyInput } from "@/components/money-input";
import { cnpjMask, integerMask, percentageMask } from "@/lib/masks";

import type { CarrierFormValues } from "./carrier-schema";

type Patch = (next: Partial<CarrierFormValues>) => void;

interface Props {
	disabled?: boolean;
	errors?: Partial<Record<keyof CarrierFormValues, string>>;
	onPatch: Patch;
	values: CarrierFormValues;
}

export function CarrierFormFields({
	values,
	onPatch,
	disabled,
	errors = {},
}: Props) {
	return (
		<div className="flex flex-col gap-4">
			{/* Identidade */}
			<LabeledField error={errors.name} id="carrier-name" label="Nome" required>
				{(field) => (
					<Input
						{...field}
						disabled={disabled}
						onChange={(e) => onPatch({ name: e.target.value })}
						placeholder="Ex: Transportadora Brasil"
						value={values.name}
					/>
				)}
			</LabeledField>

			<LabeledField error={errors.cnpj} id="carrier-cnpj" label="CNPJ">
				{(field) => (
					<MaskedInput
						{...field}
						disabled={disabled}
						mask={cnpjMask}
						onChange={(v) => onPatch({ cnpj: typeof v === "string" ? v : "" })}
						placeholder="00.000.000/0001-00"
						value={values.cnpj ?? ""}
					/>
				)}
			</LabeledField>

			<LabeledField
				error={errors.cubageDivisor}
				help={
					<HelpTooltip text="Divisor para cálculo de peso cubado. Correios/aéreo: 6000; rodoviário: 5000." />
				}
				id="carrier-cubage"
				label="Divisor de cubagem"
				required
			>
				{(field) => (
					<MaskedInput
						{...field}
						disabled={disabled}
						mask={integerMask}
						onChange={(v) => onPatch({ cubageDivisor: v ?? 6000 })}
						placeholder="6000"
						value={values.cubageDivisor}
					/>
				)}
			</LabeledField>

			{/* Sobretaxas */}
			<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				Sobretaxas
			</h3>

			<div className="grid grid-cols-2 gap-3">
				<LabeledField
					error={errors.grisPercent}
					help={
						<HelpTooltip text="GRIS: % sobre o valor da NF para gerenciamento de risco." />
					}
					id="carrier-gris-pct"
					label="GRIS (%)"
				>
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={percentageMask}
							onChange={(v) =>
								onPatch({ grisPercent: v === undefined ? null : v })
							}
							placeholder="0,50"
							value={values.grisPercent ?? undefined}
						/>
					)}
				</LabeledField>

				<LabeledField
					error={errors.grisMinAmount}
					id="carrier-gris-min"
					label="GRIS mínimo (R$)"
				>
					{(field) => (
						<MoneyInput
							aria-invalid={field["aria-invalid"]}
							disabled={disabled}
							id={field.id}
							onChange={(v) => onPatch({ grisMinAmount: v })}
							value={values.grisMinAmount ?? null}
						/>
					)}
				</LabeledField>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<LabeledField
					error={errors.advaloremPercent}
					help={
						<HelpTooltip text="Ad valorem: % sobre o valor da NF para seguro de carga." />
					}
					id="carrier-advalorem"
					label="Ad valorem (%)"
				>
					{(field) => (
						<MaskedInput
							{...field}
							disabled={disabled}
							mask={percentageMask}
							onChange={(v) =>
								onPatch({ advaloremPercent: v === undefined ? null : v })
							}
							placeholder="0,30"
							value={values.advaloremPercent ?? undefined}
						/>
					)}
				</LabeledField>

				<LabeledField
					error={errors.tollAmount}
					id="carrier-toll"
					label="Pedágio (R$)"
				>
					{(field) => (
						<MoneyInput
							aria-invalid={field["aria-invalid"]}
							disabled={disabled}
							id={field.id}
							onChange={(v) => onPatch({ tollAmount: v })}
							value={values.tollAmount ?? null}
						/>
					)}
				</LabeledField>
			</div>

			<LabeledField
				error={errors.icmsPercent}
				help={
					<HelpTooltip text="ICMS por dentro: % embutido no frete. Varia por UF de destino." />
				}
				id="carrier-icms"
				label="ICMS (%)"
			>
				{(field) => (
					<MaskedInput
						{...field}
						disabled={disabled}
						mask={percentageMask}
						onChange={(v) =>
							onPatch({ icmsPercent: v === undefined ? null : v })
						}
						placeholder="12,00"
						value={values.icmsPercent ?? undefined}
					/>
				)}
			</LabeledField>

			{/* Status e notas */}
			<div className="flex items-center gap-3">
				<Switch
					checked={values.active}
					disabled={disabled}
					id="carrier-active"
					onCheckedChange={(checked) => onPatch({ active: checked })}
				/>
				<label className="cursor-pointer text-sm" htmlFor="carrier-active">
					Ativa
				</label>
			</div>

			<LabeledField error={errors.notes} id="carrier-notes" label="Observações">
				{(field) => (
					<Textarea
						{...field}
						disabled={disabled}
						onChange={(e) => onPatch({ notes: e.target.value })}
						placeholder="Restrições, contatos, etc."
						rows={3}
						value={values.notes ?? ""}
					/>
				)}
			</LabeledField>
		</div>
	);
}
