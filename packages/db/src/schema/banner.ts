import {
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const banner = pgTable("banner", {
	id: text("id").primaryKey(),
	backgroundImageUrl: text("background_image_url").notNull(),
	backgroundImageMobileUrl: text("background_image_mobile_url"),
	productImageUrl: text("product_image_url"),
	productImageMobileUrl: text("product_image_mobile_url"),
	title: text("title").notNull(),
	subtitle: text("subtitle"),
	altText: text("alt_text").notNull(),
	ctaLabel: text("cta_label").notNull(),
	ctaHref: text("cta_href").notNull(),
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
