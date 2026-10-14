import type { DashboardSession } from "@emach/auth/dashboard";

/** Sessão completa de teste, com só id, role e status variando. */
export function makeSession(
	user: Pick<DashboardSession["user"], "id" | "role" | "status">
): DashboardSession {
	const at = new Date(0);

	return {
		session: {
			id: `session-${user.id}`,
			token: `token-${user.id}`,
			userId: user.id,
			expiresAt: at,
			createdAt: at,
			updatedAt: at,
		},
		user: {
			email: `${user.id}@test.local`,
			emailVerified: true,
			name: user.id,
			createdAt: at,
			updatedAt: at,
			...user,
		},
	};
}
