import { describe, expect, test } from "vitest";
import {
	DEFAULT_COMPOSITION,
	partitionMobileElements,
} from "../composition-schema";

describe("partitionMobileElements", () => {
	test("sem overrides: tudo que existe no desktop vai pra pilha, na ordem fixa", () => {
		const r = partitionMobileElements(DEFAULT_COMPOSITION);
		expect(r.stacked).toEqual(["title", "subtitle", "product", "cta"]);
		expect(r.positioned).toEqual([]);
		expect(r.hidden).toEqual([]);
	});
	test("override posiciona; hidden esconde; resto continua na pilha", () => {
		const c = structuredClone(DEFAULT_COMPOSITION);
		c.mobile.elements.title = {
			anchor: "tc",
			offsetX: 0,
			offsetY: 2,
			scale: 90,
		};
		c.mobile.elements.subtitle = { hidden: true };
		const r = partitionMobileElements(c);
		expect(r.stacked).toEqual(["product", "cta"]);
		expect(r.positioned.map(([k]) => k)).toEqual(["title"]);
		expect(r.hidden).toEqual(["subtitle"]);
	});
});
