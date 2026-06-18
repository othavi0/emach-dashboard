# ADR 0009 — Schema do ecommerce sincroniza do dashboard via CI (PR automático)

**Data:** 2026-05-18
**Status:** Aceito
**Relaciona:** ADR-0004 (DB compartilhada), ADR-0006 (push-only).

## Contexto

O dashboard e o site e-commerce são monorepos separados que compartilham o mesmo banco Postgres (ADR-0004), e cada um tem sua própria cópia das definições Drizzle em `packages/db/src/`. Essa cópia era sincronizada à mão — a `packages/db/CLAUDE.md` instruía "cópia byte-a-byte manual a cada mudança" — e o drift virou inevitável: em 2026-05-18, 8 de 13 arquivos de `schema/` divergiam entre os repos, e a própria doc do ecommerce ainda mencionava `apiKey` e migrations (ambos removidos). Como o `db:push` espelha a branch em checkout (ADR-0006), quem faz push por último define o banco e o outro app fica com types mentindo.

## Decisão

Automatizar: um GitHub Action no repo `emach-dashboard` (fonte de verdade), disparado em push na `main` quando `packages/db/src/**` muda, abre um Pull Request no repo `emach-ecommerce` espelhando `schema/`, `queries/` e `sql/triggers.sql`.

Os repos seguem separados — os deploys são independentes e o dashboard vai virar ferramenta interna além de site. Por isso não foi adotado nem o monorepo único (juntaria os deploys) nem o pacote `@emach/db` publicado num registry (cobra cerimônia de `publish`/versão sem haver consumidor externo nem produção — ver ADR-0006). O espelhamento via CI é a menor mudança que elimina o sync manual sem inventar modelo mental novo.

A direção é unidirecional: dashboard → ecommerce. Mudança de schema sempre nasce no dashboard. O ecommerce recebe o `schema/` inteiro — inclusive tabelas só do dashboard (`auth`, `client-audit`, `client-export`) — para que agentes e devs tenham o retrato completo do banco. A invariante "ecommerce nunca importa `@emach/db/schema/auth`" continua valendo: ela é sobre import no código do app, não sobre o arquivo existir no repo.

## Consequências

- Mudanças de schema, queries (`catalog.ts`, `reviews.ts`) e `sql/triggers.sql` no dashboard geram um PR automático no ecommerce; basta revisar e mergear.
- A entrega é via PR, não commit direto: o CI do ecommerce roda no PR e pega quebra de código local contra o schema novo antes de entrar na `main`.
- O ecommerce passa a guardar triggers em `sql/triggers.sql` (antes `migrations/_triggers.sql`); a pasta morta `migrations/` é removida.
- Um job de CI no ecommerce falha se `packages/db/src/{schema,sql,queries}` divergir do `main` do dashboard — pega o caso de PR de sync esquecido sem mergear.
- Não se edita schema/queries/triggers isoladamente no ecommerce; toda mudança começa no dashboard.
- Quando produção entrar no horizonte (ADR-0006), o mesmo Action passa a espelhar também a pasta de migrations versionadas.
