# Agents — packages/db

> **Fonte canônica:** `packages/db/CLAUDE.md` (convenções de schema deste workspace) + `.claude/CLAUDE.md` no root (regras gerais do monorepo). Esse arquivo é o ponto de entrada para agentes que não auto-descobrem `CLAUDE.md`.

## Quick reference

Drizzle 0.45 + node-postgres + Supabase Postgres. Schemas em `src/schema/*.ts`, agrupados por domínio. Barrel `src/schema/index.ts` é **intencional** (`// biome-ignore lint/performance/noBarrelFile`).

## Documentos a consultar

| Para...                                                       | Ler                                       |
| ------------------------------------------------------------- | ----------------------------------------- |
| Convenções deste workspace (FKs, enums, money, JSONB, scripts)| `packages/db/CLAUDE.md`                   |
| Stack, auth, anti-patterns, gotchas globais                   | `.claude/CLAUDE.md`                       |
| Contrato DB compartilhada com app ecomerce                    | `docs/integration/admin-ecommerce.md`     |

## Invariantes locais

1. IDs: `text("id").primaryKey()` populado por `crypto.randomUUID()` no caller.
2. Money produto: `numeric(10, 2)`. Money totais de pedido: `numeric(12, 2)`. Nunca `real`/`double`.
3. FKs sempre com `onDelete` explícito (`cascade` / `restrict` / `set null`).
4. Enums via `pgEnum`, derivar tipo: `(typeof enumName.enumValues)[number]`.
5. Auditoria: tabelas de movimento incluem `actorType` + `actorId` + `apiKeyId` + CHECK `actor_coherence`.
6. Triggers PL/pgSQL ficam em `src/migrations/_triggers.sql` (Drizzle-kit não gera). Aplicar com `bun db:apply-triggers` após qualquer push/migrate.
7. `stock_level`, `stock_movement`, `order_item` referenciam `tool_variant.id` — **não** `tool.id`. Mudanças nessas FKs exigem coordenação com app ecomerce.

## Comandos

```bash
bun db:push                 # dev: sync schema → DB
bun db:generate             # gera migration versionada (staging/prod)
bun db:migrate              # aplica migrations pendentes
bun db:studio               # UI inspetora
bun db:apply-triggers       # idempotente
bun db:seed-categories      # bootstrap 5 raízes
bun db:seed-attributes      # bootstrap attribute_definitions iniciais
bun db:anonymize-client <id># LGPD
```

## `db` × `createDb()`

- `db` (singleton) — uso geral em server actions.
- `createDb()` (factory) — usada em `@emach/auth/*` para evitar ciclo de import com `@emach/env`. **Não** consolidar em padrão único.
