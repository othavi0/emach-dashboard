import { db } from "@emach/db";
import { productType, supplier, tool, toolImage } from "@emach/db/schema/tools";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/session";
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
	images: (typeof toolImage.$inferSelect)[]
): Partial<ToolFormValues> {
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
		productTypeId: row.productTypeId,
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
	await requireRole("admin");
	const { id } = await params;

	const [row] = await db.select().from(tool).where(eq(tool.id, id)).limit(1);
	if (!row) {
		notFound();
	}

	const [images, productTypes, suppliers] = await Promise.all([
		db
			.select()
			.from(toolImage)
			.where(eq(toolImage.toolId, id))
			.orderBy(asc(toolImage.sortOrder)),
		db
			.select({ id: productType.id, name: productType.name })
			.from(productType)
			.orderBy(asc(productType.name)),
		db
			.select({ id: supplier.id, name: supplier.name })
			.from(supplier)
			.orderBy(asc(supplier.name)),
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
				defaultValues={toFormValues(row, images)}
				existingSlug={row.slug ?? undefined}
				mode="edit"
				productTypes={productTypes}
				suppliers={suppliers}
				toolId={id}
			/>
		</div>
	);
}
