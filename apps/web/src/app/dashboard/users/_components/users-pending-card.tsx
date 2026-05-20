import type { PendingRow } from "@/components/pending-panel";
import { PendingPanel } from "@/components/pending-panel";
import { fetchPendingUsersAction } from "../actions";

interface Props {
	count: number;
	initial: PendingRow[];
	initialCursor: string | null;
}

export function UsersPendingCard({ initial, initialCursor, count }: Props) {
	return (
		<PendingPanel
			emptyMessage="Nenhum usuário aguardando aprovação."
			tabs={[
				{
					id: "approvals",
					label: "Aprovações",
					count,
					role: count > 0 ? "warning" : "default",
					initial,
					initialCursor,
					fetchPage: fetchPendingUsersAction,
				},
			]}
			title="Atenção em usuários"
		/>
	);
}
