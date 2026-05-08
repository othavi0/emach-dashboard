import { Card, CardContent, CardHeader } from "@emach/ui/components/card";
import Link from "next/link";

export type PendingRole =
	| "default"
	| "destructive"
	| "info"
	| "secondary"
	| "success"
	| "warning";

export interface PendingItem {
	count: number;
	href: string;
	label: string;
	role?: PendingRole;
}

export interface PendingGroup {
	items: PendingItem[];
	title: string;
}

const COUNT_COLORS: Record<PendingRole, string> = {
	default: "text-foreground",
	destructive: "text-destructive",
	info: "text-info",
	secondary: "text-muted-foreground",
	success: "text-success",
	warning: "text-warning",
};

interface PendingListProps {
	emptyMessage?: string;
	groups: PendingGroup[];
	title?: string;
}

export function PendingList({
	groups,
	title = "Pendências",
	emptyMessage = "Nada pendente. Bom trabalho.",
}: PendingListProps) {
	const total = groups.reduce(
		(s, g) => s + g.items.reduce((a, i) => a + i.count, 0),
		0
	);
	const visibleGroups = groups
		.map((g) => ({ ...g, items: g.items.filter((i) => i.count > 0) }))
		.filter((g) => g.items.length > 0);

	return (
		<Card>
			<CardHeader className="flex flex-row items-baseline justify-between gap-3 pb-3">
				<span className="font-semibold text-sm uppercase tracking-wider">
					{title}
				</span>
				<span className="font-mono text-muted-foreground text-xs tabular-nums">
					{total} {total === 1 ? "item" : "itens"}
				</span>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{visibleGroups.length === 0 ? (
					<p className="text-muted-foreground text-sm">{emptyMessage}</p>
				) : (
					visibleGroups.map((group) => (
						<div className="flex flex-col gap-1" key={group.title}>
							<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
								{group.title}
							</p>
							<ul className="flex flex-col">
								{group.items.map((item) => (
									<li key={`${group.title}-${item.label}`}>
										<Link
											className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted"
											href={item.href}
										>
											<span
												className={`w-8 text-right font-mono tabular-nums ${COUNT_COLORS[item.role ?? "default"]}`}
											>
												{item.count}
											</span>
											<span className="text-foreground">{item.label}</span>
										</Link>
									</li>
								))}
							</ul>
						</div>
					))
				)}
			</CardContent>
		</Card>
	);
}
