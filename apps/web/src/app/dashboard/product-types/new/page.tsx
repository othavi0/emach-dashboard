import { requireRole } from "@/lib/session";
import { ProductTypeForm } from "../_components/product-type-form";

export default async function NewProductTypePage() {
	await requireRole("admin");

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Novo tipo de produto</h1>
				<p className="text-muted-foreground text-sm">
					Cadastre um tipo para organizar o catálogo de ferramentas.
				</p>
			</div>

			<ProductTypeForm defaultValues={{}} mode="create" />
		</div>
	);
}
