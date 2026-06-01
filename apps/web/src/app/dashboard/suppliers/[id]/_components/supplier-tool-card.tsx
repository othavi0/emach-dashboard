import { Wrench } from "lucide-react";
import Link from "next/link";

import { ToolStatusBadge } from "@/components/tool-status-badge";
import type { SupplierToolRow } from "../../data";

const DATE = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

export function SupplierToolCard({ tool }: { tool: SupplierToolRow }) {
	return (
		<Link
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`/dashboard/tools/${tool.id}`}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-[52px] flex-shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted text-muted-foreground">
					<Wrench aria-hidden className="size-5" />
				</div>
				<div className="min-w-0 flex-1">
					<span className="block truncate font-semibold text-[14px] text-foreground leading-tight">
						{tool.name}
					</span>
					<p className="truncate text-muted-foreground text-xs">
						{tool.defaultSku ?? tool.slug}
					</p>
				</div>
				<ToolStatusBadge status={tool.status} />
			</div>

			<div className="flex flex-col items-center border-border border-t py-2.5">
				<span className="font-bold text-[14px] text-foreground tabular-nums">
					{DATE.format(tool.createdAt)}
				</span>
				<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
					Criada em
				</span>
			</div>
		</Link>
	);
}
