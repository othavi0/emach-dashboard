import { requireRole } from "@/lib/session";
import { CategoryForm } from "../_components/category-form";

export default async function NewCategoryPage() {
	await requireRole("admin");

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Nova categoria</h1>
				<p className="text-muted-foreground text-sm">
					Cadastre uma categoria para organizar o catálogo de ferramentas.
				</p>
			</div>

			<CategoryForm defaultValues={{}} mode="create" />
		</div>
	);
}
