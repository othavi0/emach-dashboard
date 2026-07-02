"use client";

import { useSearchParams } from "next/navigation";
import { LazyTab } from "@/components/entity/lazy-tab";
import { fetchBranchActivityPage } from "../../actions";
import { fetchBranchActivityToolsAction } from "../_lib/tab-actions";
import type {
	BranchActivityKind,
	BranchActivityPeriod,
	BranchActivityRow,
} from "../activity-data";
import { ActivityTabClient } from "./activity-tab-client";

const ALL_KINDS: BranchActivityKind[] = ["stock", "order", "user"];
const VALID_KINDS = new Set<string>(ALL_KINDS);
const VALID_PERIODS = new Set<string>(["today", "7d", "30d", "90d", "all"]);

type ActivityLoad = [
	{ items: BranchActivityRow[]; nextCursor: string | null },
	Array<{ id: string; name: string }>,
];

export function ActivityTabLoader({ branchId }: { branchId: string }) {
	const params = useSearchParams();
	const period = params.get("period") ?? undefined;
	const toolId = params.get("toolId") ?? undefined;
	const type = params.get("type") ?? undefined;

	// Deep-link da drawer: ?type=stock&toolId=… pré-filtra o feed.
	const initialKinds: BranchActivityKind[] =
		type && VALID_KINDS.has(type) ? [type as BranchActivityKind] : ALL_KINDS;
	const initialPeriod: BranchActivityPeriod =
		period && VALID_PERIODS.has(period)
			? (period as BranchActivityPeriod)
			: "30d";

	return (
		<LazyTab
			load={(): Promise<ActivityLoad> =>
				Promise.all([
					fetchBranchActivityPage(
						{ branchId, kinds: initialKinds, period: initialPeriod, toolId },
						null
					),
					fetchBranchActivityToolsAction(branchId),
				])
			}
		>
			{([first, tools]: ActivityLoad) => (
				<ActivityTabClient
					branchId={branchId}
					initialCursor={first.nextCursor}
					initialItems={first.items}
					initialKinds={initialKinds}
					initialPeriod={initialPeriod}
					initialToolId={toolId}
					tools={tools}
				/>
			)}
		</LazyTab>
	);
}
