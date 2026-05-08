import type { UserRole } from "@emach/db/schema/auth";
import { buttonVariants } from "@emach/ui/components/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireCapability } from "@/lib/permissions";
import { ModerateActions } from "../_components/moderate-actions";
import { ReviewDetailCard } from "../_components/review-detail-card";
import { getReviewDetail } from "../data";

interface ReviewDetailPageProps {
	params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({
	params,
}: ReviewDetailPageProps) {
	const session = await requireCapability("reviews.read");
	const { id } = await params;
	const review = await getReviewDetail(id);

	if (!review) {
		notFound();
	}

	const role = (session.user.role ?? "user") as UserRole;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-muted-foreground text-sm">Review</p>
					<h1 className="font-medium text-2xl tracking-tight">
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
				{can(role, "reviews.moderate") && <ModerateActions review={review} />}
			</div>
		</div>
	);
}
