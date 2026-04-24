"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
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
import { ToolImageGallery } from "./tool-image-gallery";
import {
	MAX_IMAGES,
	MIN_IMAGES_ACTIVE,
	slugify,
	TOOL_STATUS_LABELS,
	TOOL_STATUS_OPTIONS,
	type ToolFormValues,
	toolFormSchema,
	VOLTAGE_OPTIONS,
} from "./tool-schema";

interface ProductTypeOption {
	id: string;
	name: string;
}

interface SupplierOption {
	id: string;
	name: string;
}

interface ToolFormProps {
	defaultValues: Partial<ToolFormValues>;
	existingSlug?: string;
	mode: "create" | "edit";
	productTypes: ProductTypeOption[];
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

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function formatBRL(reais: number | undefined): string {
	if (reais === undefined || Number.isNaN(reais)) {
		return "";
	}
	return BRL_FORMATTER.format(reais);
}

function parseDecimal(display: string): number | undefined {
	const cleaned = display.replace(",", ".").replace(/[^\d.]/g, "");
	if (!cleaned) {
		return;
	}
	const n = Number(cleaned);
	return Number.isNaN(n) ? undefined : n;
}

function parseBRLToReais(display: string): number | undefined {
	const digits = display.replace(/\D/g, "");
	if (!digits) {
		return;
	}
	return Number(digits) / 100;
}

const EMPTY_VALUES: ToolFormValues = {
	name: "",
	description: "",
	sku: "",
	model: "",
	invoiceModel: "",
	barcode: "",
	manufacturerName: "",
	countryOfOrigin: "",
	status: "draft",
	hsCode: "",
	ncm: "",
	cest: "",
	voltage: "",
	powerWatts: undefined,
	frequencyHz: undefined,
	warrantyMonths: undefined,
	weightKg: undefined,
	lengthCm: undefined,
	widthCm: undefined,
	heightCm: undefined,
	price: undefined,
	cost: undefined,
	productTypeId: "",
	supplierId: "",
	visibleOnSite: true,
	images: [],
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: form monolítico com múltiplas seções; refactor em docs/plano-melhorias.md
export function ToolForm({
	mode,
	toolId,
	defaultValues,
	productTypes,
	suppliers,
	existingSlug,
}: ToolFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<ToolFormValues>({
		...EMPTY_VALUES,
		...defaultValues,
	});
	const [errors, setErrors] = useState<
		Partial<Record<keyof ToolFormValues, string>>
	>({});

	const slugPreview = useMemo(() => {
		if (mode === "edit" && existingSlug) {
			return existingSlug;
		}
		return slugify(values.name) || "—";
	}, [mode, existingSlug, values.name]);

	function update<K extends keyof ToolFormValues>(
		key: K,
		value: ToolFormValues[K]
	) {
		setValues((prev) => ({ ...prev, [key]: value }));
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
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

		startTransition(async () => {
			try {
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

				toast.error(actionResult.error || "Falha ao salvar a ferramenta");
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Erro desconhecido";
				toast.error(`Falha ao salvar: ${message}`);
			}
		});
	}

	return (
		<form className="flex w-full flex-col gap-6" onSubmit={handleSubmit}>
			<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
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

				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="sku">SKU</Label>
						<Input
							id="sku"
							onChange={(e) => update("sku", e.target.value)}
							placeholder="Ex: FUR-700-BSH"
							value={values.sku}
						/>
						{errors.sku && (
							<p className="text-destructive text-xs">{errors.sku}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="voltage">Voltagem</Label>
						<Select
							onValueChange={(v) =>
								update("voltage", v as (typeof VOLTAGE_OPTIONS)[number])
							}
							value={values.voltage ?? ""}
						>
							<SelectTrigger id="voltage">
								<SelectValue placeholder="Selecione" />
							</SelectTrigger>
							<SelectContent>
								{VOLTAGE_OPTIONS.map((v) => (
									<SelectItem key={v} value={v}>
										{v}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="description">Descrição</Label>
					<Textarea
						id="description"
						onChange={(e) => update("description", e.target.value)}
						placeholder="Descreva especificações técnicas, destaques e uso recomendado."
						rows={4}
						value={values.description ?? ""}
					/>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
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

				<div className="grid gap-4 md:grid-cols-3">
					<div className="flex flex-col gap-2">
						<Label htmlFor="barcode">Barcode (EAN/GTIN)</Label>
						<Input
							id="barcode"
							onChange={(e) => update("barcode", e.target.value)}
							value={values.barcode ?? ""}
						/>
					</div>

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

			<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Classificação fiscal
				</h2>

				<div className="flex flex-col gap-2">
					<Label htmlFor="hsCode">HS Code (invoice)</Label>
					<Input
						id="hsCode"
						onChange={(e) => update("hsCode", e.target.value)}
						placeholder="Ex: 8467291000"
						value={values.hsCode ?? ""}
					/>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
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
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Dimensões & peso
				</h2>

				<div className="grid gap-4 md:grid-cols-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="weightKg">Peso (kg)</Label>
						<Input
							id="weightKg"
							inputMode="decimal"
							onChange={(e) => update("weightKg", parseDecimal(e.target.value))}
							value={values.weightKg ?? ""}
						/>
						{errors.weightKg && (
							<p className="text-destructive text-xs">{errors.weightKg}</p>
						)}
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
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Especificações técnicas
				</h2>

				<div className="grid gap-4 md:grid-cols-3">
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

					<div className="flex flex-col gap-2">
						<Label htmlFor="frequencyHz">Frequência (Hz)</Label>
						<Input
							id="frequencyHz"
							inputMode="numeric"
							onChange={(e) =>
								update("frequencyHz", parseDecimal(e.target.value))
							}
							value={values.frequencyHz ?? ""}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="warrantyMonths">Garantia (meses)</Label>
						<Input
							id="warrantyMonths"
							inputMode="numeric"
							onChange={(e) =>
								update("warrantyMonths", parseDecimal(e.target.value))
							}
							value={values.warrantyMonths ?? ""}
						/>
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
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

			<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Preço
				</h2>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="price">Preço</Label>
						<Input
							id="price"
							inputMode="numeric"
							onChange={(e) => update("price", parseBRLToReais(e.target.value))}
							placeholder="R$ 0,00"
							value={formatBRL(values.price)}
						/>
						{errors.price && (
							<p className="text-destructive text-xs">{errors.price}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="cost">Custo</Label>
						<Input
							id="cost"
							inputMode="numeric"
							onChange={(e) => update("cost", parseBRLToReais(e.target.value))}
							placeholder="R$ 0,00"
							value={formatBRL(values.cost)}
						/>
						{errors.cost && (
							<p className="text-destructive text-xs">{errors.cost}</p>
						)}
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Classificação
				</h2>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="productTypeId">Tipo de produto</Label>
						<Select
							onValueChange={(v) => update("productTypeId", v ?? "")}
							value={values.productTypeId}
						>
							<SelectTrigger id="productTypeId">
								<SelectValue placeholder="Selecione um tipo">
									{(v: string) =>
										productTypes.find((p) => p.id === v)?.name ??
										"Selecione um tipo"
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{productTypes.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{errors.productTypeId && (
							<p className="text-destructive text-xs">{errors.productTypeId}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="supplierId">Fornecedor</Label>
						<Select
							onValueChange={(v) => update("supplierId", v ?? "")}
							value={values.supplierId ?? ""}
						>
							<SelectTrigger id="supplierId">
								<SelectValue placeholder="Opcional">
									{(v: string) =>
										suppliers.find((s) => s.id === v)?.name ?? "Opcional"
									}
								</SelectValue>
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
