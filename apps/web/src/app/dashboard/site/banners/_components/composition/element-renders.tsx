"use client";

// Conteúdo puro de cada elemento (Task 12, fix round 1): extraído de
// composition-renderer.tsx pra um módulo próprio, sem depender de
// composition-renderer nem de safe-stack — quebra o ciclo de import entre os
// dois (renderer importava SafeStack; safe-stack importava renderElement do
// renderer). Cada função só decide SE renderiza, com base no dado do banner;
// ONDE renderiza (posição absoluta vs. pilha) é responsabilidade do chamador
// (composition-renderer.tsx / safe-stack.tsx).
import type { Banner } from "@emach/db/schema/banner";
import { cn } from "@emach/ui/lib/utils";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { CTA_BASE, CTA_VARIANT_CLASS } from "../cta-variant-class";
import type { ElementKey } from "./composition-schema";

export type RendererBanner = Pick<
	Banner,
	| "backgroundImageUrl"
	| "backgroundImageMobileUrl"
	| "backgroundMobileMode"
	| "productImageUrl"
	| "productImageMobileUrl"
	| "title"
	| "subtitle"
	| "specs"
	| "altText"
	| "badgeText"
	| "ctaLabel"
	| "ctaHref"
	| "ctaVariant"
	| "countdownTarget"
>;

function Countdown({ target }: { target: Date }) {
	// "Agora" congelado por instância: Date.now() no corpo do render é impuro
	// (quebra memoização do Compiler); o renderer é um snapshot, não um ticker
	// — igual ao banner-live-preview.tsx.
	const [now] = useState(() => Date.now());
	const ms = Math.max(0, target.getTime() - now);
	const d = Math.floor(ms / 86_400_000);
	const h = Math.floor((ms % 86_400_000) / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	return (
		<span className="font-bold text-sm text-white tabular-nums">
			{d}d {h}h {m}m
		</span>
	);
}

function renderBadgeContent(banner: RendererBanner): ReactNode {
	if (!banner.badgeText) {
		return null;
	}
	return (
		<span className="inline-block rounded-sm bg-white px-2 py-0.5 font-[family-name:var(--font-barlow-condensed)] font-bold text-[#181818] text-[10px]">
			{banner.badgeText}
		</span>
	);
}

function renderTitleContent(banner: RendererBanner): ReactNode {
	if (!banner.title) {
		return null;
	}
	return (
		<div className="flex flex-col gap-1">
			<p className="font-[family-name:var(--font-barlow-condensed)] font-bold text-white text-xl uppercase leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
				{banner.title}
			</p>
			<span className="my-1 h-[3px] w-10 bg-[#da291c]" />
		</div>
	);
}

function renderSubtitleContent(banner: RendererBanner): ReactNode {
	if (!banner.subtitle) {
		return null;
	}
	return <p className="text-[11px] text-white/85">{banner.subtitle}</p>;
}

function renderSpecsContent(banner: RendererBanner): ReactNode {
	const specs = banner.specs ?? [];
	if (specs.length === 0) {
		return null;
	}
	return (
		<ul className="flex flex-wrap gap-1">
			{specs.map((spec, i) => (
				// key por índice ok: lista curta (≤6) de strings sem ID estável, sem reordenação
				<li
					className="rounded-sm bg-white/15 px-1.5 py-0.5 font-[family-name:var(--font-barlow-condensed)] font-medium text-[10px] text-white uppercase"
					key={i}
				>
					{spec}
				</li>
			))}
		</ul>
	);
}

function renderCountdownContent(banner: RendererBanner): ReactNode {
	if (!banner.countdownTarget) {
		return null;
	}
	return <Countdown target={banner.countdownTarget} />;
}

function renderProductContent(productUrl: string | null): ReactNode {
	if (!productUrl) {
		return null;
	}
	return (
		<div className="relative size-full">
			<Image
				alt=""
				className="object-contain drop-shadow-[0_24px_24px_rgba(0,0,0,0.6)]"
				fill
				sizes="60vw"
				src={productUrl}
			/>
		</div>
	);
}

function renderCtaContent(
	banner: RendererBanner,
	style?: CSSProperties
): ReactNode {
	if (!(banner.ctaLabel && banner.ctaHref)) {
		return null;
	}
	return (
		<span
			className={cn(
				CTA_BASE,
				CTA_VARIANT_CLASS[banner.ctaVariant],
				"px-3 py-1.5 text-[11px]"
			)}
			style={style}
		>
			{banner.ctaLabel} →
		</span>
	);
}

// Função compartilhada do módulo composition (Task 12) — despacha pro
// conteúdo puro de cada elemento. `style` é usado pelos casos que precisam de
// um ajuste inline no contexto da pilha (ex: CTA full-width no SafeStack).
export function renderElement(
	key: ElementKey,
	banner: RendererBanner,
	productUrl: string | null,
	style?: CSSProperties
): ReactNode {
	switch (key) {
		case "badge":
			return renderBadgeContent(banner);
		case "title":
			return renderTitleContent(banner);
		case "subtitle":
			return renderSubtitleContent(banner);
		case "specs":
			return renderSpecsContent(banner);
		case "countdown":
			return renderCountdownContent(banner);
		case "product":
			return renderProductContent(productUrl);
		case "cta":
			return renderCtaContent(banner, style);
		default:
			return null;
	}
}
