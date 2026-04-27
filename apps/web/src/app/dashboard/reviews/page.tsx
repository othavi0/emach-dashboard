import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCapability } from "@/lib/permissions";
import { ReviewQueueTable } from "./_components/review-queue-table";
import { ReviewsFilters } from "./_components/reviews-filters";
import { listReviews, REVIEW_STATUS_LABELS } from "./data";

interface ReviewsPageProps {
	searchParams: Promise<{ status?: string }>;
}

export const dynamic = "force-dynamic";

export default async function ReviewsPage({ searchParams }: ReviewsPageProps) {
	await requireCapability("reviews.read");
	const params = await searchParams;
	const status = params.status;
	const reviews = await listReviews(status);
	const currentStatus =
		status === "approved" ||
		status === "rejected" ||
		status === "spam" ||
		status === "pending"
			? status
			: "pending";

	return (
		<>
			<PageHeader
				description="Fila simples de moderação com foco em reviews pendentes do site."
				title="Avaliações"
			/>

			<ReviewsFilters />

			{reviews.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>
							Nenhuma review em {REVIEW_STATUS_LABELS[currentStatus]}
						</EmptyTitle>
						<EmptyDescription>
							Quando clientes publicarem novas avaliações, elas aparecerão aqui.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link
							className="text-sm underline"
							href="/dashboard/reviews?status=pending"
						>
							Ver pendentes
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<ReviewQueueTable reviews={reviews} />
			)}
		</>
	);
}
