"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";

import { MaskedInput } from "@/components/masked-input";
import { phoneBrMask } from "@/lib/masks";

import type { BranchFormValues } from "./branch-schema";
import { CepInput, type CepResolved } from "./cep-input";
import { CepRangesEditor } from "./cep-ranges-editor";
import { ResponsibleUserSelect } from "./responsible-user-select";

type Patch = (next: Partial<BranchFormValues>) => void;

interface Props {
	branchId?: string;
	disabled?: boolean;
	onPatch: Patch;
	showTeamSection: boolean;
	values: BranchFormValues;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
			{children}
		</h3>
	);
}

export function BranchFormFields({
	branchId,
	values,
	onPatch,
	showTeamSection,
	disabled,
}: Props) {
	const handleCepResolve = (resolved: CepResolved) => {
		onPatch({
			street: values.street || resolved.street,
			neighborhood: values.neighborhood || resolved.neighborhood,
			city: values.city || resolved.city,
			state: values.state || resolved.state,
		});
	};

	return (
		<div className="flex flex-col gap-6">
			{/* Identidade */}
			<section className="flex flex-col gap-3">
				<SectionHeader>Identidade</SectionHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-name">
						Nome <span className="text-destructive">*</span>
					</Label>
					<Input
						disabled={disabled}
						id="branch-name"
						onChange={(e) => onPatch({ name: e.target.value })}
						value={values.name}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-status">Status</Label>
					<Select
						disabled={disabled}
						onValueChange={(v) =>
							onPatch({ status: (v ?? "active") as BranchFormValues["status"] })
						}
						value={values.status}
					>
						<SelectTrigger id="branch-status">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="active">Ativa</SelectItem>
							<SelectItem value="inactive">Inativa</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-muted-foreground text-xs">
						Inativa esconde a filial dos pickers de novos pedidos/ajustes
						(histórico mantido).
					</p>
				</div>
			</section>

			{/* Contato */}
			<section className="flex flex-col gap-3">
				<SectionHeader>Contato</SectionHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-phone">Telefone</Label>
					<MaskedInput
						disabled={disabled}
						id="branch-phone"
						mask={phoneBrMask}
						onChange={(v) => onPatch({ phone: v })}
						value={values.phone}
					/>
				</div>
			</section>

			{/* Endereço */}
			<section className="flex flex-col gap-3">
				<SectionHeader>Endereço</SectionHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-cep">CEP</Label>
					<CepInput
						disabled={disabled}
						id="branch-cep"
						onChange={(v) => onPatch({ cep: v })}
						onResolve={handleCepResolve}
						value={values.cep}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-street">Rua</Label>
					<Input
						disabled={disabled}
						id="branch-street"
						onChange={(e) => onPatch({ street: e.target.value })}
						value={values.street ?? ""}
					/>
				</div>
				<div className="grid grid-cols-[100px_1fr] gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-number">Nº</Label>
						<Input
							disabled={disabled}
							id="branch-number"
							onChange={(e) => onPatch({ streetNumber: e.target.value })}
							value={values.streetNumber ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-complement">Complemento</Label>
						<Input
							disabled={disabled}
							id="branch-complement"
							onChange={(e) => onPatch({ complement: e.target.value })}
							value={values.complement ?? ""}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-neighborhood">Bairro</Label>
					<Input
						disabled={disabled}
						id="branch-neighborhood"
						onChange={(e) => onPatch({ neighborhood: e.target.value })}
						value={values.neighborhood ?? ""}
					/>
				</div>
				<div className="grid grid-cols-[1fr_100px] gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-city">Cidade</Label>
						<Input
							disabled={disabled}
							id="branch-city"
							onChange={(e) => onPatch({ city: e.target.value })}
							value={values.city ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-state">UF</Label>
						<Input
							disabled={disabled}
							id="branch-state"
							maxLength={2}
							onChange={(e) => onPatch({ state: e.target.value.toUpperCase() })}
							value={values.state ?? ""}
						/>
					</div>
				</div>
			</section>

			{/* Faixas de CEP */}
			<section className="flex flex-col gap-3">
				<SectionHeader>Faixas de CEP atendidas</SectionHeader>
				<p className="text-muted-foreground text-xs">
					Sugestão de qual filial atende cada região. Não restringe pedidos —
					todos chegam para todas as filiais.
				</p>
				<CepRangesEditor
					disabled={disabled}
					onChange={(next) => onPatch({ cepRanges: next })}
					value={values.cepRanges ?? []}
				/>
			</section>

			{/* Equipe (oculto no create) */}
			{showTeamSection && branchId && (
				<section className="flex flex-col gap-3">
					<SectionHeader>Equipe</SectionHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-responsible">Responsável</Label>
						<ResponsibleUserSelect
							branchId={branchId}
							disabled={disabled}
							onChange={(v) => onPatch({ responsibleUserId: v })}
							value={values.responsibleUserId}
						/>
					</div>
				</section>
			)}
		</div>
	);
}
