import { db } from "@emach/db";
import { attributeDefinition } from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";

import { requireCapability } from "@/lib/permissions";
import { buildDefinitionsByCategory } from "../_components/attribute-helpers";
import { ToolFormProvider } from "../_components/tool-form-context";
import { ToolWizard } from "../_components/tool-wizard";

export const metadata: Metadata = {
	title: "Nova ferramenta",
};

export default function NewToolPage() {
	return (
		<Suspense>
			<NewToolPageContent />
		</Suspense>
	);
}

async function NewToolPageContent() {
	await requireCapability("tools.create");

	const [categories, definitionsByCategory, allDefinitions] = await Promise.all(
		[
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
			buildDefinitionsByCategory(),
			db
				.select()
				.from(attributeDefinition)
				.orderBy(
					asc(attributeDefinition.sortOrder),
					asc(attributeDefinition.label)
				),
		]
	);

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
					mode: "create",
				}}
			>
				<ToolWizard />
			</ToolFormProvider>
		</div>
	);
}
