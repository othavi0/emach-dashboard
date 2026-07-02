import "server-only";

import { getUserCapabilities } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";

/**
 * Mesmo gate que hoje protege as abas Atividade/Sessões/"Vincular filial" no
 * page.tsx (requireUserDetailAccessOrRedirect): self ou users.manage. Aqui
 * lança em vez de redirecionar — os consumidores são o LazyTab (error +
 * retry) e as actions de paginação de activity em `users/actions.ts`, não
 * uma navegação de página inteira.
 */
export async function requireUserDetailAccess(targetUserId: string) {
	const session = await requireCurrentSession();
	if (session.user.status !== "active") {
		throw new Error("Conta não ativa");
	}
	if (session.user.id === targetUserId) {
		return session;
	}
	if (!(await getUserCapabilities(session)).has("users.manage")) {
		throw new Error("Acesso negado");
	}
	return session;
}
