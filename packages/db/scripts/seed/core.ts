// packages/db/scripts/seed/core.ts
import { branch, userBranch } from "@emach/db/schema/inventory";
import type { SeedContext, Tx } from "./context";

const BRANCHES = [
	{ name: "Matriz — São Paulo", isDefault: true },
	{ name: "Filial — Campinas", isDefault: false },
	{ name: "Filial — Ribeirão Preto", isDefault: false },
];

export async function seedCore(tx: Tx, ctx: SeedContext): Promise<void> {
	for (const b of BRANCHES) {
		const id = crypto.randomUUID();
		await tx
			.insert(branch)
			.values({ id, name: b.name, isDefault: b.isDefault });
		ctx.branchIds.push(id);
		if (b.isDefault) {
			ctx.defaultBranchId = id;
		}
	}
	for (const userId of ctx.staffUserIds) {
		for (const branchId of ctx.branchIds) {
			await tx.insert(userBranch).values({ userId, branchId });
		}
	}
}
