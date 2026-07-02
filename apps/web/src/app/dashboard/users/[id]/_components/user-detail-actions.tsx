"use client";

import { useActiveTab } from "@/components/entity/entity-client-tabs";
import { EditUserButton } from "./edit-user-button";
import { UserBranchLinkPanel } from "./user-branch-link-panel";

interface Props {
	linkedBranchIds: string[];
	userId: string;
}

/**
 * Ação contextual do header. "Editar usuário" na aba Perfil; "Vincular
 * filial" na aba Filiais. A tab ativa vem do contexto client do
 * EntityClientTabs (sem re-render do servidor ao trocar de tab).
 */
export function UserDetailActions({ userId, linkedBranchIds }: Props) {
	const tab = useActiveTab();

	if (tab === "branches") {
		return (
			<UserBranchLinkPanel linkedBranchIds={linkedBranchIds} userId={userId} />
		);
	}
	if (tab === "profile") {
		return <EditUserButton />;
	}
	return null;
}
