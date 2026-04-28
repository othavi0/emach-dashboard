import { notFound } from "next/navigation";

import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { CategoryAttributesPanel } from "../../_components/category-attributes-panel";
import { CategoryForm } from "../../_components/category-form";
import { getCategory, listCategories } from "../../actions";

export const dynamic = "force-dynamic";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function EditCategoryPage({ params }: PageProps) {
	await requireCapabilityOrRedirect("categories.manage");
	const { id } = await params;

	const [existing, categories] = await Promise.all([
		getCategory(id),
		listCategories(),
	]);

	if (!existing) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Editar categoria</h1>
				<p className="text-muted-foreground text-sm">
					Caminho atual: <code className="text-xs">{existing.path}</code>
				</p>
			</div>
			<CategoryForm
				categories={categories}
				categoryId={id}
				defaultValues={{
					id: existing.id,
					name: existing.name,
					slug: existing.slug,
					parentId: existing.parentId,
					description: existing.description,
					imageUrl: existing.imageUrl,
					isActive: existing.isActive,
					sortOrder: existing.sortOrder,
					path: existing.path,
				}}
				mode="edit"
			/>
			<CategoryAttributesPanel categoryId={id} />
		</div>
	);
}
