"use server";

import { db } from "@emach/db";
import { category } from "@emach/db/schema/categories";
import { asc, eq } from "drizzle-orm";

import {
	type BranchStockFiltersInput,
	type BranchStockRow,
	type BranchStockSort,
	type BranchStockStatus,
	fetchBranchStockPage,
} from "@/app/dashboard/stock/branch-stock-data";
import type { InfiniteResult } from "@/lib/infinite";
import {
	can,
	requireCapability,
	requireCapabilityWithContext,
} from "@/lib/permissions";
import { type ActiveSupplierOption, getActiveSuppliers } from "@/lib/suppliers";
import { type BranchTeamRow, getBranchTeam } from "../../data";
import { fetchBranchActivityTools } from "../activity-data";

export async function fetchBranchTeamAction(
	branchId: string
): Promise<BranchTeamRow[]> {
	// Mesma capability que hoje gate a inclusão da tab "Equipe" no page.tsx.
	await requireCapability("users.manage");
	return await getBranchTeam(branchId);
}

export async function fetchBranchActivityToolsAction(
	branchId: string
): Promise<Array<{ id: string; name: string }>> {
	// Mesma capability do wrapper fetchBranchActivityPage (defesa-em-profundidade:
	// a impl em activity-data.ts já guarda com stock.read).
	await requireCapabilityWithContext("branches.read", {
		targetBranchIds: [branchId],
	});
	return await fetchBranchActivityTools(branchId);
}

const SORT_MAP: Record<string, BranchStockSort> = {
	name: "name",
	"stock-low": "stockLow",
	"stock-high": "stockHigh",
};

const STATUS_MAP: Record<string, BranchStockStatus> = {
	critical: "critical",
	reorder: "reorder",
	ok: "ok",
};

export interface BranchStockTabData {
	canMutate: boolean;
	categories: Array<{ depth: number; id: string; name: string }>;
	filters: BranchStockFiltersInput;
	first: InfiniteResult<BranchStockRow>;
	suppliers: ActiveSupplierOption[];
}

export async function fetchBranchStockTabAction(input: {
	branchId: string;
	categoryId?: string;
	search?: string;
	sort?: string;
	status?: string;
}): Promise<BranchStockTabData> {
	// Mesma capability + branch-scoping que o StockTab (Server Component) exigia
	// hoje via requireCapabilityWithContextOrRedirect("stock.adjust", ...).
	const session = await requireCapabilityWithContext("stock.adjust", {
		targetBranchIds: [input.branchId],
	});
	const canMutate = await can(session, "stock.adjust");

	const [categories, suppliers] = await Promise.all([
		db
			.select({ depth: category.depth, id: category.id, name: category.name })
			.from(category)
			.where(eq(category.isActive, true))
			.orderBy(asc(category.path)),
		getActiveSuppliers(),
	]);

	const filters: BranchStockFiltersInput = {
		branchId: input.branchId,
		categoryId: input.categoryId || undefined,
		search: input.search?.trim() || undefined,
		sort: SORT_MAP[input.sort ?? ""] ?? "urgency",
		status: STATUS_MAP[input.status ?? ""] ?? undefined,
	};

	const first = await fetchBranchStockPage({ filters, cursor: null });

	return { categories, suppliers, filters, first, canMutate };
}
