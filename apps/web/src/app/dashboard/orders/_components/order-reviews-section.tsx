import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import Link from "next/link";

import type { OrderReviewRow, OrderReviewState } from "../data";

interface OrderReviewsSectionProps {
	rows: OrderReviewRow[];
}

const STATE_LABEL: Record<OrderReviewState, string> = {
	has_review: "Avaliado",
	no_review_open: "Aguardando avaliação",
	no_review_expired: "Janela encerrada",
	order_not_paid: "Pendente de pagamento",
};

const STATE_VARIANT: Record<
	OrderReviewState,
	"outline" | "success" | "warning"
> = {
	has_review: "success",
	no_review_open: "warning",
	no_review_expired: "outline",
	order_not_paid: "warning",
};

const REVIEW_STATUS_LABEL: Record<string, string> = {
	pending: "Pendente moderação",
	approved: "Aprovado",
	rejected: "Rejeitado",
	spam: "Spam",
};

const REVIEW_STATUS_VARIANT: Record<
	string,
	"destructive" | "success" | "warning"
> = {
	pending: "warning",
	approved: "success",
	rejected: "destructive",
	spam: "destructive",
};

export function OrderReviewsSection({ rows }: OrderReviewsSectionProps) {
	if (rows.length === 0) {
		return null;
	}

	const allUnpaid = rows.every((r) => r.reviewState === "order_not_paid");

	return (
		<Card>
			<CardHeader>
				<CardTitle>Avaliações</CardTitle>
				<CardDescription>
					{allUnpaid
						? "Pedido ainda não pago — avaliações ficarão disponíveis após a confirmação."
						: "Status das avaliações por ferramenta deste pedido (janela de 90 dias após pagamento)."}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{rows.map((row) => (
					<div
						className="flex items-start gap-3 rounded-md border border-border p-3"
						key={row.toolId}
					>
						{row.thumbUrl ? (
							// biome-ignore lint/performance/noImgElement: Supabase public URL
							<img
								alt=""
								className="h-12 w-12 rounded object-cover"
								src={row.thumbUrl}
							/>
						) : (
							<div className="h-12 w-12 rounded bg-muted" />
						)}
						<div className="flex flex-1 flex-col gap-1">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="font-medium text-sm">{row.toolName}</span>
								<Badge variant={STATE_VARIANT[row.reviewState]}>
									{STATE_LABEL[row.reviewState]}
								</Badge>
							</div>
							<ReviewStateDetail row={row} />
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

function ReviewStateDetail({ row }: { row: OrderReviewRow }) {
	if (row.review) {
		return (
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span aria-label={`${row.review.rating} de 5`} className="tabular-nums">
					{"★".repeat(row.review.rating)}
					{"☆".repeat(5 - row.review.rating)}
				</span>
				<Badge variant={REVIEW_STATUS_VARIANT[row.review.status] ?? "warning"}>
					{REVIEW_STATUS_LABEL[row.review.status] ?? row.review.status}
				</Badge>
				<Link
					className={buttonVariants({ size: "sm", variant: "ghost" })}
					href={`/dashboard/reviews/${row.review.id}`}
				>
					Moderar →
				</Link>
			</div>
		);
	}
	if (row.reviewState === "no_review_open" && row.daysRemaining !== null) {
		return (
			<span className="text-muted-foreground text-sm">
				Cliente ainda não avaliou — faltam {row.daysRemaining} dia
				{row.daysRemaining === 1 ? "" : "s"} para encerrar a janela.
			</span>
		);
	}
	if (row.reviewState === "no_review_expired") {
		return (
			<span className="text-muted-foreground text-sm">
				Cliente não avaliou e a janela de 90 dias encerrou.
			</span>
		);
	}
	return (
		<span className="text-muted-foreground text-sm">
			Aguardando confirmação de pagamento para abrir a janela.
		</span>
	);
}
