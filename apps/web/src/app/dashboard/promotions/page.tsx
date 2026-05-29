import { db } from "@emach/db";
import { tool } from "@emach/db/schema/tools";
import { buttonVariants } from "@emach/ui/components/button";
import { asc } from "drizzle-orm";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { PromotionsFilters } from "./_components/promotions-filters";
import { PromotionsGrid } from "./_components/promotions-grid";
import {
	fetchPromotionsPage,
	getPromotion,
	type ListPromotionsOptions,
	type PromotionSort,
	type PromotionStatus,
} from "./actions";

interface PageProps {
	searchParams: Promise<{
		type?: string;
		search?: string;
		status?: string;
		sort?: string;
		toolId?: string;
		discountMin?: string;
		discountMax?: string;
		view?: string;
		edit?: string;
	}>;
}

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set<PromotionStatus | "all">([
	"active",
	"scheduled",
	"expired",
	"inactive",
	"all",
]);

const VALID_SORT = new Set<PromotionSort>([
	"createdDesc",
	"createdAsc",
	"discountDesc",
	"discountAsc",
	"endsAtAsc",
]);

function parseDiscount(raw?: string): number | undefined {
	if (!raw) {
		return;
	}
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}

export default async function PromotionsPage({ searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const canMutate = can(session.user.role, "promotions.manage");

	const params = await searchParams;
	const search = params.search ?? "";
	const typeParam = params.type;
	const typeFilter =
		typeParam === "promotion" || typeParam === "promocode" ? typeParam : "all";
	const statusFilter = (
		VALID_STATUS.has(params.status as PromotionStatus | "all")
			? params.status
			: "all"
	) as PromotionStatus | "all";
	const sort = (
		VALID_SORT.has(params.sort as PromotionSort) ? params.sort : "createdDesc"
	) as PromotionSort;
	const discountMin = parseDiscount(params.discountMin);
	const discountMax = parseDiscount(params.discountMax);
	const toolId = params.toolId;

	const filters: ListPromotionsOptions = {
		type: typeFilter,
		search: search || undefined,
		status: statusFilter,
		sort,
		toolId,
		discountMin,
		discountMax,
	};

	const [page, availableTools, selectedPromotion, editPromotion] =
		await Promise.all([
			fetchPromotionsPage({ filters, cursor: null }),
			db
				.select({ id: tool.id, name: tool.name })
				.from(tool)
				.orderBy(asc(tool.name)),
			params.view ? getPromotion(params.view) : Promise.resolve(null),
			params.edit ? getPromotion(params.edit) : Promise.resolve(null),
		]);

	return (
		<>
			<PageHeader
				action={
					canMutate ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/promotions/new"
						>
							Nova promoção
						</Link>
					) : null
				}
				description="Gerencie promoções automáticas e cupons aplicados a ferramentas específicas."
				title="Promoções"
			/>

			<PromotionsFilters availableTools={availableTools} />

			<PromotionsGrid
				availableTools={availableTools}
				canMutate={canMutate}
				editPromotion={editPromotion}
				filters={filters}
				initial={page.items}
				initialCursor={page.nextCursor}
				selectedPromotion={selectedPromotion}
			/>
		</>
	);
}
