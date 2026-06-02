"use client";

import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchUserActivityByUserPage } from "../../actions";
import type { UserActivityRow } from "../../data";
import { ActivityTimeline } from "./activity-timeline";

/** Voz ativa: o que o usuário FEZ (ele é o ator). */
const ACTION_LABELS: Record<string, string> = {
	"user.approved": "Aprovou usuário",
	"user.rejected": "Rejeitou usuário",
	"user.updated": "Atualizou usuário",
	"user.suspended": "Suspendeu usuário",
	"user.reactivated": "Reativou usuário",
	"user.deleted": "Deletou usuário",
	"user.password_reset_triggered": "Enviou reset de senha",
	"user.session_revoked": "Revogou sessão",
	"user.all_sessions_revoked": "Revogou todas as sessões",
	"user.branch_linked": "Vinculou filial",
	"user.branch_unlinked": "Desvinculou filial",
	"tool.created": "Criou ferramenta",
	"tool.updated": "Atualizou ferramenta",
	"tool.deleted": "Deletou ferramenta",
};

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
				title: ACTION_LABELS[item.action] ?? item.action,
			}))}
			error={error}
			hasMore={hasMore}
			onLoadMore={loadMore}
			pending={pending}
		/>
	);
}
