import { describe, expect, it } from "vitest";
import { ordersTabSort } from "../orders-where";

describe("ordersTabSort", () => {
	it("FIFO por paid_at nas filas de expedição", () => {
		expect(ordersTabSort("paid")).toBe("paidAtAsc");
		expect(ordersTabSort("preparing")).toBe("paidAtAsc");
		expect(ordersTabSort("late")).toBe("paidAtAsc");
	});
	it("mais recente primeiro no resto", () => {
		expect(ordersTabSort("all")).toBe("newest");
		expect(ordersTabSort("shipped")).toBe("newest");
		expect(ordersTabSort("canceled")).toBe("newest");
	});
});
