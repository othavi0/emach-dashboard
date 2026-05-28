import { db } from "@emach/db";
import { tool } from "@emach/db/schema/tools";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { asc } from "drizzle-orm";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCurrentSession } from "@/lib/session";
import { PromotionsFilters } from "./_components/promotions-filters";
import { PromotionsGrid } from "./_components/promotions-grid";
import {
	getPromotion,
	listPromotions,
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Server Component com múltiplos filtros de searchParams — complexidade necessária
export default async function PromotionsPage({ searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const role = session.user.role ?? "user";
	const canMutate =
		role === "admin" || role === "super_admin" || role === "manager";

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

	const [promotions, availableTools, selectedPromotion] = await Promise.all([
		listPromotions({
			type: typeFilter,
			search: search || undefined,
			status: statusFilter,
			sort,
			toolId,
			discountMin,
			discountMax,
		}),
		db
			.select({ id: tool.id, name: tool.name })
			.from(tool)
			.orderBy(asc(tool.name)),
		params.view ? getPromotion(params.view) : Promise.resolve(null),
	]);

	const hasFilters = Boolean(
		typeParam ||
			search ||
			params.status ||
			toolId ||
			discountMin !== undefined ||
			discountMax !== undefined
	);
	const isEmpty = promotions.length === 0;

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

			<PromotionsFilters
				availableTools={availableTools}
				initialDiscountMax={params.discountMax ?? ""}
				initialDiscountMin={params.discountMin ?? ""}
				initialSearch={search}
				initialSort={sort}
				initialStatus={statusFilter}
				initialToolId={toolId ?? "all"}
				initialType={typeFilter}
			/>

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>
							{hasFilters
								? "Nenhuma promoção encontrada para os filtros aplicados"
								: "Nenhuma promoção cadastrada"}
						</EmptyTitle>
						{!hasFilters && (
							<EmptyDescription>
								Comece cadastrando a primeira promoção ou código promocional.
							</EmptyDescription>
						)}
					</EmptyHeader>
					<EmptyContent>
						{hasFilters ? (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/promotions"
							>
								Limpar filtros
							</Link>
						) : (
							canMutate && (
								<Link
									className={buttonVariants({ variant: "default" })}
									href="/dashboard/promotions/new"
								>
									Nova promoção
								</Link>
							)
						)}
					</EmptyContent>
				</Empty>
			) : (
				<PromotionsGrid
					canMutate={canMutate}
					promotions={promotions}
					selectedPromotion={selectedPromotion}
				/>
			)}
		</>
	);
}
