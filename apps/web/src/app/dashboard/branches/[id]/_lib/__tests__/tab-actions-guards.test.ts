import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCapabilityWithContext: vi.fn(),
	requireCurrentSession: vi.fn(),
	can: vi.fn(),
}));

import { requireCapabilityWithContext } from "@/lib/permissions";
import { fetchBranchTeamAction } from "../tab-actions";

describe("fetchBranchTeamAction — branch-scope guard", () => {
	it("rejeita quando a filial está fora do escopo", async () => {
		vi.mocked(requireCapabilityWithContext).mockRejectedValueOnce(
			new Error("Filial fora do seu escopo: b1")
		);
		await expect(fetchBranchTeamAction("b1")).rejects.toThrow(
			"fora do seu escopo"
		);
	});

	it("chama requireCapabilityWithContext com users.manage + targetBranchIds", async () => {
		vi.mocked(requireCapabilityWithContext).mockRejectedValueOnce(
			new Error("scope")
		);
		await expect(fetchBranchTeamAction("b1")).rejects.toThrow();
		expect(vi.mocked(requireCapabilityWithContext)).toHaveBeenCalledWith(
			"users.manage",
			{ targetBranchIds: ["b1"] }
		);
	});
});
