-- Issue #36 — Remover verifiedPurchase da Review e tornar orderId obrigatório
--
-- SQL standalone para o caminho de staging/prod. Em dev a mudança foi
-- aplicada via `bun db:push` (a migração versionada do projeto está com
-- drift pré-existente e hash mismatch — fora do escopo do #36).
--
-- A tabela `review` é compartilhada com o app ecomerce: sincronizar este
-- DDL com o repo ecomerce antes de aplicar em prod (docs/integration/admin-ecommerce.md).
--
-- O DELETE remove reviews editoriais órfãs (sem pedido); a feature editorial
-- foi removida no mesmo PR.

DELETE FROM "review" WHERE "order_id" IS NULL;
ALTER TABLE "review" ALTER COLUMN "order_id" SET NOT NULL;
ALTER TABLE "review" DROP COLUMN "verified_purchase";
