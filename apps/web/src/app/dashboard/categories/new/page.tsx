import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { AttributesLocked } from "../_components/attributes-locked";
import { CategoryForm } from "../_components/category-form";
import { listCategories } from "../data";

export const metadata: Metadata = {
	title: "Nova categoria",
};

interface NewCategoryPageProps {
	searchParams: Promise<{ parent?: string }>;
}

export default function NewCategoryPage({
	searchParams,
}: NewCategoryPageProps) {
	return (
		<Suspense>
			<NewCategoryPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function NewCategoryPageContent({ searchParams }: NewCategoryPageProps) {
	await requireCapabilityOrRedirect("categories.manage");
	const { parent } = await searchParams;
	const categories = await listCategories();
	const validParent =
		parent && categories.some((c) => c.id === parent) ? parent : null;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description="Crie uma categoria raiz ou subcategoria para classificar ferramentas."
				title="Nova categoria"
			/>
			<div className="flex max-w-2xl flex-col gap-6">
				<CategoryForm
					categories={categories}
					defaultValues={{ isActive: true, parentId: validParent }}
					mode="create"
				/>
				<AttributesLocked />
			</div>
		</div>
	);
}
