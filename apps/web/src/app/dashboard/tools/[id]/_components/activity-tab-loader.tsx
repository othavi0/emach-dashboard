"use client";

import type { ActiveBranchOption } from "@/app/dashboard/branches/data";
import type { ToolActivityRow } from "@/app/dashboard/stock/tool-activity-data";
import { LazyTab } from "@/components/entity/lazy-tab";
import { fetchToolActivityInitAction } from "../_lib/tab-actions";
import { ActivityTabClient } from "./activity-tab-client";

interface InitData {
	branches: ActiveBranchOption[];
	items: ToolActivityRow[];
	nextCursor: string | null;
}

export function ActivityTabLoader({ toolId }: { toolId: string }) {
	return (
		<LazyTab load={() => fetchToolActivityInitAction(toolId)}>
			{(data: InitData) => (
				<ActivityTabClient
					branches={data.branches}
					initialCursor={data.nextCursor}
					initialItems={data.items}
					toolId={toolId}
				/>
			)}
		</LazyTab>
	);
}
