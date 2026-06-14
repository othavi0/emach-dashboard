"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
} from "@emach/ui/components/select";
import { Spinner } from "@emach/ui/components/spinner";
import { Switch } from "@emach/ui/components/switch";
import { Textarea } from "@emach/ui/components/textarea";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FieldError } from "@/components/field-error";
import { type FieldErrorMap, useFormErrors } from "@/lib/form-errors";
import { notify } from "@/lib/notify";

import { slugifyLabel } from "../_lib/attribute-schema";
import { breadcrumbFromPath, buildNameBySlug } from "../_lib/category-tree";
import {
	type CategoryListItem,
	createCategory,
	updateCategory,
} from "../actions";
import { type CategoryInput, categorySchema } from "../schema";

const NO_PARENT = "__none__";

interface CategoryFormProps {
	categories: CategoryListItem[];
	categoryId?: string;
	defaultValues: Partial<CategoryInput> & { id?: string; path?: string };
	mode: "create" | "edit";
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
	return <>{mode === "create" ? "Criar categoria" : "Salvar alterações"}</>;
}

// slug é oculto e derivado do nome: erro de slug aparece sob o campo Nome
// (e a chave `slug` é omitida do mapa via destructuring). Passado como
// `transform` ao hook, mantendo a tripla setErrors+toast+foco dentro dele.
function remapSlugToName(
	fieldErrors: FieldErrorMap<CategoryInput>
): FieldErrorMap<CategoryInput> {
	const { slug, ...rest } = fieldErrors;
	if (slug && !rest.name) {
		rest.name =
			"O nome não gera um identificador válido — use letras ou números.";
	}
	return rest;
}

export function CategoryForm({
	categories,
	categoryId,
	defaultValues,
	mode,
}: CategoryFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState(defaultValues.name ?? "");
	const [slug, setSlug] = useState(defaultValues.slug ?? "");
	const [parentId, setParentId] = useState<string>(
		defaultValues.parentId ?? NO_PARENT
	);
	const [description, setDescription] = useState(
		defaultValues.description ?? ""
	);
	const [isActive, setIsActive] = useState(defaultValues.isActive ?? true);
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<CategoryInput>();

	const nameBySlug = buildNameBySlug(categories);

	const ownPath = defaultValues.path ?? "";
	const parentOptions =
		mode === "edit" && defaultValues.id
			? categories.filter(
					(c) =>
						c.id !== defaultValues.id &&
						(ownPath === "" || !c.path.startsWith(`${ownPath}/`))
				)
			: categories;

	const selectedParent =
		parentId === NO_PARENT
			? null
			: (categories.find((c) => c.id === parentId) ?? null);

	const parentSegments = selectedParent
		? breadcrumbFromPath(selectedParent.path, nameBySlug)
		: [];
	const placement = [
		...(selectedParent ? parentSegments : ["Raiz"]),
		name.trim() || "…",
	].join(" › ");
	// Rótulo do trigger: breadcrumb do pai; cai pro nome se o path tiver slug
	// órfão (ex: drift de dados) — nunca renderiza string vazia.
	let parentLabel: string | null = null;
	if (selectedParent) {
		parentLabel =
			parentSegments.length > 0
				? parentSegments.join(" › ")
				: selectedParent.name;
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		clearErrors();

		const parsed = categorySchema.safeParse({
			name,
			slug,
			parentId: parentId === NO_PARENT ? null : parentId,
			description: description.trim() === "" ? null : description,
			isActive,
		});

		if (!parsed.success) {
			reportValidationError(parsed.error, remapSlugToName);
			return;
		}

		startTransition(async () => {
			if (mode === "create") {
				const result = await createCategory(parsed.data);
				if (result.ok) {
					notify.success("Categoria criada");
					router.push(`/dashboard/categories/${result.data.id}/edit`);
					router.refresh();
				} else {
					notify.error(result.error || "Não foi possível salvar a categoria");
				}
			} else {
				const result = await updateCategory(categoryId ?? "", parsed.data);
				if (result.ok) {
					notify.success("Categoria atualizada");
					router.push("/dashboard/categories");
					router.refresh();
				} else {
					notify.error(result.error || "Não foi possível salvar a categoria");
				}
			}
		});
	}

	return (
		<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Informações básicas
				</h2>

				<div className="flex flex-col gap-2">
					<Label htmlFor="category-name">
						Nome
						<span className="text-destructive"> *</span>
					</Label>
					<Input
						aria-invalid={errors.name ? true : undefined}
						disabled={isPending}
						id="category-name"
						onChange={(event) => {
							const next = event.target.value;
							setName(next);
							if (mode === "create") {
								setSlug(slugifyLabel(next));
							}
						}}
						placeholder="Ex: Furadeiras"
						value={name}
					/>
					<FieldError>{errors.name}</FieldError>
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="category-description">Descrição (opcional)</Label>
					<Textarea
						aria-invalid={errors.description ? true : undefined}
						disabled={isPending}
						id="category-description"
						onChange={(event) => setDescription(event.target.value)}
						placeholder="Texto curto explicando a categoria"
						rows={3}
						value={description}
					/>
					<FieldError>{errors.description}</FieldError>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Hierarquia e exibição
				</h2>

				<div className="flex flex-col gap-2">
					<Label htmlFor="category-parent">Categoria pai</Label>
					<Select
						disabled={isPending}
						onValueChange={(value) => setParentId(value ?? NO_PARENT)}
						value={parentId}
					>
						<SelectTrigger id="category-parent">
							{parentLabel ?? (
								<span className="text-muted-foreground">Nenhuma (raiz)</span>
							)}
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={NO_PARENT}>Nenhuma (raiz)</SelectItem>
								{parentOptions.map((c) => (
									<SelectItem
										className={c.depth === 0 ? "font-semibold" : undefined}
										key={c.id}
										style={{ paddingLeft: `${0.5 + c.depth * 0.9}rem` }}
										value={c.id}
									>
										{c.depth > 0 && (
											<span aria-hidden className="text-muted-foreground/70">
												└{" "}
											</span>
										)}
										{c.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<p className="text-muted-foreground text-xs">
						Onde fica: <span className="text-foreground">{placement}</span>
					</p>
				</div>

				<div className="flex items-center gap-3">
					<Switch
						checked={isActive}
						disabled={isPending}
						id="category-active"
						onCheckedChange={setIsActive}
					/>
					<Label htmlFor="category-active">Ativa (visível no site)</Label>
				</div>
			</section>

			<div className="flex items-center gap-3">
				<Button disabled={isPending} type="submit">
					<SubmitLabel isPending={isPending} mode={mode} />
				</Button>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href="/dashboard/categories"
				>
					Cancelar
				</Link>
			</div>
		</form>
	);
}
