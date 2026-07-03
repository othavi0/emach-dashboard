"use client";

import { useActiveTab } from "@/components/entity/entity-client-tabs";
import { EditUserButton } from "./edit-user-button";
import { UserBranchLinkPanel } from "./user-branch-link-panel";

interface Props {
	canManageBranches: boolean;
	editLabel: string;
	linkedBranchIds: string[];
	userId: string;
}

/**
 * Ação contextual do header. "Editar usuário" na aba Perfil; "Vincular
 * filial" na aba Filiais (só quando `canManageBranches`). A tab ativa vem do
 * contexto client do EntityClientTabs (sem re-render do servidor ao trocar
 * de tab). A troca entre "editar meus dados" e "editar usuário admin" é
 * decidida em page.tsx (qual sheet abre e o texto de `editLabel`).
 */
export function UserDetailActions({
	userId,
	linkedBranchIds,
	canManageBranches,
	editLabel,
}: Props) {
	const tab = useActiveTab();

	if (tab === "branches") {
		if (!canManageBranches) {
			return null;
		}
		return (
			<UserBranchLinkPanel linkedBranchIds={linkedBranchIds} userId={userId} />
		);
	}
	if (tab === "profile") {
		return <EditUserButton label={editLabel} />;
	}
	return null;
}
