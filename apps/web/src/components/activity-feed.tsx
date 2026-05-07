import { Card, CardContent, CardHeader } from "@emach/ui/components/card";
import { BoxIcon, type LucideIcon, PackageIcon, StarIcon } from "lucide-react";
import Link from "next/link";

export type ActivityKind = "order" | "review" | "stock";

export interface ActivityEvent {
	at: Date;
	href?: string;
	id: string;
	kind: ActivityKind;
	primary: string;
	secondary?: string;
}

interface ActivityFeedProps {
	emptyMessage?: string;
	events: ActivityEvent[];
	title?: string;
}

const KIND_META: Record<ActivityKind, { color: string; icon: LucideIcon }> = {
	stock: { icon: BoxIcon, color: "text-info" },
	order: { icon: PackageIcon, color: "text-warning" },
	review: { icon: StarIcon, color: "text-success" },
};

const TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	hour: "2-digit",
	minute: "2-digit",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
});

function formatWhen(date: Date): string {
	const now = Date.now();
	const isToday = new Date(now).toDateString() === date.toDateString();
	if (isToday) {
		return TIME_FORMATTER.format(date);
	}
	return DATE_FORMATTER.format(date);
}

export function ActivityFeed({
	events,
	title = "Atividade",
	emptyMessage = "Sem atividade recente.",
}: ActivityFeedProps) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-baseline justify-between gap-3 pb-3">
				<span className="font-semibold text-sm uppercase tracking-wider">
					{title}
				</span>
				<span className="font-mono text-muted-foreground text-xs tabular-nums">
					{events.length} evento{events.length === 1 ? "" : "s"}
				</span>
			</CardHeader>
			<CardContent className="flex flex-col">
				{events.length === 0 ? (
					<p className="text-muted-foreground text-sm">{emptyMessage}</p>
				) : (
					<ul className="flex flex-col">
						{events.map((event) => {
							const meta = KIND_META[event.kind];
							const Icon = meta.icon;
							const rowClassName =
								"-mx-2 flex items-start gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted";
							const inner = (
								<>
									<span className="w-12 shrink-0 pt-0.5 text-right font-mono text-muted-foreground text-xs tabular-nums">
										{formatWhen(event.at)}
									</span>
									<Icon
										aria-hidden="true"
										className={`mt-0.5 size-3.5 shrink-0 ${meta.color}`}
									/>
									<div className="flex min-w-0 flex-col">
										<span className="truncate text-foreground">
											{event.primary}
										</span>
										{event.secondary && (
											<span className="truncate text-muted-foreground text-xs">
												{event.secondary}
											</span>
										)}
									</div>
								</>
							);
							return (
								<li key={event.id}>
									{event.href ? (
										<Link className={rowClassName} href={event.href}>
											{inner}
										</Link>
									) : (
										<div className={rowClassName}>{inner}</div>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
