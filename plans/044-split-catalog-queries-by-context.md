# Plan 044: Split packages/db/src/queries/catalog.ts em 4 arquivos por contexto e extraia SQL duplicado de promoção

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 03984800..HEAD -- packages/db/src/queries/catalog.ts
> ```
> If `catalog.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

`packages/db/src/queries/catalog.ts` (1166 LOC) mistura 4 bounded contexts sem relação (tools, categories, promotions, reviews). Isso faz com que qualquer edição numa função de catálogo requeira navegar centenas de linhas de outros contextos, aumentando o risco de conflito de merge — especialmente grave porque esse arquivo fica na superfície ADR-0009 (CI-synced dashboard→ecommerce): um erro aqui quebra o `check-types` do repo de ecommerce. Adicionalmente, o bloco SQL de ~36 linhas que busca tools de promoção (`SELECT t.id, t.slug … FROM tool t INNER JOIN tool_variant dv …`) está byte-idêntico em `getActivePromotions` (linhas 837–872) e `getFeaturedPromotion` (linhas 929–964) — duplicação que torna toda futura otimização de N+1 (plano 048) um trabalho duplo. O split elimina o vetor de conflito, reduz a superfície de diff de cada PR e cria o helper compartilhado que o plano 048 precisará como ponto de entrada.

## Current state

### Arquivo central

`packages/db/src/queries/catalog.ts` — 1166 linhas, 4 contextos misturados:

| Seção | Linhas | Funções exportadas |
|-------|--------|--------------------|
| Tools | 1–423, 978–1038, 1146–1156 | `getTools`, `getToolBySlug`, `getRecentTools`, `searchTools`, `getAllToolSlugs` |
| Categories | 665–787 | `getCategoryTree`, `getCategoryBySlug`, `getAllCategorySlugs` |
| Promotions | 789–972 | `getActivePromotions`, `getFeaturedPromotion` |
| Reviews | 1044–1140 | `getReviews`, `getReviewStats` |
| Helpers internos | 13–203 | `coerceDates`, `arrayLiteral`, `STOREFRONT_STATUS_SQL`, date-key arrays, `formatReviewerName`, `toNullableNumber`, `toBoolean`, `rowToToolListItem`, `buildToolListWhere`, `buildToolListOrder`, constantes |

#### Tipos exportados (todos devem ser re-exportados no novo local)

```
ToolListItem, GetToolsInput, ToolDetailVariant, ToolDetail,
CategoryNode, CategoryDetail, PromotionWithTools, ToolSearchResult,
ReviewWithReviewer, ReviewStats, GetReviewsInput, STOREFRONT_TOOL_STATUSES
```

#### Confirmação de uso externo atual

`catalog.ts` **não é importado diretamente por `apps/web`** hoje (verificado via `grep -r "@emach/db/queries/catalog"` — zero resultados). O ecommerce consome via cópia sincronizada em seu próprio repo (ADR-0009 — ver "Maintenance notes"). O arquivo `packages/db/src/queries/reviews.ts` (2.1K) contém `canCreateReview` — não confundir com as funções de review de catalog.ts.

#### Bloco duplicado (byte-idêntico) em getActivePromotions e getFeaturedPromotion

Linhas 837–872 (`getActivePromotions`, bloco de `toolsRes`) e linhas 929–964 (`getFeaturedPromotion`, bloco de `toolsRes`):

```ts
// linhas 837–872 e 929–964 — idênticos exceto pelas variáveis promo.*
const toolsRes = await db.execute<ToolListRow>(sql`
  SELECT
    t.id, t.slug, t.name, t.status,
    dv.id AS variant_id,
    dv.sku AS variant_sku,
    dv.voltage AS variant_voltage,
    dv.price_amount::text AS variant_price,
    CASE
      WHEN ${promo.discountType}::text = 'fixed'
        THEN GREATEST(dv.price_amount - ${promo.discountValue}::numeric, 0)::text
      ELSE ROUND(dv.price_amount * (1 - ${promo.discountValue}::numeric / 100), 2)::text
    END AS discounted_amount,
    ${promo.id}::text AS active_promotion_id,
    (SELECT COUNT(*) > 1 FROM tool_variant tv2 WHERE tv2.tool_id = t.id) AS has_other_variants,
    (SELECT url FROM tool_image WHERE tool_id = t.id ORDER BY sort_order ASC LIMIT 1) AS primary_image_url,
    COALESCE((
      SELECT SUM(sl.quantity) > 0
      FROM stock_level sl
      JOIN tool_variant tv ON tv.id = sl.variant_id
      WHERE tv.tool_id = t.id
    ), false) AS in_stock,
    (SELECT AVG(r.rating)::numeric(3,2)::text FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS avg_rating,
    (SELECT COUNT(*)::int FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS review_count,
    pc.id AS cat_id,
    pc.slug AS cat_slug,
    pc.name AS cat_name
  FROM tool t
  INNER JOIN tool_variant dv ON dv.tool_id = t.id AND dv.is_default = true
  LEFT JOIN tool_category tc ON tc.tool_id = t.id AND tc.is_primary = true
  LEFT JOIN category pc ON pc.id = tc.category_id
  WHERE ${toolScope}
    AND t.visible_on_site = true
    AND ${STOREFRONT_STATUS_SQL}
  ORDER BY t.created_at DESC
  LIMIT ${TOOLS_PER_PROMO}
`);
```

### Convenções que se aplicam aqui

**ADR-0009 sync surface** (`packages/db/CLAUDE.md`, seção "Schema compartilhado com app ecomerce"): todo arquivo dentro de `packages/db/src/queries/` pode importar somente de `../schema` ou de outros arquivos irmãos em `queries/`. **Nunca importar de fora de `packages/db/src/`**. O CI detecta isso quando o ecommerce faz `check-types` da cópia sincronizada.

**Exemplar de helper compartilhado entre queries**: `packages/db/src/queries/order-status-groups.ts` — exporta só constantes/tipos; seguro importar de outros queries files.

**Sem barrel `index.ts` em queries/**: o package.json exporta via `"./*": "./src/*.ts"`, então `@emach/db/queries/tools` resolve diretamente para `src/queries/tools.ts`. Não criar `src/queries/index.ts`.

**`coerceDates` não está exportada** hoje (é interna de catalog.ts). O plano 046 (coordenação: ver Maintenance notes) poderá movê-la para `@emach/db/utils`. Este plano a mantém interna em `catalog-helpers.ts`; NÃO exportar via `@emach/db` ainda — apenas torná-la compartilhável dentro de queries/.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck (monorepo) | `bun check-types` | exit 0, zero erros |
| Lint (ultracite/biome) | `bun check` | exit 0, zero warnings |
| Testes db package | `bun --cwd packages/db test` | exit 0, todos passam |
| Testes apps/web | `bun --cwd apps/web test` | exit 0, todos passam |
| Build apps/web | `bun run --cwd apps/web build` | exit 0 (Turbopack) |
| Verificar que catalog.ts sumiu | `ls packages/db/src/queries/catalog.ts` | `ls: cannot access ...` (arquivo removido) |
| Verificar sem imports de catalog.ts | `grep -r "queries/catalog" packages/ apps/` | zero resultados |

## Suggested executor toolkit

- Use `bun check-types` após cada passo de criação/edição para detectar erros cedo.
- `rg` (ripgrep) para buscar símbolos cross-file antes e depois do split.

## Scope

**In scope** (únicos arquivos a modificar/criar):

- `packages/db/src/queries/catalog.ts` — DELETAR ao final (step 6)
- `packages/db/src/queries/catalog-helpers.ts` — CRIAR (helpers internos compartilhados)
- `packages/db/src/queries/tools.ts` — CRIAR (contexto tools)
- `packages/db/src/queries/categories.ts` — CRIAR (contexto categories)
- `packages/db/src/queries/promotions.ts` — CRIAR (contexto promotions, com helper extraído)
- `packages/db/src/queries/reviews.ts` — EDITAR: atualmente contém só `canCreateReview`; ADICIONAR `getReviews`, `getReviewStats` e tipos `ReviewWithReviewer`, `ReviewStats`, `GetReviewsInput`

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):

- `packages/db/src/queries/dashboard.ts` — não consome catalog.ts
- `packages/db/src/queries/store-settings.ts` — não consome catalog.ts
- `packages/db/src/queries/branch-cep.ts` — não consome catalog.ts
- `packages/db/src/queries/order-status-groups.ts` — não consome catalog.ts
- `packages/db/src/schema/**` — nenhuma mudança de schema
- `apps/web/**` — nenhum arquivo de apps/web importa catalog.ts hoje; não criar novos imports
- `packages/db/src/index.ts` — não re-exportar novas funções de queries (não é a API pública do pacote)
- `packages/db/src/utils.ts` — NÃO mover `coerceDates` para cá (coordenado com plano 046)
- Comportamento das queries — nenhuma mudança de lógica SQL, apenas reorganização de arquivo

## Git workflow

- Branch: `advisor/044-split-catalog-queries`
- Um commit por step que deixa a codebase compilando (não commitar com erros de tipo)
- Estilo: Conventional Commits em PT, subject ≤50 chars
- Exemplo do repo: `refactor(db): split queries de catálogo por contexto`
- **Não fazer push nem abrir PR** sem instrução explícita

## Steps

### Step 0: Confirmar estado atual

Leia as primeiras 50 linhas de `catalog.ts` e confirme que correspondem ao excerpto em "Current state". Confirme que `reviews.ts` atual contém apenas `canCreateReview`.

```bash
wc -l packages/db/src/queries/catalog.ts
head -50 packages/db/src/queries/catalog.ts
cat packages/db/src/queries/reviews.ts
```

**Verify**: `wc -l` retorna `1166` (ou próximo). `reviews.ts` contém `canCreateReview` e não contém `getReviews`/`getReviewStats`.

Se a contagem de linhas divergir em mais de 20 linhas ou o conteúdo diferir significativamente do excerpto — STOP e reportar.

---

### Step 1: Criar `catalog-helpers.ts` com helpers internos compartilhados

Crie `packages/db/src/queries/catalog-helpers.ts`. Este arquivo contém APENAS o código que será compartilhado por 2+ arquivos do split. **Não exportar via `@emach/db` ainda** — é um módulo interno de queries/.

Conteúdo a mover de `catalog.ts`:

1. **`coerceDates<T>`** (linhas 13–21 de catalog.ts) — função genérica de coerção de datas
2. Todos os arrays de date-keys: `TOOL_DATE_KEYS`, `VARIANT_DATE_KEYS`, `IMAGE_DATE_KEYS`, `CATEGORY_DATE_KEYS`, `PROMOTION_DATE_KEYS`, `REVIEW_DATE_KEYS` (linhas 23–33)
3. `type AnyDb` (linha 35)
4. `STOREFRONT_TOOL_STATUSES`, `APPROVED`, `DEFAULT_LIST_LIMIT`, `DEFAULT_SEARCH_LIMIT`, `DEFAULT_PROMO_LIMIT`, `TOOLS_PER_PROMO` (linhas 41–46)
5. `toNullableNumber`, `toBoolean`, `arrayLiteral` (linhas 179–198)
6. `REVIEWER_NAME_SPLIT_RE`, `STOREFRONT_STATUS_SQL` (linhas 200–203)
7. `type ToolListRow` (linhas 210–229) — usado por tools.ts e promotions.ts
8. `rowToToolListItem` (linhas 293–316) — usado por tools.ts e promotions.ts
9. `formatReviewerName` (linhas 164–177) — usado por reviews.ts

O arquivo deve começar com o import de `sql` de `drizzle-orm` e os imports de tipos necessários de `../schema/*`.

Cabeçalho sugerido:
```ts
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Voltage } from "../schema/tools";

// Helpers internos compartilhados entre queries de catálogo.
// Não exportar via @emach/db — uso exclusivo dentro de queries/.
```

**Verify**: `bun check-types` → exit 0

---

### Step 2: Criar `packages/db/src/queries/tools.ts`

Contexto: getTools, getToolBySlug, getRecentTools, searchTools, getAllToolSlugs.

Imports necessários:
- `import { sql } from "drizzle-orm"` (já em catalog-helpers, mas precisa localmente para `sql` literal)
- `import type { AttributeDefinition, ToolAttributeValue } from "../schema/attributes"`
- `import type { Promotion } from "../schema/promotions"`
- `import type { Tool, ToolImage, ToolVariant, Voltage } from "../schema/tools"`
- `import { ... } from "./catalog-helpers"` — importar os helpers necessários

Tipos a exportar (copiar de catalog.ts):
```ts
export interface ToolListItem { ... }
export interface GetToolsInput { ... }
export type ToolDetailVariant = ToolVariant;
export interface ToolDetail { ... }
export interface ToolSearchResult { ... }
```

Funções internas a incluir (vindas de catalog.ts):
- `buildToolListWhere` (linhas 231–278)
- `buildToolListOrder` (linhas 280–291)

Funções a exportar:
- `export async function getTools(...)` (linhas 319–423)
- `export async function getToolBySlug(...)` (linhas 429–663)
- `export async function getRecentTools(...)` (linhas 978–983)
- `export async function searchTools(...)` (linhas 990–1039)
- `export async function getAllToolSlugs(...)` (linhas 1146–1156)

`getToolBySlug` chama `getReviewStats` — como `getReviewStats` irá para `reviews.ts`, importe-o de `"./reviews"` neste arquivo. Isso NÃO cria ciclo: `tools.ts` → `reviews.ts`; `reviews.ts` não importa `tools.ts`.

**Verify**: `bun check-types` → exit 0

---

### Step 3: Criar `packages/db/src/queries/categories.ts`

Contexto: getCategoryTree, getCategoryBySlug, getAllCategorySlugs.

Imports necessários:
- `import { sql } from "drizzle-orm"`
- `import type { Category } from "../schema/categories"`
- `import { ... } from "./catalog-helpers"` — `AnyDb`, `arrayLiteral`, `STOREFRONT_STATUS_SQL`, `coerceDates`, `CATEGORY_DATE_KEYS`

Tipos a exportar:
```ts
export interface CategoryNode { ... }    // linhas 114–127
export type CategoryDetail = Category & { ancestors: Category[] };  // linhas 129–131
```

Funções a exportar:
- `export async function getCategoryTree(...)` (linhas 669–742)
- `export async function getCategoryBySlug(...)` (linhas 748–787)
- `export async function getAllCategorySlugs(...)` (linhas 1158–1163)

**Verify**: `bun check-types` → exit 0

---

### Step 4: Editar `packages/db/src/queries/reviews.ts` (adicionar getReviews + getReviewStats)

O arquivo atual contém apenas `canCreateReview`. Adicione ao final:

Imports adicionais necessários:
- `import { sql } from "drizzle-orm"`
- `import type { Review } from "../schema/reviews"`
- `import { AnyDb, APPROVED, coerceDates, REVIEW_DATE_KEYS, formatReviewerName } from "./catalog-helpers"`

Tipos a adicionar (exportar):
```ts
export interface GetReviewsInput {
  limit?: number;
  page: number;
  sort: "newest" | "rating-desc";
  toolId: string;
}
export type ReviewWithReviewer = Review & { clientName: string };
export interface ReviewStats {
  avg: number | null;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}
```

Funções a adicionar (exportar):
- `export async function getReviews(...)` (linhas 1052–1095 de catalog.ts)
- `export async function getReviewStats(...)` (linhas 1101–1140 de catalog.ts)

Leia o arquivo `reviews.ts` atual ANTES de editar — use a ferramenta Read, nunca edite de memória.

**Verify**: `bun check-types` → exit 0; `cat packages/db/src/queries/reviews.ts | grep "export async function"` mostra `canCreateReview`, `getReviews`, `getReviewStats`.

---

### Step 5: Criar `packages/db/src/queries/promotions.ts` com helper extraído

Contexto: getActivePromotions, getFeaturedPromotion — com extração do bloco SQL duplicado.

Imports necessários:
- `import { sql } from "drizzle-orm"`
- `import type { Promotion } from "../schema/promotions"`
- `import { AnyDb, APPROVED, arrayLiteral, coerceDates, DEFAULT_PROMO_LIMIT, PROMOTION_DATE_KEYS, rowToToolListItem, STOREFRONT_STATUS_SQL, TOOLS_PER_PROMO, ToolListRow } from "./catalog-helpers"`
- `import type { ToolListItem } from "./tools"`

Tipos a exportar:
```ts
export type PromotionWithTools = Promotion & { tools: ToolListItem[] };
```

**Helper privado a criar** (extrai o bloco duplicado):

```ts
/** Busca as tools de uma promoção já resolvida, aplicando o desconto.
 * Usado por getActivePromotions e getFeaturedPromotion.
 * @param toolScope - fragmento SQL de filtro de escopo (ex: `t.id = ANY(...)` ou `sql\`true\``)
 * @param promo - objeto Promotion com discountType, discountValue e id
 * @param db - instância do banco
 */
async function fetchPromoTools(
  db: AnyDb,
  promo: Pick<Promotion, "id" | "discountType" | "discountValue">,
  toolScope: ReturnType<typeof sql>
): Promise<ToolListItem[]> {
  const toolsRes = await db.execute<ToolListRow>(sql`
    SELECT
      t.id, t.slug, t.name, t.status,
      dv.id AS variant_id,
      dv.sku AS variant_sku,
      dv.voltage AS variant_voltage,
      dv.price_amount::text AS variant_price,
      CASE
        WHEN ${promo.discountType}::text = 'fixed'
          THEN GREATEST(dv.price_amount - ${promo.discountValue}::numeric, 0)::text
        ELSE ROUND(dv.price_amount * (1 - ${promo.discountValue}::numeric / 100), 2)::text
      END AS discounted_amount,
      ${promo.id}::text AS active_promotion_id,
      (SELECT COUNT(*) > 1 FROM tool_variant tv2 WHERE tv2.tool_id = t.id) AS has_other_variants,
      (SELECT url FROM tool_image WHERE tool_id = t.id ORDER BY sort_order ASC LIMIT 1) AS primary_image_url,
      COALESCE((
        SELECT SUM(sl.quantity) > 0
        FROM stock_level sl
        JOIN tool_variant tv ON tv.id = sl.variant_id
        WHERE tv.tool_id = t.id
      ), false) AS in_stock,
      (SELECT AVG(r.rating)::numeric(3,2)::text FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS avg_rating,
      (SELECT COUNT(*)::int FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS review_count,
      pc.id AS cat_id,
      pc.slug AS cat_slug,
      pc.name AS cat_name
    FROM tool t
    INNER JOIN tool_variant dv ON dv.tool_id = t.id AND dv.is_default = true
    LEFT JOIN tool_category tc ON tc.tool_id = t.id AND tc.is_primary = true
    LEFT JOIN category pc ON pc.id = tc.category_id
    WHERE ${toolScope}
      AND t.visible_on_site = true
      AND ${STOREFRONT_STATUS_SQL}
    ORDER BY t.created_at DESC
    LIMIT ${TOOLS_PER_PROMO}
  `);
  return toolsRes.rows.map(rowToToolListItem);
}
```

Funções a exportar (reescritas para usar `fetchPromoTools`):
- `export async function getActivePromotions(db, limit?)` — chama `fetchPromoTools` no lugar do bloco inline
- `export async function getFeaturedPromotion(db)` — chama `fetchPromoTools` no lugar do bloco inline

A lógica de scopagem de tools (buscar IDs em `promotion_tool`, early-return em `tools: []` / `null`) deve ser mantida idêntica. A única mudança é substituir o bloco de `db.execute<ToolListRow>(sql\`...\`)` pela chamada a `fetchPromoTools`.

**Verify**: `bun check-types` → exit 0

---

### Step 6: Deletar `catalog.ts` e re-exportar `STOREFRONT_TOOL_STATUSES`

Antes de deletar, confirme que todos os 4 novos arquivos cobrem todos os símbolos exportados por catalog.ts:

```bash
grep "^export" packages/db/src/queries/catalog.ts | sort
```

Compare com o que os 4 novos arquivos exportam:

```bash
grep "^export" packages/db/src/queries/{tools,categories,promotions,reviews}.ts | sort
```

Confirme que `STOREFRONT_TOOL_STATUSES` é exportado por `catalog-helpers.ts` e re-exportado por um dos arquivos principais (sugestão: `tools.ts`, pois é constante do contexto de tools do storefront). Adicione se necessário:

```ts
// em tools.ts
export { STOREFRONT_TOOL_STATUSES } from "./catalog-helpers";
```

Então delete:

```bash
rm packages/db/src/queries/catalog.ts
```

**Verify**:
```bash
ls packages/db/src/queries/catalog.ts   # deve falhar com "No such file"
bun check-types                          # exit 0
```

---

### Step 7: Verificação final e commit

```bash
bun check-types
bun check
bun --cwd packages/db test
bun --cwd apps/web test
bun run --cwd apps/web build
grep -r "queries/catalog" packages/ apps/   # zero resultados esperados
```

Se todos os comandos passam, faça um único commit (ou commits por step — o que você preferir, desde que cada commit compile):

```
refactor(db): split queries/catalog.ts em 4 contextos
```

Body do commit (opcional):
```
Extrai getTools/getToolBySlug/searchTools → queries/tools.ts
Extrai getCategoryTree/getCategoryBySlug → queries/categories.ts
Extrai getActivePromotions/getFeaturedPromotion → queries/promotions.ts
Adiciona getReviews/getReviewStats a queries/reviews.ts
Helpers compartilhados em queries/catalog-helpers.ts
Extrai bloco SQL duplicado de promo-tools em fetchPromoTools()
Sem mudança de comportamento; ADR-0009 surface mantida em queries/
```

**Verify**: `git show --stat HEAD` lista apenas arquivos dentro de `packages/db/src/queries/`.

## Test plan

Este plano é uma reorganização sem mudança de comportamento — não há nova lógica a testar. O objetivo dos testes existentes é garantir que o split não quebrou nada.

**Testes existentes relevantes:**
- `packages/db/src/queries/__tests__/branch-cep.test.ts` — não toca catalog, mas confirma que o framework de teste do pacote funciona
- `packages/db/src/queries/__tests__/dashboard-helpers.test.ts` — idem
- `apps/web/src/**/__tests__/*.test.ts` — todos devem continuar passando

**O que verificar adicionalmente (manual):**
- `grep -r "getReviewStats" packages/db/src/queries/tools.ts` deve mostrar o import de `"./reviews"` — confirmando que a dependência cruzada entre tools.ts e reviews.ts está correta.
- `grep -r "fetchPromoTools" packages/db/src/queries/promotions.ts | wc -l` → 3 (1 definição + 2 chamadas).

**Verificação**: `bun --cwd packages/db test && bun --cwd apps/web test` → exit 0, todos passam.

## Done criteria

Machine-checkable. **Todos** devem ser verdade:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0 (zero lint warnings)
- [ ] `bun --cwd packages/db test` exits 0
- [ ] `bun --cwd apps/web test` exits 0
- [ ] `bun run --cwd apps/web build` exits 0
- [ ] `ls packages/db/src/queries/catalog.ts` → "No such file or directory"
- [ ] `grep -r "queries/catalog" packages/ apps/` → zero resultados
- [ ] `grep "^export async function" packages/db/src/queries/promotions.ts` mostra `getActivePromotions` e `getFeaturedPromotion`
- [ ] `grep "fetchPromoTools" packages/db/src/queries/promotions.ts | wc -l` → 3 (1 definição, 2 chamadas)
- [ ] `git diff --name-only HEAD` lista apenas arquivos em `packages/db/src/queries/`
- [ ] `plans/README.md` status row para o plano 044 atualizado

## STOP conditions

Stop e reportar (não improvisar) se:

- O conteúdo de `catalog.ts` divergir significativamente (>30 linhas) do descrito em "Current state" — pode haver edição pós-planejamento; revalidar o split antes de prosseguir.
- `bun check-types` falhar após qualquer step e não resolver em 1 tentativa de fix — pode indicar que um tipo exportado foi omitido ou que a importação cruzada `tools.ts → reviews.ts` criou ciclo inesperado.
- `bun run --cwd apps/web build` falhar — improvável (apps/web não importa catalog.ts), mas se acontecer indica dependência oculta não mapeada.
- Um símbolo exportado de `catalog.ts` não aparecer em nenhum dos 4 novos arquivos após o Step 5 — não deletar até cobrir 100% dos exports.
- O grep de `queries/catalog` retornar resultados após o Step 6 — significa que algum arquivo dentro do repo ainda importa o arquivo deletado.
- Qualquer arquivo fora de `packages/db/src/queries/` precisar ser modificado para que `check-types` passe — STOP; significa dependência não mapeada pelo plano.

## Maintenance notes

**Plano 046 (coerceDates para @emach/db/utils):** este plano deixa `coerceDates` em `catalog-helpers.ts` — interna, não exportada via `@emach/db`. O plano 046 tem a intenção de movê-la para `packages/db/src/utils.ts` com export público. Quando o plano 046 for executado: (1) mova `coerceDates` de `catalog-helpers.ts` para `utils.ts`, (2) atualize os imports em todos os 5 arquivos de queries (`tools.ts`, `categories.ts`, `promotions.ts`, `reviews.ts`, `catalog-helpers.ts`). Coordenar — não executar em paralelo com este plano.

**Plano 048 (promo N+1 batching):** o helper `fetchPromoTools` criado aqui é o ponto de entrada natural para o plano 048. As correlated subqueries de `has_other_variants`, `primary_image_url`, `in_stock`, `avg_rating`, `review_count` no bloco SQL de `fetchPromoTools` são o N+1 a resolver. O plano 048 deve editar `fetchPromoTools` em `promotions.ts` — já consolidado em 1 lugar.

**Ecommerce sync (ADR-0009):** o CI (`sync-db-schema.yml`) sincroniza o diretório `packages/db/src/queries/` inteiro para o repo `emach-ecommerce`. Quando este plano for mergeado:
1. O CI vai abrir um PR no ecommerce adicionando `catalog-helpers.ts`, `tools.ts`, `categories.ts`, `promotions.ts` e editando `reviews.ts`.
2. O arquivo `catalog.ts` **sumiu** — o PR do ecommerce vai deletá-lo lá também.
3. Se o ecommerce importar diretamente de `@emach/db/queries/catalog`, o PR do ecommerce quebrará o `check-types` deles. Verificado: hoje os consumidores no ecommerce importam as funções de `catalog.ts` com import path `"@emach/db/queries/catalog"`. Após o merge, eles precisarão atualizar para os novos paths (`@emach/db/queries/tools`, etc.). O PR automático do CI não atualiza esses imports — isso requer coordenação manual com o time de ecommerce. **Antes de merge para main, avisar o time de ecommerce** para que estejam prontos para atualizar os imports na branch deles.

**Reviewer: o que checar no PR:**
1. `catalog-helpers.ts` não está sendo exportado via `packages/db/package.json` (deve ser somente acessível como `@emach/db/queries/catalog-helpers`, não como `@emach/db/catalog-helpers`).
2. `fetchPromoTools` é privado (sem `export`).
3. Os 4 arquivos novos importam apenas de `../schema/` ou de `./catalog-helpers` (sem imports de fora de queries/).
4. Nenhum comportamento SQL foi alterado — revisar o diff do bloco `fetchPromoTools` contra as versões originais em `getActivePromotions` e `getFeaturedPromotion`.
