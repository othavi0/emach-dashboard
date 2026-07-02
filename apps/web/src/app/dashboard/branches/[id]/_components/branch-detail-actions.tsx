"use client";

import { useActiveTab } from "@/components/entity/entity-client-tabs";
import { EditBranchButton } from "./edit-branch-button";
import { TeamLinkPanel } from "./team-link-panel";

interface Props {
	branchId: string;
	canManageBranch: boolean;
	canManageTeam: boolean;
}

/**
 * Ação contextual do header. "Vincular usuário" na aba Equipe; "Editar filial"
 * na Visão geral. A tab ativa vem do contexto client do EntityClientTabs (sem
 * re-render do servidor ao trocar de tab).
 */
export function BranchDetailActions({
	branchId,
	canManageBranch,
	canManageTeam,
}: Props) {
	const tab = useActiveTab();

	if (tab === "team" && canManageTeam) {
		return <TeamLinkPanel branchId={branchId} />;
	}
	if (tab === "overview" && canManageBranch) {
		return <EditBranchButton />;
	}
	return null;
}
