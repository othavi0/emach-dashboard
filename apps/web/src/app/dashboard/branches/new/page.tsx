import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/session";
import { BranchForm } from "../_components/branch-form";

export default async function NewBranchPage() {
	await requireRole("admin");

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description="Cadastre uma filial para permitir ajustes de estoque por localização."
				title="Nova filial"
			/>

			<BranchForm defaultValues={{}} mode="create" />
		</div>
	);
}
