"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ZodError } from "zod";

import { createCategory, updateCategory } from "../actions";
import {
	type CategoryFormValues,
	categorySchema,
	slugify,
} from "./category-schema";

interface CategoryFormProps {
	categoryId?: string;
	defaultValues: Partial<CategoryFormValues>;
	existingSlug?: string | null;
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
	error: ZodError<CategoryFormValues>
): Partial<Record<keyof CategoryFormValues, string>> {
	const map: Partial<Record<keyof CategoryFormValues, string>> = {};
	for (const issue of error.issues) {
		const key = issue.path[0] as keyof CategoryFormValues | undefined;
		if (key && !map[key]) {
			map[key] = issue.message;
		}
	}
	return map;
}

export function CategoryForm({
	categoryId,
	defaultValues,
	existingSlug,
	mode,
}: CategoryFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState(defaultValues.name ?? "");
	const [description, setDescription] = useState(
		defaultValues.description ?? ""
	);
	const [errors, setErrors] = useState<
		Partial<Record<keyof CategoryFormValues, string>>
	>({});

	const slugPreview = useMemo(() => {
		if (mode === "edit" && existingSlug) {
			return existingSlug;
		}
		return slugify(name) || "—";
	}, [existingSlug, mode, name]);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});

		const parsed = categorySchema.safeParse({
			name,
			description,
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
		<form className="flex w-full max-w-2xl flex-col gap-6" onSubmit={handleSubmit}>
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
					<p className="font-mono text-muted-foreground text-xs">
						Slug: {slugPreview}
					</p>
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
						placeholder="Resumo interno sobre o tipo de ferramenta desta categoria."
						rows={5}
						value={description}
					/>
					{errors.description && (
						<p className="text-destructive text-sm">{errors.description}</p>
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
