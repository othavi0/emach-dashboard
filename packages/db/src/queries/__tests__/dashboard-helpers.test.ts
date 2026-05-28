import { describe, expect, it } from "vitest";
import { movingAverage, ORDER_STATUS_FUNNEL, sortByFunnel } from "../dashboard";

describe("dashboard helpers", () => {
	it("movingAverage janela 3 calcula média trailing", () => {
		expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([1, 1.5, 2, 3, 4]);
	});
	it("sortByFunnel ordena pelo ciclo de vida, não alfabético", () => {
		const input = [
			{ status: "delivered", count: 1 },
			{ status: "pending_payment", count: 9 },
			{ status: "paid", count: 5 },
		];
		expect(sortByFunnel(input).map((r) => r.status)).toEqual([
			"pending_payment",
			"paid",
			"delivered",
		]);
	});
	it("ORDER_STATUS_FUNNEL tem a ordem canônica", () => {
		expect(ORDER_STATUS_FUNNEL[0]).toBe("pending_payment");
	});
});
