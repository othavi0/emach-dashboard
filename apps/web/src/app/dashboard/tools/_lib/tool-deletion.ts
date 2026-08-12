export interface ToolDeletionInput {
	orderCount: number;
	reviewCount: number;
	stockQty: number;
}

/**
 * Quem pode excluir, por status: rascunho nunca foi público, então quem gere o
 * catálogo (`tools.update`, admin+) pode descartá-lo; fora de rascunho a
 * exclusão segue exclusiva de `tools.delete` (super_admin, ADR-0016). Pura —
 * server (`deleteTool`) e UI (`tools/[id]/page.tsx`) aplicam a mesma regra.
 */
export function canDeleteToolByStatus(
	status: string,
	caps: { hasDelete: boolean; hasUpdate: boolean }
): boolean {
	if (caps.hasDelete) {
		return true;
	}
	return status === "draft" && caps.hasUpdate;
}

export type ToolDeletionDecision =
	| { allowed: true }
	| { allowed: false; reason: string; suggestArchive: boolean };

/**
 * Decide se uma ferramenta pode ser excluída e, se não, por quê. Pura — quem
 * chama faz o IO (`fetchToolDeletionFacts`). Server (`deleteTool`) e UI
 * (`variants-tab`) consomem esta mesma função, então a frase que o usuário lê é
 * a frase que o servidor aplica.
 *
 * Precedência: pedidos > avaliações > estoque, do imutável ao acionável — o
 * usuário vê primeiro o bloqueio que não tem saída, e só depois o que ele
 * consegue resolver sozinho.
 */
export function resolveToolDeletion({
	orderCount,
	reviewCount,
	stockQty,
}: ToolDeletionInput): ToolDeletionDecision {
	if (orderCount > 0) {
		const plural = orderCount > 1 ? "pedidos" : "pedido";
		return {
			allowed: false,
			reason: `Esta ferramenta tem ${orderCount} ${plural} e não pode ser excluída — o histórico do pedido depende dela.`,
			suggestArchive: true,
		};
	}
	if (reviewCount > 0) {
		const plural = reviewCount > 1 ? "avaliações" : "avaliação";
		return {
			allowed: false,
			reason: `Esta ferramenta tem ${reviewCount} ${plural} de cliente e não pode ser excluída.`,
			suggestArchive: true,
		};
	}
	if (stockQty > 0) {
		return {
			allowed: false,
			reason: `Esta ferramenta tem ${stockQty} un em estoque. Zere o estoque nas filiais antes de excluir.`,
			suggestArchive: true,
		};
	}
	return { allowed: true };
}
