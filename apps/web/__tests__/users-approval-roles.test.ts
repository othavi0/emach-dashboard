import { describe, expect, it } from "vitest";

import { allowedApprovalRoles } from "@/app/dashboard/users/_lib/approval-roles";

describe("allowedApprovalRoles", () => {
	it("super_admin pode atribuir os 3 roles", () => {
		expect(allowedApprovalRoles("super_admin")).toEqual([
			"super_admin",
			"admin",
			"user",
		]);
	});

	it("admin pode atribuir admin/user (não super_admin)", () => {
		expect(allowedApprovalRoles("admin")).toEqual(["admin", "user"]);
	});

	it("user não pode atribuir nada", () => {
		expect(allowedApprovalRoles("user")).toEqual([]);
	});
});
