"use server";

import { db } from "@emach/db";
import { promotion, promotionTool } from "@emach/db/schema/promotions";
import { tool } from "@emach/db/schema/tools";
import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { requireCurrentSession, requireRole } from "@/lib/session";
import {
	createPromotionSchema,
	type PromotionFormValues,
	promotionSchema,
} from "./_components/promotion-schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROMOTIONS_PATH = "/dashboard/promotions";
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
	logger.error("promotions", error);
	return "Erro ao processar operação. Tente novamente.";
}

function safeRequireRole(error: unknown): ActionResult<never> {
	if (error instanceof Error && error.message.startsWith("Forbidden:")) {
		return { ok: false, error: "Acesso negado" };
	}
	throw error;
}

function conflict(message: string): never {
	throw new Error(`CONFLICT:${message}`);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function assertTitleUnique(
	tx: Tx,
	type: string,
	title: string,
	excludeId?: string
) {
	const filters = [eq(promotion.type, type), eq(promotion.title, title)];
	if (excludeId) {
		filters.push(ne(promotion.id, excludeId));
	}

	const row = await tx
		.select({ id: promotion.id })
		.from(promotion)
		.where(and(...filters))
		.limit(1);
	if (row.length > 0) {
		conflict("Já existe promoção/código com este título");
	}
}

async function assertCodeUnique(tx: Tx, code: string, excludeId?: string) {
	const filters = [eq(promotion.code, code)];
	if (excludeId) {
		filters.push(ne(promotion.id, excludeId));
	}

	const row = await tx
		.select({ id: promotion.id })
		.from(promotion)
		.where(and(...filters))
		.limit(1);
	if (row.length > 0) {
		conflict("Código já está em uso");
	}
}

async function assertNoStackingConflict(
	tx: Tx,
	toolIds: string[],
	excludeId?: string
) {
	const now = new Date();
	const filters = [
		eq(promotion.type, "promotion"),
		eq(promotion.active, true),
		or(isNull(promotion.startsAt), lte(promotion.startsAt, now)),
		or(isNull(promotion.endsAt), gte(promotion.endsAt, now)),
		inArray(promotionTool.toolId, toolIds),
	];
	if (excludeId) {
		filters.push(ne(promotion.id, excludeId));
	}

	const overlapping = await tx
		.select({ toolName: tool.name })
		.from(promotion)
		.innerJoin(promotionTool, eq(promotion.id, promotionTool.promotionId))
		.innerJoin(tool, eq(promotionTool.toolId, tool.id))
		.where(and(...filters))
		.limit(1);

	if (overlapping.length > 0 && overlapping[0]) {
		conflict(
			`Já existe promoção ativa para a ferramenta ${overlapping[0].toolName}`
		);
	}
}

// ---------------------------------------------------------------------------
// listPromotions — requires authenticated session
// ---------------------------------------------------------------------------

export interface ListPromotionsOptions {
	search?: string;
	type?: "promotion" | "promocode" | "all";
}

export async function listPromotions(
	options: ListPromotionsOptions = {}
): Promise<PromotionListItem[]> {
	await requireCurrentSession();

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
// getPromotion — requires authenticated session
// ---------------------------------------------------------------------------

export async function getPromotion(
	id: string
): Promise<PromotionDetail | null> {
	await requireCurrentSession();

	if (!UUID_RE.test(id)) {
		return null;
	}

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
	try {
		await requireRole("admin");
	} catch (error) {
		return safeRequireRole(error);
	}

	// C2 fix: use createPromotionSchema (includes startsAt past-date guard)
	const parsed = createPromotionSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const data = parsed.data;
	const newId = crypto.randomUUID();

	// H1 fix: all checks + insert inside single transaction
	try {
		await db.transaction(async (tx) => {
			await assertTitleUnique(tx, data.type, data.title);
			if (data.type === "promocode" && data.code) {
				await assertCodeUnique(tx, data.code);
			}
			if (data.type === "promotion" && data.toolIds.length > 0) {
				await assertNoStackingConflict(tx, data.toolIds);
			}

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
		if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
			return { ok: false, error: error.message.slice(9) };
		}
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
	try {
		await requireRole("admin");
	} catch (error) {
		return safeRequireRole(error);
	}

	if (!UUID_RE.test(id)) {
		return { ok: false, error: "ID inválido" };
	}

	const parsed = promotionSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const data = parsed.data;

	// H1 fix: all checks + update inside single transaction
	try {
		await db.transaction(async (tx) => {
			await assertTitleUnique(tx, data.type, data.title, id);
			if (data.type === "promocode" && data.code) {
				await assertCodeUnique(tx, data.code, id);
			}
			if (data.type === "promotion" && data.toolIds.length > 0) {
				await assertNoStackingConflict(tx, data.toolIds, id);
			}

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
		if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
			return { ok: false, error: error.message.slice(9) };
		}
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
	try {
		await requireRole("admin");
	} catch (error) {
		return safeRequireRole(error);
	}

	if (!UUID_RE.test(id)) {
		return { ok: false, error: "ID inválido" };
	}

	try {
		await db.delete(promotion).where(eq(promotion.id, id));
	} catch (error) {
		return { ok: false, error: dbErrorMessage(error) };
	}

	revalidatePath(PROMOTIONS_PATH);
	return { ok: true, data: undefined };
}
