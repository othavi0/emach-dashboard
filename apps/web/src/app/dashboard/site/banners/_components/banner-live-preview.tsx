"use client";

import { Button } from "@emach/ui/components/button";
import { cn } from "@emach/ui/lib/utils";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import type { BannerFormValues } from "./banner-schema";

export function BannerLivePreview({ values }: { values: BannerFormValues }) {
	const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
	const bg =
		device === "mobile"
			? (values.backgroundImageMobileUrl ?? values.backgroundImageUrl)
			: values.backgroundImageUrl;
	const product =
		device === "mobile"
			? (values.productImageMobileUrl ?? values.productImageUrl)
			: values.productImageUrl;

	return (
		<div className="sticky top-4 flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
					Preview ao vivo
				</span>
				<div className="flex gap-1 rounded-lg bg-muted p-1">
					<Button
						onClick={() => setDevice("desktop")}
						size="sm"
						variant={device === "desktop" ? "default" : "ghost"}
					>
						<Monitor className="size-4" /> Desktop
					</Button>
					<Button
						onClick={() => setDevice("mobile")}
						size="sm"
						variant={device === "mobile" ? "default" : "ghost"}
					>
						<Smartphone className="size-4" /> Mobile
					</Button>
				</div>
			</div>
			<div
				className={cn(
					"relative mx-auto w-full overflow-hidden rounded-lg bg-black",
					device === "mobile" ? "aspect-[9/16] max-w-[240px]" : "aspect-video"
				)}
			>
				{bg ? (
					// biome-ignore lint/performance/noImgElement: preview de URL pública/efêmera
					// biome-ignore lint/correctness/useImageSize: dimensão via CSS
					<img
						alt=""
						className="absolute inset-0 size-full object-cover"
						src={bg}
					/>
				) : (
					<div className="flex size-full items-center justify-center text-muted-foreground text-xs">
						Envie a imagem de fundo
					</div>
				)}
				<div
					aria-hidden
					className="pointer-events-none absolute top-1/2 left-1/2 size-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full"
					style={{
						background:
							"radial-gradient(circle, rgba(230,0,18,0.25), transparent 70%)",
						filter: "blur(20px)",
					}}
				/>
				{product && (
					// biome-ignore lint/performance/noImgElement: preview de URL pública/efêmera
					// biome-ignore lint/correctness/useImageSize: dimensão via CSS
					<img
						alt=""
						className="absolute inset-0 m-auto size-3/5 object-contain drop-shadow-[0_24px_24px_rgba(0,0,0,0.6)]"
						src={product}
					/>
				)}
				{values.title && (
					<div className="absolute bottom-10 left-4 z-10 max-w-[70%] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
						<p className="font-bold text-lg leading-tight">{values.title}</p>
						{values.subtitle && <p className="text-xs">{values.subtitle}</p>}
					</div>
				)}
				{values.ctaLabel && (
					<span className="absolute right-4 bottom-4 z-10 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground text-xs">
						{values.ctaLabel} →
					</span>
				)}
				<div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1">
					<span className="h-1 w-5 rounded bg-primary" />
					<span className="h-1 w-5 rounded bg-white/30" />
				</div>
			</div>
			<p className="text-[10px] text-muted-foreground">
				≈ como aparece na home. O texto é indicativo — a posição final é
				definida no refactor do storefront.
			</p>
		</div>
	);
}
