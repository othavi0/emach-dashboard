import { describe, expect, it } from "vitest";

import {
	deleteUserSchema,
	suspendUserSchema,
} from "@/app/dashboard/users/schema";

describe("suspendUserSchema", () => {
	it("exige reason com >= 10 chars", () => {
		const r = suspendUserSchema.safeParse({ userId: "u1", reason: "curto" });
		expect(r.success).toBe(false);
	});
	it("aceita reason válido", () => {
		const r = suspendUserSchema.safeParse({
			userId: "u1",
			reason: "Motivo suficientemente longo",
		});
		expect(r.success).toBe(true);
	});
	it("rejeita sem reason", () => {
		const r = suspendUserSchema.safeParse({ userId: "u1" });
		expect(r.success).toBe(false);
	});
});

describe("deleteUserSchema", () => {
	it("exige reason com >= 10 chars", () => {
		const r = deleteUserSchema.safeParse({ userId: "u1", reason: "x" });
		expect(r.success).toBe(false);
	});
	it("aceita reason válido", () => {
		const r = deleteUserSchema.safeParse({
			userId: "u1",
			reason: "Funcionário desligado em 26/05",
		});
		expect(r.success).toBe(true);
	});
});
