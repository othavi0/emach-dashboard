"use server";

import { db } from "@emach/db";
import { promotion, promotionTool } from "@emach/db/schema/promotions";
import { tool } from "@emach/db/schema/tools";
import { and, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { type Cursor, decodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
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

export type PromotionStatus = "active" | "scheduled" | "expired" | "inactive";

export interface PromotionStatusCounts {
	active: number;
	all: number;
	expired: number;
	inactive: number;
	scheduled: number;
}

export interface PromotionToolItem {
	id: string;
	name: string;
	sku: string | null;
	slug: string | null;
	thumbUrl: string | null;
}

export interface PromotionListItem {
	active: boolean;
	code: string | null;
	createdAt: Date;
	createdByName: string | null;
	description: string | null;
	discountPct: string;
	endsAt: Date | null;
	id: string;
	startsAt: Date | null;
	status: PromotionStatus;
	title: string;
	tools: PromotionToolItem[];
	type: string;
	updatedAt: Date;
	updatedByName: string | null;
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

function computeStatus(p: {
	active: boolean;
	startsAt: Date | null;
	endsAt: Date | null;
}): PromotionStatus {
	const now = new Date();
	if (p.endsAt && p.endsAt < now) {
		return "expired";
	}
	if (!p.active) {
		return "inactive";
	}
	if (p.startsAt && p.startsAt > now) {
		return "scheduled";
	}
	return "active";
}

// ---------------------------------------------------------------------------
// listPromotions — requires authenticated session
// ---------------------------------------------------------------------------

export type PromotionSort =
	| "createdDesc"
	| "createdAsc"
	| "discountDesc"
	| "discountAsc"
	| "endsAtAsc";

export interface ListPromotionsOptions {
	discountMax?: number;
	discountMin?: number;
	search?: string;
	sort?: PromotionSort;
	status?: PromotionStatus | "all";
	toolId?: string;
	type?: "promotion" | "promocode" | "all";
}

// ---------------------------------------------------------------------------
// fetchPromotionsPage — keyset pagination (requires authenticated session)
// ---------------------------------------------------------------------------

function makePromotionCursor(
	sort: PromotionSort,
	last: {
		createdAt: Date;
		discountPct: string;
		endsAt: Date | null;
		id: string;
	}
): Cursor {
	switch (sort) {
		case "createdAsc":
			return {
				v: 1,
				sort: "promoCreatedAsc",
				createdAt: last.createdAt.toISOString(),
				id: last.id,
			};
		case "discountDesc":
			return {
				v: 1,
				sort: "promoDiscountDesc",
				discountPct: last.discountPct,
				id: last.id,
			};
		case "discountAsc":
			return {
				v: 1,
				sort: "promoDiscountAsc",
				discountPct: last.discountPct,
				id: last.id,
			};
		case "endsAtAsc":
			return {
				v: 1,
				sort: "promoEndsAtAsc",
				endsAt: last.endsAt ? last.endsAt.toISOString() : null,
				id: last.id,
			};
		default:
			return {
				v: 1,
				sort: "newest",
				createdAt: last.createdAt.toISOString(),
				id: last.id,
			};
	}
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keyset + múltiplos filtros opcionais — complexidade inerente à query paginada
export async function fetchPromotionsPage({
	filters,
	cursor,
}: {
	filters: ListPromotionsOptions;
	cursor: string | null;
}): Promise<InfiniteResult<PromotionListItem>> {
	await requireCurrentSession();

	const {
		type = "all",
		search,
		status = "all",
		toolId,
		discountMin,
		discountMax,
		sort = "createdDesc",
	} = filters;

	const decoded = cursor ? decodeCursor(cursor) : null;

	const rows = await db.query.promotion.findMany({
		where: (p, ops) => {
			const conds: unknown[] = [];

			if (type !== "all") {
				conds.push(ops.eq(p.type, type));
			}
			if (search && search.trim() !== "") {
				const term = `%${search.trim()}%`;
				conds.push(
					ops.or(ops.ilike(p.title, term), ops.ilike(p.code as never, term))
				);
			}
			if (typeof discountMin === "number") {
				conds.push(ops.gte(p.discountPct, String(discountMin)));
			}
			if (typeof discountMax === "number") {
				conds.push(ops.lte(p.discountPct, String(discountMax)));
			}
			if (toolId && UUID_RE.test(toolId)) {
				conds.push(
					ops.inArray(
						p.id,
						db
							.select({ pid: promotionTool.promotionId })
							.from(promotionTool)
							.where(eq(promotionTool.toolId, toolId))
					)
				);
			}
			if (status !== "all") {
				switch (status) {
					case "expired":
						conds.push(ops.sql`${p.endsAt} < now()`);
						break;
					case "scheduled":
						conds.push(
							ops.sql`${p.active} = true AND ${p.startsAt} > now() AND (${p.endsAt} IS NULL OR ${p.endsAt} >= now())`
						);
						break;
					case "active":
						conds.push(
							ops.sql`${p.active} = true AND (${p.startsAt} IS NULL OR ${p.startsAt} <= now()) AND (${p.endsAt} IS NULL OR ${p.endsAt} >= now())`
						);
						break;
					case "inactive":
						conds.push(
							ops.sql`${p.active} = false AND (${p.endsAt} IS NULL OR ${p.endsAt} >= now())`
						);
						break;
					default:
						break;
				}
			}

			// keyset: predicado por sort (defensivo — o front reseta o cursor ao trocar sort)
			if (decoded) {
				const c = decoded;
				if (sort === "createdDesc" && c.sort === "newest") {
					conds.push(
						ops.sql`(${p.createdAt}, ${p.id}) < (${c.createdAt}::timestamp, ${c.id})`
					);
				} else if (sort === "createdAsc" && c.sort === "promoCreatedAsc") {
					conds.push(
						ops.sql`(${p.createdAt}, ${p.id}) > (${c.createdAt}::timestamp, ${c.id})`
					);
				} else if (sort === "discountDesc" && c.sort === "promoDiscountDesc") {
					conds.push(
						ops.sql`(${p.discountPct}, ${p.id}) < (${c.discountPct}::numeric, ${c.id})`
					);
				} else if (sort === "discountAsc" && c.sort === "promoDiscountAsc") {
					conds.push(
						ops.sql`(${p.discountPct}, ${p.id}) > (${c.discountPct}::numeric, ${c.id})`
					);
				} else if (sort === "endsAtAsc" && c.sort === "promoEndsAtAsc") {
					if (c.endsAt === null) {
						conds.push(ops.sql`(${p.endsAt} IS NULL AND ${p.id} > ${c.id})`);
					} else {
						conds.push(
							ops.sql`(${p.endsAt} > ${c.endsAt}::timestamp OR (${p.endsAt} = ${c.endsAt}::timestamp AND ${p.id} > ${c.id}) OR ${p.endsAt} IS NULL)`
						);
					}
				}
			}

			return conds.length > 0
				? ops.and(...(conds as Parameters<typeof ops.and>))
				: undefined;
		},
		orderBy: (p, { asc: qAsc, desc: qDesc, sql: qSql }) => {
			switch (sort) {
				case "createdAsc":
					return [qAsc(p.createdAt), qAsc(p.id)];
				case "discountDesc":
					return [qDesc(p.discountPct), qDesc(p.id)];
				case "discountAsc":
					return [qAsc(p.discountPct), qAsc(p.id)];
				case "endsAtAsc":
					return [qSql`${p.endsAt} ASC NULLS LAST`, qAsc(p.id)];
				default:
					return [qDesc(p.createdAt), qDesc(p.id)];
			}
		},
		limit: BATCH_SIZE + 1,
		with: {
			createdByUser: { columns: { name: true } },
			updatedByUser: { columns: { name: true } },
			promotionTools: {
				with: {
					tool: {
						columns: { id: true, name: true, slug: true },
						with: {
							variants: true,
							images: {
								columns: { url: true, sortOrder: true },
								orderBy: (img, { asc: qAsc }) => qAsc(img.sortOrder),
								limit: 1,
							},
						},
					},
				},
			},
		},
	});

	return paginate(
		rows,
		(row): PromotionListItem => {
			const tools: PromotionToolItem[] = row.promotionTools.map((pt) => {
				const defaultVariant = pt.tool.variants.find((v) => v.isDefault);
				return {
					id: pt.tool.id,
					name: pt.tool.name,
					slug: pt.tool.slug,
					sku: defaultVariant?.sku ?? null,
					thumbUrl: pt.tool.images[0]?.url ?? null,
				};
			});

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
				updatedAt: row.updatedAt,
				status: computeStatus({
					active: row.active,
					startsAt: row.startsAt,
					endsAt: row.endsAt,
				}),
				createdByName: row.createdByUser?.name ?? null,
				updatedByName: row.updatedByUser?.name ?? null,
				tools,
			};
		},
		(last) => makePromotionCursor(sort, last)
	);
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
			createdByUser: { columns: { name: true } },
			updatedByUser: { columns: { name: true } },
			promotionTools: {
				with: {
					tool: {
						columns: { id: true, name: true, slug: true },
						with: {
							variants: true,
							images: {
								columns: { url: true, sortOrder: true },
								orderBy: (img, { asc: qAsc }) => qAsc(img.sortOrder),
								limit: 1,
							},
						},
					},
				},
			},
		},
	});

	if (!row) {
		return null;
	}

	const tools: PromotionToolItem[] = row.promotionTools.map((pt) => {
		const defaultVariant = pt.tool.variants.find((v) => v.isDefault);
		return {
			id: pt.tool.id,
			name: pt.tool.name,
			slug: pt.tool.slug,
			sku: defaultVariant?.sku ?? null,
			thumbUrl: pt.tool.images[0]?.url ?? null,
		};
	});

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
		updatedAt: row.updatedAt,
		status: computeStatus({
			active: row.active,
			startsAt: row.startsAt,
			endsAt: row.endsAt,
		}),
		createdByName: row.createdByUser?.name ?? null,
		updatedByName: row.updatedByUser?.name ?? null,
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
		await requireCapability("promotions.manage");
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

	const session = await requireCurrentSession();

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
				createdBy: session.user.id,
				updatedBy: session.user.id,
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
		await requireCapability("promotions.manage");
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

	const session = await requireCurrentSession();

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
					updatedBy: session.user.id,
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
		await requireCapability("promotions.manage");
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

// ---------------------------------------------------------------------------
// togglePromotionActive — requires admin/manager (promotions.manage)
// ---------------------------------------------------------------------------

export async function togglePromotionActive(
	id: string
): Promise<ActionResult<{ active: boolean }>> {
	try {
		await requireCapability("promotions.manage");
	} catch (error) {
		return safeRequireRole(error);
	}

	if (!UUID_RE.test(id)) {
		return { ok: false, error: "ID inválido" };
	}

	const session = await requireCurrentSession();

	try {
		const next = await db.transaction(async (tx) => {
			const current = await tx
				.select({ active: promotion.active, type: promotion.type })
				.from(promotion)
				.where(eq(promotion.id, id))
				.limit(1);

			if (current.length === 0 || !current[0]) {
				conflict("Promoção não encontrada");
			}
			const row = current[0];
			if (!row) {
				conflict("Promoção não encontrada");
			}

			const nextActive = !row.active;

			if (nextActive && row.type === "promotion") {
				const tools = await tx
					.select({ toolId: promotionTool.toolId })
					.from(promotionTool)
					.where(eq(promotionTool.promotionId, id));
				const toolIds = tools.map((t) => t.toolId);
				if (toolIds.length > 0) {
					await assertNoStackingConflict(tx, toolIds, id);
				}
			}

			await tx
				.update(promotion)
				.set({ active: nextActive, updatedBy: session.user.id })
				.where(eq(promotion.id, id));

			return nextActive;
		});
		revalidatePath(PROMOTIONS_PATH);
		return { ok: true, data: { active: next } };
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("CONFLICT:")) {
			return { ok: false, error: error.message.slice(9) };
		}
		return { ok: false, error: dbErrorMessage(error) };
	}
}

// ---------------------------------------------------------------------------
// duplicatePromotion — requires admin/manager (promotions.manage)
// ---------------------------------------------------------------------------

export async function duplicatePromotion(
	id: string
): Promise<ActionResult<{ id: string }>> {
	try {
		await requireCapability("promotions.manage");
	} catch (error) {
		return safeRequireRole(error);
	}

	if (!UUID_RE.test(id)) {
		return { ok: false, error: "ID inválido" };
	}

	const session = await requireCurrentSession();
	const newId = crypto.randomUUID();

	try {
		await db.transaction(async (tx) => {
			const src = await tx
				.select()
				.from(promotion)
				.where(eq(promotion.id, id))
				.limit(1);
			if (src.length === 0 || !src[0]) {
				conflict("Promoção não encontrada");
			}
			const p = src[0];
			if (!p) {
				conflict("Promoção não encontrada");
			}

			const baseTitle = `${p.title} (cópia)`;
			let candidate = baseTitle;
			let n = 2;
			while (true) {
				const exists = await tx
					.select({ id: promotion.id })
					.from(promotion)
					.where(
						and(eq(promotion.type, p.type), eq(promotion.title, candidate))
					)
					.limit(1);
				if (exists.length === 0) {
					break;
				}
				candidate = `${baseTitle} ${n}`;
				n += 1;
				if (n > 50) {
					conflict("Não foi possível gerar título único para a cópia");
				}
			}

			await tx.insert(promotion).values({
				id: newId,
				title: candidate,
				description: p.description,
				type: p.type,
				code: null,
				discountPct: p.discountPct,
				active: false,
				startsAt: null,
				endsAt: null,
				createdBy: session.user.id,
				updatedBy: session.user.id,
			});

			const tools = await tx
				.select({ toolId: promotionTool.toolId })
				.from(promotionTool)
				.where(eq(promotionTool.promotionId, id));

			if (tools.length > 0) {
				await tx
					.insert(promotionTool)
					.values(tools.map((t) => ({ promotionId: newId, toolId: t.toolId })));
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
// getPromotionStatusCounts — contagens por status p/ as pill tabs
// ---------------------------------------------------------------------------

export async function getPromotionStatusCounts(): Promise<PromotionStatusCounts> {
	await requireCurrentSession();

	const rows = await db
		.select({
			all: sql<number>`count(*)::int`,
			active: sql<number>`count(*) filter (where ${promotion.active} = true and (${promotion.startsAt} is null or ${promotion.startsAt} <= now()) and (${promotion.endsAt} is null or ${promotion.endsAt} >= now()))::int`,
			scheduled: sql<number>`count(*) filter (where ${promotion.active} = true and ${promotion.startsAt} > now() and (${promotion.endsAt} is null or ${promotion.endsAt} >= now()))::int`,
			expired: sql<number>`count(*) filter (where ${promotion.endsAt} < now())::int`,
			inactive: sql<number>`count(*) filter (where ${promotion.active} = false and (${promotion.endsAt} is null or ${promotion.endsAt} >= now()))::int`,
		})
		.from(promotion);

	return (
		rows[0] ?? { all: 0, active: 0, scheduled: 0, expired: 0, inactive: 0 }
	);
}
