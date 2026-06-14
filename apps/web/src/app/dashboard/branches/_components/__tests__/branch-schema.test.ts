import { describe, expect, it } from "vitest";
import {
	branchSchema,
	businessHoursSchema,
	cepRangeSchema,
} from "../branch-schema";

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
	const base = {
		name: "Filial SP",
		status: "active" as const,
		phone: "(11) 98765-4321",
		cep: "01000-000",
		street: "Av. Paulista",
		streetNumber: "1578",
		neighborhood: "Bela Vista",
		city: "São Paulo",
		state: "SP",
	};

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

describe("branchSchema — campos obrigatórios", () => {
	const full = {
		name: "Filial SP",
		status: "active" as const,
		phone: "(11) 98765-4321",
		cep: "01000-000",
		street: "Av. Paulista",
		streetNumber: "1578",
		neighborhood: "Bela Vista",
		city: "São Paulo",
		state: "SP",
	};

	it("aceita filial com contato e endereço completos", () => {
		expect(branchSchema.safeParse(full).success).toBe(true);
	});

	it("aceita complemento ausente (opcional)", () => {
		expect(branchSchema.safeParse(full).success).toBe(true);
	});

	it.each([
		"phone",
		"cep",
		"street",
		"streetNumber",
		"neighborhood",
		"city",
		"state",
	] as const)("rejeita quando %s está vazio", (field) => {
		const r = branchSchema.safeParse({ ...full, [field]: "" });
		expect(r.success).toBe(false);
	});
});

describe("businessHoursSchema — intervalo de almoço", () => {
	const open = { isOpen: true, opensAt: "08:00", closesAt: "18:00" };

	it("aceita período sem intervalo", () => {
		const r = businessHoursSchema.safeParse({
			weekdays: { ...open },
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.success).toBe(true);
	});

	it("aceita intervalo válido dentro do expediente", () => {
		const r = businessHoursSchema.safeParse({
			weekdays: { ...open, breakStart: "12:00", breakEnd: "13:00" },
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.success).toBe(true);
	});

	it("rejeita intervalo pela metade", () => {
		const r = businessHoursSchema.safeParse({
			weekdays: { ...open, breakStart: "12:00", breakEnd: null },
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.success).toBe(false);
	});

	it("rejeita intervalo fora da ordem opens < breakStart < breakEnd < closes", () => {
		const r = businessHoursSchema.safeParse({
			weekdays: { ...open, breakStart: "13:00", breakEnd: "12:00" },
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.success).toBe(false);
	});

	it.each([
		["início igual à abertura", "08:00", "13:00"],
		["fim igual ao fechamento", "12:00", "18:00"],
		["início igual ao fim", "12:00", "12:00"],
	])("rejeita intervalo com %s", (_label, breakStart, breakEnd) => {
		const r = businessHoursSchema.safeParse({
			weekdays: { ...open, breakStart, breakEnd },
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.success).toBe(false);
	});

	it("zera intervalo quando o dia está fechado", () => {
		const r = businessHoursSchema.parse({
			weekdays: {
				isOpen: false,
				opensAt: null,
				closesAt: null,
				breakStart: "12:00",
				breakEnd: "13:00",
			},
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.weekdays.breakStart).toBeNull();
		expect(r.weekdays.breakEnd).toBeNull();
	});
});
