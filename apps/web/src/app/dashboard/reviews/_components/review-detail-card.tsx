import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import Image from "next/image";
import Link from "next/link";

import { formatDate } from "@/lib/format/datetime";
import type { ReviewDetail } from "../data";
import { ReviewStatusBadge } from "./review-status-badge";
import { StarRating } from "./star-rating";

export function ReviewDetailCard({ review }: { review: ReviewDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-3">
					<span className="font-medium text-2xl tracking-tight">
						Avaliação do cliente
					</span>
					<ReviewStatusBadge status={review.status} />
				</CardTitle>
				<CardDescription>
					Recebida em {formatDate(review.createdAt)}
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
				<div className="space-y-4">
					<div className="overflow-hidden border border-border">
						{review.imageUrl ? (
							<Image
								alt={review.toolName}
								className="h-56 w-full object-cover"
								height={224}
								src={review.imageUrl}
								unoptimized
								width={240}
							/>
						) : (
							<div className="flex h-56 items-center justify-center bg-muted text-muted-foreground text-sm">
								Sem imagem
							</div>
						)}
					</div>

					<div className="space-y-2 text-sm">
						<p>
							<strong>Produto:</strong>{" "}
							<Link
								className="underline"
								href={`/dashboard/tools/${review.toolId}`}
							>
								{review.toolName}
							</Link>
						</p>
						<p>
							<strong>Cliente:</strong> {review.clientName} •{" "}
							{review.clientEmail}
						</p>
						<p>
							<strong>Pedido:</strong>{" "}
							<Link
								className="underline"
								href={`/dashboard/orders/${review.orderId}`}
							>
								Abrir pedido
							</Link>
						</p>
						<p className="flex items-center gap-2">
							<strong>Nota:</strong>
							<StarRating rating={review.rating} />
						</p>
					</div>
				</div>

				<div className="space-y-4">
					<div className="space-y-2">
						{review.title && (
							<h2 className="font-medium text-xl tracking-tight">
								{review.title}
							</h2>
						)}
						<p className="text-sm leading-7">{review.body}</p>
					</div>

					{review.moderatedAt && (
						<div className="border border-border p-4 text-sm">
							<p className="font-medium">Última moderação</p>
							<p className="text-muted-foreground">
								{review.moderatedByName ?? "Usuário"} •{" "}
								{formatDate(review.moderatedAt)}
							</p>
							{review.moderationNote && (
								<p className="mt-2">{review.moderationNote}</p>
							)}
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
