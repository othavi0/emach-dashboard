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
			includeUnassigned: role === "admin",
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

// Um Pedido (leitura unitária: detalhe, atividade) é visível? Espelha
// `orderBranchCondition`: super_admin tudo; admin própria filial + triagem; user só filial.
export function orderInScope(
	scope: BranchScope,
	branchId: string | null
): boolean {
	if (scope.kind === "all") {
		return true;
	}
	if (branchId === null) {
		return scope.includeUnassigned;
	}
	return scope.branchIds.includes(branchId);
}

// Condição SQL de filial para uma coluna arbitrária (ex: sql`o.branch_id`, sql`branch_id`).
// undefined = sem filtro (super_admin). sql`false` = cego (nada). Trata triagem (NULL).
function branchCondForColumn(scope: BranchScope, col: SQL): SQL | undefined {
	if (scope.kind === "all") {
		return;
	}
	const parts: SQL[] = [];
	if (scope.branchIds.length > 0) {
		parts.push(
			sql`${col} IN (${sql.join(
				scope.branchIds.map((id) => sql`${id}`),
				sql`, `
			)})`
		);
	}
	if (scope.includeUnassigned) {
		parts.push(sql`${col} IS NULL`);
	}
	if (parts.length === 0) {
		return sql`false`;
	}
	return sql`(${sql.join(parts, sql` OR `)})`;
}

// Listagens de Pedidos com alias `o`.
export function orderBranchCondition(scope: BranchScope): SQL | undefined {
	return branchCondForColumn(scope, sql`o.branch_id`);
}

// Subqueries de order SEM alias (coluna `branch_id`). undefined = super_admin.
export function orderBranchConditionNoAlias(
	scope: BranchScope
): SQL | undefined {
	return branchCondForColumn(scope, sql`branch_id`);
}

// Fragmento ` AND (...)` p/ anexar a um WHERE existente em subquery raw (ex: estoque com alias `sl`/`sm2`).
export function branchAndFilter(scope: BranchScope, col: SQL): SQL {
	const cond = branchCondForColumn(scope, col);
	return cond ? sql` AND ${cond}` : sql``;
}
