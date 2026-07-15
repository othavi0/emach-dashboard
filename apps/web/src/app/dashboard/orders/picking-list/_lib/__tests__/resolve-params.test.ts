import { describe, expect, it } from "vitest";
import { resolvePickingListParams } from "../resolve-params";

const UUID_A = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const UUID_B = "550e8400-e29b-41d4-a716-446655440000";

function sp(query: string): URLSearchParams {
	return new URL(`http://x/y?${query}`).searchParams;
}

describe("resolvePickingListParams", () => {
	it("modo ids: csv vira array deduplicado", () => {
		const r = resolvePickingListParams(sp(`ids=${UUID_A},${UUID_B},${UUID_A}`));
		expect(r).toEqual({
			ok: true,
			params: { ids: [UUID_A, UUID_B], mode: "ids" },
		});
	});

	it("modo tab: aceita a_separar e em_separacao", () => {
		expect(resolvePickingListParams(sp("tab=a_separar"))).toEqual({
			ok: true,
			params: { mode: "tab", tab: "a_separar" },
		});
		expect(resolvePickingListParams(sp("tab=em_separacao"))).toEqual({
			ok: true,
			params: { mode: "tab", tab: "em_separacao" },
		});
	});

	it("rejeita: sem params, ids+tab juntos, tab inválida, id não-uuid", () => {
		expect(resolvePickingListParams(sp("")).ok).toBe(false);
		expect(resolvePickingListParams(sp(`ids=${UUID_A}&tab=a_separar`)).ok).toBe(
			false
		);
		expect(resolvePickingListParams(sp("tab=excecoes")).ok).toBe(false);
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
