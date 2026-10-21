import { db } from "@emach/db";
import { stockLevel } from "@emach/db/schema/inventory";
import { toolVariant } from "@emach/db/schema/tools";
import { and, countDistinct, eq, inArray, type SQL, sql } from "drizzle-orm";
import { cache } from "react";

import type { BranchScope } from "@/lib/branch-scope";

/** Estoque baixo: o nível tem ponto de reposição e a quantidade chegou nele. */
export const belowReorderPoint: SQL = sql`(${stockLevel.reorderPoint} > 0 and ${stockLevel.quantity} <= ${stockLevel.reorderPoint})`;

export const getReporCount = cache(
	async (scope: BranchScope): Promise<number> => {
		if (scope.kind === "scoped" && scope.branchIds.length === 0) {
			return 0;
		}

		const whereConditions = [belowReorderPoint];

		if (scope.kind === "scoped") {
			whereConditions.push(inArray(stockLevel.branchId, scope.branchIds));
		}

		const [row] = await db
			.select({ value: countDistinct(toolVariant.toolId) })
			.from(stockLevel)
			.innerJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
			.where(and(...whereConditions));

		return Number(row?.value ?? 0);
	}
);
