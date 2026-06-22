"use client";

import { useRouter } from "next/navigation";

import { formatMonthYear } from "@/lib/format/datetime";
import { getInitials } from "@/lib/format/name";
import { cnpjMask } from "@/lib/masks";
import type { CarrierBaseRow } from "../data";

interface CarrierCardProps {
	carrier: CarrierBaseRow;
}

export function CarrierCard({ carrier }: CarrierCardProps) {
	const router = useRouter();
	const detailHref = `/dashboard/shipping/carriers/${carrier.id}`;
	const cnpjDisplay = carrier.cnpj ? cnpjMask.format(carrier.cnpj) : null;

	return (
		// biome-ignore lint/a11y/useSemanticElements: card clicável (padrão DESIGN.md §4)
		<div
			className={`group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${carrier.active ? "" : "opacity-70"}`}
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
				<div className="flex size-12 flex-shrink-0 items-center justify-center rounded-md border border-border bg-muted font-bold text-[17px] text-foreground">
					{getInitials(carrier.name)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-[15px] text-foreground leading-tight">
						{carrier.name}
					</p>
					{!carrier.active && (
						<span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
							Inativa
						</span>
					)}
					<p className="truncate text-muted-foreground text-xs">
						{cnpjDisplay ?? "—"}
					</p>
				</div>
			</div>

			<div className="flex justify-center border-border border-t py-2.5">
				<div className="flex flex-col items-center justify-center">
					<span className="font-semibold text-[15px] text-foreground tabular-nums">
						{formatMonthYear(carrier.createdAt)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Adicionada
					</span>
				</div>
			</div>
		</div>
	);
}
