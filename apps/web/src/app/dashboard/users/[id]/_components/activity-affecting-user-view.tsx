"use client";

import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchUserActivityAffectingPage } from "../../actions";
import type { UserActivityRow } from "../../data";
import { ACTIVITY_LABELS_AFFECTING } from "./activity-labels";
import { ActivityTimeline } from "./activity-timeline";

interface Props {
	initial: (UserActivityRow & { actorName: string | null })[];
	initialCursor: string | null;
	userId: string;
}

export function ActivityAffectingUserView({
	userId,
	initial,
	initialCursor,
}: Props) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchUserActivityAffectingPage(userId, cursor),
	});

	return (
		<ActivityTimeline
			emptyMessage="Nenhuma alteração registrada neste usuário"
			entries={items.map((item) => ({
				action: item.action,
				createdAt: item.createdAt,
				id: item.id,
				metadata: item.metadata,
				subtitle: item.actorName ?? "Sistema",
				title: ACTIVITY_LABELS_AFFECTING[item.action] ?? item.action,
			}))}
			error={error}
			hasMore={hasMore}
			onLoadMore={loadMore}
			pending={pending}
			subjectHeader="Por quem"
		/>
	);
}
