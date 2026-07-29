import { describe, expect, test } from "vitest";
import {
	clampOffsets,
	compositionSchema,
	DEFAULT_COMPOSITION,
	SAFE_STACK_ORDER,
} from "../composition-schema";

const base = () => structuredClone(DEFAULT_COMPOSITION);

describe("compositionSchema", () => {
	test("DEFAULT_COMPOSITION é válida", () => {
		expect(compositionSchema.safeParse(DEFAULT_COMPOSITION).success).toBe(true);
	});
	test("version desconhecida falha", () => {
		const c = { ...base(), version: 2 };
		expect(compositionSchema.safeParse(c).success).toBe(false);
	});
	test("âncora inválida falha", () => {
		const c = base();
		c.desktop.elements.title = {
			anchor: "xx" as never,
			offsetX: 0,
			offsetY: 0,
			scale: 100,
		};
		expect(compositionSchema.safeParse(c).success).toBe(false);
	});
	test("offset fora de ±20 falha", () => {
		const c = base();
		c.desktop.elements.title = {
			anchor: "bl",
			offsetX: 21,
			offsetY: 0,
			scale: 100,
		};
		expect(compositionSchema.safeParse(c).success).toBe(false);
	});
	test("escala de produto 50–160: 49 falha, 160 passa", () => {
		const c = base();
		c.desktop.elements.product = {
			anchor: "mr",
			offsetX: 0,
			offsetY: 0,
			scale: 49,
		};
		expect(compositionSchema.safeParse(c).success).toBe(false);
		c.desktop.elements.product.scale = 160;
		expect(compositionSchema.safeParse(c).success).toBe(true);
	});
	test("escala de CTA 80–140: 79 falha", () => {
		const c = base();
		c.desktop.elements.cta = {
			anchor: "br",
			offsetX: 0,
			offsetY: 0,
			scale: 79,
		};
		expect(compositionSchema.safeParse(c).success).toBe(false);
	});
	test("maxWidth só em texto: 12–80", () => {
		const c = base();
		c.desktop.elements.title = {
			anchor: "bl",
			offsetX: 0,
			offsetY: 0,
			scale: 100,
			maxWidth: 81,
		};
		expect(compositionSchema.safeParse(c).success).toBe(false);
	});
	test("zoom do fundo 100–200: 201 falha", () => {
		const c = base();
		c.desktop.background.zoom = 201;
		expect(compositionSchema.safeParse(c).success).toBe(false);
	});
	test("override mobile aceita hidden OU placement", () => {
		const c = base();
		c.mobile.elements.specs = { hidden: true };
		c.mobile.elements.title = {
			anchor: "tc",
			offsetX: 0,
			offsetY: 4,
			scale: 90,
		};
		expect(compositionSchema.safeParse(c).success).toBe(true);
	});
});

describe("SAFE_STACK_ORDER", () => {
	test("ordem fixa do spec", () => {
		expect(SAFE_STACK_ORDER).toEqual([
			"badge",
			"title",
			"specs",
			"subtitle",
			"countdown",
			"product",
			"cta",
		]);
	});
});

describe("clampOffsets", () => {
	test("âncora bl no desktop não deixa sair pela esquerda", () => {
		// base x=5; x+offset ≥ 2 → offsetX ≥ -3
		expect(clampOffsets("bl", "desktop", -20, 0).offsetX).toBe(-3);
	});
	test("âncora br no mobile não invade a faixa dos dots", () => {
		// base y=84 (mobile); y+offset ≤ 84 → offsetY ≤ 0
		expect(clampOffsets("br", "mobile", 0, 10).offsetY).toBe(0);
	});
	test("dentro dos limites passa intacto", () => {
		expect(clampOffsets("mc", "desktop", 10, -10)).toEqual({
			offsetX: 10,
			offsetY: -10,
		});
	});
});
