"use client";

import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchUserActivityAffectingPage } from "../../actions";
import type { UserActivityRow } from "../../data";
import { ActivityTimeline } from "./activity-timeline";

/** Voz passiva: o que aconteceu COM o usuário (ele é o alvo). */
const ACTION_LABELS: Record<string, string> = {
	"user.approved": "Foi aprovado",
	"user.rejected": "Foi rejeitado",
	"user.updated": "Foi atualizado",
	"user.suspended": "Foi suspenso",
	"user.reactivated": "Foi reativado",
	"user.deleted": "Foi excluído",
	"user.password_reset_triggered": "Recebeu reset de senha",
	"user.session_revoked": "Sessão revogada",
	"user.all_sessions_revoked": "Todas as sessões revogadas",
	"user.branch_linked": "Filial vinculada",
	"user.branch_unlinked": "Filial desvinculada",
};

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
				subtitle: item.actorName ? `por ${item.actorName}` : undefined,
				title: ACTION_LABELS[item.action] ?? item.action,
			}))}
			error={error}
			hasMore={hasMore}
			onLoadMore={loadMore}
			pending={pending}
		/>
	);
}
