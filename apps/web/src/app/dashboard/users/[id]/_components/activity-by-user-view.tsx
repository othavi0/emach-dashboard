"use client";

import { EntityAuditLogTable } from "@/components/entity/entity-audit-log-table";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchUserActivityByUserPage } from "../../actions";
import type { UserActivityRow } from "../../data";

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
		<div className="flex flex-col gap-3">
			<EntityAuditLogTable
				actionLabels={ACTION_LABELS}
				emptyMessage="Sem ações registradas por este usuário"
				entries={items.map((it) => ({
					id: it.id,
					at: it.createdAt,
					action: it.action,
					actor: { id: userId, name: "Este usuário", type: "user" as const },
					target: it.targetId
						? { label: `${it.targetType ?? "—"} · ${it.targetId.slice(0, 8)}` }
						: undefined,
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
