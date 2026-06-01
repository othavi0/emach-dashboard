import "server-only";

import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { toolCategory } from "@emach/db/schema/categories";
import { supplierAuditLog } from "@emach/db/schema/supplier-audit";
import { supplier, tool } from "@emach/db/schema/tools";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

export interface SupplierDetail {
	cnpj: string | null;
	contactEmail: string | null;
	createdAt: Date;
	id: string;
	name: string;
	notes: string | null;
	phone: string | null;
	status: "active" | "archived";
	toolsActive: number;
	toolsInactive: number;
	toolsTotal: number;
	updatedAt: Date;
	website: string | null;
}

export async function getSupplierDetail(
	id: string
): Promise<SupplierDetail | null> {
	const [base] = await db
		.select()
		.from(supplier)
		.where(eq(supplier.id, id))
		.limit(1);
	if (!base) {
		return null;
	}
	const [counts] = await db
		.select({
			total: sql<number>`count(*)::int`,
			active: sql<number>`count(*) filter (where ${tool.status} = 'active')::int`,
			inactive: sql<number>`count(*) filter (where ${tool.status} <> 'active')::int`,
		})
		.from(tool)
		.where(eq(tool.supplierId, id));
	return {
		id: base.id,
		name: base.name,
		status: base.status,
		contactEmail: base.contactEmail,
		phone: base.phone,
		website: base.website,
		cnpj: base.cnpj,
		notes: base.notes,
		createdAt: base.createdAt,
		updatedAt: base.updatedAt,
		toolsTotal: counts?.total ?? 0,
		toolsActive: counts?.active ?? 0,
		toolsInactive: counts?.inactive ?? 0,
	};
}

export interface SupplierDetailKpis {
	activeTools: number;
	categoriesCovered: number;
	inactiveTools: number;
	lastToolAddedAt: Date | null;
}

export async function getSupplierDetailKpis(
	supplierId: string
): Promise<SupplierDetailKpis> {
	const [counts] = await db
		.select({
			active: sql<number>`count(*) filter (where ${tool.status} = 'active')::int`,
			inactive: sql<number>`count(*) filter (where ${tool.status} <> 'active')::int`,
			last: sql<Date | null>`max(${tool.createdAt})`,
		})
		.from(tool)
		.where(eq(tool.supplierId, supplierId));
	const [cats] = await db
		.select({ n: sql<number>`count(distinct ${toolCategory.categoryId})::int` })
		.from(tool)
		.innerJoin(toolCategory, eq(toolCategory.toolId, tool.id))
		.where(eq(tool.supplierId, supplierId));
	return {
		activeTools: counts?.active ?? 0,
		inactiveTools: counts?.inactive ?? 0,
		lastToolAddedAt: counts?.last ?? null,
		categoriesCovered: cats?.n ?? 0,
	};
}

export interface SupplierToolRow {
	createdAt: Date;
	defaultSku: string | null;
	id: string;
	name: string;
	slug: string;
	status: "draft" | "active" | "discontinued";
}

export async function getSupplierTools(
	supplierId: string,
	search: string
): Promise<SupplierToolRow[]> {
	const pattern = `%${search}%`;
	const rows = await db
		.select({
			id: tool.id,
			name: tool.name,
			slug: tool.slug,
			status: tool.status,
			defaultSku: sql<
				string | null
			>`(select sku from tool_variant where tool_id = ${tool.id} and is_default = true limit 1)`,
			createdAt: tool.createdAt,
		})
		.from(tool)
		.where(
			search
				? and(
						eq(tool.supplierId, supplierId),
						or(ilike(tool.name, pattern), ilike(tool.slug, pattern))
					)
				: eq(tool.supplierId, supplierId)
		)
		.orderBy(desc(tool.createdAt))
		.limit(100);
	return rows as SupplierToolRow[];
}

export interface SupplierAuditRow {
	action: string;
	actorName: string | null;
	afterJson: Record<string, unknown> | null;
	beforeJson: Record<string, unknown> | null;
	createdAt: Date;
	id: string;
	reason: string | null;
}

export async function getSupplierAuditLog(
	supplierId: string,
	limit = 50
): Promise<SupplierAuditRow[]> {
	const rows = await db
		.select({
			id: supplierAuditLog.id,
			action: supplierAuditLog.action,
			actorName: userTable.name,
			beforeJson: supplierAuditLog.beforeJson,
			afterJson: supplierAuditLog.afterJson,
			reason: supplierAuditLog.reason,
			createdAt: supplierAuditLog.createdAt,
		})
		.from(supplierAuditLog)
		.leftJoin(userTable, eq(userTable.id, supplierAuditLog.actorUserId))
		.where(eq(supplierAuditLog.supplierId, supplierId))
		.orderBy(desc(supplierAuditLog.createdAt))
		.limit(limit);
	return rows as SupplierAuditRow[];
}

export interface SupplierTableRow {
	contactEmail: string | null;
	createdAt: Date;
	id: string;
	name: string;
	phone: string | null;
	status: "active" | "archived";
	toolsActive: number;
	toolsTotal: number;
}

export async function getSupplierTableAggregates(
	supplierIds: string[]
): Promise<Map<string, { toolsTotal: number; toolsActive: number }>> {
	if (supplierIds.length === 0) {
		return new Map();
	}
	const rows = await db
		.select({
			supplierId: tool.supplierId,
			total: sql<number>`count(*)::int`,
			active: sql<number>`count(*) filter (where ${tool.status} = 'active')::int`,
		})
		.from(tool)
		.where(inArray(tool.supplierId, supplierIds))
		.groupBy(tool.supplierId);
	const map = new Map<string, { toolsTotal: number; toolsActive: number }>();
	for (const id of supplierIds) {
		map.set(id, { toolsTotal: 0, toolsActive: 0 });
	}
	for (const r of rows) {
		if (r.supplierId) {
			map.set(r.supplierId, { toolsTotal: r.total, toolsActive: r.active });
		}
	}
	return map;
}
