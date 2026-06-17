import { describe, expect, it } from "vitest";
import {
	DRAFT_TTL_MS,
	parseDraft,
	serializeDraft,
	shouldPersist,
} from "../tool-draft-storage";
import { EMPTY_TOOL_VALUES } from "../tool-form-state";

const base = { ...EMPTY_TOOL_VALUES, name: "Furadeira" };

describe("serializeDraft / parseDraft", () => {
	it("round-trip preserva os dados", () => {
		const raw = serializeDraft(base, 1000);
		expect(parseDraft(raw, 1000)?.name).toBe("Furadeira");
	});

	it("expira após 24h", () => {
		const raw = serializeDraft(base, 0);
		expect(parseDraft(raw, DRAFT_TTL_MS + 1)).toBeNull();
	});

	it("dentro de 24h retorna os dados", () => {
		const raw = serializeDraft(base, 0);
		expect(parseDraft(raw, DRAFT_TTL_MS - 1)).not.toBeNull();
	});

	it("raw null → null", () => {
		expect(parseDraft(null, 0)).toBeNull();
	});

	it("json inválido → null", () => {
		expect(parseDraft("{bad", 0)).toBeNull();
	});
});

describe("shouldPersist", () => {
	it("false para form vazio", () => {
		expect(shouldPersist(EMPTY_TOOL_VALUES)).toBe(false);
	});

	it("true quando há conteúdo", () => {
		expect(shouldPersist(base)).toBe(true);
	});
});
