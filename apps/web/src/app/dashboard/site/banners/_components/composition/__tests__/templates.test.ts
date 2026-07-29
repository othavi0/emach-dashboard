import { describe, expect, test } from "vitest";
import { compositionSchema } from "../composition-schema";
import { BANNER_TEMPLATES } from "../templates";

describe("BANNER_TEMPLATES", () => {
	test("são 4 e todas as compositions validam", () => {
		expect(BANNER_TEMPLATES.length).toBe(4);
		for (const t of BANNER_TEMPLATES) {
			expect(compositionSchema.safeParse(t.composition).success).toBe(true);
		}
	});
	test("slots batem com os elementos presentes", () => {
		for (const t of BANNER_TEMPLATES) {
			expect(Object.keys(t.composition.desktop.elements).toSorted()).toEqual(
				t.slots.toSorted()
			);
		}
	});
});
