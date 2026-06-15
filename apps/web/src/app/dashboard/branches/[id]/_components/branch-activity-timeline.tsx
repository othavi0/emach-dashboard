import { BoxIcon, type LucideIcon, UserCogIcon } from "lucide-react";
import type { OrderStatus } from "@/app/dashboard/orders/status-meta";
import { ORDER_STATUS_META } from "@/app/dashboard/orders/status-meta";
import { STATUS_ICONS, TONE_TEXT } from "@/components/status-visual";
import {
	formatDayMonthShort,
	formatDayMonthShortYear,
	formatTime,
} from "@/lib/format/datetime";

import type { BranchActivityRow } from "../activity-data";

const STOCK_REASON_LABEL: Record<string, string> = {
	entrada_compra: "entrada compra",
	saida_venda: "saída venda",
	ajuste_inventario: "ajuste inventário",
	perda: "perda",
	outro: "outro",
};

const TEAM_ACTION_LABEL: Record<string, string> = {
	"branch.created": "Filial criada",
	"branch.updated": "Filial atualizada",
};

function dayLabel(date: Date, now: Date): string {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	if (date >= today) {
		return "Hoje";
	}
	if (date >= yesterday) {
		return "Ontem";
	}
	return date.getFullYear() === now.getFullYear()
		? formatDayMonthShort(date)
		: formatDayMonthShortYear(date);
}

function groupByDay(
	rows: BranchActivityRow[]
): Array<{ items: BranchActivityRow[]; label: string }> {
	const now = new Date();
	const groups = new Map<string, BranchActivityRow[]>();
	const order: string[] = [];
	for (const r of rows) {
		const label = dayLabel(new Date(r.at), now);
		if (!groups.has(label)) {
			groups.set(label, []);
			order.push(label);
		}
		groups.get(label)?.push(r);
	}
	return order.map((label) => ({ label, items: groups.get(label) ?? [] }));
}

interface RowVisual {
	accent?: { className: string; text: string };
	Icon: LucideIcon;
	iconClass: string;
	main: React.ReactNode;
}

function stockVisual(r: BranchActivityRow): RowVisual {
	const delta = r.delta ?? 0;
	const deltaClass = delta >= 0 ? "text-success" : "text-destructive";
	const reasonLabel = STOCK_REASON_LABEL[r.reason ?? ""] ?? r.reason ?? "—";
	return {
		Icon: BoxIcon,
		iconClass: "bg-info/15 text-info",
		main: (
			<>
				<span className={`font-semibold ${deltaClass}`}>
					{delta > 0 ? `+${delta}` : delta} un.
				</span>
				<span className="text-muted-foreground"> · {reasonLabel} · </span>
				<span className="font-mono text-xs">{r.sku ?? "—"}</span>
				{r.toolName ? (
					<span className="text-muted-foreground text-xs"> {r.toolName}</span>
				) : null}
				{r.reason === "entrada_compra" && r.supplierName ? (
					<span className="text-muted-foreground text-xs">
						{" "}
						· Fornecedor:{" "}
						<span className="text-foreground">{r.supplierName}</span>
					</span>
				) : null}
			</>
		),
	};
}

function orderVisual(r: BranchActivityRow): RowVisual {
	const meta = r.toStatus
		? ORDER_STATUS_META[r.toStatus as OrderStatus]
		: undefined;
	const Icon = meta ? STATUS_ICONS[meta.iconKey] : BoxIcon;
	const toneClass = meta ? TONE_TEXT[meta.tone] : "text-muted-foreground";
	return {
		Icon,
		iconClass: "bg-warning/15 text-warning",
		accent: meta ? { text: meta.label, className: toneClass } : undefined,
		main: (
			<>
				Pedido <span className="font-mono text-xs">#{r.orderNumber}</span>
				{r.clientName ? (
					<span className="text-muted-foreground"> · {r.clientName}</span>
				) : null}
			</>
		),
	};
}

function teamVisual(r: BranchActivityRow): RowVisual {
	let text: string;
	if (r.action === "user.branch_linked") {
		text = `${r.memberName ?? "Membro"} vinculado à equipe`;
	} else if (r.action === "user.branch_unlinked") {
		text = `${r.memberName ?? "Membro"} removido da equipe`;
	} else {
		text = TEAM_ACTION_LABEL[r.action ?? ""] ?? r.action ?? "—";
	}
	return {
		Icon: UserCogIcon,
		iconClass: "bg-muted text-muted-foreground",
		main: <span>{text}</span>,
	};
}

function visualFor(r: BranchActivityRow): RowVisual {
	if (r.kind === "stock") {
		return stockVisual(r);
	}
	if (r.kind === "order") {
		return orderVisual(r);
	}
	return teamVisual(r);
}

interface Props {
	rows: BranchActivityRow[];
}

export function BranchActivityTimeline({ rows }: Props) {
	const groups = groupByDay(rows);

	return (
		<div className="rounded-md border border-border">
			{groups.map((g) => (
				<div key={g.label}>
					<div className="sticky top-0 border-border border-b bg-muted/40 px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide backdrop-blur-sm">
						{g.label}
					</div>
					<ul className="divide-y divide-border">
						{g.items.map((r) => {
							const v = visualFor(r);
							const { Icon } = v;
							return (
								<li
									className="flex items-start gap-3 px-4 py-3 text-sm"
									key={r.id}
								>
									<span
										className={`mt-0.5 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full ${v.iconClass}`}
									>
										<Icon className="size-3.5" />
									</span>
									<div className="flex min-w-0 flex-1 flex-col">
										<div>
											{v.main}
											{v.accent ? (
												<>
													<span className="text-muted-foreground"> → </span>
													<span className={`font-medium ${v.accent.className}`}>
														{v.accent.text}
													</span>
												</>
											) : null}
										</div>
										{r.note || r.actorName ? (
											<div className="text-muted-foreground text-xs">
												{r.note ? <>&quot;{r.note}&quot; · </> : null}
												{r.actorName ? `por ${r.actorName}` : "Sistema"}
											</div>
										) : null}
									</div>
									<span className="flex-shrink-0 text-muted-foreground text-xs tabular-nums">
										{formatTime(new Date(r.at))}
									</span>
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</div>
	);
}
