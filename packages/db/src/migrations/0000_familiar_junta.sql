CREATE TYPE "public"."attribute_input_type" AS ENUM('text', 'number', 'select', 'boolean', 'numeric_range', 'color');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'manager', 'user');--> statement-breakpoint
CREATE TYPE "public"."consent_actor" AS ENUM('client', 'lead');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('tos', 'privacy', 'marketing_email', 'cookies');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'preparing', 'shipped', 'delivered', 'canceled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected', 'spam');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'apiKey', 'system');--> statement-breakpoint
CREATE TYPE "public"."voltage" AS ENUM('127V', '220V', 'Bivolt', '380V');--> statement-breakpoint
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
CREATE TABLE "attribute_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"input_type" "attribute_input_type" NOT NULL,
	"unit" text,
	"options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"category_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attribute_definition_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tool_attribute_assignment" (
	"tool_id" text NOT NULL,
	"attribute_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_attribute_assignment_tool_id_attribute_id_pk" PRIMARY KEY("tool_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "tool_attribute_value" (
	"tool_id" text NOT NULL,
	"attribute_id" text NOT NULL,
	"value_text" text,
	"value_numeric" numeric(14, 4),
	"value_numeric_max" numeric(14, 4),
	"value_bool" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_attribute_value_tool_id_attribute_id_pk" PRIMARY KEY("tool_id","attribute_id"),
	CONSTRAINT "value_at_least_one" CHECK ("tool_attribute_value"."value_text" IS NOT NULL OR "tool_attribute_value"."value_numeric" IS NOT NULL OR "tool_attribute_value"."value_bool" IS NOT NULL),
	CONSTRAINT "numeric_range_order" CHECK ("tool_attribute_value"."value_numeric_max" IS NULL OR ("tool_attribute_value"."value_numeric" IS NOT NULL AND "tool_attribute_value"."value_numeric_max" >= "tool_attribute_value"."value_numeric"))
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
	"variant_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"min_qty" integer DEFAULT 0 NOT NULL,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_level_variant_id_branch_id_pk" PRIMARY KEY("variant_id","branch_id"),
	CONSTRAINT "min_qty_non_negative" CHECK ("stock_level"."min_qty" >= 0),
	CONSTRAINT "reorder_point_non_negative" CHECK ("stock_level"."reorder_point" >= 0),
	CONSTRAINT "reorder_gte_min" CHECK ("stock_level"."reorder_point" >= "stock_level"."min_qty"),
	CONSTRAINT "quantity_non_negative" CHECK ("stock_level"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"client_id" text NOT NULL,
	"branch_id" text,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"payment_provider_ref" text,
	"subtotal_amount" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"shipping_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"shipping_method" text,
	"shipping_tracking_code" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"shipped_at" timestamp,
	"delivered_at" timestamp,
	"canceled_at" timestamp,
	CONSTRAINT "order_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"tool_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"model" text,
	"voltage" text,
	"unit_price" numeric(12, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cost" numeric(12, 2),
	"ncm" text,
	"cest" text,
	"manufacturer_name" text,
	"weight_kg" numeric(10, 3),
	"length_cm" numeric(10, 2),
	"width_cm" numeric(10, 2),
	"height_cm" numeric(10, 2),
	CONSTRAINT "quantity_positive" CHECK ("order_item"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_note" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"from_status" "order_status" NOT NULL,
	"to_status" "order_status" NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" text,
	"actor_api_key_id" text,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "actor_coherence" CHECK ((
				("order_status_history"."actor_type" = 'user'   AND "order_status_history"."actor_user_id"   IS NOT NULL AND "order_status_history"."actor_api_key_id" IS NULL)
				OR ("order_status_history"."actor_type" = 'apiKey' AND "order_status_history"."actor_api_key_id" IS NOT NULL AND "order_status_history"."actor_user_id" IS NULL)
				OR ("order_status_history"."actor_type" = 'system' AND "order_status_history"."actor_user_id" IS NULL  AND "order_status_history"."actor_api_key_id" IS NULL)
			))
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
CREATE TABLE "review" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_id" text NOT NULL,
	"client_id" text NOT NULL,
	"order_id" text NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"moderated_by" text,
	"moderated_at" timestamp,
	"moderation_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rating_range" CHECK ("review"."rating" >= 1 AND "review"."rating" <= 5)
);
--> statement-breakpoint
CREATE TABLE "stock_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"variant_id" text,
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
	"model" text,
	"invoice_model" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"power_watts" integer,
	"weight_kg" numeric(10, 3),
	"length_cm" numeric(10, 2),
	"width_cm" numeric(10, 2),
	"height_cm" numeric(10, 2),
	"manufacturer_name" text,
	"country_of_origin" text,
	"hs_code" text,
	"ncm" text,
	"cest" text,
	"visible_on_site" boolean DEFAULT true NOT NULL,
	"supplier_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_slug_unique" UNIQUE("slug"),
	CONSTRAINT "valid_tool_status" CHECK ("tool"."status" IN ('draft','active','discontinued','out_of_stock')),
	CONSTRAINT "weight_positive" CHECK ("tool"."weight_kg" IS NULL OR "tool"."weight_kg" >= 0),
	CONSTRAINT "dimensions_positive" CHECK (("tool"."length_cm" IS NULL OR "tool"."length_cm" >= 0) AND ("tool"."width_cm" IS NULL OR "tool"."width_cm" >= 0) AND ("tool"."height_cm" IS NULL OR "tool"."height_cm" >= 0)),
	CONSTRAINT "power_watts_positive" CHECK ("tool"."power_watts" IS NULL OR "tool"."power_watts" >= 0)
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
CREATE TABLE "tool_variant" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_id" text NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"voltage" "voltage",
	"price_amount" numeric(10, 2) NOT NULL,
	"cost_amount" numeric(10, 2),
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_variant_sku_unique" UNIQUE("sku"),
	CONSTRAINT "tool_variant_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "tool_variant_tool_sort_unique" UNIQUE("tool_id","sort_order"),
	CONSTRAINT "price_amount_positive" CHECK ("tool_variant"."price_amount" >= 0),
	CONSTRAINT "cost_amount_positive" CHECK ("tool_variant"."cost_amount" IS NULL OR "tool_variant"."cost_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_definition" ADD CONSTRAINT "attribute_definition_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_attribute_assignment" ADD CONSTRAINT "tool_attribute_assignment_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_attribute_assignment" ADD CONSTRAINT "tool_attribute_assignment_attribute_id_attribute_definition_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attribute_definition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_attribute_value" ADD CONSTRAINT "tool_attribute_value_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_attribute_value" ADD CONSTRAINT "tool_attribute_value_attribute_id_attribute_definition_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attribute_definition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_category" ADD CONSTRAINT "tool_category_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_category" ADD CONSTRAINT "tool_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_account" ADD CONSTRAINT "client_account_user_id_client_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_address" ADD CONSTRAINT "client_address_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_session" ADD CONSTRAINT "client_session_user_id_client_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_log" ADD CONSTRAINT "consent_log_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_variant_id_tool_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."tool_variant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_level" ADD CONSTRAINT "stock_level_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_variant_id_tool_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."tool_variant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_note" ADD CONSTRAINT "order_note_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_note" ADD CONSTRAINT "order_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_api_key_id_api_key_id_fk" FOREIGN KEY ("actor_api_key_id") REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_tool" ADD CONSTRAINT "promotion_tool_promotion_id_promotion_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_tool" ADD CONSTRAINT "promotion_tool_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_moderated_by_user_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_variant_id_tool_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."tool_variant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_order_item_id_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_key"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool" ADD CONSTRAINT "tool_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_image" ADD CONSTRAINT "tool_image_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_variant" ADD CONSTRAINT "tool_variant_tool_id_tool_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tool"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_key_hash_idx" ON "api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_key_scopes_idx" ON "api_key" USING gin ("scopes");--> statement-breakpoint
CREATE INDEX "attribute_definition_category_idx" ON "attribute_definition" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "attribute_definition_input_type_idx" ON "attribute_definition" USING btree ("input_type");--> statement-breakpoint
CREATE INDEX "tool_attribute_assignment_tool_idx" ON "tool_attribute_assignment" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "tool_attribute_value_attribute_idx" ON "tool_attribute_value" USING btree ("attribute_id","value_numeric");--> statement-breakpoint
CREATE INDEX "tool_attribute_value_attribute_text_idx" ON "tool_attribute_value" USING btree ("attribute_id","value_text");--> statement-breakpoint
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
CREATE INDEX "stock_level_variant_id_idx" ON "stock_level" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_level_branch_id_idx" ON "stock_level" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "order_client_id_idx" ON "order" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "order_branch_id_idx" ON "order" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "order_status_created_idx" ON "order" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "order_number_idx" ON "order" USING btree ("number");--> statement-breakpoint
CREATE INDEX "order_item_order_id_idx" ON "order_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_note_order_idx" ON "order_note" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "review_client_tool_order_idx" ON "review" USING btree ("client_id","tool_id","order_id");--> statement-breakpoint
CREATE INDEX "review_tool_id_idx" ON "review" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "review_status_created_idx" ON "review" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movement_variant_created_idx" ON "stock_movement" USING btree ("variant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movement_order_idx" ON "stock_movement" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_movement_actor_idx" ON "stock_movement" USING btree ("actor_type","actor_id","api_key_id");--> statement-breakpoint
CREATE INDEX "tool_supplier_id_idx" ON "tool" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "tool_model_idx" ON "tool" USING btree ("model");--> statement-breakpoint
CREATE INDEX "tool_invoice_model_idx" ON "tool" USING btree ("invoice_model");--> statement-breakpoint
CREATE INDEX "tool_ncm_idx" ON "tool" USING btree ("ncm");--> statement-breakpoint
CREATE INDEX "tool_status_idx" ON "tool" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tool_image_tool_sort_idx" ON "tool_image" USING btree ("tool_id","sort_order");--> statement-breakpoint
CREATE INDEX "tool_variant_tool_id_idx" ON "tool_variant" USING btree ("tool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_variant_one_default_per_tool" ON "tool_variant" USING btree ("tool_id") WHERE "tool_variant"."is_default" = true;