"use client";

import { Badge } from "@emach/ui/components/badge";
import { Card, CardContent, CardHeader } from "@emach/ui/components/card";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@emach/ui/components/toggle-group";
import { cn } from "@emach/ui/lib/utils";
import Link from "next/link";
import { useRef, useState } from "react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import type { InfiniteResult } from "@/lib/infinite";
import { useInfiniteList } from "@/lib/use-infinite-list";

export type PendingRole =
	| "default"
	| "destructive"
	| "info"
	| "secondary"
	| "success"
	| "warning";

export interface PendingRow {
	badge?: { label: string; role: PendingRole };
	href: string;
	id: string;
	primary: string;
	secondary?: string;
}

export interface PendingTab {
	count: number;
	fetchPage: (cursor: string | null) => Promise<InfiniteResult<PendingRow>>;
	id: string;
	initial: PendingRow[];
	initialCursor: string | null;
	label: string;
	role?: PendingRole;
}

interface PendingPanelProps {
	emptyMessage?: string;
	tabs: PendingTab[];
	title?: string;
}

const BADGE_COLORS: Record<PendingRole, string> = {
	default: "text-foreground",
	destructive: "text-destructive",
	info: "text-info",
	secondary: "text-muted-foreground",
	success: "text-success",
	warning: "text-warning",
};

function PendingTabContent({ tab }: { tab: PendingTab }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: tab.initial,
		initialCursor: tab.initialCursor,
		fetchPage: tab.fetchPage,
	});

	if (items.length === 0) {
		return (
			<p className="px-2 py-8 text-muted-foreground text-sm">
				Nada pendente nesse grupo.
			</p>
		);
	}

	return (
		<div
			aria-live="polite"
			className="max-h-[28rem] min-h-72 min-w-0 max-w-full overflow-y-auto"
			ref={scrollRef}
		>
			<ul className="flex flex-col">
				{items.map((row) => (
					<li key={row.id}>
						<Link
							className="-mx-2 flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
							href={row.href}
						>
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-foreground">{row.primary}</span>
								{row.secondary && (
									<span className="truncate text-muted-foreground text-xs">
										{row.secondary}
									</span>
								)}
							</div>
							{row.badge && (
								<span
									className={cn(
										"max-w-[45%] shrink-0 truncate font-mono text-xs",
										BADGE_COLORS[row.badge.role]
									)}
								>
									{row.badge.label}
								</span>
							)}
						</Link>
					</li>
				))}
			</ul>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
				root={scrollRef}
			/>
		</div>
	);
}

export function PendingPanel({
	tabs,
	title = "Pendências",
	emptyMessage = "Nada pendente. Bom trabalho.",
}: PendingPanelProps) {
	const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
	const total = tabs.reduce((s, t) => s + t.count, 0);
	const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

	return (
		<Card className="min-w-0">
			<CardHeader className="flex flex-col gap-3 pb-3">
				<div className="flex min-w-0 flex-row items-baseline justify-between gap-3">
					<span className="font-semibold text-sm uppercase tracking-wider">
						{title}
					</span>
					<span className="font-mono text-muted-foreground text-xs tabular-nums">
						{total} {total === 1 ? "item" : "itens"}
					</span>
				</div>
				<ToggleGroup
					className="min-w-0 max-w-full flex-wrap justify-start"
					onValueChange={(v) => {
						const next = v[0];
						if (next) {
							setActiveId(next);
						}
					}}
					value={[activeId]}
				>
					{tabs.map((tab) => (
						<ToggleGroupItem key={tab.id} value={tab.id}>
							{tab.label}
							<Badge
								className={cn("ml-1.5", BADGE_COLORS[tab.role ?? "default"])}
								variant="outline"
							>
								{tab.count}
							</Badge>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</CardHeader>
			<CardContent className="flex min-w-0 flex-col">
				{total === 0 || !activeTab ? (
					<p className="px-2 py-8 text-muted-foreground text-sm">
						{emptyMessage}
					</p>
				) : (
					<PendingTabContent key={activeTab.id} tab={activeTab} />
				)}
			</CardContent>
		</Card>
	);
}
