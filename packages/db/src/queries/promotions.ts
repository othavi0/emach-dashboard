import { sql } from "drizzle-orm";

import type { Promotion } from "../schema/promotions";
import { coerceDates } from "../utils";
import type { AnyDb, ToolListItem, ToolListRow } from "./catalog-helpers";
import {
	APPROVED,
	arrayLiteral,
	DEFAULT_PROMO_LIMIT,
	PROMOTION_DATE_KEYS,
	rowToToolListItem,
	STOREFRONT_STATUS_SQL,
	TOOLS_PER_PROMO,
} from "./catalog-helpers";

export type PromotionWithTools = Promotion & {
	tools: ToolListItem[];
};

// ---------------------------------------------------------------------------
// fetchPromoTools — private helper: fetches tools for a resolved promotion,
// applying the discount. Used by getActivePromotions and getFeaturedPromotion.
// ---------------------------------------------------------------------------

/** Busca as tools de uma promoção já resolvida, aplicando o desconto.
 * Usado por getActivePromotions e getFeaturedPromotion.
 * @param db - instância do banco
 * @param promo - objeto Promotion com discountType, discountValue e id
 * @param toolScope - fragmento SQL de filtro de escopo (ex: `t.id = ANY(...)` ou `sql\`true\``)
 */
async function fetchPromoTools(
	db: AnyDb,
	promo: Pick<Promotion, "id" | "discountType" | "discountValue">,
	toolScope: ReturnType<typeof sql>
): Promise<ToolListItem[]> {
	const toolsRes = await db.execute<ToolListRow>(sql`
		SELECT
			t.id, t.slug, t.name, t.status,
			dv.id AS variant_id,
			dv.sku AS variant_sku,
			dv.voltage AS variant_voltage,
			dv.price_amount::text AS variant_price,
			CASE
				WHEN ${promo.discountType}::text = 'fixed'
					THEN GREATEST(dv.price_amount - ${promo.discountValue}::numeric, 0)::text
				ELSE ROUND(dv.price_amount * (1 - ${promo.discountValue}::numeric / 100), 2)::text
			END AS discounted_amount,
			${promo.id}::text AS active_promotion_id,
			(SELECT COUNT(*) > 1 FROM tool_variant tv2 WHERE tv2.tool_id = t.id) AS has_other_variants,
			(SELECT url FROM tool_image WHERE tool_id = t.id ORDER BY sort_order ASC LIMIT 1) AS primary_image_url,
			COALESCE((
				SELECT SUM(sl.quantity) > 0
				FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id
			), false) AS in_stock,
			(SELECT AVG(r.rating)::numeric(3,2)::text FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS avg_rating,
			(SELECT COUNT(*)::int FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS review_count,
			pc.id AS cat_id,
			pc.slug AS cat_slug,
			pc.name AS cat_name
		FROM tool t
		INNER JOIN tool_variant dv ON dv.tool_id = t.id AND dv.is_default = true
		LEFT JOIN tool_category tc ON tc.tool_id = t.id AND tc.is_primary = true
		LEFT JOIN category pc ON pc.id = tc.category_id
		WHERE ${toolScope}
		  AND t.visible_on_site = true
		  AND ${STOREFRONT_STATUS_SQL}
		ORDER BY t.created_at DESC
		LIMIT ${TOOLS_PER_PROMO}
	`);
	return toolsRes.rows.map(rowToToolListItem);
}

// ---------------------------------------------------------------------------
// getActivePromotions
// ---------------------------------------------------------------------------

export async function getActivePromotions(
	db: AnyDb,
	limit: number = DEFAULT_PROMO_LIMIT
): Promise<PromotionWithTools[]> {
	const promosRes = await db.execute<Promotion>(sql`
		SELECT id, title, description, type, code,
		       discount_type AS "discountType",
		       discount_value AS "discountValue",
		       applies_to_all AS "appliesToAll",
		       max_redemptions AS "maxRedemptions",
		       redemption_count AS "redemptionCount",
		       min_order_amount AS "minOrderAmount",
		       active,
		       starts_at AS "startsAt",
		       ends_at AS "endsAt",
		       created_at AS "createdAt",
		       updated_at AS "updatedAt"
		FROM promotion
		WHERE type = 'promotion'
		  AND active = true
		  AND (starts_at IS NULL OR starts_at <= now())
		  AND (ends_at IS NULL OR ends_at > now())
		ORDER BY created_at DESC
		LIMIT ${limit}
	`);

	const promos = promosRes.rows;
	for (const promo of promos) {
		coerceDates(promo, PROMOTION_DATE_KEYS);
	}

	// Batch-fetch all promotion_tool rows in ONE query instead of N.
	// Promotions with applies_to_all = true need no lookup.
	const targetedPromoIds = promos
		.filter((p) => !p.appliesToAll)
		.map((p) => p.id);

	// Map<promotionId, toolId[]> — empty array means "no linked tools" (promo is inert).
	const toolIdMap = new Map<string, string[]>();
	if (targetedPromoIds.length > 0) {
		const ptRes = await db.execute<{
			promotion_id: string;
			tool_id: string;
		}>(sql`
			SELECT promotion_id, tool_id
			FROM promotion_tool
			WHERE promotion_id = ANY(${arrayLiteral(targetedPromoIds, "text[]")})
		`);
		for (const row of ptRes.rows) {
			const existing = toolIdMap.get(row.promotion_id);
			if (existing) {
				existing.push(row.tool_id);
			} else {
				toolIdMap.set(row.promotion_id, [row.tool_id]);
			}
		}
	}

	// Fetch tools per promotion (N queries — necessary because each carries its own
	// discount params). Cost is now 1 + 1 + N instead of 1 + 2N.
	const result = await Promise.all(
		promos.map(async (promo): Promise<PromotionWithTools> => {
			let toolScope = sql`true`;
			if (!promo.appliesToAll) {
				const toolIds = toolIdMap.get(promo.id) ?? [];
				if (toolIds.length === 0) {
					return { ...promo, tools: [] };
				}
				toolScope = sql`t.id = ANY(${arrayLiteral(toolIds, "text[]")})`;
			}

			const tools = await fetchPromoTools(db, promo, toolScope);
			return { ...promo, tools };
		})
	);

	return result;
}

// ---------------------------------------------------------------------------
// getFeaturedPromotion — a promoção destacada no home (≤1), ativa e vigente
// ---------------------------------------------------------------------------

export async function getFeaturedPromotion(
	db: AnyDb
): Promise<PromotionWithTools | null> {
	const promosRes = await db.execute<Promotion>(sql`
		SELECT id, title, description, type, code,
		       discount_type AS "discountType",
		       discount_value AS "discountValue",
		       applies_to_all AS "appliesToAll",
		       max_redemptions AS "maxRedemptions",
		       redemption_count AS "redemptionCount",
		       min_order_amount AS "minOrderAmount",
		       active, featured,
		       starts_at AS "startsAt",
		       ends_at AS "endsAt",
		       created_at AS "createdAt",
		       updated_at AS "updatedAt"
		FROM promotion
		WHERE featured = true
		  AND type = 'promotion'
		  AND active = true
		  AND (starts_at IS NULL OR starts_at <= now())
		  AND (ends_at IS NULL OR ends_at > now())
		ORDER BY ends_at ASC NULLS LAST
		LIMIT 1
	`);

	const promo = promosRes.rows[0];
	if (!promo) {
		return null;
	}
	coerceDates(promo, PROMOTION_DATE_KEYS);

	let toolScope = sql`true`;
	if (!promo.appliesToAll) {
		const toolIdsRes = await db.execute<{ tool_id: string }>(sql`
			SELECT tool_id FROM promotion_tool WHERE promotion_id = ${promo.id}
		`);
		const toolIds = toolIdsRes.rows.map((r) => r.tool_id);
		if (toolIds.length === 0) {
			return null;
		}
		toolScope = sql`t.id = ANY(${arrayLiteral(toolIds, "text[]")})`;
	}

	const tools = await fetchPromoTools(db, promo, toolScope);
	if (tools.length === 0) {
		return null;
	}

	return { ...promo, tools };
}
