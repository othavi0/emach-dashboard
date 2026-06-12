"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { notify } from "@/lib/notify";
import { SupplierFormFields } from "../../_components/supplier-form-fields";
import {
	type SupplierFormValues,
	supplierSchema,
} from "../../_components/supplier-schema";
import { updateSupplier } from "../../actions";
import type { SupplierDetail } from "../../data";

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	contactEmail: "E-mail",
	phone: "Telefone",
	website: "Website",
	cnpj: "CNPJ",
	notes: "Observações",
};

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
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setValues({
				name: supplier.name,
				contactEmail: supplier.contactEmail ?? "",
				phone: supplier.phone ?? "",
				website: supplier.website ?? "",
				cnpj: supplier.cnpj ?? "",
				notes: supplier.notes ?? "",
			});
			setIssues([]);
		}
	}, [open, supplier]);

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
			setIssues(zodIssuesToFormIssues(parsed.error, FIELD_LABELS));
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
			issues={issues}
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${supplier.name}`}
		>
			<SupplierFormFields
				disabled={submitting}
				onPatch={(p) => setValues((v) => ({ ...v, ...p }))}
				values={values}
			/>
		</EntityEditSheet>
	);
}
