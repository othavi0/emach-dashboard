import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/session";
import { SupplierForm } from "../_components/supplier-form";

export default async function NewSupplierPage() {
	await requireRole("admin");

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
