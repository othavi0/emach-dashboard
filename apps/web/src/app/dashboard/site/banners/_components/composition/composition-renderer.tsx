"use client";

// Renderer compartilhado: canvas do editor, card da listagem e implementação
// de referência pro storefront (issue no repo ecommerce). As classes/markup de
// cada elemento espelham banner-live-preview.tsx 1:1 — só a posição muda (via
// placementToStyle em vez dos mapas CONTENT_POS/PRODUCT_POS/CTA_POS legados).
import { cn } from "@emach/ui/lib/utils";
import Image from "next/image";
import type { PointerEvent, ReactNode } from "react";
import {
	type BannerComposition,
	type ElementKey,
	type ElementPlacement,
	partitionMobileElements,
	SAFE_STACK_ORDER,
	type Viewport,
} from "./composition-schema";
import { type RendererBanner, renderElement } from "./element-renders";
import {
	backgroundToStyle,
	focalToObjectPosition,
	GRADIENT_CLASS,
	placementToStyle,
	textSide,
} from "./placement-css";
import { SafeStack } from "./safe-stack";

export type { RendererBanner } from "./element-renders";

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

// Elemento posicionado de forma absoluta (desktop sempre; mobile só os
// overrides com placement — os demais vão pra SafeStack).
function renderPositioned(
	key: ElementKey,
	placement: ElementPlacement,
	banner: RendererBanner,
	productUrl: string | null,
	box: BoxProps
): ReactNode {
	const content = renderElement(key, banner, productUrl);
	if (content === null) {
		return null;
	}
	return (
		<ElementBox
			box={box}
			className={key === "product" ? "size-3/5" : undefined}
			elementKey={key}
			key={key}
			placement={placement}
		>
			{content}
		</ElementBox>
	);
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
	const productUrl = resolveProductUrl(banner, viewport);
	const hasText = Boolean(banner.title || banner.subtitle);
	const box: BoxProps = { onElementPointerDown, selected, viewport };
	// Mobile particiona os elements do desktop em pilha segura / posicionados
	// absoluto / escondidos (Task 12); desktop sempre posiciona por placement.
	const partition =
		viewport === "mobile" ? partitionMobileElements(composition) : null;

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
			{viewport === "desktop" &&
				SAFE_STACK_ORDER.map((key) => {
					const placement = composition.desktop.elements[key];
					if (!placement) {
						return null;
					}
					return renderPositioned(key, placement, banner, productUrl, box);
				})}
			{partition && (
				<>
					{partition.positioned.map(([key, placement]) =>
						renderPositioned(key, placement, banner, productUrl, box)
					)}
					<SafeStack
						banner={banner}
						keys={partition.stacked}
						onElementPointerDown={onElementPointerDown}
						productUrl={productUrl}
						selected={selected}
					/>
				</>
			)}
		</div>
	);
}
