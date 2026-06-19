import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Voltage } from "../schema/tools";

// Helpers internos compartilhados entre queries de catálogo.
// Não exportar via @emach/db — uso exclusivo dentro de queries/.

export const TOOL_DATE_KEYS = ["createdAt", "updatedAt"] as const;
export const VARIANT_DATE_KEYS = ["createdAt", "updatedAt"] as const;
export const IMAGE_DATE_KEYS = ["createdAt"] as const;
export const CATEGORY_DATE_KEYS = ["createdAt", "updatedAt"] as const;
export const PROMOTION_DATE_KEYS = [
	"startsAt",
	"endsAt",
	"createdAt",
	"updatedAt",
] as const;
export const REVIEW_DATE_KEYS = [
	"moderatedAt",
	"createdAt",
	"updatedAt",
] as const;

export type AnyDb = NodePgDatabase<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STOREFRONT_TOOL_STATUSES = ["active", "discontinued"] as const;
export const APPROVED = "approved" as const;
export const DEFAULT_LIST_LIMIT = 24;
export const DEFAULT_SEARCH_LIMIT = 8;
export const DEFAULT_PROMO_LIMIT = 4;
export const TOOLS_PER_PROMO = 4;

// ---------------------------------------------------------------------------
// Scalar helpers
// ---------------------------------------------------------------------------

export function toNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) {
		return null;
	}
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

export function toBoolean(value: unknown): boolean {
	return value === true || value === "t" || value === "true" || value === 1;
}

// Postgres ARRAY[$1, $2, ...]::T[] — interpolar array TS direto em
// drizzle-orm vira tupla `($1, $2)` que Postgres recusa em ANY()/= ANY().
export function arrayLiteral<T>(values: T[], castType: string) {
	return sql`ARRAY[${sql.join(
		values.map((v) => sql`${v}`),
		sql`, `
	)}]::${sql.raw(castType)}`;
}

export const REVIEWER_NAME_SPLIT_RE = /\s+/;

// SQL fragments shared by getTools / getRecentTools / getActivePromotions
export const STOREFRONT_STATUS_SQL = sql`t.status IN ('active','discontinued')`;

// ---------------------------------------------------------------------------
// ToolListRow — used by tools.ts and promotions.ts
// ---------------------------------------------------------------------------

// biome-ignore lint/style/useConsistentTypeDefinitions: precisa satisfazer Record<string, unknown> de db.execute<T>
export type ToolListRow = {
	active_promotion_id: string | null;
	avg_rating: string | null;
	cat_id: string | null;
	cat_name: string | null;
	cat_slug: string | null;
	discounted_amount: string | null;
	has_other_variants: boolean;
	id: string;
	in_stock: boolean;
	name: string;
	primary_image_url: string | null;
	review_count: number | string;
	slug: string;
	status: string;
	variant_id: string;
	variant_price: string;
	variant_sku: string;
	variant_voltage: Voltage | null;
};

// ---------------------------------------------------------------------------
// rowToToolListItem — used by tools.ts and promotions.ts
// ---------------------------------------------------------------------------

export interface ToolListItem {
	activePromotionId: string | null;
	avgRating: number | null;
	defaultVariant: {
		id: string;
		sku: string;
		voltage: Voltage | null;
		priceAmount: string;
		discountedAmount: string | null;
	};
	hasOtherVariants: boolean;
	id: string;
	inStock: boolean;
	name: string;
	primaryCategory: { id: string; slug: string; name: string } | null;
	primaryImage: { url: string } | null;
	reviewCount: number;
	slug: string;
	status: string;
}

export function rowToToolListItem(row: ToolListRow): ToolListItem {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		status: row.status,
		primaryCategory:
			row.cat_id && row.cat_slug && row.cat_name
				? { id: row.cat_id, slug: row.cat_slug, name: row.cat_name }
				: null,
		defaultVariant: {
			id: row.variant_id,
			sku: row.variant_sku,
			voltage: row.variant_voltage,
			priceAmount: row.variant_price,
			discountedAmount: row.discounted_amount,
		},
		hasOtherVariants: toBoolean(row.has_other_variants),
		primaryImage: row.primary_image_url ? { url: row.primary_image_url } : null,
		inStock: toBoolean(row.in_stock),
		avgRating: toNullableNumber(row.avg_rating),
		reviewCount: Number(row.review_count) || 0,
		activePromotionId: row.active_promotion_id,
	};
}

// ---------------------------------------------------------------------------
// formatReviewerName — used by reviews.ts
// ---------------------------------------------------------------------------

export function formatReviewerName(fullName: string): string {
	const trimmed = fullName.trim();
	if (trimmed === "") {
		return "Anônimo";
	}
	const parts = trimmed.split(REVIEWER_NAME_SPLIT_RE);
	if (parts.length === 1) {
		return parts[0] ?? trimmed;
	}
	const first = parts[0] ?? "";
	const last = parts.at(-1) ?? "";
	const initial = last.charAt(0).toUpperCase();
	return initial === "" ? first : `${first} ${initial}.`;
}
