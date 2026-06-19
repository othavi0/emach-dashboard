import { getActiveBranches } from "@/app/dashboard/branches/data";
import { fetchToolActivityPage } from "@/app/dashboard/stock/tool-activity-data";

import { ActivityTabClient } from "./activity-tab-client";

const DEFAULT_REASONS = [
	"entrada_compra",
	"saida_venda",
	"ajuste_inventario",
	"perda",
	"outro",
];

interface ActivityTabProps {
	toolId: string;
}

export async function ActivityTab({ toolId }: ActivityTabProps) {
	const [first, branches] = await Promise.all([
		fetchToolActivityPage(
			{ toolId, period: "30d", reasons: DEFAULT_REASONS },
			null
		),
		getActiveBranches(),
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
