import { requireRole } from "@/lib/session";
import { BranchForm } from "../_components/branch-form";

export default async function NewBranchPage() {
	await requireRole("admin");

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Nova filial</h1>
				<p className="text-muted-foreground text-sm">
					Cadastre uma filial para permitir ajustes de estoque por localização.
				</p>
			</div>

			<BranchForm defaultValues={{}} mode="create" />
		</div>
	);
}
