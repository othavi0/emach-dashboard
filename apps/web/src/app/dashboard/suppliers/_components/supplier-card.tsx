"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getInitials } from "@/lib/format/name";
import type { SupplierTableRow } from "../data";

const MONTH_YEAR = new Intl.DateTimeFormat("pt-BR", {
	month: "2-digit",
	year: "numeric",
});

interface SupplierCardProps {
	supplier: SupplierTableRow;
}

export function SupplierCard({ supplier }: SupplierCardProps) {
	const router = useRouter();
	const detailHref = `/dashboard/suppliers/${supplier.id}`;
	const toolsHref = `/dashboard/suppliers/${supplier.id}?tab=tools`;
	const noTools = supplier.toolsTotal === 0;
	const isArchived = supplier.status === "archived";

	return (
		<div
			className={`group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isArchived ? "opacity-70" : ""}`}
			onClick={() => router.push(detailHref)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(detailHref);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-12 flex-shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted font-bold text-[17px] text-foreground">
					{getInitials(supplier.name)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-[15px] text-foreground leading-tight">
						{supplier.name}
					</p>
					{isArchived && (
						<span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
							Arquivado
						</span>
					)}
					<p className="truncate text-muted-foreground text-xs">
						{supplier.contactEmail ?? "—"}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{supplier.phone ?? "—"}
					</p>
				</div>
				<Link
					aria-label={`Ver ferramentas de ${supplier.name}`}
					className={`${buttonVariants({
						size: "icon-sm",
						variant: "ghost",
					})} shrink-0 border border-border bg-muted`}
					href={toolsHref}
					onClick={(e) => e.stopPropagation()}
				>
					<Wrench aria-hidden className="size-4" />
				</Link>
			</div>

			<div className="grid grid-cols-2 border-border border-t">
				<div className="flex flex-col items-center justify-center border-border border-r py-2.5">
					<span
						className={`font-bold text-[18px] tabular-nums ${
							noTools ? "text-amber-500" : "text-foreground"
						}`}
					>
						{supplier.toolsActive}
						<span className="font-normal text-muted-foreground">
							/{supplier.toolsTotal}
						</span>
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Ferramentas
					</span>
				</div>
				<div className="flex flex-col items-center justify-center py-2.5">
					<span className="font-semibold text-[15px] text-foreground tabular-nums">
						{MONTH_YEAR.format(supplier.createdAt)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Adicionado
					</span>
				</div>
			</div>
		</div>
	);
}
