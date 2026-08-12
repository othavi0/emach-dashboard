import { describe, expect, it } from "vitest";
import { resolveToolDeletion } from "../tool-deletion";

const facts = (
	over: Partial<Parameters<typeof resolveToolDeletion>[0]> = {}
) => ({
	orderCount: 0,
	reviewCount: 0,
	stockQty: 0,
	...over,
});

describe("resolveToolDeletion", () => {
	it("permite quando não há pedidos, avaliações nem estoque", () => {
		expect(resolveToolDeletion(facts())).toEqual({ allowed: true });
	});

	it("bloqueia por pedidos e sugere arquivar", () => {
		const r = resolveToolDeletion(facts({ orderCount: 4 }));
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("4 pedidos");
			expect(r.suggestArchive).toBe(true);
		}
	});

	it("usa singular com um pedido só", () => {
		const r = resolveToolDeletion(facts({ orderCount: 1 }));
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("1 pedido ");
		}
	});

	it("bloqueia por avaliações", () => {
		const r = resolveToolDeletion(facts({ reviewCount: 2 }));
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("2 avaliações");
		}
	});

	it("bloqueia por estoque", () => {
		const r = resolveToolDeletion(facts({ stockQty: 90 }));
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("90 un");
		}
	});

	it("pedidos têm precedência sobre avaliações e estoque", () => {
		const r = resolveToolDeletion(
			facts({ orderCount: 4, reviewCount: 2, stockQty: 90 })
		);
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("pedido");
		}
	});

	it("avaliações têm precedência sobre estoque", () => {
		const r = resolveToolDeletion(facts({ reviewCount: 1, stockQty: 90 }));
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("avaliação");
		}
	});
});
