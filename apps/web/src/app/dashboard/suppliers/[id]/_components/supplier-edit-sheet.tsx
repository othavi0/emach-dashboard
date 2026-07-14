"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { SupplierFormFields } from "../../_components/supplier-form-fields";
import {
	type SupplierFormValues,
	supplierSchema,
} from "../../_components/supplier-schema";
import { updateSupplier } from "../../actions";
import type { SupplierDetail } from "../../data";

interface Props {
	supplier: SupplierDetail;
}

export function SupplierEditSheet({ supplier }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [values, setValues] = useState<SupplierFormValues>({
		name: supplier.name,
		contactEmail: supplier.contactEmail ?? "",
		phone: supplier.phone ?? "",
		website: supplier.website ?? "",
		cnpj: supplier.cnpj ?? "",
		notes: supplier.notes ?? "",
	});
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<SupplierFormValues>();
	const [submitting, startTransition] = useTransition();

	// Reset síncrono durante o render (padrão "adjusting state when a prop
	// changes") — sem o re-render extra do reset via effect.
	const [lastReset, setLastReset] = useState({ open, supplier });
	if (lastReset.open !== open || lastReset.supplier !== supplier) {
		setLastReset({ open, supplier });
		if (open) {
			setValues({
				name: supplier.name,
				contactEmail: supplier.contactEmail ?? "",
				phone: supplier.phone ?? "",
				website: supplier.website ?? "",
				cnpj: supplier.cnpj ?? "",
				notes: supplier.notes ?? "",
			});
			clearErrors();
		}
	}

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = supplierSchema.safeParse(values);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const res = await updateSupplier(supplier.id, parsed.data);
			if (res.ok) {
				notify.success("Fornecedor atualizado");
				close();
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize os dados do fornecedor"
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${supplier.name}`}
		>
			<SupplierFormFields
				disabled={submitting}
				errors={errors}
				onPatch={(p) => setValues((v) => ({ ...v, ...p }))}
				values={values}
			/>
		</EntityEditSheet>
	);
}
