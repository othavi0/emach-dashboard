ALTER TYPE "public"."order_status" ADD VALUE 'payment_failed';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'returned';--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "payment_status";--> statement-breakpoint
DROP TYPE "public"."payment_status";