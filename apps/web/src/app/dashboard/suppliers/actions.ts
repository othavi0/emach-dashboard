"use server";

import { db } from "@emach/db";
import { supplier, tool, toolVariant } from "@emach/db/schema/tools";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logUserActivity } from "@/lib/activity";
import { requireCapability } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import {
	type SupplierFormValues,
	supplierSchema,
} from "./_components/supplier-schema";

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
	contactEmail: string | null;
	createdAt: Date;
	id: string;
	name: string;
	notes: string | null;
	phone: string | null;
	tools: LinkedTool[];
	updatedAt: Date;
}

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function normalizePayload(input: SupplierFormValues) {
	const contactEmail = input.contactEmail?.trim();
	const phone = input.phone?.trim();
	const notes = input.notes?.trim();

	return {
		name: input.name,
		contactEmail: contactEmail ? contactEmail : null,
		phone: phone ? phone : null,
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

	try {
		await db.update(supplier).set(payload).where(eq(supplier.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "supplier.updated",
		targetId: id,
		targetType: "supplier",
		metadata: { name: payload.name },
	});
	revalidatePath(SUPPLIERS_PATH);
	revalidatePath(`${SUPPLIERS_PATH}/${id}`);
	revalidatePath(`${SUPPLIERS_PATH}/${id}/edit`);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: { id } };
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
	const session = await requireCapability("suppliers.manage");

	const [supplierRow] = await db
		.select({ name: supplier.name })
		.from(supplier)
		.where(eq(supplier.id, id))
		.limit(1);

	try {
		await db.transaction(async (tx) => {
			await tx
				.update(tool)
				.set({ supplierId: null })
				.where(eq(tool.supplierId, id));
			await tx.delete(supplier).where(eq(supplier.id, id));
		});
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "supplier.deleted",
		targetId: id,
		targetType: "supplier",
		metadata: { name: supplierRow?.name },
	});
	revalidatePath(SUPPLIERS_PATH);
	revalidatePath(TOOLS_PATH);
	return { ok: true, data: undefined };
}
