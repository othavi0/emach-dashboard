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
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Spinner } from "@emach/ui/components/spinner";
import { Switch } from "@emach/ui/components/switch";
import { Textarea } from "@emach/ui/components/textarea";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ZodError, ZodIssue } from "zod";

import { FormErrorPanel } from "@/components/form-error-panel";
import { MaskedInput } from "@/components/masked-input";
import {
	cestMask,
	decimalMask,
	hsCodeMask,
	integerMask,
	ncmMask,
} from "@/lib/masks";

import { createTool, updateTool } from "../actions";
import { AttributeAssignmentsEditor } from "./attribute-assignments-editor";
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
	allDefinitions: AttributeDefinition[];
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

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	description: "Descrição",
	model: "Modelo comercial",
	invoiceModel: "Modelo da fábrica",
	manufacturerName: "Marca / fabricante",
	status: "Status",
	hsCode: "HS Code",
	ncm: "NCM",
	cest: "CEST",
	powerWatts: "Potência (W)",
	weightKg: "Peso (kg)",
	lengthCm: "Comprimento (cm)",
	widthCm: "Largura (cm)",
	heightCm: "Altura (cm)",
	categoryIds: "Categorias",
	primaryCategoryId: "Categoria principal",
	supplierId: "Fornecedor",
	visibleOnSite: "Visível no site",
	images: "Imagens",
	variants: "Variantes",
	attributeValues: "Especificações técnicas",
	attributeAssignments: "Atributos vinculados",
};

function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
	if (path.length === 0) {
		return "Formulário";
	}
	const head = String(path[0]);
	const headLabel = FIELD_LABELS[head] ?? head;
	if (path.length === 1) {
		return headLabel;
	}
	if (head === "variants" && typeof path[1] === "number") {
		const idx = (path[1] as number) + 1;
		const subKey = path[2] ? String(path[2]) : "";
		const subLabel =
			subKey === "sku"
				? "SKU"
				: subKey === "priceAmount"
					? "preço"
					: subKey === "costAmount"
						? "custo"
						: subKey;
		return subLabel ? `Variante ${idx} · ${subLabel}` : `Variante ${idx}`;
	}
	if (head === "attributeValues" && path[1]) {
		return `Atributo "${String(path[1])}"`;
	}
	return `${headLabel} · ${path.slice(1).map(String).join(".")}`;
}

// Estado do form permite numéricos de frete vazios (undefined) antes do
// preenchimento; a validação Zod exige presença e positividade no submit.
type ToolFormState = Omit<
	ToolFormValues,
	"weightKg" | "lengthCm" | "widthCm" | "heightCm" | "overweightShippingAmount"
> & {
	weightKg?: number;
	lengthCm?: number;
	widthCm?: number;
	heightCm?: number;
	overweightShippingAmount?: number;
};

// Tetos de cotação do SuperFrete: 30 kg e 100 cm por lado. Acima disso a loja
// não cota automaticamente e o frete real pode sair mais caro que o cobrado.
function exceedsShippingQuoteLimit(values: ToolFormState): boolean {
	return (
		(values.weightKg ?? 0) > 30 ||
		(values.lengthCm ?? 0) > 100 ||
		(values.widthCm ?? 0) > 100 ||
		(values.heightCm ?? 0) > 100
	);
}

const EMPTY_VALUES: ToolFormState = {
	name: "",
	description: "",
	model: "",
	invoiceModel: "",
	manufacturerName: "",
	status: "draft",
	hsCode: "",
	ncm: "",
	cest: "",
	powerWatts: undefined,
	weightKg: undefined,
	lengthCm: undefined,
	widthCm: undefined,
	heightCm: undefined,
	overweightShippingAmount: undefined,
	categoryIds: [],
	primaryCategoryId: "",
	supplierId: "",
	visibleOnSite: true,
	images: [],
	variants: [
		{
			sku: "",
			voltage: "",
			priceAmount: 0,
			costAmount: undefined,
			isDefault: true,
			sortOrder: 0,
		},
	],
	attributeValues: {},
	attributeAssignments: [],
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: form coeso de ferramenta com muitos campos controlados (identidade, variantes, categorias, specs, dimensões de frete, fiscal, imagens, publicação) — será refatorado em sub-componentes.
export function ToolForm({
	mode,
	toolId,
	defaultValues,
	categories,
	suppliers,
	existingSlug,
	definitionsByCategory,
	allDefinitions,
}: ToolFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<ToolFormState>({
		...EMPTY_VALUES,
		...defaultValues,
		variants:
			defaultValues.variants && defaultValues.variants.length > 0
				? defaultValues.variants
				: EMPTY_VALUES.variants,
		attributeValues: defaultValues.attributeValues ?? {},
		attributeAssignments: defaultValues.attributeAssignments ?? [],
	});
	const [errors, setErrors] = useState<
		Partial<Record<keyof ToolFormValues, string>>
	>({});
	const [formIssues, setFormIssues] = useState<ZodIssue[]>([]);
	const errorPanelRef = useRef<HTMLDivElement | null>(null);

	const slugPreview = useMemo(() => {
		if (mode === "edit" && existingSlug) {
			return existingSlug;
		}
		return slugify(values.name) || "—";
	}, [mode, existingSlug, values.name]);

	const suggestedDefinitions = useMemo(
		() => definitionsByCategory[values.primaryCategoryId] ?? [],
		[definitionsByCategory, values.primaryCategoryId]
	);

	const definitionsBySlug = useMemo(
		() => new Map(allDefinitions.map((d) => [d.slug, d])),
		[allDefinitions]
	);

	const assignedDefinitions = useMemo(() => {
		const out: AttributeDefinition[] = [];
		for (const slug of values.attributeAssignments) {
			const def = definitionsBySlug.get(slug);
			if (def) {
				out.push(def);
			}
		}
		return out;
	}, [values.attributeAssignments, definitionsBySlug]);

	// Em modo create: trocar primary category reseta assignments para o pool sugerido.
	// Em edit: assignments vêm do banco e não são alterados automaticamente.
	const skipNextSyncRef = useRef(true);
	useEffect(() => {
		if (skipNextSyncRef.current) {
			skipNextSyncRef.current = false;
			return;
		}
		if (mode !== "create") {
			return;
		}
		setValues((prev) => ({
			...prev,
			attributeAssignments: suggestedDefinitions.map((d) => d.slug),
		}));
	}, [suggestedDefinitions, mode]);

	function update<K extends keyof ToolFormState>(
		key: K,
		value: ToolFormState[K]
	) {
		setValues((prev) => ({ ...prev, [key]: value }));
	}

	function updateAttribute(slug: string, value: AttributeValueInput) {
		setValues((prev) => ({
			...prev,
			attributeValues: { ...prev.attributeValues, [slug]: value },
		}));
	}

	function updateAttributeAssignments(next: string[]) {
		setValues((prev) => {
			const nextSet = new Set(next);
			const trimmedValues: Record<string, AttributeValueInput> = {};
			for (const [k, v] of Object.entries(prev.attributeValues)) {
				if (nextSet.has(k)) {
					trimmedValues[k] = v;
				}
			}
			return {
				...prev,
				attributeAssignments: next,
				attributeValues: trimmedValues,
			};
		});
	}

	function updateVariants(next: ToolVariantInput[]) {
		setValues((prev) => ({ ...prev, variants: next }));
	}

	async function submit() {
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
			setFormIssues(zodError.issues);
			toast.error(
				`${zodError.issues.length} erro${zodError.issues.length === 1 ? "" : "s"} — veja detalhes acima`
			);
			requestAnimationFrame(() => {
				errorPanelRef.current?.scrollIntoView({
					behavior: "smooth",
					block: "start",
				});
			});
			return;
		}
		setErrors({});
		setFormIssues([]);

		const actionResult =
			mode === "create"
				? await createTool(result.data)
				: await updateTool(toolId ?? "", result.data);

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

		toast.error(actionResult.error || "Falha ao salvar");
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		startTransition(submit);
	}

	const exceedsShippingLimit = exceedsShippingQuoteLimit(values);

	return (
		<form className="flex w-full flex-col gap-6" onSubmit={handleSubmit}>
			<FormErrorPanel
				issues={formIssues.map((issue) => ({
					path: formatIssuePath(issue.path),
					message: issue.message,
				}))}
				ref={errorPanelRef}
			/>
			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
						Identidade do produto
					</h2>
					<p className="text-muted-foreground text-xs">
						Como a ferramenta aparece no catálogo e na URL pública.
					</p>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="name">
						Nome
						<span className="text-destructive"> *</span>
					</Label>
					<Input
						aria-invalid={errors.name ? true : undefined}
						aria-required="true"
						id="name"
						onChange={(e) => update("name", e.target.value)}
						placeholder="Ex: Furadeira de impacto 700W"
						value={values.name}
					/>
					<p className="font-mono text-muted-foreground text-xs">
						Endereço público: /ferramentas/{slugPreview}
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
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
						Variantes (SKUs vendáveis)
					</h2>
					<p className="text-muted-foreground text-xs">
						Cada variante é uma SKU vendável. Use voltagens distintas
						(127V/220V) ou outras variações como linhas separadas.
					</p>
				</div>
				<VariantsEditor
					error={errors.variants}
					onChange={updateVariants}
					value={values.variants}
				/>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
						Categorização
					</h2>
					<p className="text-muted-foreground text-xs">
						Onde a ferramenta aparece na árvore do site e quem fornece. A
						categoria principal define o conjunto de especificações técnicas
						disponíveis abaixo.
					</p>
				</div>
				<div className="flex flex-col gap-2">
					<Label>
						Categorias
						<span className="text-destructive"> *</span>
					</Label>
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
						<Label>
							Categoria principal
							<span className="text-destructive"> *</span>
						</Label>
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
							<SelectGroup>
								{suppliers.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
						Especificações técnicas
					</h2>
					<p className="text-muted-foreground text-xs">
						Atributos definidos pela categoria principal. Selecione quais se
						aplicam a esta ferramenta e preencha os valores.
					</p>
				</div>
				<div className="flex flex-col gap-2">
					<h3 className="font-medium text-sm">Atributos desta ferramenta</h3>
					<AttributeAssignmentsEditor
						allDefinitions={allDefinitions}
						onChange={updateAttributeAssignments}
						suggested={suggestedDefinitions}
						value={values.attributeAssignments}
					/>
				</div>
				{assignedDefinitions.length > 0 && (
					<div className="flex flex-col gap-2 border-border border-t pt-4">
						<h3 className="font-medium text-sm">Valores</h3>
						<DynamicSpecsEditor
							definitions={assignedDefinitions}
							onChange={updateAttribute}
							values={values.attributeValues}
						/>
					</div>
				)}
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
						Dimensões físicas
					</h2>
					<p className="text-muted-foreground text-xs">
						Obrigatório — a loja usa peso e medidas para cotar o frete no
						checkout. Cotação do SuperFrete cobre até 30 kg e 100 cm por lado.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-5">
					<div className="flex flex-col gap-2">
						<Label htmlFor="weightKg">
							Peso (kg)
							<span className="text-destructive"> *</span>
						</Label>
						<MaskedInput
							aria-invalid={errors.weightKg ? true : undefined}
							aria-required="true"
							id="weightKg"
							mask={decimalMask}
							onChange={(v) => update("weightKg", v)}
							placeholder="Ex: 2,5"
							value={values.weightKg}
						/>
						{errors.weightKg && (
							<p className="text-destructive text-xs">{errors.weightKg}</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="lengthCm">
							Comprimento (cm)
							<span className="text-destructive"> *</span>
						</Label>
						<MaskedInput
							aria-invalid={errors.lengthCm ? true : undefined}
							aria-required="true"
							id="lengthCm"
							mask={decimalMask}
							onChange={(v) => update("lengthCm", v)}
							placeholder="Ex: 30"
							value={values.lengthCm}
						/>
						{errors.lengthCm && (
							<p className="text-destructive text-xs">{errors.lengthCm}</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="widthCm">
							Largura (cm)
							<span className="text-destructive"> *</span>
						</Label>
						<MaskedInput
							aria-invalid={errors.widthCm ? true : undefined}
							aria-required="true"
							id="widthCm"
							mask={decimalMask}
							onChange={(v) => update("widthCm", v)}
							placeholder="Ex: 10"
							value={values.widthCm}
						/>
						{errors.widthCm && (
							<p className="text-destructive text-xs">{errors.widthCm}</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="heightCm">
							Altura (cm)
							<span className="text-destructive"> *</span>
						</Label>
						<MaskedInput
							aria-invalid={errors.heightCm ? true : undefined}
							aria-required="true"
							id="heightCm"
							mask={decimalMask}
							onChange={(v) => update("heightCm", v)}
							placeholder="Ex: 20"
							value={values.heightCm}
						/>
						{errors.heightCm && (
							<p className="text-destructive text-xs">{errors.heightCm}</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="powerWatts">Potência (W)</Label>
						<MaskedInput
							id="powerWatts"
							mask={integerMask}
							onChange={(v) => update("powerWatts", v)}
							placeholder="Ex: 700"
							value={values.powerWatts}
						/>
					</div>
				</div>
				{exceedsShippingLimit && (
					<div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
						<div className="flex items-start gap-2">
							<TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
							<p className="text-foreground text-xs leading-relaxed">
								Esta ferramenta excede os limites de cotação do SuperFrete (máx.
								30 kg e 100 cm por lado). A loja não conseguirá cotar o frete
								automaticamente para itens assim — o custo real do envio pode
								sair <strong>mais caro do que o cliente pagou</strong>. Defina
								um frete fixo abaixo ou trate manualmente.
							</p>
						</div>
						<div className="flex max-w-xs flex-col gap-2">
							<Label htmlFor="overweightShippingAmount">
								Frete para item pesado (R$)
							</Label>
							<MaskedInput
								id="overweightShippingAmount"
								mask={decimalMask}
								onChange={(v) => update("overweightShippingAmount", v)}
								placeholder="Ex: 250,00"
								value={values.overweightShippingAmount}
							/>
							<p className="text-muted-foreground text-xs">
								Cobrado no lugar da cotação automática. Em branco = "Frete a
								combinar" na loja.
							</p>
						</div>
					</div>
				)}
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
						Identificação fiscal
					</h2>
					<p className="text-muted-foreground text-xs">
						Códigos e nomes usados em nota fiscal, importação e relacionamento
						com o fabricante.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="model">Modelo comercial</Label>
						<Input
							id="model"
							onChange={(e) => update("model", e.target.value)}
							placeholder="Ex: ELT 800"
							value={values.model ?? ""}
						/>
						<p className="text-muted-foreground text-xs">
							Nome curto pra catálogo e busca interna.
						</p>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="invoiceModel">Modelo da fábrica</Label>
						<Input
							id="invoiceModel"
							onChange={(e) => update("invoiceModel", e.target.value)}
							placeholder="Ex: FG-S225L-3-220V"
							value={values.invoiceModel ?? ""}
						/>
						<p className="text-muted-foreground text-xs">
							Identificação completa usada em invoice/importação.
						</p>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="manufacturerName">Marca / fabricante</Label>
					<Input
						id="manufacturerName"
						onChange={(e) => update("manufacturerName", e.target.value)}
						placeholder="Ex: Bosch, Makita"
						value={values.manufacturerName ?? ""}
					/>
				</div>
				<div className="grid gap-4 border-border border-t pt-4 md:grid-cols-3">
					<div className="flex flex-col gap-2">
						<Label htmlFor="ncm">NCM</Label>
						<MaskedInput
							id="ncm"
							mask={ncmMask}
							onChange={(v) => update("ncm", v ?? "")}
							value={values.ncm ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="cest">CEST</Label>
						<MaskedInput
							id="cest"
							mask={cestMask}
							onChange={(v) => update("cest", v ?? "")}
							value={values.cest ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="hsCode">HS Code</Label>
						<MaskedInput
							id="hsCode"
							mask={hsCodeMask}
							onChange={(v) => update("hsCode", v ?? "")}
							value={values.hsCode ?? ""}
						/>
						<p className="text-muted-foreground text-xs">
							Código aduaneiro usado em importação.
						</p>
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
						Imagens · {values.images.length} de {MAX_IMAGES}
					</h2>
					<p className="text-muted-foreground text-xs">
						Primeira imagem é a capa. Status "Ativo" exige no mínimo{" "}
						{MIN_IMAGES_ACTIVE} imagens.
					</p>
				</div>
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
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
						Publicação
					</h2>
					<p className="text-muted-foreground text-xs">
						Define se a ferramenta aparece no site e em qual estado.
					</p>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="status">
							Status
							<span className="text-destructive"> *</span>
						</Label>
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
								<SelectGroup>
									{TOOL_STATUS_OPTIONS.map((s) => (
										<SelectItem key={s} value={s}>
											{TOOL_STATUS_LABELS[s]}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							"Ativo" exige {MIN_IMAGES_ACTIVE} imagens.
						</p>
					</div>
					<div className="flex items-center justify-between">
						<Label htmlFor="visibleOnSite">Visível no site</Label>
						<Switch
							checked={values.visibleOnSite}
							id="visibleOnSite"
							onCheckedChange={(checked) => update("visibleOnSite", checked)}
						/>
					</div>
				</div>
			</section>

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
