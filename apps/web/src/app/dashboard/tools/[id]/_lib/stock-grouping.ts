import type { ToolStockRow } from "./tool-detail-data";

export interface VariantStockGroup {
	branches: ToolStockRow[];
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
}

interface VariantOrderInfo {
	id: string;
	isDefault: boolean;
	sortOrder: number;
}

/**
 * Agrupa células de estoque (variante × filial) por variante.
 * Ordena os grupos com a variante default primeiro, depois por sortOrder.
 * Variantes sem nenhuma célula são omitidas. SKU/voltagem vêm da própria célula.
 */
export function groupStockByVariant(
	stockRows: ToolStockRow[],
	variantOrder: VariantOrderInfo[]
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

	const rank = new Map(variantOrder.map((v) => [v.id, v]));
	const groups: VariantStockGroup[] = [];
	for (const [variantId, branches] of byVariant) {
		const first = branches[0];
		if (!first) {
			continue;
		}
		groups.push({
			branches,
			variantId,
			variantSku: first.variantSku,
			variantVoltage: first.variantVoltage,
		});
	}

	groups.sort((a, b) => {
		const va = rank.get(a.variantId);
		const vb = rank.get(b.variantId);
		const da = va?.isDefault ? 0 : 1;
		const db = vb?.isDefault ? 0 : 1;
		if (da !== db) {
			return da - db;
		}
		return (va?.sortOrder ?? 0) - (vb?.sortOrder ?? 0);
	});

	return groups;
}
