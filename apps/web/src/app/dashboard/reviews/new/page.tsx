import { db } from "@emach/db";
import { client } from "@emach/db/schema/client";
import { tool } from "@emach/db/schema/tools";
import { asc } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { EditorialReviewForm } from "../_components/editorial-review-form";

export const dynamic = "force-dynamic";

export default async function NewEditorialReviewPage() {
	await requireCapabilityOrRedirect("reviews.moderate");

	const [tools, clients] = await Promise.all([
		db
			.select({ id: tool.id, name: tool.name })
			.from(tool)
			.orderBy(asc(tool.name)),
		db
			.select({ id: client.id, name: client.name, email: client.email })
			.from(client)
			.orderBy(asc(client.name)),
	]);

	return (
		<>
			<PageHeader
				description="Avaliação curada pelo time, sem vínculo com pedido. Útil para depoimentos editoriais ou importação manual."
				title="Nova avaliação editorial"
			/>
			<EditorialReviewForm clients={clients} tools={tools} />
		</>
	);
}
