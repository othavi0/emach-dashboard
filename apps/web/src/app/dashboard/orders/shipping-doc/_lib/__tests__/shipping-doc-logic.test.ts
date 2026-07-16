import { describe, expect, it } from "vitest";
import {
	contentDeclarationTotals,
	displayPhone,
	formatCarrierService,
	maskDocument,
	recipientAddressLines,
	type ShippingDocRecipient,
	type ShippingDocSender,
	senderAddressLines,
} from "../shipping-doc-logic";

const FULL_SENDER: ShippingDocSender = {
	cep: "80010000",
	city: "Curitiba",
	complement: "Galpão 3",
	name: "Filial Curitiba",
	neighborhood: "Centro",
	phone: "4133334444",
	state: "PR",
	street: "Rua XV de Novembro",
	streetNumber: "1200",
};

const FULL_RECIPIENT: ShippingDocRecipient = {
	city: "Joinville",
	complement: "Apto 42",
	document: "39053344705",
	name: "Carlos Eduardo Ramos",
	neighborhood: "América",
	number: "88",
	phone: "47988887777",
	state: "SC",
	street: "Rua das Palmeiras",
	zipCode: "89201000",
};

describe("senderAddressLines", () => {
	it("monta rua+número+complemento, bairro, cidade/UF e CEP", () => {
		expect(senderAddressLines(FULL_SENDER)).toEqual([
			"Rua XV de Novembro, 1200 — Galpão 3",
			"Centro",
			"Curitiba/PR",
			"CEP 80010-000",
		]);
	});

	it("omite campos ausentes sem deixar 'undefined'", () => {
		const partial: ShippingDocSender = {
			cep: null,
			city: "Curitiba",
			complement: null,
			name: "Filial",
			neighborhood: null,
			phone: null,
			state: null,
			street: "Rua A",
			streetNumber: null,
		};
		expect(senderAddressLines(partial)).toEqual(["Rua A", "Curitiba"]);
	});

	it("devolve lista vazia quando nada há", () => {
		const empty: ShippingDocSender = {
			cep: null,
			city: null,
			complement: null,
			name: null,
			neighborhood: null,
			phone: null,
			state: null,
			street: null,
			streetNumber: null,
		};
		expect(senderAddressLines(empty)).toEqual([]);
	});
});

describe("recipientAddressLines", () => {
	it("usa number/zipCode do snapshot", () => {
		expect(recipientAddressLines(FULL_RECIPIENT)).toEqual([
			"Rua das Palmeiras, 88 — Apto 42",
			"América",
			"Joinville/SC",
			"CEP 89201-000",
		]);
	});

	it("CEP inválido é omitido (não vira linha 'CEP ...')", () => {
		const lines = recipientAddressLines({ ...FULL_RECIPIENT, zipCode: "123" });
		expect(lines.some((l) => l.startsWith("CEP"))).toBe(false);
	});
});

describe("maskDocument", () => {
	it("mascara CPF expondo só os blocos do meio", () => {
		expect(maskDocument("390.533.447-05")).toBe("***.533.447-**");
	});

	it("mascara CNPJ", () => {
		expect(maskDocument("11222333000181")).toBe("**.222.333/****-**");
	});

	it("documento com tamanho inesperado vira null (não vaza dígito cru)", () => {
		expect(maskDocument("123")).toBeNull();
		expect(maskDocument(null)).toBeNull();
	});
});

describe("displayPhone", () => {
	it("formata celular BR", () => {
		expect(displayPhone("47988887777")).toBe("(47) 98888-7777");
	});

	it("null vira null (nunca string vazia)", () => {
		expect(displayPhone(null)).toBeNull();
	});
});

describe("formatCarrierService", () => {
	it("junta método e código quando ambos existem", () => {
		expect(formatCarrierService("Correios · SEDEX", "COR-04162")).toBe(
			"Correios · SEDEX · COR-04162"
		);
	});

	it("degrada para o que existir", () => {
		expect(formatCarrierService("Correios", null)).toBe("Correios");
		expect(formatCarrierService(null, "COR-04162")).toBe("COR-04162");
	});

	it("sem transportadora usa rótulo 'Frete a combinar'", () => {
		expect(formatCarrierService(null, null)).toBe("Frete a combinar");
	});
});

describe("contentDeclarationTotals", () => {
	it("soma quantidades e valores de linha", () => {
		expect(
			contentDeclarationTotals([
				{ lineTotal: 150, name: "A", quantity: 3, unitPrice: 50 },
				{ lineTotal: 80, name: "B", quantity: 2, unitPrice: 40 },
			])
		).toEqual({ totalItems: 2, totalQuantity: 5, totalValue: 230 });
	});

	it("lista vazia zera tudo", () => {
		expect(contentDeclarationTotals([])).toEqual({
			totalItems: 0,
			totalQuantity: 0,
			totalValue: 0,
		});
	});
});
