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
);

export type Banner = typeof banner.$inferSelect;
export type NewBanner = typeof banner.$inferInsert;
