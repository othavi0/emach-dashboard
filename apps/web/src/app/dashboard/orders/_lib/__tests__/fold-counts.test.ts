import { describe, expect, it } from "vitest";
import { foldTabCounts } from "../orders-where";

describe("foldTabCounts", () => {
	it("overlay (spec 2026-07-13): late soma paid/preparing atrasados sem tirá-los do próprio bucket", () => {
		const counts = foldTabCounts([
			{ status: "paid", is_late: false, count: 3 },
			{ status: "paid", is_late: true, count: 2 },
			{ status: "preparing", is_late: true, count: 1 },
			{ status: "shipped", is_late: false, count: 4 },
		]);
		expect(counts.paid).toBe(5);
		expect(counts.preparing).toBe(1);
		expect(counts.late).toBe(3);
		expect(counts.shipped).toBe(4);
		expect(counts.all_count).toBe(10);
	});
	it("canceled+refunded agregam", () => {
		const counts = foldTabCounts([
			{ status: "canceled", is_late: false, count: 1 },
			{ status: "refunded", is_late: false, count: 2 },
		]);
		expect(counts.canceled).toBe(3);
	});
});
