import type { Banner } from "@emach/db/schema/banner";
import { describe, expect, test } from "vitest";
import { DEFAULT_COMPOSITION } from "../../composition/composition-schema";
import { editorReducer, initialEditorState } from "../editor-reducer";

const s0 = initialEditorState(null);

function makeBanner(overrides: Partial<Banner> = {}): Banner {
	return {
		id: "banner-1",
		backgroundImageUrl: null,
		backgroundImageMobileUrl: null,
		backgroundMobileMode: "none",
		productImageUrl: null,
		productImageMobileUrl: null,
		title: "Título",
		subtitle: null,
		specs: null,
		composition: null,
		altText: null,
		badgeText: null,
		ctaLabel: null,
		ctaHref: null,
		ctaVariant: "red",
		layout: "split",
		productScale: 100,
		ctaScale: 100,
		countdownTarget: null,
		sortOrder: 0,
		isActive: false,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		updatedAt: new Date("2026-01-01T00:00:00Z"),
		...overrides,
	};
}

describe("drag", () => {
	test("desktop: clampa offset na área segura", () => {
		const s1 = editorReducer(
			{ ...s0, selected: "title" },
			{ type: "drag", key: "title", deltaX: -50, deltaY: 0 }
		);
		// título default: anchor bl (base x=5, offsetX 2) → mínimo -3
		expect(s1.composition.desktop.elements.title?.offsetX).toBe(-3);
		expect(s1.dirty).toBe(true);
	});

	test("desktop: arredonda offset pra inteiro antes do clamp (evita float no jsonb)", () => {
		const s1 = editorReducer(
			{ ...s0, selected: "title" },
			{ type: "drag", key: "title", deltaX: -2.4103, deltaY: 0.6 }
		);
		const offsetX = s1.composition.desktop.elements.title?.offsetX;
		const offsetY = s1.composition.desktop.elements.title?.offsetY;
		expect(Number.isInteger(offsetX)).toBe(true);
		expect(Number.isInteger(offsetY)).toBe(true);
	});

	test("mobile: drag em elemento herdado cria override", () => {
		const s1 = editorReducer(
			{ ...s0, viewport: "mobile" },
			{ type: "drag", key: "title", deltaX: 0, deltaY: 5 }
		);
		const o = s1.composition.mobile.elements.title;
		expect(o !== undefined && !("hidden" in o)).toBe(true);
	});

	test("mobile: drag em override oculto é no-op e não marca dirty", () => {
		const withHidden = editorReducer(s0, {
			type: "setMobileOverride",
			key: "title",
			override: { hidden: true },
		});
		// dirty resetado pra isolar o efeito do próprio drag no-op (o
		// setMobileOverride anterior já marca dirty por conta própria).
		const s1 = editorReducer(
			{ ...withHidden, viewport: "mobile", dirty: false },
			{ type: "drag", key: "title", deltaX: 5, deltaY: 5 }
		);
		expect(s1.composition.mobile.elements.title).toEqual({ hidden: true });
		expect(s1.dirty).toBe(false);
	});

	test("desktop: drag em elemento sem placement é no-op e não marca dirty", () => {
		// badge não tem placement no DEFAULT_COMPOSITION.desktop.elements
		const s1 = editorReducer(s0, {
			type: "drag",
			key: "badge",
			deltaX: 5,
			deltaY: 5,
		});
		expect(s1.composition.desktop.elements.badge).toBeUndefined();
		expect(s1.dirty).toBe(false);
	});
});

describe("toggleElement", () => {
	test("off: remove placement desktop, override mobile e limpa conteúdo", () => {
		const withContent = editorReducer(s0, {
			type: "setContent",
			patch: { title: "Potência redefinida" },
		});
		const withOverride = editorReducer(withContent, {
			type: "setMobileOverride",
			key: "title",
			override: { anchor: "mc", offsetX: 0, offsetY: 0, scale: 100 },
		});
		const s1 = editorReducer(withOverride, {
			type: "toggleElement",
			key: "title",
			enabled: false,
		});
		expect(s1.composition.desktop.elements.title).toBeUndefined();
		expect(s1.composition.mobile.elements.title).toBeUndefined();
		expect(s1.content.title).toBeNull();
		expect(s1.dirty).toBe(true);
	});

	test("on: restaura placement default do DEFAULT_COMPOSITION", () => {
		const off = editorReducer(s0, {
			type: "toggleElement",
			key: "subtitle",
			enabled: false,
		});
		const s1 = editorReducer(off, {
			type: "toggleElement",
			key: "subtitle",
			enabled: true,
		});
		expect(s1.composition.desktop.elements.subtitle).toEqual(
			DEFAULT_COMPOSITION.desktop.elements.subtitle
		);
	});

	test("on: elemento sem default cai no fallback mc/0/0/100", () => {
		const s1 = editorReducer(s0, {
			type: "toggleElement",
			key: "badge",
			enabled: true,
		});
		expect(s1.composition.desktop.elements.badge).toEqual({
			anchor: "mc",
			offsetX: 0,
			offsetY: 0,
			scale: 100,
		});
	});
});

describe("applyTemplate", () => {
	test("troca composition e limpa conteúdo dos slots ausentes", () => {
		const withContent = editorReducer(s0, {
			type: "setContent",
			patch: { badgeText: "LANÇAMENTO" },
		});
		const withBadge = editorReducer(withContent, {
			type: "toggleElement",
			key: "badge",
			enabled: true,
		});
		const s1 = editorReducer(withBadge, {
			type: "applyTemplate",
			templateKey: "imagem-pura",
		});
		expect(Object.keys(s1.composition.desktop.elements)).toEqual(["cta"]);
		expect(s1.content.badgeText).toBeNull();
		expect(s1.dirty).toBe(true);
	});

	test("templateKey inexistente é no-op", () => {
		const s1 = editorReducer(s0, {
			type: "applyTemplate",
			templateKey: "nao-existe",
		});
		expect(s1).toEqual(s0);
	});
});

describe("setPlacement", () => {
	test("clampa o placement recebido (não confia no valor do inspector)", () => {
		const s1 = editorReducer(
			{ ...s0, viewport: "mobile" },
			{
				type: "setPlacement",
				key: "cta",
				placement: { anchor: "br", offsetX: 0, offsetY: 20, scale: 100 },
			}
		);
		expect(s1.composition.mobile.elements.cta).toMatchObject({
			offsetY: 0,
		});
	});
});

describe("setMobileOverride", () => {
	test("null volta a herdar (remove override)", () => {
		const withOverride = editorReducer(s0, {
			type: "setMobileOverride",
			key: "cta",
			override: { anchor: "bc", offsetX: 0, offsetY: 0, scale: 100 },
		});
		expect(withOverride.composition.mobile.elements.cta).toBeDefined();
		const s1 = editorReducer(withOverride, {
			type: "setMobileOverride",
			key: "cta",
			override: null,
		});
		expect(s1.composition.mobile.elements.cta).toBeUndefined();
		expect(s1.dirty).toBe(true);
	});
});

describe("initialEditorState", () => {
	test("banner nulo usa os defaults do form legado + DEFAULT_COMPOSITION", () => {
		expect(s0.composition).toEqual(DEFAULT_COMPOSITION);
		expect(s0.content.layout).toBe("split");
		expect(s0.content.ctaVariant).toBe("red");
		expect(s0.dirty).toBe(false);
	});

	test("banner existente sem composition converte do legado", () => {
		const banner = makeBanner({ composition: null, layout: "center_mid" });
		const s1 = initialEditorState(banner);
		expect(s1.composition.desktop.elements.title?.anchor).toBe("mc");
		expect(s1.composition.desktop.elements.product).toBeUndefined();
	});

	test("banner legado com só ctaLabel (sem href) não vira elemento cta", () => {
		const banner = makeBanner({
			composition: null,
			ctaLabel: "Ver catálogo",
			ctaHref: null,
		});
		const s1 = initialEditorState(banner);
		expect(s1.composition.desktop.elements.cta).toBeUndefined();
	});

	test("banner existente com composition usa a composition salva", () => {
		const banner = makeBanner({
			composition: {
				version: 1,
				desktop: { background: { zoom: 120, focal: "tl" }, elements: {} },
				mobile: { elements: {} },
			},
		});
		const s1 = initialEditorState(banner);
		expect(s1.composition.desktop.background.zoom).toBe(120);
	});
});

describe("select / setViewport", () => {
	test("não marcam dirty", () => {
		const s1 = editorReducer(s0, { type: "select", target: "title" });
		expect(s1.dirty).toBe(false);
		expect(s1.selected).toBe("title");
		const s2 = editorReducer(s1, { type: "setViewport", viewport: "mobile" });
		expect(s2.dirty).toBe(false);
		expect(s2.viewport).toBe("mobile");
	});
});
