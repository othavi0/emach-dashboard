# packages/db — Convenções

Drizzle 0.45 + node-postgres + Supabase Postgres. Para regras gerais ver `.claude/CLAUDE.md`.

## Migrations

- **Dev:** `bun db:push` (sincroniza schema → DB sem migration). Usar livremente em branch local.
- **Staging/Prod:** `bun db:generate` (cria SQL versionado em `drizzle/`) → revisar SQL → `bun db:migrate`.
- **Nunca** usar `--force` fora de dev.
- Migrations aditivas preferidas. Drops: criar PR explícito + comunicar ao app ecomerce (DB compartilhada).

## Convenções de schema

- ID: `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())` (sem nanoid).
- Timestamps: `timestamp("created_at").defaultNow().notNull()`. Soft delete: `deleted_at timestamp` quando aplicável.
- Enums: criar com `pgEnum`, exportar tipos. Ex: `export type ToolStatus = (typeof toolStatusEnum.enumValues)[number]`.
- FK: explicitar `onDelete: "cascade" | "restrict" | "set null"`. Default = restrict para integridade.
- `unique()` em colunas de busca natural (sku, barcode, slug, document).
- Money: `numeric(12, 2)` — nunca `real`/`double`.
- Listas pequenas: `text[]` (Postgres array) ou tabela própria se for ≥ entidade.

## Exports

Cada arquivo de schema exporta tabelas + tipos + enums. **Não** criar `index.ts` que só re-exporta (anti-pattern barrel). Importar direto: `import { order } from "@emach/db/schema/orders"`.

## `db` × `createDb()`

- `db` (singleton) — uso geral em server actions.
- `createDb()` (factory) — usado por `@emach/auth/*` para evitar ciclo de import com `@emach/env`. **Não** consolidar em um padrão único.

## Schema compartilhado com app ecomerce

Site ecomerce escreve em `order`, `orderItem`, `stockMovement`, `client*`, `review`, `lead`. Ver `docs/integration/admin-ecommerce.md` para o contrato. Mudanças nessas tabelas exigem coordenação.
