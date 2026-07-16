interface VariantSibling {
	id: string;
	sortOrder: number;
}

interface VariantDeletionInput {
	hasOrders: boolean;
	isDefault: boolean;
	siblings: VariantSibling[];
	stockQty: number;
	variantId: string;
}

export type VariantDeletionDecision =
	| { allowed: false; error: string }
	| { allowed: true; reassignDefaultTo: string | null };

/**
 * Decide se uma variante pode ser excluída e, se for a padrão, para qual
 * variante reatribuir a marca `isDefault` (a de menor sortOrder restante).
 * Pura — a action faz o IO (checar pedidos, deletar, reatribuir).
 */
export function resolveVariantDeletion({
	variantId,
	isDefault,
	hasOrders,
	siblings,
	stockQty,
}: VariantDeletionInput): VariantDeletionDecision {
	if (hasOrders) {
		return {
			allowed: false,
			error:
				"Esta variante tem pedidos e não pode ser excluída. Oculte-a do site.",
		};
	}
	if (stockQty > 0) {
		return {
			allowed: false,
			error: `Esta variante tem ${stockQty} un em estoque. Zere o estoque nas filiais antes de excluir.`,
		};
	}
	if (siblings.length <= 1) {
		return {
			allowed: false,
			error: "A ferramenta precisa de ao menos uma variante.",
		};
	}
	let reassignDefaultTo: string | null = null;
	if (isDefault) {
		const remaining = siblings
			.filter((s) => s.id !== variantId)
			.sort((a, b) => a.sortOrder - b.sortOrder);
		reassignDefaultTo = remaining[0]?.id ?? null;
	}
	return { allowed: true, reassignDefaultTo };
}
