import {
	type BannerComposition,
	DEFAULT_COMPOSITION,
	type ElementKey,
} from "./composition-schema";

function t(
	key: string,
	label: string,
	hint: string,
	composition: BannerComposition
) {
	return {
		key,
		label,
		hint,
		composition,
		slots: Object.keys(composition.desktop.elements) as ElementKey[],
	};
}

export const BANNER_TEMPLATES = [
	t(
		"produto",
		"Produto em destaque",
		"fundo + produto à direita + texto + CTA",
		DEFAULT_COMPOSITION
	),
	t("promo-central", "Promo central", "badge + texto centralizado + CTA", {
		version: 1,
		desktop: {
			background: { zoom: 100, focal: "mc" },
			elements: {
				badge: { anchor: "mc", offsetX: 0, offsetY: -14, scale: 100 },
				title: {
					anchor: "mc",
					offsetX: 0,
					offsetY: -4,
					scale: 110,
					maxWidth: 60,
				},
				subtitle: {
					anchor: "mc",
					offsetX: 0,
					offsetY: 6,
					scale: 100,
					maxWidth: 60,
				},
				cta: { anchor: "bc", offsetX: 0, offsetY: 0, scale: 100 },
			},
		},
		mobile: { elements: {} },
	}),
	t("countdown", "Countdown", "produto + contador + CTA", {
		version: 1,
		desktop: {
			background: { zoom: 100, focal: "mc" },
			elements: {
				title: {
					anchor: "bl",
					offsetX: 2,
					offsetY: -8,
					scale: 100,
					maxWidth: 44,
				},
				countdown: { anchor: "bl", offsetX: 2, offsetY: -2, scale: 110 },
				product: { anchor: "mr", offsetX: -1, offsetY: 0, scale: 100 },
				cta: { anchor: "br", offsetX: -2, offsetY: 0, scale: 100 },
			},
		},
		mobile: { elements: {} },
	}),
	t("imagem-pura", "Imagem pura", "só a arte + CTA", {
		version: 1,
		desktop: {
			background: { zoom: 100, focal: "mc" },
			elements: { cta: { anchor: "bc", offsetX: 0, offsetY: 0, scale: 100 } },
		},
		mobile: { elements: {} },
	}),
] as const;
