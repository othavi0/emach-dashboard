"use client";

import { Badge } from "@emach/ui/components/badge";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@emach/ui/components/command";
import { DatePicker } from "@emach/ui/components/date-picker";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import { RadioGroup, RadioGroupItem } from "@emach/ui/components/radio-group";
import { Switch } from "@emach/ui/components/switch";
import { Textarea } from "@emach/ui/components/textarea";
import { AlertCircle, ChevronsUpDown, Tag, Ticket, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { DiscountInput } from "@/components/discount-input";
import { FieldError } from "@/components/field-error";
import { MaskedInput } from "@/components/masked-input";
import { MoneyInput } from "@/components/money-input";
import { integerMask } from "@/lib/masks";

import { countToolsWithActivePromotion } from "../actions";
import type { PromotionFormValues } from "./promotion-schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolOption {
	id: string;
	name: string;
}

type Patch = (next: Partial<PromotionFormValues>) => void;
type PromotionType = "promotion" | "promocode";

export interface PromotionFormFieldsProps {
	availableTools: ToolOption[];
	disabled?: boolean;
	errors: Partial<Record<keyof PromotionFormValues, string>>;
	excludePromotionId?: string;
	mode: "create" | "edit";
	onPatch: Patch;
	values: PromotionFormValues;
}

const TYPE_OPTIONS: Array<{
	desc: string;
	icon: typeof Tag;
	title: string;
	value: PromotionType;
}> = [
	{
		value: "promotion",
		icon: Tag,
		title: "Automática",
		desc: "Desconto aplicado direto no preço, sem código.",
	},
	{
		value: "promocode",
		icon: Ticket,
		title: "Cupom",
		desc: "Cliente digita um código no checkout para aplicar.",
	},
];

function typeLabel(type: PromotionType): string {
	return type === "promotion" ? "Automática" : "Cupom";
}

// ---------------------------------------------------------------------------
// ToolCombobox — inline
// ---------------------------------------------------------------------------

function ToolCombobox({
	availableTools,
	disabled,
	onChange,
	selectedIds,
}: {
	availableTools: ToolOption[];
	disabled?: boolean;
	onChange: (ids: string[]) => void;
	selectedIds: string[];
}) {
	const [open, setOpen] = useState(false);

	function toggleTool(id: string) {
		if (selectedIds.includes(id)) {
			onChange(selectedIds.filter((sid) => sid !== id));
		} else {
			onChange([...selectedIds, id]);
		}
	}

	function removeTool(id: string) {
		onChange(selectedIds.filter((sid) => sid !== id));
	}

	const selectedTools = availableTools.filter((t) =>
		selectedIds.includes(t.id)
	);

	return (
		<div className="flex flex-col gap-2">
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger
					className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
					disabled={disabled}
					render={<button type="button" />}
				>
					<span className="text-muted-foreground text-sm">
						{selectedIds.length === 0
							? "Selecionar ferramentas…"
							: `${selectedIds.length} ferramenta${selectedIds.length === 1 ? "" : "s"} selecionada${selectedIds.length === 1 ? "" : "s"}`}
					</span>
					<ChevronsUpDown className="size-3.5 opacity-50" />
				</PopoverTrigger>
				<PopoverContent align="start" className="w-72 p-0">
					<Command>
						<CommandInput placeholder="Buscar ferramenta…" />
						<CommandList>
							<CommandEmpty>Nenhuma ferramenta encontrada.</CommandEmpty>
							<CommandGroup>
								{availableTools.map((tool) => {
									const isSelected = selectedIds.includes(tool.id);
									return (
										<CommandItem
											data-checked={isSelected}
											key={tool.id}
											onSelect={() => toggleTool(tool.id)}
											value={tool.name}
										>
											{tool.name}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			{selectedTools.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{selectedTools.map((tool) => (
						<Badge key={tool.id} variant="secondary">
							{tool.name}
							<button
								className="ml-0.5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-primary"
								disabled={disabled}
								onClick={() => removeTool(tool.id)}
								type="button"
							>
								<X className="size-3" />
								<span className="sr-only">Remover {tool.name}</span>
							</button>
						</Badge>
					))}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// TypeSelector — cartões de rádio que explicam cada tipo
// ---------------------------------------------------------------------------

function TypeSelector({
	disabled,
	onChange,
	value,
}: {
	disabled?: boolean;
	onChange: (next: PromotionType) => void;
	value: PromotionType;
}) {
	return (
		<RadioGroup
			className="grid gap-3 sm:grid-cols-2"
			onValueChange={(v: string) => onChange(v as PromotionType)}
			value={value}
		>
			{TYPE_OPTIONS.map((opt) => {
				const selected = value === opt.value;
				const Icon = opt.icon;
				return (
					<Label
						className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
							selected
								? "border-primary bg-primary/5"
								: "border-border hover:border-input"
						}`}
						htmlFor={`type-${opt.value}`}
						key={opt.value}
					>
						<RadioGroupItem
							className="mt-0.5"
							disabled={disabled}
							id={`type-${opt.value}`}
							value={opt.value}
						/>
						<span className="flex min-w-0 flex-col gap-1">
							<span className="flex items-center gap-1.5 font-medium text-sm">
								<Icon aria-hidden className="size-4 text-muted-foreground" />
								{opt.title}
							</span>
							<span className="text-muted-foreground text-xs leading-relaxed">
								{opt.desc}
							</span>
						</span>
					</Label>
				);
			})}
		</RadioGroup>
	);
}

// ---------------------------------------------------------------------------
// Section — card com título
// ---------------------------------------------------------------------------

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
			<h3 className="font-medium text-sm">{title}</h3>
			{children}
		</div>
	);
}

// ---------------------------------------------------------------------------
// PromotionFormFields — campos controlados (values + onPatch)
// ---------------------------------------------------------------------------

export function PromotionFormFields({
	availableTools,
	disabled,
	errors,
	excludePromotionId,
	mode,
	onPatch,
	values,
}: PromotionFormFieldsProps) {
	const type = values.type as PromotionType;
	const isCoupon = type === "promocode";

	// Aviso não-bloqueante: ferramentas com promoção ativa
	const [conflictCount, setConflictCount] = useState(0);
	const [, startTransition] = useTransition();

	useEffect(() => {
		if (values.appliesToAll || values.toolIds.length === 0) {
			setConflictCount(0);
			return;
		}
		let cancelled = false;
		startTransition(() => {
			countToolsWithActivePromotion(values.toolIds, excludePromotionId).then(
				(count) => {
					if (!cancelled) {
						setConflictCount(count);
					}
				}
			);
		});
		return () => {
			cancelled = true;
		};
	}, [values.toolIds, values.appliesToAll, excludePromotionId]);

	function handleTypeChange(next: PromotionType) {
		onPatch({
			type: next,
			code: next === "promocode" ? (values.code ?? "") : null,
			// limpar campos só-cupom ao voltar para promoção automática
			...(next === "promotion"
				? { maxRedemptions: null, minOrderAmount: null }
				: {}),
		} as Partial<PromotionFormValues>);
	}

	return (
		<div className="flex flex-col gap-6">
			{mode === "create" ? (
				<TypeSelector
					disabled={disabled}
					onChange={handleTypeChange}
					value={type}
				/>
			) : (
				<div className="flex items-center gap-2 text-sm">
					{isCoupon ? (
						<Ticket aria-hidden className="size-4 text-muted-foreground" />
					) : (
						<Tag aria-hidden className="size-4 text-muted-foreground" />
					)}
					<span className="font-medium">{typeLabel(type)}</span>
				</div>
			)}

			<div className="grid gap-4 lg:grid-cols-2">
				{/* Card 1 — Identidade */}
				<Section title="Identidade">
					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-title">
							Título<span className="text-destructive"> *</span>
						</Label>
						<Input
							aria-invalid={errors.title ? true : undefined}
							disabled={disabled}
							id="promo-title"
							onChange={(e) => onPatch({ title: e.target.value })}
							placeholder={
								isCoupon ? "Ex: Cupom boas-vindas" : "Ex: Liquidação de inverno"
							}
							value={values.title}
						/>
						<FieldError>{errors.title}</FieldError>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-description">Descrição</Label>
						<Textarea
							disabled={disabled}
							id="promo-description"
							onChange={(e) =>
								onPatch({
									description: e.target.value === "" ? null : e.target.value,
								})
							}
							placeholder="Contexto interno — não aparece no site."
							rows={3}
							value={values.description ?? ""}
						/>
						<FieldError>{errors.description}</FieldError>
					</div>
				</Section>

				{/* Card 2 — Desconto (+ campos de cupom) */}
				<Section title="Desconto">
					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-discount-value">
							Desconto<span className="text-destructive"> *</span>
						</Label>
						<DiscountInput
							disabled={disabled}
							discountType={values.discountType}
							discountValue={values.discountValue}
							id="promo-discount-value"
							onChange={(next) => onPatch(next)}
						/>
						<FieldError>{errors.discountValue}</FieldError>
					</div>

					{isCoupon && (
						<div className="flex flex-col gap-2">
							<Label htmlFor="promo-code">
								Código<span className="text-destructive"> *</span>
							</Label>
							<Input
								aria-invalid={errors.code ? true : undefined}
								className="font-mono uppercase"
								disabled={disabled}
								id="promo-code"
								onChange={(e) =>
									onPatch({
										code: e.target.value,
									} as Partial<PromotionFormValues>)
								}
								placeholder="VERAO2025"
								value={values.code ?? ""}
							/>
							<p className="text-muted-foreground text-xs">
								Digitado pelo cliente no checkout para aplicar o desconto.
							</p>
							<FieldError>{errors.code}</FieldError>
						</div>
					)}

					{isCoupon && (
						<>
							<div className="flex flex-col gap-2">
								<Label htmlFor="promo-max-redemptions">
									Limite de resgates
								</Label>
								<MaskedInput
									disabled={disabled}
									id="promo-max-redemptions"
									mask={integerMask}
									onChange={(n) =>
										onPatch({
											maxRedemptions: n ?? null,
										} as Partial<PromotionFormValues>)
									}
									value={
										(values as { maxRedemptions?: number | null })
											.maxRedemptions ?? undefined
									}
								/>
								<p className="text-muted-foreground text-xs">
									Vazio = ilimitado
								</p>
								<FieldError>{errors.maxRedemptions}</FieldError>
							</div>

							<div className="flex flex-col gap-2">
								<Label htmlFor="promo-min-order-amount">
									Valor mínimo do pedido
								</Label>
								<MoneyInput
									disabled={disabled}
									id="promo-min-order-amount"
									onChange={(n) =>
										onPatch({
											minOrderAmount: n,
										} as Partial<PromotionFormValues>)
									}
									value={
										(values as { minOrderAmount?: number | null })
											.minOrderAmount
									}
								/>
								<p className="text-muted-foreground text-xs">
									Vazio = sem mínimo
								</p>
								<FieldError>{errors.minOrderAmount}</FieldError>
							</div>
						</>
					)}
				</Section>

				{/* Card 3 — Vigência & publicação */}
				<Section title="Vigência & publicação">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="promo-starts-at">Início</Label>
							<DatePicker
								disabled={disabled}
								id="promo-starts-at"
								min={mode === "create" ? new Date() : undefined}
								onChange={(d) => onPatch({ startsAt: d ?? null })}
								value={values.startsAt ?? undefined}
							/>
							<p className="text-muted-foreground text-xs">Vazio = imediato</p>
							<FieldError>{errors.startsAt}</FieldError>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="promo-ends-at">Fim</Label>
							<DatePicker
								disabled={disabled}
								id="promo-ends-at"
								min={values.startsAt ?? undefined}
								onChange={(d) => onPatch({ endsAt: d ?? null })}
								value={values.endsAt ?? undefined}
							/>
							<p className="text-muted-foreground text-xs">Vazio = sem prazo</p>
							<FieldError>{errors.endsAt}</FieldError>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<Switch
							checked={values.active}
							disabled={disabled}
							id="promo-active"
							onCheckedChange={(v) => onPatch({ active: v })}
						/>
						<Label className="cursor-pointer" htmlFor="promo-active">
							Ativa
						</Label>
					</div>
					<p className="-mt-2 text-muted-foreground text-xs">
						Inativa não aparece no site, mesmo dentro da vigência.
					</p>

					{!isCoupon && (
						<>
							<div className="flex items-center gap-3">
								<Switch
									checked={values.featured}
									disabled={disabled}
									id="promo-featured"
									onCheckedChange={(v) => onPatch({ featured: v })}
								/>
								<Label className="cursor-pointer" htmlFor="promo-featured">
									Destaque no home
								</Label>
							</div>
							<p className="-mt-2 text-muted-foreground text-xs">
								Aparece em destaque no topo da home. Só uma promoção pode ser
								destaque por vez — não é possível ativar enquanto houver outro
								destaque vigente.
							</p>
						</>
					)}
				</Section>

				{/* Card 4 — Ferramentas */}
				<Section title="Ferramentas">
					<RadioGroup
						className="flex gap-4"
						onValueChange={(v) => {
							const all = v === "true";
							if (all) {
								onPatch({ appliesToAll: true, toolIds: [] });
							} else {
								onPatch({ appliesToAll: false });
							}
						}}
						value={String(values.appliesToAll)}
					>
						<Label
							className="flex cursor-pointer items-center gap-2"
							htmlFor="scope-all"
						>
							<RadioGroupItem disabled={disabled} id="scope-all" value="true" />
							Todas as ferramentas
						</Label>
						<Label
							className="flex cursor-pointer items-center gap-2"
							htmlFor="scope-specific"
						>
							<RadioGroupItem
								disabled={disabled}
								id="scope-specific"
								value="false"
							/>
							Ferramentas específicas
						</Label>
					</RadioGroup>

					{!values.appliesToAll && (
						<div className="flex flex-col gap-2">
							<ToolCombobox
								availableTools={availableTools}
								disabled={disabled}
								onChange={(ids) => onPatch({ toolIds: ids })}
								selectedIds={values.toolIds}
							/>
							<FieldError>{errors.toolIds}</FieldError>
							{conflictCount > 0 && (
								<div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
									<AlertCircle
										aria-hidden
										className="mt-0.5 size-3.5 shrink-0"
									/>
									<span>
										{conflictCount === 1
											? "1 desta já tem promoção"
											: `${conflictCount} destas já têm promoção`}{" "}
										— o site aplica o maior desconto.
									</span>
								</div>
							)}
						</div>
					)}
				</Section>
			</div>
		</div>
	);
}
