// packages/db/scripts/seed/context.ts
import type { db } from "../../src/index";

// Tipo da transação Drizzle — inferido diretamente do singleton `db`
// para garantir que case com o que `db.transaction(async (tx) => …)` entrega.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SeedContext {
	attributeIdBySlug: Record<string, string>;
	branchIds: string[];
	categoryIdBySlug: Record<string, string>;
	clientIds: string[];
	defaultVariantByTool: Record<string, string>;
	orderIds: string[];
	primaryCategoryByTool: Record<string, string>;
	staffUserIds: string[]; // staff existentes — lidos, nunca criados
	supplierIds: string[];
	toolIds: string[];
	variantIdsByTool: Record<string, string[]>;
}

export function emptyContext(staffUserIds: string[]): SeedContext {
	return {
		staffUserIds,
		branchIds: [],
		supplierIds: [],
		categoryIdBySlug: {},
		attributeIdBySlug: {},
		toolIds: [],
		variantIdsByTool: {},
		defaultVariantByTool: {},
		primaryCategoryByTool: {},
		clientIds: [],
		orderIds: [],
	};
}
