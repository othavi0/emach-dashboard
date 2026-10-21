# packages/db — Convenções

Drizzle 0.45 + node-postgres + Supabase Postgres. Regras gerais na raiz. O que pede autorização e o que conta como write pontual no banco único vive em [Banco compartilhado: regra de escrita dos dois apps](../../CLAUDE.md#banco-compartilhado-regra-de-escrita-dos-dois-apps); os avisos ⛔ deste arquivo resumem essa regra.

## Schema workflow (push-only — ADR-0006 e ADR-0030)

Não há migrations versionadas. Schema TS em `src/schema/` é a **única fonte de verdade**.

- **Aplicar no banco:** `bun db:sync` (= `drizzle-kit push` + `db:apply-sql`). O `drizzle.config.ts` lê o `DATABASE_URL` de `apps/web/.env`, que aponta para o banco único: `db:sync` escreve no banco de produção e só roda com autorização do dono na sessão (ADR-0030). Nunca rodar por troca de branch.
- `bun db:push` sozinho aplica só schema Drizzle (sem triggers/indexes). Prefira `db:sync`.
- `drizzle-kit push` pede confirmação TTY em mudanças destrutivas — falha em CI/scripted. Com a autorização do dono, rodar interativo; rename e drop seguem o expand-contract abaixo.
- **Gotcha unique constraint composta:** declarar colunas do `.on()` na **mesma ordem** que aparecem na definição da tabela — drizzle-kit introspecta colunas de constraint em ordem de `attnum` e gera diff fantasma se divergir.
- **Gotcha FK > 63 chars:** nome auto-gerado é truncado pelo Postgres e push entra em loop de diff — dar nome explícito via `foreignKey({ ..., name })`.
- **Gotcha predicado de partial index:** `drizzle-kit push` casa índice por nome + colunas e **não faz diff do `WHERE`**. Mudar só o predicado (ex: `IN ('a','b')` → `IN ('a','b','c')`) reporta "Changes applied" mas é no-op — o índice no banco continua o antigo. Com a autorização do dono (o banco é produção), recriar manualmente: `DROP INDEX <nome>; CREATE [UNIQUE] INDEX ... WHERE (...)` numa transação, depois confirmar com `SELECT indexdef FROM pg_indexes WHERE indexname='<nome>'`. (Incidente #91.)
- **Gotcha CHECK novo × dados existentes:** adicionar um `check()` via `db:sync` **falha** se alguma linha já viola (`ERROR: check constraint "x" is violated by some row`, SQLSTATE `23514`) — a coluna/index até é criada, mas o CHECK não. **Backfill/corrigir os dados ANTES.** Ex (ADR-0015): ao adicionar `entrada_requires_supplier` em `stock_movement`, 60 entradas legadas sem fornecedor foram convertidas pra `ajuste_inventario` antes do push.
- **Rename e drop:** só por expand-contract (ADR-0030), em PRs separados. Fase 1 adiciona a coluna nova e grava nas duas. Fase 2 faz o backfill e muda os leitores nos dois apps, e o PR de sync do ecommerce precisa estar mergeado. Fase 3, num PR separado, remove a coluna antiga. Nunca rename direto. Coluna dropada leva índice/FK junto.
- **Coluna ou tabela nova:** aditiva (nullable ou com default), aplicada antes do código que a usa.
- Sem baseline nem pasta de migrations: o ADR-0030 manteve o push-only com produção ativa.

**Drop & recreate** (quando renames ambíguos quebram push sem TTY; o expand-contract do ADR-0030 evita o rename ambíguo): `DROP SCHEMA public CASCADE` + push + `db:apply-sql` + `db:seed-demo`. ⛔ **Proibido sem autorização explícita do user na sessão:** o banco é único e compartilhado (dev = prod = ecommerce, ver aviso no CLAUDE.md da raiz).

## Triggers PL/pgSQL

`src/sql/triggers.sql` contém triggers que Drizzle Kit **não consegue gerar**: anti-ciclo de categoria (com materialização de `path`/`depth`), throttle de `client.last_seen_at` a cada 5 min, derivação automática de `client_type` (CPF→b2c, CNPJ→b2b) e inserção de `order_note` ao cancelar NF-e. Incluídos no `bun db:sync`; aplicados via `bun db:apply-sql` (idempotente), que roda `triggers.sql` + `rls.sql` em ordem.

`src/sql/rls.sql` é o **RLS deny-all canônico** de todas as tabelas do schema `public` (ADR-0014). `ENABLE ROW LEVEL SECURITY` sem policies — só fecha a porta REST pra `anon`/`authenticated`; acesso server-side (Drizzle, role `postgres` BYPASSRLS) é intocado. Idempotente. Tabela nova ganha linha no `rls.sql` (ordem alfabética, `"order"`/`"user"` entre aspas) e declara `.enableRLS()` no `pgTable`, porque o `drizzle-kit push` emite `DISABLE ROW LEVEL SECURITY` em toda tabela sem o flag e o `db:push` sozinho deixa a REST aberta. O teste `src/__tests__/rls-coverage.test.ts` cobra os dois e falha se faltar ou sobrar linha no `rls.sql` ou se um `pgTable` não declarar `.enableRLS()`.

Índices de cursor-based pagination e o partial unique `stock_movement_sale_idempotency` vivem no schema Drizzle (declarados nas tabelas) — `drizzle-kit push` os mantém.

## Convenções de schema

- ID: `text("id").primaryKey()`, preencher com `crypto.randomUUID()` no caller.
- FK: explicitar `onDelete: "cascade" | "restrict" | "set null"`. Default = `restrict` por integridade.
- Money: `numeric(10, 2)` para preço/custo de produto; `numeric(12, 2)` em totais de pedido. **Nunca `real`/`double`**.
- **Timestamp: sempre `timestamp("x", { withTimezone: true })`** (= `timestamptz`). Migrado em 2026-06-10 (todas as colunas da época). **Nunca declarar `timestamp(...)` sem tz** — coluna naïve quebra paginação por cursor em runtime não-UTC: o cursor é serializado via `new Date(rawString).toISOString()`, que em dev BR (−03) injeta +3h, e o keyset `< ${cursor}::timestamp` passa a reincluir o item-cursor → loop de refetch + duplicate keys. Banco compartilhado: migração coordenada com ecommerce (issue ecommerce#79).
- Auditoria: `actorType` (`actorTypeEnum`, pgEnum `actor_type` com `user` e `system`) + FK do ator para `user`. Ator humano grava `actorType: "user"` e a FK = `session.user.id`; seed, script, cron e escrita do ecommerce gravam `actorType: "system"` e a FK `null`. O CHECK de coerência de cada tabela recusa outro par. As 6 tabelas com `actor_type`:

  | Tabela | Coluna do ator | CHECK |
  | --- | --- | --- |
  | `stockMovement` | `actorId` | `actor_coherence` |
  | `orderStatusHistory` | `actorUserId` | `actor_coherence` |
  | `orderEvent` | `actorUserId` | `order_event_actor_coherence` |
  | `refundRequest` | `actorUserId` | `refund_actor_coherence` |
  | `clientAuditLog` | `actorUserId` | `client_audit_actor_coherence` |
  | `supplierAuditLog` | `actorUserId` | `supplier_audit_actor_coherence` |

  `userActivityLog` não tem `actor_type` nem CHECK, só `actorUserId` nullable. `src/__tests__/actor-coherence.test.ts` falha quando uma tabela com `actor_type` não tem CHECK que cite a coluna, ou quando o conjunto de tabelas sai desta lista.
- "No máximo 1 marcado": `uniqueIndex(...).on(parentId).where(sql\`${isDefault} = true\`)` — ex `tool_variant.isDefault` (1 default por tool).
- `unique()` em colunas de busca natural (sku, barcode, slug, document).

## Audit / atores deletáveis

Quando um user pode ser deletado e a tabela tem FK `actorUserId` pra `user`, preferir `onDelete: 'set null'` + cachear `actorName` no `metadata`. Padrão aplicado em `user_activity_log` (ver ADR-0011). Cascade só quando o registro **não tem valor sem o ator** (raro).

## Exports

`src/schema/index.ts` é um **barrel intencional** (marcado com `// biome-ignore lint/performance/noBarrelFile`). Re-exporta o schema inteiro em `@emach/db/schema/index` (os consumidores importam por arquivo, ex. `@emach/db/schema/orders`). Manter sincronizado ao criar arquivos novos.

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
- Retornos de objetos inteiros: `coerceDates(obj, [...keys])`. `@emach/db/utils` exporta `toDate` e `coerceDates` (usados por `queries/tools.ts`, `categories.ts`, `promotions.ts` e `reviews.ts`).
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

**Regra:** sempre envolver o union em derived table — `SELECT * FROM ( <blocos> ) AS feed ORDER BY ... LIMIT ...`. Vale para 1 ou N blocos. Canônicos: `branches/[id]/activity-data.ts` e `dashboard/pending-data.ts` (`fetchDashboardActivity` — colapsa para 1 bloco quando o usuário tem só 1 de stock/orders/reviews.read; plano 012). **Smoke do caminho de 1 bloco** (não só o default com todos): o erro só aparece quando a lista de blocos colapsa para um — testar o filtro/deep-link de tipo único, não confiar no estado inicial. (Confirmado no Postgres real 2026-06: forma sem wrap → `ERROR 42601`; com wrap → OK.)

## Armadilha: o erro do Postgres vem em `.cause`, não em `.message`

Drizzle 0.45 embrulha o erro do driver numa `DrizzleQueryError` cujo `.message` é literalmente `"Failed query: <sql> params: <…>"`. O **erro real do node-postgres** (`DatabaseError`, com `code` SQLSTATE, `constraint`, `detail` e a mensagem `"violates …"`) fica em **`e.cause`** — `e.code` é `undefined`.

**Regra:** **nunca** detectar erro de banco por `e.message.includes("foreign key"/"unique"/"category cycle"/…)` — não casa, e o catch acaba devolvendo o `"Failed query: …"` cru pro usuário (incidente do delete de categoria com FK). Usar `getPgError(e)` em `apps/web/src/lib/db-error.ts`: anda na cadeia `.cause` e devolve `{ code, message, constraint }`. Mapear o SQLSTATE → mensagem amigável (`23503` foreign_key_violation, `23505` unique_violation, `P0001` trigger `RAISE EXCEPTION` como o anti-ciclo de categoria); fallback **loga** e devolve mensagem genérica, sem vazar SQL. Referência: `dashboard/categories/actions.ts` (`deleteCategory`, `mapWriteError`).

## `db` × `createDb()`

- `db` (singleton em `src/index.ts`) — uso geral em server actions.
- `createDb()` (factory) — usado por `@emach/auth/*` pra evitar ciclo de import com `@emach/env`.

**Não** consolidar em um padrão único.

## Schema compartilhado com app ecomerce (ADR-0009)

Site ecomerce escreve em `order`, `orderItem`, `orderStatusHistory`, `stockMovement`, `client*`, `review`, `refundRequest`, `consentLog`, `cartEvent` e no contador de uso de `promotion`. Cópia do schema TS no repo `emach-ecommerce` é sincronizada **automaticamente por CI** — workflow `sync-db-schema.yml` abre PR no ecommerce sempre que `packages/db/src/{schema,queries,utils.ts,sql/triggers.sql,sql/rls.sql}` ou o contrato `docs/integration/admin-ecommerce.md` muda na `main` (direção unidirecional dashboard → ecommerce). O contrato chega no ecommerce no mesmo caminho e não se edita lá. <!-- sync-paths -->

**⚠️ Superfície de sync de código = só `schema/`, `queries/`, `utils.ts`, `sql/triggers.sql`, `sql/rls.sql`.** Um arquivo dentro dessa superfície **não pode importar de fora dela** (ex: `src/` raiz; `utils.ts` é a única exceção da raiz, porque é espelhado) — o ecommerce recebe a cópia mas não o irmão não-sincronizado e o `check-types` lá quebra com `TS2307 Cannot find module`. Incidente #88: `queries/dashboard.ts` importava `../order-status-groups` (raiz de `src/`). Helpers compartilhados por queries vivem **em `queries/`**. Essa regra de import vale só para código: o contrato `docs/integration/admin-ecommerce.md` também é espelhado, mas não entra nela.

**Atenção pós-refactor de variants:** `stock_level`, `stock_movement`, `order_item` referenciam `tool_variant.id` (não mais `tool.id`). Ecomerce envia `variantId` em pedidos e movimentos. `tool_variant` traz SKU vendável; `tool` é o produto-pai (info comum).

Mudanças nessas tabelas exigem coordenação de deploy.

## Queries owned-by-dashboard

`packages/db/src/queries/*.ts` é ferramenta de leitura/regra de negócio que o storefront consome. Os arquivos estão no próprio diretório `packages/db/src/queries/`; exemplos de entrada: `getTools`, `getCategoryTree`, `getShippingSettings`. `promo-limits.ts` (`TOOLS_PER_PROMO`) fica sem imports porque Client Component do dashboard também o lê.

**Regra:** dashboard é fonte de verdade. Mudanças de regra começam aqui e propagam via CI. **Não editar em isolamento no ecommerce**.

Assinatura padrão: `db: NodePgDatabase<Record<string, unknown>>` parametrizado (não singleton), tipos exportados via `export type`, sem `select *`.

## Storage de imagens (`tool-images`)

- Bucket público `tool-images` (constante `TOOL_IMAGES_BUCKET` em `apps/web/src/lib/supabase-server.ts`). Path flat `<uuid>.<ext>`, sem prefixo por tool.
- **`tool_image.url` armazena URL pública absoluta completa** (não path relativo). Gerada por `getPublicUrl()`. Consumidores usam `<Image src={toolImage.url} />` direto.
- Ecommerce: whitelist Supabase host em `next.config.ts > images.remotePatterns`.

Detalhes (formatos aceitos, cap 2MB pós-compressão, bucket privado de anexos): `docs/storage-buckets.md`.

## ⚠️ Gaps conhecidos

### Anonimização LGPD

Não há script nem server action de anonimização de cliente ("direito ao esquecimento"). Só export existe (`client_export_log` + `dashboard/customers/export/`). **Pendente** (ADR-0029).

### Gates role-based religados (ADR-0016) + overrides por usuário (ADR-0017)

`requireCapability*`, `can()`, `requireRole`, `getUserBranchScope` enforçam (3 níveis + Branch-scoping) desde 2026-06-15. Ver `docs/adr/0016-religacao-gates-3-niveis-filial.md`. **`manager → admin` migrado e o valor `manager` removido do enum `user_role` em 2026-06-16** (enum agora = `super_admin`/`admin`/`user`; era alias de admin). **Invariante de dados:** popular `user_branch` (todo admin/user precisa de ≥1 filial — fail-closed deixa cego sem vínculo). Verificação: `SELECT id,email FROM "user" WHERE role IN ('admin','user') AND status='active' AND id NOT IN (SELECT user_id FROM user_branch)` deve voltar zero linhas.

**Tabela `user_capability_override`** (`src/schema/user-capability-override.ts`) — overrides grant/revoke de capability por usuário. `capability` é `text` livre validado pelo registry em código (`isCapability()` em `apps/web/src/lib/capabilities.ts`), **não pgEnum** — evita `ALTER TYPE` + `db:sync` a cada nova capability (push-only, ADR-0006). PK composta `(user_id, capability)`. Tabela vazia = no-op (comportamento idêntico ao role puro); rollout aditivo sem migração de dados. Ver ADR-0017.

## Scripts adicionais

`bun db:seed-demo` (trunca e repopula o banco inteiro) e `bun db:reset-demo` (só trunca demo) em `packages/db/scripts/`. ⛔ Os dois são destrutivos no banco único dev = prod: só com autorização explícita do user na sessão.

- **Estado fabricado para smoke visual:** `bun run --cwd packages/db db:fixtures create <order|picking-exception|banner|review|payment-failed|canceled|returned|refunded|ready-to-ship|coupon> [--branch <id>] [--run <run>] [--age <horas>]`. Cada `create` grava um token de execução no marcador (`EM-TEST-FX-<run>-<id8>` no número do pedido, `[EM-TEST-FX:<run>]` no texto livre; fonte em `scripts/fixtures-marks.ts`) e imprime run, ids, número, rota e o comando de volta. `--run` junta várias superfícies na mesma execução. Ao terminar, `db:fixtures cleanup --run <run>` apaga só aquela execução; `cleanup --all` apaga toda fixture, inclusive o formato antigo sem run, e pode levar a de outra sessão. O pedido usa o client ativo mais antigo por `(created_at, id)`, hoje o único client do banco, sem pedido real. A lista de superfícies e o caminho de status de cada uma vivem em `scripts/fixtures-surfaces.ts`, e `src/__tests__/fixtures-doc.test.ts` confere esta seção contra ela.

| Superfície | Nasce | Linhas além de `order`, `order_item` e histórico | Rota impressa |
| --- | --- | --- | --- |
| `order` | `paid` | nenhuma | pedido e `?tab=paid` |
| `picking-exception` | `preparing` | `order_picking` em `exception` e item `notFound` | pedido e `/dashboard` (linha de exceção) |
| `banner` | — | só o `banner` inativo, sem pedido | `/dashboard/site/banners` |
| `review` | `delivered` | `review` | `/dashboard/reviews/<id>` |
| `payment-failed` | `payment_failed` | nenhuma | pedido e `?tab=pending_payment` |
| `canceled` | `canceled` | nenhuma | pedido e `?tab=canceled` |
| `returned` | `returned` | nenhuma | pedido e `?tab=returned` |
| `refunded` | `refunded` | `refund_request` em `refunded` com a marca no `reasonText` | pedido e `?tab=canceled` |
| `ready-to-ship` | `preparing` | `order_picking` em `completed`, item bipado e scan | pedido e `?tab=picked` (Pronto para enviar) |
| `coupon` | `pending_payment` | `promotion` do tipo `promocode`, inativa (`max_redemptions` 10, `redemption_count` 1), ligada por `order.coupon_id` com `discount_amount` de 10% | pedido, `?tab=pending_payment` e `/dashboard/promotions/<id>` |

- **`coupon`** espelha o que o `place-order` do ecommerce grava: a redenção do cupom não tem tabela própria, é o `redemption_count` da `promotion` mais o `coupon_id` do pedido. O cleanup apaga o pedido antes da promoção. Serve ao smoke do cancelamento: cancelar o pedido pelo dashboard leva `redemption_count` de 1 a 0. Fora desta superfície, o seed ainda não cobre reembolso com `order_event`, NF-e nem pedidos em várias filiais (#449).

- **`--age <horas>`** (inteiro positivo, só superfícies de pedido) recua a última etapa para `agora - horas` e as anteriores de hora em hora. `order --age 80` cai na aba de atrasados, que conta a partir de 72 h (`apps/web/src/app/dashboard/orders/_lib/lateness.ts`). Sem a flag, a última etapa fica 1 h atrás.
- **Nenhuma superfície debita nem credita estoque.** Fluxos do app que mexem em estoque sobre uma fixture (envio, devolução com crédito, reembolso com crédito) alteram o `stock_level` de variante real. O cleanup aborta sem apagar nada se achar `stock_movement` ou `refund_request` sem a marca ligado à fixture, e pede estorno manual. O `refund_request` que a superfície `refunded` grava tem a marca e sai no cleanup.
- **Drizzle Studio:** `bun run --cwd packages/db db:studio` abre o `drizzle-kit studio` contra o `DATABASE_URL`, que é o banco único. A edição pela UI escreve direto em produção.
- **Consulta sem MCP:** `bun run --cwd packages/db db:read "<sql>" [--limit N] [--timeout S]`. Um statement só (`SELECT`, `WITH`, `VALUES` ou `TABLE`; `EXPLAIN` e `SHOW` não entram em cursor), em `BEGIN READ ONLY` com `statement_timeout` de 15 s e `ROLLBACK` sempre. O servidor manda no máximo `limit + 1` linhas (cursor + `FETCH`); escrita falha com `cannot execute ... in a read-only transaction` ou `DECLARE CURSOR must not contain data-modifying statements`.
