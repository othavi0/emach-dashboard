import { describe, expect, it } from "vitest";

import { ordersListFiltersSchema } from "../schema";

describe("ordersListFiltersSchema — lateStatus", () => {
	it("aceita paid e preparing", () => {
		expect(
			ordersListFiltersSchema.parse({ tab: "late", lateStatus: "paid" })
				.lateStatus
		).toBe("paid");
		expect(
			ordersListFiltersSchema.parse({ lateStatus: "preparing" }).lateStatus
		).toBe("preparing");
	});

	it("rejeita valor fora do enum (página cai no default)", () => {
		expect(
			ordersListFiltersSchema.safeParse({ lateStatus: "shipped" }).success
		).toBe(false);
	});

	it("é opcional", () => {
		expect(ordersListFiltersSchema.parse({}).lateStatus).toBeUndefined();
	});
});
