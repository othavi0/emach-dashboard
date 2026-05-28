import { describe, expect, it } from "vitest";
import { buildSearchPattern, isSearchable } from "../global-search";

describe("global-search", () => {
	it("isSearchable exige >= 2 chars não-espaço", () => {
		expect(isSearchable("a")).toBe(false);
		expect(isSearchable("  ")).toBe(false);
		expect(isSearchable("ab")).toBe(true);
	});
	it("buildSearchPattern faz lower + wrap ILIKE", () => {
		expect(buildSearchPattern(" Furadeira ")).toBe("%furadeira%");
	});
	it("buildSearchPattern escapa metacaracteres LIKE", () => {
		expect(buildSearchPattern("50%")).toBe("%50\\%%");
		expect(buildSearchPattern("a_b")).toBe("%a\\_b%");
		expect(buildSearchPattern("c\\d")).toBe("%c\\\\d%");
	});
});
