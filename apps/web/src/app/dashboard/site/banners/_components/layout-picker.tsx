"use client";

import { cn } from "@emach/ui/lib/utils";
import { BANNER_LAYOUTS, type BannerLayout } from "./banner-schema";

const LABELS: Record<BannerLayout, string> = {
	split: "Split",
	stack_left: "Empilhado",
	center_bottom: "Centro abaixo",
	center_mid: "Centralizado",
};

function Diagram({ layout }: { layout: BannerLayout }) {
	return (
		<div className="relative mb-1.5 aspect-video overflow-hidden rounded bg-muted">
			{layout === "split" && (
				<>
					<span className="absolute top-[28%] left-[8%] h-[8%] w-[34%] rounded-sm bg-foreground/40" />
					<span className="absolute right-[8%] bottom-[16%] h-[12%] w-[24%] rounded-sm bg-primary" />
					<span className="absolute top-[30%] right-[6%] h-[46%] w-[24%] rounded-sm bg-foreground/20" />
				</>
			)}
			{layout === "stack_left" && (
				<>
					<span className="absolute bottom-[34%] left-[8%] h-[8%] w-[34%] rounded-sm bg-foreground/40" />
					<span className="absolute bottom-[14%] left-[8%] h-[10%] w-[20%] rounded-sm bg-primary" />
					<span className="absolute top-[30%] right-[6%] h-[46%] w-[24%] rounded-sm bg-foreground/20" />
				</>
			)}
			{layout === "center_bottom" && (
				<>
					<span className="absolute top-[16%] left-1/2 h-[34%] w-[30%] -translate-x-1/2 rounded-sm bg-foreground/20" />
					<span className="absolute bottom-[18%] left-1/2 h-[8%] w-[46%] -translate-x-1/2 rounded-sm bg-foreground/40" />
					<span className="absolute bottom-[6%] left-1/2 h-[8%] w-[24%] -translate-x-1/2 rounded-sm bg-primary" />
				</>
			)}
			{layout === "center_mid" && (
				<>
					<span className="absolute top-[40%] left-1/2 h-[9%] w-[50%] -translate-x-1/2 rounded-sm bg-foreground/40" />
					<span className="absolute top-[56%] left-1/2 h-[9%] w-[26%] -translate-x-1/2 rounded-sm bg-primary" />
				</>
			)}
		</div>
	);
}

export function LayoutPicker({
	value,
	onChange,
}: {
	value: BannerLayout;
	onChange: (v: BannerLayout) => void;
}) {
	return (
		<div className="grid grid-cols-4 gap-2">
			{BANNER_LAYOUTS.map((l) => (
				<button
					className={cn(
						"rounded-lg border bg-card p-1.5 text-left transition-colors",
						value === l
							? "border-primary"
							: "border-border hover:border-border/60"
					)}
					key={l}
					onClick={() => onChange(l)}
					type="button"
				>
					<Diagram layout={l} />
					<span className="block text-center text-[10px] text-muted-foreground">
						{LABELS[l]}
					</span>
				</button>
			))}
		</div>
	);
}
