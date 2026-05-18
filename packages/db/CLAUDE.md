# packages/db — Convenções

Drizzle 0.45 + node-postgres + Supabase Postgres. Para regras gerais ver `CLAUDE.md` no root.

## Schema workflow (push-only)

Não há migrations versionadas — ver ADR-0006. O schema TS em `src/schema/` é a **única fonte de verdade**.

- **Aplicar schema no banco:** `bun db:sync` (= `drizzle-kit push` + `db:apply-triggers`). Rodar após editar `src/schema/*.ts` e após todo `git checkout` — o banco compartilhado espelha a branch em checkout.
- `bun db:push` sozinho aplica só o schema Drizzle (sem triggers/indexes). Prefira `db:sync`.
- `drizzle-kit push` pede confirmação TTY em mudanças destrutivas — falha em ambiente scripted/CI. Em dev, rodar interativo.
- Convenção: em unique constraints compostas, declarar as colunas do `.on()` na **mesma ordem** em que aparecem na definição da tabela — o drizzle-kit introspecta colunas de constraint em ordem de attnum e gera diff fantasma se divergir. FKs cujo nome auto-gerado passa de 63 chars precisam de nome explícito via `foreignKey({ ..., name })`.
- Drops: criar PR explícito + comunicar ao app ecomerce (DB compartilhada — ver `docs/integration/admin-ecommerce.md`).
- Quando produção entrar no horizonte, gerar um baseline `0000` limpo a partir do schema atual e versionar a partir daí.

## Triggers PL/pgSQL

`src/sql/triggers.sql` contém triggers que o Drizzle Kit **não consegue gerar** (anti-ciclo de categoria com path/depth materializados, idempotência de débito de venda em stock_movement). Incluídos automaticamente no `bun db:sync`; para aplicar isoladamente:

```bash
bun db:apply-triggers   # idempotente (CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS)
```

Os índices de cursor-based pagination (`tool_created_idx`, `supplier_created_idx`, `branch_created_idx`, `promotion_created_idx`) e o partial unique index `stock_movement_sale_idempotency` vivem no schema Drizzle (declarados nas tabelas correspondentes) — o `drizzle-kit push` os mantém automaticamente.

## Convenções de schema

- ID: `text("id").primaryKey()` — preencher com `crypto.randomUUID()` no caller (server actions/scripts).
- Timestamps: `timestamp("created_at").defaultNow().notNull()`. Soft delete: `deleted_at timestamp` quando aplicável.
- Enums: criar com `pgEnum`, derivar tipo. Ex: `export const userRoleEnum = pgEnum("user_role", ["super_admin","admin","manager","user"]); export type UserRole = (typeof userRoleEnum.enumValues)[number]`.
- FK: explicitar `onDelete: "cascade" | "restrict" | "set null"`. Default = restrict para integridade.
- `unique()` em colunas de busca natural (sku, barcode, slug, document).
- Money: `numeric(10, 2)` para preço/custo de produto (`tool_variant.priceAmount`, `costAmount`); `numeric(12, 2)` em totais de pedido (`order.totalAmount`). Nunca `real`/`double`.
- Listas pequenas: `text[]` (Postgres array, GIN-friendly) ou tabela própria se for ≥ entidade.
- JSONB com schema livre: `jsonb("col").$type<MyShape>()` + parser cuidadoso ao ler. Ex: `attribute_definition.options`.
- Auditoria: tabelas de movimento incluem `actorType pgEnum('actor_type', ['user','system'])` + `actorId` (FK user). CHECK garante coerência (`actor_coherence`).
- Partial unique index para "no máximo 1 marcado": ex `tool_variant.isDefault` usa `uniqueIndex(...).on(toolId).where(sql\`${isDefault} = true\`)` para garantir 1 default por tool.

## Exports

`src/schema/index.ts` é um **barrel intencional** (marcado com `// biome-ignore lint/performance/noBarrelFile`). Re-exporta todos os schemas como API pública para `@emach/db/schema`. Mantenha-o sincronizado quando criar arquivos novos.

Importação preferida em consumidores: `import { category } from "@emach/db/schema/categories"` (caminho específico) — barrel é fallback.

## Armadilha: `db.execute()` raw devolve timestamp como string

`drizzle-orm@0.45.x` sobrescreve os `getTypeParser` para timestamp/timestamptz/date/interval em `rawQueryConfig` (`node_modules/.../drizzle-orm/node-postgres/session.cjs`). Como `db.execute(sql\`…\`)` não passa pelo column mapper (sem `fields`/`customResultMapper`), o consumer recebe **string raw do Postgres** — não Date.

Sintoma: `Intl.DateTimeFormat.format(value)` lança `RangeError: Invalid time value` em alguma rota com `db.execute<{ created_at: Date }>`.

Regras:

- **Sempre que tipar uma coluna timestamp como `Date` no shape público de uma função que usa `db.execute`, coercer no boundary** com `toDate` (`packages/db/src/utils.ts`):

  ```ts
  import { toDate } from "@emach/db/utils";
  // ...
  return rows.map((row) => ({ createdAt: toDate(row.created_at), ... }));
  ```

- `db.query.X.findMany` (relational API) e `db.select().from(...)` (query builder) **não** sofrem do bug — devolvem `Date`. Não precisa de coerção nesses caminhos.
- Para retornos de objetos inteiros (ex: `Tool`, `Promotion`, `Category`) em `queries/catalog.ts`, há um helper interno `coerceDates(obj, [...keys])` no próprio arquivo.

**Regra mais ampla — colunas em snake_case:** o mesmo bypass do column mapper faz `db.execute<T>` devolver colunas com os **nomes literais do Postgres em snake_case**. O genérico `<T>` é só type cast — não renomeia nada em runtime. Sempre que tipar com um shape camelCase do Drizzle (`Tool`, `Promotion`, etc.), enumerar as colunas com `AS "camelCase"`. **Nunca `SELECT *`** quando o tipo declarado tem mapeamento snake → camel — `row.discountPct` virá `undefined` e qualquer interpolação em `sql\`\`` template gera SQL inválido (incidente #23: `ROUND(price * (1 -  / 100))` por `${promo.discountPct}` undefined). Se precisar de tudo, ou usa `db.select().from(table)` (passa pelo mapper) ou alias coluna por coluna.

## `db` × `createDb()`

- `db` (singleton em `src/index.ts`) — uso geral em server actions.
- `createDb()` (factory) — usado por `@emach/auth/*` para evitar ciclo de import com `@emach/env`. **Não** consolidar em um padrão único.

## Scripts

```bash
bun db:sync                # drizzle-kit push + apply-triggers (usar após editar schema ou git checkout)
bun db:push                # só o schema Drizzle (sem triggers)
bun db:studio              # UI inspetora

bun db:apply-triggers      # aplica src/sql/triggers.sql
bun db:seed-demo           # reconstrói DB de dev inteira (trunca tudo exceto auth + popula fixture + verifica invariantes)
bun db:reset-demo          # só trunca as tabelas demo (estado limpo, sem repopular)
```

> ⚠️ **Gap conhecido — anonimização LGPD:** não há script nem server action de anonimização de cliente ("direito ao esquecimento"). Só o *export* de dados existe (`client_export_log` + rota `dashboard/customers/export/`). Implementar antes de produção.

**Drop & recreate em dev** (quando renames ambíguos quebram drizzle-kit push em ambiente sem TTY):

```ts
// snippet via pg client direto
await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, public;");
// depois: bunx drizzle-kit push && bun db:apply-triggers && bun db:seed-demo
```

⚠️ Só em dev.

## Schema compartilhado com app ecomerce

Site ecomerce escreve em `order`, `orderItem`, `stockMovement`, `client*`, `review`, `consentLog`. Cópia do schema TS (`src/schema/`) sincronizada manualmente a cada mudança. Ver `docs/integration/admin-ecommerce.md` para o contrato completo. Mudanças nessas tabelas exigem coordenação.

> Gap: docs/integration/admin-ecommerce.md ainda não foi escrito.

**Atenção pós-refactor de variants:** `stock_level`, `stock_movement` e `order_item` agora referenciam `tool_variant.id` (não mais `tool.id`). O app ecomerce precisa enviar `variantId` em pedidos e movimentos, não `toolId`. Ler `tool_variant` para obter SKU vendável; `tool` é o produto-pai (informações comuns).

## Storage de imagens (Supabase)

- **Bucket:** `tool-images` (constante `TOOL_IMAGES_BUCKET` em `apps/web/src/lib/supabase-server.ts`).
- **Acesso:** public read. Storefront anon serve direto via `next/image` sem signed URL.
- **Path no bucket:** flat `<uuid>.<ext>` (UUID via `crypto.randomUUID()` no upload). Sem prefixo por tool.
- **Formatos aceitos:** `image/jpeg`, `image/png`, `image/webp`. Cap 2MB pós-compressão cliente. Lógica em `apps/web/src/app/dashboard/tools/_components/image-actions.ts`.
- **`tool_image.url` armazena URL pública absoluta completa** — formato `https://<projeto>.supabase.co/storage/v1/object/public/tool-images/<uuid>.<ext>`, gerada por `supabase.storage.from(TOOL_IMAGES_BUCKET).getPublicUrl(path).publicUrl`. Nada de path relativo; consumidores usam `<Image src={toolImage.url} />` direto.
- **Ecommerce:** drop-in via `next/image`. Whitelist o host Supabase em `next.config.ts > images.remotePatterns` (`{ protocol: "https", hostname: "<projeto>.supabase.co", pathname: "/storage/v1/object/public/tool-images/**" }`).

## Queries compartilhadas com ecommerce

`packages/db/src/queries/*.ts` é **owned-by-dashboard**: ferramentas de leitura/regra de negócio que o storefront precisa consumir. Lista atual: `reviews.ts` (`canCreateReview`), `catalog.ts` (10 funções de catálogo: `getTools`, `getToolBySlug`, `getCategoryTree`, `getCategoryBySlug`, `getActivePromotions`, `getRecentTools`, `searchTools`, `getReviews`, `getReviewStats`, `getAllToolSlugs`/`getAllCategorySlugs`).

**Regra de sync:** dashboard é fonte de verdade. Ecommerce sincroniza byte-a-byte (cópia manual a cada mudança). **Não editar em isolamento no ecommerce** — mudanças de regra de negócio começam aqui e propagam.

Padrão de assinatura para novas queries: `db: NodePgDatabase<Record<string, unknown>>` parametrizado (não usar singleton `db` exportado), tipos exportados via `export type`, sem `select *` nas projeções (esconder `costAmount` em endpoints públicos).

## Testes (futuro)

Suíte vitest em `test/` será adicionada na Fase F (requer Supabase local CLI + Docker). Atualmente, a única cobertura é `apps/web/__tests__/permissions.test.ts` (puramente unit, sem DB).
