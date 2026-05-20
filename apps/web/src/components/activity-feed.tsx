"use client";

import { Card, CardContent, CardHeader } from "@emach/ui/components/card";
import {
	BoxIcon,
	type LucideIcon,
	PackageIcon,
	StarIcon,
	UserCogIcon,
	UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import type { InfiniteResult } from "@/lib/infinite";
import { useInfiniteList } from "@/lib/use-infinite-list";

export type ActivityKind = "order" | "review" | "stock" | "customer" | "user";

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
	fetchPage: (cursor: string) => Promise<InfiniteResult<ActivityEvent>>;
	initialCursor: string | null;
	initialEvents: ActivityEvent[];
	title?: string;
}

const KIND_META: Record<ActivityKind, { color: string; icon: LucideIcon }> = {
	stock: { icon: BoxIcon, color: "text-info" },
	order: { icon: PackageIcon, color: "text-warning" },
	review: { icon: StarIcon, color: "text-success" },
	customer: { icon: UserIcon, color: "text-primary" },
	user: { icon: UserCogIcon, color: "text-info" },
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
	initialEvents,
	initialCursor,
	fetchPage,
	title = "Atividade",
	emptyMessage = "Sem atividade recente.",
}: ActivityFeedProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initialEvents,
		initialCursor,
		fetchPage,
	});

	return (
		<Card className="flex h-full min-w-0 flex-col">
			<CardHeader className="flex min-w-0 flex-row items-baseline justify-between gap-3 pb-3">
				<span className="font-semibold text-sm uppercase tracking-wider">
					{title}
				</span>
				<span className="font-mono text-muted-foreground text-xs tabular-nums">
					{items.length} evento{items.length === 1 ? "" : "s"}
				</span>
			</CardHeader>
			<CardContent className="flex min-h-0 min-w-0 flex-1 flex-col">
				{items.length === 0 ? (
					<p className="text-muted-foreground text-sm">{emptyMessage}</p>
				) : (
					<div
						aria-live="polite"
						className="min-h-0 min-w-0 flex-1 overflow-y-auto"
						ref={scrollRef}
					>
						<ul className="flex flex-col">
							{items.map((event) => {
								const meta = KIND_META[event.kind];
								const Icon = meta.icon;
								const rowClassName =
									"-mx-2 flex w-full min-w-0 items-start gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted";
								const inner = (
									<>
										<span className="w-12 shrink-0 pt-0.5 text-right font-mono text-muted-foreground text-xs tabular-nums">
											{formatWhen(event.at)}
										</span>
										<Icon
											aria-hidden="true"
											className={`mt-0.5 size-3.5 shrink-0 ${meta.color}`}
										/>
										<div className="flex min-w-0 flex-1 flex-col">
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
						<InfiniteSentinel
							error={error}
							hasMore={hasMore}
							onLoadMore={loadMore}
							pending={pending}
							root={scrollRef}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
