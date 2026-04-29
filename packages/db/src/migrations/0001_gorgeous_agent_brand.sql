ALTER TABLE "tool_variant" DROP CONSTRAINT "tool_variant_barcode_unique";--> statement-breakpoint
ALTER TABLE "tool" DROP COLUMN "country_of_origin";--> statement-breakpoint
ALTER TABLE "tool_variant" DROP COLUMN "barcode";