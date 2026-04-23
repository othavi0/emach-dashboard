import { authDashboard, type DashboardSession } from "@emach/auth/dashboard";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type UserRole = "admin" | "manager" | "user";

const ROLE_WEIGHT: Record<UserRole, number> = {
	admin: 3,
	manager: 2,
	user: 1,
};

export const getCurrentSession = async (): Promise<DashboardSession | null> => {
	return authDashboard.api.getSession({
		headers: await headers(),
	});
};

export const requireCurrentSession = async (): Promise<DashboardSession> => {
	const session = await getCurrentSession();

	if (!session?.user) {
		redirect("/login");
	}

	return session;
};

export const requireRole = async (role: UserRole): Promise<DashboardSession> => {
	const session = await requireCurrentSession();
	const currentRole = (session.user.role ?? "user") as UserRole;

	if (ROLE_WEIGHT[currentRole] < ROLE_WEIGHT[role]) {
		throw new Error(
			`Forbidden: role "${currentRole}" nao atende ao requisito "${role}"`
		);
	}

	return session;
};
