"use client";

import { EntityAuditLogTable } from "@/components/entity/entity-audit-log-table";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchUserActivityAffectingPage } from "../../actions";
import type { UserActivityRow } from "../../data";

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
		<div className="flex flex-col gap-3">
			<EntityAuditLogTable
				actionLabels={ACTION_LABELS}
				emptyMessage="Nenhuma alteração registrada neste usuário"
				entries={items.map((it) => ({
					id: it.id,
					at: it.createdAt,
					action: it.action,
					actor: {
						id: "",
						name: it.actorName ?? "Usuário deletado",
						type: "user" as const,
					},
					target: undefined,
					before: null,
					after: it.metadata,
				}))}
			/>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
