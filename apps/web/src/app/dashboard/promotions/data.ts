import "server-only";

import { db } from "@emach/db";
import { promotion, promotionTool } from "@emach/db/schema/promotions";
import { tool } from "@emach/db/schema/tools";
import {
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
import { cache } from "react";
import { decodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";
import {
	computeStatus,
	makePromotionCursor,
	promotionStatusCondition,
} from "./_lib/promotion-query-helpers";
import type { PromotionSort, PromotionStatus } from "./_lib/promotion-types";

// Re-export so consumers can import types from ./data
export type { PromotionSort, PromotionStatus } from "./_lib/promotion-types";

// ---------------------------------------------------------------------------
// Constants (internal)
// ---------------------------------------------------------------------------

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
// countToolsWithActivePromotion
// ---------------------------------------------------------------------------

/**
 * Retorna quantas das ferramentas informadas têm ≥1 promoção do tipo
 * 'promotion' ativa e dentro do período de validade.
 * Usado pela UI como aviso não-bloqueante antes de salvar/ativar.
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

// ---------------------------------------------------------------------------
// fetchPromotionsPage — keyset pagination (requires authenticated session)
// ---------------------------------------------------------------------------

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

export const getToolOptions = cache(
	async (): Promise<{ id: string; name: string }[]> => {
		await requireCurrentSession();
		return db
			.select({ id: tool.id, name: tool.name })
			.from(tool)
			.orderBy(asc(tool.name));
	}
);
