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

	it("não vaza SQL de INSERT em DrizzleQueryError (risco real de branches/actions)", () => {
		const drizzleInsertError = {
			name: "DrizzleQueryError",
			message:
				'Failed query: INSERT INTO "branch" ("id","name") VALUES ($1,$2) -- params: ["uuid-x","Filial Centro"]',
			cause: {
				name: "DatabaseError",
				code: "23505",
				message: 'duplicate key value violates unique constraint "branch_name_key"',
				constraint: "branch_name_key",
			},
		};
		const msg = actionErrorMessage(drizzleInsertError);
		expect(msg).toBe("Não foi possível concluir a operação. Tente novamente.");
		expect(msg).not.toContain("Failed query");
		expect(msg).not.toContain("INSERT");
		expect(msg).not.toContain("params");
	});

	it("não vaza SQL de UPDATE em DrizzleQueryError (risco real de site/settings/actions)", () => {
		const drizzleUpdateError = {
			name: "DrizzleQueryError",
			message:
				'Failed query: UPDATE "store_settings" SET "shipping_origin_branch_id" = $1 WHERE "id" = $2 -- params: ["branch-id","singleton"]',
			cause: {
				name: "DatabaseError",
				code: "23503",
				message:
					'insert or update on table "store_settings" violates foreign key constraint "fk_shipping_origin"',
				constraint: "fk_shipping_origin",
			},
		};
		const msg = actionErrorMessage(drizzleUpdateError);
		expect(msg).toBe("Não foi possível concluir a operação. Tente novamente.");
		expect(msg).not.toContain("Failed query");
		expect(msg).not.toContain("UPDATE");
		expect(msg).not.toContain("params");
	});
});
