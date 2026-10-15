# ADR 0014 — RLS deny-all em todas as tabelas do schema public

**Data:** 2026-06-11
**Status:** Aceito
**Relaciona:** depende de ADR-0004 (DB compartilhada) e ADR-0009 (sync via CI); o controle de acesso de domínio fica na aplicação (ADR-0016).

## Contexto

O banco Postgres é compartilhado entre dashboard e ecommerce (ADR-0004) e roda no Supabase, que expõe toda tabela do schema `public` pela REST API do PostgREST. Sem Row Level Security, qualquer um de posse da `anon` key do projeto — que é pública por design, embarcada no front do ecommerce — consegue ler direto pela REST essas tabelas: estoque por filial (`stock_level`), margens e regras de promoção (`promotion`, `promotion_tool`), reviews, o catálogo inteiro. Em tabelas sem grants restritos, escrever também. O advisor de segurança do Supabase apontava isso como `rls_disabled_in_public` em 13 tabelas.

## Decisão

Habilitar RLS **sem criar policies** (deny-all) nessas 13 tabelas: `tool`, `tool_variant`, `tool_image`, `tool_category`, `tool_attribute_value`, `tool_attribute_assignment`, `attribute_definition`, `category`, `branch`, `stock_level`, `promotion`, `promotion_tool`, `review`. RLS habilitado sem policy nega tudo para `anon` e `authenticated` — fecha a porta REST por completo.

> Atualização 2026-07-01: `cart_event` (métricas de carrinho) entrou no mesmo regime deny-all — a lista canônica em `src/sql/rls.sql` tem agora 14 tabelas. Tabela nova exposta via PostgREST deve sempre ganhar a linha correspondente no `rls.sql`.

Isso não afeta nenhum dos dois apps porque **nenhum deles usa PostgREST**: todo acesso a dados é server-side via Drizzle sobre `DATABASE_URL`, com a role `postgres` (`rolbypassrls = true`), que ignora RLS por definição. O deny-all só atinge o caminho REST, que o produto não consome.

## Opções consideradas

- **Deny-all (escolhida)** — RLS habilitado sem policy. Fecha a porta REST sem modelar tenancy.
- **Policies RLS explícitas** — rejeitado: não há tenancy por linha a modelar aqui (o controle de acesso do dashboard é na aplicação — ver ADR-0016), então policies seriam cerimônia sem consumidor.
- **`REVOKE` de grants do `anon`** — rejeitado: redundante, o deny-all do RLS já basta.
- **`FORCE ROW LEVEL SECURITY`** — rejeitado: arriscaria o acesso server-side caso algum caminho não passe por role com BYPASSRLS.

O `ENABLE ROW LEVEL SECURITY` é versionado como SQL canônico em `packages/db/src/sql/rls.sql` no dashboard — fonte de verdade da infra DB (ADR-0009) —, aplicado por `db:sync` junto com `triggers.sql` (precedente) e espelhado pro ecommerce pelo mesmo CI de sync.

## Consequências

- O advisor de segurança deixa de reportar `rls_disabled_in_public`; passa a reportar `rls_enabled_no_policy` (INFO) nas 13 tabelas — o estado esperado para deny-all intencional.
- `packages/db/src/sql/rls.sql` é canônico no dashboard; `bun db:sync` o aplica (idempotente: `ENABLE RLS` é no-op se já habilitado).
- O CI `sync-db-schema.yml` espelha `rls.sql` pro ecommerce via PR automático, junto com schema/queries/`triggers.sql` (ADR-0009).
- Se algum dia o produto precisar consumir uma dessas tabelas via PostgREST/anon, será preciso criar policy explícita para essa tabela — não basta remover o deny-all.
- Acesso server-side (Drizzle, role `postgres` BYPASSRLS) permanece intocado.

## Atualização 2026-10-15: deny-all em todo o schema `public`

Esta seção substitui a regra da atualização de 2026-07-01 e a contagem das Consequências. O histórico acima fica como registro.

Uma consulta só de leitura ao catálogo em 2026-10-14 mostrou dois mecanismos fechando a REST:

- **RLS sem policy.** Vale nas 14 tabelas originais do `rls.sql`. Nelas, `anon` e `authenticated` têm grant, e o RLS é a única barreira.
- **Ausência de grant.** Vale nas outras 32 tabelas do schema, entre elas `client`, `client_address`, `order`, `session`, `account`, `user` e `verification`, que guardam PII e credencial de sessão. Nelas, as duas roles não têm privilégio nenhum, e não há default ACL no schema. Nenhum arquivo do repo garante esse estado. Um `GRANT` acidental, uma mudança de default do Supabase ou uma tabela nova criada com grant abriria a REST.

Decisão: o deny-all cobre toda tabela do schema `public`, não só as expostas. O `rls.sql` liga RLS sem policy em todas, e o RLS passa a ser a barreira que não depende de grant. A opção de `REVOKE` segue rejeitada como mecanismo principal: a ausência de grant existe hoje, mas é estado do banco, não regra versionada.

Regra: toda tabela nova do `public` ganha a sua linha no `rls.sql`, em ordem alfabética. O teste `packages/db/src/__tests__/rls-coverage.test.ts` compara o `rls.sql` com os `pgTable` exportados pelo schema e falha quando falta uma tabela ou sobra uma linha. `order` e `user` são palavras reservadas e vão entre aspas (`public."order"`).

Consequência nova: depois de aplicado o `rls.sql`, o advisor de segurança mostra `rls_enabled_no_policy` (INFO) em todas as tabelas do schema e nenhum `rls_disabled_in_public`.
