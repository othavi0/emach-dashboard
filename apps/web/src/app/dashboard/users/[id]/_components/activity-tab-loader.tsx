"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import { fetchUserActivityTabAction } from "../_lib/tab-actions";
import { ActivityTabClient } from "./activity-tab-client";

export function ActivityTabLoader({ userId }: { userId: string }) {
	return (
		<LazyTab load={() => fetchUserActivityTabAction(userId)}>
			{(data) => (
				<ActivityTabClient
					affecting={data.affecting}
					byUser={data.byUser}
					userId={userId}
				/>
			)}
		</LazyTab>
	);
}
