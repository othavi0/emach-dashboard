import type { UserRole } from "@emach/db/schema/auth";

const HIERARCHY: readonly UserRole[] = ["super_admin", "admin", "user"];

/**
 * Roles que um ator pode atribuir a outro user durante a aprovação.
 * Regra: pode atribuir o próprio role e abaixo; `user` não tem capability de aprovação.
 */
export function allowedApprovalRoles(actorRole: UserRole): UserRole[] {
	if (actorRole === "super_admin") {
		return [...HIERARCHY];
	}
	const start = HIERARCHY.indexOf(actorRole);
	// "user" (último da hierarquia) não pode aprovar ninguém
	if (start === -1 || start >= HIERARCHY.length - 1) {
		return [];
	}
	return HIERARCHY.slice(start);
}
