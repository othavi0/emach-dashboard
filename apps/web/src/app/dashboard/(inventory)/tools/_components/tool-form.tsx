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
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ZodError } from "zod";

import { createTool, updateTool } from "../actions";
import { ToolImageUpload } from "./tool-image-upload";
import {
	slugify,
	type ToolFormValues,
	toolFormSchema,
	VOLTAGE_OPTIONS,
} from "./tool-schema";

interface CategoryOption {
	id: string;
	name: string;
}

interface SupplierOption {
	id: string;
	name: string;
}

interface ToolFormProps {
	categories: CategoryOption[];
	defaultValues: Partial<ToolFormValues>;
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

function parseBRLToReais(display: string): number | undefined {
	const digits = display.replace(/\D/g, "");
	if (!digits) {
		return;
	}
	return Number(digits) / 100;
}

const EMPTY_VALUES: ToolFormValues = {
	name: "",
	slug: "",
	description: "",
	sku: "",
	voltage: "" as (typeof VOLTAGE_OPTIONS)[number] | "",
	price: undefined,
	cost: undefined,
	categoryId: "",
	supplierId: "",
	visibleOnSite: true,
	imageUrl: "",
};

export function ToolForm({
	mode,
	toolId,
	defaultValues,
	categories,
	suppliers,
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
	const [slugTouched, setSlugTouched] = useState(mode === "edit");

	useEffect(() => {
		if (!slugTouched && values.name) {
			setValues((prev) => ({ ...prev, slug: slugify(prev.name) }));
		}
	}, [values.name, slugTouched]);

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
				if (mode === "create") {
					await createTool(result.data);
					toast.success("Ferramenta criada com sucesso");
				} else if (toolId) {
					await updateTool(toolId, result.data);
					toast.success("Ferramenta atualizada com sucesso");
				}
				router.push("/dashboard/tools");
				router.refresh();
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Erro desconhecido";
				toast.error(`Falha ao salvar: ${message}`);
			}
		});
	}

	return (
		<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
			<div className="grid gap-6 md:grid-cols-[1fr_auto]">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="name">Nome</Label>
						<Input
							id="name"
							onChange={(e) => update("name", e.target.value)}
							placeholder="Ex: Furadeira de impacto 700W"
							value={values.name}
						/>
						{errors.name && (
							<p className="text-destructive text-xs">{errors.name}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="slug">Slug</Label>
						<Input
							id="slug"
							onChange={(e) => {
								setSlugTouched(true);
								update("slug", e.target.value);
							}}
							placeholder="gerado-automaticamente-do-nome"
							value={values.slug}
						/>
						{errors.slug && (
							<p className="text-destructive text-xs">{errors.slug}</p>
						)}
					</div>

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
						<Label htmlFor="description">Descrição</Label>
						<Textarea
							id="description"
							onChange={(e) => update("description", e.target.value)}
							placeholder="Descreva especificações técnicas, destaques e uso recomendado."
							rows={4}
							value={values.description ?? ""}
						/>
					</div>
				</div>

				<ToolImageUpload
					onChange={(url) => update("imageUrl", url)}
					value={values.imageUrl}
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
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

			<div className="grid gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-2">
					<Label htmlFor="categoryId">Categoria</Label>
					<Select
						onValueChange={(v) => update("categoryId", v ?? "")}
						value={values.categoryId}
					>
						<SelectTrigger id="categoryId">
							<SelectValue placeholder="Selecione uma categoria">
								{(v: string) =>
									categories.find((c) => c.id === v)?.name ??
									"Selecione uma categoria"
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{categories.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{errors.categoryId && (
						<p className="text-destructive text-xs">{errors.categoryId}</p>
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

			<div className="flex items-center gap-3">
				<Switch
					checked={values.visibleOnSite}
					id="visibleOnSite"
					onCheckedChange={(checked) => update("visibleOnSite", checked)}
				/>
				<Label htmlFor="visibleOnSite">Visível no site público</Label>
			</div>

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
