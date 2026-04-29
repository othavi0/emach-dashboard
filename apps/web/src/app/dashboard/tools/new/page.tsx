import { db } from "@emach/db";
import { attributeDefinition } from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { supplier } from "@emach/db/schema/tools";
import { asc } from "drizzle-orm";

import { requireCapability } from "@/lib/permissions";
import { buildDefinitionsByCategory } from "../_components/attribute-helpers";
import { ToolForm } from "../_components/tool-form";

export default async function NewToolPage() {
	await requireCapability("tools.create");

	const [categories, suppliers, definitionsByCategory, allDefinitions] =
		await Promise.all([
			db
				.select({
					id: category.id,
					slug: category.slug,
					name: category.name,
					path: category.path,
					depth: category.depth,
				})
				.from(category)
				.orderBy(asc(category.path)),
			db
				.select({ id: supplier.id, name: supplier.name })
				.from(supplier)
				.orderBy(asc(supplier.name)),
			buildDefinitionsByCategory(),
			db
				.select()
				.from(attributeDefinition)
				.orderBy(
					asc(attributeDefinition.sortOrder),
					asc(attributeDefinition.label)
				),
		]);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Nova ferramenta</h1>
				<p className="text-muted-foreground text-sm">
					Preencha os dados abaixo para cadastrar uma nova ferramenta.
				</p>
			</div>

			<ToolForm
				allDefinitions={allDefinitions}
				categories={categories}
				defaultValues={{}}
				definitionsByCategory={definitionsByCategory}
				mode="create"
				suppliers={suppliers}
			/>
		</div>
	);
}
