"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import { fetchUserSessionsTabAction } from "../_lib/tab-actions";
import { SessionsList } from "./sessions-list";

export function SessionsTabLoader({
	canRevoke,
	userId,
}: {
	canRevoke: boolean;
	userId: string;
}) {
	return (
		<LazyTab load={() => fetchUserSessionsTabAction(userId)}>
			{(sessions) => (
				<SessionsList
					canRevoke={canRevoke}
					sessions={sessions}
					userId={userId}
				/>
			)}
		</LazyTab>
	);
}
