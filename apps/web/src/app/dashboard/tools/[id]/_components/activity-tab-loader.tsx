"use client";

import { useEffect, useState } from "react";
import type { ActiveBranchOption } from "@/app/dashboard/branches/data";
import type { ToolActivityRow } from "@/app/dashboard/stock/tool-activity-data";
import { fetchToolActivityInitAction } from "../_lib/tab-actions";
import { ActivityTabClient } from "./activity-tab-client";

interface InitData {
	branches: ActiveBranchOption[];
	items: ToolActivityRow[];
	nextCursor: string | null;
}

export function ActivityTabLoader({ toolId }: { toolId: string }) {
	const [data, setData] = useState<InitData | null>(null);

	useEffect(() => {
		let active = true;
		fetchToolActivityInitAction(toolId).then((result) => {
			if (active) {
				setData(result);
			}
		});
		return () => {
			active = false;
		};
	}, [toolId]);

	if (!data) {
		return (
			<div
				aria-busy="true"
				className="h-32 animate-pulse rounded-md bg-muted"
			/>
		);
	}
	return (
		<ActivityTabClient
			branches={data.branches}
			initialCursor={data.nextCursor}
			initialItems={data.items}
			toolId={toolId}
		/>
	);
}
