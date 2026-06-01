"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Eye, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getInitials } from "@/lib/format/name";
import type { SupplierTableRow } from "../data";

const MONTH_YEAR = new Intl.DateTimeFormat("pt-BR", {
	month: "2-digit",
	year: "numeric",
});

interface SupplierCardProps {
	canMutate: boolean;
	supplier: SupplierTableRow;
}

export function SupplierCard({ supplier, canMutate }: SupplierCardProps) {
	const router = useRouter();
	const detailHref = `/dashboard/suppliers/${supplier.id}`;
	const editHref = `/dashboard/suppliers/${supplier.id}?edit=1`;
	const noTools = supplier.toolsTotal === 0;

	return (
		<div
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
					<p className="truncate text-muted-foreground text-xs">
						{supplier.contactEmail ?? "—"}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{supplier.phone ?? "—"}
					</p>
				</div>
				<div
					className="flex shrink-0 items-center gap-1"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<Link
						aria-label={`Ver detalhes de ${supplier.name}`}
						className={`${buttonVariants({
							size: "icon-sm",
							variant: "ghost",
						})} border border-border bg-muted`}
						href={detailHref}
					>
						<Eye aria-hidden className="size-4" />
					</Link>
					{canMutate && (
						<Link
							aria-label={`Editar ${supplier.name}`}
							className={`${buttonVariants({
								size: "icon-sm",
								variant: "ghost",
							})} border border-border bg-muted`}
							href={editHref}
						>
							<Pencil aria-hidden className="size-4" />
						</Link>
					)}
				</div>
			</div>

			<div className="grid grid-cols-2 border-border border-t">
				<div className="flex flex-col items-center justify-center border-border border-r py-3">
					<span
						className={`font-bold text-[20px] tabular-nums ${
							noTools ? "text-amber-500" : "text-foreground"
						}`}
					>
						{supplier.toolsActive}
						<span className="font-normal text-muted-foreground">
							/{supplier.toolsTotal}
						</span>
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Ferramentas
					</span>
				</div>
				<div className="flex flex-col items-center justify-center py-3">
					<span className="font-semibold text-[15px] text-foreground tabular-nums">
						{MONTH_YEAR.format(supplier.createdAt)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Adicionado
					</span>
				</div>
			</div>
		</div>
	);
}
