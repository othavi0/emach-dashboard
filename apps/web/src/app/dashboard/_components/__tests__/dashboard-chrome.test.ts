import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentSession = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() =>
	vi.fn((path: string) => {
		throw new Error(`REDIRECT:${path}`);
	})
);
const mockCan = vi.hoisted(() => vi.fn());
const mockGetUserCapabilities = vi.hoisted(() => vi.fn());
const mockFetchDashboardCounts = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/lib/session", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/session")>();
	return { ...actual, requireCurrentSession: mockRequireCurrentSession };
});
vi.mock("@/lib/permissions", () => ({
	can: mockCan,
	getUserCapabilities: mockGetUserCapabilities,
}));
vi.mock("../../pending-data", () => ({
	fetchDashboardCounts: mockFetchDashboardCounts,
}));
vi.mock("../app-sidebar", () => ({ AppSidebar: () => null }));

import { DashboardChrome } from "../dashboard-chrome";

function sessionWith(status: string, role = "admin") {
	return {
		user: {
			id: "u1",
			name: "Teste",
			email: "t@e.com",
			role,
			image: null,
			status,
		},
	};
}

describe("DashboardChrome — gate de auth", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCan.mockResolvedValue(true);
		mockGetUserCapabilities.mockResolvedValue(new Set());
		mockFetchDashboardCounts.mockReturnValue(Promise.resolve({}));
	});

	it("redireciona pending → /pending", async () => {
		mockRequireCurrentSession.mockResolvedValue(sessionWith("pending"));
		await expect(DashboardChrome()).rejects.toThrow("REDIRECT:/pending");
		expect(mockRedirect).toHaveBeenCalledWith("/pending");
	});

	it("redireciona suspended → /suspended", async () => {
		mockRequireCurrentSession.mockResolvedValue(sessionWith("suspended"));
		await expect(DashboardChrome()).rejects.toThrow("REDIRECT:/suspended");
		expect(mockRedirect).toHaveBeenCalledWith("/suspended");
	});

	it.each([
		"super_admin",
		"admin",
		"user",
	])("active (%s) renderiza sem redirect", async (role) => {
		mockRequireCurrentSession.mockResolvedValue(sessionWith("active", role));
		const el = await DashboardChrome();
		expect(mockRedirect).not.toHaveBeenCalled();
		expect(el).toBeTruthy();
	});
});
