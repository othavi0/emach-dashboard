import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const bannerLayout = pgEnum("banner_layout", [
	"split",
	"stack_left",
	"center_bottom",
	"center_mid",
	"center_cta_right",
	"mirror_split",
	"hero_center",
	"text_right",
]);

export const bannerCtaVariant = pgEnum("banner_cta_variant", [
	"red",
	"dark",
	"white",
	"ghost",
]);

// Como o fundo se comporta no mobile: herdar a imagem do desktop, usar imagem
// mobile própria, ou não exibir fundo (só o gradiente da marca).
export const bannerBackgroundMobileMode = pgEnum(
	"banner_background_mobile_mode",
	["inherit", "custom", "none"]
);

// Espelho em TS do `compositionSchema` (zod) de apps/web
// .../composition/composition-schema.ts, que é a fonte da validação. O
// `row.composition = persisted.composition` das actions de banner só compila
// enquanto o tipo inferido do zod couber aqui.
export type BannerAnchor =
	| "tl"
	| "tc"
	| "tr"
	| "ml"
	| "mc"
	| "mr"
	| "bl"
	| "bc"
	| "br";

export interface BannerElementPlacement {
	anchor: BannerAnchor;
	offsetX: number;
	offsetY: number;
	scale: number;
}

export interface BannerTextPlacement extends BannerElementPlacement {
	maxWidth?: number;
}

export interface BannerBackgroundConfig {
	focal: BannerAnchor;
	zoom: number;
}

export interface BannerHiddenElement {
	hidden: true;
}

export interface BannerCompositionData {
	desktop: {
		background: BannerBackgroundConfig;
		elements: {
			badge?: BannerTextPlacement;
			title?: BannerTextPlacement;
			subtitle?: BannerTextPlacement;
			specs?: BannerTextPlacement;
			countdown?: BannerTextPlacement;
			product?: BannerElementPlacement;
			cta?: BannerElementPlacement;
		};
	};
	mobile: {
		background?: BannerBackgroundConfig;
		elements: {
			badge?: BannerHiddenElement | BannerTextPlacement;
			title?: BannerHiddenElement | BannerTextPlacement;
			subtitle?: BannerHiddenElement | BannerTextPlacement;
			specs?: BannerHiddenElement | BannerTextPlacement;
			countdown?: BannerHiddenElement | BannerTextPlacement;
			product?: BannerHiddenElement | BannerElementPlacement;
			cta?: BannerHiddenElement | BannerElementPlacement;
		};
	};
	version: 1;
}

export const banner = pgTable(
	"banner",
	{
		id: text("id").primaryKey(),
		backgroundImageUrl: text("background_image_url"),
		backgroundImageMobileUrl: text("background_image_mobile_url"),
		backgroundMobileMode: bannerBackgroundMobileMode("background_mobile_mode")
			.notNull()
			.default("none"),
		productImageUrl: text("product_image_url"),
		productImageMobileUrl: text("product_image_mobile_url"),
		title: text("title"),
		subtitle: text("subtitle"),
		// Ficha técnica do hero: lista de strings curtas (ex: ["1200W", "800 RPM"]).
		// Renderizada como DOM no storefront (#229), não queimada na arte. null/[] = sem painel.
		specs: jsonb("specs").$type<string[]>(),
		// Composição por elemento (spec 2026-07-29). Estrutura validada por zod no app
		// (apps/web .../composition/composition-schema.ts); NULL = banner pré-backfill.
		composition: jsonb("composition").$type<BannerCompositionData | null>(),
		altText: text("alt_text"),
		badgeText: text("badge_text"),
		ctaLabel: text("cta_label"),
		ctaHref: text("cta_href"),
		ctaVariant: bannerCtaVariant("cta_variant").notNull().default("red"),
		layout: bannerLayout("layout").notNull().default("split"),
		// Escala percentual aplicada pelo storefront (scale = valor/100). Default 100 = baseline.
		productScale: integer("product_scale").notNull().default(100),
		ctaScale: integer("cta_scale").notNull().default(100),
		countdownTarget: timestamp("countdown_target", { withTimezone: true }),
		sortOrder: integer("sort_order").notNull().default(0),
		isActive: boolean("is_active").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		check(
			"banner_product_scale_bounds",
			sql`${t.productScale} between 50 and 160`
		),
		check("banner_cta_scale_bounds", sql`${t.ctaScale} between 80 and 140`),
	]
).enableRLS();

export type Banner = typeof banner.$inferSelect;

export type NewBanner = typeof banner.$inferInsert;
