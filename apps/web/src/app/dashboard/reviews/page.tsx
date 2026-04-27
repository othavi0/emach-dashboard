import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import {
	NativeSelect,
	NativeSelectOption,
} from "@emach/ui/components/native-select";
import Link from "next/link";

import { requireCapability } from "@/lib/permissions";
import { ReviewQueueTable } from "./_components/review-queue-table";
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
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Avaliações</h1>
				<p className="text-muted-foreground text-sm">
					Fila simples de moderação com foco em reviews pendentes do site.
				</p>
			</div>

			<form
				action="/dashboard/reviews"
				className="flex max-w-xs flex-col gap-1"
			>
				<label
					className="text-muted-foreground text-xs"
					htmlFor="reviews-status"
				>
					Status
				</label>
				<NativeSelect
					defaultValue={currentStatus}
					id="reviews-status"
					name="status"
				>
					<NativeSelectOption value="pending">Pendentes</NativeSelectOption>
					<NativeSelectOption value="approved">Aprovadas</NativeSelectOption>
					<NativeSelectOption value="rejected">Rejeitadas</NativeSelectOption>
					<NativeSelectOption value="spam">Spam</NativeSelectOption>
				</NativeSelect>
				<button className="sr-only" type="submit">
					Filtrar
				</button>
			</form>

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
		</div>
	);
}
