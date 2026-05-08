import { notFound } from "next/navigation";

import { requireRole } from "@/lib/session";
import { BranchForm } from "../../_components/branch-form";
import { getBranch } from "../../actions";

interface EditBranchPageProps {
	params: Promise<{ id: string }>;
}

export default async function EditBranchPage({ params }: EditBranchPageProps) {
	await requireRole("admin");
	const { id } = await params;

	const branch = await getBranch(id);
	if (!branch) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-medium text-2xl tracking-tight">Editar filial</h1>
				<p className="text-muted-foreground text-sm">
					Atualize os dados da filial{" "}
					<span className="font-medium text-foreground">{branch.name}</span>.
				</p>
			</div>

			<BranchForm
				branchId={branch.id}
				defaultValues={{
					name: branch.name,
					address: branch.address ?? undefined,
				}}
				mode="edit"
			/>
		</div>
	);
}
