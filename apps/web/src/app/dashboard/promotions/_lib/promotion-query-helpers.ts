import type { db } from "@emach/db";
import { promotion } from "@emach/db/schema/promotions";
import { type AnyColumn, and, eq, ne, type sql } from "drizzle-orm";
import { isCapabilityError } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import type { Cursor } from "@/lib/cursor";
import { logger } from "@/lib/logger";
import type { PromotionFormValues } from "../_components/promotion-schema";
import { computeStatus } from "./featured-home";
import { featuredConflictMessage } from "./featured-message";
import type { PromotionSort, PromotionStatus } from "./promotion-types";

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export function dbErrorMessage(error: unknown): string {
	logger.error("promotions", error);
	return "Erro ao processar operação. Tente novamente.";
}

export function safeRequireRole(error: unknown): ActionResult<never> {
	if (isCapabilityError(error)) {
		return { ok: false, error: "Acesso negado" };
	}
	throw error;
}

export function conflict(message: string): never {
	throw new Error(`CONFLICT:${message}`);
}

// ---------------------------------------------------------------------------
// Transaction type
// ---------------------------------------------------------------------------

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Uniqueness guards (tx-scoped)
// ---------------------------------------------------------------------------

export async function assertTitleUnique(
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

export async function assertCodeUnique(
	tx: Tx,
	code: string,
	excludeId?: string
) {
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

// ---------------------------------------------------------------------------
// Coupon fields builder
// ---------------------------------------------------------------------------

// Campos exclusivos de cupom (promocode). Em promoção automática são sempre
// null. Centralizado para create/update não divergirem.
export function buildCouponFields(data: PromotionFormValues): {
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

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/**
 * Bloqueia marcar uma promoção como destaque enquanto já houver outro destaque
 * vivo (status active ou scheduled). O índice único do banco garante 1 destaque;
 * aqui damos a mensagem amigável antes de tentar o flip-off.
 */
export async function assertFeaturedSlotFree(tx: Tx, excludeId?: string) {
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

// ---------------------------------------------------------------------------
// SQL status predicate
// ---------------------------------------------------------------------------

// Predicado SQL de status, compartilhado entre fetchPromotionsPage (filtro da
// lista) e getPromotionStatusCounts (contagens das tabs) para não divergirem.
// `cols` são as colunas (p relacional ou a tabela promotion); `sqlTag` é o sql
// do contexto (ops.sql na query relacional, sql global no select agregado).
export interface PromotionStatusCols {
	active: AnyColumn;
	endsAt: AnyColumn;
	startsAt: AnyColumn;
}

export function promotionStatusCondition(
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
// Cursor builder
// ---------------------------------------------------------------------------

export function makePromotionCursor(
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
