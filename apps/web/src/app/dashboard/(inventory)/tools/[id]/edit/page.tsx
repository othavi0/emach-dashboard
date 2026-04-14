import { db } from "@emach/db";
import { category, supplier, tool } from "@emach/db/schema/tools";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/session";
import { ToolForm } from "../../_components/tool-form";
import type {
	ToolFormValues,
	VOLTAGE_OPTIONS as VoltageType,
} from "../../_components/tool-schema";

interface PageProps {
	params: Promise<{ id: string }>;
}

function toFormValues(row: typeof tool.$inferSelect): Partial<ToolFormValues> {
	return {
		name: row.name,
		slug: row.slug ?? "",
		description: row.description ?? "",
		sku: row.sku ?? "",
		voltage: (row.voltage ?? "") as (typeof VoltageType)[number] | "",
		price: row.price ? Number(row.price) : undefined,
		cost: row.cost ? Number(row.cost) : undefined,
		categoryId: row.categoryId ?? "",
		supplierId: row.supplierId ?? "",
		visibleOnSite: row.visibleOnSite,
		imageUrl: row.imageUrl ?? "",
	};
}

export default async function EditToolPage({ params }: PageProps) {
	await requireRole("admin");
	const { id } = await params;

	const [row] = await db.select().from(tool).where(eq(tool.id, id)).limit(1);
	if (!row) {
		notFound();
	}

	const [categories, suppliers] = await Promise.all([
		db
			.select({ id: category.id, name: category.name })
			.from(category)
			.orderBy(asc(category.name)),
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
				categories={categories}
				defaultValues={toFormValues(row)}
				mode="edit"
				suppliers={suppliers}
				toolId={id}
			/>
		</div>
	);
}
