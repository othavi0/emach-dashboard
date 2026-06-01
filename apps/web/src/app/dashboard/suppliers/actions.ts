"use server";

import { db } from "@emach/db";
import { supplierAuditLog } from "@emach/db/schema/supplier-audit";
import { supplier, tool, toolVariant } from "@emach/db/schema/tools";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logUserActivity } from "@/lib/activity";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { normalizeCnpj } from "@/lib/validation/cnpj";
import {
	type SupplierFormValues,
	supplierSchema,
} from "./_components/supplier-schema";
import type { SupplierToolRow } from "./data";

const SUPPLIERS_PATH = "/dashboard/suppliers";
const TOOLS_PATH = "/dashboard/tools";

export interface SupplierListItem {
	contactEmail: string | null;
	createdAt: Date;
	id: string;
	name: string;
	phone: string | null;
	toolsCount: number;
}

export interface LinkedTool {
	id: string;
	name: string;
	sku: string | null;
	visibleOnSite: boolean;
}

export interface SupplierDetail {
	cnpj: string | null;
	contactEmail: string | null;
	createdAt: Date;
	id: string;
	name: string;
	notes: string | null;
	phone: string | null;
	tools: LinkedTool[];
	updatedAt: Date;
	website: string | null;
}

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

export type SuppliersSort = "newest" | "name";

export interface SuppliersFiltersInput {
	search?: string;
	sort: SuppliersSort;
}

function normalizePayload(input: SupplierFormValues) {
	const contactEmail = input.contactEmail?.trim();
	const phone = input.phone?.trim();
	const website = input.website?.trim();
	const cnpjDigits = input.cnpj ? normalizeCnpj(input.cnpj) : "";
	const notes = input.notes?.trim();

	return {
		name: input.name,
		contactEmail: contactEmail ? contactEmail : null,
		phone: phone ? phone : null,
		website: website ? website : null,
		cnpj: cnpjDigits ? cnpjDigits : null,
		notes: notes ? notes : null,
	};
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro inesperado";
}

export async function listSuppliers(params?: {
	search?: string;
}): Promise<SupplierListItem[]> {
	await requireCurrentSession();

	const search = params?.search?.trim();
	const rows = await db
		.select({
			id: supplier.id,
			name: supplier.name,
			contactEmail: supplier.contactEmail,
			phone: supplier.phone,
			createdAt: supplier.createdAt,
			toolsCount: sql<number>`count(${tool.id})::int`,
		})
		.from(supplier)
		.leftJoin(tool, eq(tool.supplierId, supplier.id))
		.where(
			search
				? or(
						ilike(supplier.name, `%${search}%`),
						ilike(supplier.contactEmail, `%${search}%`),
						ilike(supplier.phone, `%${search}%`)
					)
				: undefined
		)
		.groupBy(
			supplier.id,
			supplier.name,
			supplier.contactEmail,
			supplier.phone,
			supplier.createdAt
		)
		.orderBy(asc(supplier.name));

	return rows.map((row) => ({
		...row,
		toolsCount: Number(row.toolsCount ?? 0),
	}));
}

type SupplierBaseRow = typeof supplier.$inferSelect;

export async function fetchSuppliersPage({
	filters,
	cursor,
}: {
	filters: SuppliersFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<SupplierBaseRow>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const conditions: ReturnType<typeof sql>[] = [];

	if (filters.search) {
		const pattern = `%${filters.search}%`;
		conditions.push(
			sql`(${supplier.name} ILIKE ${pattern} OR ${supplier.contactEmail} ILIKE ${pattern} OR ${supplier.phone} ILIKE ${pattern})`
		);
	}

	if (decoded) {
		if (filters.sort === "newest" && decoded.sort === "newest") {
			conditions.push(
				sql`(${supplier.createdAt}, ${supplier.id}) < (${decoded.createdAt}::timestamp, ${decoded.id})`
			);
		} else if (filters.sort === "name" && decoded.sort === "name") {
			conditions.push(
				sql`(${supplier.name}, ${supplier.id}) > (${decoded.name}, ${decoded.id})`
			);
		}
	}

	const whereExpr =
		conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;
	const orderExprs =
		filters.sort === "name"
			? [asc(supplier.name), asc(supplier.id)]
			: [desc(supplier.createdAt), desc(supplier.id)];

	const rows = await db
		.select()
		.from(supplier)
		.where(whereExpr)
		.orderBy(...orderExprs)
		.limit(BATCH_SIZE + 1);

	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const last = items.at(-1);
	let nextCursor: string | null = null;
	if (hasMore && last) {
		nextCursor =
			filters.sort === "name"
				? encodeCursor({ v: 1, sort: "name", name: last.name, id: last.id })
				: encodeCursor({
						v: 1,
						sort: "newest",
						createdAt: last.createdAt.toISOString(),
						id: last.id,
					});
	}
	return { items, nextCursor };
}

export async function fetchSuppliersTablePage({
	filters,
	cursor,
}: {
	filters: SuppliersFiltersInput;
	cursor: string | null;
}) {
	const { getSupplierTableAggregates } = await import("./data");
	const page = await fetchSuppliersPage({ filters, cursor });
	if (page.items.length === 0) {
		return { items: [], nextCursor: null };
	}
	const ids = page.items.map((s) => s.id);
	const aggregates = await getSupplierTableAggregates(ids);
	const items = page.items.map((s) => {
		const agg = aggregates.get(s.id) ?? { toolsTotal: 0, toolsActive: 0 };
		return {
			id: s.id,
			name: s.name,
			status: s.status,
			contactEmail: s.contactEmail,
			phone: s.phone,
			createdAt: s.createdAt,
			toolsTotal: agg.toolsTotal,
			toolsActive: agg.toolsActive,
		};
	});
	return { items, nextCursor: page.nextCursor };
}

export async function getSupplier(id: string): Promise<SupplierDetail | null> {
	await requireCurrentSession();

	const [row] = await db
		.select()
		.from(supplier)
		.where(eq(supplier.id, id))
		.limit(1);

	if (!row) {
		return null;
	}

	const linkedTools = await db
		.select({
			id: tool.id,
			name: tool.name,
			sku: toolVariant.sku,
			visibleOnSite: tool.visibleOnSite,
		})
		.from(tool)
		.leftJoin(
			toolVariant,
			and(eq(toolVariant.toolId, tool.id), eq(toolVariant.isDefault, true))
		)
		.where(eq(tool.supplierId, id))
		.orderBy(asc(tool.name));

	return {
		...row,
		tools: linkedTools,
	};
}

export async function createSupplier(
	input: SupplierFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("suppliers.manage");

	const parsed = supplierSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}

	const id = crypto.randomUUID();
	const payload = normalizePayload(parsed.data);

	try {
		await db.insert(supplier).values({ id, ...payload });
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	await db.insert(supplierAuditLog).values({
		id: crypto.randomUUID(),
		supplierId: id,
		actorType: "user",
		actorUserId: session.user.id,
		action: "created",
		afterJson: payload,
	});

	await logUserActivity({
		actorUserId: session.user.id,
		action: "supplier.created",
		targetId: id,
		targetType: "supplier",
		metadata: { name: payload.name },
	});
	revalidatePath(SUPPLIERS_PATH);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: { id } };
}

export async function updateSupplier(
	id: string,
	input: SupplierFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("suppliers.manage");

	const parsed = supplierSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}

	const payload = normalizePayload(parsed.data);

	const [before] = await db
		.select({
			name: supplier.name,
			contactEmail: supplier.contactEmail,
			phone: supplier.phone,
			website: supplier.website,
			cnpj: supplier.cnpj,
			notes: supplier.notes,
		})
		.from(supplier)
		.where(eq(supplier.id, id))
		.limit(1);

	if (!before) {
		return { ok: false, error: "Fornecedor não encontrado" };
	}

	try {
		await db.update(supplier).set(payload).where(eq(supplier.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	await db.insert(supplierAuditLog).values({
		id: crypto.randomUUID(),
		supplierId: id,
		actorType: "user",
		actorUserId: session.user.id,
		action: "profile_updated",
		beforeJson: before,
		afterJson: payload,
	});

	await logUserActivity({
		actorUserId: session.user.id,
		action: "supplier.updated",
		targetId: id,
		targetType: "supplier",
		metadata: { name: payload.name },
	});
	revalidatePath(SUPPLIERS_PATH);
	revalidatePath(`${SUPPLIERS_PATH}/${id}`);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: { id } };
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
	const session = await requireCapability("suppliers.manage");

	const [counts] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(tool)
		.where(eq(tool.supplierId, id));

	if ((counts?.n ?? 0) > 0) {
		return {
			ok: false,
			error: `Fornecedor tem ${counts?.n} ferramenta(s) vinculada(s). Mova ou exclua antes.`,
		};
	}

	const [snapshot] = await db
		.select({
			name: supplier.name,
			contactEmail: supplier.contactEmail,
			phone: supplier.phone,
			website: supplier.website,
			cnpj: supplier.cnpj,
			notes: supplier.notes,
		})
		.from(supplier)
		.where(eq(supplier.id, id))
		.limit(1);

	if (!snapshot) {
		return { ok: false, error: "Fornecedor não encontrado" };
	}

	try {
		await db.delete(supplier).where(eq(supplier.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	await db.insert(supplierAuditLog).values({
		id: crypto.randomUUID(),
		supplierId: id,
		actorType: "user",
		actorUserId: session.user.id,
		action: "deleted",
		beforeJson: snapshot,
	});

	await logUserActivity({
		actorUserId: session.user.id,
		action: "supplier.deleted",
		targetId: id,
		targetType: "supplier",
		metadata: { name: snapshot.name },
	});
	revalidatePath(SUPPLIERS_PATH);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: undefined };
}

export async function fetchSupplierToolsPage({
	supplierId,
	search,
	cursor,
}: {
	supplierId: string;
	search?: string;
	cursor: string | null;
}): Promise<InfiniteResult<SupplierToolRow>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const conditions = [eq(tool.supplierId, supplierId)];

	if (search?.trim()) {
		const pattern = `%${search.trim()}%`;
		conditions.push(
			sql`(${tool.name} ILIKE ${pattern} OR ${tool.slug} ILIKE ${pattern})`
		);
	}
	if (decoded && decoded.sort === "newest") {
		conditions.push(
			sql`(${tool.createdAt}, ${tool.id}) < (${decoded.createdAt}::timestamp, ${decoded.id})`
		);
	}

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
		.where(and(...conditions))
		.orderBy(desc(tool.createdAt), desc(tool.id))
		.limit(BATCH_SIZE + 1);

	const hasMore = rows.length > BATCH_SIZE;
	const items = (
		hasMore ? rows.slice(0, BATCH_SIZE) : rows
	) as SupplierToolRow[];
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;
	return { items, nextCursor };
}
