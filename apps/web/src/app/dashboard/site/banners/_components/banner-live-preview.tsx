"use client";

import { Button } from "@emach/ui/components/button";
import { cn } from "@emach/ui/lib/utils";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import type { SlotKey } from "./banner-presets";
import type { BannerFormValues } from "./banner-schema";
import { CTA_BASE, CTA_VARIANT_CLASS } from "./cta-variant-class";

const CONTENT_POS: Record<BannerFormValues["layout"], string> = {
	split: "left-[7%] top-1/2 -translate-y-1/2 items-start text-left",
	stack_left: "left-[7%] bottom-[14%] items-start text-left",
	center_bottom:
		"left-1/2 bottom-[14%] -translate-x-1/2 items-center text-center",
	center_mid:
		"left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center text-center",
};

function Countdown({ target }: { target: Date }) {
	const ms = Math.max(0, target.getTime() - Date.now());
	const d = Math.floor(ms / 86_400_000);
	const h = Math.floor((ms % 86_400_000) / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	return (
		<span className="font-bold text-sm text-white tabular-nums">
			{d}d {h}h {m}m
		</span>
	);
}

export function BannerLivePreview({
	values,
	slots,
}: {
	values: BannerFormValues;
	slots: Record<SlotKey, boolean>;
}) {
	const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
	const isMobile = device === "mobile";

	function resolveBg(): string | null {
		if (!slots.background) {
			return null;
		}
		if (isMobile) {
			return values.backgroundImageMobileUrl ?? values.backgroundImageUrl;
		}
		return values.backgroundImageUrl;
	}
	function resolveProduct(): string | null {
		if (!slots.product) {
			return null;
		}
		if (isMobile) {
			return values.productImageMobileUrl ?? values.productImageUrl;
		}
		return values.productImageUrl;
	}
	const bg = resolveBg();
	const product = resolveProduct();
	const hasContent =
		(slots.title && values.title) ||
		(slots.badge && values.badgeText) ||
		(slots.countdown && values.countdownTarget);
	const productSide =
		values.layout === "split" || values.layout === "stack_left";

	return (
		<div className="sticky top-4 flex flex-col gap-2 self-start">
			<div className="flex items-center justify-between">
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
					Preview ao vivo
				</span>
				<div className="flex gap-1 rounded-lg bg-muted p-1">
					<Button
						onClick={() => setDevice("desktop")}
						size="sm"
						variant={isMobile ? "ghost" : "default"}
					>
						<Monitor className="size-4" /> Desktop
					</Button>
					<Button
						onClick={() => setDevice("mobile")}
						size="sm"
						variant={isMobile ? "default" : "ghost"}
					>
						<Smartphone className="size-4" /> Mobile
					</Button>
				</div>
			</div>

			<div
				className={cn(
					"relative mx-auto w-full overflow-hidden rounded-lg",
					isMobile ? "aspect-[9/16] max-w-[240px]" : "aspect-video"
				)}
				style={{
					background:
						"radial-gradient(120% 120% at 35% 60%, #2a1a17 0%, #0b0a09 70%)",
				}}
			>
				{bg ? (
					// biome-ignore lint/performance/noImgElement: preview de URL pública
					// biome-ignore lint/correctness/useImageSize: dimensão via CSS
					<img
						alt=""
						className="absolute inset-0 size-full object-cover"
						src={bg}
					/>
				) : (
					<div
						aria-hidden
						className="pointer-events-none absolute top-1/2 left-1/2 size-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full"
						style={{
							background:
								"radial-gradient(circle, rgba(218,41,28,0.3), transparent 70%)",
							filter: "blur(20px)",
						}}
					/>
				)}

				{product && (
					// biome-ignore lint/performance/noImgElement: preview de URL pública
					// biome-ignore lint/correctness/useImageSize: dimensão via CSS
					<img
						alt=""
						className={cn(
							"absolute size-3/5 object-contain drop-shadow-[0_24px_24px_rgba(0,0,0,0.6)]",
							productSide
								? "top-1/2 right-[6%] -translate-y-1/2"
								: "top-[8%] left-1/2 -translate-x-1/2"
						)}
						src={product}
					/>
				)}

				{hasContent && (
					<div
						className={cn(
							"absolute z-10 flex max-w-[70%] flex-col gap-1",
							CONTENT_POS[values.layout]
						)}
					>
						{slots.badge && values.badgeText && (
							<span className="inline-block rounded-sm bg-white px-2 py-0.5 font-bold text-[#181818] text-[10px]">
								{values.badgeText}
							</span>
						)}
						{slots.title && values.title && (
							<>
								<p className="font-bold text-white text-xl uppercase leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
									{values.title}
								</p>
								<span className="my-1 h-[3px] w-10 bg-[#da291c]" />
							</>
						)}
						{slots.title && values.subtitle && (
							<p className="text-[11px] text-white/85">{values.subtitle}</p>
						)}
						{slots.countdown && values.countdownTarget && (
							<Countdown target={values.countdownTarget} />
						)}
					</div>
				)}

				{slots.cta && values.ctaLabel && (
					<span
						className={cn(
							"absolute z-10 px-3 py-1.5 text-[11px]",
							CTA_BASE,
							CTA_VARIANT_CLASS[values.ctaVariant],
							values.layout === "split"
								? "right-[7%] bottom-[12%]"
								: "bottom-[6%] left-1/2 -translate-x-1/2"
						)}
					>
						{values.ctaLabel} →
					</span>
				)}

				<div className="absolute bottom-[6%] left-1/2 z-10 flex -translate-x-1/2 gap-1">
					<span className="h-[3px] w-4 rounded bg-[#da291c]" />
					<span className="h-[3px] w-4 rounded bg-white/30" />
				</div>
			</div>

			<p className="text-[10px] text-muted-foreground">
				≈ como aparece na home (estilo Ferrari). O texto/posição é aproximação —
				a render final é do storefront.
			</p>
		</div>
	);
}
