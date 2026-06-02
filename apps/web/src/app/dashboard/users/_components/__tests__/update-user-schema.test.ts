import { describe, expect, it } from "vitest";
import { updateUserSchema } from "../../schema";

describe("updateUserSchema", () => {
	it("aceita emailVerified opcional", () => {
		const r = updateUserSchema.safeParse({
			userId: "abc",
			emailVerified: true,
		});
		expect(r.success).toBe(true);
	});

	it("aceita payload sem emailVerified", () => {
		const r = updateUserSchema.safeParse({ userId: "abc", name: "Fulano" });
		expect(r.success).toBe(true);
	});

	it("rejeita emailVerified não-booleano", () => {
		const r = updateUserSchema.safeParse({
			userId: "abc",
			emailVerified: "sim",
		});
		expect(r.success).toBe(false);
	});
});
