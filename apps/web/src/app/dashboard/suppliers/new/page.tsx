import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { requireCapability } from "@/lib/permissions";
import { SupplierForm } from "../_components/supplier-form";

export const metadata: Metadata = {
	title: "Novo fornecedor",
};

export default function NewSupplierPage() {
	return (
		<Suspense>
			<NewSupplierPageContent />
		</Suspense>
	);
}

async function NewSupplierPageContent() {
	await requireCapability("suppliers.manage");

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description="Cadastre um fornecedor para vinculá-lo às ferramentas do catálogo."
				title="Novo fornecedor"
			/>

			<SupplierForm defaultValues={{}} mode="create" />
		</div>
	);
}
