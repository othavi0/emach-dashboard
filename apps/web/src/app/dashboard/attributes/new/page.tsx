import { db } from "@emach/db";
import { category } from "@emach/db/schema/categories";
import { asc } from "drizzle-orm";

import { requireCapability } from "@/lib/permissions";
import { AttributeForm } from "../_components/attribute-form";

interface PageProps {
	searchParams: Promise<{ categoryId?: string }>;
}

export default async function NewAttributePage({ searchParams }: PageProps) {
	await requireCapability("attributes.create");
	const { categoryId } = await searchParams;
	const categories = await db
		.select({
			id: category.id,
			name: category.name,
			depth: category.depth,
		})
		.from(category)
		.orderBy(asc(category.path));

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Novo atributo</h1>
				<p className="text-muted-foreground text-sm">
					Define uma nova especificação técnica que pode ser preenchida nas
					ferramentas.
				</p>
			</div>
			<AttributeForm
				categories={categories}
				defaultValues={categoryId ? { categoryId } : {}}
				mode="create"
			/>
		</div>
	);
}
