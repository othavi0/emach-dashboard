import { describe, expect, it } from "vitest";

import { latenessOf } from "../_lib/lateness";

const NOW = new Date("2026-07-11T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3_600_000);

describe("latenessOf (régua spec 2026-07-11)", () => {
	it("paid conta de paid_at (fallback created_at)", () => {
		expect(
			latenessOf({
				status: "paid",
				paidAt: daysAgo(4),
				preparingAt: null,
				createdAt: daysAgo(10),
				now: NOW,
			})
		).toBe("late");
		expect(
			latenessOf({
				status: "paid",
				paidAt: daysAgo(1),
				preparingAt: null,
				createdAt: daysAgo(10),
				now: NOW,
			})
		).toBe("none");
	});

	it("preparing conta de preparing_at — pago em junho mas separando desde ontem não é atrasado", () => {
		expect(
			latenessOf({
				status: "preparing",
				paidAt: daysAgo(20),
				preparingAt: daysAgo(1),
				createdAt: daysAgo(21),
				now: NOW,
			})
		).toBe("none");
	});

	it("preparing sem preparing_at cai para paid_at (legado)", () => {
		expect(
			latenessOf({
				status: "preparing",
				paidAt: daysAgo(20),
				preparingAt: null,
				createdAt: daysAgo(21),
				now: NOW,
			})
		).toBe("late");
	});

	it("48h = amber, 72h = late", () => {
		expect(
			latenessOf({
				status: "preparing",
				paidAt: null,
				preparingAt: daysAgo(2.5),
				createdAt: daysAgo(30),
				now: NOW,
			})
		).toBe("amber");
	});

	it("status fora do fluxo é none", () => {
		expect(
			latenessOf({
				status: "shipped",
				paidAt: daysAgo(30),
				preparingAt: daysAgo(30),
				createdAt: daysAgo(30),
				now: NOW,
			})
		).toBe("none");
	});
});
