"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";

import { createSupplier, updateSupplier } from "../actions";
import { SupplierFormFields } from "./supplier-form-fields";
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

export function SupplierForm({
	defaultValues,
	mode,
	supplierId,
}: SupplierFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<SupplierFormValues>({
		name: defaultValues.name ?? "",
		contactEmail: defaultValues.contactEmail ?? "",
		phone: defaultValues.phone ?? "",
		website: defaultValues.website ?? "",
		cnpj: defaultValues.cnpj ?? "",
		notes: defaultValues.notes ?? "",
	});
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<SupplierFormValues>();

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		clearErrors();

		const parsed = supplierSchema.safeParse(values);

		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}

		startTransition(async () => {
			const action =
				mode === "create"
					? createSupplier(parsed.data)
					: updateSupplier(supplierId ?? "", parsed.data);
			const result = await action;

			if (result.ok) {
				notify.success(
					mode === "create" ? "Fornecedor criado" : "Fornecedor atualizado"
				);
				router.push("/dashboard/suppliers");
				router.refresh();
			} else {
				notify.error(result.error || "Não foi possível salvar o fornecedor");
			}
		});
	}

	return (
		<form
			className="flex w-full max-w-2xl flex-col gap-6"
			onSubmit={handleSubmit}
		>
			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Informações básicas
				</h2>
				<SupplierFormFields
					disabled={isPending}
					errors={errors}
					onPatch={(p) => setValues((v) => ({ ...v, ...p }))}
					values={values}
				/>
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
