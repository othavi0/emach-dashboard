import { describe, expect, it } from "vitest";
import { EMPTY_TOOL_VALUES } from "../tool-form-state";
import {
	getStepErrorCount,
	stepHasErrors,
	stepsWithContent,
	TOOL_STEPS,
} from "../tool-form-steps";
import { toolFormSchema } from "../tool-schema";

describe("getStepErrorCount", () => {
	it("retorna 0 para passo opcional vazio (fiscal)", () => {
		const parsed = toolFormSchema.safeParse({});
		expect(getStepErrorCount(parsed, "fiscal")).toBe(0);
	});

	it("conta >= 2 campos com erro no passo identity de um form vazio", () => {
		const parsed = toolFormSchema.safeParse({});
		expect(getStepErrorCount(parsed, "identity")).toBeGreaterThanOrEqual(2);
	});

	it("é coerente com stepHasErrors em todos os passos", () => {
		const parsed = toolFormSchema.safeParse({});
		for (const step of TOOL_STEPS) {
			expect(getStepErrorCount(parsed, step.id) > 0).toBe(
				stepHasErrors(parsed, step.id)
			);
		}
	});
});

describe("stepsWithContent", () => {
	it("form vazio → nenhum passo com conteúdo", () => {
		expect(stepsWithContent(EMPTY_TOOL_VALUES).size).toBe(0);
	});

	it("nome preenchido → identity tem conteúdo, variants não", () => {
		const v = { ...EMPTY_TOOL_VALUES, name: "Furadeira" };
		const set = stepsWithContent(v);
		expect(set.has("identity")).toBe(true);
		expect(set.has("variants")).toBe(false);
	});
});
