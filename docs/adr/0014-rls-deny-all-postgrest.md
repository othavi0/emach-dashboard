# RLS deny-all nas tabelas public expostas via PostgREST

O banco Postgres é compartilhado entre dashboard e ecommerce (ADR-0004) e roda no Supabase, que expõe toda tabela do schema `public` pela REST API do PostgREST. Sem Row Level Security, qualquer um de posse da `anon` key do projeto — que é pública por design, embarcada no front do ecommerce — consegue ler direto pela REST essas tabelas: estoque por filial (`stock_level`), margens e regras de promoção (`promotion`, `promotion_tool`), reviews, o catálogo inteiro. Em tabelas sem grants restritos, escrever também. O advisor de segurança do Supabase apontava isso como `rls_disabled_in_public` em 13 tabelas.

Decidimos habilitar RLS **sem criar policies** (deny-all) nessas 13 tabelas: `tool`, `tool_variant`, `tool_image`, `tool_category`, `tool_attribute_value`, `tool_attribute_assignment`, `attribute_definition`, `category`, `branch`, `stock_level`, `promotion`, `promotion_tool`, `review`. RLS habilitado sem policy nega tudo para `anon` e `authenticated` — fecha a porta REST por completo.

Isso não afeta nenhum dos dois apps porque **nenhum deles usa PostgREST**: todo acesso a dados é server-side via Drizzle sobre `DATABASE_URL`, com a role `postgres` (`rolbypassrls = true`), que ignora RLS por definição. O deny-all só atinge o caminho REST, que o produto não consome.

Não foram adotadas policies RLS explícitas: não há tenancy por linha a modelar aqui (o controle de acesso do dashboard é na aplicação, ADR-0012), então policies seriam cerimônia sem consumidor. Também não foi usado `REVOKE` de grants do `anon` (redundante — o deny-all do RLS já basta) nem `FORCE ROW LEVEL SECURITY` (arriscaria o acesso server-side caso algum caminho não passe por role com BYPASSRLS).

O `ENABLE ROW LEVEL SECURITY` é versionado como SQL canônico em `packages/db/src/sql/rls.sql` no dashboard — fonte de verdade da infra DB (ADR-0009) —, aplicado por `db:sync` junto com `triggers.sql` (precedente) e espelhado pro ecommerce pelo mesmo CI de sync.

## Consequências

- O advisor de segurança deixa de reportar `rls_disabled_in_public`; passa a reportar `rls_enabled_no_policy` (INFO) nas 13 tabelas — o estado esperado para deny-all intencional.
- `packages/db/src/sql/rls.sql` é canônico no dashboard; `bun db:sync` o aplica (idempotente: `ENABLE RLS` é no-op se já habilitado).
- O CI `sync-db-schema.yml` espelha `rls.sql` pro ecommerce via PR automático, junto com schema/queries/`triggers.sql` (ADR-0009).
- Se algum dia o produto precisar consumir uma dessas tabelas via PostgREST/anon, será preciso criar policy explícita para essa tabela — não basta remover o deny-all.
- Acesso server-side (Drizzle, role `postgres` BYPASSRLS) permanece intocado.
