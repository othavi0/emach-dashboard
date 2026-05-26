import { ArrowDown, ArrowUp, Pencil, X } from "lucide-react";

import {
	getToolActivity,
	type ToolActivityRow,
} from "@/app/dashboard/stock/actions";

interface ActivityTabProps {
	toolId: string;
}

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
			return {
				Icon: Pencil,
				color: "text-muted-foreground",
				bg: "bg-muted",
			};
	}
}

function groupByDay(
	rows: ToolActivityRow[]
): Array<{ label: string; items: ToolActivityRow[] }> {
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
			label = d.toLocaleDateString("pt-BR", {
				day: "2-digit",
				month: "short",
				year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
			});
		}

		const groupKey = label;
		if (!groups.has(groupKey)) {
			groups.set(groupKey, []);
			order.push(groupKey);
		}
		groups.get(groupKey)?.push(r);
	}

	return order.map((label) => ({ label, items: groups.get(label) ?? [] }));
}

function formatTime(date: Date): string {
	return new Date(date).toLocaleTimeString("pt-BR", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export async function ActivityTab({ toolId }: ActivityTabProps) {
	const rows = await getToolActivity(toolId, 100);

	if (rows.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Sem movimentações registradas.
			</p>
		);
	}

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
												{r.reasonNote && <>"{r.reasonNote}" · </>}
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
