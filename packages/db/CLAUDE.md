# packages/db — Convenções

Drizzle 0.45 + node-postgres + Supabase Postgres. Regras gerais na raiz.

## Schema workflow (push-only — ADR-0006)

Não há migrations versionadas. Schema TS em `src/schema/` é a **única fonte de verdade**.

- **Aplicar no banco:** `bun db:sync` (= `drizzle-kit push` + `db:apply-sql`). Rodar após editar `src/schema/*.ts` e após todo `git checkout` — banco compartilhado espelha a branch em checkout.
- `bun db:push` sozinho aplica só schema Drizzle (sem triggers/indexes). Prefira `db:sync`.
- `drizzle-kit push` pede confirmação TTY em mudanças destrutivas — falha em CI/scripted. Em dev, rodar interativo.
- **Gotcha unique constraint composta:** declarar colunas do `.on()` na **mesma ordem** que aparecem na definição da tabela — drizzle-kit introspecta colunas de constraint em ordem de `attnum` e gera diff fantasma se divergir.
- **Gotcha FK > 63 chars:** nome auto-gerado é truncado pelo Postgres e push entra em loop de diff — dar nome explícito via `foreignKey({ ..., name })`.
- **Gotcha predicado de partial index:** `drizzle-kit push` casa índice por nome + colunas e **não faz diff do `WHERE`**. Mudar só o predicado (ex: `IN ('a','b')` → `IN ('a','b','c')`) reporta "Changes applied" mas é no-op — o índice no banco continua o antigo. Em dev, recriar manualmente: `DROP INDEX <nome>; CREATE [UNIQUE] INDEX ... WHERE (...)` numa transação, depois confirmar com `SELECT indexdef FROM pg_indexes WHERE indexname='<nome>'`. (Incidente #91.)
- **Gotcha CHECK novo × dados existentes:** adicionar um `check()` via `db:sync` **falha** se alguma linha já viola (`ERROR: check constraint "x" is violated by some row`, SQLSTATE `23514`) — a coluna/index até é criada, mas o CHECK não. **Backfill/corrigir os dados ANTES.** Ex (ADR-0015): ao adicionar `entrada_requires_supplier` em `stock_movement`, 60 entradas legadas sem fornecedor foram convertidas pra `ajuste_inventario` antes do push.
- **Drops:** PR explícito + comunicar ao app ecomerce (DB compartilhada). Em dev sem TTY (subagent/script), o `drizzle-kit push` de um drop pendura no prompt — fazer o `ALTER TABLE ... DROP COLUMN` direto via pg client + remover do schema TS; depois `db:push` vê schema≡banco (no-op). Coluna dropada leva índice/FK junto.
- Quando produção entrar no horizonte: gerar baseline `0000` limpo a partir do schema atual e versionar a partir daí.

**Drop & recreate em dev** (quando renames ambíguos quebram push sem TTY): `DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, public;` via pg client, depois `bunx drizzle-kit push && bun db:apply-sql && bun db:seed-demo`. Só em dev.

## Triggers PL/pgSQL

`src/sql/triggers.sql` contém triggers que Drizzle Kit **não consegue gerar** (anti-ciclo de categoria com path/depth materializados, idempotência de débito de venda em `stock_movement`). Incluídos no `bun db:sync`; aplicados via `bun db:apply-sql` (idempotente), que roda `triggers.sql` + `rls.sql` em ordem.

`src/sql/rls.sql` é o **RLS deny-all canônico** das 13 tabelas `public` expostas via PostgREST (ADR-0014). `ENABLE ROW LEVEL SECURITY` sem policies — só fecha a porta REST pra `anon`/`authenticated`; acesso server-side (Drizzle, role `postgres` BYPASSRLS) é intocado. Idempotente.

Índices de cursor-based pagination e o partial unique `stock_movement_sale_idempotency` vivem no schema Drizzle (declarados nas tabelas) — `drizzle-kit push` os mantém.

## Convenções de schema

- ID: `text("id").primaryKey()`, preencher com `crypto.randomUUID()` no caller.
- FK: explicitar `onDelete: "cascade" | "restrict" | "set null"`. Default = `restrict` por integridade.
- Money: `numeric(10, 2)` para preço/custo de produto; `numeric(12, 2)` em totais de pedido. **Nunca `real`/`double`**.
- **Timestamp: sempre `timestamp("x", { withTimezone: true })`** (= `timestamptz`). Migrado em 2026-06-10 (todas as 78 colunas). **Nunca declarar `timestamp(...)` sem tz** — coluna naïve quebra paginação por cursor em runtime não-UTC: o cursor é serializado via `new Date(rawString).toISOString()`, que em dev BR (−03) injeta +3h, e o keyset `< ${cursor}::timestamp` passa a reincluir o item-cursor → loop de refetch + duplicate keys. Banco compartilhado: migração coordenada com ecommerce (issue ecommerce#79).
- Auditoria: `actorType pgEnum('actor_type', ['user','system'])` + FK do ator (user). **Nome da coluna varia por tabela:** `stockMovement.actorId`; as demais (`orderStatusHistory`, `clientAuditLog`, `supplierAuditLog`, `userActivityLog`) usam `actorUserId`. CHECK `actor_coherence` garante coerência.
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

- Sempre que tipar coluna timestamp como `Date` no shape público de função que usa `db.execute`: coercer no boundary com `toDate` de `@emach/db/utils`. (Desde a migração p/ `timestamptz` em 2026-06-10, a string raw vem com offset `+00`, então `toDate` produz o instante correto em qualquer runtime — antes, colunas naïve davam +3h em dev BR.)
- **Cursor keyset:** comparar com `${cursor}::timestamptz` (não `::timestamp`) — colunas são `timestamptz`. Cursor naïve quebrava a paginação (ver "Convenções de schema").

  ```ts
  import { toDate } from "@emach/db/utils";
  return rows.map((row) => ({ createdAt: toDate(row.created_at), ... }));
  ```

- `db.query.X.findMany` (relational) e `db.select().from(...)` (query builder) **não** sofrem do bug — devolvem `Date`. Sem coerção.
- Retornos de objetos inteiros: `coerceDates(obj, [...keys])` — função **interna** de `queries/catalog.ts` (não exportada). Para reuso fora dali, mover para `utils.ts` com export. `@emach/db/utils` exporta só `toDate`.
- **Colunas `::date` (date-only) → off-by-one no display:** `db.execute` devolve `'YYYY-MM-DD'` (string). `new Date('2026-05-01')` parseia como **meia-noite UTC**, então `format()` em fuso negativo (dev BR = UTC-3) mostra o **dia anterior**. Para séries de data exibidas (eixo de gráfico), parsear como meia-noite **local** — helper `localDate(s)` em `queries/dashboard.ts` (`new Date(\`${s}T00:00:00\`)`). `toDate` não resolve isso (date-only não tem hora). Manifesta em dev BR; em prod Vercel-UTC fica correto, mas é latente.

## Armadilha: `db.execute<T>` devolve colunas em snake_case

O mesmo bypass do column mapper devolve nomes **literais do Postgres em snake_case**. O genérico `<T>` é só type cast — não renomeia em runtime.

**Regras:**

- Sempre que tipar com shape camelCase do Drizzle (`Tool`, `Promotion`, etc.): enumerar colunas com `AS "camelCase"`.
- **Nunca `SELECT *`** quando tipo declarado tem mapping snake → camel. Ex incidente #23: `ROUND(price * (1 -  / 100))` por `${promo.discountPct}` undefined.
- Se precisar de tudo: usar `db.select().from(table)` (passa pelo mapper) ou alias coluna por coluna.

## Armadilha: subqueries escalares correlacionadas no `db.select` builder não materializam

`db.select({ campo: sql<T>\`(select ... where x = ${table.col})\` })` — uma **subquery escalar correlacionada** como valor de coluna no query builder **retorna `null` em runtime** (a coluna principal vem, a subquery não). `check-types` não pega (o tipo declarado é `T`), e o SQL inspecionado isoladamente parece válido. Bug silencioso: descoberto quando `defaultSku`/`imageUrl`/`category` em `suppliers/data.ts` vinham `null` apesar de o DB ter os dados (confirmado via `execute_sql` direto). `sql` simples no select (ex: `count(*) filter (...)`, agregados) **funciona** — só a forma `(select ...)` correlacionada falha.

**Regras:**

- Para SKU default / imagem / categoria-primária por tool (ou qualquer subquery escalar por linha): use **`db.execute` raw** (como `dashboard/stock/branch-stock-data.ts`) com `AS "camelCase"`, **ou** um **segundo passo de enriquecimento** via `Map` (como `getToolCardMeta` em `suppliers/data.ts` + merge em `fetchSupplierToolsPage`). Não confie na subquery no `db.select`.
- **Smoke visual com dado real** (não só layout): um card que cai em fallback (`defaultSku ?? slug`) esconde o `null` — verifique que o valor esperado aparece, não só que a tela renderiza.

## Armadilha: `UNION ALL` de blocos dinâmicos + `ORDER BY` externo

Feed multi-fonte que monta os SELECTs condicionalmente (filtro de tipo) e junta com `UNION ALL`: cada subquery tem `(SELECT ... ORDER BY ... LIMIT)` e há um `ORDER BY ... LIMIT` externo. Com **2+ blocos** funciona (o externo aplica ao UNION). Com **1 bloco só** (usuário filtrou para um tipo, ou deep-link `?type=`), o `UNION ALL` some e sobra `(SELECT ... ORDER BY ...) ORDER BY ...` → Postgres rejeita: **`multiple ORDER BY clauses not allowed`**.

**Regra:** sempre envolver o union em derived table — `SELECT * FROM ( <blocos> ) AS feed ORDER BY ... LIMIT ...`. Vale para 1 ou N blocos. Canônico: `branches/[id]/activity-data.ts`. **Smoke do caminho de 1 bloco** (não só o default com todos): o erro só aparece quando a lista de blocos colapsa para um — testar o filtro/deep-link de tipo único, não confiar no estado inicial.

## Armadilha: o erro do Postgres vem em `.cause`, não em `.message`

Drizzle 0.45 embrulha o erro do driver numa `DrizzleQueryError` cujo `.message` é literalmente `"Failed query: <sql> params: <…>"`. O **erro real do node-postgres** (`DatabaseError`, com `code` SQLSTATE, `constraint`, `detail` e a mensagem `"violates …"`) fica em **`e.cause`** — `e.code` é `undefined`.

**Regra:** **nunca** detectar erro de banco por `e.message.includes("foreign key"/"unique"/"category cycle"/…)` — não casa, e o catch acaba devolvendo o `"Failed query: …"` cru pro usuário (incidente do delete de categoria com FK). Usar `getPgError(e)` em `apps/web/src/lib/db-error.ts`: anda na cadeia `.cause` e devolve `{ code, message, constraint }`. Mapear o SQLSTATE → mensagem amigável (`23503` foreign_key_violation, `23505` unique_violation, `P0001` trigger `RAISE EXCEPTION` como o anti-ciclo de categoria); fallback **loga** e devolve mensagem genérica, sem vazar SQL. Referência: `dashboard/categories/actions.ts` (`deleteCategory`, `mapWriteError`).

## `db` × `createDb()`

- `db` (singleton em `src/index.ts`) — uso geral em server actions.
- `createDb()` (factory) — usado por `@emach/auth/*` pra evitar ciclo de import com `@emach/env`.

**Não** consolidar em um padrão único.

## Schema compartilhado com app ecomerce (ADR-0009)

Site ecomerce escreve em `order`, `orderItem`, `stockMovement`, `client*`, `review`, `consentLog`. Cópia do schema TS no repo `emach-ecommerce` é sincronizada **automaticamente por CI** — workflow `sync-db-schema.yml` abre PR no ecommerce sempre que `packages/db/src/{schema,queries,sql/triggers.sql,sql/rls.sql}` muda na `main` (direção unidirecional dashboard → ecommerce).

**⚠️ Superfície de sync = só `schema/`, `queries/`, `sql/triggers.sql`, `sql/rls.sql`.** Um arquivo dentro dessa superfície **não pode importar de fora dela** (ex: `src/` raiz) — o ecommerce recebe a cópia mas não o irmão não-sincronizado e o `check-types` lá quebra com `TS2307 Cannot find module`. Incidente #88: `queries/dashboard.ts` importava `../order-status-groups` (raiz de `src/`). Helpers compartilhados por queries vivem **em `queries/`**.

**Atenção pós-refactor de variants:** `stock_level`, `stock_movement`, `order_item` referenciam `tool_variant.id` (não mais `tool.id`). Ecomerce envia `variantId` em pedidos e movimentos. `tool_variant` traz SKU vendável; `tool` é o produto-pai (info comum).

Mudanças nessas tabelas exigem coordenação de deploy.

## Queries owned-by-dashboard

`packages/db/src/queries/*.ts` é ferramenta de leitura/regra de negócio que o storefront consome. Lista atual: `reviews.ts` (`canCreateReview`), `catalog.ts` (11 funções: `getTools`, `getToolBySlug`, `getCategoryTree`, ...), `store-settings.ts` (`getShippingSettings` — config de frete singleton lida pelo storefront).

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

### Gates role-based religados (ADR-0016) + overrides por usuário (ADR-0017)

`requireCapability*`, `can()`, `requireRole`, `getUserBranchScope` enforçam (3 níveis + Branch-scoping) desde 2026-06-15. Ver `docs/adr/0016-religacao-gates-3-niveis-filial.md`. **`manager → admin` migrado e o valor `manager` removido do enum `user_role` em 2026-06-16** (enum agora = `super_admin`/`admin`/`user`; era alias de admin). **Pré-produção (dados):** popular `user_branch` (todo admin/user precisa de ≥1 filial — fail-closed deixa cego sem vínculo). Verificação: `SELECT id,email FROM "user" WHERE role IN ('admin','user') AND status='active' AND id NOT IN (SELECT user_id FROM user_branch)` deve voltar zero linhas.

**Tabela `user_capability_override`** (`src/schema/user-capability-override.ts`) — overrides grant/revoke de capability por usuário. `capability` é `text` livre validado pelo registry em código (`isCapability()` em `src/lib/capabilities.ts`), **não pgEnum** — evita `ALTER TYPE` + `db:sync` a cada nova capability (push-only, ADR-0006). PK composta `(user_id, capability)`. Tabela vazia = no-op (comportamento idêntico ao role puro); rollout aditivo sem migração de dados. Ver ADR-0017.

## Scripts adicionais

`bun db:seed-demo` (reconstrói DB de dev inteira) e `bun db:reset-demo` (só trunca demo) em `packages/db/scripts/`.
