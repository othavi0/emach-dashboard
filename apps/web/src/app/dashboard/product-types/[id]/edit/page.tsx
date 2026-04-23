import { notFound } from "next/navigation";

import { requireRole } from "@/lib/session";
import { ProductTypeForm } from "../../_components/product-type-form";
import { getProductType } from "../../actions";

interface EditProductTypePageProps {
	params: Promise<{ id: string }>;
}

export default async function EditProductTypePage({
	params,
}: EditProductTypePageProps) {
	await requireRole("admin");
	const { id } = await params;

	const productType = await getProductType(id);
	if (!productType) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Editar tipo</h1>
				<p className="text-muted-foreground text-sm">
					Atualize os dados de{" "}
					<span className="font-medium text-foreground">
						{productType.name}
					</span>
					.
				</p>
			</div>

			<ProductTypeForm
				defaultValues={{
					name: productType.name,
					description: productType.description ?? undefined,
				}}
				existingSlug={productType.slug}
				mode="edit"
				productTypeId={productType.id}
			/>
		</div>
	);
}
