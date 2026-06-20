import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireCapability } from "@/lib/permissions";
import { BranchForm } from "../_components/branch-form";

export const metadata: Metadata = {
	title: "Nova filial",
};

export default function NewBranchPage() {
	return <NewBranchPageContent />;
}

async function NewBranchPageContent() {
	await requireCapability("branches.manage");

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
