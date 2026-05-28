"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Boxes, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBranchAddress } from "@/lib/format/branch";
import { getInitials } from "@/lib/format/name";

import type { BranchTableRow } from "../data";

interface BranchCardProps {
	branch: BranchTableRow;
	canManage: boolean;
}

function monogramColor(lowStock: number): { bg: string; text: string } {
	if (lowStock > 0) {
		return { bg: "bg-amber-950", text: "text-amber-400" };
	}
	return { bg: "bg-green-950", text: "text-green-400" };
}

export function BranchCard({ branch, canManage }: BranchCardProps) {
	const router = useRouter();
	const { bg, text } = monogramColor(branch.lowStock);
	const detailHref = `/dashboard/branches/${branch.id}`;
	const stockHref = `/dashboard/branches/${branch.id}?tab=stock`;
	const editHref = `/dashboard/branches/${branch.id}?edit=1`;
	const primaryHref = canManage ? detailHref : stockHref;

	return (
		<div
			className={`group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${branch.status === "inactive" ? "opacity-70" : ""}`}
			onClick={() => router.push(primaryHref)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(primaryHref);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div
					className={`flex size-12 flex-shrink-0 items-center justify-center rounded-[10px] font-bold text-[17px] ${bg} ${text}`}
				>
					{getInitials(branch.name)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-[15px] text-foreground leading-tight">
						{branch.name}
					</p>
					{branch.status === "inactive" && (
						<span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
							Inativa
						</span>
					)}
					{(() => {
						const addr = formatBranchAddress(branch);
						return addr ? (
							<p className="line-clamp-1 text-muted-foreground text-xs">
								{addr}
							</p>
						) : null;
					})()}
					<div className="mt-1.5">
						{branch.lowStock === 0 ? (
							<span className="inline-flex items-center gap-1.5 text-[11px] text-green-500">
								<span
									aria-hidden
									className="size-1.5 rounded-full bg-green-500"
								/>
								Estoque OK
							</span>
						) : (
							<span className="inline-flex items-center gap-1.5 text-[11px] text-amber-500">
								<span
									aria-hidden
									className="size-1.5 rounded-full bg-amber-500"
								/>
								{branch.lowStock} abaixo do mín.
							</span>
						)}
					</div>
				</div>
				{canManage && (
					<div
						className="flex shrink-0 items-center gap-1"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<Link
							aria-label={`Ver estoque de ${branch.name}`}
							className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
							href={stockHref}
						>
							<Boxes aria-hidden className="size-4" />
						</Link>
						<Link
							aria-label={`Editar ${branch.name}`}
							className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
							href={editHref}
						>
							<Pencil aria-hidden className="size-4" />
						</Link>
					</div>
				)}
			</div>

			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-3">
					<span className="font-bold text-[20px] text-foreground tabular-nums">
						{branch.teamCount}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Equipe
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-3">
					<span className="font-bold text-[20px] text-foreground tabular-nums">
						{branch.activeSkus}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						SKUs ativos
					</span>
				</div>
				<div className="flex flex-col items-center py-3">
					<span
						className={`font-bold text-[20px] tabular-nums ${
							branch.lowStock > 0 ? "text-amber-500" : "text-foreground"
						}`}
					>
						{branch.lowStock}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Abaixo mín.
					</span>
				</div>
			</div>
		</div>
	);
}
