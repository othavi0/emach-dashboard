"use client";

import type { LucideIcon } from "lucide-react";
import {
	Activity,
	Building2,
	CheckCircle2,
	KeyRound,
	Monitor,
	MonitorOff,
	Pause,
	Pencil,
	Play,
	Trash2,
	Wrench,
	XCircle,
} from "lucide-react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { formatRelative } from "@/lib/format/relative";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchUserActivityByUserPage } from "../../actions";
import type { UserActivityRow } from "../../data";

const ACTION_LABELS: Record<string, string> = {
	"user.approved": "Aprovou usuário",
	"user.rejected": "Rejeitou usuário",
	"user.updated": "Atualizou usuário",
	"user.suspended": "Suspendeu usuário",
	"user.reactivated": "Reativou usuário",
	"user.deleted": "Deletou usuário",
	"user.password_reset_triggered": "Enviou reset de senha",
	"user.session_revoked": "Revogou sessão",
	"user.all_sessions_revoked": "Revogou todas as sessões",
	"user.branch_linked": "Vinculou filial",
	"user.branch_unlinked": "Desvinculou filial",
	"tool.created": "Criou ferramenta",
	"tool.updated": "Atualizou ferramenta",
	"tool.deleted": "Deletou ferramenta",
};

const ACTION_ICONS: Record<string, LucideIcon> = {
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

interface Props {
	initial: UserActivityRow[];
	initialCursor: string | null;
	userId: string;
}

export function ActivityByUserView({ userId, initial, initialCursor }: Props) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchUserActivityByUserPage(userId, cursor),
	});

	return (
		<div className="flex flex-col gap-3">
			{items.length === 0 ? (
				<p className="py-8 text-center text-muted-foreground text-sm">
					Sem ações registradas por este usuário
				</p>
			) : (
				<ul className="divide-y">
					{items.map((item) => {
						const Icon = ACTION_ICONS[item.action] ?? FALLBACK_ICON;
						const label = ACTION_LABELS[item.action] ?? item.action;
						const hasMetadata =
							item.metadata !== null &&
							item.metadata !== undefined &&
							Object.keys(item.metadata).length > 0;

						return (
							<li className="flex items-start gap-3 py-3" key={item.id}>
								<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
									<Icon className="size-4 text-muted-foreground" />
								</div>
								<div className="flex min-w-0 flex-1 flex-col gap-1">
									<p className="text-sm">{label}</p>
									{item.targetId ? (
										<p className="text-muted-foreground text-xs">
											{item.targetType ?? "—"} · {item.targetId.slice(0, 8)}
										</p>
									) : null}
									<p className="text-muted-foreground text-xs">
										{formatRelative(new Date(item.createdAt))}
									</p>
									{hasMetadata ? (
										<details className="mt-1">
											<summary className="cursor-pointer select-none text-muted-foreground text-xs">
												Detalhes
											</summary>
											<pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
												{JSON.stringify(item.metadata, null, 2)}
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
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
