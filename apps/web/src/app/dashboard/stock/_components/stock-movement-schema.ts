import { z } from "zod";

export const STOCK_MOVEMENT_REASONS = [
	"entrada_compra",
	"saida_venda",
	"ajuste_inventario",
	"perda",
	"outro",
] as const;
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

const variantBranch = {
	variantId: z.string().min(1, "Variante obrigatória"),
	branchId: z.string().min(1, "Filial obrigatória"),
};

// Entrada (+N): soma estoque; fornecedor obrigatório; sem custo (ADR-0015).
export const stockEntrySchema = z.object({
	...variantBranch,
	quantity: z
		.int("Quantidade deve ser inteira")
		.min(1, "Quantidade deve ser maior que zero")
		.max(999_999, "Quantidade excede o limite permitido"),
	supplierId: z.string().min(1, "Fornecedor obrigatório na entrada"),
	note: z
		.string()
		.trim()
		.max(500, "Observação não pode exceder 500 caracteres")
		.optional(),
});
export type StockEntryInput = z.infer<typeof stockEntrySchema>;

// Baixa (−N): subtrai estoque; motivo perda|outro; sem fornecedor.
export const stockWriteOffReasons = ["perda", "outro"] as const;
export type StockWriteOffReason = (typeof stockWriteOffReasons)[number];

export const stockWriteOffSchema = z
	.object({
		...variantBranch,
		quantity: z
			.int("Quantidade deve ser inteira")
			.min(1, "Quantidade deve ser maior que zero")
			.max(999_999, "Quantidade excede o limite permitido"),
		reason: z.enum(stockWriteOffReasons),
		note: z
			.string()
			.trim()
			.max(500, "Observação não pode exceder 500 caracteres")
			.optional(),
	})
	.refine(
		(d) =>
			d.reason !== "outro" || (typeof d.note === "string" && d.note.length > 0),
		{
			path: ["note"],
			message: "Observação obrigatória quando motivo é 'Outro'",
		}
	);
export type StockWriteOffInput = z.infer<typeof stockWriteOffSchema>;

// Ajuste de inventário: quantidade-alvo (recontagem física).
export const stockRecountSchema = z.object({
	...variantBranch,
	newQty: z
		.int("Quantidade deve ser inteira")
		.min(0, "Quantidade não pode ser negativa")
		.max(999_999, "Quantidade excede o limite permitido"),
	note: z
		.string()
		.trim()
		.max(500, "Observação não pode exceder 500 caracteres")
		.optional(),
});
export type StockRecountInput = z.infer<typeof stockRecountSchema>;
