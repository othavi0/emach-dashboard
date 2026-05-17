-- Migration: remoção das estruturas legadas de API Key (issue #37, ADR-0004).
-- Admin e e-commerce só compartilham banco, sem API entre eles. `api_key` é legado.
-- ATENÇÃO: assume o estado atual do banco (dev/staging/prod). NÃO é replay-safe
-- a partir de um banco limpo — o histórico 0001-0004 está stale (tabelas como
-- client_audit_log entraram via `db:push` sem migration versionada). Reconstruir
-- o baseline de migrations antes de provisionar ambiente novo via `drizzle-kit migrate`.

-- 1. DROP das FKs actor_api_key_id / api_key_id -> api_key
ALTER TABLE "client_audit_log" DROP CONSTRAINT "client_audit_log_actor_api_key_id_api_key_id_fk";--> statement-breakpoint
ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_actor_api_key_id_api_key_id_fk";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_api_key_id_api_key_id_fk";--> statement-breakpoint

-- 2. DROP dos CHECKs actor_coherence antigos (referenciam coluna api_key)
ALTER TABLE "client_audit_log" DROP CONSTRAINT "client_audit_actor_coherence";--> statement-breakpoint
ALTER TABLE "order_status_history" DROP CONSTRAINT "actor_coherence";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "actor_coherence";--> statement-breakpoint

-- 3. DROP do índice de actor (recriado adiante sem api_key_id)
DROP INDEX "stock_movement_actor_idx";--> statement-breakpoint

-- 4. DROP das colunas de API Key
ALTER TABLE "client_audit_log" DROP COLUMN "actor_api_key_id";--> statement-breakpoint
ALTER TABLE "order_status_history" DROP COLUMN "actor_api_key_id";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP COLUMN "api_key_id";--> statement-breakpoint

-- 5. DROP da tabela api_key
DROP TABLE "api_key";--> statement-breakpoint

-- 6. Recriação do tipo actor_type sem 'apiKey'
-- (Postgres não suporta ALTER TYPE ... DROP VALUE — recriar o tipo.)
-- Pré-condição: nunca houve CRUD de API Key, logo não há linhas com actor_type = 'apiKey'.
ALTER TYPE "public"."actor_type" RENAME TO "actor_type_old";--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'system');--> statement-breakpoint
ALTER TABLE "client_audit_log"
	ALTER COLUMN "actor_type" TYPE "public"."actor_type"
	USING "actor_type"::text::"public"."actor_type";--> statement-breakpoint
ALTER TABLE "order_status_history"
	ALTER COLUMN "actor_type" TYPE "public"."actor_type"
	USING "actor_type"::text::"public"."actor_type";--> statement-breakpoint
-- stock_movement.actor_type tem DEFAULT 'system' — dropar antes do cast, re-adicionar depois
ALTER TABLE "stock_movement" ALTER COLUMN "actor_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stock_movement"
	ALTER COLUMN "actor_type" TYPE "public"."actor_type"
	USING "actor_type"::text::"public"."actor_type";--> statement-breakpoint
ALTER TABLE "stock_movement" ALTER COLUMN "actor_type" SET DEFAULT 'system';--> statement-breakpoint
DROP TYPE "public"."actor_type_old";--> statement-breakpoint

-- 7. Recriação do índice e dos CHECKs actor_coherence simplificados
CREATE INDEX "stock_movement_actor_idx" ON "stock_movement" USING btree ("actor_type","actor_id");--> statement-breakpoint
ALTER TABLE "client_audit_log" ADD CONSTRAINT "client_audit_actor_coherence" CHECK ((
				("client_audit_log"."actor_type" = 'user'   AND "client_audit_log"."actor_user_id" IS NOT NULL)
				OR ("client_audit_log"."actor_type" = 'system' AND "client_audit_log"."actor_user_id" IS NULL)
			));--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "actor_coherence" CHECK ((
				("order_status_history"."actor_type" = 'user'   AND "order_status_history"."actor_user_id" IS NOT NULL)
				OR ("order_status_history"."actor_type" = 'system' AND "order_status_history"."actor_user_id" IS NULL)
			));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "actor_coherence" CHECK ((
				("stock_movement"."actor_type" = 'user'   AND "stock_movement"."actor_id" IS NOT NULL)
				OR ("stock_movement"."actor_type" = 'system' AND "stock_movement"."actor_id" IS NULL)
			));
