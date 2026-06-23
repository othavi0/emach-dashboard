import type { CreateCarrierDraft } from "./carrier-schema";

export type CarrierStepId = "dados" | "zonas";

export const CARRIER_STEPS: {
	id: CarrierStepId;
	label: string;
	description: string;
}[] = [
	{
		id: "dados",
		label: "Dados",
		description: "Identidade fiscal e sobretaxas",
	},
	{
		id: "zonas",
		label: "Zonas & peço",
		description: "Cobertura por CEP e tabela de peso",
	},
];

export const CARRIER_STEP_FIELDS = {
	dados: [
		"name",
		"cnpj",
		"cubageDivisor",
		"grisPercent",
		"grisMinAmount",
		"advaloremPercent",
		"icmsPercent",
		"active",
		"notes",
	],
	zonas: ["zones"],
} satisfies Record<CarrierStepId, (keyof CreateCarrierDraft)[]>;

export const EMPTY_ZONE = {
	name: "",
	cepRanges: [],
	deliveryDays: null,
	minFreightAmount: null,
	rates: [
		{ weightFromKg: null, weightToKg: null, baseAmount: null, perKgAmount: 0 },
	],
} as const;
