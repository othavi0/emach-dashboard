import { describe, expect, it } from "vitest";
import { customersListFiltersSchema } from "../../schema";
import { parseSearchParams } from "../parse-search-params";

function parse(query: string) {
	return parseSearchParams(new URLSearchParams(query));
}

describe("parseSearchParams", () => {
	it("keeps a single key as a string", () => {
		expect(parse("q=ana&sort=nameAsc")).toEqual({ q: "ana", sort: "nameAsc" });
	});

	it("groups a repeated key into an array in query order", () => {
		expect(parse("clientType=pf&clientType=pj&clientType=pf")).toEqual({
			clientType: ["pf", "pj", "pf"],
		});
	});

	it("keeps prototype-named keys as own string values", () => {
		const result = parse("toString=a&constructor=b");

		expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
		expect(Object.entries(result)).toEqual([
			["toString", "a"],
			["constructor", "b"],
		]);
	});

	it("does not swap the prototype on ?__proto__=x and the filters keep the default sort", () => {
		const result = parse("__proto__=x");

		expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
		expect(Object.entries(result)).toEqual([["__proto__", "x"]]);

		const filters = customersListFiltersSchema.safeParse(result);

		expect(filters.success).toBe(true);
		expect(filters.data).toEqual({ sort: "createdDesc" });
	});
});
