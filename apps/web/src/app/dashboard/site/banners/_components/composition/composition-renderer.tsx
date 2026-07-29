"use client";

// Renderer compartilhado: canvas do editor, card da listagem e implementação
// de referência pro storefront (issue no repo ecommerce). As classes/markup de
// cada elemento espelham banner-live-preview.tsx 1:1 — só a posição muda (via
// placementToStyle em vez dos mapas CONTENT_POS/PRODUCT_POS/CTA_POS legados).
import type { Banner } from "@emach/db/schema/banner";
import { cn } from "@emach/ui/lib/utils";
import Image from "next/image";
import type { PointerEvent, ReactNode } from "react";
import { useState } from "react";
import { CTA_BASE, CTA_VARIANT_CLASS } from "../cta-variant-class";
import {
	type BannerComposition,
	type ElementKey,
	type ElementPlacement,
	SAFE_STACK_ORDER,
	type Viewport,
} from "./composition-schema";
import {
	backgroundToStyle,
	focalToObjectPosition,
	GRADIENT_CLASS,
	placementToStyle,
	textSide,
} from "./placement-css";

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

type DesktopElements = BannerComposition["desktop"]["elements"];

function resolveBackgroundUrl(banner: RendererBanner, viewport: Viewport) {
	if (viewport === "desktop") {
		return banner.backgroundImageUrl;
	}
	if (banner.backgroundMobileMode === "none") {
		return null;
	}
	if (banner.backgroundMobileMode === "custom") {
		return banner.backgroundImageMobileUrl ?? banner.backgroundImageUrl;
	}
	return banner.backgroundImageUrl;
}

function resolveProductUrl(banner: RendererBanner, viewport: Viewport) {
	if (viewport === "mobile") {
		return banner.productImageMobileUrl ?? banner.productImageUrl;
	}
	return banner.productImageUrl;
}

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

type OnElementPointerDown = (key: ElementKey, e: PointerEvent) => void;

interface BoxProps {
	onElementPointerDown: OnElementPointerDown | undefined;
	selected: ElementKey | "background" | null | undefined;
	viewport: Viewport;
}

// Bloco absoluto compartilhado por todo elemento: posição via placementToStyle,
// hook de seleção do editor (data-element + onPointerDown) e outline coral
// (token de tema — não hex) quando selecionado.
function ElementBox({
	elementKey,
	placement,
	box,
	className,
	children,
}: {
	elementKey: ElementKey;
	placement: ElementPlacement;
	box: BoxProps;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"absolute z-10",
				box.selected === elementKey &&
					"outline outline-2 outline-primary outline-offset-4",
				className
			)}
			data-element={elementKey}
			onPointerDown={(e) => box.onElementPointerDown?.(elementKey, e)}
			style={placementToStyle(placement, box.viewport)}
		>
			{children}
		</div>
	);
}

function renderBadge(
	banner: RendererBanner,
	elements: DesktopElements,
	box: BoxProps
) {
	const placement = elements.badge;
	if (!(placement && banner.badgeText)) {
		return null;
	}
	return (
		<ElementBox box={box} elementKey="badge" key="badge" placement={placement}>
			<span className="inline-block rounded-sm bg-white px-2 py-0.5 font-[family-name:var(--font-barlow-condensed)] font-bold text-[#181818] text-[10px]">
				{banner.badgeText}
			</span>
		</ElementBox>
	);
}

function renderTitle(
	banner: RendererBanner,
	elements: DesktopElements,
	box: BoxProps
) {
	const placement = elements.title;
	if (!(placement && banner.title)) {
		return null;
	}
	return (
		<ElementBox
			box={box}
			className="flex flex-col gap-1"
			elementKey="title"
			key="title"
			placement={placement}
		>
			<p className="font-[family-name:var(--font-barlow-condensed)] font-bold text-white text-xl uppercase leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
				{banner.title}
			</p>
			<span className="my-1 h-[3px] w-10 bg-[#da291c]" />
		</ElementBox>
	);
}

function renderSubtitle(
	banner: RendererBanner,
	elements: DesktopElements,
	box: BoxProps
) {
	const placement = elements.subtitle;
	if (!(placement && banner.subtitle)) {
		return null;
	}
	return (
		<ElementBox
			box={box}
			elementKey="subtitle"
			key="subtitle"
			placement={placement}
		>
			<p className="text-[11px] text-white/85">{banner.subtitle}</p>
		</ElementBox>
	);
}

function renderSpecs(
	banner: RendererBanner,
	elements: DesktopElements,
	box: BoxProps
) {
	const placement = elements.specs;
	const specs = banner.specs ?? [];
	if (!(placement && specs.length > 0)) {
		return null;
	}
	return (
		<ElementBox box={box} elementKey="specs" key="specs" placement={placement}>
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
		</ElementBox>
	);
}

function renderCountdown(
	banner: RendererBanner,
	elements: DesktopElements,
	box: BoxProps
) {
	const placement = elements.countdown;
	if (!(placement && banner.countdownTarget)) {
		return null;
	}
	return (
		<ElementBox
			box={box}
			elementKey="countdown"
			key="countdown"
			placement={placement}
		>
			<Countdown target={banner.countdownTarget} />
		</ElementBox>
	);
}

function renderProduct(
	elements: DesktopElements,
	productUrl: string | null,
	box: BoxProps
) {
	const placement = elements.product;
	if (!(placement && productUrl)) {
		return null;
	}
	return (
		<ElementBox
			box={box}
			className="size-3/5"
			elementKey="product"
			key="product"
			placement={placement}
		>
			<div className="relative size-full">
				<Image
					alt=""
					className="object-contain drop-shadow-[0_24px_24px_rgba(0,0,0,0.6)]"
					fill
					sizes="60vw"
					src={productUrl}
				/>
			</div>
		</ElementBox>
	);
}

function renderCta(
	banner: RendererBanner,
	elements: DesktopElements,
	box: BoxProps
) {
	const placement = elements.cta;
	if (!(placement && banner.ctaLabel && banner.ctaHref)) {
		return null;
	}
	return (
		<ElementBox box={box} elementKey="cta" key="cta" placement={placement}>
			<span
				className={cn(
					CTA_BASE,
					CTA_VARIANT_CLASS[banner.ctaVariant],
					"px-3 py-1.5 text-[11px]"
				)}
			>
				{banner.ctaLabel} →
			</span>
		</ElementBox>
	);
}

function renderElement(
	key: ElementKey,
	banner: RendererBanner,
	elements: DesktopElements,
	productUrl: string | null,
	box: BoxProps
) {
	switch (key) {
		case "badge":
			return renderBadge(banner, elements, box);
		case "title":
			return renderTitle(banner, elements, box);
		case "subtitle":
			return renderSubtitle(banner, elements, box);
		case "specs":
			return renderSpecs(banner, elements, box);
		case "countdown":
			return renderCountdown(banner, elements, box);
		case "product":
			return renderProduct(elements, productUrl, box);
		case "cta":
			return renderCta(banner, elements, box);
		default:
			return null;
	}
}

export function CompositionRenderer({
	banner,
	composition,
	viewport,
	selected,
	onElementPointerDown,
}: {
	banner: RendererBanner;
	composition: BannerComposition;
	viewport: Viewport;
	selected?: ElementKey | "background" | null;
	onElementPointerDown?: (key: ElementKey, e: PointerEvent) => void;
}) {
	const bgUrl = resolveBackgroundUrl(banner, viewport);
	const bgCfg =
		viewport === "mobile"
			? (composition.mobile.background ?? composition.desktop.background)
			: composition.desktop.background;
	// Fase 2 (Task 7): só o viewport desktop posiciona por placement. A Task 12
	// introduz a pilha segura mobile (partição desktop/mobile com overrides
	// "hidden"); até lá, viewport "mobile" reaproveita os elements do desktop.
	const elements = composition.desktop.elements;
	const productUrl = resolveProductUrl(banner, viewport);
	const hasText = Boolean(banner.title || banner.subtitle);
	const box: BoxProps = { onElementPointerDown, selected, viewport };

	return (
		<div className="relative h-full w-full overflow-hidden bg-[#0b0a09] font-[family-name:var(--font-barlow)]">
			{/* gradiente radial de marca por baixo (igual ao banner-live-preview.tsx) */}
			<div
				className="absolute inset-0"
				style={{
					background:
						"radial-gradient(120% 120% at 35% 60%, #2a1a17 0%, #0b0a09 70%)",
				}}
			/>
			{bgUrl !== null && (
				<div className="absolute inset-0" style={backgroundToStyle(bgCfg)}>
					<Image
						alt={banner.altText ?? ""}
						className="object-cover"
						fill
						sizes="100vw"
						src={bgUrl}
						style={{ objectPosition: focalToObjectPosition(bgCfg.focal) }}
					/>
				</div>
			)}
			{bgUrl === null && (
				// Sem imagem de fundo é estado real (banner "vazio"): glow decorativo
				// vermelho — igual ao banner-live-preview.tsx.
				<div
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-1/2 size-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full"
					style={{
						background:
							"radial-gradient(circle, rgba(218,41,28,0.3), transparent 70%)",
						filter: "blur(20px)",
					}}
				/>
			)}
			{hasText && (
				<div
					aria-hidden="true"
					className={`absolute inset-0 ${GRADIENT_CLASS[textSide(composition)]}`}
				/>
			)}
			{SAFE_STACK_ORDER.map((key) =>
				renderElement(key, banner, elements, productUrl, box)
			)}
		</div>
	);
}
