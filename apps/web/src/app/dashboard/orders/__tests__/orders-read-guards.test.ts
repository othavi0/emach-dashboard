import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCapabilityWithContext: vi.fn(),
	getUserCapabilities: vi.fn().mockResolvedValue([]),
	roleHasCapability: vi.fn().mockReturnValue(true),
	can: vi.fn().mockResolvedValue(true),
}));

vi.mock("../data", () => ({
	fetchOrdersPage: vi.fn(),
	ORDERS_COUNTS_TAG: "orders-counts",
}));

// Also mock next/cache and @emach/db to avoid runtime errors
vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));
vi.mock("@emach/db", () => ({ db: {}, createDb: vi.fn(() => ({})) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
	ROLE_WEIGHT: { super_admin: 3, admin: 2, user: 1 },
}));

import { requireCapability } from "@/lib/permissions";
import { fetchOrdersPage } from "../actions";

const FORBIDDEN = new Error('Forbidden: capability "orders.read" requerida');

describe("fetchOrdersPage — guard", () => {
	it("rejeita quando requireCapability lança", async () => {
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
		await expect(
			fetchOrdersPage({ filters: {}, cursor: null })
		).rejects.toThrow("orders.read");
	});
});
