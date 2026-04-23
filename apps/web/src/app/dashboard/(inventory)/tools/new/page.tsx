import { db } from "@emach/db";
import { productType, supplier } from "@emach/db/schema/tools";
import { asc } from "drizzle-orm";

import { requireRole } from "@/lib/session";
import { ToolForm } from "../_components/tool-form";

export default async function NewToolPage() {
	await requireRole("admin");

	const [productTypes, suppliers] = await Promise.all([
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
				<h1 className="font-serif text-2xl">Nova ferramenta</h1>
				<p className="text-muted-foreground text-sm">
					Preencha os dados abaixo para cadastrar uma nova ferramenta.
				</p>
			</div>

			<ToolForm
				defaultValues={{}}
				mode="create"
				productTypes={productTypes}
				suppliers={suppliers}
			/>
		</div>
	);
}
