import { describe, expect, it } from "vitest";
import { resolvePickingListParams } from "../resolve-params";

const UUID_A = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const UUID_B = "550e8400-e29b-41d4-a716-446655440000";

function sp(query: string): URLSearchParams {
	return new URL(`http://x/y?${query}`).searchParams;
}

describe("resolvePickingListParams", () => {
	it("csv vira array deduplicado", () => {
		const r = resolvePickingListParams(sp(`ids=${UUID_A},${UUID_B},${UUID_A}`));
		expect(r).toEqual({
			ok: true,
			params: { ids: [UUID_A, UUID_B] },
		});
	});

	it("rejeita: sem ids, id não-uuid", () => {
		expect(resolvePickingListParams(sp("")).ok).toBe(false);
		expect(resolvePickingListParams(sp("ids=abc")).ok).toBe(false);
	});

	it("rejeita mais de 100 ids", () => {
		const many = Array.from(
			{ length: 101 },
			(_, i) => `${i.toString(16).padStart(8, "0")}-58cc-4372-a567-0e02b2c3d479`
		).join(",");
		expect(resolvePickingListParams(sp(`ids=${many}`)).ok).toBe(false);
	});
});
