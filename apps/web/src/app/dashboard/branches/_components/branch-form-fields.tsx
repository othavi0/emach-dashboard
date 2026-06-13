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
import { Switch } from "@emach/ui/components/switch";

import { HelpTooltip } from "@/components/help-tooltip";
import { MaskedInput } from "@/components/masked-input";
import { UfSelect } from "@/components/uf-select";
import { phoneBrMask, sanitizeTime24h } from "@/lib/masks";

import type { BranchFormValues } from "./branch-schema";
import { CepInput, type CepResolved } from "./cep-input";
import { CepRangesEditor } from "./cep-ranges-editor";
import { ResponsibleUserSelect } from "./responsible-user-select";

type Patch = (next: Partial<BranchFormValues>) => void;
type BusinessHoursKey = keyof BranchFormValues["businessHours"];

const BUSINESS_HOURS_ROWS: Array<{ key: BusinessHoursKey; label: string }> = [
	{ key: "weekdays", label: "Dias de semana" },
	{ key: "saturday", label: "Sábado" },
	{ key: "holidays", label: "Feriados" },
];

interface Props {
	branchId?: string;
	/** 1 = empilhado (drawer); 2 = duas colunas (página de criar). Default 1. */
	columns?: 1 | 2;
	disabled?: boolean;
	errors?: Partial<Record<keyof BranchFormValues, string>>;
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
	columns = 1,
	values,
	onPatch,
	showTeamSection,
	disabled,
	errors = {},
}: Props) {
	const handleCepResolve = (resolved: CepResolved) => {
		onPatch({
			street: values.street || resolved.street,
			neighborhood: values.neighborhood || resolved.neighborhood,
			city: values.city || resolved.city,
			state: values.state || resolved.state,
		});
	};

	const patchBusinessHours = (
		key: BusinessHoursKey,
		next: Partial<BranchFormValues["businessHours"][BusinessHoursKey]>
	) => {
		onPatch({
			businessHours: {
				...values.businessHours,
				[key]: { ...values.businessHours[key], ...next },
			},
		});
	};

	const identitySection = (
		<section className="flex flex-col gap-3">
			<SectionHeader>Identidade</SectionHeader>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-name">
						Nome <span className="text-destructive">*</span>
					</Label>
					<Input
						aria-invalid={errors.name ? true : undefined}
						disabled={disabled}
						id="branch-name"
						onChange={(e) => onPatch({ name: e.target.value })}
						placeholder="Ex: Filial São Paulo — Paulista"
						value={values.name}
					/>
					{errors.name && (
						<p className="text-destructive text-xs">{errors.name}</p>
					)}
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
				</div>
			</div>
			<p className="text-muted-foreground text-xs">
				Inativa esconde a filial dos pickers de novos pedidos/ajustes (histórico
				mantido).
			</p>
		</section>
	);

	const contactSection = (
		<section className="flex flex-col gap-3">
			<SectionHeader>Contato</SectionHeader>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="branch-phone">Telefone</Label>
				<MaskedInput
					disabled={disabled}
					id="branch-phone"
					mask={phoneBrMask}
					onChange={(v) => onPatch({ phone: v })}
					placeholder="(11) 98765-4321"
					value={values.phone}
				/>
			</div>
		</section>
	);

	const addressSection = (
		<section className="flex flex-col gap-3">
			<SectionHeader>Endereço</SectionHeader>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-cep">CEP</Label>
					<CepInput
						disabled={disabled}
						id="branch-cep"
						onChange={(v) => onPatch({ cep: v })}
						onResolve={handleCepResolve}
						value={values.cep}
					/>
					{errors.cep && (
						<p className="text-destructive text-xs">{errors.cep}</p>
					)}
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-street">Rua</Label>
					<Input
						disabled={disabled}
						id="branch-street"
						onChange={(e) => onPatch({ street: e.target.value })}
						placeholder="Preenchida pelo CEP"
						value={values.street ?? ""}
					/>
				</div>
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-number">Número</Label>
					<Input
						disabled={disabled}
						id="branch-number"
						onChange={(e) => onPatch({ streetNumber: e.target.value })}
						placeholder="1578"
						value={values.streetNumber ?? ""}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-complement">Complemento</Label>
					<Input
						disabled={disabled}
						id="branch-complement"
						onChange={(e) => onPatch({ complement: e.target.value })}
						placeholder="Conj., sala, bloco…"
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
					placeholder="Bela Vista"
					value={values.neighborhood ?? ""}
				/>
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-city">Cidade</Label>
					<Input
						disabled={disabled}
						id="branch-city"
						onChange={(e) => onPatch({ city: e.target.value })}
						placeholder="São Paulo"
						value={values.city ?? ""}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-state">UF</Label>
					<UfSelect
						disabled={disabled}
						id="branch-state"
						onChange={(v) => onPatch({ state: v })}
						value={values.state ?? undefined}
					/>
				</div>
			</div>
		</section>
	);

	const hoursSection = (
		<section className="flex flex-col gap-3">
			<SectionHeader>
				<span className="inline-flex items-center gap-1.5">
					Horário de funcionamento
					<HelpTooltip text="Exibido na página da filial no site." />
				</span>
			</SectionHeader>
			<div className="flex flex-col">
				{BUSINESS_HOURS_ROWS.map((row) => {
					const period = values.businessHours[row.key];
					return (
						<div
							className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_112px_112px] items-center gap-2 border-border border-b py-2.5 last:border-b-0 sm:gap-3"
							key={row.key}
						>
							<Label
								className="text-foreground"
								htmlFor={`branch-hours-${row.key}-switch`}
							>
								{row.label}
							</Label>
							<Switch
								checked={period.isOpen}
								disabled={disabled}
								id={`branch-hours-${row.key}-switch`}
								onCheckedChange={(checked) =>
									patchBusinessHours(
										row.key,
										checked
											? { isOpen: true, opensAt: "08:00", closesAt: "18:00" }
											: { isOpen: false, opensAt: null, closesAt: null }
									)
								}
							/>
							{period.isOpen ? (
								<>
									<Input
										aria-label={`Abertura de ${row.label}`}
										className="px-2 text-center tabular-nums"
										disabled={disabled}
										inputMode="numeric"
										maxLength={5}
										onChange={(event) =>
											patchBusinessHours(row.key, {
												opensAt: sanitizeTime24h(event.target.value) || null,
											})
										}
										placeholder="08:00"
										value={period.opensAt ?? ""}
									/>
									<Input
										aria-label={`Fechamento de ${row.label}`}
										className="px-2 text-center tabular-nums"
										disabled={disabled}
										inputMode="numeric"
										maxLength={5}
										onChange={(event) =>
											patchBusinessHours(row.key, {
												closesAt: sanitizeTime24h(event.target.value) || null,
											})
										}
										placeholder="18:00"
										value={period.closesAt ?? ""}
									/>
								</>
							) : (
								<span className="col-span-2 text-center text-muted-foreground text-xs italic">
									Fechado
								</span>
							)}
						</div>
					);
				})}
			</div>
			<p className="text-muted-foreground text-xs">
				Domingos são tratados como fechado.
			</p>
			{errors.businessHours && (
				<p className="text-destructive text-xs">{errors.businessHours}</p>
			)}
		</section>
	);

	const cepRangesSection = (
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
			{errors.cepRanges && (
				<p className="text-destructive text-xs">{errors.cepRanges}</p>
			)}
		</section>
	);

	const teamSection =
		showTeamSection && branchId ? (
			<section className="flex flex-col gap-3">
				<SectionHeader>Equipe</SectionHeader>
				<div className="flex flex-col gap-1.5">
					<Label
						className="flex items-center gap-1.5"
						htmlFor="branch-responsible"
					>
						Responsável
						<HelpTooltip text="Usuário responsável por esta filial." />
					</Label>
					<ResponsibleUserSelect
						branchId={branchId}
						disabled={disabled}
						onChange={(v) => onPatch({ responsibleUserId: v })}
						value={values.responsibleUserId}
					/>
				</div>
			</section>
		) : null;

	if (columns === 2) {
		return (
			<div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
				<div className="flex flex-col gap-8">
					{identitySection}
					{contactSection}
					{addressSection}
				</div>
				<div className="flex flex-col gap-8">
					{hoursSection}
					{cepRangesSection}
					{teamSection}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{identitySection}
			{contactSection}
			{addressSection}
			{hoursSection}
			{cepRangesSection}
			{teamSection}
		</div>
	);
}
