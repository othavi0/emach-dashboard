import { authDashboard, type DashboardSession } from "@emach/auth/dashboard";
// biome-ignore lint/style/noExportedImports: importado localmente para uso no return type de getUserStatus; re-exportado para consumidores
import type { UserStatus } from "@emach/db/schema/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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

export const getCurrentSession = async (): Promise<DashboardSession | null> =>
	authDashboard.api.getSession({
		headers: await headers(),
	});

export const requireCurrentSession = async (): Promise<DashboardSession> => {
	const session = await getCurrentSession();

	if (!session?.user) {
		redirect("/login");
	}

	return session;
};

// ⚠️ Gates role-based desligados em 2026-05-27 (ver docs/adr/0012-disable-role-based-gates.md).
// Validação por ROLE_WEIGHT recuperável via `git log -p -- apps/web/src/lib/session.ts`.
export const requireRole = async (
	_role: UserRole
): Promise<DashboardSession> => {
	const session = await requireCurrentSession();
	if (session.user.status !== "active") {
		throw new Error("Conta não ativa");
	}
	return session;
};
