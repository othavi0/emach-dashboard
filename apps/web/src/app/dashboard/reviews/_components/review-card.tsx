import Link from "next/link";

import type { ReviewListItem } from "../data";
import { ReviewStatusBadge } from "./review-status-badge";
import { StarRating } from "./star-rating";

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

export function ReviewCard({ review }: { review: ReviewListItem }) {
	return (
		<Link
			className="group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`/dashboard/reviews/${review.id}`}
		>
			{/* Imagem do produto com badge de status */}
			<div className="relative overflow-hidden">
				{review.imageUrl ? (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
					<img
						alt={review.toolName}
						className="aspect-[16/9] w-full object-cover transition-[filter] duration-150 group-hover:brightness-110"
						src={review.imageUrl}
					/>
				) : (
					<div
						aria-hidden
						className="aspect-[16/9] w-full border-dashed bg-muted/40"
					/>
				)}
				<div className="absolute top-2 right-2">
					<ReviewStatusBadge status={review.status} />
				</div>
			</div>

			{/* Corpo */}
			<div className="flex flex-col gap-1 px-4 pt-3 pb-3">
				<span className="line-clamp-2 font-semibold text-[15px] text-foreground leading-[1.3] tracking-tight">
					{review.toolName}
				</span>
				<span className="text-muted-foreground text-xs">
					{review.clientName}
				</span>
				<p className="mt-0.5 line-clamp-2 text-[13px] text-foreground/85">
					{review.bodyPreview}
				</p>
			</div>

			{/* Rodapé edge-to-edge: estrelas (nota) + data */}
			<div className="flex items-center justify-between border-border border-t px-4 py-2.5 text-muted-foreground text-xs">
				<StarRating rating={review.rating} />
				<span>{DATE_FORMATTER.format(review.createdAt)}</span>
			</div>
		</Link>
	);
}
