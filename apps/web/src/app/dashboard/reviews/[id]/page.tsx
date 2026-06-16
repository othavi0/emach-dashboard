import { buttonVariants } from "@emach/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { ModerateActions } from "../_components/moderate-actions";
import { ReviewDetailCard } from "../_components/review-detail-card";
import { getReviewDetail } from "../data";

export const metadata: Metadata = {
	title: "Detalhe da avaliação",
};

interface ReviewDetailPageProps {
	params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({
	params,
}: ReviewDetailPageProps) {
	const session = await requireCapabilityOrRedirect(
		"reviews.read",
		"/dashboard/sem-acesso?recurso=Avaliações"
	);
	const { id } = await params;
	const review = await getReviewDetail(id);

	if (!review) {
		notFound();
	}

	const canModerate = await can(session, "reviews.moderate");

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-sm">Review</p>
					<h1 className="font-medium font-serif text-4xl tracking-tight">
						{review.toolName}
					</h1>
					<p className="text-muted-foreground text-sm">{review.clientName}</p>
				</div>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href="/dashboard/reviews"
				>
					Voltar
				</Link>
			</div>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_24rem]">
				<ReviewDetailCard review={review} />
				{canModerate && <ModerateActions review={review} />}
			</div>
		</div>
	);
}
