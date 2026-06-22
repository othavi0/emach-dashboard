"use client";

import { useRouter } from "next/navigation";

import { formatMeasure } from "@/lib/format/number";

import type { ShippingBoxRow } from "../data";

interface Props {
	box: ShippingBoxRow;
}

export function BoxCard({ box }: Props) {
	const router = useRouter();

	const dims = [
		formatMeasure(box.internalLengthCm),
		formatMeasure(box.internalWidthCm),
		formatMeasure(box.internalHeightCm),
	]
		.filter(Boolean)
		.join(" × ");

	return (
		// biome-ignore lint/a11y/useSemanticElements: card clicável (padrão DESIGN.md §4) — div role=button com onKeyDown
		<div
			className={`group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${box.active ? "" : "opacity-70"}`}
			onClick={() => router.push(`?editBox=${box.id}`, { scroll: false })}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`?editBox=${box.id}`, { scroll: false });
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<p className="truncate font-semibold text-[15px] text-foreground leading-tight">
							{box.name}
						</p>
						{!box.active && (
							<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
								Inativa
							</span>
						)}
					</div>
					<p className="mt-0.5 text-muted-foreground text-xs">{dims} cm</p>
				</div>
			</div>

			<div className="grid grid-cols-2 border-border border-t">
				<div className="flex flex-col items-center justify-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] tabular-nums">
						{formatMeasure(box.maxWeightKg)}
						<span className="font-normal text-muted-foreground text-sm">
							{" "}
							kg
						</span>
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Peso máx.
					</span>
				</div>
				<div className="flex flex-col items-center justify-center py-2.5">
					<span className="font-semibold text-[15px] tabular-nums">
						{formatMeasure(box.tareWeightKg)}
						<span className="font-normal text-muted-foreground text-sm">
							{" "}
							kg
						</span>
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Tara
					</span>
				</div>
			</div>
		</div>
	);
}
