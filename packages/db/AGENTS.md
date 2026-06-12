# Agents — packages/db

> **Fonte canônica:** `packages/db/CLAUDE.md` (convenções de schema deste workspace) + `CLAUDE.md` no root (regras gerais do monorepo). Esse arquivo é o ponto de entrada para agentes que não auto-descobrem `CLAUDE.md`.

## Quick reference

Drizzle 0.45 + node-postgres + Supabase Postgres. Schemas em `src/schema/*.ts`, agrupados por domínio. Barrel `src/schema/index.ts` é **intencional** (`// biome-ignore lint/performance/noBarrelFile`).

## Documentos a consultar

| Para...                                                       | Ler                                       |
| ------------------------------------------------------------- | ----------------------------------------- |
| Convenções deste workspace (FKs, enums, money, JSONB, scripts)| `packages/db/CLAUDE.md`                   |
| Stack, auth, anti-patterns, gotchas globais                   | `CLAUDE.md`                       |
| Contrato DB compartilhada com app ecomerce                    | `docs/integration/admin-ecommerce.md`     |

## Invariantes locais

1. IDs: `text("id").primaryKey()` populado por `crypto.randomUUID()` no caller.
2. Money produto: `numeric(10, 2)`. Money totais de pedido: `numeric(12, 2)`. Nunca `real`/`double`.
3. FKs sempre com `onDelete` explícito (`cascade` / `restrict` / `set null`).
4. Enums via `pgEnum`, derivar tipo: `(typeof enumName.enumValues)[number]`.
5. Auditoria: tabelas de movimento incluem `actorType` (`user`/`system`) + `actorId` (FK user) + CHECK `actor_coherence`.
6. Triggers PL/pgSQL ficam em `src/sql/triggers.sql` (Drizzle-kit não gera) e o RLS deny-all em `src/sql/rls.sql` (ADR-0014). Aplicar com `bun db:apply-sql` após qualquer `db:push`/`db:sync` (incluído automaticamente em `db:sync`).
7. `stock_level`, `stock_movement`, `order_item` referenciam `tool_variant.id` — **não** `tool.id`. Mudanças nessas FKs exigem coordenação com app ecomerce.

## Comandos

```bash
bun db:sync                 # drizzle-kit push + apply-sql (push-only — ADR-0006)
bun db:push                 # só o schema Drizzle (sem triggers)
bun db:studio               # UI inspetora
bun db:apply-sql            # aplica src/sql/{triggers,rls}.sql (idempotente)
bun db:seed-demo            # reconstrói DB de dev inteira (trunca tudo exceto auth + popula fixture + verifica invariantes)
bun db:reset-demo           # só trunca as tabelas demo (estado limpo, sem repopular)
```

## `db` × `createDb()`

- `db` (singleton) — uso geral em server actions.
- `createDb()` (factory) — usada em `@emach/auth/*` para evitar ciclo de import com `@emach/env`. **Não** consolidar em padrão único.
