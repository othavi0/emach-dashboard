"use client";

import { cn } from "@emach/ui/lib/utils";
import { ImageIcon } from "lucide-react";
import { BANNER_LAYOUTS, type BannerLayout } from "./banner-schema";

const LABELS: Record<BannerLayout, string> = {
	split: "Split",
	stack_left: "Empilhado",
	center_bottom: "Centro abaixo",
	center_mid: "Centralizado",
	center_cta_right: "Centro + CTA dir.",
	mirror_split: "Espelhado",
	hero_center: "Produto destaque",
	text_right: "Herói + CTA dir.",
};

// Os três blocos espelham o que o preview ao vivo renderiza, de forma esquemática:
// produto = moldura de imagem, título = headline + divisor + subtítulo, CTA = botão pill.
// A posição/alinhamento de cada um vem por className, casando com banner-layout-pos.ts.

function Product({ className }: { className: string }) {
	return (
		<span
			className={cn(
				"absolute flex items-center justify-center rounded-md bg-foreground/10 ring-1 ring-foreground/15 ring-inset",
				className
			)}
		>
			<ImageIcon className="size-[34%] text-foreground/35" />
		</span>
	);
}

function Title({ className, sub }: { className: string; sub?: boolean }) {
	return (
		<span className={cn("absolute flex flex-col gap-[3px]", className)}>
			<span className="h-1.5 w-full rounded-sm bg-foreground/70" />
			<span className="h-[2px] w-1/3 rounded bg-primary" />
			{sub && <span className="h-1 w-3/4 rounded-sm bg-foreground/30" />}
		</span>
	);
}

function Cta({ className }: { className: string }) {
	return (
		<span
			className={cn(
				"absolute flex items-center justify-center rounded-full bg-primary",
				className
			)}
		>
			<span className="h-[3px] w-3/5 rounded bg-white/85" />
		</span>
	);
}

function Diagram({ layout }: { layout: BannerLayout }) {
	return (
		<div className="relative mb-1.5 aspect-video overflow-hidden rounded bg-muted">
			{layout === "split" && (
				<>
					<Product className="top-1/2 right-[6%] h-[48%] w-[24%] -translate-y-1/2" />
					<Title className="bottom-[18%] left-[8%] w-[34%] items-start" />
					<Cta className="right-[8%] bottom-[14%] h-[15%] w-[24%]" />
				</>
			)}
			{layout === "stack_left" && (
				<>
					<Product className="top-1/2 right-[6%] h-[48%] w-[24%] -translate-y-1/2" />
					<Title className="bottom-[36%] left-[8%] w-[34%] items-start" />
					<Cta className="bottom-[14%] left-[8%] h-[15%] w-[22%]" />
				</>
			)}
			{layout === "center_bottom" && (
				<>
					<Product className="top-[8%] left-1/2 h-[36%] w-[28%] -translate-x-1/2" />
					<Title className="bottom-[26%] left-1/2 w-[46%] -translate-x-1/2 items-center" />
					<Cta className="bottom-[8%] left-1/2 h-[14%] w-[24%] -translate-x-1/2" />
				</>
			)}
			{layout === "center_mid" && (
				<>
					<Title className="top-1/2 left-1/2 w-[50%] -translate-x-1/2 -translate-y-[140%] items-center" />
					<Cta className="bottom-[16%] left-1/2 h-[14%] w-[26%] -translate-x-1/2" />
				</>
			)}
			{layout === "center_cta_right" && (
				<>
					<Product className="top-[8%] left-1/2 h-[40%] w-[26%] -translate-x-1/2" />
					<Title className="top-1/2 left-[8%] w-[30%] -translate-y-1/2 items-start" />
					<Cta className="right-[8%] bottom-[16%] h-[15%] w-[24%]" />
				</>
			)}
			{layout === "mirror_split" && (
				<>
					<Product className="top-1/2 left-[6%] h-[48%] w-[24%] -translate-y-1/2" />
					<Title className="top-1/2 right-[8%] w-[34%] -translate-y-1/2 items-end" />
					<Cta className="right-[8%] bottom-[14%] h-[15%] w-[24%]" />
				</>
			)}
			{layout === "hero_center" && (
				<>
					<Product className="top-1/2 left-1/2 h-[46%] w-[34%] -translate-x-1/2 -translate-y-1/2" />
					<Title className="top-[12%] left-1/2 w-[44%] -translate-x-1/2 items-center" />
					<Cta className="bottom-[8%] left-1/2 h-[14%] w-[24%] -translate-x-1/2" />
				</>
			)}
			{layout === "text_right" && (
				<>
					<Product className="top-1/2 left-1/2 h-[46%] w-[34%] -translate-x-1/2 -translate-y-1/2" />
					<Title className="top-[12%] left-1/2 w-[44%] -translate-x-1/2 items-center" />
					<Cta className="right-[8%] bottom-[14%] h-[15%] w-[24%]" />
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
