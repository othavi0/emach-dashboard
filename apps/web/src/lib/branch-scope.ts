import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import { userBranch } from "@emach/db/schema/inventory";
import { eq, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import type { UserRole } from "@/lib/session";

export type BranchScope =
	| { kind: "all" }
	| { kind: "scoped"; branchIds: string[]; includeUnassigned: boolean };

export const getUserBranchScope = cache(
	async (session: DashboardSession): Promise<BranchScope> => {
		const role = (session.user.role ?? "user") as UserRole;
		if (role === "super_admin") {
			return { kind: "all" };
		}
		const rows = await db
			.select({ branchId: userBranch.branchId })
			.from(userBranch)
			.where(eq(userBranch.userId, session.user.id));
		return {
			kind: "scoped",
			branchIds: rows.map((r) => r.branchId),
			includeUnassigned: role === "admin" || role === "manager",
		};
	}
);

export function inScope(scope: BranchScope, branchId: string): boolean {
	return scope.kind === "all" || scope.branchIds.includes(branchId);
}

export function isBlindScope(scope: BranchScope): boolean {
	return (
		scope.kind === "scoped" &&
		scope.branchIds.length === 0 &&
		!scope.includeUnassigned
	);
}

// Condição SQL para listagens de Pedidos (alias `o`). Trata Pedido na triagem (branch_id NULL).
// undefined = sem filtro (super_admin). sql`false` = cego (nada).
export function orderBranchCondition(scope: BranchScope): SQL | undefined {
	if (scope.kind === "all") {
		return;
	}
	const parts: SQL[] = [];
	if (scope.branchIds.length > 0) {
		parts.push(
			sql`o.branch_id IN (${sql.join(
				scope.branchIds.map((id) => sql`${id}`),
				sql`, `
			)})`
		);
	}
	if (scope.includeUnassigned) {
		parts.push(sql`o.branch_id IS NULL`);
	}
	if (parts.length === 0) {
		return sql`false`;
	}
	return sql`(${sql.join(parts, sql` OR `)})`;
}
