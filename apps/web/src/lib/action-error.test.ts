import { describe, expect, it } from "vitest";
import { actionErrorMessage } from "./action-error";

describe("actionErrorMessage", () => {
	it("retorna mensagem genérica para erro Postgres (drizzle wrapper)", () => {
		// Drizzle 0.45.x: DrizzleQueryError com DatabaseError em .cause
		const drizzleError = {
			name: "DrizzleQueryError",
			message:
				'Failed query: delete from "attribute_definition" where "id" = $1',
			cause: {
				name: "DatabaseError",
				code: "23503",
				message: 'violates foreign key constraint "fk_example"',
				constraint: "fk_example",
			},
		};
		const msg = actionErrorMessage(drizzleError);
		expect(msg).toBe("Não foi possível concluir a operação. Tente novamente.");
		// Garante que SQL não vaza
		expect(msg).not.toContain("attribute_definition");
		expect(msg).not.toContain("Failed query");
	});

	it("não vaza SQL quando o erro Postgres está no topo (sem wrapper)", () => {
		const pgError = {
			code: "23505",
			message: "duplicate key value violates unique constraint",
		};
		expect(actionErrorMessage(pgError)).toBe(
			"Não foi possível concluir a operação. Tente novamente."
		);
	});

	it("devolve error.message para erros de domínio comuns (instanceof Error)", () => {
		expect(
			actionErrorMessage(new Error("Estoque não pode ficar negativo"))
		).toBe("Estoque não pode ficar negativo");
	});

	it("devolve fallback para valores não-Error", () => {
		expect(actionErrorMessage("string solta")).toBe("Erro desconhecido");
		expect(actionErrorMessage(null)).toBe("Erro desconhecido");
		expect(actionErrorMessage(undefined)).toBe("Erro desconhecido");
		expect(actionErrorMessage(42)).toBe("Erro desconhecido");
	});
});
