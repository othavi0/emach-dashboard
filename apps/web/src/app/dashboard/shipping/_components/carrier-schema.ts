import { z } from "zod";

import type { CepRangeValue } from "@/app/dashboard/branches/_components/cep-ranges-editor";
import { isValidCnpj } from "@/lib/cpf-cnpj";
import { ratesSchema, zoneSchema } from "./zone-schema";

const pctRequired = z
	.number({ error: "Obrigatório" })
	.min(0, "≥ 0")
	.max(100, "≤ 100");
const money = z
	.number()
	.nonnegative("≥ 0")
	.max(1_000_000)
	.optional()
	.nullable();

export const carrierSchema = z.object({
	name: z.string().trim().min(1, "Nome obrigatório").max(120),
	cnpj: z
		.string()
		.trim()
		.min(1, "CNPJ obrigatório")
		.refine((v) => isValidCnpj(v), "CNPJ inválido"),
	active: z.boolean().default(true),
	cubageDivisor: z
		.number()
		.int("Inteiro")
		.positive("> 0")
		.max(100_000)
		.default(6000),
	grisPercent: pctRequired,
	grisMinAmount: money,
	advaloremPercent: pctRequired,
	icmsPercent: z
		.number({ error: "Obrigatório" })
		.min(0, "≥ 0")
		.max(99.99, "< 100"),
	notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type CarrierFormValues = z.infer<typeof carrierSchema>;

/** Estado do form (campo numérico vazio = null). `carrierSchema` valida e rejeita os nulos. */
export interface CarrierDraft {
	active: boolean;
	advaloremPercent: number | null;
	cnpj: string;
	cubageDivisor: number;
	grisMinAmount: number | null;
	grisPercent: number | null;
	icmsPercent: number | null;
	name: string;
	notes: string;
}

export const EMPTY_CARRIER_DRAFT: CarrierDraft = {
	name: "",
	cnpj: "",
	active: true,
	cubageDivisor: 6000,
	grisPercent: null,
	grisMinAmount: null,
	advaloremPercent: null,
	icmsPercent: null,
	notes: "",
};

// --- Criação com zonas ---

export interface RateRowDraft {
	baseAmount: number | null;
	perKgAmount: number;
	weightFromKg: number | null;
	weightToKg: number | null;
}

export interface ZoneDraft {
	cepRanges: CepRangeValue[];
	deliveryDays: number | null;
	minFreightAmount: number | null;
	name: string;
	rates: RateRowDraft[];
}

export interface CreateCarrierDraft extends CarrierDraft {
	zones: ZoneDraft[];
}

export const zoneWithRatesSchema = zoneSchema.extend({ rates: ratesSchema });

export const createCarrierSchema = carrierSchema.extend({
	zones: z.array(zoneWithRatesSchema).min(1, "Adicione ao menos uma zona"),
});

export type CreateCarrierFormValues = z.infer<typeof createCarrierSchema>;
