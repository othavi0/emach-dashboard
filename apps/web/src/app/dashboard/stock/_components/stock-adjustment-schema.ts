import { z } from "zod";

export const STOCK_MOVEMENT_REASONS = [
	"entrada_compra",
	"saida_venda",
	"ajuste_inventario",
	"perda",
	"outro",
] as const;

export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

export const stockAdjustmentSchema = z
	.object({
		variantId: z.string().min(1, "Variante obrigatória"),
		branchId: z.string().min(1, "Filial obrigatória"),
		newQty: z
			.int("Quantidade deve ser inteira")
			.min(0, "Quantidade não pode ser negativa")
			.max(999_999, "Quantidade excede o limite permitido"),
		reason: z.enum(STOCK_MOVEMENT_REASONS).optional(),
		reasonNote: z
			.string()
			.trim()
			.max(500, "Observação não pode exceder 500 caracteres")
			.optional(),
	})
	.refine(
		(data) => {
			if (data.reason === "outro") {
				return (
					typeof data.reasonNote === "string" && data.reasonNote.length > 0
				);
			}
			return true;
		},
		{
			path: ["reasonNote"],
			message: "Observação obrigatória quando motivo é 'Outro'",
		}
	)
	.refine(
		(data) => {
			if (data.reason !== "outro") {
				return data.reasonNote === undefined || data.reasonNote === "";
			}
			return true;
		},
		{
			path: ["reasonNote"],
			message: "Observação só pode ser preenchida quando motivo é 'Outro'",
		}
	);

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
