import { describe, expect, it } from "vitest";
import { parseBranchParam } from "../dashboard-params";

describe("parseBranchParam", () => {
	it("retorna null para 'all' ou ausente", () => {
		expect(parseBranchParam(undefined)).toBeNull();
		expect(parseBranchParam("all")).toBeNull();
	});
	it("retorna o id quando string não-vazia", () => {
		expect(parseBranchParam("branch_123")).toBe("branch_123");
	});
	it("ignora array (pega o primeiro)", () => {
		expect(parseBranchParam(["b1", "b2"])).toBe("b1");
	});
});
