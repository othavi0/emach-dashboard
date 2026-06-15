import { describe, expect, it } from "vitest";
import { type BranchScope, inScope, isBlindScope } from "@/lib/branch-scope";

const all: BranchScope = { kind: "all" };
const sp: BranchScope = {
	kind: "scoped",
	branchIds: ["b-sp"],
	includeUnassigned: true,
};
const userSp: BranchScope = {
	kind: "scoped",
	branchIds: ["b-sp"],
	includeUnassigned: false,
};
const blind: BranchScope = {
	kind: "scoped",
	branchIds: [],
	includeUnassigned: false,
};

describe("inScope", () => {
	it("all → sempre true", () => expect(inScope(all, "qualquer")).toBe(true));
	it("scoped → só filiais da lista", () => {
		expect(inScope(sp, "b-sp")).toBe(true);
		expect(inScope(sp, "b-rj")).toBe(false);
	});
});

describe("isBlindScope", () => {
	it("user sem filial → cego", () => expect(isBlindScope(blind)).toBe(true));
	it("admin sem filial mas com triagem → não cego", () =>
		expect(
			isBlindScope({ kind: "scoped", branchIds: [], includeUnassigned: true })
		).toBe(false));
	it("all → nunca cego", () => expect(isBlindScope(all)).toBe(false));
	it("user com filial → não cego", () =>
		expect(isBlindScope(userSp)).toBe(false));
});
