import { describe, expect, it } from "vitest";
import { resolveShippingDocParams } from "../resolve-params";

function sp(query: string): URLSearchParams {
	return new URLSearchParams(query);
}

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

describe("resolveShippingDocParams", () => {
	it("rejeita ids e tab juntos", () => {
		const r = resolveShippingDocParams(sp(`ids=${ID_A}&tab=picked`));
		expect(r.ok).toBe(false);
	});

	it("rejeita quando nenhum é informado", () => {
		expect(resolveShippingDocParams(sp("")).ok).toBe(false);
	});

	it("aceita ids válidos e deduplica", () => {
		const r = resolveShippingDocParams(sp(`ids=${ID_A},${ID_B},${ID_A}`));
		expect(r).toEqual({ ok: true, params: { ids: [ID_A, ID_B], mode: "ids" } });
	});

	it("rejeita id não-uuid", () => {
		expect(resolveShippingDocParams(sp("ids=not-a-uuid")).ok).toBe(false);
	});

	it("rejeita lista vazia de ids", () => {
		expect(resolveShippingDocParams(sp("ids=,,")).ok).toBe(false);
	});

	it("aceita tab=picked", () => {
		expect(resolveShippingDocParams(sp("tab=picked"))).toEqual({
			ok: true,
			params: { mode: "tab", tab: "picked" },
		});
	});

	it("rejeita outras tabs (só picked gera documento de envio)", () => {
		expect(resolveShippingDocParams(sp("tab=a_separar")).ok).toBe(false);
		expect(resolveShippingDocParams(sp("tab=preparing")).ok).toBe(false);
	});
});
