import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import Image from "next/image";
import Link from "next/link";

import type { ReviewListItem } from "../data";
import { ReviewStatusBadge } from "./review-status-badge";

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function renderStars(rating: number) {
	return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

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
					<TableHead className="w-28 text-right">Ação</TableHead>
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
								<span className="font-medium text-amber-700 text-sm">
									{renderStars(review.rating)}
								</span>
								<span className="text-muted-foreground text-xs">
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
						<TableCell className="text-right">
							<Link
								className={buttonVariants({ size: "sm", variant: "ghost" })}
								href={`/dashboard/reviews/${review.id}`}
							>
								Revisar
							</Link>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
