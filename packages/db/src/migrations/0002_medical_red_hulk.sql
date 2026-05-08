DROP INDEX "review_client_tool_order_idx";--> statement-breakpoint
ALTER TABLE "review" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "promotion" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "promotion" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "verified_purchase" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion" ADD CONSTRAINT "promotion_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_client_tool_order_unique" UNIQUE NULLS NOT DISTINCT("client_id","tool_id","order_id");