import { EntityAuditLogTable } from "@/components/entity/entity-audit-log-table";

import { getUserActivity } from "../../data";

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

export async function ActivityTab({ userId }: { userId: string }) {
	const page = await getUserActivity(userId, null, 25);
	return (
		<EntityAuditLogTable
			actionLabels={ACTION_LABELS}
			emptyMessage="Sem atividade registrada"
			entries={page.items.map((it) => ({
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
	);
}
