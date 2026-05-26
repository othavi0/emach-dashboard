import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { asc, eq } from "drizzle-orm";

import { fetchToolActivityPage } from "@/app/dashboard/stock/actions";

import { ActivityTabClient } from "./activity-tab-client";

const DEFAULT_REASONS = [
	"entrada_compra",
	"saida_venda",
	"ajuste_inventario",
	"perda",
	"outro",
];

async function fetchActiveBranches() {
	return db
		.select({ id: branch.id, name: branch.name })
		.from(branch)
		.where(eq(branch.status, "active"))
		.orderBy(asc(branch.name));
}

interface ActivityTabProps {
	toolId: string;
}

export async function ActivityTab({ toolId }: ActivityTabProps) {
	const [first, branches] = await Promise.all([
		fetchToolActivityPage(
			{ toolId, period: "30d", reasons: DEFAULT_REASONS },
			null
		),
		fetchActiveBranches(),
	]);

	return (
		<ActivityTabClient
			branches={branches}
			initialCursor={first.nextCursor}
			initialItems={first.items}
			toolId={toolId}
		/>
	);
}
