"use client";

import { useActiveTab } from "@/components/entity/entity-client-tabs";
import { AnonymizeClientDialog } from "../../_components/anonymize-client-dialog";
import { EditCustomerButton } from "../../_components/edit-customer-button";
import { ResetPasswordDialog } from "../../_components/reset-password-dialog";
import { RevokeAllSessionsDialog } from "../../_components/revoke-all-sessions-dialog";

interface Props {
	canAnonymize: boolean;
	canEdit: boolean;
	canManageSessions: boolean;
	canResetPassword: boolean;
	clientId: string;
	clientName: string;
	sessionsCount: number;
}

/**
 * Ação contextual do header. "Editar cliente" na aba Perfil; reset de senha e
 * revogar sessões na aba Sessões. A tab ativa vem do contexto client do
 * EntityClientTabs (sem re-render do servidor ao trocar de tab).
 *
 * "Anonimizar cliente" fica na aba Perfil, só para quem tem
 * customers.anonymize e enquanto o cliente não foi anonimizado.
 *
 * sessionsCount vem de um aggregate leve (getCustomerSessionsCount), não da
 * coleção carregada pela aba lazy — a mesma decisão de kpis.teamSize em
 * branches/[id].
 */
export function CustomerDetailActions({
	canAnonymize,
	canEdit,
	canManageSessions,
	canResetPassword,
	clientId,
	clientName,
	sessionsCount,
}: Props) {
	const tab = useActiveTab();

	if (tab === "perfil") {
		return (
			<>
				{canEdit ? <EditCustomerButton /> : null}
				{canAnonymize ? (
					<AnonymizeClientDialog clientId={clientId} clientName={clientName} />
				) : null}
			</>
		);
	}

	if (tab === "sessoes") {
		return (
			<>
				{canResetPassword ? (
					<ResetPasswordDialog clientId={clientId} clientName={clientName} />
				) : null}
				{canManageSessions && sessionsCount > 0 ? (
					<RevokeAllSessionsDialog
						clientId={clientId}
						sessionCount={sessionsCount}
					/>
				) : null}
			</>
		);
	}

	return null;
}
