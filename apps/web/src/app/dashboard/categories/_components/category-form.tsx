"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ZodError } from "zod";
import {
	FormErrorPanel,
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { notify } from "@/lib/notify";

import { slugifyLabel, validateSlugFormat } from "../_lib/attribute-schema";
import {
	type CategoryListItem,
	createCategory,
	updateCategory,
} from "../actions";
import { type CategoryInput, categorySchema } from "../schema";

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	slug: "Slug",
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

	const ownPath = defaultValues.path ?? "";
	const parentOptions =
		mode === "edit" && defaultValues.id
			? categories.filter(
					(c) =>
						c.id !== defaultValues.id &&
						(ownPath === "" || !c.path.startsWith(`${ownPath}/`))
				)
			: categories;

	const pathPreview =
		parentId === NO_PARENT
			? `/${slug || "…"}`
			: `${categories.find((c) => c.id === parentId)?.path ?? ""}/${slug || "…"}`;

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
			const issues = zodIssuesToFormIssues(parsed.error, FIELD_LABELS);
			setFormIssues(issues);
			notify.error(
				`${issues.length} ${issues.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
			return;
		}

		startTransition(async () => {
			const result =
				mode === "create"
					? await createCategory(parsed.data)
					: await updateCategory(categoryId ?? "", parsed.data);

			if (result.ok) {
				notify.success(
					mode === "create" ? "Categoria criada" : "Categoria atualizada"
				);
				router.push("/dashboard/categories");
				router.refresh();
			} else {
				notify.error(result.error || "Não foi possível salvar a categoria");
			}
		});
	}

	return (
		<form
			className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)]"
			onSubmit={handleSubmit}
		>
			<div className="flex flex-col gap-4">
				<FormErrorPanel issues={formIssues} />

				<Card>
					<CardHeader>
						<CardTitle>Informações básicas</CardTitle>
						<CardDescription>Nome, identificador e descrição.</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
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
							<Label htmlFor="category-slug">
								Slug
								<span className="text-destructive"> *</span>
							</Label>
							<Input
								aria-invalid={errors.slug ? true : undefined}
								disabled={isPending || mode === "create"}
								id="category-slug"
								onBlur={() => {
									if (mode === "edit") {
										const err = validateSlugFormat(slug);
										setErrors((prev) => ({ ...prev, slug: err ?? undefined }));
									}
								}}
								onChange={(event) => setSlug(event.target.value)}
								placeholder="furadeiras"
								value={slug}
							/>
							<p className="text-muted-foreground text-xs">
								{mode === "create"
									? "Gerado automaticamente a partir do nome."
									: "Atenção: alterar o slug pode quebrar URLs salvas."}
							</p>
							{errors.slug && (
								<p className="text-destructive text-sm">{errors.slug}</p>
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
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Hierarquia e exibição</CardTitle>
						<CardDescription>
							Posição na árvore e visibilidade. A ordem entre categorias irmãs é
							ajustada arrastando na lista.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="category-parent">Categoria pai</Label>
							<Select
								disabled={isPending}
								onValueChange={(value) => setParentId(value ?? NO_PARENT)}
								value={parentId}
							>
								<SelectTrigger id="category-parent">
									<SelectValue placeholder="Nenhuma (raiz)" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value={NO_PARENT}>Nenhuma (raiz)</SelectItem>
										{parentOptions.map((c) => (
											<SelectItem key={c.id} value={c.id}>
												{"— ".repeat(c.depth)}
												{c.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
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
					</CardContent>
				</Card>
			</div>

			<div className="flex flex-col gap-4">
				<Card>
					<CardHeader>
						<CardTitle>
							{mode === "create" ? "Criar categoria" : "Salvar alterações"}
						</CardTitle>
						<CardDescription>Pré-visualização do caminho</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<code className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
							{pathPreview}
						</code>
						<Button disabled={isPending} type="submit">
							<SubmitLabel isPending={isPending} mode={mode} />
						</Button>
						<Link
							className={buttonVariants({ variant: "ghost" })}
							href="/dashboard/categories"
						>
							Cancelar
						</Link>
					</CardContent>
				</Card>
			</div>
		</form>
	);
}
