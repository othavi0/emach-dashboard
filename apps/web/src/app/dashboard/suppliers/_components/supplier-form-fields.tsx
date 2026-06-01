"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Textarea } from "@emach/ui/components/textarea";

import type { SupplierFormValues } from "./supplier-schema";

type Patch = (next: Partial<SupplierFormValues>) => void;

interface Props {
	disabled?: boolean;
	onPatch: Patch;
	values: SupplierFormValues;
}

export function SupplierFormFields({ values, onPatch, disabled }: Props) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="supplier-name">
					Nome<span className="text-destructive"> *</span>
				</Label>
				<Input
					disabled={disabled}
					id="supplier-name"
					onChange={(e) => onPatch({ name: e.target.value })}
					placeholder="Ex: Bosch Brasil"
					value={values.name ?? ""}
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-email">E-mail (opcional)</Label>
					<Input
						disabled={disabled}
						id="supplier-email"
						onChange={(e) => onPatch({ contactEmail: e.target.value })}
						placeholder="contato@fornecedor.com"
						type="email"
						value={values.contactEmail ?? ""}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-phone">Telefone (opcional)</Label>
					<Input
						disabled={disabled}
						id="supplier-phone"
						onChange={(e) => onPatch({ phone: e.target.value })}
						placeholder="(11) 99999-9999"
						value={values.phone ?? ""}
					/>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-website">Website (opcional)</Label>
					<Input
						disabled={disabled}
						id="supplier-website"
						onChange={(e) => onPatch({ website: e.target.value })}
						placeholder="https://..."
						type="url"
						value={values.website ?? ""}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-cnpj">CNPJ (opcional)</Label>
					<Input
						disabled={disabled}
						id="supplier-cnpj"
						onChange={(e) => onPatch({ cnpj: e.target.value })}
						placeholder="00.000.000/0000-00"
						value={values.cnpj ?? ""}
					/>
					<p className="text-muted-foreground text-xs">
						Só dígitos são salvos.
					</p>
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="supplier-notes">Observações (opcional)</Label>
				<Textarea
					disabled={disabled}
					id="supplier-notes"
					onChange={(e) => onPatch({ notes: e.target.value })}
					placeholder="Condições comerciais, contato responsável ou instruções internas."
					rows={5}
					value={values.notes ?? ""}
				/>
				<p className="text-muted-foreground text-xs">Markdown suportado</p>
			</div>
		</div>
	);
}
