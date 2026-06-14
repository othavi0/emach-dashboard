"use client";

import { Input } from "@emach/ui/components/input";
import { Textarea } from "@emach/ui/components/textarea";

import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import type { SupplierFormValues } from "./supplier-schema";

type Patch = (next: Partial<SupplierFormValues>) => void;

interface Props {
	disabled?: boolean;
	errors?: Partial<Record<keyof SupplierFormValues, string>>;
	onPatch: Patch;
	values: SupplierFormValues;
}

export function SupplierFormFields({
	values,
	onPatch,
	disabled,
	errors = {},
}: Props) {
	return (
		<div className="flex flex-col gap-4">
			<LabeledField
				error={errors.name}
				id="supplier-name"
				label="Nome"
				required
			>
				{(field) => (
					<Input
						{...field}
						disabled={disabled}
						onChange={(e) => onPatch({ name: e.target.value })}
						placeholder="Ex: Bosch Brasil"
						value={values.name ?? ""}
					/>
				)}
			</LabeledField>

			<div className="grid gap-4 md:grid-cols-2">
				<LabeledField
					error={errors.contactEmail}
					id="supplier-email"
					label="E-mail (opcional)"
				>
					{(field) => (
						<Input
							{...field}
							disabled={disabled}
							onChange={(e) => onPatch({ contactEmail: e.target.value })}
							placeholder="contato@fornecedor.com"
							type="email"
							value={values.contactEmail ?? ""}
						/>
					)}
				</LabeledField>
				<LabeledField
					error={errors.phone}
					id="supplier-phone"
					label="Telefone (opcional)"
				>
					{(field) => (
						<Input
							{...field}
							disabled={disabled}
							onChange={(e) => onPatch({ phone: e.target.value })}
							placeholder="(11) 99999-9999"
							value={values.phone ?? ""}
						/>
					)}
				</LabeledField>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<LabeledField
					error={errors.website}
					help={<HelpTooltip text="URL completa, começando com https://." />}
					id="supplier-website"
					label="Website (opcional)"
				>
					{(field) => (
						<Input
							{...field}
							disabled={disabled}
							onChange={(e) => onPatch({ website: e.target.value })}
							placeholder="https://..."
							type="url"
							value={values.website ?? ""}
						/>
					)}
				</LabeledField>
				<LabeledField
					error={errors.cnpj}
					help={
						<HelpTooltip
							body="Só os dígitos são salvos; a máscara é apenas visual."
							example="12.345.678/0001-90 → 12345678000190"
							title="CNPJ"
						/>
					}
					id="supplier-cnpj"
					label="CNPJ (opcional)"
				>
					{(field) => (
						<Input
							{...field}
							disabled={disabled}
							onChange={(e) => onPatch({ cnpj: e.target.value })}
							placeholder="00.000.000/0000-00"
							value={values.cnpj ?? ""}
						/>
					)}
				</LabeledField>
			</div>

			<LabeledField
				error={errors.notes}
				hint="Markdown suportado"
				id="supplier-notes"
				label="Observações (opcional)"
			>
				{(field) => (
					<Textarea
						{...field}
						disabled={disabled}
						onChange={(e) => onPatch({ notes: e.target.value })}
						placeholder="Condições comerciais, contato responsável ou instruções internas."
						rows={5}
						value={values.notes ?? ""}
					/>
				)}
			</LabeledField>
		</div>
	);
}
