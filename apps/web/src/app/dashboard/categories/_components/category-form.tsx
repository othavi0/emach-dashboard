"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ZodError } from "zod";

import {
	type CategoryListItem,
	createCategory,
	updateCategory,
} from "../actions";
import { type CategoryInput, categorySchema } from "../schema";

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

const NO_PARENT = "__none__";

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
	const [imageUrl, setImageUrl] = useState(defaultValues.imageUrl ?? "");
	const [isActive, setIsActive] = useState(defaultValues.isActive ?? true);
	const [sortOrder, setSortOrder] = useState(
		String(defaultValues.sortOrder ?? 0)
	);
	const [errors, setErrors] = useState<
		Partial<Record<keyof CategoryInput, string>>
	>({});

	// Filtra parents possíveis: exclui a própria categoria e descendentes (evita ciclo
	// e mensagem feia do trigger). Em modo create, mostra todos.
	const ownPath = defaultValues.path ?? "";
	const parentOptions =
		mode === "edit" && defaultValues.id
			? categories.filter(
					(c) =>
						c.id !== defaultValues.id &&
						(ownPath === "" || !c.path.startsWith(`${ownPath}/`))
				)
			: categories;

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});

		const parsed = categorySchema.safeParse({
			name,
			slug,
			parentId: parentId === NO_PARENT ? null : parentId,
			description: description.trim() === "" ? null : description,
			imageUrl: imageUrl.trim() === "" ? null : imageUrl,
			isActive,
			sortOrder,
		});

		if (!parsed.success) {
			setErrors(zodErrorsToFieldMap(parsed.error));
			return;
		}

		startTransition(async () => {
			const action =
				mode === "create"
					? createCategory(parsed.data)
					: updateCategory(categoryId ?? "", parsed.data);
			const result = await action;

			if (result.ok) {
				toast.success(
					mode === "create" ? "Categoria criada" : "Categoria atualizada"
				);
				router.push("/dashboard/categories");
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível salvar a categoria");
			}
		});
	}

	return (
		<form
			className="flex w-full max-w-2xl flex-col gap-6"
			onSubmit={handleSubmit}
		>
			<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Informações básicas
				</h2>

				<div className="flex flex-col gap-2">
					<Label htmlFor="category-name">Nome</Label>
					<Input
						disabled={isPending}
						id="category-name"
						onChange={(event) => setName(event.target.value)}
						placeholder="Ex: Furadeiras"
						value={name}
					/>
					{errors.name && (
						<p className="text-destructive text-sm">{errors.name}</p>
					)}
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="category-slug">Slug</Label>
					<Input
						disabled={isPending}
						id="category-slug"
						onChange={(event) => setSlug(event.target.value)}
						placeholder="furadeiras"
						value={slug}
					/>
					{errors.slug && (
						<p className="text-destructive text-sm">{errors.slug}</p>
					)}
				</div>

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
							<SelectItem value={NO_PARENT}>Nenhuma (raiz)</SelectItem>
							{parentOptions.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{"— ".repeat(c.depth)}
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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

				<div className="flex flex-col gap-2">
					<Label htmlFor="category-image">Imagem (URL, opcional)</Label>
					<Input
						disabled={isPending}
						id="category-image"
						onChange={(event) => setImageUrl(event.target.value)}
						placeholder="https://..."
						type="url"
						value={imageUrl}
					/>
					{errors.imageUrl && (
						<p className="text-destructive text-sm">{errors.imageUrl}</p>
					)}
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

				<div className="flex flex-col gap-2">
					<Label htmlFor="category-sort">Ordem de exibição</Label>
					<Input
						disabled={isPending}
						id="category-sort"
						min={0}
						onChange={(event) => setSortOrder(event.target.value)}
						type="number"
						value={sortOrder}
					/>
					{errors.sortOrder && (
						<p className="text-destructive text-sm">{errors.sortOrder}</p>
					)}
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
