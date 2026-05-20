import { requireRole } from "@/lib/session";
import { SupplierForm } from "../_components/supplier-form";

export default async function NewSupplierPage() {
	await requireRole("admin");

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-medium font-serif text-4xl tracking-tight">
					Novo fornecedor
				</h1>
				<p className="text-muted-foreground text-sm">
					Cadastre um fornecedor para vinculá-lo às ferramentas do catálogo.
				</p>
			</div>

			<SupplierForm defaultValues={{}} mode="create" />
		</div>
	);
}
