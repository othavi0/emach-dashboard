"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@emach/ui/components/command";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import { RadioGroup, RadioGroupItem } from "@emach/ui/components/radio-group";
import { Spinner } from "@emach/ui/components/spinner";
import { Switch } from "@emach/ui/components/switch";
import { Textarea } from "@emach/ui/components/textarea";
import { ChevronsUpDown, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ZodError } from "zod";

import {
	FormErrorPanel,
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { MaskedInput } from "@/components/masked-input";
import { percentageMask } from "@/lib/masks";

import { createPromotion, updatePromotion } from "../actions";
import {
	createPromotionSchema,
	type PromotionFormValues,
	promotionSchema,
} from "./promotion-schema";

const FIELD_LABELS: Record<string, string> = {
	title: "Título",
	description: "Descrição",
	type: "Tipo",
	code: "Código",
	discountType: "Tipo de desconto",
	discountValue: "Valor do desconto",
	startsAt: "Início",
	endsAt: "Fim",
	usageLimit: "Limite de uso",
	minPurchaseAmount: "Compra mínima",
	maxDiscountAmount: "Desconto máximo",
	toolIds: "Ferramentas",
	isActive: "Ativa",
	stackable: "Cumulativa",
	priority: "Prioridade",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolOption {
	id: string;
	name: string;
}

export interface PromotionFormProps {
	availableTools: ToolOption[];
	defaultValues?: Partial<PromotionFormValues>;
	mode: "create" | "edit";
	promotionId?: string;
}

type PromotionType = "promotion" | "promocode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateForInput(date: Date | null | undefined): string {
	if (!date) {
		return "";
	}
	// Use local date parts to avoid timezone offset shifting the displayed date
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function parseInputDate(value: string): Date | null {
	if (!value) {
		return null;
	}
	// Interpret as local midnight (not UTC) to avoid off-by-one timezone issues
	const d = new Date(`${value}T00:00:00`);
	return Number.isNaN(d.getTime()) ? null : d;
}

function typeLabel(type: PromotionType): string {
	return type === "promotion" ? "Automática" : "Cupom";
}

function zodErrorsToFieldMap(
	error: ZodError<PromotionFormValues>
): Record<string, string> {
	const map: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = issue.path[0];
		if (key !== undefined && typeof key !== "symbol" && !map[String(key)]) {
			map[String(key)] = issue.message;
		}
	}
	return map;
}

// ---------------------------------------------------------------------------
// SubmitLabel
// ---------------------------------------------------------------------------

function SubmitLabel({
	isPending,
	mode,
}: {
	isPending: boolean;
	mode: "create" | "edit";
}) {
	if (isPending) {
		return (
			<>
				<Spinner /> Salvando…
			</>
		);
	}
	return <>{mode === "create" ? "Criar promoção" : "Salvar alterações"}</>;
}

// ---------------------------------------------------------------------------
// ToolCombobox — inline, ~80 lines
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
// PromotionForm — main export
// ---------------------------------------------------------------------------

export function PromotionForm({
	availableTools,
	defaultValues,
	mode,
	promotionId,
}: PromotionFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	// Field state
	const [type, setType] = useState<PromotionType>(
		(defaultValues?.type as PromotionType | undefined) ?? "promotion"
	);
	const [title, setTitle] = useState(defaultValues?.title ?? "");
	const [description, setDescription] = useState(
		defaultValues?.description ?? ""
	);
	const [discountPct, setDiscountPct] = useState<number | undefined>(
		defaultValues?.discountPct ?? undefined
	);
	const [active, setActive] = useState(defaultValues?.active ?? true);
	const [startsAt, setStartsAt] = useState(
		formatDateForInput(defaultValues?.startsAt)
	);
	const [endsAt, setEndsAt] = useState(
		formatDateForInput(defaultValues?.endsAt)
	);
	const [code, setCode] = useState(defaultValues?.code ?? "");
	const [toolIds, setToolIds] = useState<string[]>(
		defaultValues?.toolIds ?? []
	);

	// Error & submit state
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [formIssues, setFormIssues] = useState<FormIssue[]>([]);
	const [serverError, setServerError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);

	function buildInput(): PromotionFormValues {
		const base = {
			title,
			description: description.trim() === "" ? null : description.trim(),
			discountPct: discountPct ?? 0,
			active,
			startsAt: parseInputDate(startsAt),
			endsAt: parseInputDate(endsAt),
			toolIds,
		};

		if (type === "promocode") {
			return { type: "promocode", code, ...base };
		}
		return { type: "promotion", code: null, ...base };
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});
		setFormIssues([]);
		setServerError(null);

		const input = buildInput();
		const schema = mode === "create" ? createPromotionSchema : promotionSchema;
		const parsed = schema.safeParse(input);

		if (!parsed.success) {
			setErrors(
				zodErrorsToFieldMap(parsed.error as ZodError<PromotionFormValues>)
			);
			const issues = zodIssuesToFormIssues(parsed.error, FIELD_LABELS);
			setFormIssues(issues);
			toast.error(
				`${issues.length} ${issues.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
			return;
		}

		startTransition(async () => {
			let result: { ok: boolean; error?: string };

			if (mode === "create") {
				result = await createPromotion(parsed.data);
			} else {
				if (!promotionId) {
					setServerError("ID da promoção não fornecido");
					return;
				}
				result = await updatePromotion(promotionId, parsed.data);
			}

			if (result.ok) {
				toast.success(
					mode === "create"
						? "Promoção criada com sucesso"
						: "Promoção atualizada com sucesso"
				);
				setSubmitted(true);
				router.push("/dashboard/promotions");
				router.refresh();
			} else {
				setServerError(
					(result as { ok: false; error: string }).error ||
						"Não foi possível salvar a promoção"
				);
			}
		});
	}

	return (
		<form
			className="flex w-full max-w-3xl flex-col gap-6"
			onSubmit={handleSubmit}
		>
			<FormErrorPanel issues={formIssues} />
			{/* Server-side error banner */}
			{serverError && (
				<div
					className="rounded-[8px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm"
					role="alert"
				>
					{serverError}
				</div>
			)}

			<section className="flex flex-col gap-6 rounded-md border border-border bg-card p-6">
				{/* Tipo */}
				<div className="flex flex-col gap-2">
					<Label>
						Tipo
						<span className="text-destructive"> *</span>
					</Label>
					{mode === "create" ? (
						<RadioGroup
							onValueChange={(v: string) => setType(v as PromotionType)}
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

				{/* Título */}
				<div className="flex flex-col gap-2">
					<Label htmlFor="promo-title">
						Título
						<span className="text-destructive"> *</span>
					</Label>
					<Input
						disabled={isPending}
						id="promo-title"
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Ex: Desconto de verão"
						value={title}
					/>
					{errors.title && (
						<p className="text-destructive text-sm">{errors.title}</p>
					)}
				</div>

				{/* Descrição */}
				<div className="flex flex-col gap-2">
					<Label htmlFor="promo-description">Descrição</Label>
					<Textarea
						disabled={isPending}
						id="promo-description"
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Descrição opcional da promoção"
						rows={3}
						value={description ?? ""}
					/>
					{errors.description && (
						<p className="text-destructive text-sm">{errors.description}</p>
					)}
				</div>

				{/* Desconto (%) */}
				<div className="flex flex-col gap-2">
					<Label htmlFor="promo-discount">
						Desconto (%)
						<span className="text-destructive"> *</span>
					</Label>
					<MaskedInput
						disabled={isPending}
						id="promo-discount"
						mask={percentageMask}
						onChange={setDiscountPct}
						placeholder="Ex: 10 ou 10,5"
						value={discountPct}
					/>
					{errors.discountPct && (
						<p className="text-destructive text-sm">{errors.discountPct}</p>
					)}
				</div>

				{/* Ativa */}
				<div className="flex items-center gap-3">
					<Switch
						checked={active}
						disabled={isPending}
						id="promo-active"
						onCheckedChange={setActive}
					/>
					<Label className="cursor-pointer" htmlFor="promo-active">
						Ativa
					</Label>
				</div>

				{/* Datas */}
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-starts-at">Início</Label>
						<Input
							disabled={isPending}
							id="promo-starts-at"
							onChange={(e) => setStartsAt(e.target.value)}
							type="date"
							value={startsAt}
						/>
						{errors.startsAt && (
							<p className="text-destructive text-sm">{errors.startsAt}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-ends-at">Fim</Label>
						<Input
							disabled={isPending}
							id="promo-ends-at"
							onChange={(e) => setEndsAt(e.target.value)}
							type="date"
							value={endsAt}
						/>
						{errors.endsAt && (
							<p className="text-destructive text-sm">{errors.endsAt}</p>
						)}
					</div>
				</div>

				{/* Código — only when type === 'promocode' */}
				{type === "promocode" && (
					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-code">
							Código
							<span className="text-destructive"> *</span>
						</Label>
						<Input
							disabled={isPending}
							id="promo-code"
							onChange={(e) => setCode(e.target.value)}
							placeholder="Ex: VERAO2025"
							value={code}
						/>
						<p className="text-muted-foreground text-xs">
							Código usado no checkout para aplicar este desconto
						</p>
						{errors.code && (
							<p className="text-destructive text-sm">{errors.code}</p>
						)}
					</div>
				)}

				{/* Ferramentas */}
				<div className="flex flex-col gap-2">
					<Label>
						Ferramentas
						<span className="text-destructive"> *</span>
					</Label>
					<ToolCombobox
						availableTools={availableTools}
						disabled={isPending}
						onChange={setToolIds}
						selectedIds={toolIds}
					/>
					{errors.toolIds && (
						<p className="text-destructive text-sm">{errors.toolIds}</p>
					)}
				</div>
			</section>

			{/* Botões */}
			<div className="flex items-center gap-3">
				<Button disabled={isPending || submitted} type="submit">
					<SubmitLabel isPending={isPending} mode={mode} />
				</Button>
				<Button
					disabled={isPending}
					onClick={() => router.push("/dashboard/promotions")}
					type="button"
					variant="ghost"
				>
					Cancelar
				</Button>
			</div>
		</form>
	);
}
