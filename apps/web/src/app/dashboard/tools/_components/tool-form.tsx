"use client";

import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { Button } from "@emach/ui/components/button";
import { Checkbox } from "@emach/ui/components/checkbox";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@emach/ui/components/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Spinner } from "@emach/ui/components/spinner";
import { Switch } from "@emach/ui/components/switch";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ZodError } from "zod";

import { createTool, updateTool } from "../actions";
import { DynamicSpecsEditor } from "./dynamic-specs-editor";
import { ToolImageGallery } from "./tool-image-gallery";
import {
	type AttributeValueInput,
	MAX_IMAGES,
	MIN_IMAGES_ACTIVE,
	slugify,
	TOOL_STATUS_LABELS,
	TOOL_STATUS_OPTIONS,
	type ToolFormValues,
	type ToolVariantInput,
	toolFormSchema,
} from "./tool-schema";
import { VariantsEditor } from "./variants-editor";

interface CategoryOption {
	depth: number;
	id: string;
	name: string;
	path: string;
	slug: string;
}

interface SupplierOption {
	id: string;
	name: string;
}

interface ToolFormProps {
	categories: CategoryOption[];
	defaultValues: Partial<ToolFormValues>;
	definitionsByCategory: Record<string, AttributeDefinition[]>;
	existingSlug?: string;
	mode: "create" | "edit";
	suppliers: SupplierOption[];
	toolId?: string;
}

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
	return <>{mode === "create" ? "Criar ferramenta" : "Salvar alterações"}</>;
}

function parseDecimal(display: string): number | undefined {
	const cleaned = display.replace(",", ".").replace(/[^\d.]/g, "");
	if (!cleaned) {
		return;
	}
	const n = Number(cleaned);
	return Number.isNaN(n) ? undefined : n;
}

const EMPTY_VALUES: ToolFormValues = {
	name: "",
	description: "",
	model: "",
	invoiceModel: "",
	manufacturerName: "",
	countryOfOrigin: "",
	status: "draft",
	hsCode: "",
	ncm: "",
	cest: "",
	powerWatts: undefined,
	weightKg: undefined,
	lengthCm: undefined,
	widthCm: undefined,
	heightCm: undefined,
	categoryIds: [],
	primaryCategoryId: "",
	supplierId: "",
	visibleOnSite: true,
	images: [],
	variants: [
		{
			sku: "",
			barcode: "",
			voltage: "",
			priceAmount: 0,
			costAmount: undefined,
			isDefault: true,
			sortOrder: 0,
		},
	],
	attributeValues: {},
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: form com seções múltiplas; sub-componentes em variants-editor / dynamic-specs-editor
export function ToolForm({
	mode,
	toolId,
	defaultValues,
	categories,
	suppliers,
	existingSlug,
	definitionsByCategory,
}: ToolFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<ToolFormValues>({
		...EMPTY_VALUES,
		...defaultValues,
		variants:
			defaultValues.variants && defaultValues.variants.length > 0
				? defaultValues.variants
				: EMPTY_VALUES.variants,
		attributeValues: defaultValues.attributeValues ?? {},
	});
	const [errors, setErrors] = useState<
		Partial<Record<keyof ToolFormValues, string>>
	>({});
	const [pendingConfirmation, setPendingConfirmation] = useState<{
		labels: string[];
	} | null>(null);

	const slugPreview = useMemo(() => {
		if (mode === "edit" && existingSlug) {
			return existingSlug;
		}
		return slugify(values.name) || "—";
	}, [mode, existingSlug, values.name]);

	const activeDefinitions = useMemo(
		() => definitionsByCategory[values.primaryCategoryId] ?? [],
		[definitionsByCategory, values.primaryCategoryId]
	);

	function update<K extends keyof ToolFormValues>(
		key: K,
		value: ToolFormValues[K]
	) {
		setValues((prev) => ({ ...prev, [key]: value }));
	}

	function updateAttribute(slug: string, value: AttributeValueInput) {
		setValues((prev) => ({
			...prev,
			attributeValues: { ...prev.attributeValues, [slug]: value },
		}));
	}

	function updateVariants(next: ToolVariantInput[]) {
		setValues((prev) => ({ ...prev, variants: next }));
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orquestra Zod, transição e dois caminhos de retorno (sucesso, warning de órfãos, erro); coeso o suficiente para uma função inline
	async function submit(confirmOrphans = false) {
		const result = toolFormSchema.safeParse(values);
		if (!result.success) {
			const zodError = result.error as ZodError<ToolFormValues>;
			const fieldErrors: Partial<Record<keyof ToolFormValues, string>> = {};
			for (const issue of zodError.issues) {
				const key = issue.path[0] as keyof ToolFormValues | undefined;
				if (key && !fieldErrors[key]) {
					fieldErrors[key] = issue.message;
				}
			}
			setErrors(fieldErrors);
			toast.error("Revise os campos do formulário");
			return;
		}
		setErrors({});

		const actionResult =
			mode === "create"
				? await createTool(result.data)
				: await updateTool(toolId ?? "", result.data, { confirmOrphans });

		if (actionResult.ok) {
			toast.success(
				mode === "create"
					? "Ferramenta criada com sucesso"
					: "Ferramenta atualizada com sucesso"
			);
			router.push("/dashboard/tools");
			router.refresh();
			return;
		}

		if (
			"warning" in actionResult &&
			actionResult.warning === "orphan_attributes"
		) {
			setPendingConfirmation({ labels: actionResult.orphanLabels });
			return;
		}

		toast.error(
			("error" in actionResult && actionResult.error) || "Falha ao salvar"
		);
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		startTransition(() => submit(false));
	}

	function handleConfirmOrphans() {
		setPendingConfirmation(null);
		startTransition(() => submit(true));
	}

	return (
		<form className="flex w-full flex-col gap-6" onSubmit={handleSubmit}>
			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Informações básicas
				</h2>
				<div className="flex flex-col gap-2">
					<Label htmlFor="name">Nome</Label>
					<Input
						id="name"
						onChange={(e) => update("name", e.target.value)}
						placeholder="Ex: Furadeira de impacto 700W"
						value={values.name}
					/>
					<p className="font-mono text-muted-foreground text-xs">
						URL: /ferramentas/{slugPreview}
					</p>
					{errors.name && (
						<p className="text-destructive text-xs">{errors.name}</p>
					)}
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="description">Descrição (markdown)</Label>
					<Textarea
						id="description"
						onChange={(e) => update("description", e.target.value)}
						placeholder="Descreva especificações técnicas, destaques e uso recomendado. Aceita markdown (**negrito**, listas com -, etc)."
						rows={4}
						value={values.description ?? ""}
					/>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Variantes
				</h2>
				<p className="text-muted-foreground text-xs">
					Cada variante é uma SKU vendável. Use voltagens distintas (127V/220V)
					ou outras variações como linhas separadas.
				</p>
				<VariantsEditor
					error={errors.variants}
					onChange={updateVariants}
					value={values.variants}
				/>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Identificação extra
				</h2>
				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="model">Modelo (curto)</Label>
						<Input
							id="model"
							onChange={(e) => update("model", e.target.value)}
							placeholder="Ex: ELT 800"
							value={values.model ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="invoiceModel">Modelo de invoice (fábrica)</Label>
						<Input
							id="invoiceModel"
							onChange={(e) => update("invoiceModel", e.target.value)}
							placeholder="Ex: FG-S225L-3-220V"
							value={values.invoiceModel ?? ""}
						/>
					</div>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="manufacturerName">Fabricante</Label>
						<Input
							id="manufacturerName"
							onChange={(e) => update("manufacturerName", e.target.value)}
							value={values.manufacturerName ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="countryOfOrigin">País de origem</Label>
						<Input
							id="countryOfOrigin"
							onChange={(e) => update("countryOfOrigin", e.target.value)}
							placeholder="Ex: BR, CN"
							value={values.countryOfOrigin ?? ""}
						/>
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Classificação fiscal
				</h2>
				<div className="grid gap-4 md:grid-cols-3">
					<div className="flex flex-col gap-2">
						<Label htmlFor="ncm">NCM</Label>
						<Input
							id="ncm"
							onChange={(e) => update("ncm", e.target.value)}
							placeholder="Ex: 8467.29.99"
							value={values.ncm ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="cest">CEST</Label>
						<Input
							id="cest"
							onChange={(e) => update("cest", e.target.value)}
							value={values.cest ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="hsCode">HS Code (invoice)</Label>
						<Input
							id="hsCode"
							onChange={(e) => update("hsCode", e.target.value)}
							placeholder="Ex: 8467291000"
							value={values.hsCode ?? ""}
						/>
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Dimensões, peso e potência
				</h2>
				<div className="grid gap-4 md:grid-cols-5">
					<div className="flex flex-col gap-2">
						<Label htmlFor="weightKg">Peso (kg)</Label>
						<Input
							id="weightKg"
							inputMode="decimal"
							onChange={(e) => update("weightKg", parseDecimal(e.target.value))}
							value={values.weightKg ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="lengthCm">Comprimento (cm)</Label>
						<Input
							id="lengthCm"
							inputMode="decimal"
							onChange={(e) => update("lengthCm", parseDecimal(e.target.value))}
							value={values.lengthCm ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="widthCm">Largura (cm)</Label>
						<Input
							id="widthCm"
							inputMode="decimal"
							onChange={(e) => update("widthCm", parseDecimal(e.target.value))}
							value={values.widthCm ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="heightCm">Altura (cm)</Label>
						<Input
							id="heightCm"
							inputMode="decimal"
							onChange={(e) => update("heightCm", parseDecimal(e.target.value))}
							value={values.heightCm ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="powerWatts">Potência (W)</Label>
						<Input
							id="powerWatts"
							inputMode="numeric"
							onChange={(e) =>
								update("powerWatts", parseDecimal(e.target.value))
							}
							value={values.powerWatts ?? ""}
						/>
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Especificações técnicas dinâmicas
				</h2>
				<DynamicSpecsEditor
					definitions={activeDefinitions}
					onChange={updateAttribute}
					values={values.attributeValues}
				/>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Mídia · {values.images.length} de {MAX_IMAGES}
				</h2>
				<ToolImageGallery
					max={MAX_IMAGES}
					min={values.status === "active" ? MIN_IMAGES_ACTIVE : 0}
					onChange={(images) => update("images", images)}
					value={values.images}
				/>
				{errors.images && (
					<p className="text-destructive text-xs">{errors.images}</p>
				)}
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Classificação
				</h2>
				<div className="flex flex-col gap-2">
					<Label>Categorias</Label>
					<div className="flex flex-col gap-1 rounded border border-border p-3">
						{categories.map((cat) => {
							const checked = values.categoryIds.includes(cat.id);
							return (
								<div
									className="flex items-center gap-2"
									key={cat.id}
									style={{ paddingLeft: cat.depth * 16 }}
								>
									<Checkbox
										checked={checked}
										id={`cat-${cat.id}`}
										onCheckedChange={(v) => {
											if (v) {
												const next = [...values.categoryIds, cat.id];
												update("categoryIds", next);
												if (next.length === 1) {
													update("primaryCategoryId", cat.id);
												}
											} else {
												const next = values.categoryIds.filter(
													(c) => c !== cat.id
												);
												update("categoryIds", next);
												if (values.primaryCategoryId === cat.id) {
													update("primaryCategoryId", next[0] ?? "");
												}
											}
										}}
									/>
									<label
										className="cursor-pointer text-sm"
										htmlFor={`cat-${cat.id}`}
									>
										{cat.name}
									</label>
								</div>
							);
						})}
					</div>
					{errors.categoryIds && (
						<p className="text-destructive text-xs">{errors.categoryIds}</p>
					)}
				</div>
				{values.categoryIds.length > 0 && (
					<div className="flex flex-col gap-2">
						<Label>Categoria principal</Label>
						<RadioGroup
							onValueChange={(v) => update("primaryCategoryId", v)}
							value={values.primaryCategoryId}
						>
							{categories
								.filter((cat) => values.categoryIds.includes(cat.id))
								.map((cat) => (
									<div className="flex items-center gap-2" key={cat.id}>
										<RadioGroupItem id={`primary-${cat.id}`} value={cat.id} />
										<label
											className="cursor-pointer text-sm"
											htmlFor={`primary-${cat.id}`}
										>
											{cat.name}
										</label>
									</div>
								))}
						</RadioGroup>
						{errors.primaryCategoryId && (
							<p className="text-destructive text-xs">
								{errors.primaryCategoryId}
							</p>
						)}
					</div>
				)}
				<div className="flex flex-col gap-2">
					<Label htmlFor="supplierId">Fornecedor</Label>
					<Select
						onValueChange={(v) => update("supplierId", v ?? "")}
						value={values.supplierId ?? ""}
					>
						<SelectTrigger id="supplierId">
							<SelectValue placeholder="Opcional" />
						</SelectTrigger>
						<SelectContent>
							{suppliers.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-4 border-border border-t pt-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="status">Status</Label>
						<Select
							onValueChange={(v) =>
								update("status", v as ToolFormValues["status"])
							}
							value={values.status}
						>
							<SelectTrigger id="status">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TOOL_STATUS_OPTIONS.map((s) => (
									<SelectItem key={s} value={s}>
										{TOOL_STATUS_LABELS[s]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							"Ativo" exige {MIN_IMAGES_ACTIVE} imagens.
						</p>
					</div>
					<div className="flex items-center justify-between">
						<Label htmlFor="visibleOnSite">Visível no site público</Label>
						<Switch
							checked={values.visibleOnSite}
							id="visibleOnSite"
							onCheckedChange={(checked) => update("visibleOnSite", checked)}
						/>
					</div>
				</div>
			</section>

			{pendingConfirmation && (
				<div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900">
					<p className="font-semibold text-sm">
						A categoria mudou e existem especificações órfãs:
					</p>
					<ul className="mt-2 list-disc pl-5 text-sm">
						{pendingConfirmation.labels.map((label) => (
							<li key={label}>{label}</li>
						))}
					</ul>
					<p className="mt-2 text-sm">
						Salvar agora vai apagar esses valores. Confirma?
					</p>
					<div className="mt-3 flex gap-2">
						<Button
							onClick={handleConfirmOrphans}
							size="sm"
							type="button"
							variant="destructive"
						>
							Apagar e salvar
						</Button>
						<Button
							onClick={() => setPendingConfirmation(null)}
							size="sm"
							type="button"
							variant="ghost"
						>
							Cancelar
						</Button>
					</div>
				</div>
			)}

			<div className="flex gap-3">
				<Button disabled={isPending} type="submit">
					<SubmitLabel isPending={isPending} mode={mode} />
				</Button>
				<Button
					onClick={() => router.push("/dashboard/tools")}
					type="button"
					variant="ghost"
				>
					Cancelar
				</Button>
			</div>
		</form>
	);
}
