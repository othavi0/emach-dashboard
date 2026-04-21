import { notFound } from "next/navigation";

import { requireRole } from "@/lib/session";
import { CategoryForm } from "../../_components/category-form";
import { getCategory } from "../../actions";

interface EditCategoryPageProps {
	params: Promise<{ id: string }>;
}

export default async function EditCategoryPage({
	params,
}: EditCategoryPageProps) {
	await requireRole("admin");
	const { id } = await params;

	const category = await getCategory(id);
	if (!category) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Editar categoria</h1>
				<p className="text-muted-foreground text-sm">
					Atualize os dados de{" "}
					<span className="font-medium text-foreground">{category.name}</span>.
				</p>
			</div>

			<CategoryForm
				categoryId={category.id}
				defaultValues={{
					name: category.name,
					description: category.description ?? undefined,
				}}
				existingSlug={category.slug}
				mode="edit"
			/>
		</div>
	);
}
