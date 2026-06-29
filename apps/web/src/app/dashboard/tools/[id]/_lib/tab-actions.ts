"use server";

import type { ActiveBranchOption } from "@/app/dashboard/branches/data";
import { getScopedActiveBranches } from "@/app/dashboard/branches/data";
import {
	fetchToolActivityPage,
	type ToolActivityRow,
} from "@/app/dashboard/stock/tool-activity-data";
import type { InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import type { ActiveSupplierOption } from "@/lib/suppliers";
import { getActiveSuppliers } from "@/lib/suppliers";
import type { ToolReviewSummary } from "./reviews-data";
import { getToolReviewsSummary } from "./reviews-data";

// Espelha os defaults do ActivityTab original (activity-tab.tsx).
const DEFAULT_REASONS = [
	"entrada_compra",
	"saida_venda",
	"ajuste_inventario",
	"perda",
	"outro",
];

export async function fetchToolActivityInitAction(toolId: string): Promise<{
	items: ToolActivityRow[];
	nextCursor: string | null;
	branches: ActiveBranchOption[];
}> {
	// Mesmo guard de fetchToolActivityPageAction (stock/actions.ts) no caminho sem branchId.
	await requireCapability("stock.read");
	const [first, branches]: [
		InfiniteResult<ToolActivityRow>,
		ActiveBranchOption[],
	] = await Promise.all([
		fetchToolActivityPage(
			{ toolId, period: "30d", reasons: DEFAULT_REASONS },
			null
		),
		getScopedActiveBranches(),
	]);
	return { items: first.items, nextCursor: first.nextCursor, branches };
}

export async function fetchToolReviewsAction(
	toolId: string
): Promise<ToolReviewSummary> {
	await requireCapability("reviews.read");
	return await getToolReviewsSummary(toolId);
}

export async function fetchActiveSuppliersAction(): Promise<
	ActiveSupplierOption[]
> {
	await requireCapability("stock.read");
	return await getActiveSuppliers();
}
