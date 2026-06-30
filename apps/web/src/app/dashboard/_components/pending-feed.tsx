"use client";

import { Badge } from "@emach/ui/components/badge";
import { Card, CardContent, CardHeader } from "@emach/ui/components/card";
import { cn } from "@emach/ui/lib/utils";
import Link from "next/link";
import { useState } from "react";
import {
	STATUS_ICONS,
	TONE_TEXT,
	TONE_TINT_BG,
} from "@/components/status-visual";
import type {
	FeedType,
	PendingFeedCounts,
	PendingFeedItem,
} from "../pending-data";

type Filter = FeedType | "all";

const FILTERS: { id: Filter; label: string }[] = [
	{ id: "all", label: "Tudo" },
	{ id: "stock", label: "Estoque" },
	{ id: "orders", label: "Pedidos" },
	{ id: "reviews", label: "Reviews" },
	{ id: "promos", label: "Promos" },
];

function countFor(counts: PendingFeedCounts, id: Filter): number {
	return id === "all" ? counts.total : counts[id];
}

export function PendingFeed({
	items,
	counts,
}: {
	counts: PendingFeedCounts;
	items: PendingFeedItem[];
}) {
	const [filter, setFilter] = useState<Filter>("all");
	const shown =
		filter === "all" ? items : items.filter((i) => i.feedType === filter);

	return (
		<Card className="flex h-full min-w-0 flex-col">
			<CardHeader className="flex flex-col gap-3 pb-3">
				<div className="flex items-baseline justify-between gap-3">
					<span className="font-semibold text-sm uppercase tracking-wider">
						Precisa de atenção
					</span>
					<span className="font-mono text-muted-foreground text-xs tabular-nums">
						{shown.length} {shown.length === 1 ? "item" : "itens"}
					</span>
				</div>
				<div className="flex flex-wrap gap-1.5">
					{FILTERS.filter(
						(f) => f.id === "all" || countFor(counts, f.id) > 0
					).map((f) => {
						const active = filter === f.id;
						return (
							<button
								aria-pressed={active}
								className={cn(
									"rounded-full border px-2.5 py-0.5 font-medium text-xs transition-colors",
									active
										? "border-primary/60 bg-primary/15 text-primary"
										: "border-border bg-muted text-muted-foreground hover:text-foreground"
								)}
								key={f.id}
								onClick={() => setFilter(f.id)}
								type="button"
							>
								{f.label}{" "}
								<span className="tabular-nums">{countFor(counts, f.id)}</span>
							</button>
						);
					})}
				</div>
			</CardHeader>
			<CardContent className="flex min-h-0 min-w-0 flex-1 flex-col">
				{shown.length === 0 ? (
					<p className="px-2 py-8 text-center text-muted-foreground text-sm">
						Tudo em dia.
					</p>
				) : (
					<ul className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto">
						{shown.map((item) => {
							const Icon = STATUS_ICONS[item.iconKey];
							return (
								<li key={item.id}>
									<Link
										className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted"
										href={item.href}
									>
										<span
											className={cn(
												"flex size-7 shrink-0 items-center justify-center rounded-md",
												TONE_TINT_BG[item.tone]
											)}
										>
											<Icon
												aria-hidden
												className={cn("size-4", TONE_TEXT[item.tone])}
											/>
										</span>
										<div className="flex min-w-0 flex-1 flex-col">
											<span className="truncate text-foreground text-sm">
												{item.primary}
											</span>
											{item.secondary && (
												<span className="truncate text-muted-foreground text-xs">
													{item.secondary}
												</span>
											)}
										</div>
										<Badge
											className="ml-auto shrink-0"
											variant={item.badge.role}
										>
											{item.badge.label}
										</Badge>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
