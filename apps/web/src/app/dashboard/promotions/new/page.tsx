import { db } from "@emach/db";
import { tool } from "@emach/db/schema/tools";
import { asc } from "drizzle-orm";

import { requireRole } from "@/lib/session";
import { PromotionForm } from "../_components/promotion-form";

export default async function NewPromotionPage() {
	await requireRole("admin");

	const availableTools = await db
		.select({ id: tool.id, name: tool.name })
		.from(tool)
		.orderBy(asc(tool.name));

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-medium font-serif text-4xl tracking-tight">
					Nova promoção
				</h1>
				<p className="text-muted-foreground text-sm">
					Preencha os dados abaixo para cadastrar uma nova promoção.
				</p>
			</div>

			<PromotionForm
				availableTools={availableTools}
				defaultValues={{}}
				mode="create"
			/>
		</div>
	);
}
