import { notFound } from "next/navigation";

import { can } from "@/lib/permissions";
import type { UserRole } from "@/lib/session";
import { getCurrentSession, requireRole } from "@/lib/session";
import { BranchForm } from "../../_components/branch-form";
import { getBranch } from "../../actions";

interface EditBranchPageProps {
	params: Promise<{ id: string }>;
}

export default async function EditBranchPage({ params }: EditBranchPageProps) {
	await requireRole("admin");
	const { id } = await params;

	const [branch, session] = await Promise.all([
		getBranch(id),
		getCurrentSession(),
	]);
	if (!branch) {
		notFound();
	}

	const canSetDefault = can(
		(session?.user.role ?? "user") as UserRole,
		"branches.set_default"
	);

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
				canSetDefault={canSetDefault}
				defaultValues={{
					name: branch.name,
					address: branch.address ?? "",
					isDefault: branch.isDefault,
				}}
				mode="edit"
			/>
		</div>
	);
}
