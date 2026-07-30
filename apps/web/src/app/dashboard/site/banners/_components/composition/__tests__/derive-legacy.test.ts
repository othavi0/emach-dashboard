import { describe, expect, test } from "vitest";
import type { BannerLayout } from "../../banner-schema";
import { legacyToComposition } from "../derive-legacy";

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

// deriveLegacyLayout (dual-write) foi removida (ecommerce#210, 2026-07-30).
// O guard do mapa legado agora é direto: cada layout produz o trio de âncoras
// esperado — mesma tabela usada pelo backfill e pelo fallback do card.
describe("legacyToComposition — trios por layout", () => {
	const trio = (layout: BannerLayout) => {
		const c = legacyToComposition({ layout, ...ALL_ON });
		return [
			c.desktop.elements.title?.anchor,
			c.desktop.elements.product?.anchor,
			c.desktop.elements.cta?.anchor,
		];
	};

	test("mapa completo dos 8 layouts", () => {
		expect(trio("split")).toEqual(["bl", "mr", "br"]);
		expect(trio("stack_left")).toEqual(["bl", "mr", "bc"]);
		expect(trio("center_bottom")).toEqual(["bc", "tc", "bc"]);
		expect(trio("center_mid")).toEqual(["mc", undefined, "bc"]);
		expect(trio("center_cta_right")).toEqual(["ml", "tc", "br"]);
		expect(trio("mirror_split")).toEqual(["mr", "ml", "br"]);
		expect(trio("hero_center")).toEqual(["tc", "mc", "bc"]);
		expect(trio("text_right")).toEqual(["tc", "mc", "br"]);
	});

	test("escalas do banner legado preservadas no placement", () => {
		const c = legacyToComposition({ layout: "split", ...ALL_ON });
		expect(c.desktop.elements.product?.scale).toBe(110);
		expect(c.desktop.elements.cta?.scale).toBe(120);
	});

	test("center_mid omite product mesmo com hasProduct (sem slot no legado)", () => {
		const c = legacyToComposition({ layout: "center_mid", ...ALL_ON });
		expect(c.desktop.elements.product).toBeUndefined();
	});

	test("flags desligadas omitem os elementos", () => {
		const c = legacyToComposition({
			layout: "split",
			...ALL_ON,
			hasTitle: false,
			hasBadge: false,
			hasSpecs: false,
		});
		expect(c.desktop.elements.title).toBeUndefined();
		expect(c.desktop.elements.badge).toBeUndefined();
		expect(c.desktop.elements.specs).toBeUndefined();
		expect(c.desktop.elements.subtitle).toBeDefined();
	});
});
