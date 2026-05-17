import { orderStatusEnum } from "@emach/db/schema/orders";
import { describe, expect, it } from "vitest";
import {
	capForStatus,
	VALID_TRANSITIONS,
} from "../src/app/dashboard/orders/schema";

describe("VALID_TRANSITIONS", () => {
	it("cobre exatamente os 9 estados do order_status", () => {
		expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual(
			[...orderStatusEnum.enumValues].sort()
		);
	});

	it("implementa a máquina de estados do ADR-0005", () => {
		expect(VALID_TRANSITIONS).toEqual({
			pending_payment: ["paid", "payment_failed", "canceled"],
			payment_failed: ["pending_payment", "canceled"],
			paid: ["preparing", "refunded"],
			preparing: ["shipped", "refunded"],
			shipped: ["delivered", "refunded"],
			delivered: ["returned"],
			returned: ["refunded"],
			canceled: [],
			refunded: [],
		});
	});

	it("toda transição alvo é um estado válido", () => {
		const valid = new Set<string>(orderStatusEnum.enumValues);
		for (const targets of Object.values(VALID_TRANSITIONS)) {
			for (const target of targets) {
				expect(valid.has(target)).toBe(true);
			}
		}
	});
});

describe("capForStatus", () => {
	it("canceled exige orders.cancel", () => {
		expect(capForStatus("canceled")).toBe("orders.cancel");
	});

	it("refunded exige orders.refund", () => {
		expect(capForStatus("refunded")).toBe("orders.refund");
	});

	it.each([
		"pending_payment",
		"paid",
		"preparing",
		"shipped",
		"delivered",
		"payment_failed",
		"returned",
	] as const)("%s exige orders.update_status", (status) => {
		expect(capForStatus(status)).toBe("orders.update_status");
	});
});
