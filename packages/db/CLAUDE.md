# packages/db — Convenções

Drizzle 0.45 + node-postgres + Supabase Postgres. Para regras gerais ver `.claude/CLAUDE.md`.

## Migrations

- **Dev:** `bun db:push` (sincroniza schema → DB sem migration). Usar livremente em branch local. Use `--force` apenas em dev quando há conflitos de rename ambíguo.
- **Staging/Prod:** `bun db:generate` (cria SQL versionado em `src/migrations/`) → revisar SQL → `bun db:migrate`.
- **Nunca** usar `--force` fora de dev.
- Migrations aditivas preferidas. Drops: criar PR explícito + comunicar ao app ecomerce (DB compartilhada — ver `docs/integration/admin-ecommerce.md`).

## Triggers PL/pgSQL

`src/migrations/_triggers.sql` contém triggers que o Drizzle Kit **não consegue gerar** (anti-ciclo de categoria com path/depth materializados, idempotência de débito de venda em stock_movement). Após qualquer `bun db:push` em dev ou `bun db:migrate` em prod:

```bash
bun db:apply-triggers   # idempotente (CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS)
```

## Convenções de schema

- ID: `text("id").primaryKey()` — preencher com `crypto.randomUUID()` no caller (server actions/scripts).
- Timestamps: `timestamp("created_at").defaultNow().notNull()`. Soft delete: `deleted_at timestamp` quando aplicável.
- Enums: criar com `pgEnum`, derivar tipo. Ex: `export const userRoleEnum = pgEnum("user_role", ["admin","manager","user"]); export type UserRole = (typeof userRoleEnum.enumValues)[number]`.
- FK: explicitar `onDelete: "cascade" | "restrict" | "set null"`. Default = restrict para integridade.
- `unique()` em colunas de busca natural (sku, barcode, slug, document).
- Money: `numeric(10, 2)` para preço/custo de produto (`tool_variant.priceAmount`, `costAmount`); `numeric(12, 2)` em totais de pedido (`order.totalAmount`). Nunca `real`/`double`.
- Listas pequenas: `text[]` (Postgres array, GIN-friendly) ou tabela própria se for ≥ entidade.
- JSONB com schema livre: `jsonb("col").$type<MyShape>()` + parser cuidadoso ao ler. Ex: `attribute_definition.options`.
- Auditoria: tabelas de movimento incluem `actorType pgEnum('actor_type', ['user','apiKey','system'])` + `actorId` (FK user) + `apiKeyId` (FK apiKey). CHECK garante coerência (`actor_coherence`).
- Partial unique index para "no máximo 1 marcado": ex `tool_variant.isDefault` usa `uniqueIndex(...).on(toolId).where(sql\`${isDefault} = true\`)` para garantir 1 default por tool.

## Exports

`src/schema/index.ts` é um **barrel intencional** (marcado com `// biome-ignore lint/performance/noBarrelFile`). Re-exporta todos os schemas como API pública para `@emach/db/schema`. Mantenha-o sincronizado quando criar arquivos novos.

Importação preferida em consumidores: `import { category } from "@emach/db/schema/categories"` (caminho específico) — barrel é fallback.

## `db` × `createDb()`

- `db` (singleton em `src/index.ts`) — uso geral em server actions.
- `createDb()` (factory) — usado por `@emach/auth/*` para evitar ciclo de import com `@emach/env`. **Não** consolidar em um padrão único.

## Scripts

```bash
bun db:push                # dev: sync schema → DB
bun db:generate            # gera nova migration versionada
bun db:migrate             # aplica migrations pendentes
bun db:studio              # UI inspetora

bun db:apply-triggers      # aplica src/migrations/_triggers.sql
bun db:seed-categories     # bootstrap 5 categorias raiz idempotente
bun db:seed-attributes     # attribute_definitions iniciais (RPM, mandril, percussão, etc) por categoria raiz
bun db:anonymize-client <id>  # LGPD direito ao esquecimento
```

**Drop & recreate em dev** (quando renames ambíguos quebram drizzle-kit push em ambiente sem TTY):

```ts
// snippet via pg client direto
await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, public;");
// depois: bunx drizzle-kit push && bun db:apply-triggers && bun db:seed-categories && bun db:seed-attributes
```

⚠️ Só em dev. Em staging/prod sempre via migration versionada.

## Schema compartilhado com app ecomerce

Site ecomerce escreve em `order`, `orderItem`, `stockMovement`, `client*`, `review`, `lead`. Cópia versionada do schema sincronizada manualmente a cada migration. Ver `docs/integration/admin-ecommerce.md` para o contrato completo. Mudanças nessas tabelas exigem coordenação.

**Atenção pós-refactor de variants:** `stock_level`, `stock_movement` e `order_item` agora referenciam `tool_variant.id` (não mais `tool.id`). O app ecomerce precisa enviar `variantId` em pedidos e movimentos, não `toolId`. Ler `tool_variant` para obter SKU vendável; `tool` é o produto-pai (informações comuns).

## Testes (futuro)

Suíte vitest em `test/` será adicionada na Fase F (requer Supabase local CLI + Docker). Atualmente, a única cobertura é `apps/web/__tests__/permissions.test.ts` (puramente unit, sem DB).
