import {
	type BranchActivityKind,
	type BranchActivityPeriod,
	fetchBranchActivityPage,
	fetchBranchActivityTools,
} from "../activity-data";
import { ActivityTabClient } from "./activity-tab-client";

const ALL_KINDS: BranchActivityKind[] = ["stock", "order", "user"];
const VALID_KINDS = new Set<string>(ALL_KINDS);
const VALID_PERIODS = new Set<string>(["today", "7d", "30d", "90d", "all"]);

interface ActivityTabProps {
	branchId: string;
	period?: string;
	toolId?: string;
	type?: string;
}

export async function ActivityTab({
	branchId,
	period,
	toolId,
	type,
}: ActivityTabProps) {
	// Deep-link da drawer: ?type=stock&toolId=… pré-filtra o feed.
	const initialKinds: BranchActivityKind[] =
		type && VALID_KINDS.has(type) ? [type as BranchActivityKind] : ALL_KINDS;
	const initialPeriod: BranchActivityPeriod =
		period && VALID_PERIODS.has(period)
			? (period as BranchActivityPeriod)
			: "30d";

	const [first, tools] = await Promise.all([
		fetchBranchActivityPage(
			{ branchId, kinds: initialKinds, period: initialPeriod, toolId },
			null
		),
		fetchBranchActivityTools(branchId),
	]);

	return (
		<ActivityTabClient
			branchId={branchId}
			initialCursor={first.nextCursor}
			initialItems={first.items}
			initialKinds={initialKinds}
			initialPeriod={initialPeriod}
			initialToolId={toolId}
			tools={tools}
		/>
	);
}
