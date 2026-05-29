import { describe, expect, it } from "vitest";
import { branchSchema, cepRangeSchema } from "../branch-schema";

describe("cepRangeSchema", () => {
	it("normaliza from/to pra 8 dígitos", () => {
		const r = cepRangeSchema.parse({ from: "01000-000", to: "05999-999" });
		expect(r.from).toBe("01000000");
		expect(r.to).toBe("05999999");
	});
	it("aceita label opcional", () => {
		expect(
			cepRangeSchema.parse({ from: "01000000", to: "05999999", label: "SP" })
				.label
		).toBe("SP");
		expect(
			cepRangeSchema.parse({ from: "01000000", to: "05999999" }).label
		).toBeUndefined();
	});
	it("rejeita from > to", () => {
		expect(
			cepRangeSchema.safeParse({ from: "05999999", to: "01000000" }).success
		).toBe(false);
	});
	it("rejeita CEP com dígitos insuficientes", () => {
		expect(
			cepRangeSchema.safeParse({ from: "0100", to: "05999999" }).success
		).toBe(false);
	});
});

describe("branchSchema cepRanges", () => {
	const base = { name: "Filial SP", status: "active" as const };

	it("aceita faixas que não se sobrepõem", () => {
		const r = branchSchema.safeParse({
			...base,
			cepRanges: [
				{ from: "01000000", to: "05999999" },
				{ from: "13000000", to: "13999999" },
			],
		});
		expect(r.success).toBe(true);
	});
	it("rejeita faixas sobrepostas da mesma filial", () => {
		const r = branchSchema.safeParse({
			...base,
			cepRanges: [
				{ from: "01000000", to: "06000000" },
				{ from: "05000000", to: "07000000" },
			],
		});
		expect(r.success).toBe(false);
	});
});
