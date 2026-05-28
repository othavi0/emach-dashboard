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
});
