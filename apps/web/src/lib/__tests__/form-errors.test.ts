import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorToastMessage, zodIssuesToFieldErrors } from "../form-errors";

const schema = z.object({
	name: z.string().min(1, "Nome obrigatório"),
	email: z.email("E-mail inválido"),
});

describe("zodIssuesToFieldErrors", () => {
	it("mapeia o primeiro erro por chave top-level (path[0])", () => {
		const r = schema.safeParse({ name: "", email: "x" });
		if (r.success) {
			throw new Error("esperava falha");
		}
		const errors = zodIssuesToFieldErrors(r.error);
		expect(errors.name).toBe("Nome obrigatório");
		expect(errors.email).toBe("E-mail inválido");
	});

	it("não sobrescreve: mantém o primeiro erro de cada chave", () => {
		const err = {
			issues: [
				{ path: ["name"], message: "primeiro" },
				{ path: ["name"], message: "segundo" },
			],
		} as unknown as z.ZodError;
		expect(zodIssuesToFieldErrors(err).name).toBe("primeiro");
	});

	it("usa path[0] para erros aninhados (ex: businessHours.weekdays)", () => {
		const err = {
			issues: [
				{
					path: ["businessHours", "weekdays", "opensAt"],
					message: "Horário inválido",
				},
			],
		} as unknown as z.ZodError;
		expect(zodIssuesToFieldErrors(err).businessHours).toBe("Horário inválido");
	});

	it("mapeia issue de path vazio para a chave _form", () => {
		const err = {
			issues: [{ path: [], message: "Erro geral do formulário" }],
		} as unknown as z.ZodError;
		expect(zodIssuesToFieldErrors(err)._form).toBe("Erro geral do formulário");
	});
});

describe("errorToastMessage", () => {
	it("conta campos destacados (chaves), não issues", () => {
		expect(errorToastMessage({ name: "x" })).toBe(
			"1 erro — corrija os campos destacados"
		);
		expect(errorToastMessage({ name: "x", email: "y" })).toBe(
			"2 erros — corrija os campos destacados"
		);
	});
});
