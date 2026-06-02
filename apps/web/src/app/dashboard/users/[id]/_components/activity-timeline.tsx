"use client";

import {
	Activity,
	Building2,
	CheckCircle2,
	KeyRound,
	type LucideIcon,
	Monitor,
	MonitorOff,
	Pause,
	Pencil,
	Play,
	Trash2,
	Wrench,
	XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { formatRelative } from "@/lib/format/relative";

/** Ícone por tipo de ação, compartilhado pelas views de atividade (feita por / sofrida). */
export const ACTION_ICONS: Record<string, LucideIcon> = {
	"user.approved": CheckCircle2,
	"user.rejected": XCircle,
	"user.updated": Pencil,
	"user.suspended": Pause,
	"user.reactivated": Play,
	"user.deleted": Trash2,
	"user.password_reset_triggered": KeyRound,
	"user.session_revoked": Monitor,
	"user.all_sessions_revoked": MonitorOff,
	"user.branch_linked": Building2,
	"user.branch_unlinked": Building2,
	"tool.created": Wrench,
	"tool.updated": Wrench,
	"tool.deleted": Wrench,
};

const FALLBACK_ICON = Activity;

export interface TimelineEntry {
	action: string;
	createdAt: Date | string;
	id: string;
	metadata?: Record<string, unknown> | null;
	/** Linha secundária opcional (ex.: alvo da ação). */
	subtitle?: ReactNode;
	/** Texto/markup principal já resolvido pelo caller (label + voz própria). */
	title: ReactNode;
}

interface Props {
	emptyMessage: string;
	entries: TimelineEntry[];
	error: string | null;
	hasMore: boolean;
	onLoadMore: () => void;
	pending: boolean;
}

export function ActivityTimeline({
	entries,
	emptyMessage,
	error,
	hasMore,
	onLoadMore,
	pending,
}: Props) {
	return (
		<div className="flex flex-col gap-3">
			{entries.length === 0 ? (
				<p className="py-8 text-center text-muted-foreground text-sm">
					{emptyMessage}
				</p>
			) : (
				<ul className="divide-y">
					{entries.map((entry) => {
						const Icon = ACTION_ICONS[entry.action] ?? FALLBACK_ICON;
						const hasMetadata =
							entry.metadata !== null &&
							entry.metadata !== undefined &&
							Object.keys(entry.metadata).length > 0;

						return (
							<li className="flex items-start gap-3 py-3" key={entry.id}>
								<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
									<Icon className="size-4 text-muted-foreground" />
								</div>
								<div className="flex min-w-0 flex-1 flex-col gap-1">
									<p className="text-sm">{entry.title}</p>
									{entry.subtitle ? (
										<p className="text-muted-foreground text-xs">
											{entry.subtitle}
										</p>
									) : null}
									<p className="text-muted-foreground text-xs">
										{formatRelative(new Date(entry.createdAt))}
									</p>
									{hasMetadata ? (
										<details className="mt-1">
											<summary className="cursor-pointer select-none text-muted-foreground text-xs">
												Detalhes
											</summary>
											<pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
												{JSON.stringify(entry.metadata, null, 2)}
											</pre>
										</details>
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			)}
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={onLoadMore}
				pending={pending}
			/>
		</div>
	);
}
