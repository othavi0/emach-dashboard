interface VariantSibling {
	id: string;
	sortOrder: number;
	visibleOnSite: boolean;
}

interface VariantDeletionInput {
	hasMovements: boolean;
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
 * variante reatribuir a marca `isDefault` (a visível de menor sortOrder
 * restante, porque a padrão nunca fica oculta, #441).
 * Pura — a action faz o IO (checar pedidos, deletar, reatribuir).
 */
export function resolveVariantDeletion({
	variantId,
	isDefault,
	hasOrders,
	hasMovements,
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

	// stock_movement.variant_id é ON DELETE SET NULL: excluir a variante deixaria
	// movimentos sem variante no ledger (#445).
	if (hasMovements) {
		return {
			allowed: false,
			error:
				"Esta variante tem histórico de movimentação de estoque e não pode ser excluída. Oculte-a do site.",
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

	if (!isDefault) {
		return { allowed: true, reassignDefaultTo: null };
	}

	const [nextDefault] = siblings
		.filter((s) => s.id !== variantId && s.visibleOnSite)
		.sort((a, b) => a.sortOrder - b.sortOrder);

	if (!nextDefault) {
		return {
			allowed: false,
			error:
				"Nenhuma outra variante está visível para virar a padrão. Torne outra visível no site antes de excluir esta.",
		};
	}

	return { allowed: true, reassignDefaultTo: nextDefault.id };
}
