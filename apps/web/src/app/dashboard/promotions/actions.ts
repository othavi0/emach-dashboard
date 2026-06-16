"use server";

import { db } from "@emach/db";
import { promotion, promotionTool } from "@emach/db/schema/promotions";
import { tool } from "@emach/db/schema/tools";
import {
	type AnyColumn,
	and,
	asc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { type Cursor, decodeCursor } from "@/lib/cursor";
import { endOfDaySaoPaulo, startOfDaySaoPaulo } from "@/lib/format/date-input";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import {
	createPromotionSchema,
	type PromotionFormValues,
	promotionSchema,
} from "./_components/promotion-schema";
import { featuredConflictMessage } from "./_lib/featured-message";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROMOTIONS_PATH = "/dashboard/promotions";
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

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
	appliesToAll: boolean;
	code: string | null;
	createdAt: Date;
	createdByName: string | null;
	description: string | null;
	discountType: string;
	discountValue: string;
	endsAt: Date | null;
	featured: boolean;
	id: string;
	maxRedemptions: number | null;
	minOrderAmount: string | null;
	redemptionCount: number;
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

/**
 * Retorna quantas das ferramentas informadas têm ≥1 promoção do tipo
 * 'promotion' ativa e dentro do período de validade.
 * Usado pela UI como aviso não-bloqueante antes de salvar/ativar.
 * Exportado como server action para ser chamável de Client Components.
 */
export async function countToolsWithActivePromotion(
	toolIds: string[],
	excludeId?: string
): Promise<number> {
	if (toolIds.length === 0) {
		return 0;
	}

	const now = new Date();
	const activeWindow = [
		eq(promotion.type, "promotion"),
		eq(promotion.active, true),
		or(isNull(promotion.startsAt), lte(promotion.startsAt, now)),
		or(isNull(promotion.endsAt), gte(promotion.endsAt, now)),
	];
	const exclude = excludeId ? [ne(promotion.id, excludeId)] : [];

	// Uma promoção global ativa cobre todas as ferramentas — não há linha em
	// promotion_tool, então o join abaixo não a veria. Checa antes.
	const globalActive = await db
		.select({ id: promotion.id })
		.from(promotion)
		.where(and(...activeWindow, eq(promotion.appliesToAll, true), ...exclude))
		.limit(1);
	if (globalActive.length > 0) {
		return toolIds.length;
	}

	const rows = await db
		.selectDistinct({ toolId: promotionTool.toolId })
		.from(promotion)
		.innerJoin(promotionTool, eq(promotion.id, promotionTool.promotionId))
		.where(
			and(...activeWindow, inArray(promotionTool.toolId, toolIds), ...exclude)
		);

	return rows.length;
}

// Campos exclusivos de cupom (promocode). Em promoção automática são sempre
// null. Centralizado para create/update não divergirem.
function buildCouponFields(data: PromotionFormValues): {
	maxRedemptions: number | null;
	minOrderAmount: string | null;
} {
	if (data.type === "promocode") {
		return {
			maxRedemptions: data.maxRedemptions ?? null,
			minOrderAmount:
				data.minOrderAmount == null ? null : String(data.minOrderAmount),
		};
	}
	return { maxRedemptions: null, minOrderAmount: null };
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

/**
 * Bloqueia marcar uma promoção como destaque enquanto já houver outro destaque
 * vivo (status active ou scheduled). O índice único do banco garante 1 destaque;
 * aqui damos a mensagem amigável antes de tentar o flip-off.
 */
async function assertFeaturedSlotFree(tx: Tx, excludeId?: string) {
	const filters = [eq(promotion.featured, true)];
	if (excludeId) {
		filters.push(ne(promotion.id, excludeId));
	}
	const rows = await tx
		.select({
			active: promotion.active,
			startsAt: promotion.startsAt,
			endsAt: promotion.endsAt,
		})
		.from(promotion)
		.where(and(...filters))
		.limit(1);

	const existing = rows[0];
	if (!existing) {
		return;
	}
	const status = computeStatus(existing);
	if (status === "active" || status === "scheduled") {
		conflict(featuredConflictMessage(existing));
	}
}

// Predicado SQL de status, compartilhado entre fetchPromotionsPage (filtro da
// lista) e getPromotionStatusCounts (contagens das tabs) para não divergirem.
// `cols` são as colunas (p relacional ou a tabela promotion); `sqlTag` é o sql
// do contexto (ops.sql na query relacional, sql global no select agregado).
interface PromotionStatusCols {
	active: AnyColumn;
	endsAt: AnyColumn;
	startsAt: AnyColumn;
}

function promotionStatusCondition(
	cols: PromotionStatusCols,
	status: PromotionStatus,
	sqlTag: typeof sql
) {
	switch (status) {
		case "expired":
			return sqlTag`${cols.endsAt} < now()`;
		case "scheduled":
			return sqlTag`${cols.active} = true AND ${cols.startsAt} > now() AND (${cols.endsAt} IS NULL OR ${cols.endsAt} >= now())`;
		case "active":
			return sqlTag`${cols.active} = true AND (${cols.startsAt} IS NULL OR ${cols.startsAt} <= now()) AND (${cols.endsAt} IS NULL OR ${cols.endsAt} >= now())`;
		default:
			return sqlTag`${cols.active} = false AND (${cols.endsAt} IS NULL OR ${cols.endsAt} >= now())`;
	}
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
		discountValue: string;
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
				discountValue: last.discountValue,
				id: last.id,
			};
		case "discountAsc":
			return {
				v: 1,
				sort: "promoDiscountAsc",
				discountValue: last.discountValue,
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
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keyset + filtros opcionais — complexidade inerente à query paginada
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
				// O filtro de desconto é em % (percentageMask na UI); só se aplica a
				// promoções percentuais — um R$ 50 não casa "desconto 10–50%".
				conds.push(ops.eq(p.discountType, "percent"));
				conds.push(ops.gte(p.discountValue, String(discountMin)));
			}
			if (typeof discountMax === "number") {
				if (typeof discountMin !== "number") {
					conds.push(ops.eq(p.discountType, "percent"));
				}
				conds.push(ops.lte(p.discountValue, String(discountMax)));
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
				conds.push(promotionStatusCondition(p, status, ops.sql));
			}

			// keyset: predicado por sort (defensivo — o front reseta o cursor ao trocar sort)
			if (decoded) {
				const c = decoded;
				if (sort === "createdDesc" && c.sort === "newest") {
					conds.push(
						ops.sql`(${p.createdAt}, ${p.id}) < (${c.createdAt}::timestamptz, ${c.id})`
					);
				} else if (sort === "createdAsc" && c.sort === "promoCreatedAsc") {
					conds.push(
						ops.sql`(${p.createdAt}, ${p.id}) > (${c.createdAt}::timestamptz, ${c.id})`
					);
				} else if (
					sort === "discountDesc" &&
					c.sort === "promoDiscountDesc" &&
					c.discountValue != null
				) {
					conds.push(
						ops.sql`(${p.discountValue}, ${p.id}) < (${c.discountValue}::numeric, ${c.id})`
					);
				} else if (
					sort === "discountAsc" &&
					c.sort === "promoDiscountAsc" &&
					c.discountValue != null
				) {
					conds.push(
						ops.sql`(${p.discountValue}, ${p.id}) > (${c.discountValue}::numeric, ${c.id})`
					);
				} else if (sort === "endsAtAsc" && c.sort === "promoEndsAtAsc") {
					if (c.endsAt === null) {
						conds.push(ops.sql`(${p.endsAt} IS NULL AND ${p.id} > ${c.id})`);
					} else {
						conds.push(
							ops.sql`(${p.endsAt} > ${c.endsAt}::timestamptz OR (${p.endsAt} = ${c.endsAt}::timestamptz AND ${p.id} > ${c.id}) OR ${p.endsAt} IS NULL)`
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
					return [qDesc(p.discountValue), qDesc(p.id)];
				case "discountAsc":
					return [qAsc(p.discountValue), qAsc(p.id)];
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
				discountType: row.discountType,
				discountValue: row.discountValue,
				appliesToAll: row.appliesToAll,
				maxRedemptions: row.maxRedemptions,
				redemptionCount: row.redemptionCount,
				minOrderAmount: row.minOrderAmount,
				active: row.active,
				featured: row.featured,
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
		discountType: row.discountType,
		discountValue: row.discountValue,
		appliesToAll: row.appliesToAll,
		maxRedemptions: row.maxRedemptions,
		redemptionCount: row.redemptionCount,
		minOrderAmount: row.minOrderAmount,
		active: row.active,
		featured: row.featured,
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

			const couponFields = buildCouponFields(data);

			const isFeatured = data.type === "promotion" && data.featured === true;
			if (isFeatured) {
				await assertFeaturedSlotFree(tx);
				await tx
					.update(promotion)
					.set({ featured: false })
					.where(eq(promotion.featured, true));
			}

			await tx.insert(promotion).values({
				id: newId,
				title: data.title,
				description: data.description ?? null,
				type: data.type,
				code: data.type === "promocode" ? (data.code ?? null) : null,
				discountType: data.discountType,
				discountValue: String(data.discountValue),
				appliesToAll: data.appliesToAll,
				...couponFields,
				active: data.active,
				featured: isFeatured,
				startsAt: data.startsAt ? startOfDaySaoPaulo(data.startsAt) : null,
				endsAt: data.endsAt ? endOfDaySaoPaulo(data.endsAt) : null,
				createdBy: session.user.id,
				updatedBy: session.user.id,
			});

			if (!data.appliesToAll && data.toolIds.length > 0) {
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

			const couponFields = buildCouponFields(data);

			const isFeatured = data.type === "promotion" && data.featured === true;
			if (isFeatured) {
				await assertFeaturedSlotFree(tx, id);
				await tx
					.update(promotion)
					.set({ featured: false })
					.where(and(eq(promotion.featured, true), ne(promotion.id, id)));
			}

			await tx
				.update(promotion)
				.set({
					title: data.title,
					description: data.description ?? null,
					type: data.type,
					code: data.type === "promocode" ? (data.code ?? null) : null,
					discountType: data.discountType,
					discountValue: String(data.discountValue),
					appliesToAll: data.appliesToAll,
					...couponFields,
					active: data.active,
					featured: isFeatured,
					startsAt: data.startsAt ? startOfDaySaoPaulo(data.startsAt) : null,
					endsAt: data.endsAt ? endOfDaySaoPaulo(data.endsAt) : null,
					updatedBy: session.user.id,
				})
				.where(eq(promotion.id, id));

			// Sempre limpa tools existentes; reinserir só se !appliesToAll
			await tx.delete(promotionTool).where(eq(promotionTool.promotionId, id));

			if (!data.appliesToAll && data.toolIds.length > 0) {
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
		await requireCapability("promotions.delete");
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
// togglePromotionActive — requires admin (promotions.manage)
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
// duplicatePromotion — requires admin (promotions.manage)
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
				discountType: p.discountType,
				discountValue: p.discountValue,
				appliesToAll: p.appliesToAll,
				maxRedemptions: p.maxRedemptions,
				minOrderAmount: p.minOrderAmount,
				redemptionCount: 0,
				active: false,
				startsAt: null,
				endsAt: null,
				createdBy: session.user.id,
				updatedBy: session.user.id,
			});

			if (!p.appliesToAll) {
				const tools = await tx
					.select({ toolId: promotionTool.toolId })
					.from(promotionTool)
					.where(eq(promotionTool.promotionId, id));

				if (tools.length > 0) {
					await tx
						.insert(promotionTool)
						.values(
							tools.map((t) => ({ promotionId: newId, toolId: t.toolId }))
						);
				}
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
			active: sql<number>`count(*) filter (where ${promotionStatusCondition(promotion, "active", sql)})::int`,
			scheduled: sql<number>`count(*) filter (where ${promotionStatusCondition(promotion, "scheduled", sql)})::int`,
			expired: sql<number>`count(*) filter (where ${promotionStatusCondition(promotion, "expired", sql)})::int`,
			inactive: sql<number>`count(*) filter (where ${promotionStatusCondition(promotion, "inactive", sql)})::int`,
		})
		.from(promotion);

	return (
		rows[0] ?? { all: 0, active: 0, scheduled: 0, expired: 0, inactive: 0 }
	);
}

// ---------------------------------------------------------------------------
// getToolOptions — opções {id, name} de ferramentas p/ selects e filtros
// ---------------------------------------------------------------------------

export async function getToolOptions(): Promise<
	{ id: string; name: string }[]
> {
	await requireCurrentSession();
	return db
		.select({ id: tool.id, name: tool.name })
		.from(tool)
		.orderBy(asc(tool.name));
}
