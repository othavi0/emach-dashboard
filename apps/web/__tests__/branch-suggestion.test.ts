import { describe, expect, it } from "vitest";
import {
	normalizeCep,
	suggestBranchForCep,
} from "../src/app/dashboard/orders/_lib/branch-suggestion";

const SP = {
	id: "branch-sp",
	cepRanges: [{ from: "01000-000", to: "09999-999" }],
};
const RJ = {
	id: "branch-rj",
	cepRanges: [{ from: "20000-000", to: "28999-999" }],
};

describe("normalizeCep", () => {
	it("remove hífen e mantém só dígitos", () => {
		expect(normalizeCep("01310-100")).toBe("01310100");
		expect(normalizeCep("01310100")).toBe("01310100");
		expect(normalizeCep(" 01310-100 ")).toBe("01310100");
	});

	it("retorna null para input inválido", () => {
		expect(normalizeCep("")).toBeNull();
		expect(normalizeCep("123")).toBeNull();
		expect(normalizeCep("abcde-fgh")).toBeNull();
	});

	it("retorna null para null e undefined", () => {
		expect(normalizeCep(null)).toBeNull();
		expect(normalizeCep(undefined)).toBeNull();
	});
});

describe("suggestBranchForCep", () => {
	it("encontra a filial cujo range cobre o CEP", () => {
		expect(suggestBranchForCep("01310-100", [SP, RJ])).toBe("branch-sp");
		expect(suggestBranchForCep("22041-001", [SP, RJ])).toBe("branch-rj");
	});

	it("retorna null se nenhuma filial cobre o CEP", () => {
		expect(suggestBranchForCep("99999-999", [SP, RJ])).toBeNull();
	});

	it("retorna null se CEP inválido", () => {
		expect(suggestBranchForCep("abc", [SP, RJ])).toBeNull();
		expect(suggestBranchForCep("", [SP, RJ])).toBeNull();
	});

	it("ignora filiais sem cepRanges", () => {
		expect(
			suggestBranchForCep("01310-100", [{ id: "no-ranges", cepRanges: null }])
		).toBeNull();
	});

	it("retorna primeira match em caso de sobreposição (documentado)", () => {
		const overlap = {
			id: "branch-overlap",
			cepRanges: [{ from: "01000-000", to: "09999-999" }],
		};
		expect(suggestBranchForCep("01310-100", [SP, overlap])).toBe("branch-sp");
	});
});
