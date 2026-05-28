"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { SupplierTableRow } from "../data";

interface SupplierCardProps {
	canMutate: boolean;
	supplier: SupplierTableRow;
}

function monogramColor(toolsTotal: number): { bg: string; text: string } {
	if (toolsTotal === 0) {
		return { bg: "bg-amber-950", text: "text-amber-400" };
	}
	return { bg: "bg-green-950", text: "text-green-400" };
}

function initials(name: string): string {
	const words = name.split(" ").filter(Boolean);
	if (words.length === 1) {
		return (words[0]?.slice(0, 2) ?? "").toUpperCase();
	}
	return words
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

export function SupplierCard({ supplier, canMutate }: SupplierCardProps) {
	const router = useRouter();
	const { bg, text } = monogramColor(supplier.toolsTotal);
	const detailHref = `/dashboard/suppliers/${supplier.id}`;
	const editHref = `/dashboard/suppliers/${supplier.id}?edit=1`;
	const contact = supplier.contactEmail ?? supplier.phone;
	const toolsInactive = supplier.toolsTotal - supplier.toolsActive;

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
				<div
					className={`flex size-12 flex-shrink-0 items-center justify-center rounded-[10px] font-bold text-[17px] ${bg} ${text}`}
				>
					{initials(supplier.name)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="line-clamp-2 min-h-[2.4rem] font-semibold text-[15px] text-foreground leading-tight">
						{supplier.name}
					</p>
					{contact ? (
						<p className="line-clamp-1 text-muted-foreground text-xs">
							{contact}
						</p>
					) : (
						<p className="line-clamp-1 text-muted-foreground/60 text-xs italic">
							Sem contato cadastrado
						</p>
					)}
					<div className="mt-1.5">
						{supplier.toolsTotal === 0 ? (
							<span className="inline-flex items-center gap-1.5 text-[11px] text-amber-500">
								<span
									aria-hidden
									className="size-1.5 rounded-full bg-amber-500"
								/>
								Sem ferramentas
							</span>
						) : (
							<span className="inline-flex items-center gap-1.5 text-[11px] text-green-500">
								<span
									aria-hidden
									className="size-1.5 rounded-full bg-green-500"
								/>
								{supplier.toolsActive}{" "}
								{supplier.toolsActive === 1 ? "ativa" : "ativas"} de{" "}
								{supplier.toolsTotal}
							</span>
						)}
					</div>
				</div>
				{canMutate && (
					<Link
						aria-label={`Editar ${supplier.name}`}
						className={`shrink-0 ${buttonVariants({
							size: "icon-sm",
							variant: "secondary",
						})}`}
						href={editHref}
						onClick={(e) => e.stopPropagation()}
					>
						<Pencil aria-hidden className="size-4" />
					</Link>
				)}
			</div>

			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-3">
					<span
						className={`font-bold text-[20px] tabular-nums ${
							supplier.toolsTotal === 0 ? "text-amber-500" : "text-foreground"
						}`}
					>
						{supplier.toolsTotal}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Ferramentas
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-3">
					<span className="font-bold text-[20px] text-foreground tabular-nums">
						{supplier.toolsActive}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Ativas
					</span>
				</div>
				<div className="flex flex-col items-center py-3">
					<span className="font-bold text-[20px] text-foreground tabular-nums">
						{toolsInactive}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Inativas
					</span>
				</div>
			</div>
		</div>
	);
}
