import { describe, expect, it } from "vitest";

import { authErrorMessage } from "../auth-error";

describe("authErrorMessage", () => {
	it("mapeia código conhecido para pt-BR", () => {
		expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
			"Email ou senha incorretos. Verifique e tente de novo."
		);
	});

	it("usa fallback para código desconhecido", () => {
		expect(authErrorMessage({ code: "ALGO_INESPERADO" })).toContain(
			"Não foi possível entrar"
		);
	});

	it("usa fallback para null", () => {
		expect(authErrorMessage(null)).toContain("Não foi possível entrar");
	});
});
