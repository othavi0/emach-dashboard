"use server";

import { db } from "@emach/db";
import { supplierAuditLog } from "@emach/db/schema/supplier-audit";
import { supplier } from "@emach/db/schema/tools";
import { asc, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { getUserBranchScope } from "@/lib/branch-scope";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import { normalizeCnpj } from "@/lib/validation/cnpj";
import {
	type SupplierFormValues,
	supplierSchema,
} from "./_components/supplier-schema";
import type { SupplierStockToolRow } from "./data";

const SUPPLIERS_PATH = "/dashboard/suppliers";
const TOOLS_PATH = "/dashboard/tools";

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
				sql`(${supplier.createdAt}, ${supplier.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
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

export async function createSupplier(
	input: SupplierFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("suppliers.manage");

	const parsed = supplierSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: actionErrorMessage(parsed.error) };
	}

	const id = crypto.randomUUID();
	const payload = normalizePayload(parsed.data);

	try {
		await db.insert(supplier).values({ id, ...payload });
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
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
		return { ok: false, error: actionErrorMessage(parsed.error) };
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
		return { ok: false, error: actionErrorMessage(error) };
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

async function setSupplierStatus(
	id: string,
	next: "active" | "archived",
	action: "archived" | "restored"
): Promise<ActionResult> {
	const session = await requireCapability("suppliers.manage");

	const [before] = await db
		.select({ name: supplier.name, status: supplier.status })
		.from(supplier)
		.where(eq(supplier.id, id))
		.limit(1);

	if (!before) {
		return { ok: false, error: "Fornecedor não encontrado" };
	}

	try {
		await db.update(supplier).set({ status: next }).where(eq(supplier.id, id));
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}

	await db.insert(supplierAuditLog).values({
		id: crypto.randomUUID(),
		supplierId: id,
		actorType: "user",
		actorUserId: session.user.id,
		action,
		beforeJson: { status: before.status },
		afterJson: { status: next },
	});

	await logUserActivity({
		actorUserId: session.user.id,
		action: action === "archived" ? "supplier.archived" : "supplier.restored",
		targetId: id,
		targetType: "supplier",
		metadata: { name: before.name },
	});
	revalidatePath(SUPPLIERS_PATH);
	revalidatePath(`${SUPPLIERS_PATH}/${id}`);
	return { ok: true, data: undefined };
}

export async function archiveSupplier(id: string): Promise<ActionResult> {
	return await setSupplierStatus(id, "archived", "archived");
}

export async function restoreSupplier(id: string): Promise<ActionResult> {
	return await setSupplierStatus(id, "active", "restored");
}

export async function fetchSupplierStockPage({
	supplierId,
	search,
	cursor,
}: {
	supplierId: string;
	search?: string;
	cursor: string | null;
}): Promise<InfiniteResult<SupplierStockToolRow>> {
	const session = await requireCapability("stock.read");
	const scope = await getUserBranchScope(session);
	const { getSupplierStockTools } = await import("./data");
	return await getSupplierStockTools({ supplierId, search, cursor, scope });
}
