import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import { userBranch } from "@emach/db/schema/inventory";
import { eq } from "drizzle-orm";
import { cache } from "react";

export type BranchScope = string[] | null;

export const getUserBranchScope = cache(
	async (session: DashboardSession): Promise<BranchScope> => {
		if (session.user.role === "super_admin") {
			return null;
		}
		const rows = await db
			.select({ branchId: userBranch.branchId })
			.from(userBranch)
			.where(eq(userBranch.userId, session.user.id));
		return rows.map((r) => r.branchId);
	}
);

export function inScope(scope: BranchScope, branchId: string): boolean {
	if (scope === null) {
		return true;
	}
	return scope.includes(branchId);
}
