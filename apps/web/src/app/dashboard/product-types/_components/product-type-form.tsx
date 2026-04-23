"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ZodError } from "zod";

import { createProductType, updateProductType } from "../actions";
import {
	type ProductTypeFormValues,
	productTypeSchema,
	slugify,
} from "./product-type-schema";

interface ProductTypeFormProps {
	productTypeId?: string;
	defaultValues: Partial<ProductTypeFormValues>;
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

	return <>{mode === "create" ? "Criar tipo" : "Salvar alterações"}</>;
}

function zodErrorsToFieldMap(
	error: ZodError<ProductTypeFormValues>
): Partial<Record<keyof ProductTypeFormValues, string>> {
	const map: Partial<Record<keyof ProductTypeFormValues, string>> = {};
	for (const issue of error.issues) {
		const key = issue.path[0] as keyof ProductTypeFormValues | undefined;
		if (key && !map[key]) {
			map[key] = issue.message;
		}
	}
	return map;
}

export function ProductTypeForm({
	productTypeId,
	defaultValues,
	existingSlug,
	mode,
}: ProductTypeFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState(defaultValues.name ?? "");
	const [description, setDescription] = useState(
		defaultValues.description ?? ""
	);
	const [errors, setErrors] = useState<
		Partial<Record<keyof ProductTypeFormValues, string>>
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

		const parsed = productTypeSchema.safeParse({
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
					? createProductType(parsed.data)
					: updateProductType(productTypeId ?? "", parsed.data);
			const result = await action;

			if (result.ok) {
				toast.success(
					mode === "create" ? "Tipo de produto criado" : "Tipo atualizado"
				);
				router.push("/dashboard/product-types");
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível salvar o tipo");
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
					<Label htmlFor="product-type-name">Nome</Label>
					<Input
						disabled={isPending}
						id="product-type-name"
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
					<Label htmlFor="product-type-description">Descrição (opcional)</Label>
					<Textarea
						disabled={isPending}
						id="product-type-description"
						onChange={(event) => setDescription(event.target.value)}
						placeholder="Resumo interno sobre este tipo de ferramenta."
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
					href="/dashboard/product-types"
				>
					Cancelar
				</Link>
			</div>
		</form>
	);
}
