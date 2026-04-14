import { db } from "@emach/db";
import { category, supplier } from "@emach/db/schema/tools";
import { asc } from "drizzle-orm";

import { requireRole } from "@/lib/session";
import { ToolForm } from "../_components/tool-form";

export default async function NewToolPage() {
	await requireRole("admin");

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
				<h1 className="font-serif text-2xl">Nova ferramenta</h1>
				<p className="text-muted-foreground text-sm">
					Preencha os dados abaixo para cadastrar uma nova ferramenta.
				</p>
			</div>

			<ToolForm
				categories={categories}
				defaultValues={{}}
				mode="create"
				suppliers={suppliers}
			/>
		</div>
	);
}
