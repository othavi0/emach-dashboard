"use client";

import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchUserActivityByUserPage } from "../../actions";
import type { UserActivityRow } from "../../data";
import { ACTIVITY_LABELS_BY } from "./activity-labels";
import { ActivityTimeline } from "./activity-timeline";

interface Props {
	initial: UserActivityRow[];
	initialCursor: string | null;
	userId: string;
}

export function ActivityByUserView({ userId, initial, initialCursor }: Props) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchUserActivityByUserPage(userId, cursor),
	});

	return (
		<ActivityTimeline
			emptyMessage="Sem ações registradas por este usuário"
			entries={items.map((item) => ({
				action: item.action,
				createdAt: item.createdAt,
				id: item.id,
				metadata: item.metadata,
				subtitle: item.targetId
					? `${item.targetType ?? "—"} · ${item.targetId.slice(0, 8)}`
					: undefined,
				title: ACTIVITY_LABELS_BY[item.action] ?? item.action,
			}))}
			error={error}
			hasMore={hasMore}
			onLoadMore={loadMore}
			pending={pending}
			subjectHeader="Alvo"
		/>
	);
}
