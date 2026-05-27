import type { DashboardSession } from "@emach/auth/dashboard";
import { cache } from "react";

// ⚠️ Gates role-based desligados em 2026-05-27 (ver docs/adr/0012-disable-role-based-gates.md).
// Versão original (consulta a `user_branch`) recuperável via `git log -p -- apps/web/src/lib/branch-scope.ts`.

export type BranchScope = string[] | null;

// `cache()` mantido para preservar a assinatura — voltará a memoizar I/O ao reativar gates.
export const getUserBranchScope = cache(
	async (_session: DashboardSession): Promise<BranchScope> => null
);

export function inScope(scope: BranchScope, branchId: string): boolean {
	if (scope === null) {
		return true;
	}
	return scope.includes(branchId);
}
