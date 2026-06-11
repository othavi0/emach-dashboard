import { ArrowDown, ArrowUp, Pencil, X } from "lucide-react";

import type { ToolActivityRow } from "@/app/dashboard/stock/actions";
import {
	formatDayMonthShort,
	formatDayMonthShortYear,
	formatTime,
} from "@/lib/format/datetime";

const REASON_LABEL: Record<string, string> = {
	entrada_compra: "entrada compra",
	saida_venda: "saída venda",
	ajuste_inventario: "ajuste inventário",
	perda: "perda",
	outro: "outro",
};

function reasonIcon(reason: string | null) {
	switch (reason) {
		case "entrada_compra":
			return { Icon: ArrowUp, color: "text-success", bg: "bg-success/15" };
		case "saida_venda":
			return {
				Icon: ArrowDown,
				color: "text-destructive",
				bg: "bg-destructive/15",
			};
		case "perda":
			return { Icon: X, color: "text-destructive", bg: "bg-destructive/15" };
		case "ajuste_inventario":
			return { Icon: Pencil, color: "text-warning", bg: "bg-warning/15" };
		default:
			return { Icon: Pencil, color: "text-muted-foreground", bg: "bg-muted" };
	}
}

function groupByDay(
	rows: ToolActivityRow[]
): Array<{ items: ToolActivityRow[]; label: string }> {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	const groups = new Map<string, ToolActivityRow[]>();
	const order: string[] = [];

	for (const r of rows) {
		const d = new Date(r.createdAt);
		let label: string;
		if (d >= today) {
			label = "Hoje";
		} else if (d >= yesterday) {
			label = "Ontem";
		} else {
			label =
				d.getFullYear() === now.getFullYear()
					? formatDayMonthShort(d)
					: formatDayMonthShortYear(d);
		}

		if (!groups.has(label)) {
			groups.set(label, []);
			order.push(label);
		}
		groups.get(label)?.push(r);
	}

	return order.map((label) => ({ label, items: groups.get(label) ?? [] }));
}

interface Props {
	rows: ToolActivityRow[];
}

export function ActivityTimeline({ rows }: Props) {
	const groups = groupByDay(rows);

	return (
		<div className="rounded-md border border-border">
			{groups.map((g) => (
				<div key={g.label}>
					<div className="border-border border-b bg-muted/40 px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						{g.label}
					</div>
					<ul className="divide-y divide-border">
						{g.items.map((r) => {
							const { Icon, color, bg } = reasonIcon(r.reason);
							const reasonLabel =
								REASON_LABEL[r.reason ?? ""] ?? r.reason ?? "—";
							return (
								<li
									className="flex items-start gap-3 px-4 py-3 text-sm"
									key={r.id}
								>
									<span
										className={`mt-0.5 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full ${bg}`}
									>
										<Icon className={`size-3.5 ${color}`} />
									</span>
									<div className="flex min-w-0 flex-1 flex-col">
										<div>
											<span className={color}>
												{r.delta > 0 ? `+${r.delta}` : r.delta}
											</span>
											<span className="ml-1">· {reasonLabel}</span>
											<span className="text-muted-foreground"> · </span>
											<span className="font-medium">{r.branchName ?? "—"}</span>
											<span className="text-muted-foreground"> · </span>
											<span className="font-mono text-xs">{r.variantSku}</span>
											{r.variantVoltage && (
												<span className="text-muted-foreground text-xs">
													{" "}
													({r.variantVoltage})
												</span>
											)}
										</div>
										{(r.reasonNote || r.actorName) && (
											<div className="text-muted-foreground text-xs">
												{r.reasonNote && <>&quot;{r.reasonNote}&quot; · </>}
												{r.actorName ? `por ${r.actorName}` : "Sistema"}
											</div>
										)}
									</div>
									<span className="flex-shrink-0 text-muted-foreground text-xs">
										{formatTime(r.createdAt)}
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
