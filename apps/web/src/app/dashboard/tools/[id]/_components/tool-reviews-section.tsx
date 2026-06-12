import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import Link from "next/link";

import { formatDate } from "@/lib/format/datetime";
import type { ToolReviewSummary } from "../_lib/reviews-data";
import { SectionCard } from "./section-card";

const REVIEW_STATUS_LABEL: Record<string, string> = {
	pending: "Pendente",
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

export function ToolReviewsSection({
	toolId,
	summary,
}: {
	summary: ToolReviewSummary;
	toolId: string;
}) {
	const maxBucket = Math.max(
		summary.breakdown[1],
		summary.breakdown[2],
		summary.breakdown[3],
		summary.breakdown[4],
		summary.breakdown[5],
		1
	);

	return (
		<div className="flex flex-col gap-6">
			<SectionCard title="Resumo das avaliações">
				<div className="grid gap-6 md:grid-cols-[180px_1fr]">
					<div className="flex flex-col items-center justify-center gap-1 rounded-md border border-border p-4">
						<span className="font-medium text-4xl tabular-nums tracking-tight">
							{summary.total === 0 ? "—" : summary.avg.toFixed(1)}
						</span>
						<span className="text-muted-foreground text-xs">de 5</span>
						<span className="text-muted-foreground text-sm">
							{summary.total} aprovada{summary.total === 1 ? "" : "s"}
						</span>
					</div>
					<div className="flex flex-col justify-center gap-1.5">
						{[5, 4, 3, 2, 1].map((star) => {
							const count = summary.breakdown[star as 1 | 2 | 3 | 4 | 5];
							const pct = (count / maxBucket) * 100;
							return (
								<div className="flex items-center gap-3 text-sm" key={star}>
									<span className="w-10 tabular-nums">{star} ★</span>
									<div className="h-2 flex-1 overflow-hidden rounded bg-muted">
										<div
											className="h-full bg-primary"
											style={{ width: `${pct}%` }}
										/>
									</div>
									<span className="w-8 text-right text-muted-foreground tabular-nums">
										{count}
									</span>
								</div>
							);
						})}
					</div>
				</div>
			</SectionCard>

			{summary.recent.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nenhuma avaliação cadastrada ainda.
				</p>
			) : (
				<ul className="flex flex-col divide-y divide-border">
					{summary.recent.map((r) => (
						<li className="flex flex-col gap-1.5 py-3 first:pt-0" key={r.id}>
							<div className="flex flex-wrap items-center gap-2">
								<span
									aria-label={`${r.rating} de 5`}
									className="tabular-nums"
									role="img"
								>
									{"★".repeat(r.rating)}
									{"☆".repeat(5 - r.rating)}
								</span>
								{r.title && (
									<span className="font-medium text-sm">{r.title}</span>
								)}
								<Badge variant={REVIEW_STATUS_VARIANT[r.status] ?? "warning"}>
									{REVIEW_STATUS_LABEL[r.status] ?? r.status}
								</Badge>
								<span className="ml-auto text-muted-foreground text-xs">
									{r.clientName} · {formatDate(r.createdAt)}
								</span>
							</div>
							<p className="line-clamp-2 text-muted-foreground text-sm">
								{r.body}
							</p>
							<div>
								<Link
									className={buttonVariants({ size: "sm", variant: "ghost" })}
									href={`/dashboard/reviews/${r.id}`}
								>
									Moderar →
								</Link>
							</div>
						</li>
					))}
				</ul>
			)}

			{summary.total > summary.recent.length && (
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href={`/dashboard/reviews?toolId=${toolId}`}
				>
					Ver todas →
				</Link>
			)}
		</div>
	);
}
