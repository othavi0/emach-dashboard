import {
	type AuditEntry,
	EntityAuditLogTable,
} from "@/components/entity/entity-audit-log-table";
import type { SupplierAuditRow } from "../../data";

const ACTION_LABELS: Record<string, string> = {
	created: "Criado",
	profile_updated: "Atualizado",
	deleted: "Removido",
	archived: "Arquivado",
	restored: "Restaurado",
};

export function HistoryTab({ rows }: { rows: SupplierAuditRow[] }) {
	const entries: AuditEntry[] = rows.map((r) => ({
		id: r.id,
		action: r.action,
		actor: {
			id: null,
			name: r.actorName ?? "Sistema",
			type: r.actorName ? "user" : "system",
		},
		at: r.createdAt,
		before: r.beforeJson,
		after: r.afterJson,
		reason: r.reason,
	}));

	return (
		<EntityAuditLogTable
			actionLabels={ACTION_LABELS}
			emptyMessage="Sem registros de alteração."
			entries={entries}
		/>
	);
}
