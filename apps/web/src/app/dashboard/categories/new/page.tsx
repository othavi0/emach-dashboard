import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { CategoryForm } from "../_components/category-form";
import { listCategories } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
	await requireCapabilityOrRedirect("categories.manage");
	const categories = await listCategories();

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-medium text-2xl tracking-tight">Nova categoria</h1>
				<p className="text-muted-foreground text-sm">
					Crie uma categoria raiz ou subcategoria para classificar ferramentas.
				</p>
			</div>
			<CategoryForm
				categories={categories}
				defaultValues={{ isActive: true, sortOrder: 0 }}
				mode="create"
			/>
		</div>
	);
}
