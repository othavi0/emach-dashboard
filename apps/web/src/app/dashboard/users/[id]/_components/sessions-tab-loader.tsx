"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import { fetchUserSessionsTabAction } from "../_lib/tab-actions";
import { SessionsList } from "./sessions-list";

export function SessionsTabLoader({ userId }: { userId: string }) {
	return (
		<LazyTab load={() => fetchUserSessionsTabAction(userId)}>
			{(sessions) => <SessionsList sessions={sessions} userId={userId} />}
		</LazyTab>
	);
}
