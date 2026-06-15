import { db } from "@emach/db";
import { stockLevel } from "@emach/db/schema/inventory";
import { toolVariant } from "@emach/db/schema/tools";
import { and, countDistinct, eq, gt, inArray, lte } from "drizzle-orm";
import { cache } from "react";

import type { BranchScope } from "@/lib/branch-scope";

export const getReporCount = cache(
	async (scope: BranchScope): Promise<number> => {
		if (scope.kind === "scoped" && scope.branchIds.length === 0) {
			return 0;
		}

		const whereConditions = [
			gt(stockLevel.reorderPoint, 0),
			lte(stockLevel.quantity, stockLevel.reorderPoint),
		];

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
