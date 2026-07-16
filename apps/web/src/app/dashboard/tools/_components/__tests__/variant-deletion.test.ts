import { describe, expect, it } from "vitest";
import { resolveVariantDeletion } from "../variant-deletion";

const sib = (id: string, sortOrder: number) => ({ id, sortOrder });

describe("resolveVariantDeletion", () => {
	it("bloqueia quando a variante tem pedidos", () => {
		const r = resolveVariantDeletion({
			variantId: "a",
			isDefault: false,
			hasOrders: true,
			siblings: [sib("a", 0), sib("b", 1)],
			stockQty: 0,
		});
		expect(r.allowed).toBe(false);
	});

	it("bloqueia quando a variante tem estoque", () => {
		const r = resolveVariantDeletion({
			variantId: "a",
			isDefault: false,
			hasOrders: false,
			siblings: [sib("a", 0), sib("b", 1)],
			stockQty: 12,
		});
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.error).toContain("12 un em estoque");
		}
	});

	it("pedidos têm precedência sobre estoque na mensagem", () => {
		const r = resolveVariantDeletion({
			variantId: "a",
			isDefault: false,
			hasOrders: true,
			siblings: [sib("a", 0), sib("b", 1)],
			stockQty: 5,
		});
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.error).toContain("pedidos");
		}
	});

	it("bloqueia quando é a única variante", () => {
		const r = resolveVariantDeletion({
			variantId: "a",
			isDefault: true,
			hasOrders: false,
			siblings: [sib("a", 0)],
			stockQty: 0,
		});
		expect(r.allowed).toBe(false);
	});

	it("permite e não reatribui quando não é a padrão", () => {
		const r = resolveVariantDeletion({
			variantId: "b",
			isDefault: false,
			hasOrders: false,
			siblings: [sib("a", 0), sib("b", 1)],
			stockQty: 0,
		});
		expect(r).toEqual({ allowed: true, reassignDefaultTo: null });
	});

	it("reatribui a padrão para a menor sortOrder restante", () => {
		const r = resolveVariantDeletion({
			variantId: "a",
			isDefault: true,
			hasOrders: false,
			siblings: [sib("c", 2), sib("a", 0), sib("b", 1)],
			stockQty: 0,
		});
		expect(r).toEqual({ allowed: true, reassignDefaultTo: "b" });
	});
});
