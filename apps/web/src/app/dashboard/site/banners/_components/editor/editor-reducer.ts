import type { Banner } from "@emach/db/schema/banner";
import type { BannerFormValues } from "../banner-schema";
import {
	type BackgroundConfig,
	type BannerComposition,
	clampOffsets,
	compositionSchema,
	DEFAULT_COMPOSITION,
	ELEMENT_KEYS,
	type ElementKey,
	type ElementPlacement,
	type MobileOverride,
	type Viewport,
} from "../composition/composition-schema";
import {
	deriveHasFlagsFromBanner,
	legacyToComposition,
} from "../composition/derive-legacy";
import { BANNER_TEMPLATES } from "../composition/templates";

export type EditorSelection = ElementKey | "background" | null;

// Mapeia campo do form → seleção do editor onde o campo aparece. Usado no
// submit: um erro de campo dentro de um painel não selecionado fica invisível
// no DOM (o Inspector só monta o painel selecionado), então o banner-editor
// despacha `select` pra essa seleção antes de reportar o erro. Exportado —
// T13 (mobile) reaproveita o mesmo mapa pros overrides.
export const FIELD_TO_SELECTION: Partial<
	Record<keyof BannerFormValues, EditorSelection>
> = {
	title: "title",
	subtitle: "subtitle",
	badgeText: "badge",
	specs: "specs",
	countdownTarget: "countdown",
	productImageUrl: "product",
	productImageMobileUrl: "product",
	ctaLabel: "cta",
	ctaHref: "cta",
	ctaVariant: "cta",
	backgroundImageUrl: "background",
	backgroundImageMobileUrl: "background",
	backgroundMobileMode: "background",
	altText: "background",
};

export interface EditorState {
	composition: BannerComposition;
	content: BannerFormValues;
	dirty: boolean;
	selected: EditorSelection;
	viewport: Viewport;
}

export type EditorAction =
	| { type: "select"; target: EditorSelection }
	| { type: "setViewport"; viewport: Viewport }
	| { type: "applyTemplate"; templateKey: string }
	| { type: "toggleElement"; key: ElementKey; enabled: boolean }
	| { type: "setPlacement"; key: ElementKey; placement: ElementPlacement }
	| { type: "drag"; key: ElementKey; deltaX: number; deltaY: number }
	| { type: "setBackground"; config: BackgroundConfig }
	| { type: "setContent"; patch: Partial<BannerFormValues> }
	| {
			type: "setMobileOverride";
			key: ElementKey;
			override: MobileOverride | null;
	  };

// Fallback quando o elemento não tem placement default no DEFAULT_COMPOSITION.
// Exportado: o inspector reaproveita como placement inicial do "Personalizar".
export const FALLBACK_PLACEMENT: ElementPlacement = {
	anchor: "mc",
	offsetX: 0,
	offsetY: 0,
	scale: 100,
};

// Mesmo mapa slot→campos do form legado (banner-form.tsx / banner-presets.ts),
// mas por elemento (título e subtítulo são elementos separados no editor novo).
const ELEMENT_CONTENT_FIELDS: Record<ElementKey, (keyof BannerFormValues)[]> = {
	badge: ["badgeText"],
	title: ["title"],
	subtitle: ["subtitle"],
	specs: ["specs"],
	countdown: ["countdownTarget"],
	product: ["productImageUrl", "productImageMobileUrl"],
	cta: ["ctaLabel", "ctaHref"],
};

// Mesmos defaults de EMPTY em banner-form.tsx — o form legado é a fonte da verdade.
const EMPTY_CONTENT: BannerFormValues = {
	backgroundImageUrl: null,
	backgroundImageMobileUrl: null,
	backgroundMobileMode: "none",
	productImageUrl: null,
	productImageMobileUrl: null,
	title: null,
	subtitle: null,
	specs: null,
	altText: null,
	badgeText: null,
	ctaLabel: null,
	ctaHref: null,
	ctaVariant: "red",
	layout: "split",
	productScale: 100,
	ctaScale: 100,
	countdownTarget: null,
	isActive: false,
};

function getDesktopElement(
	elements: BannerComposition["desktop"]["elements"],
	key: ElementKey
): ElementPlacement | undefined {
	return Reflect.get(elements, key) as ElementPlacement | undefined;
}

function setDesktopElement(
	elements: BannerComposition["desktop"]["elements"],
	key: ElementKey,
	placement: ElementPlacement | undefined
) {
	if (placement === undefined) {
		Reflect.deleteProperty(elements, key);
		return;
	}
	Reflect.set(elements, key, placement);
}

function getMobileElement(
	elements: BannerComposition["mobile"]["elements"],
	key: ElementKey
): MobileOverride | undefined {
	return Reflect.get(elements, key) as MobileOverride | undefined;
}

function setMobileElement(
	elements: BannerComposition["mobile"]["elements"],
	key: ElementKey,
	override: MobileOverride | undefined
) {
	if (override === undefined) {
		Reflect.deleteProperty(elements, key);
		return;
	}
	Reflect.set(elements, key, override);
}

function clearElementContent(content: BannerFormValues, key: ElementKey) {
	const fields = Reflect.get(
		ELEMENT_CONTENT_FIELDS,
		key
	) as (keyof BannerFormValues)[];
	for (const field of fields) {
		Reflect.set(content, field, null);
	}
}

function clampPlacement(
	placement: ElementPlacement,
	viewport: Viewport
): ElementPlacement {
	const { offsetX, offsetY } = clampOffsets(
		placement.anchor,
		viewport,
		placement.offsetX,
		placement.offsetY
	);
	return { ...placement, offsetX, offsetY };
}

// Retorna false quando o drag é no-op (nada pra mover) — o dispatcher usa
// isso pra não marcar dirty num estado que não mudou de fato.
function dragDesktop(
	elements: BannerComposition["desktop"]["elements"],
	key: ElementKey,
	deltaX: number,
	deltaY: number
): boolean {
	const current = getDesktopElement(elements, key);
	if (!current) {
		return false;
	}
	const moved: ElementPlacement = {
		...current,
		offsetX: current.offsetX + deltaX,
		offsetY: current.offsetY + deltaY,
	};
	setDesktopElement(elements, key, clampPlacement(moved, "desktop"));
	return true;
}

function dragMobile(
	elements: BannerComposition["mobile"]["elements"],
	key: ElementKey,
	deltaX: number,
	deltaY: number
): boolean {
	const current = getMobileElement(elements, key);
	if (current && "hidden" in current) {
		// Elemento oculto no mobile: arrastar não faz sentido, no-op.
		return false;
	}
	const base: ElementPlacement = current ?? {
		anchor: "mc",
		offsetX: 0,
		offsetY: 0,
		scale: 100,
	};
	const moved: ElementPlacement = {
		...base,
		offsetX: base.offsetX + deltaX,
		offsetY: base.offsetY + deltaY,
	};
	setMobileElement(elements, key, clampPlacement(moved, "mobile"));
	return true;
}

function dragAction(
	state: EditorState,
	action: Extract<EditorAction, { type: "drag" }>
): EditorState {
	const composition = structuredClone(state.composition);
	const changed =
		state.viewport === "desktop"
			? dragDesktop(
					composition.desktop.elements,
					action.key,
					action.deltaX,
					action.deltaY
				)
			: dragMobile(
					composition.mobile.elements,
					action.key,
					action.deltaX,
					action.deltaY
				);
	if (!changed) {
		return state;
	}
	return { ...state, composition, dirty: true };
}

function toggleElementAction(
	state: EditorState,
	action: Extract<EditorAction, { type: "toggleElement" }>
): EditorState {
	const composition = structuredClone(state.composition);
	if (action.enabled) {
		const defaultPlacement = getDesktopElement(
			DEFAULT_COMPOSITION.desktop.elements,
			action.key
		);
		const placement = defaultPlacement
			? structuredClone(defaultPlacement)
			: { ...FALLBACK_PLACEMENT };
		setDesktopElement(composition.desktop.elements, action.key, placement);
		return { ...state, composition, dirty: true };
	}
	setDesktopElement(composition.desktop.elements, action.key, undefined);
	setMobileElement(composition.mobile.elements, action.key, undefined);
	const content = structuredClone(state.content);
	clearElementContent(content, action.key);
	return { ...state, composition, content, dirty: true };
}

function applyTemplateAction(
	state: EditorState,
	action: Extract<EditorAction, { type: "applyTemplate" }>
): EditorState {
	const template = BANNER_TEMPLATES.find((t) => t.key === action.templateKey);
	if (!template) {
		return state;
	}
	const templateSlots = new Set<ElementKey>(template.slots);
	const content = structuredClone(state.content);
	for (const key of ELEMENT_KEYS) {
		if (!templateSlots.has(key)) {
			clearElementContent(content, key);
		}
	}
	return {
		...state,
		composition: structuredClone(template.composition),
		content,
		dirty: true,
	};
}

function setPlacementAction(
	state: EditorState,
	action: Extract<EditorAction, { type: "setPlacement" }>
): EditorState {
	const composition = structuredClone(state.composition);
	const placement = clampPlacement(action.placement, state.viewport);
	if (state.viewport === "desktop") {
		setDesktopElement(composition.desktop.elements, action.key, placement);
	} else {
		setMobileElement(composition.mobile.elements, action.key, placement);
	}
	return { ...state, composition, dirty: true };
}

function setBackgroundAction(
	state: EditorState,
	action: Extract<EditorAction, { type: "setBackground" }>
): EditorState {
	const composition = structuredClone(state.composition);
	if (state.viewport === "desktop") {
		composition.desktop.background = action.config;
	} else {
		composition.mobile.background = action.config;
	}
	return { ...state, composition, dirty: true };
}

function setContentAction(
	state: EditorState,
	action: Extract<EditorAction, { type: "setContent" }>
): EditorState {
	return {
		...state,
		content: { ...state.content, ...action.patch },
		dirty: true,
	};
}

function setMobileOverrideAction(
	state: EditorState,
	action: Extract<EditorAction, { type: "setMobileOverride" }>
): EditorState {
	const composition = structuredClone(state.composition);
	const override =
		action.override === null ? undefined : structuredClone(action.override);
	setMobileElement(composition.mobile.elements, action.key, override);
	return { ...state, composition, dirty: true };
}

function selectAction(
	state: EditorState,
	action: Extract<EditorAction, { type: "select" }>
): EditorState {
	return { ...state, selected: action.target };
}

function setViewportAction(
	state: EditorState,
	action: Extract<EditorAction, { type: "setViewport" }>
): EditorState {
	return { ...state, viewport: action.viewport };
}

export function editorReducer(
	state: EditorState,
	action: EditorAction
): EditorState {
	switch (action.type) {
		case "select":
			return selectAction(state, action);
		case "setViewport":
			return setViewportAction(state, action);
		case "applyTemplate":
			return applyTemplateAction(state, action);
		case "toggleElement":
			return toggleElementAction(state, action);
		case "setPlacement":
			return setPlacementAction(state, action);
		case "drag":
			return dragAction(state, action);
		case "setBackground":
			return setBackgroundAction(state, action);
		case "setContent":
			return setContentAction(state, action);
		case "setMobileOverride":
			return setMobileOverrideAction(state, action);
		default:
			return state;
	}
}

function contentFromBanner(banner: Banner): BannerFormValues {
	return {
		backgroundImageUrl: banner.backgroundImageUrl,
		backgroundImageMobileUrl: banner.backgroundImageMobileUrl,
		backgroundMobileMode: banner.backgroundMobileMode,
		productImageUrl: banner.productImageUrl,
		productImageMobileUrl: banner.productImageMobileUrl,
		title: banner.title,
		subtitle: banner.subtitle,
		specs: banner.specs,
		altText: banner.altText,
		badgeText: banner.badgeText,
		ctaLabel: banner.ctaLabel,
		ctaHref: banner.ctaHref,
		ctaVariant: banner.ctaVariant,
		layout: banner.layout,
		productScale: banner.productScale,
		ctaScale: banner.ctaScale,
		countdownTarget: banner.countdownTarget,
		isActive: banner.isActive,
	};
}

function compositionFromBanner(banner: Banner): BannerComposition {
	if (banner.composition !== null) {
		return compositionSchema.parse(banner.composition);
	}
	return legacyToComposition({
		layout: banner.layout,
		productScale: banner.productScale,
		ctaScale: banner.ctaScale,
		...deriveHasFlagsFromBanner(banner),
	});
}

export function initialEditorState(banner: Banner | null): EditorState {
	if (banner === null) {
		return {
			content: structuredClone(EMPTY_CONTENT),
			composition: structuredClone(DEFAULT_COMPOSITION),
			viewport: "desktop",
			selected: null,
			dirty: false,
		};
	}
	return {
		content: contentFromBanner(banner),
		composition: compositionFromBanner(banner),
		viewport: "desktop",
		selected: null,
		dirty: false,
	};
}
