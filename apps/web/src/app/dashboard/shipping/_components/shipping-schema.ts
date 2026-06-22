import { z } from "zod";

export const INSURANCE_POLICY_OPTIONS = ["none", "cart_value"] as const;

export const INSURANCE_POLICY_LABELS: Record<
	(typeof INSURANCE_POLICY_OPTIONS)[number],
	string
> = {
	none: "Sem seguro",
	cart_value: "Declarar o valor do carrinho",
};

export const shippingSettingsSchema = z.object({
	originBranchId: z
		.string()
		.trim()
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : undefined)),
	insurancePolicy: z.enum(INSURANCE_POLICY_OPTIONS),
	insuranceCapAmount: z
		.number({ error: "Informe o teto do seguro" })
		.nonnegative("Teto não pode ser negativo")
		.max(100_000, "Teto muito alto"),
});

export type ShippingSettingsFormValues = z.infer<typeof shippingSettingsSchema>;
