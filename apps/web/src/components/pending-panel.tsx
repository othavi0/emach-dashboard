"use client";

import { Card, CardContent, CardHeader } from "@emach/ui/components/card";
import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { cn } from "@emach/ui/lib/utils";
import Link from "next/link";
import { useRef, useState } from "react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import {
	STATUS_ICONS,
	type StatusIconKey,
	TONE_TEXT,
	type Tone,
} from "@/components/status-visual";
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
	aging?: { level: "ok" | "warn" | "late"; label: string };
	badge?: { label: string; role: PendingRole };
	href: string;
	/** Ícone de status à esquerda da linha (opcional). */
	iconKey?: StatusIconKey;
	id: string;
	primary: string;
	secondary?: string;
	tone?: Tone;
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
	compact?: boolean;
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

function PendingTabContent({
	compact,
	tab,
}: {
	compact?: boolean;
	tab: PendingTab;
}) {
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
			className={cn(
				"min-w-0 max-w-full overflow-y-auto",
				compact ? "max-h-60 min-h-44" : "max-h-[28rem] min-h-72"
			)}
			ref={scrollRef}
		>
			<ul className="flex flex-col">
				{items.map((row) => {
					const StatusIcon = row.iconKey ? STATUS_ICONS[row.iconKey] : null;
					return (
						<li key={row.id}>
							<Link
								className="-mx-2 flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
								href={row.href}
							>
								{StatusIcon && (
									<StatusIcon
										aria-hidden
										className={`size-3.5 shrink-0 ${row.tone ? TONE_TEXT[row.tone] : "text-muted-foreground"}`}
									/>
								)}
								<div className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-foreground">
										{row.primary}
									</span>
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
								{row.aging && row.aging.level !== "ok" && (
									<span
										className={
											row.aging.level === "late"
												? "rounded-md bg-destructive/15 px-2 py-0.5 font-medium text-[11px] text-destructive"
												: "rounded-md bg-amber-100 px-2 py-0.5 font-medium text-[11px] text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
										}
									>
										{row.aging.label}
									</span>
								)}
							</Link>
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
	);
}

export function PendingPanel({
	compact,
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
				<Tabs
					onValueChange={(v) => {
						if (v) {
							setActiveId(v);
						}
					}}
					value={activeId}
				>
					<TabsList className="max-w-full">
						{tabs.map((tab) => (
							<TabsTrigger key={tab.id} value={tab.id}>
								<span>{tab.label}</span>
								<TabsCountBadge value={tab.count} />
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</CardHeader>
			<CardContent className="flex min-w-0 flex-col">
				{total === 0 || !activeTab ? (
					<p className="px-2 py-8 text-muted-foreground text-sm">
						{emptyMessage}
					</p>
				) : (
					<PendingTabContent
						compact={compact}
						key={activeTab.id}
						tab={activeTab}
					/>
				)}
			</CardContent>
		</Card>
	);
}
