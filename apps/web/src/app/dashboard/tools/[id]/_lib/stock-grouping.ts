import type { ToolDetailBranch, ToolStockRow } from "./tool-detail-data";

export interface VariantStockGroup {
	branches: ToolStockRow[];
	// Filiais visíveis sem stock_level pra esta variante — viram cards
	// fantasma (afford de primeira entrada). Vazio quando o usuário não
	// pode movimentar estoque.
	ghostBranches: ToolDetailBranch[];
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
}

interface VariantInfo {
	barcode: string | null;
	id: string;
	isDefault: boolean;
	sku: string;
	sortOrder: number;
	voltage: string | null;
}

/**
 * Agrupa células de estoque (variante × filial) por variante — TODAS as
 * variantes da ferramenta, mesmo sem célula (rendem só fantasmas).
 * Ordena os grupos com a variante default primeiro, depois por sortOrder.
 * `allBranches` = filiais ativas visíveis ao usuário; as sem célula na
 * variante entram em `ghostBranches`.
 */
export function groupStockByVariant(
	stockRows: ToolStockRow[],
	variants: VariantInfo[],
	allBranches: ToolDetailBranch[]
): VariantStockGroup[] {
	const byVariant = new Map<string, ToolStockRow[]>();
	for (const row of stockRows) {
		const list = byVariant.get(row.variantId);
		if (list) {
			list.push(row);
		} else {
			byVariant.set(row.variantId, [row]);
		}
	}

	const sorted = [...variants].sort((a, b) => {
		const da = a.isDefault ? 0 : 1;
		const db = b.isDefault ? 0 : 1;
		if (da !== db) {
			return da - db;
		}
		return a.sortOrder - b.sortOrder;
	});

	return sorted.map((v) => {
		const branches = byVariant.get(v.id) ?? [];
		const linked = new Set(branches.map((r) => r.branchId));
		return {
			branches,
			ghostBranches: allBranches.filter((b) => !linked.has(b.id)),
			variantId: v.id,
			variantSku: v.sku,
			variantVoltage: v.voltage,
		};
	});
}
