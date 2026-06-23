import { describe, expect, it } from "vitest";
import { carrierSchema, createCarrierSchema } from "../carrier-schema";

const validCarrier = {
	name: "Jadlog",
	cnpj: "04.884.082/0001-35", // CNPJ válido (dígitos verificadores corretos)
	active: true,
	cubageDivisor: 6000,
	grisPercent: 0.5,
	grisMinAmount: 15,
	advaloremPercent: 0.3,
	icmsPercent: 12,
	notes: "",
};

const validZone = {
	name: "Sul",
	cepRanges: [{ from: "80000000", to: "99999999" }],
	deliveryDays: 5,
	minFreightAmount: null,
	rates: [{ weightFromKg: 0, weightToKg: 5, baseAmount: 25, perKgAmount: 2 }],
};

describe("carrierSchema", () => {
	it("aceita uma transportadora completa", () => {
		expect(carrierSchema.safeParse(validCarrier).success).toBe(true);
	});
	it("rejeita CNPJ ausente", () => {
		expect(carrierSchema.safeParse({ ...validCarrier, cnpj: "" }).success).toBe(
			false
		);
	});
	it("rejeita CNPJ com dígito inválido", () => {
		expect(
			carrierSchema.safeParse({ ...validCarrier, cnpj: "11.111.111/1111-11" })
				.success
		).toBe(false);
	});
	it("rejeita ICMS/GRIS/ad valorem nulos", () => {
		expect(
			carrierSchema.safeParse({ ...validCarrier, icmsPercent: null }).success
		).toBe(false);
		expect(
			carrierSchema.safeParse({ ...validCarrier, grisPercent: null }).success
		).toBe(false);
		expect(
			carrierSchema.safeParse({ ...validCarrier, advaloremPercent: null })
				.success
		).toBe(false);
	});
	it("não conhece o campo tollAmount", () => {
		expect("tollAmount" in carrierSchema.shape).toBe(false);
	});
});

describe("createCarrierSchema", () => {
	it("aceita carrier + 1 zona com 1 rate", () => {
		expect(
			createCarrierSchema.safeParse({ ...validCarrier, zones: [validZone] })
				.success
		).toBe(true);
	});
	it("rejeita zero zonas", () => {
		expect(
			createCarrierSchema.safeParse({ ...validCarrier, zones: [] }).success
		).toBe(false);
	});
	it("rejeita zona sem nenhuma faixa de peso", () => {
		const z = { ...validZone, rates: [] };
		expect(
			createCarrierSchema.safeParse({ ...validCarrier, zones: [z] }).success
		).toBe(false);
	});
	it("rejeita zona sem faixa de CEP", () => {
		const z = { ...validZone, cepRanges: [] };
		expect(
			createCarrierSchema.safeParse({ ...validCarrier, zones: [z] }).success
		).toBe(false);
	});
});
