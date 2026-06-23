import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCapability, listCustomerOrders } = vi.hoisted(() => ({
	requireCapability: vi.fn(),
	listCustomerOrders: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({ requireCapability }));
vi.mock("./data", () => ({ listCustomerOrders }));

import { fetchCustomerOrdersPage } from "./actions";

describe("fetchCustomerOrdersPage", () => {
	beforeEach(() => {
		requireCapability.mockReset().mockResolvedValue(undefined);
		listCustomerOrders
			.mockReset()
			.mockResolvedValue({ items: [], nextCursor: null });
	});

	it("exige customers.read e delega a listCustomerOrders", async () => {
		const out = await fetchCustomerOrdersPage({ clientId: "c1", cursor: null });
		expect(requireCapability).toHaveBeenCalledWith("customers.read");
		expect(listCustomerOrders).toHaveBeenCalledWith({
			clientId: "c1",
			cursor: null,
		});
		expect(out).toEqual({ items: [], nextCursor: null });
	});
});
