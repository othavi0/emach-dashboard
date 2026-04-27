import { db } from "@emach/db";
import { category, toolCategory } from "@emach/db/schema/categories";
import { supplier, tool, toolImage } from "@emach/db/schema/tools";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireCapability } from "@/lib/permissions";
import { ToolForm } from "../../_components/tool-form";
import type {
	ToolFormValues,
	ToolStatusValue,
	VOLTAGE_OPTIONS,
} from "../../_components/tool-schema";

interface PageProps {
	params: Promise<{ id: string }>;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mapeamento denso row→form; refactor pendente em docs/plano-melhorias.md
function toFormValues(
	row: typeof tool.$inferSelect,
	images: (typeof toolImage.$inferSelect)[],
	toolCats: (typeof toolCategory.$inferSelect)[]
): Partial<ToolFormValues> {
	const categoryIds = toolCats.map((tc) => tc.categoryId);
	const primaryRow = toolCats.find((tc) => tc.isPrimary);
	const primaryCategoryId = primaryRow?.categoryId ?? categoryIds[0] ?? "";

	return {
		name: row.name,
		description: row.description ?? "",
		sku: row.sku ?? "",
		model: row.model ?? "",
		invoiceModel: row.invoiceModel ?? "",
		barcode: row.barcode ?? "",
		manufacturerName: row.manufacturerName ?? "",
		countryOfOrigin: row.countryOfOrigin ?? "",
		status: (row.status ?? "draft") as ToolStatusValue,
		hsCode: row.hsCode ?? "",
		ncm: row.ncm ?? "",
		cest: row.cest ?? "",
		voltage: (row.voltage ?? "") as (typeof VOLTAGE_OPTIONS)[number] | "",
		powerWatts: row.powerWatts ?? undefined,
		frequencyHz: row.frequencyHz ?? undefined,
		warrantyMonths: row.warrantyMonths ?? undefined,
		weightKg: row.weightKg ? Number(row.weightKg) : undefined,
		lengthCm: row.lengthCm ? Number(row.lengthCm) : undefined,
		widthCm: row.widthCm ? Number(row.widthCm) : undefined,
		heightCm: row.heightCm ? Number(row.heightCm) : undefined,
		price: row.price ? Number(row.price) : undefined,
		cost: row.cost ? Number(row.cost) : undefined,
		categoryIds,
		primaryCategoryId,
		supplierId: row.supplierId ?? "",
		visibleOnSite: row.visibleOnSite,
		images: images.map((img) => ({
			id: img.id,
			url: img.url,
			sortOrder: img.sortOrder,
		})),
	};
}

export default async function EditToolPage({ params }: PageProps) {
	await requireCapability("tools.update");
	const { id } = await params;

	const [row] = await db.select().from(tool).where(eq(tool.id, id)).limit(1);
	if (!row) {
		notFound();
	}

	const [images, categories, suppliers, toolCats] = await Promise.all([
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
	]);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Editar: {row.name}</h1>
				<p className="text-muted-foreground text-sm">
					Atualize os dados da ferramenta.
				</p>
			</div>

			<ToolForm
				categories={categories}
				defaultValues={toFormValues(row, images, toolCats)}
				existingSlug={row.slug ?? undefined}
				mode="edit"
				suppliers={suppliers}
				toolId={id}
			/>
		</div>
	);
}
