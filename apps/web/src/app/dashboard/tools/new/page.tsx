import { db } from "@emach/db";
import { attributeDefinition } from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { supplier } from "@emach/db/schema/tools";
import { asc } from "drizzle-orm";

import { requireCapability } from "@/lib/permissions";
import { buildDefinitionsByCategory } from "../_components/attribute-helpers";
import { ToolFormProvider } from "../_components/tool-form-context";
import { ToolWizard } from "../_components/tool-wizard";

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
				<h1 className="font-medium font-serif text-4xl tracking-tight">
					Nova ferramenta
				</h1>
				<p className="text-muted-foreground text-sm">
					Seis passos guiados. Você pode pular entre eles a qualquer momento.
				</p>
			</div>
			<ToolFormProvider
				value={{
					allDefinitions,
					categories,
					definitionsByCategory,
					suppliers,
					mode: "create",
				}}
			>
				<ToolWizard />
			</ToolFormProvider>
		</div>
	);
}
