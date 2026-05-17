-- Issue #41 — Remoção das categorias-raiz catch-all `sem-categoria` e `geral`.
--
-- Decisão de domínio (CONTEXT.md, "Ambiguidades resolvidas"): toda Tool deve ter
-- >=1 Category real; não existe categoria-raiz catch-all. A investigação da issue
-- #39 confirmou 0 attribute definitions e 0 tools sob esses dois nós — nada a
-- realojar. `sem-categoria` vinha do seed (removido nesta mesma branch);
-- `geral` é resquício de uma migration antiga e nunca esteve no seed.
--
-- Aplicação: manual, antes de `bun db:migrate` (padrão manual-migrations/).
--
-- Pré-condições — rodar antes de aplicar; TODAS devem retornar 0:
--   SELECT count(*) FROM category WHERE parent_id IN
--     (SELECT id FROM category WHERE slug IN ('sem-categoria', 'geral'));
--   SELECT count(*) FROM tool_category WHERE category_id IN
--     (SELECT id FROM category WHERE slug IN ('sem-categoria', 'geral'));
--   SELECT count(*) FROM attribute_definition WHERE category_id IN
--     (SELECT id FROM category WHERE slug IN ('sem-categoria', 'geral'));
--
-- Nota de segurança: `tool_category.category_id` e `attribute_definition.category_id`
-- têm FK `onDelete: "restrict"` — se algo ainda referenciar os catch-alls, este
-- DELETE falha de forma explícita em vez de apagar dados em silêncio.

DELETE FROM "category" WHERE "slug" IN ('sem-categoria', 'geral');

-- Validação pós-execução — deve retornar 0:
--   SELECT count(*) FROM category WHERE slug IN ('sem-categoria', 'geral');
