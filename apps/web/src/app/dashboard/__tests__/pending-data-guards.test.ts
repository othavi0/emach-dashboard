import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	can: vi.fn(),
}));

import type { DashboardSession } from "@emach/auth/dashboard";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { fetchDashboardActivity } from "../pending-data";

const FAKE_SESSION = {
	user: { id: "u1", role: "super_admin" },
} as DashboardSession;

describe("fetchDashboardActivity — guard de sessão", () => {
	it("rejeita quando requireCurrentSession lança", async () => {
		vi.mocked(requireCurrentSession).mockRejectedValueOnce(
			new Error("Não autenticado")
		);
		await expect(fetchDashboardActivity(null)).rejects.toThrow(
			"Não autenticado"
		);
	});
});

describe("fetchDashboardActivity — filtro por capability", () => {
	it("retorna items vazios quando nenhuma capability está disponível (fail-closed)", async () => {
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(FAKE_SESSION);
		vi.mocked(can).mockResolvedValue(false);
		const result = await fetchDashboardActivity(null);
		expect(result).toEqual({ items: [], nextCursor: null });
	});

	it("chama can() para stock.read, orders.read e reviews.read", async () => {
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(FAKE_SESSION);
		vi.mocked(can).mockResolvedValue(false);
		await fetchDashboardActivity(null);
		expect(vi.mocked(can)).toHaveBeenCalledWith(FAKE_SESSION, "stock.read");
		expect(vi.mocked(can)).toHaveBeenCalledWith(FAKE_SESSION, "orders.read");
		expect(vi.mocked(can)).toHaveBeenCalledWith(FAKE_SESSION, "reviews.read");
	});
});
