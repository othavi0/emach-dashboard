"use server";

import { db } from "@emach/db";
import { promotion, promotionTool } from "@emach/db/schema/promotions";
import { tool } from "@emach/db/schema/tools";
import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/session";
import {
	type PromotionFormValues,
	promotionSchema,
} from "./_components/promotion-schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROMOTIONS_PATH = "/dashboard/promotions";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

export interface PromotionToolItem {
	id: string;
	name: string;
}

export interface PromotionListItem {
	active: boolean;
	code: string | null;
	createdAt: Date;
	description: string | null;
	discountPct: string;
	endsAt: Date | null;
	id: string;
	startsAt: Date | null;
	title: string;
	tools: PromotionToolItem[];
	type: string;
}

export interface PromotionDetail extends PromotionListItem {
	toolIds: string[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function dbErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro desconhecido";
}

// ---------------------------------------------------------------------------
// listPromotions — no auth required, readable by any authenticated user
// ---------------------------------------------------------------------------

export interface ListPromotionsOptions {
	search?: string;
	type?: "promotion" | "promocode" | "all";
}

export async function listPromotions(
	options: ListPromotionsOptions = {}
): Promise<PromotionListItem[]> {
	const { type = "all", search } = options;

	const rows = await db.query.promotion.findMany({
		where: (p, { and: qAnd, eq: qEq, or: qOr, ilike: qIlike }) => {
			const filters: (ReturnType<typeof qEq> | ReturnType<typeof qIlike>)[] =
				[];

			if (type !== "all") {
				filters.push(qEq(p.type, type));
			}

			if (search && search.trim() !== "") {
				const term = `%${search.trim()}%`;
				filters.push(
					qOr(qIlike(p.title, term), qIlike(p.code as never, term)) as never
				);
			}

			return filters.length > 0 ? qAnd(...(filters as [never])) : undefined;
		},
		orderBy: (p, { desc: qDesc, asc: qAsc }) => [
			qDesc(p.createdAt),
			qAsc(p.id),
		],
		with: {
			promotionTools: {
				with: {
					tool: {
						columns: { id: true, name: true },
					},
				},
			},
		},
	});

	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		description: row.description,
		type: row.type,
		code: row.code,
		discountPct: row.discountPct,
		active: row.active,
		startsAt: row.startsAt,
		endsAt: row.endsAt,
		createdAt: row.createdAt,
		tools: row.promotionTools.map((pt) => ({
			id: pt.tool.id,
			name: pt.tool.name,
		})),
	}));
}

// ---------------------------------------------------------------------------
// getPromotion — no auth required
// ---------------------------------------------------------------------------

export async function getPromotion(
	id: string
): Promise<PromotionDetail | null> {
	const row = await db.query.promotion.findFirst({
		where: (p, { eq: qEq }) => qEq(p.id, id),
		with: {
			promotionTools: {
				with: {
					tool: {
						columns: { id: true, name: true },
					},
				},
			},
		},
	});

	if (!row) {
		return null;
	}

	const tools = row.promotionTools.map((pt) => ({
		id: pt.tool.id,
		name: pt.tool.name,
	}));

	return {
		id: row.id,
		title: row.title,
		description: row.description,
		type: row.type,
		code: row.code,
		discountPct: row.discountPct,
		active: row.active,
		startsAt: row.startsAt,
		endsAt: row.endsAt,
		createdAt: row.createdAt,
		tools,
		toolIds: tools.map((t) => t.id),
	};
}

// ---------------------------------------------------------------------------
// createPromotion — requires admin
// ---------------------------------------------------------------------------

export async function createPromotion(
	input: PromotionFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireRole("admin");

	// Step 1: Validate
	const parsed = promotionSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const data = parsed.data;

	// Step 2: Title-per-type uniqueness
	const titleConflict = await db.query.promotion.findFirst({
		where: (p, { and: qAnd, eq: qEq }) =>
			qAnd(qEq(p.type, data.type), qEq(p.title, data.title)),
	});
	if (titleConflict) {
		return {
			ok: false,
			error: "Já existe promoção/código com este título",
		};
	}

	// Step 3: Code uniqueness (only for promocode)
	if (data.type === "promocode" && data.code) {
		const codeConflict = await db.query.promotion.findFirst({
			where: (p, { eq: qEq }) => qEq(p.code, data.code as string),
		});
		if (codeConflict) {
			return { ok: false, error: "Código já está em uso" };
		}
	}

	// Step 4: Stacking guard (only for promotion type)
	if (data.type === "promotion" && data.toolIds.length > 0) {
		const now = new Date();
		const overlapping = await db
			.select({
				promotionId: promotionTool.promotionId,
				toolId: promotionTool.toolId,
				toolName: tool.name,
			})
			.from(promotion)
			.innerJoin(promotionTool, eq(promotion.id, promotionTool.promotionId))
			.innerJoin(tool, eq(promotionTool.toolId, tool.id))
			.where(
				and(
					eq(promotion.type, "promotion"),
					eq(promotion.active, true),
					or(isNull(promotion.startsAt), lte(promotion.startsAt, now)),
					or(isNull(promotion.endsAt), gte(promotion.endsAt, now)),
					inArray(promotionTool.toolId, data.toolIds)
				)
			)
			.limit(1);

		if (overlapping.length > 0 && overlapping[0]) {
			return {
				ok: false,
				error: `Já existe promoção ativa para a ferramenta ${overlapping[0].toolName}`,
			};
		}
	}

	// Step 5: Generate id and insert in transaction
	const newId = crypto.randomUUID();

	try {
		await db.transaction(async (tx) => {
			await tx.insert(promotion).values({
				id: newId,
				title: data.title,
				description: data.description ?? null,
				type: data.type,
				code: data.type === "promocode" ? (data.code ?? null) : null,
				discountPct: String(data.discountPct),
				active: data.active,
				startsAt: data.startsAt ?? null,
				endsAt: data.endsAt ?? null,
			});

			if (data.toolIds.length > 0) {
				await tx.insert(promotionTool).values(
					data.toolIds.map((toolId) => ({
						promotionId: newId,
						toolId,
					}))
				);
			}
		});
	} catch (error) {
		return { ok: false, error: dbErrorMessage(error) };
	}

	revalidatePath(PROMOTIONS_PATH);
	return { ok: true, data: { id: newId } };
}

// ---------------------------------------------------------------------------
// updatePromotion — requires admin
// ---------------------------------------------------------------------------

export async function updatePromotion(
	id: string,
	input: PromotionFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireRole("admin");

	// Step 1: Validate
	const parsed = promotionSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const data = parsed.data;

	// Step 2: Title-per-type uniqueness (exclude self)
	const titleConflict = await db.query.promotion.findFirst({
		where: (p, { and: qAnd, eq: qEq, ne: qNe }) =>
			qAnd(qEq(p.type, data.type), qEq(p.title, data.title), qNe(p.id, id)),
	});
	if (titleConflict) {
		return {
			ok: false,
			error: "Já existe promoção/código com este título",
		};
	}

	// Step 3: Code uniqueness excluding self (only for promocode)
	if (data.type === "promocode" && data.code) {
		const codeConflict = await db.query.promotion.findFirst({
			where: (p, { and: qAnd, eq: qEq, ne: qNe }) =>
				qAnd(qEq(p.code, data.code as string), qNe(p.id, id)),
		});
		if (codeConflict) {
			return { ok: false, error: "Código já está em uso" };
		}
	}

	// Step 4: Stacking guard excluding self (only for promotion type)
	if (data.type === "promotion" && data.toolIds.length > 0) {
		const now = new Date();
		const overlapping = await db
			.select({
				promotionId: promotionTool.promotionId,
				toolId: promotionTool.toolId,
				toolName: tool.name,
			})
			.from(promotion)
			.innerJoin(promotionTool, eq(promotion.id, promotionTool.promotionId))
			.innerJoin(tool, eq(promotionTool.toolId, tool.id))
			.where(
				and(
					eq(promotion.type, "promotion"),
					eq(promotion.active, true),
					or(isNull(promotion.startsAt), lte(promotion.startsAt, now)),
					or(isNull(promotion.endsAt), gte(promotion.endsAt, now)),
					inArray(promotionTool.toolId, data.toolIds),
					ne(promotion.id, id)
				)
			)
			.limit(1);

		if (overlapping.length > 0 && overlapping[0]) {
			return {
				ok: false,
				error: `Já existe promoção ativa para a ferramenta ${overlapping[0].toolName}`,
			};
		}
	}

	// Step 5: Update in transaction (update row + delete-recreate promotion_tool)
	try {
		await db.transaction(async (tx) => {
			await tx
				.update(promotion)
				.set({
					title: data.title,
					description: data.description ?? null,
					type: data.type,
					code: data.type === "promocode" ? (data.code ?? null) : null,
					discountPct: String(data.discountPct),
					active: data.active,
					startsAt: data.startsAt ?? null,
					endsAt: data.endsAt ?? null,
				})
				.where(eq(promotion.id, id));

			await tx.delete(promotionTool).where(eq(promotionTool.promotionId, id));

			if (data.toolIds.length > 0) {
				await tx.insert(promotionTool).values(
					data.toolIds.map((toolId) => ({
						promotionId: id,
						toolId,
					}))
				);
			}
		});
	} catch (error) {
		return { ok: false, error: dbErrorMessage(error) };
	}

	revalidatePath(PROMOTIONS_PATH);
	return { ok: true, data: { id } };
}

// ---------------------------------------------------------------------------
// deletePromotion — requires admin
// ---------------------------------------------------------------------------

export async function deletePromotion(
	id: string
): Promise<ActionResult<undefined>> {
	await requireRole("admin");

	try {
		await db.delete(promotion).where(eq(promotion.id, id));
	} catch (error) {
		return { ok: false, error: dbErrorMessage(error) };
	}

	revalidatePath(PROMOTIONS_PATH);
	return { ok: true, data: undefined };
}
