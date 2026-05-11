CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'super_admin' BEFORE 'admin';--> statement-breakpoint
CREATE TABLE "user_branch" (
	"user_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_branch_user_id_branch_id_pk" PRIMARY KEY("user_id","branch_id")
);
--> statement-breakpoint
ALTER TABLE "order_note" DROP CONSTRAINT "order_note_author_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "order_note" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status" "user_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "branch" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_branch" ADD CONSTRAINT "user_branch_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branch" ADD CONSTRAINT "user_branch_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_branch_user_idx" ON "user_branch" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_branch_branch_idx" ON "user_branch" USING btree ("branch_id");--> statement-breakpoint
ALTER TABLE "order_note" ADD CONSTRAINT "order_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_is_default_unique" ON "branch" USING btree ("is_default") WHERE "branch"."is_default" = true;