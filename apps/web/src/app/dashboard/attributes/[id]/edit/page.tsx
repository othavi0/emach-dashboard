import { db } from "@emach/db";
import {
	type AttributeOptions,
	attributeDefinition,
} from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireCapability } from "@/lib/permissions";
import { AttributeForm } from "../../_components/attribute-form";
import type { AttributeFormValues } from "../../schema";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function EditAttributePage({ params }: PageProps) {
	await requireCapability("attributes.update");
	const { id } = await params;

	const [row] = await db
		.select()
		.from(attributeDefinition)
		.where(eq(attributeDefinition.id, id))
		.limit(1);
	if (!row) {
		notFound();
	}

	const categories = await db
		.select({
			id: category.id,
			name: category.name,
			depth: category.depth,
		})
		.from(category)
		.orderBy(asc(category.path));

	const opts = row.options as AttributeOptions | null;
	const defaultValues: Partial<AttributeFormValues> = {
		slug: row.slug,
		label: row.label,
		inputType: row.inputType,
		unit: row.unit ?? "",
		isRequired: row.isRequired,
		categoryId: row.categoryId ?? "",
		sortOrder: row.sortOrder,
		options: opts && "options" in opts ? opts.options : [],
		swatches: opts && "swatches" in opts ? opts.swatches : [],
	};

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Editar atributo: {row.label}</h1>
			</div>
			<AttributeForm
				attributeId={id}
				categories={categories}
				defaultValues={defaultValues}
				mode="edit"
			/>
		</div>
	);
}
