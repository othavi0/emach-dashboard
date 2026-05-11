import { authDashboard, type DashboardSession } from "@emach/auth/dashboard";
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

export const requireRole = async (
	role: UserRole
): Promise<DashboardSession> => {
	const session = await requireCurrentSession();
	const currentRole = (session.user.role ?? "user") as UserRole;

	if (ROLE_WEIGHT[currentRole] < ROLE_WEIGHT[role]) {
		throw new Error(
			`Forbidden: role "${currentRole}" nao atende ao requisito "${role}"`
		);
	}

	return session;
};
