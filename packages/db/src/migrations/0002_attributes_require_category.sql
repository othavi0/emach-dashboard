-- Cria categoria-raiz "Geral" (idempotente). path/depth são preenchidos pelo trigger;
-- INSERT explícito aqui só por garantia em ambientes onde o trigger ainda não rodou.
INSERT INTO category (id, slug, name, path, depth, is_active, sort_order)
SELECT gen_random_uuid(), 'geral', 'Geral', '/geral', 0, true, 0
WHERE NOT EXISTS (SELECT 1 FROM category WHERE slug = 'geral');
--> statement-breakpoint
-- Move atributos atualmente globais para "Geral".
UPDATE attribute_definition
   SET category_id = (SELECT id FROM category WHERE slug = 'geral')
 WHERE category_id IS NULL;
--> statement-breakpoint
ALTER TABLE "attribute_definition" ALTER COLUMN "category_id" SET NOT NULL;
