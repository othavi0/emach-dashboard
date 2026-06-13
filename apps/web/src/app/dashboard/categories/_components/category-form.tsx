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
import type { ZodError } from "zod";

import { FormErrorPanel, type FormIssue } from "@/components/form-error-panel";
import { notify } from "@/lib/notify";

import { slugifyLabel } from "../_lib/attribute-schema";
import { breadcrumbFromPath, buildNameBySlug } from "../_lib/category-tree";
import {
	type CategoryListItem,
	createCategory,
	updateCategory,
} from "../actions";
import { type CategoryInput, categorySchema } from "../schema";

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	slug: "Nome",
	parentId: "Categoria pai",
	description: "Descrição",
	isActive: "Ativa",
};

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

function zodErrorsToFieldMap(
	error: ZodError<CategoryInput>
): Partial<Record<keyof CategoryInput, string>> {
	const map: Partial<Record<keyof CategoryInput, string>> = {};
	for (const issue of error.issues) {
		const key = issue.path[0] as keyof CategoryInput | undefined;
		if (key && !map[key]) {
			map[key] = issue.message;
		}
	}
	return map;
}

// Build the panel issue list from a ZodError, remapping slug errors
// (slug is hidden and derived from name) to a user-facing "Nome" message.
// Iterates error.issues directly to avoid positional coupling with zodIssuesToFormIssues.
function buildFormIssues(error: ZodError<CategoryInput>): FormIssue[] {
	let slugSeen = false;
	return error.issues.flatMap((issue) => {
		if (issue.path[0] === "slug") {
			if (slugSeen) {
				return [];
			}
			slugSeen = true;
			return [
				{
					path: "Nome",
					message:
						"O nome não gera um identificador válido — use letras ou números.",
				},
			];
		}
		const head = String(issue.path[0]);
		return [{ path: FIELD_LABELS[head] ?? head, message: issue.message }];
	});
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
	const [errors, setErrors] = useState<
		Partial<Record<keyof CategoryInput, string>>
	>({});
	const [formIssues, setFormIssues] = useState<FormIssue[]>([]);

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
		: ["Raiz"];
	const placement = [...parentSegments, name.trim() || "…"].join(" › ");

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});
		setFormIssues([]);

		const parsed = categorySchema.safeParse({
			name,
			slug,
			parentId: parentId === NO_PARENT ? null : parentId,
			description: description.trim() === "" ? null : description,
			isActive,
		});

		if (!parsed.success) {
			setErrors(zodErrorsToFieldMap(parsed.error));
			const issues = buildFormIssues(parsed.error);
			setFormIssues(issues);
			notify.error(
				`${issues.length} ${issues.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
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
			<FormErrorPanel issues={formIssues} />

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
					{errors.name && (
						<p className="text-destructive text-sm">{errors.name}</p>
					)}
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="category-description">Descrição (opcional)</Label>
					<Textarea
						disabled={isPending}
						id="category-description"
						onChange={(event) => setDescription(event.target.value)}
						placeholder="Texto curto explicando a categoria"
						rows={3}
						value={description}
					/>
					{errors.description && (
						<p className="text-destructive text-sm">{errors.description}</p>
					)}
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
							{selectedParent ? (
								breadcrumbFromPath(selectedParent.path, nameBySlug).join(" › ")
							) : (
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
