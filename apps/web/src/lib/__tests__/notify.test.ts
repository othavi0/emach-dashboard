import { beforeEach, describe, expect, it, vi } from "vitest";

const { error, success } = vi.hoisted(() => ({
	error: vi.fn(),
	success: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error, success } }));

import { notify } from "../notify";

describe("notify", () => {
	beforeEach(() => {
		error.mockClear();
		success.mockClear();
	});

	it("error dura 8s e tem closeButton", () => {
		notify.error("falhou");
		expect(error).toHaveBeenCalledWith("falhou", {
			duration: 8000,
			closeButton: true,
		});
	});

	it("success dura 4s", () => {
		notify.success("ok");
		expect(success).toHaveBeenCalledWith("ok", { duration: 4000 });
	});

	it("opts do caller sobrescrevem o default", () => {
		notify.error("x", { duration: 12_000 });
		expect(error).toHaveBeenCalledWith("x", {
			duration: 12_000,
			closeButton: true,
		});
	});
});
