import { describe, expect, it } from "vitest";
import { resolveToolStatusFilter } from "../tool-query-helpers";

describe("resolveToolStatusFilter", () => {
	it("sem filtro, exclui as arquivadas", () => {
		expect(resolveToolStatusFilter(undefined)).toEqual({
			kind: "exclude-archived",
		});
	});

	it("string vazia conta como sem filtro", () => {
		expect(resolveToolStatusFilter("")).toEqual({ kind: "exclude-archived" });
	});

	it("um status explícito é respeitado", () => {
		expect(resolveToolStatusFilter("draft")).toEqual({
			kind: "in",
			statuses: ["draft"],
		});
	});

	it("lista separada por vírgula traz todos, inclusive arquivadas", () => {
		expect(resolveToolStatusFilter("active,draft,discontinued")).toEqual({
			kind: "in",
			statuses: ["active", "draft", "discontinued"],
		});
	});

	it("ignora espaços e itens vazios", () => {
		expect(resolveToolStatusFilter(" active , ,draft ")).toEqual({
			kind: "in",
			statuses: ["active", "draft"],
		});
	});
});
