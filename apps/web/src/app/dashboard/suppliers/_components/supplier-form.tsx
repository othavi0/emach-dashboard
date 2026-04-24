"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ZodError } from "zod";

import { createSupplier, updateSupplier } from "../actions";
import { type SupplierFormValues, supplierSchema } from "./supplier-schema";

interface SupplierFormProps {
	defaultValues: Partial<SupplierFormValues>;
	mode: "create" | "edit";
	supplierId?: string;
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

	return <>{mode === "create" ? "Criar fornecedor" : "Salvar alterações"}</>;
}

function zodErrorsToFieldMap(
	error: ZodError<SupplierFormValues>
): Partial<Record<keyof SupplierFormValues, string>> {
	const map: Partial<Record<keyof SupplierFormValues, string>> = {};
	for (const issue of error.issues) {
		const key = issue.path[0] as keyof SupplierFormValues | undefined;
		if (key && !map[key]) {
			map[key] = issue.message;
		}
	}
	return map;
}

export function SupplierForm({
	defaultValues,
	mode,
	supplierId,
}: SupplierFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState(defaultValues.name ?? "");
	const [contactEmail, setContactEmail] = useState(
		defaultValues.contactEmail ?? ""
	);
	const [phone, setPhone] = useState(defaultValues.phone ?? "");
	const [notes, setNotes] = useState(defaultValues.notes ?? "");
	const [errors, setErrors] = useState<
		Partial<Record<keyof SupplierFormValues, string>>
	>({});

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});

		const parsed = supplierSchema.safeParse({
			name,
			contactEmail,
			phone,
			notes,
		});

		if (!parsed.success) {
			setErrors(zodErrorsToFieldMap(parsed.error));
			return;
		}

		startTransition(async () => {
			const action =
				mode === "create"
					? createSupplier(parsed.data)
					: updateSupplier(supplierId ?? "", parsed.data);
			const result = await action;

			if (result.ok) {
				toast.success(
					mode === "create" ? "Fornecedor criado" : "Fornecedor atualizado"
				);
				router.push("/dashboard/suppliers");
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível salvar o fornecedor");
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
					<Label htmlFor="supplier-name">Nome</Label>
					<Input
						disabled={isPending}
						id="supplier-name"
						onChange={(event) => setName(event.target.value)}
						placeholder="Ex: Bosch Brasil"
						value={name}
					/>
					{errors.name && (
						<p className="text-destructive text-sm">{errors.name}</p>
					)}
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="supplier-email">E-mail (opcional)</Label>
						<Input
							disabled={isPending}
							id="supplier-email"
							onChange={(event) => setContactEmail(event.target.value)}
							placeholder="contato@fornecedor.com"
							type="email"
							value={contactEmail}
						/>
						{errors.contactEmail && (
							<p className="text-destructive text-sm">{errors.contactEmail}</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="supplier-phone">Telefone (opcional)</Label>
						<Input
							disabled={isPending}
							id="supplier-phone"
							onChange={(event) => setPhone(event.target.value)}
							placeholder="(11) 99999-9999"
							value={phone}
						/>
						{errors.phone && (
							<p className="text-destructive text-sm">{errors.phone}</p>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="supplier-notes">Observações (opcional)</Label>
					<Textarea
						disabled={isPending}
						id="supplier-notes"
						onChange={(event) => setNotes(event.target.value)}
						placeholder="Condições comerciais, contato responsável ou instruções internas."
						rows={5}
						value={notes}
					/>
					{errors.notes && (
						<p className="text-destructive text-sm">{errors.notes}</p>
					)}
				</div>
			</section>

			<div className="flex items-center gap-3">
				<Button disabled={isPending} type="submit">
					<SubmitLabel isPending={isPending} mode={mode} />
				</Button>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href="/dashboard/suppliers"
				>
					Cancelar
				</Link>
			</div>
		</form>
	);
}
