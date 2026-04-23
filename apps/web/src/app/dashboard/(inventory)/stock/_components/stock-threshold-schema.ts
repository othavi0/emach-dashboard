import { z } from "zod";

export const stockThresholdSchema = z
	.object({
		branchId: z.string().min(1, "Filial obrigatória"),
		minQty: z
			.number()
			.int("Quantidade mínima deve ser inteira")
			.min(0, "Quantidade mínima não pode ser negativa")
			.max(999_999, "Valor excede o limite permitido"),
		reorderPoint: z
			.number()
			.int("Ponto de reposição deve ser inteiro")
			.min(0, "Ponto de reposição não pode ser negativo")
			.max(999_999, "Valor excede o limite permitido"),
		toolId: z.string().min(1, "Ferramenta obrigatória"),
	})
	.refine((data) => data.reorderPoint >= data.minQty, {
		path: ["reorderPoint"],
		message: "Ponto de reposição deve ser ≥ quantidade mínima",
	});

export type StockThresholdInput = z.infer<typeof stockThresholdSchema>;
