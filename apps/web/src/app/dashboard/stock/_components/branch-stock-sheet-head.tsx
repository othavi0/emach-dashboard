"use client";

import { SheetHeader, SheetTitle } from "@emach/ui/components/sheet";
import { ExternalLink, Wrench } from "lucide-react";
import type { BranchStockRow } from "../branch-stock-data";
import type { StockStatus } from "./stock-status";

// ─── Constantes ────────────────────────────────────────────────────────────

export const STATUS_CLASS: Record<StockStatus, string> = {
	critical: "bg-destructive/15 text-destructive",
	reorder: "bg-warning/15 text-warning",
	ok: "bg-success/15 text-success",
	none: "bg-muted text-muted-foreground",
};

// ─── Componente ─────────────────────────────────────────────────────────────

export interface SheetHeadProps {
	branchName: string;
	lead: "branch" | "tool";
	row: BranchStockRow;
	status: StockStatus;
	statusLabel: string | null;
}

export function SheetHead({
	branchName,
	lead,
	row,
	status,
	statusLabel,
}: SheetHeadProps) {
	const fallbackAvatar =
		lead === "branch" ? (
			<div className="flex size-full items-center justify-center text-muted-foreground">
				<Wrench aria-hidden className="size-6" />
			</div>
		) : (
			<div className="flex size-full items-center justify-center font-semibold text-[18px] text-muted-foreground">
				{row.toolName.slice(0, 2).toUpperCase()}
			</div>
		);

	const subtitle =
		lead === "branch" ? (
			<>
				{row.toolName} · SKU {row.sku}
				{row.voltage ? ` · ${row.voltage}` : ""} · {row.barcode}
			</>
		) : (
			<>
				SKU {row.sku}
				{row.voltage ? ` · ${row.voltage}` : ""} · {row.barcode} · {branchName}
			</>
		);

	return (
		<SheetHeader className="flex-none border-border border-b px-6 py-5">
			<div className="flex items-start gap-3">
				<div className="size-14 flex-shrink-0 overflow-hidden rounded-[8px] bg-muted">
					{row.imageUrl ? (
						// biome-ignore lint/performance/noImgElement: Supabase public URL
						// biome-ignore lint/correctness/useImageSize: fixed size via Tailwind
						<img alt="" className="size-full object-cover" src={row.imageUrl} />
					) : (
						fallbackAvatar
					)}
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-start gap-2">
						<SheetTitle className="text-[15px] leading-snug">
							{lead === "branch" ? branchName : row.toolName}
						</SheetTitle>
						{statusLabel && (
							<span
								className={`inline-flex items-center rounded-md px-2 py-0.5 font-medium text-[11px] ${STATUS_CLASS[status]}`}
							>
								{statusLabel}
							</span>
						)}
					</div>
					<p className="mt-0.5 text-muted-foreground text-xs">{subtitle}</p>
					{lead === "tool" && (
						<a
							className="mt-2 inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
							href={`/dashboard/tools/${row.toolId}`}
							rel="noopener noreferrer"
							target="_blank"
						>
							<ExternalLink aria-hidden className="size-3" />
							Editar ficha da ferramenta
						</a>
					)}
				</div>
			</div>
		</SheetHeader>
	);
}
