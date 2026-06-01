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
import { ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";

import { MaskedInput } from "@/components/masked-input";
import { percentageMask } from "@/lib/masks";

import type { PromotionFormValues } from "./promotion-schema";

const SECTION_MARKER =
	"font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider";

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
	errors: Record<string, string>;
	mode: "create" | "edit";
	onPatch: Patch;
	values: PromotionFormValues;
}

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
					className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={disabled}
					render={<button type="button" />}
				>
					<span className="text-muted-foreground text-xs">
						{selectedIds.length === 0
							? "Selecionar ferramentas…"
							: `${selectedIds.length} ferramenta${selectedIds.length === 1 ? "" : "s"} selecionada${selectedIds.length === 1 ? "" : "s"}`}
					</span>
					<ChevronsUpDown className="size-3.5 opacity-50" />
				</PopoverTrigger>
				<PopoverContent align="start" className="w-64 p-0">
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
// PromotionFormFields — campos controlados (values + onPatch)
// ---------------------------------------------------------------------------

export function PromotionFormFields({
	availableTools,
	disabled,
	errors,
	mode,
	onPatch,
	values,
}: PromotionFormFieldsProps) {
	const type = values.type as PromotionType;

	function handleTypeChange(next: PromotionType) {
		onPatch({
			type: next,
			code: next === "promocode" ? (values.code ?? "") : null,
		} as Partial<PromotionFormValues>);
	}

	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col gap-4">
				<h3 className={SECTION_MARKER}>Tipo</h3>
				{/* Tipo */}
				<div className="flex flex-col gap-2">
					<Label>
						Tipo
						<span className="text-destructive"> *</span>
					</Label>
					{mode === "create" ? (
						<RadioGroup
							onValueChange={(v: string) =>
								handleTypeChange(v as PromotionType)
							}
							value={type}
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem id="type-promotion" value="promotion" />
								<Label
									className="cursor-pointer font-normal"
									htmlFor="type-promotion"
								>
									Automática
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem id="type-promocode" value="promocode" />
								<Label
									className="cursor-pointer font-normal"
									htmlFor="type-promocode"
								>
									Cupom
								</Label>
							</div>
						</RadioGroup>
					) : (
						<p className="text-muted-foreground text-sm">{typeLabel(type)}</p>
					)}
				</div>
			</section>

			<section className="flex flex-col gap-4">
				<h3 className={SECTION_MARKER}>Identidade</h3>
				{/* Título */}
				<div className="flex flex-col gap-2">
					<Label htmlFor="promo-title">
						Título
						<span className="text-destructive"> *</span>
					</Label>
					<Input
						disabled={disabled}
						id="promo-title"
						onChange={(e) => onPatch({ title: e.target.value })}
						placeholder="Ex: Desconto de verão"
						value={values.title}
					/>
					{errors.title && (
						<p className="text-destructive text-sm">{errors.title}</p>
					)}
				</div>

				{/* Descrição */}
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
						placeholder="Descrição opcional da promoção"
						rows={3}
						value={values.description ?? ""}
					/>
					{errors.description && (
						<p className="text-destructive text-sm">{errors.description}</p>
					)}
				</div>

				{/* Código — só quando type === 'promocode' */}
				{type === "promocode" && (
					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-code">
							Código
							<span className="text-destructive"> *</span>
						</Label>
						<Input
							disabled={disabled}
							id="promo-code"
							onChange={(e) =>
								onPatch({
									code: e.target.value,
								} as Partial<PromotionFormValues>)
							}
							placeholder="Ex: VERAO2025"
							value={values.code ?? ""}
						/>
						<p className="text-muted-foreground text-xs">
							Código usado no checkout para aplicar este desconto
						</p>
						{errors.code && (
							<p className="text-destructive text-sm">{errors.code}</p>
						)}
					</div>
				)}
			</section>

			<section className="flex flex-col gap-4">
				<h3 className={SECTION_MARKER}>Desconto & vigência</h3>
				{/* Desconto (%) */}
				<div className="flex flex-col gap-2">
					<Label htmlFor="promo-discount">
						Desconto (%)
						<span className="text-destructive"> *</span>
					</Label>
					<MaskedInput
						disabled={disabled}
						id="promo-discount"
						mask={percentageMask}
						onChange={(n) => onPatch({ discountPct: n ?? 0 })}
						placeholder="Ex: 10 ou 10,5"
						value={values.discountPct}
					/>
					{errors.discountPct && (
						<p className="text-destructive text-sm">{errors.discountPct}</p>
					)}
				</div>

				{/* Ativa */}
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

				{/* Datas */}
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-starts-at">Início</Label>
						<DatePicker
							disabled={disabled}
							id="promo-starts-at"
							onChange={(d) => onPatch({ startsAt: d ?? null })}
							value={values.startsAt ?? undefined}
						/>
						{errors.startsAt && (
							<p className="text-destructive text-sm">{errors.startsAt}</p>
						)}
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
						{errors.endsAt && (
							<p className="text-destructive text-sm">{errors.endsAt}</p>
						)}
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-4">
				<h3 className={SECTION_MARKER}>Ferramentas</h3>
				{/* Ferramentas */}
				<div className="flex flex-col gap-2">
					<Label>
						Ferramentas
						<span className="text-destructive"> *</span>
					</Label>
					<ToolCombobox
						availableTools={availableTools}
						disabled={disabled}
						onChange={(ids) => onPatch({ toolIds: ids })}
						selectedIds={values.toolIds}
					/>
					{errors.toolIds && (
						<p className="text-destructive text-sm">{errors.toolIds}</p>
					)}
				</div>
			</section>
		</div>
	);
}
