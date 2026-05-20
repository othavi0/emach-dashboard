import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableActionsCell,
	TableActionsHead,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { Eye } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { ReviewListItem } from "../data";
import { ReviewStatusBadge } from "./review-status-badge";
import { StarRating } from "./star-rating";

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

export function ReviewQueueTable({ reviews }: { reviews: ReviewListItem[] }) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-16">Produto</TableHead>
					<TableHead>Cliente</TableHead>
					<TableHead>Avaliação</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Data</TableHead>
					<TableActionsHead>Ação</TableActionsHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{reviews.map((review) => (
					<TableRow key={review.id}>
						<TableCell>
							{review.imageUrl ? (
								<Image
									alt={review.toolName}
									className="h-10 w-10 rounded-md object-cover"
									height={40}
									src={review.imageUrl}
									unoptimized
									width={40}
								/>
							) : (
								<div className="h-10 w-10 rounded-md border border-border border-dashed" />
							)}
						</TableCell>
						<TableCell>
							<div className="flex flex-col gap-1">
								<span className="font-medium">{review.clientName}</span>
								<span className="text-muted-foreground text-xs">
									{review.toolName}
								</span>
							</div>
						</TableCell>
						<TableCell>
							<div className="flex flex-col gap-1">
								<StarRating rating={review.rating} />
								<span className="text-muted-foreground text-sm">
									{review.bodyPreview}
								</span>
							</div>
						</TableCell>
						<TableCell>
							<ReviewStatusBadge status={review.status} />
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{DATE_FORMATTER.format(review.createdAt)}
						</TableCell>
						<TableActionsCell>
							<Link
								aria-label={`Revisar avaliação de ${review.toolName}`}
								className={buttonVariants({
									size: "icon-sm",
									variant: "outline",
								})}
								href={`/dashboard/reviews/${review.id}`}
							>
								<Eye aria-hidden className="size-3.5" />
							</Link>
						</TableActionsCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
