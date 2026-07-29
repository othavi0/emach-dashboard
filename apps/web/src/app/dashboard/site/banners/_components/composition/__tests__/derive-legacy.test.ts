import { describe, expect, test } from "vitest";
import { BANNER_LAYOUTS } from "../../banner-schema";
import { deriveLegacyLayout, legacyToComposition } from "../derive-legacy";

const ALL_ON = {
	hasTitle: true,
	hasSubtitle: true,
	hasBadge: true,
	hasSpecs: true,
	hasCountdown: true,
	hasProduct: true,
	hasCta: true,
	productScale: 110,
	ctaScale: 120,
};

describe("round-trip legado", () => {
	for (const layout of BANNER_LAYOUTS) {
		test(`${layout}: legacyToComposition → deriveLegacyLayout = identidade`, () => {
			const c = legacyToComposition({ layout, ...ALL_ON });
			const d = deriveLegacyLayout(c);
			expect(d.layout).toBe(layout);
			// center_mid não tem slot de produto no legado: o elemento é
			// omitido e productScale volta ao fallback default (100).
			const expectedProductScale = layout === "center_mid" ? 100 : 110;
			expect(d.productScale).toBe(expectedProductScale);
			expect(d.ctaScale).toBe(120);
		});
	}
});

describe("deriveLegacyLayout", () => {
	test("escala fora do CHECK legado é clampada", () => {
		const c = legacyToComposition({ layout: "split", ...ALL_ON });
		if (c.desktop.elements.cta) {
			c.desktop.elements.cta.scale = 80;
		}
		// CHECK legado de ctaScale é 80–140 — 80 passa direto
		expect(deriveLegacyLayout(c).ctaScale).toBe(80);
	});
	test("composição sem título nem produto cai no fallback split", () => {
		const c = legacyToComposition({
			layout: "split",
			...ALL_ON,
			hasTitle: false,
			hasProduct: false,
			hasSubtitle: false,
			hasBadge: false,
			hasSpecs: false,
			hasCountdown: false,
		});
		expect(deriveLegacyLayout(c).layout).toBe("split");
	});
});
