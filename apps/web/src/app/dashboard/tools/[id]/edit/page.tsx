import { db } from "@emach/db";
import {
	attributeDefinition,
	toolAttributeAssignment,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { category, toolCategory } from "@emach/db/schema/categories";
import { supplier, tool, toolImage, toolVariant } from "@emach/db/schema/tools";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireCapability } from "@/lib/permissions";
import { buildDefinitionsByCategory } from "../../_components/attribute-helpers";
import { ToolForm } from "../../_components/tool-form";
import type {
	AttributeValueInput,
	ToolFormValues,
	ToolStatusValue,
	ToolVariantInput,
	VOLTAGE_OPTIONS,
} from "../../_components/tool-schema";

interface PageProps {
	params: Promise<{ id: string }>;
}

function toFormValues(
	row: typeof tool.$inferSelect,
	images: (typeof toolImage.$inferSelect)[],
	toolCats: (typeof toolCategory.$inferSelect)[],
	variants: (typeof toolVariant.$inferSelect)[],
	attributeValues: {
		slug: string;
		valueText: string | null;
		valueNumeric: string | null;
		valueNumericMax: string | null;
		valueBool: boolean | null;
	}[],
	attributeAssignments: string[]
): Partial<ToolFormValues> {
	const categoryIds = toolCats.map((tc) => tc.categoryId);
	const primaryRow = toolCats.find((tc) => tc.isPrimary);
	const primaryCategoryId = primaryRow?.categoryId ?? categoryIds[0] ?? "";

	const formVariants: ToolVariantInput[] = variants.map((v) => ({
		id: v.id,
		sku: v.sku,
		voltage: (v.voltage ?? "") as (typeof VOLTAGE_OPTIONS)[number] | "",
		priceAmount: Number(v.priceAmount),
		costAmount: v.costAmount ? Number(v.costAmount) : undefined,
		isDefault: v.isDefault,
		sortOrder: v.sortOrder,
	}));

	const attrValuesMap: Record<string, AttributeValueInput> = {};
	for (const av of attributeValues) {
		attrValuesMap[av.slug] = {
			valueText: av.valueText,
			valueNumeric: av.valueNumeric ? Number(av.valueNumeric) : null,
			valueNumericMax: av.valueNumericMax ? Number(av.valueNumericMax) : null,
			valueBool: av.valueBool,
		};
	}

	return {
		name: row.name,
		description: row.description ?? "",
		model: row.model ?? "",
		invoiceModel: row.invoiceModel ?? "",
		manufacturerName: row.manufacturerName ?? "",
		status: (row.status ?? "draft") as ToolStatusValue,
		hsCode: row.hsCode ?? "",
		ncm: row.ncm ?? "",
		cest: row.cest ?? "",
		powerWatts: row.powerWatts ?? undefined,
		weightKg: row.weightKg ? Number(row.weightKg) : undefined,
		lengthCm: row.lengthCm ? Number(row.lengthCm) : undefined,
		widthCm: row.widthCm ? Number(row.widthCm) : undefined,
		heightCm: row.heightCm ? Number(row.heightCm) : undefined,
		categoryIds,
		primaryCategoryId,
		supplierId: row.supplierId ?? "",
		visibleOnSite: row.visibleOnSite,
		images: images.map((img) => ({
			id: img.id,
			url: img.url,
			sortOrder: img.sortOrder,
		})),
		variants: formVariants,
		attributeValues: attrValuesMap,
		attributeAssignments,
	};
}

export default async function EditToolPage({ params }: PageProps) {
	await requireCapability("tools.update");
	const { id } = await params;

	const [row] = await db.select().from(tool).where(eq(tool.id, id)).limit(1);
	if (!row) {
		notFound();
	}

	const [
		images,
		categories,
		suppliers,
		toolCats,
		variants,
		attrValues,
		definitionsByCategory,
		allDefinitions,
		assignmentRows,
	] = await Promise.all([
		db
			.select()
			.from(toolImage)
			.where(eq(toolImage.toolId, id))
			.orderBy(asc(toolImage.sortOrder)),
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
		db.select().from(toolCategory).where(eq(toolCategory.toolId, id)),
		db
			.select()
			.from(toolVariant)
			.where(eq(toolVariant.toolId, id))
			.orderBy(asc(toolVariant.sortOrder)),
		db
			.select({
				slug: attributeDefinition.slug,
				valueText: toolAttributeValue.valueText,
				valueNumeric: toolAttributeValue.valueNumeric,
				valueNumericMax: toolAttributeValue.valueNumericMax,
				valueBool: toolAttributeValue.valueBool,
			})
			.from(toolAttributeValue)
			.innerJoin(
				attributeDefinition,
				eq(attributeDefinition.id, toolAttributeValue.attributeId)
			)
			.where(eq(toolAttributeValue.toolId, id)),
		buildDefinitionsByCategory(),
		db
			.select()
			.from(attributeDefinition)
			.orderBy(
				asc(attributeDefinition.sortOrder),
				asc(attributeDefinition.label)
			),
		db
			.select({ slug: attributeDefinition.slug })
			.from(toolAttributeAssignment)
			.innerJoin(
				attributeDefinition,
				eq(attributeDefinition.id, toolAttributeAssignment.attributeId)
			)
			.where(eq(toolAttributeAssignment.toolId, id))
			.orderBy(asc(toolAttributeAssignment.sortOrder)),
	]);

	const attributeAssignments = assignmentRows.map((r) => r.slug);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Editar: {row.name}</h1>
				<p className="text-muted-foreground text-sm">
					Atualize os dados da ferramenta.
				</p>
			</div>

			<ToolForm
				allDefinitions={allDefinitions}
				categories={categories}
				defaultValues={toFormValues(
					row,
					images,
					toolCats,
					variants,
					attrValues,
					attributeAssignments
				)}
				definitionsByCategory={definitionsByCategory}
				existingSlug={row.slug ?? undefined}
				mode="edit"
				suppliers={suppliers}
				toolId={id}
			/>
		</div>
	);
}
