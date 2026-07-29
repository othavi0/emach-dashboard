import type { Banner } from "@emach/db/schema/banner";
import type { BannerLayout } from "../banner-schema";
import type {
	Anchor9,
	BannerComposition,
	ElementPlacement,
} from "./composition-schema";

interface Trio {
	cta: Anchor9;
	product: Anchor9 | null;
	title: Anchor9;
}

// Fonte única do mapeamento (espelha banner-layout-pos.ts / LAYOUT_CONFIG da loja).
const LEGACY_TRIO: Record<BannerLayout, Trio> = {
	split: { title: "bl", product: "mr", cta: "br" },
	stack_left: { title: "bl", product: "mr", cta: "bc" },
	center_bottom: { title: "bc", product: "tc", cta: "bc" },
	center_mid: { title: "mc", product: null, cta: "bc" },
	center_cta_right: { title: "ml", product: "tc", cta: "br" },
	mirror_split: { title: "mr", product: "ml", cta: "br" },
	hero_center: { title: "tc", product: "mc", cta: "bc" },
	text_right: { title: "tc", product: "mc", cta: "br" },
};

const p = (
	anchor: Anchor9,
	scale = 100,
	maxWidth?: number
): ElementPlacement =>
	maxWidth === undefined
		? { anchor, offsetX: 0, offsetY: 0, scale }
		: { anchor, offsetX: 0, offsetY: 0, scale, maxWidth };

type HasFlagsSource = Pick<
	Banner,
	| "title"
	| "subtitle"
	| "badgeText"
	| "specs"
	| "countdownTarget"
	| "productImageUrl"
	| "ctaLabel"
	| "ctaHref"
>;

// Fonte única dos flags has* consumidos por legacyToComposition — antes
// triplicado (idêntico) em backfill-banner-composition.ts, editor-reducer.ts
// e banner-card.tsx. Zero mudança de semântica: só dedup (fix round 1, T14).
export function deriveHasFlagsFromBanner(banner: HasFlagsSource): {
	hasTitle: boolean;
	hasSubtitle: boolean;
	hasBadge: boolean;
	hasSpecs: boolean;
	hasCountdown: boolean;
	hasProduct: boolean;
	hasCta: boolean;
} {
	return {
		hasTitle: banner.title !== null,
		hasSubtitle: banner.subtitle !== null,
		hasBadge: banner.badgeText !== null,
		hasSpecs: banner.specs !== null && banner.specs.length > 0,
		hasCountdown: banner.countdownTarget !== null,
		hasProduct: banner.productImageUrl !== null,
		// AND (não OR do deriveSlots do form legado): elemento cta na composition
		// = renderizável, e renderer/zod exigem label+href juntos.
		hasCta: banner.ctaLabel !== null && banner.ctaHref !== null,
	};
}

export function legacyToComposition(input: {
	layout: BannerLayout;
	productScale: number;
	ctaScale: number;
	hasTitle: boolean;
	hasSubtitle: boolean;
	hasBadge: boolean;
	hasSpecs: boolean;
	hasCountdown: boolean;
	hasProduct: boolean;
	hasCta: boolean;
}): BannerComposition {
	const trio = LEGACY_TRIO[input.layout];
	const elements: BannerComposition["desktop"]["elements"] = {};
	// Badge/specs/countdown/subtítulo acompanham o bloco do título no legado.
	if (input.hasBadge) {
		elements.badge = p(trio.title);
	}
	if (input.hasTitle) {
		elements.title = p(trio.title, 100, 44);
	}
	if (input.hasSpecs) {
		elements.specs = p(trio.title, 100, 44);
	}
	if (input.hasSubtitle) {
		elements.subtitle = p(trio.title, 100, 44);
	}
	if (input.hasCountdown) {
		elements.countdown = p(trio.title);
	}
	if (input.hasProduct && trio.product !== null) {
		// center_mid não tem slot de produto no legado (LAYOUT_CONFIG.product
		// = null no hero-carousel da loja) — omitir, não inventar posição.
		elements.product = p(trio.product, input.productScale);
	}
	if (input.hasCta) {
		elements.cta = p(trio.cta, input.ctaScale);
	}
	return {
		version: 1,
		desktop: { background: { zoom: 100, focal: "mc" }, elements },
		mobile: { elements: {} },
	};
}

const col = (a: Anchor9) => a[1] as "l" | "c" | "r";
const row = (a: Anchor9) => a[0] as "t" | "m" | "b";

function classifyLayout(
	title: Anchor9,
	product: Anchor9 | null,
	cta: Anchor9 | null
): BannerLayout {
	const tc = col(title);
	const tr = row(title);
	if (tc === "l" && product !== null && col(product) === "r") {
		if (cta !== null && col(cta) === "r") {
			return "split";
		}
		return "stack_left";
	}
	if (tc === "l") {
		return "center_cta_right";
	}
	if (tc === "r") {
		return "mirror_split";
	}
	if (tr === "b") {
		return "center_bottom";
	}
	if (tr === "m") {
		return "center_mid";
	}
	// texto no topo-centro: hero_center vs text_right pelo CTA
	if (cta !== null && col(cta) === "r") {
		return "text_right";
	}
	return "hero_center";
}

export function deriveLegacyLayout(c: BannerComposition): {
	layout: BannerLayout;
	productScale: number;
	ctaScale: number;
} {
	const e = c.desktop.elements;
	const title =
		e.title?.anchor ?? e.subtitle?.anchor ?? e.badge?.anchor ?? null;
	const product = e.product?.anchor ?? null;
	const cta = e.cta?.anchor ?? null;

	const layout: BannerLayout =
		title === null ? "split" : classifyLayout(title, product, cta);

	const clamp = (v: number, lo: number, hi: number) =>
		Math.min(Math.max(v, lo), hi);
	return {
		layout,
		productScale: clamp(e.product?.scale ?? 100, 50, 160),
		ctaScale: clamp(e.cta?.scale ?? 100, 80, 140),
	};
}
