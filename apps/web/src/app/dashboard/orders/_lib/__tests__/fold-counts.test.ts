import { describe, expect, it } from "vitest";
import { foldTabCounts } from "../orders-where";

describe("foldTabCounts", () => {
	it("overlay (spec 2026-07-13): late soma paid/preparing atrasados sem tirá-los do próprio bucket", () => {
		const counts = foldTabCounts([
			{ status: "paid", is_late: false, is_picked: false, count: 3 },
			{ status: "paid", is_late: true, is_picked: false, count: 2 },
			{ status: "preparing", is_late: true, is_picked: false, count: 1 },
			{ status: "shipped", is_late: false, is_picked: false, count: 4 },
		]);
		expect(counts.paid).toBe(5);
		expect(counts.preparing).toBe(1);
		expect(counts.late).toBe(3);
		expect(counts.shipped).toBe(4);
		expect(counts.all_count).toBe(10);
	});
	it("canceled+refunded agregam", () => {
		const counts = foldTabCounts([
			{ status: "canceled", is_late: false, is_picked: false, count: 1 },
			{ status: "refunded", is_late: false, is_picked: false, count: 2 },
		]);
		expect(counts.canceled).toBe(3);
	});
});

describe("foldTabCounts com bucket picked", () => {
	it("preparing não-atrasado com sessão completed vai pro bucket picked", () => {
		const counts = foldTabCounts([
			{ status: "preparing", is_late: false, is_picked: true, count: 2 },
			{ status: "preparing", is_late: false, is_picked: false, count: 4 },
			{ status: "paid", is_late: false, is_picked: false, count: 5 },
		]);
		expect(counts.picked).toBe(2);
		expect(counts.preparing).toBe(4);
		expect(counts.paid).toBe(5);
		expect(counts.all_count).toBe(11);
	});

	// Antes o atraso "vencia" e esvaziava o bucket da etapa; com o overlay
	// (spec 2026-07-13) os dois eixos somam em paralelo.
	it("preparing atrasado E picked conta em picked E no overlay late/late_picked", () => {
		const counts = foldTabCounts([
			{ status: "preparing", is_late: true, is_picked: true, count: 3 },
		]);
		expect(counts.late).toBe(3);
		expect(counts.late_picked).toBe(3);
		expect(counts.picked).toBe(3);
		expect(counts.preparing).toBe(0);
		expect(counts.late_preparing).toBe(0);
	});

	it("is_picked em status fora de preparing é ignorado", () => {
		const counts = foldTabCounts([
			{ status: "shipped", is_late: false, is_picked: true, count: 1 },
		]);
		expect(counts.shipped).toBe(1);
		expect(counts.picked).toBe(0);
	});
});
