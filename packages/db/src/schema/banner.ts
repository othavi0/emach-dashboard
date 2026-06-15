import {
	boolean,
	integer,
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
]);

export const bannerCtaVariant = pgEnum("banner_cta_variant", [
	"red",
	"dark",
	"white",
	"ghost",
]);

export const banner = pgTable("banner", {
	id: text("id").primaryKey(),
	backgroundImageUrl: text("background_image_url"),
	backgroundImageMobileUrl: text("background_image_mobile_url"),
	productImageUrl: text("product_image_url"),
	productImageMobileUrl: text("product_image_mobile_url"),
	title: text("title"),
	subtitle: text("subtitle"),
	altText: text("alt_text"),
	badgeText: text("badge_text"),
	ctaLabel: text("cta_label"),
	ctaHref: text("cta_href"),
	ctaVariant: bannerCtaVariant("cta_variant").notNull().default("red"),
	layout: bannerLayout("layout").notNull().default("split"),
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
});

export type Banner = typeof banner.$inferSelect;
export type NewBanner = typeof banner.$inferInsert;
