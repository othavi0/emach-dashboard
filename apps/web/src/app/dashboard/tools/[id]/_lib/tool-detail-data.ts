import { db } from "@emach/db";
import type { AttributeOptions } from "@emach/db/schema/attributes";
import {
	attributeDefinition,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { category, toolCategory } from "@emach/db/schema/categories";
import { branch, stockLevel } from "@emach/db/schema/inventory";
import { orderItem } from "@emach/db/schema/orders";
import { tool, toolImage, toolVariant } from "@emach/db/schema/tools";
import { and, asc, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { getUserBranchScope } from "@/lib/branch-scope";
import { requireCapability } from "@/lib/permissions";

export type ToolDetailRow = typeof tool.$inferSelect;

export interface ToolDetailCategory {
	categoryId: string;
	categoryName: string;
	isPrimary: boolean;
}

export interface ToolDetailImage {
	id: string;
	url: string;
}

export type ToolDetailVariant = typeof toolVariant.$inferSelect;

export interface ToolDetailAttribute {
	inputType: string;
	label: string;
	options: AttributeOptions | null;
	slug: string;
	sortOrder: number;
	sourceCategoryDepth: number;
	sourceCategoryId: string;
	sourceCategoryName: string;
	unit: string | null;
	valueBool: boolean | null;
	valueNumeric: number | null;
	valueNumericMax: number | null;
	valueText: string | null;
}

export interface ToolStockRow {
	branchCity: string | null;
	branchId: string;
	branchName: string;
	branchState: string | null;
	minQty: number;
	quantity: number;
	reorderPoint: number;
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
}

export interface ToolStockAlert {
	branchId: string;
	branchName: string;
	level: "critical" | "reorder";
	quantity: number;
	reorderPoint: number;
	variantSku: string;
	variantVoltage: string | null;
}

export interface ToolStockSummary {
	alerts: ToolStockAlert[];
	branchCount: number;
	criticalCount: number;
	reorderCount: number;
	totalStock: number;
}

export interface ToolDetail {
	attributes: ToolDetailAttribute[];
	categories: ToolDetailCategory[];
	images: ToolDetailImage[];
	orderedVariantIds: string[];
	stockRows: ToolStockRow[];
	stockSummary: ToolStockSummary;
	tool: ToolDetailRow;
	variants: ToolDetailVariant[];
}

export const getToolDetail = cache(
	async (id: string): Promise<ToolDetail | null> => {
		const session = await requireCapability("tools.read");
		const scope = await getUserBranchScope(session);

		const [row] = await db.select({ tool }).from(tool).where(eq(tool.id, id));

		if (!row) {
			return null;
		}

		// Condição de scope para stock_level: super_admin vê todas as filiais.
		const stockScopeCondition =
			scope.kind === "scoped" && scope.branchIds.length > 0
				? inArray(stockLevel.branchId, scope.branchIds)
				: undefined;

		const [categories, images, variants, attributes, stockRows, orderedRows] =
			await Promise.all([
				db
					.select({
						categoryId: category.id,
						categoryName: category.name,
						isPrimary: toolCategory.isPrimary,
					})
					.from(toolCategory)
					.innerJoin(category, eq(toolCategory.categoryId, category.id))
					.where(eq(toolCategory.toolId, id))
					.orderBy(asc(toolCategory.isPrimary)),
				db
					.select({ id: toolImage.id, url: toolImage.url })
					.from(toolImage)
					.where(eq(toolImage.toolId, id))
					.orderBy(asc(toolImage.sortOrder)),
				db
					.select()
					.from(toolVariant)
					.where(eq(toolVariant.toolId, id))
					.orderBy(asc(toolVariant.sortOrder)),
				db
					.select({
						slug: attributeDefinition.slug,
						label: attributeDefinition.label,
						inputType: attributeDefinition.inputType,
						unit: attributeDefinition.unit,
						options: attributeDefinition.options,
						sortOrder: attributeDefinition.sortOrder,
						sourceCategoryId: attributeDefinition.categoryId,
						sourceCategoryName: category.name,
						sourceCategoryDepth: category.depth,
						valueText: toolAttributeValue.valueText,
						valueNumeric: toolAttributeValue.valueNumeric,
						valueNumericMax: toolAttributeValue.valueNumericMax,
						valueBool: toolAttributeValue.valueBool,
					})
					.from(toolAttributeValue)
					.innerJoin(
						attributeDefinition,
						eq(toolAttributeValue.attributeId, attributeDefinition.id)
					)
					.innerJoin(category, eq(attributeDefinition.categoryId, category.id))
					.where(eq(toolAttributeValue.toolId, id)),
				db
					.select({
						variantId: toolVariant.id,
						variantSku: toolVariant.sku,
						variantVoltage: toolVariant.voltage,
						branchId: branch.id,
						branchName: branch.name,
						branchCity: branch.city,
						branchState: branch.state,
						quantity: stockLevel.quantity,
						minQty: stockLevel.minQty,
						reorderPoint: stockLevel.reorderPoint,
					})
					.from(stockLevel)
					.innerJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
					.innerJoin(branch, eq(branch.id, stockLevel.branchId))
					.where(
						stockScopeCondition
							? and(eq(toolVariant.toolId, id), stockScopeCondition)
							: eq(toolVariant.toolId, id)
					)
					.orderBy(asc(branch.name), asc(toolVariant.sortOrder)),
				db
					.selectDistinct({ variantId: orderItem.variantId })
					.from(orderItem)
					.innerJoin(toolVariant, eq(toolVariant.id, orderItem.variantId))
					.where(eq(toolVariant.toolId, id)),
			]);

		const stockSummary = computeStockSummary(stockRows);

		return {
			tool: row.tool,
			categories,
			images,
			orderedVariantIds: orderedRows.map((r) => r.variantId),
			variants,
			attributes: attributes.map((a) => ({
				...a,
				valueNumeric: a.valueNumeric === null ? null : Number(a.valueNumeric),
				valueNumericMax:
					a.valueNumericMax === null ? null : Number(a.valueNumericMax),
			})),
			stockRows,
			stockSummary,
		};
	}
);

function computeStockSummary(rows: ToolStockRow[]): ToolStockSummary {
	const branchIds = new Set<string>();
	const alerts: ToolStockAlert[] = [];
	let totalStock = 0;

	for (const r of rows) {
		totalStock += r.quantity;
		branchIds.add(r.branchId);

		if (r.reorderPoint > 0 && r.quantity <= r.reorderPoint) {
			const isCritical = r.minQty > 0 && r.quantity <= r.minQty;
			alerts.push({
				branchId: r.branchId,
				branchName: r.branchName,
				variantSku: r.variantSku,
				variantVoltage: r.variantVoltage,
				quantity: r.quantity,
				reorderPoint: r.reorderPoint,
				level: isCritical ? "critical" : "reorder",
			});
		}
	}

	const criticalCount = alerts.filter((a) => a.level === "critical").length;
	const reorderCount = alerts.filter((a) => a.level === "reorder").length;

	return {
		totalStock,
		branchCount: branchIds.size,
		criticalCount,
		reorderCount,
		alerts,
	};
}
