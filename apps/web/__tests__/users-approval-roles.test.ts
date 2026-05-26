import { describe, expect, it } from "vitest";

import { allowedApprovalRoles } from "@/app/dashboard/users/_lib/approval-roles";

describe("allowedApprovalRoles", () => {
	it("super_admin pode atribuir os 4 roles", () => {
		expect(allowedApprovalRoles("super_admin")).toEqual([
			"super_admin",
			"admin",
			"manager",
			"user",
		]);
	});

	it("admin pode atribuir admin/manager/user (não super_admin)", () => {
		expect(allowedApprovalRoles("admin")).toEqual(["admin", "manager", "user"]);
	});

	it("manager pode atribuir manager/user", () => {
		expect(allowedApprovalRoles("manager")).toEqual(["manager", "user"]);
	});

	it("user não pode atribuir nada", () => {
		expect(allowedApprovalRoles("user")).toEqual([]);
	});
});
