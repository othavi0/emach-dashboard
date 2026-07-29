import { z } from "zod";

export const ANCHORS = [
	"tl",
	"tc",
	"tr",
	"ml",
	"mc",
	"mr",
	"bl",
	"bc",
	"br",
] as const;
export type Anchor9 = (typeof ANCHORS)[number];

export const ELEMENT_KEYS = [
	"badge",
	"title",
	"subtitle",
	"specs",
	"countdown",
	"product",
	"cta",
] as const;
export type ElementKey = (typeof ELEMENT_KEYS)[number];
export const TEXT_KEYS = [
	"badge",
	"title",
	"subtitle",
	"specs",
	"countdown",
] as const;

export const SCALE_BOUNDS: Record<ElementKey, [number, number]> = {
	badge: [60, 160],
	title: [60, 160],
	subtitle: [60, 160],
	specs: [60, 160],
	countdown: [60, 160],
	product: [50, 160],
	cta: [80, 140],
};

const OFFSET = z.number().min(-20).max(20);

function basePlacementShape(scale: [number, number]) {
	return {
		anchor: z.enum(ANCHORS),
		offsetX: OFFSET,
		offsetY: OFFSET,
		scale: z.number().int().min(scale[0]).max(scale[1]),
	};
}

function placementSchema(scale: [number, number]) {
	return z.object(basePlacementShape(scale));
}

function textPlacementSchema(scale: [number, number]) {
	return z.object({
		...basePlacementShape(scale),
		maxWidth: z.number().int().min(12).max(80).optional(),
	});
}

const textPlacement = textPlacementSchema(SCALE_BOUNDS.title);
const productPlacement = placementSchema(SCALE_BOUNDS.product);
const ctaPlacement = placementSchema(SCALE_BOUNDS.cta);

const backgroundSchema = z.object({
	zoom: z.number().int().min(100).max(200),
	focal: z.enum(ANCHORS),
});

const hidden = z.object({ hidden: z.literal(true) });

const desktopElements = z.object({
	badge: textPlacement.optional(),
	title: textPlacement.optional(),
	subtitle: textPlacement.optional(),
	specs: textPlacement.optional(),
	countdown: textPlacement.optional(),
	product: productPlacement.optional(),
	cta: ctaPlacement.optional(),
});

const mobileElements = z.object({
	badge: z.union([hidden, textPlacement]).optional(),
	title: z.union([hidden, textPlacement]).optional(),
	subtitle: z.union([hidden, textPlacement]).optional(),
	specs: z.union([hidden, textPlacement]).optional(),
	countdown: z.union([hidden, textPlacement]).optional(),
	product: z.union([hidden, productPlacement]).optional(),
	cta: z.union([hidden, ctaPlacement]).optional(),
});

export const compositionSchema = z.object({
	version: z.literal(1),
	desktop: z.object({
		background: backgroundSchema,
		elements: desktopElements,
	}),
	mobile: z.object({
		background: backgroundSchema.optional(),
		elements: mobileElements,
	}),
});

export type BannerComposition = z.infer<typeof compositionSchema>;
export type ElementPlacement = z.infer<typeof textPlacement>;
export type BackgroundConfig = z.infer<typeof backgroundSchema>;
export type MobileOverride = NonNullable<
	z.infer<typeof mobileElements>[ElementKey]
>;
export type Viewport = "desktop" | "mobile";

// Pilha segura mobile — ordem fixa (spec §Pilha segura).
export const SAFE_STACK_ORDER: ElementKey[] = [
	"badge",
	"title",
	"specs",
	"subtitle",
	"countdown",
	"product",
	"cta",
];

// Divide os elementos do desktop em 3 grupos pro renderer mobile: sem
// override mobile → empilha (safe stack); override com placement → posiciona
// absoluto; override com hidden → não renderiza. Só considera keys presentes
// em desktop.elements (não existe no desktop = não existe no mobile).
export function partitionMobileElements(c: BannerComposition): {
	stacked: ElementKey[];
	positioned: [ElementKey, ElementPlacement][];
	hidden: ElementKey[];
} {
	const stacked: ElementKey[] = [];
	const positioned: [ElementKey, ElementPlacement][] = [];
	const hiddenKeys: ElementKey[] = [];
	for (const key of SAFE_STACK_ORDER) {
		if (c.desktop.elements[key] === undefined) {
			continue;
		}
		const override = c.mobile.elements[key];
		if (override === undefined) {
			stacked.push(key);
		} else if ("hidden" in override) {
			hiddenKeys.push(key);
		} else {
			positioned.push([key, override]);
		}
	}
	return { stacked, positioned, hidden: hiddenKeys };
}

// Área segura em % do container; bottom reserva a faixa dos dots do carrossel.
export const SAFE_AREA = {
	x: 2,
	top: 2,
	bottom: { desktop: 10, mobile: 16 },
} as const;

const COL_BY_HALIGN: Record<string, number> = { l: 5, c: 50, r: 95 };

function rowByValign(valign: string, bottomRow: number) {
	if (valign === "t") {
		return 5;
	}
	if (valign === "m") {
		return 50;
	}
	return bottomRow;
}

// Posição-base do ponto de referência de cada âncora (% do container).
export function anchorBasePosition(anchor: Anchor9, viewport: Viewport) {
	const col = COL_BY_HALIGN[anchor.charAt(1)] ?? 50;
	const bottomRow = viewport === "desktop" ? 88 : 84;
	const row = rowByValign(anchor.charAt(0), bottomRow);
	return { x: col, y: row };
}

export function clampOffsets(
	anchor: Anchor9,
	viewport: Viewport,
	offsetX: number,
	offsetY: number
) {
	const { x, y } = anchorBasePosition(anchor, viewport);
	const maxY = 100 - SAFE_AREA.bottom[viewport];
	const cx = Math.min(Math.max(offsetX, SAFE_AREA.x - x), 98 - x);
	const cy = Math.min(Math.max(offsetY, SAFE_AREA.top - y), maxY - y);
	return {
		offsetX: Math.min(Math.max(cx, -20), 20),
		offsetY: Math.min(Math.max(cy, -20), 20),
	};
}

// Default = equivalente ao layout "split" atual.
export const DEFAULT_COMPOSITION: BannerComposition = {
	version: 1,
	desktop: {
		background: { zoom: 100, focal: "mc" },
		elements: {
			title: {
				anchor: "bl",
				offsetX: 2,
				offsetY: -2,
				scale: 100,
				maxWidth: 44,
			},
			subtitle: {
				anchor: "bl",
				offsetX: 2,
				offsetY: 4,
				scale: 100,
				maxWidth: 44,
			},
			product: { anchor: "mr", offsetX: -1, offsetY: 0, scale: 100 },
			cta: { anchor: "br", offsetX: -2, offsetY: 0, scale: 100 },
		},
	},
	mobile: { elements: {} },
};
