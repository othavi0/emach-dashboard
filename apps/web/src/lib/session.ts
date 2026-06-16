import { authDashboard, type DashboardSession } from "@emach/auth/dashboard";
// biome-ignore lint/style/noExportedImports: importado localmente para uso no return type de getUserStatus; re-exportado para consumidores
import type { UserStatus } from "@emach/db/schema/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { logger } from "./logger";

export type { UserStatus };

export type UserRole = "super_admin" | "admin" | "manager" | "user";

export const ROLE_WEIGHT: Record<UserRole, number> = {
	super_admin: 4,
	admin: 3,
	manager: 2,
	user: 1,
};

export function getUserStatus(session: DashboardSession): UserStatus {
	return (session.user.status ?? "pending") as UserStatus;
}

// cache() do React deduplica a resolução por-request: layout + page + guards
// chamam getCurrentSession independentemente mas recebem o mesmo objeto de sessão,
// permitindo que getUserCapabilities/getUserBranchScope (que também usam cache())
// acertem seu cache por identidade de argumento. Mesmo padrão de getUserBranchScope.
export const getCurrentSession = cache(
	async (): Promise<DashboardSession | null> => {
		try {
			return await authDashboard.api.getSession({
				headers: await headers(),
			});
		} catch (error) {
			// getSession só consulta o banco quando há cookie de sessão; uma exceção
			// aqui é falha real de infraestrutura (DB inacessível, env), não "deslogado".
			// Logamos e repropagamos para o error boundary tratar — distinto de uma
			// sessão ausente (null), que segue para o redirect de login.
			logger.error("getCurrentSession", error);
			throw error;
		}
	}
);

export const requireCurrentSession = async (): Promise<DashboardSession> => {
	const session = await getCurrentSession();

	if (!session?.user) {
		redirect("/login");
	}

	return session;
};

// Gates role-based religados (ADR-0016). `manager` tem peso de admin (alias).
export const requireRole = async (
	role: UserRole
): Promise<DashboardSession> => {
	const session = await requireCurrentSession();
	if (session.user.status !== "active") {
		throw new Error("Conta não ativa");
	}
	const actual = (session.user.role ?? "user") as UserRole;
	if (ROLE_WEIGHT[actual] < ROLE_WEIGHT[role]) {
		throw new Error(`Forbidden: role "${role}" requerida`);
	}
	return session;
};
