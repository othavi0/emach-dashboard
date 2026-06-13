"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Textarea } from "@emach/ui/components/textarea";

import { HelpTooltip } from "@/components/help-tooltip";
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
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="supplier-name">
					Nome<span className="text-destructive"> *</span>
				</Label>
				<Input
					aria-invalid={errors.name ? true : undefined}
					disabled={disabled}
					id="supplier-name"
					onChange={(e) => onPatch({ name: e.target.value })}
					placeholder="Ex: Bosch Brasil"
					value={values.name ?? ""}
				/>
				{errors.name && (
					<p className="text-destructive text-xs">{errors.name}</p>
				)}
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-email">E-mail (opcional)</Label>
					<Input
						aria-invalid={errors.contactEmail ? true : undefined}
						disabled={disabled}
						id="supplier-email"
						onChange={(e) => onPatch({ contactEmail: e.target.value })}
						placeholder="contato@fornecedor.com"
						type="email"
						value={values.contactEmail ?? ""}
					/>
					{errors.contactEmail && (
						<p className="text-destructive text-xs">{errors.contactEmail}</p>
					)}
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-phone">Telefone (opcional)</Label>
					<Input
						aria-invalid={errors.phone ? true : undefined}
						disabled={disabled}
						id="supplier-phone"
						onChange={(e) => onPatch({ phone: e.target.value })}
						placeholder="(11) 99999-9999"
						value={values.phone ?? ""}
					/>
					{errors.phone && (
						<p className="text-destructive text-xs">{errors.phone}</p>
					)}
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label
						className="flex items-center gap-1.5"
						htmlFor="supplier-website"
					>
						Website (opcional)
						<HelpTooltip text="URL completa, começando com https://." />
					</Label>
					<Input
						aria-invalid={errors.website ? true : undefined}
						disabled={disabled}
						id="supplier-website"
						onChange={(e) => onPatch({ website: e.target.value })}
						placeholder="https://..."
						type="url"
						value={values.website ?? ""}
					/>
					{errors.website && (
						<p className="text-destructive text-xs">{errors.website}</p>
					)}
				</div>
				<div className="flex flex-col gap-1.5">
					<Label className="flex items-center gap-1.5" htmlFor="supplier-cnpj">
						CNPJ (opcional)
						<HelpTooltip
							body="Só os dígitos são salvos; a máscara é apenas visual."
							example="12.345.678/0001-90 → 12345678000190"
							title="CNPJ"
						/>
					</Label>
					<Input
						aria-invalid={errors.cnpj ? true : undefined}
						disabled={disabled}
						id="supplier-cnpj"
						onChange={(e) => onPatch({ cnpj: e.target.value })}
						placeholder="00.000.000/0000-00"
						value={values.cnpj ?? ""}
					/>
					{errors.cnpj && (
						<p className="text-destructive text-xs">{errors.cnpj}</p>
					)}
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="supplier-notes">Observações (opcional)</Label>
				<Textarea
					aria-invalid={errors.notes ? true : undefined}
					disabled={disabled}
					id="supplier-notes"
					onChange={(e) => onPatch({ notes: e.target.value })}
					placeholder="Condições comerciais, contato responsável ou instruções internas."
					rows={5}
					value={values.notes ?? ""}
				/>
				{errors.notes && (
					<p className="text-destructive text-xs">{errors.notes}</p>
				)}
				<p className="text-muted-foreground text-xs">Markdown suportado</p>
			</div>
		</div>
	);
}
