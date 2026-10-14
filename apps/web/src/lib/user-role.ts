import type { DashboardSession } from "@emach/auth/dashboard";
import { type UserRole, userRoleEnum } from "@emach/db/schema/auth";

// Better Auth tipa os additionalFields `role`/`status` como string solta; as
// colunas são os pgEnums user_role/user_status. Parse no boundary da sessão.
export function parseUserRole(
	value: string | null | undefined
): UserRole | undefined {
	return userRoleEnum.enumValues.find((role) => role === value);
}

export function getUserRole(session: DashboardSession): UserRole {
	return parseUserRole(session.user.role) ?? "user";
}
