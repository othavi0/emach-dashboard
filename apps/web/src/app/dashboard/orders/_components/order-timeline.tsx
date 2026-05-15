import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";

import type { OrderHistoryItem, OrderNoteItem } from "../data";
import { ORDER_STATUS_LABELS } from "../status-meta";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatDateTime(value: Date) {
	return DATE_TIME_FORMATTER.format(value);
}

const OK_STATUSES = new Set(["paid", "preparing", "shipped", "delivered"]);
const WARN_STATUSES = new Set(["pending_payment"]);
const BAD_STATUSES = new Set(["canceled", "refunded"]);

function dotColorClass(entry: TimelineEntry): string {
	if (entry.kind === "note") {
		return "bg-info";
	}
	if (OK_STATUSES.has(entry.toStatus)) {
		return "bg-success";
	}
	if (WARN_STATUSES.has(entry.toStatus)) {
		return "bg-warning";
	}
	if (BAD_STATUSES.has(entry.toStatus)) {
		return "bg-destructive";
	}
	return "bg-primary";
}

type TimelineEntry =
	| ({ kind: "history" } & OrderHistoryItem)
	| ({ kind: "note" } & OrderNoteItem);

export function OrderTimeline({
	history,
	notes,
}: {
	history: OrderHistoryItem[];
	notes: OrderNoteItem[];
}) {
	const entries: TimelineEntry[] = [
		...history.map((item) => ({ ...item, kind: "history" as const })),
		...notes.map((item) => ({ ...item, kind: "note" as const })),
	].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	return (
		<Card>
			<CardHeader>
				<CardTitle>Timeline</CardTitle>
				<CardDescription>
					Histórico de status e notas internas intercalados cronologicamente.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{entries.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Nenhum evento registrado ainda.
					</p>
				) : (
					<div className="space-y-4">
						{entries.map((entry) => (
							<div className="flex gap-3" key={entry.id}>
								<div
									className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dotColorClass(entry)}`}
								/>
								<div className="min-w-0 flex-1 border-border border-b pb-4 last:border-b-0 last:pb-0">
									<div className="flex items-start justify-between gap-3">
										<p className="font-medium text-sm">
											{entry.kind === "history"
												? `${ORDER_STATUS_LABELS[entry.fromStatus]} → ${ORDER_STATUS_LABELS[entry.toStatus]}`
												: `Nota interna • ${entry.authorName}`}
										</p>
										<span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
											{formatDateTime(entry.createdAt)}
										</span>
									</div>
									<p className="mt-1 text-muted-foreground text-sm">
										{entry.kind === "history"
											? `${entry.actorLabel}${entry.reason ? ` • ${entry.reason}` : ""}`
											: entry.body}
									</p>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
