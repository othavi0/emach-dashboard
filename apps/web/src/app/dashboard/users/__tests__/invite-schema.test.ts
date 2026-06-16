import { describe, expect, it } from "vitest";
import { acceptInviteSchema, inviteUserSchema } from "../schema";

describe("inviteUserSchema", () => {
	it("aceita email + role + branchIds", () => {
		const r = inviteUserSchema.safeParse({
			email: "Novo@Emach.com.BR",
			role: "admin",
			branchIds: ["b1"],
		});
		expect(r.success).toBe(true);
		// normaliza email pra minúsculo
		if (r.success) {
			expect(r.data.email).toBe("novo@emach.com.br");
		}
	});

	it("exige >=1 filial salvo para super_admin", () => {
		expect(
			inviteUserSchema.safeParse({
				email: "a@b.com",
				role: "admin",
				branchIds: [],
			}).success
		).toBe(false);
		expect(
			inviteUserSchema.safeParse({
				email: "a@b.com",
				role: "super_admin",
				branchIds: [],
			}).success
		).toBe(true);
	});

	it("rejeita email inválido", () => {
		expect(
			inviteUserSchema.safeParse({
				email: "nao-email",
				role: "user",
				branchIds: ["b1"],
			}).success
		).toBe(false);
	});
});

describe("acceptInviteSchema", () => {
	it("aceita token + nome + senha >=8", () => {
		const r = acceptInviteSchema.safeParse({
			token: "tok",
			name: "Fulano",
			password: "12345678",
		});
		expect(r.success).toBe(true);
	});

	it("rejeita senha curta e nome curto", () => {
		expect(
			acceptInviteSchema.safeParse({
				token: "t",
				name: "Fulano",
				password: "123",
			}).success
		).toBe(false);
		expect(
			acceptInviteSchema.safeParse({
				token: "t",
				name: "F",
				password: "12345678",
			}).success
		).toBe(false);
	});
});
