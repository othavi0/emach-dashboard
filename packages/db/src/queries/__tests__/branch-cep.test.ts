import { describe, expect, it } from "vitest";
import {
	type BranchWithCepRanges,
	matchBranchByCep,
	normalizeCep,
} from "../branch-cep";

describe("normalizeCep", () => {
	it("remove máscara e valida 8 dígitos", () => {
		expect(normalizeCep("01000-000")).toBe("01000000");
		expect(normalizeCep("01000000")).toBe("01000000");
	});
	it("retorna null pra entrada inválida ou vazia", () => {
		expect(normalizeCep("123")).toBeNull();
		expect(normalizeCep("")).toBeNull();
		expect(normalizeCep(null)).toBeNull();
		expect(normalizeCep(undefined)).toBeNull();
	});
});

describe("matchBranchByCep", () => {
	const branches: BranchWithCepRanges[] = [
		{ id: "b1", cepRanges: [{ from: "01000000", to: "05999999" }] },
		{
			id: "b2",
			cepRanges: [{ from: "13000000", to: "13999999", label: "RMC" }],
		},
	];

	it("acha a filial cuja faixa cobre o CEP", () => {
		expect(matchBranchByCep("03000-000", branches)).toBe("b1");
		expect(matchBranchByCep("13500000", branches)).toBe("b2");
	});
	it("retorna null quando nenhum range cobre", () => {
		expect(matchBranchByCep("99999999", branches)).toBeNull();
	});
	it("retorna null pra CEP inválido", () => {
		expect(matchBranchByCep("abc", branches)).toBeNull();
	});
	it("ignora filiais sem faixas", () => {
		const list: BranchWithCepRanges[] = [
			{ id: "empty", cepRanges: null },
			{ id: "b1", cepRanges: [{ from: "01000000", to: "05999999" }] },
		];
		expect(matchBranchByCep("02000000", list)).toBe("b1");
	});
	it("normaliza bounds de range mascarados (com hífen)", () => {
		const masked: BranchWithCepRanges[] = [
			{ id: "sp", cepRanges: [{ from: "01000-000", to: "09999-999" }] },
		];
		expect(matchBranchByCep("01310-100", masked)).toBe("sp");
	});
	it("em sobreposição, primeira filial da lista vence", () => {
		const overlap: BranchWithCepRanges[] = [
			{ id: "first", cepRanges: [{ from: "01000000", to: "09999999" }] },
			{ id: "second", cepRanges: [{ from: "05000000", to: "06000000" }] },
		];
		expect(matchBranchByCep("05500000", overlap)).toBe("first");
	});
});
