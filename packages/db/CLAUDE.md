# packages/db — Convenções

Drizzle 0.45 + node-postgres + Supabase Postgres. Regras gerais na raiz.

## Schema workflow (push-only — ADR-0006)

Não há migrations versionadas. Schema TS em `src/schema/` é a **única fonte de verdade**.

- **Aplicar no banco:** `bun db:sync` (= `drizzle-kit push` + `db:apply-triggers`). Rodar após editar `src/schema/*.ts` e após todo `git checkout` — banco compartilhado espelha a branch em checkout.
- `bun db:push` sozinho aplica só schema Drizzle (sem triggers/indexes). Prefira `db:sync`.
- `drizzle-kit push` pede confirmação TTY em mudanças destrutivas — falha em CI/scripted. Em dev, rodar interativo.
- **Gotcha unique constraint composta:** declarar colunas do `.on()` na **mesma ordem** que aparecem na definição da tabela — drizzle-kit introspecta colunas de constraint em ordem de `attnum` e gera diff fantasma se divergir.
- **Gotcha FK > 63 chars:** nome auto-gerado é truncado pelo Postgres e push entra em loop de diff — dar nome explícito via `foreignKey({ ..., name })`.
- **Drops:** PR explícito + comunicar ao app ecomerce (DB compartilhada).
- Quando produção entrar no horizonte: gerar baseline `0000` limpo a partir do schema atual e versionar a partir daí.

**Drop & recreate em dev** (quando renames ambíguos quebram push sem TTY): `DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, public;` via pg client, depois `bunx drizzle-kit push && bun db:apply-triggers && bun db:seed-demo`. Só em dev.

## Triggers PL/pgSQL

`src/sql/triggers.sql` contém triggers que Drizzle Kit **não consegue gerar** (anti-ciclo de categoria com path/depth materializados, idempotência de débito de venda em `stock_movement`). Incluídos no `bun db:sync`; isolado via `bun db:apply-triggers` (idempotente).

Índices de cursor-based pagination e o partial unique `stock_movement_sale_idempotency` vivem no schema Drizzle (declarados nas tabelas) — `drizzle-kit push` os mantém.

## Convenções de schema

- ID: `text("id").primaryKey()`, preencher com `crypto.randomUUID()` no caller.
- FK: explicitar `onDelete: "cascade" | "restrict" | "set null"`. Default = `restrict` por integridade.
- Money: `numeric(10, 2)` para preço/custo de produto; `numeric(12, 2)` em totais de pedido. **Nunca `real`/`double`**.
- Auditoria: `actorType pgEnum('actor_type', ['user','system'])` + `actorId` (FK user). CHECK `actor_coherence` garante coerência.
- "No máximo 1 marcado": `uniqueIndex(...).on(parentId).where(sql\`${isDefault} = true\`)` — ex `tool_variant.isDefault` (1 default por tool).
- `unique()` em colunas de busca natural (sku, barcode, slug, document).

## Audit / atores deletáveis

Quando um user pode ser deletado e a tabela tem FK `actorUserId` pra `user`, preferir `onDelete: 'set null'` + cachear `actorName` no `metadata`. Padrão aplicado em `user_activity_log` (ver ADR-0011). Cascade só quando o registro **não tem valor sem o ator** (raro).

## Exports

`src/schema/index.ts` é um **barrel intencional** (marcado com `// biome-ignore lint/performance/noBarrelFile`). Re-exporta como API pública `@emach/db/schema`. Manter sincronizado ao criar arquivos novos.

Import preferido em consumidores: `import { category } from "@emach/db/schema/categories"` — barrel é fallback.

## Armadilha: `db.execute()` raw devolve timestamp como string

`drizzle-orm@0.45.x` sobrescreve `getTypeParser` para timestamp/timestamptz/date/interval em `rawQueryConfig`. Como `db.execute(sql\`…\`)` não passa pelo column mapper (sem `fields`/`customResultMapper`), o consumer recebe **string raw do Postgres** — não Date.

Sintoma: `Intl.DateTimeFormat.format(value)` lança `RangeError: Invalid time value`.

**Regras:**

- Sempre que tipar coluna timestamp como `Date` no shape público de função que usa `db.execute`: coercer no boundary com `toDate` de `@emach/db/utils`.

  ```ts
  import { toDate } from "@emach/db/utils";
  return rows.map((row) => ({ createdAt: toDate(row.created_at), ... }));
  ```

- `db.query.X.findMany` (relational) e `db.select().from(...)` (query builder) **não** sofrem do bug — devolvem `Date`. Sem coerção.
- Retornos de objetos inteiros: helper `coerceDates(obj, [...keys])` em `queries/catalog.ts`.

## Armadilha: `db.execute<T>` devolve colunas em snake_case

O mesmo bypass do column mapper devolve nomes **literais do Postgres em snake_case**. O genérico `<T>` é só type cast — não renomeia em runtime.

**Regras:**

- Sempre que tipar com shape camelCase do Drizzle (`Tool`, `Promotion`, etc.): enumerar colunas com `AS "camelCase"`.
- **Nunca `SELECT *`** quando tipo declarado tem mapping snake → camel. Ex incidente #23: `ROUND(price * (1 -  / 100))` por `${promo.discountPct}` undefined.
- Se precisar de tudo: usar `db.select().from(table)` (passa pelo mapper) ou alias coluna por coluna.

## `db` × `createDb()`

- `db` (singleton em `src/index.ts`) — uso geral em server actions.
- `createDb()` (factory) — usado por `@emach/auth/*` pra evitar ciclo de import com `@emach/env`.

**Não** consolidar em um padrão único.

## Schema compartilhado com app ecomerce (ADR-0009)

Site ecomerce escreve em `order`, `orderItem`, `stockMovement`, `client*`, `review`, `consentLog`. Cópia do schema TS no repo `emach-ecommerce` é sincronizada **automaticamente por CI** — workflow `sync-db-schema.yml` abre PR no ecommerce sempre que `packages/db/src/{schema,queries,sql/triggers.sql}` muda na `main` (direção unidirecional dashboard → ecommerce).

**Atenção pós-refactor de variants:** `stock_level`, `stock_movement`, `order_item` referenciam `tool_variant.id` (não mais `tool.id`). Ecomerce envia `variantId` em pedidos e movimentos. `tool_variant` traz SKU vendável; `tool` é o produto-pai (info comum).

Mudanças nessas tabelas exigem coordenação de deploy.

## Queries owned-by-dashboard

`packages/db/src/queries/*.ts` é ferramenta de leitura/regra de negócio que o storefront consome. Lista atual: `reviews.ts` (`canCreateReview`), `catalog.ts` (10 funções: `getTools`, `getToolBySlug`, `getCategoryTree`, ...).

**Regra:** dashboard é fonte de verdade. Mudanças de regra começam aqui e propagam via CI. **Não editar em isolamento no ecommerce**.

Assinatura padrão: `db: NodePgDatabase<Record<string, unknown>>` parametrizado (não singleton), tipos exportados via `export type`, sem `select *` (esconder `costAmount` em endpoints públicos).

## Storage de imagens (`tool-images`)

- Bucket público `tool-images` (constante `TOOL_IMAGES_BUCKET` em `apps/web/src/lib/supabase-server.ts`). Path flat `<uuid>.<ext>`, sem prefixo por tool.
- **`tool_image.url` armazena URL pública absoluta completa** (não path relativo). Gerada por `getPublicUrl()`. Consumidores usam `<Image src={toolImage.url} />` direto.
- Ecommerce: whitelist Supabase host em `next.config.ts > images.remotePatterns`.

Detalhes (formatos aceitos, cap 2MB pós-compressão, bucket privado de anexos): `docs/storage-buckets.md`.

## ⚠️ Gaps conhecidos

### Anonimização LGPD

Não há script nem server action de anonimização de cliente ("direito ao esquecimento"). Só export existe (`client_export_log` + `dashboard/customers/export/`). **Implementar antes de produção.**

### Gates role-based desligados (ADR-0012)

`requireCapability*`, `can()`, `requireRole` e `getUserBranchScope` em `apps/web/src/lib/` são no-op desde 2026-05-27. Matriz original preservada em `apps/web/src/lib/permissions.disabled.ts`. **Religar antes de produção** — passos em `docs/adr/0012-disable-role-based-gates.md`.

## Scripts adicionais

`bun db:seed-demo` (reconstrói DB de dev inteira) e `bun db:reset-demo` (só trunca demo) em `packages/db/scripts/`.
