/**
 * Rótulos humanos por tipo de ação de atividade, em duas vozes.
 * Fonte única compartilhada pelas views de atividade (feita por / sofrida)
 * e pela prévia de atividade do Perfil.
 */

/** Voz passiva: o que aconteceu COM o usuário (ele é o alvo). */
export const ACTIVITY_LABELS_AFFECTING: Record<string, string> = {
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

/** Voz ativa: o que o usuário FEZ (ele é o ator). */
export const ACTIVITY_LABELS_BY: Record<string, string> = {
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
