import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCapability } from "@/lib/permissions";
import { ReviewsFilters } from "./_components/reviews-filters";
import { ReviewsInfinite } from "./_components/reviews-infinite";
import { getReviewsTabCounts, listReviews } from "./data";
import { reviewsListFiltersSchema } from "./schema";
import { REVIEW_TABS } from "./status-meta";

export const metadata: Metadata = {
	title: "Avaliações",
};

interface ReviewsPageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
	await requireCapability("reviews.read");

	const raw = await searchParams;
	const parsed = reviewsListFiltersSchema.safeParse(raw);
	const filters = parsed.success
		? parsed.data
		: reviewsListFiltersSchema.parse({});

	const currentTab =
		REVIEW_TABS.find((tab) => tab.key === filters.tab) ?? REVIEW_TABS[0];
	const hasFilters =
		filters.tab !== "pending" ||
		filters.rating !== undefined ||
		Boolean(filters.q) ||
		Boolean(filters.from) ||
		Boolean(filters.to);

	const sharedFilters = {
		rating: filters.rating,
		q: filters.q,
		from: filters.from,
		to: filters.to,
	};

	const [counts, reviews] = await Promise.all([
		getReviewsTabCounts(sharedFilters),
		listReviews({ status: currentTab.status, ...sharedFilters }),
	]);

	return (
		<>
			<PageHeader
				description="Fila de moderação das avaliações publicadas no site, filtrável por status e nota."
				title="Avaliações"
			/>

			<ReviewsFilters
				counts={counts}
				filters={{
					tab: filters.tab,
					rating: filters.rating,
					q: filters.q,
					from: filters.from,
					to: filters.to,
				}}
			/>

			{reviews.items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma avaliação encontrada</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Ajuste os filtros para ampliar a busca."
								: "Quando clientes publicarem novas avaliações, elas aparecerão aqui."}
						</EmptyDescription>
					</EmptyHeader>
					{hasFilters ? (
						<EmptyContent>
							<Link className="text-sm underline" href="/dashboard/reviews">
								Limpar filtros
							</Link>
						</EmptyContent>
					) : null}
				</Empty>
			) : (
				<ReviewsInfinite
					filters={filters}
					initial={reviews.items}
					initialCursor={reviews.nextCursor}
				/>
			)}
		</>
	);
}
