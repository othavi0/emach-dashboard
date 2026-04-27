CREATE TYPE "public"."user_role" AS ENUM('admin', 'manager', 'user');--> statement-breakpoint
CREATE TYPE "public"."consent_actor" AS ENUM('client', 'lead');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('tos', 'privacy', 'marketing_email', 'cookies');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'apiKey', 'system');--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"image_url" text,
	"path" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "category_slug_unique" UNIQUE("slug"),
	CONSTRAINT "parent_neq_self" CHECK ("category"."parent_id" IS NULL OR "category"."parent_id" <> "category"."id"),
	CONSTRAINT "depth_max_5" CHECK ("category"."depth" >= 0 AND "category"."depth" <= 5)
);
--> statement-breakpoint
CREATE TABLE "tool_category" (
	"tool_id" text NOT NULL,
	"category_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tool_category_tool_id_category_id_pk" PRIMARY KEY("tool_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone" text,
	"document" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_email_unique" UNIQUE("email"),
	CONSTRAINT "client_document_unique" UNIQUE("document")
);
--> statement-breakpoint
CREATE TABLE "client_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_address" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"label" text,
	"recipient" text NOT NULL,
	"zip_code" text NOT NULL,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text,
	"neighborhood" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"country" text DEFAULT 'BR' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "client_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "client_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_type" "consent_actor" NOT NULL,
	"client_id" text,
	"lead_id" text,
	"kind" "consent_kind" NOT NULL,
	"granted" boolean NOT NULL,
	"version" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "consent_actor_coherence" CHECK (("consent_log"."actor_type" = 'client' AND "consent_log"."client_id" IS NOT NULL AND "consent_log"."lead_id" IS NULL)
				OR ("consent_log"."actor_type" = 'lead' AND "consent_log"."lead_id" IS NOT NULL AND "consent_log"."client_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "branch" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_level" (
	"tool_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"min_qty" integer DEFAULT 0 NOT NULL,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_level_tool_id_branch_id_pk" PRIMARY KEY("tool_id","branch_id"),
	CONSTRAINT "min_qty_non_negative" CHECK ("stock_level"."min_qty" >= 0),
	CONSTRAINT "reorder_point_non_negative" CHECK ("stock_level"."reorder_point" >= 0),
	CONSTRAINT "reorder_gte_min" CHECK ("stock_level"."reorder_point" >= "stock_level"."min_qty"),
	CONSTRAINT "quantity_non_negative" CHECK ("stock_level"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "promotion" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'promotion' NOT NULL,
	"code" text,
	"discount_pct" numeric(5, 2) NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_code_unique" UNIQUE("code"),
	CONSTRAINT "valid_promotion_type" CHECK ("promotion"."type" IN ('promotion', 'promocode')),
	CONSTRAINT "discount_pct_range" CHECK ("promotion"."discount_pct" > 0 AND "promotion"."discount_pct" <= 100),
	CONSTRAINT "ends_after_starts" CHECK ("promotion"."ends_at" IS NULL OR "promotion"."starts_at" IS NULL OR "promotion"."ends_at" > "promotion"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "promotion_tool" (
	"promotion_id" text NOT NULL,
	"tool_id" text NOT NULL,
	CONSTRAINT "promotion_tool_promotion_id_tool_id_pk" PRIMARY KEY("promotion_id","tool_id")
);
--> statement-breakpoint
CREATE TABLE "stock_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_id" text,
	"branch_id" text,
	"previous_qty" integer NOT NULL,
	"new_qty" integer NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"reason_note" text,
	"order_id" text,
	"order_item_id" text,
	"actor_type" "actor_type" DEFAULT 'system' NOT NULL,
	"actor_id" text,
	"api_key_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delta_non_zero" CHECK ("stock_movement"."delta" <> 0),
	CONSTRAINT "actor_coherence" CHECK ((
				("stock_movement"."actor_type" = 'user'   AND "stock_movement"."actor_id"   IS NOT NULL AND "stock_movement"."api_key_id" IS NULL)
				OR ("stock_movement"."actor_type" = 'apiKey' AND "stock_movement"."api_key_id" IS NOT NULL AND "stock_movement"."actor_id" IS NULL)
				OR ("stock_movement"."actor_type" = 'system' AND "stock_movement"."actor_id" IS NULL  AND "stock_movement"."api_key_id" IS NULL)
			))
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"sku" text,
	"model" text,
	"invoice_model" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"voltage" text,
	"power_watts" integer,
	"frequency_hz" integer,
	"warranty_months" integer,
	"weight_kg" numeric(10, 3),
	"length_cm" numeric(10, 2),
	"width_cm" numeric(10, 2),
	"height_cm" numeric(10, 2),
	"barcode" text,
	"manufacturer_name" text,
	"country_of_origin" text,
	"hs_code" text,
	"ncm" text,
	"cest" text,
	"price" numeric(10, 2),
	"cost" numeric(10, 2),
	"visible_on_site" boolean DEFAULT true NOT NULL,
	"supplier_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tool_sku_unique" UNIQUE("sku"),
	CONSTRAINT "tool_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "valid_tool_status" CHECK ("tool"."status" IN ('draft','active','discontinued','out_of_stock')),
	CONSTRAINT "weight_positive" CHECK ("tool"."weight_kg" IS NULL OR "tool"."weight_kg" >= 0),
	CONSTRAINT "dimensions_positive" CHECK (("tool"."length_cm" IS NULL OR "tool"."length_cm" >= 0) AND ("tool"."width_cm" IS NULL OR "tool"."width_cm" >= 0) AND ("tool"."height_cm" IS NULL OR "tool"."height_cm" >= 0)),
	CONSTRAINT "power_watts_positive" CHECK ("tool"."power_watts" IS NULL OR "tool"."power_watts" >= 0),
	CONSTRAINT "frequency_hz_positive" CHECK ("tool"."frequency_hz" IS NULL OR "tool"."frequency_hz" >= 0),
	CONSTRAINT "warranty_months_positive" CHECK ("tool"."warranty_months" IS NULL OR "tool"."warranty_months" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tool_image" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_id" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_image_tool_sort_unique" UNIQUE("tool_id","sort_order")
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_category" ADD CONSTRAINT "tool_category_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_category" ADD CONSTRAINT "tool_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_account" ADD CONSTRAINT "client_account_user_id_client_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_address" ADD CONSTRAINT "client_address_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_session" ADD CONSTRAINT "client_session_user_id_client_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_log" ADD CONSTRAINT "consent_log_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_tool" ADD CONSTRAINT "promotion_tool_promotion_id_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_tool" ADD CONSTRAINT "promotion_tool_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_image" ADD CONSTRAINT "tool_image_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_key_hash_idx" ON "api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_key_scopes_idx" ON "api_key" USING gin ("scopes");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "category_parent_idx" ON "category" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "category_path_idx" ON "category" USING btree ("path");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_category_one_primary" ON "tool_category" USING btree ("tool_id") WHERE "tool_category"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "client_account_userId_idx" ON "client_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "client_address_clientId_idx" ON "client_address" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_session_userId_idx" ON "client_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "client_verification_identifier_idx" ON "client_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "consent_log_client_idx" ON "consent_log" USING btree ("client_id","kind","granted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "consent_log_lead_idx" ON "consent_log" USING btree ("lead_id","kind","granted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_level_tool_id_idx" ON "stock_level" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "stock_level_branch_id_idx" ON "stock_level" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "stock_movement_tool_created_idx" ON "stock_movement" USING btree ("tool_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movement_order_idx" ON "stock_movement" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_movement_actor_idx" ON "stock_movement" USING btree ("actor_type","actor_id","api_key_id");--> statement-breakpoint
CREATE INDEX "tool_supplier_id_idx" ON "tool" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "tool_model_idx" ON "tool" USING btree ("model");--> statement-breakpoint
CREATE INDEX "tool_invoice_model_idx" ON "tool" USING btree ("invoice_model");--> statement-breakpoint
CREATE INDEX "tool_ncm_idx" ON "tool" USING btree ("ncm");--> statement-breakpoint
CREATE INDEX "tool_status_idx" ON "tool" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tool_image_tool_sort_idx" ON "tool_image" USING btree ("tool_id","sort_order");