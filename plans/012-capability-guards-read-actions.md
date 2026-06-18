# Plan 012: Adicionar guard de capability/sessão nas read server actions desprotegidas

> **Executor instructions**: Siga este plano passo a passo. Execute cada
> comando de verificação e confirme o resultado esperado antes de avançar.
> Se alguma condição de STOP ocorrer, pare e reporte — não improvise.
> Ao terminar, atualize a linha de status deste plano em `plans/README.md`
> — a menos que o revisor que te despachou instrua diferente.
>
> **Drift check (execute primeiro)**:
> `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/branches/actions.ts apps/web/src/app/dashboard/suppliers/actions.ts apps/web/src/app/dashboard/stock/actions.ts apps/web/src/app/dashboard/categories/actions.ts apps/web/src/app/dashboard/pending-data.ts`
>
> Se qualquer arquivo do escopo mudou desde este plano foi escrito, compare
> os trechos de "Current state" com o código vivo antes de prosseguir; em
> divergência, trate como condição de STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (plano 014 recomendado em paralelo — testes de branch-scope)
- **Category**: security
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

Server actions em `"use server"` são endpoints POST chamáveis diretamente por
qualquer cliente que alcance o servidor — o framework não aplica guard implícito.
Várias read actions exportam dados operacionais e PII (nome/email/telefone/CNPJ
de fornecedores, nomes de filiais, movimentos de estoque) sem nenhuma verificação
de identidade ou capability. Um usuário `user` de qualquer filial — ou em alguns
casos qualquer cliente HTTP autenticado com cookie — pode chamar esses endpoints
e ler dados de toda a organização, violando a camada de capability do ADR-0016.
Após este plano, toda read action terá no mínimo `requireCurrentSession()` e,
quando existir capability de leitura adequada no registry, `requireCapability(cap)`.

## Current state

### Capabilities de leitura confirmadas no registry (`src/lib/capabilities.ts`)

As seguintes capabilities são relevantes para os domínios afetados:

| Capability | `defaultRoles` | Domínio |
|---|---|---|
| `branches.read` | `SAU` (super_admin/admin/user) | Filiais |
| `suppliers.read` | `SAU` | Fornecedores |
| `categories.read` | `SAU` | Categorias |
| `stock.read` | `SAU` | Estoque |
| `orders.read` | `SAU` | Pedidos |
| `reviews.read` | `SA` (super_admin/admin) | Avaliações |

`SAU` = `["super_admin", "admin", "user"]` — definido em `src/lib/capabilities.ts:17-21`.

`requireCapability(cap)` chama `requireCurrentSession()` + `ensureActive()` internamente
(`src/lib/permissions.ts:141-150`). Não há necessidade de chamar ambos.

### Padrão de guard (referência obrigatória)

Função `requireCapability` em `src/lib/permissions.ts:141-150`:
```ts
export async function requireCapability(
    cap: Capability
): Promise<DashboardSession> {
    const session = await requireCurrentSession();
    ensureActive(session);
    if (!(await getUserCapabilities(session)).has(cap)) {
        throw new Error(`Forbidden: capability "${cap}" requerida`);
    }
    return session;
}
```

Funções COM guard como referência do padrão correto:
- `fetchBranchOrdersPage` (`branches/actions.ts:175`): `await requireCapability("orders.read")`
- `listResponsibleCandidates` (`branches/actions.ts:86`): `await requireCapability("branches.manage")`
- `getStockMovementsByVariantBranch` (`stock/actions.ts:396`): `await requireCurrentSession()`
- `fetchToolActivityPage` (`stock/actions.ts:564`): `await requireCapability("stock.read")`
- `fetchPendingOrders` (`pending-data.ts:77`): `await requireCapability("orders.read")`

O guard deve ser a **primeira instrução** da função (antes de qualquer query ou
decodificação de cursor). Não alterar o tipo de retorno nem a assinatura das funções.

### Arquivos e funções afetadas (confirmados contra o código vivo)

#### `apps/web/src/app/dashboard/branches/actions.ts`

Funções SEM guard (a corrigir):

| Função | Linha | Gap |
|---|---|---|
| `fetchBranchActivityPage` | L28 | wrapper sem guard; o impl (`activity-data.ts:203`) tem `requireCapability("stock.read")` — defesa em profundidade ausente na borda pública |
| `listBranches` | L62 | nenhum guard; retorna todas as filiais |
| `fetchBranchesPage` | L108 | nenhum guard; retorna lista paginada de filiais |
| `getBranch` | L163 | nenhum guard; retorna filial por id |
| `fetchBranchesTablePage` | L290 | nenhum guard; delega a `fetchBranchesPage` (que também não tem guard) |

Trecho atual de `listBranches` (`branches/actions.ts:62-73`):
```ts
export async function listBranches(opts?: {
    activeOnly?: boolean;
}): Promise<BranchListItem[]> {
    if (opts?.activeOnly) {
        return await db
            .select()
            .from(branch)
            .where(eq(branch.status, "active"))
            .orderBy(asc(branch.name));
    }
    return await db.select().from(branch).orderBy(asc(branch.name));
}
```

Trecho atual de `getBranch` (`branches/actions.ts:163-166`):
```ts
export async function getBranch(id: string): Promise<BranchListItem | null> {
    const rows = await db.select().from(branch).where(eq(branch.id, id)).limit(1);
    return rows[0] ?? null;
}
```

#### `apps/web/src/app/dashboard/suppliers/actions.ts`

Funções SEM guard (a corrigir):

| Função | Linha | Gap |
|---|---|---|
| `fetchSuppliersPage` | L62 | sem guard; vaza `name/contactEmail/phone/cnpj` |
| `fetchSuppliersTablePage` | L123 | sem guard; delega a `fetchSuppliersPage` |

Trecho atual de `fetchSuppliersPage` (início, `suppliers/actions.ts:62-68`):
```ts
export async function fetchSuppliersPage({
    filters,
    cursor,
}: {
    filters: SuppliersFiltersInput;
    cursor: string | null;
}): Promise<InfiniteResult<SupplierBaseRow>> {
    const decoded = cursor ? decodeCursor(cursor) : null;
```

#### `apps/web/src/app/dashboard/stock/actions.ts`

Funções SEM guard (a corrigir):

| Função | Linha | Gap |
|---|---|---|
| `getStockMovements` | L358 | sem guard; lista movimentos de todas as filiais para uma tool |
| `getToolActivity` | L518 | sem guard; lista movimentos com SKU, filial, ator |

Trecho atual de `getStockMovements` (`stock/actions.ts:358-362`):
```ts
export async function getStockMovements(
    toolId: string,
    limit = 50
): Promise<StockMovementRow[]> {
    return await db
```

Trecho atual de `getToolActivity` (`stock/actions.ts:518-522`):
```ts
export async function getToolActivity(
    toolId: string,
    limit = 100
): Promise<ToolActivityRow[]> {
    return await db
```

#### `apps/web/src/app/dashboard/categories/actions.ts`

Funções SEM guard (a corrigir):

| Função | Linha | Gap |
|---|---|---|
| `listCategories` | L60 | sem guard; exportada em arquivo `"use server"` |
| `getCategory` | L65 | sem guard |
| `listCategoriesForTree` | L89 | sem guard |
| `getCategoryDetail` | L136 | sem guard |
| `getCategoryAncestors` | L222 | sem guard |
| `getCategoryAttributes` | L260 | sem guard |
| `getCategoryProductsPage` | L295 | sem guard |
| `getCategoryChildrenPage` | L377 | sem guard |

`listCategories` é chamada apenas por Server Components (`categories/[id]/edit/page.tsx:115`
e `categories/new/page.tsx:23`), nunca por Client Components. Ainda assim, por estar
em arquivo `"use server"`, é endpoint público. Adicionar guard (defesa em profundidade)
e registrar o caso.

Trecho atual de `getCategory` (`categories/actions.ts:65-74`):
```ts
export async function getCategory(
    id: string
): Promise<CategoryListItem | null> {
    const rows = await db
        .select()
        .from(category)
        .where(eq(category.id, id))
        .limit(1);
    return rows[0] ?? null;
}
```

#### `apps/web/src/app/dashboard/pending-data.ts`

Função com gap de capability (a corrigir):

| Função | Linha | Gap |
|---|---|---|
| `fetchDashboardActivity` | L215 | usa só `requireCurrentSession()` sem capability check; UNION de stock+orders+reviews sem branch-scope — admin de uma filial vê atividade de todas as filiais |

`pending-data.ts` NÃO é `"use server"` — é `import "server-only"`. O endpoint público
é o wrapper em `dashboard/actions.ts:34-38`, que delega sem guard próprio.

O fix de `fetchDashboardActivity` requer:
1. Substituir `requireCurrentSession()` por `requireCurrentSession()` + checks `can()` por subquery
2. Filtrar o UNION por capability: stock só se `can(session,"stock.read")`; orders só se
   `can(session,"orders.read")`; reviews só se `can(session,"reviews.read")`
3. Modelo de referência: `fetchDashboardCounts` no mesmo arquivo (`pending-data.ts:302-344`),
   que já aplica `can()` condicionalmente

Trecho atual de `fetchDashboardActivity` (`pending-data.ts:215-219`):
```ts
export async function fetchDashboardActivity(
    cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
    await requireCurrentSession();
    const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
```

Trecho de referência `fetchDashboardCounts` (`pending-data.ts:302-320`):
```ts
export const fetchDashboardCounts = cache(
    async (): Promise<DashboardCounts> => {
        const session = await requireCurrentSession();
        const [canReviews, canPromotions] = await Promise.all([
            can(session, "reviews.read"),
            can(session, "promotions.read"),
        ]);
        const reviewsExpr = canReviews
            ? sql`(SELECT COUNT(*)::int FROM review WHERE status = 'pending')`
            : sql`0`;
```

### O que NÃO tocar

- Arquivos `*-data.ts` / `data.ts` com `import "server-only"` — não são endpoints.
  O guard fica no caller (`actions.ts`).
- Mutations que já têm guard (`createBranch`, `updateBranch`, `createSupplier`, etc.).
- `fetchBranchOrdersPage`, `listResponsibleCandidates`, `fetchSupplierStockPage` — já guardados.
- `getStockMovementsByVariantBranch`, `fetchVariantBranchMovementsPage`, `getReservedQtyByVariantBranch`,
  `fetchToolActivityPage` — já guardados.
- `fetchPendingStock`, `fetchPendingOrders`, `fetchPendingReviews`, `fetchExpiringPromotions` — já guardados.
- Shape de retorno das funções (não alterar assinaturas).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun check-types` | exit 0, sem erros |
| Lint | `bun check` | exit 0 (ultracite/biome) |
| Tests | `bun --cwd apps/web test` | verde, baseline ≥359 testes |
| Guard de forms | `bun guard:forms` | exit 0 |
| Build | `bun run --cwd apps/web build` | exit 0 |
| Grep guard (verificação final) | ver passo 6 | sem funções desprotegidas |

## Scope

**In scope** (únicos arquivos a modificar):
- `apps/web/src/app/dashboard/branches/actions.ts`
- `apps/web/src/app/dashboard/suppliers/actions.ts`
- `apps/web/src/app/dashboard/stock/actions.ts`
- `apps/web/src/app/dashboard/categories/actions.ts`
- `apps/web/src/app/dashboard/pending-data.ts`
- `apps/web/src/app/dashboard/actions.ts` (somente se o wrapper de `fetchDashboardActivity` precisar de guard próprio — ver passo 5)
- `apps/web/src/app/dashboard/branches/__tests__/guards.test.ts` (criar)
- `apps/web/src/app/dashboard/suppliers/__tests__/guards.test.ts` (criar)
- `apps/web/src/app/dashboard/stock/__tests__/guards.test.ts` (criar)
- `apps/web/src/app/dashboard/categories/__tests__/guards.test.ts` (criar)
- `apps/web/src/app/dashboard/__tests__/pending-data-guards.test.ts` (criar)

**Out of scope** (não tocar mesmo que pareça relacionado):
- Qualquer arquivo `*-data.ts` com `import "server-only"` (não são endpoints POST)
- Mutations já guardadas em qualquer arquivo
- `plans/README.md` — atualizar só ao finalizar o plano
- Qualquer arquivo fora dos listados acima

## Git workflow

- Branch: `advisor/012-capability-guards-read-actions`
- Commits por passo lógico; style: Conventional Commits em PT, subject ≤50 chars
  Exemplos: `fix(branches): adicionar guard branches.read nas read actions`
            `fix(categories): adicionar guard categories.read nas read actions`
            `fix(pending-data): filtrar atividade por capability`
            `test(guards): testes de rejeição sem capability`
- **Não** fazer push nem abrir PR sem instrução explícita.

## Steps

### Passo 0 (investigação — executar antes de qualquer edição)

Confirmar que as capabilities de leitura listadas na tabela acima existem no
registry vivo e mapear qual usar por domínio:

```bash
grep -n '"branches.read"\|"suppliers.read"\|"categories.read"\|"stock.read"' \
  apps/web/src/lib/capabilities.ts
```

Resultado esperado: 4 linhas com as caps confirmadas. Decisão mapeada:

| Arquivo | Funções | Guard a usar |
|---|---|---|
| `branches/actions.ts` | `listBranches`, `fetchBranchesPage`, `getBranch`, `fetchBranchesTablePage`, `fetchBranchActivityPage` | `requireCapability("branches.read")` |
| `suppliers/actions.ts` | `fetchSuppliersPage`, `fetchSuppliersTablePage` | `requireCapability("suppliers.read")` |
| `stock/actions.ts` | `getStockMovements`, `getToolActivity` | `requireCapability("stock.read")` |
| `categories/actions.ts` | `listCategories`, `getCategory`, `listCategoriesForTree`, `getCategoryDetail`, `getCategoryAncestors`, `getCategoryAttributes`, `getCategoryProductsPage`, `getCategoryChildrenPage` | `requireCapability("categories.read")` |
| `pending-data.ts` | `fetchDashboardActivity` | `requireCurrentSession()` + `can()` por subquery (ver passo 5) |

**STOP**: se `categories.read` NÃO existir no registry ao executar o grep acima,
pare e reporte — a capability pode ter sido removida ou renomeada, e a decisão de
produto precisa ser tomada antes de continuar.

**Verify**: `grep -c '"branches.read"\|"suppliers.read"\|"categories.read"\|"stock.read"' apps/web/src/lib/capabilities.ts` → 4

### Passo 1: Guards em `branches/actions.ts`

Adicionar `await requireCapability("branches.read")` como **primeira instrução** de:
- `fetchBranchActivityPage` (L28) — antes do `return`
- `listBranches` (L62) — antes do `if (opts?.activeOnly)`
- `fetchBranchesPage` (L108) — antes de `const decoded`
- `getBranch` (L163) — antes de `const rows`
- `fetchBranchesTablePage` (L290) — antes de `const page`

O import de `requireCapability` já existe na linha 13 (`import { requireCapability } from "@/lib/permissions"`).
Não adicionar nova importação.

Após a edição, `fetchBranchActivityPage` deve ficar:
```ts
export async function fetchBranchActivityPage(
    filters: BranchActivityFilters,
    cursor: string | null
): Promise<InfiniteResult<BranchActivityRow>> {
    await requireCapability("branches.read");
    return await fetchBranchActivityPageImpl(filters, cursor);
}
```

E `listBranches`:
```ts
export async function listBranches(opts?: {
    activeOnly?: boolean;
}): Promise<BranchListItem[]> {
    await requireCapability("branches.read");
    if (opts?.activeOnly) {
        ...
```

**Nota de defesa em profundidade**: `fetchBranchActivityPage` já é guardada pelo impl
(`activity-data.ts:203`). O guard no wrapper é defesa em profundidade na borda pública.
Registrar comentário `// defesa-em-profundidade: impl em activity-data.ts já guarda` na linha.

**Verify**: `grep -n "requireCapability\|requireCurrentSession" apps/web/src/app/dashboard/branches/actions.ts` → deve mostrar guard nas linhas ~29, ~63, ~109, ~164, ~291 (além dos existentes em L86, L175, L213, L244, L332)

### Passo 2: Guards em `suppliers/actions.ts`

Adicionar `await requireCapability("suppliers.read")` como **primeira instrução** de:
- `fetchSuppliersPage` (L62) — antes de `const decoded`
- `fetchSuppliersTablePage` (L123) — antes do `import` dinâmico

O import de `requireCapability` já existe na linha 14.

Após a edição, `fetchSuppliersPage` deve ficar:
```ts
export async function fetchSuppliersPage({
    filters,
    cursor,
}: {
    filters: SuppliersFiltersInput;
    cursor: string | null;
}): Promise<InfiniteResult<SupplierBaseRow>> {
    await requireCapability("suppliers.read");
    const decoded = cursor ? decodeCursor(cursor) : null;
```

**Verify**: `grep -n "requireCapability" apps/web/src/app/dashboard/suppliers/actions.ts` → guards em `fetchSuppliersPage` e `fetchSuppliersTablePage` aparecem, além dos existentes em `createSupplier`, `updateSupplier`, `setSupplierStatus`, `fetchSupplierStockPage`

### Passo 3: Guards em `stock/actions.ts`

Adicionar `await requireCapability("stock.read")` como **primeira instrução** de:
- `getStockMovements` (L358) — antes do `return await db`
- `getToolActivity` (L518) — antes do `return await db`

O import de `requireCapability` já existe na linha 19.

Após a edição, `getStockMovements` deve ficar:
```ts
export async function getStockMovements(
    toolId: string,
    limit = 50
): Promise<StockMovementRow[]> {
    await requireCapability("stock.read");
    return await db
```

**Verify**: `grep -n "requireCapability\|requireCurrentSession" apps/web/src/app/dashboard/stock/actions.ts` → `getStockMovements` (~L359) e `getToolActivity` (~L519) devem ter guard

### Passo 4: Guards em `categories/actions.ts`

Adicionar `await requireCapability("categories.read")` como **primeira instrução** de
todas as 8 funções de leitura. O import de `requireCapability` já existe (linha 20).

Funções e localização das primeiras linhas executáveis (onde inserir o guard):
- `listCategories` (L60–L63): envolta em `cache()`, inserir antes do `await db.select()`.
  Resultado esperado:
  ```ts
  export const listCategories = cache(
      async (): Promise<CategoryListItem[]> => {
          await requireCapability("categories.read");
          return await db.select().from(category).orderBy(asc(category.path));
      }
  );
  ```
  Atenção: a forma original é arrow function de uma linha (`async (): Promise<...> => await db...`).
  Converter para bloco de função para acomodar o guard.

- `getCategory` (L65): inserir antes de `const rows`
- `listCategoriesForTree` (L89): inserir antes de `const cats`
- `getCategoryDetail` (L136): inserir antes de `const current`
- `getCategoryAncestors` (L222): inserir antes de `const [self]`
- `getCategoryAttributes` (L260): inserir antes de `const ancestors`
- `getCategoryProductsPage` (L295): inserir antes de `const [self]`
- `getCategoryChildrenPage` (L377): inserir antes de `const decoded`

**Nota**: `listCategories` é chamada apenas por Server Components (`categories/new/page.tsx:23`
e `categories/[id]/edit/page.tsx:115`). Guard é defesa em profundidade. Adicionar comentário
`// defesa-em-profundidade: chamado apenas por Server Components` na função.

**Verify**: `grep -c "await requireCapability" apps/web/src/app/dashboard/categories/actions.ts` → ≥13 (8 novas + 5 existentes: `createCategory`, `updateCategory`, `toggleCategoryActive`, `reorderCategories`, `deleteCategory`)

### Passo 5: Filtrar atividade por capability em `pending-data.ts`

Este é o passo mais complexo. O objetivo é que `fetchDashboardActivity` filtre
cada sub-query do UNION pela capability correspondente da sessão, espelhando o
padrão de `fetchDashboardCounts` (`pending-data.ts:302-344`).

**Implementação**:

```ts
export async function fetchDashboardActivity(
    cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
    const session = await requireCurrentSession();
    // Filtra sub-queries pelo capability da sessão — espelha fetchDashboardCounts.
    // Usuário sem a capability não vê o segmento (retorna 0 linhas para ele).
    const [canStock, canOrders, canReviews] = await Promise.all([
        can(session, "stock.read"),
        can(session, "orders.read"),
        can(session, "reviews.read"),
    ]);

    const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
    const keyset = (col: string, idExpr: string) =>
        decoded
            ? sql`WHERE (${sql.raw(col)}, ${sql.raw(idExpr)}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
            : sql``;

    // Se o usuário não tem nenhuma capability, retornar vazio (fail-closed).
    if (!canStock && !canOrders && !canReviews) {
        return { items: [], nextCursor: null };
    }

    // Montar sub-queries condicionalmente. Cada segmento ausente é substituído
    // por VALUES vazia com o mesmo shape — permite manter o UNION ALL sem reescrever
    // a query completa. Alternativa mais simples: construir array de sub-queries e
    // uni-los dinamicamente. Escolha implementação mais legível; ambas são válidas.
```

**Estratégia de implementação recomendada**: construir a lista de sub-queries ativas
em um array e uni-las com `UNION ALL`:

```ts
    const subqueries: SQL[] = [];

    if (canStock) {
        subqueries.push(sql`(
            SELECT 'stock-' || sm.id AS id, 'stock'::text AS kind, sm.created_at, ...
            FROM stock_movement sm ...
            ${keyset("sm.created_at", "'stock-' || sm.id")}
            ORDER BY sm.created_at DESC, 'stock-' || sm.id DESC LIMIT ${BATCH_SIZE + 1}
        )`);
    }
    if (canOrders) {
        subqueries.push(sql`(
            SELECT 'order-' || osh.id AS id, 'order'::text AS kind, osh.created_at, ...
            FROM order_status_history osh ...
            ${keyset("osh.created_at", "'order-' || osh.id")}
            ORDER BY osh.created_at DESC, 'order-' || osh.id DESC LIMIT ${BATCH_SIZE + 1}
        )`);
    }
    if (canReviews) {
        subqueries.push(sql`(
            SELECT 'review-' || r.id AS id, 'review'::text AS kind, r.created_at, ...
            FROM review r ...
            ${keyset("r.created_at", "'review-' || r.id")}
            ORDER BY r.created_at DESC, 'review-' || r.id DESC LIMIT ${BATCH_SIZE + 1}
        )`);
    }

    const unionQuery = sql.join(subqueries, sql` UNION ALL `);
    const result = await db.execute<{...}>(sql`
        ${unionQuery}
        ORDER BY created_at DESC, id DESC
        LIMIT ${BATCH_SIZE + 1}
    `);
```

O import de `can` já existe na linha 14 (`import { can, requireCapability } from "@/lib/permissions"`).

**Nota sobre branch-scope**: o UNION de activity não distingue filial na query SQL —
todas as filiais entram juntas. A branch-scope granular (admin ver só sua filial)
exigiria adicionar um `WHERE sm.branch_id IN (...)` em cada sub-query, o que requer
a lógica de `getUserBranchScope`. Isso aumenta risco e escopo. **Neste plano**: apenas
o gate de capability (ver/não ver o segmento). Branch-scope granular em `fetchDashboardActivity`
é work deferred — registrar como `Maintenance notes`. O gate de capability já impede
usuários sem `stock.read`/`orders.read`/`reviews.read` de ver os respectivos segmentos.

**Verify**:
```bash
grep -n "canStock\|canOrders\|canReviews\|can(session" apps/web/src/app/dashboard/pending-data.ts
```
→ deve mostrar as 3 variáveis de capability e as 3 `can()` calls

### Passo 6: Verificar cobertura com grep

Executar para confirmar que nenhuma read action no escopo ficou desprotegida:

```bash
# Branches: listBranches, fetchBranchesPage, getBranch, fetchBranchesTablePage, fetchBranchActivityPage
grep -A3 "^export async function listBranches\|^export async function fetchBranchesPage\|^export async function getBranch\|^export async function fetchBranchesTablePage\|^export async function fetchBranchActivityPage" \
  apps/web/src/app/dashboard/branches/actions.ts | grep -c "requireCapability\|requireCurrentSession"

# Suppliers
grep -A3 "^export async function fetchSuppliersPage\|^export async function fetchSuppliersTablePage" \
  apps/web/src/app/dashboard/suppliers/actions.ts | grep -c "requireCapability"

# Stock
grep -A3 "^export async function getStockMovements\|^export async function getToolActivity" \
  apps/web/src/app/dashboard/stock/actions.ts | grep -c "requireCapability"

# Categories (8 funções)
grep -A3 "^export async function getCategory\|^export async function listCategoriesForTree\|^export async function getCategoryDetail\|^export async function getCategoryAncestors\|^export async function getCategoryAttributes\|^export async function getCategoryProductsPage\|^export async function getCategoryChildrenPage" \
  apps/web/src/app/dashboard/categories/actions.ts | grep -c "requireCapability"
```

Cada comando deve retornar o número de funções no respectivo grupo.

**Verify**: `bun check-types` → exit 0

### Passo 7: Escrever testes de rejeição por capability

Criar um arquivo de teste por domínio, estrutura baseada em
`apps/web/src/lib/__tests__/auth-error.test.ts` (sem mock de `@emach/db` — testar
apenas que a função rejeita quando `requireCapability` lança).

**Estrutura de mock padrão** (mock `@/lib/permissions` inteiro):
```ts
import { describe, expect, it, vi } from "vitest";

// Mock ANTES de importar a action (hoisted não necessário para módulo de lib)
vi.mock("@/lib/permissions", () => ({
    requireCapability: vi.fn(),
    requireCurrentSession: vi.fn(),
    can: vi.fn(),
}));

// Importar APÓS o mock
import { requireCapability } from "@/lib/permissions";
import { listBranches } from "../actions"; // caminho relativo ao arquivo de teste
```

**Arquivo: `apps/web/src/app/dashboard/branches/__tests__/guards.test.ts`**

Colocar em `apps/web/src/app/dashboard/branches/__tests__/` (criar diretório se não existir).

Casos a cobrir por arquivo:

| Arquivo de teste | Funções | Caso |
|---|---|---|
| `branches/__tests__/guards.test.ts` | `listBranches`, `fetchBranchesPage`, `getBranch` | `requireCapability` lança → action rejeita com o erro |
| `suppliers/__tests__/guards.test.ts` | `fetchSuppliersPage`, `fetchSuppliersTablePage` | idem |
| `stock/__tests__/guards.test.ts` | `getStockMovements`, `getToolActivity` | idem |
| `categories/__tests__/guards.test.ts` | `getCategory`, `listCategoriesForTree` | idem (2 representativos) |
| `dashboard/__tests__/pending-data-guards.test.ts` | `fetchDashboardActivity` | `requireCurrentSession` lança → rejeita; `can()` retorna `false` para tudo → retorna `{items:[],nextCursor:null}` |

Template de um teste:
```ts
describe("listBranches — guard", () => {
    it("rejeita quando requireCapability lança", async () => {
        vi.mocked(requireCapability).mockRejectedValueOnce(
            new Error('Forbidden: capability "branches.read" requerida')
        );
        await expect(listBranches()).rejects.toThrow("branches.read");
    });

    it("passa quando requireCapability resolve", async () => {
        vi.mocked(requireCapability).mockResolvedValueOnce({} as DashboardSession);
        // Mockar @emach/db se necessário (vi.mock) ou omitir se o teste
        // só verifica o early-reject sem chegar na query.
        // Neste caso basta verificar que a promise é fulfilled (ou throws DB error).
    });
});
```

**Nota sobre mock de `@emach/db`**: se a action chegar na query quando `requireCapability`
resolve, o teste vai falhar por falta de mock do DB. Para o teste de "rejeição sem sessão",
`mockRejectedValueOnce` garante que a query nunca é alcançada — sem necessidade de mock
do DB. Para o teste de "passa quando tem sessão", ou moca o DB ou apenas verifica que
não lança `Forbidden`.

**Verify**: `bun --cwd apps/web test` → exit 0, novos testes aparecem no output

### Passo 8: Verificação final completa

```bash
bun check-types
bun check
bun guard:forms
bun --cwd apps/web test
```

Todos devem retornar exit 0.

**Commit por domínio** (exemplo de sequência):
```
fix(branches): adicionar guard branches.read nas read actions
fix(suppliers): adicionar guard suppliers.read nas read actions
fix(stock): adicionar guard stock.read nas read actions
fix(categories): adicionar guard categories.read nas read actions
fix(pending-data): filtrar atividade por capability por segmento
test(guards): testes de rejeição sem capability nas read actions
```

## Test plan

**Testes novos a criar** (5 arquivos):

1. `apps/web/src/app/dashboard/branches/__tests__/guards.test.ts`
   - `listBranches` rejeita quando `requireCapability("branches.read")` lança
   - `fetchBranchesPage` rejeita quando `requireCapability` lança
   - `getBranch` rejeita quando `requireCapability` lança

2. `apps/web/src/app/dashboard/suppliers/__tests__/guards.test.ts`
   - `fetchSuppliersPage` rejeita quando `requireCapability("suppliers.read")` lança
   - `fetchSuppliersTablePage` rejeita quando `requireCapability` lança

3. `apps/web/src/app/dashboard/stock/__tests__/guards.test.ts`
   - `getStockMovements` rejeita quando `requireCapability("stock.read")` lança
   - `getToolActivity` rejeita quando `requireCapability("stock.read")` lança

4. `apps/web/src/app/dashboard/categories/__tests__/guards.test.ts`
   - `getCategory` rejeita quando `requireCapability("categories.read")` lança
   - `listCategoriesForTree` rejeita quando `requireCapability("categories.read")` lança

5. `apps/web/src/app/dashboard/__tests__/pending-data-guards.test.ts`
   - `fetchDashboardActivity` rejeita quando `requireCurrentSession` lança
   - `fetchDashboardActivity` retorna `{items:[],nextCursor:null}` quando `can()` retorna `false` para todos os segmentos

**Padrão estrutural**: baseado em `apps/web/src/lib/__tests__/auth-error.test.ts`
(simples, sem mock de DB). Mock de `@/lib/permissions` via `vi.mock`.

**Verificação de cobertura mínima alternativa** (se testes com mock de `@emach/db`
forem muito caros de escrever): prova via grep de que cada read action tem `requireCapability`
ou `requireCurrentSession` como primeira instrução (ver Passo 6).

**Verify**: `bun --cwd apps/web test` → exit 0, ≥10 novos testes passando

## Done criteria

Machine-checkable. TODOS devem ser satisfeitos:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun guard:forms` exits 0
- [ ] `bun --cwd apps/web test` exits 0; ≥10 novos testes de guard existem e passam
- [ ] `grep -A2 "^export async function listBranches" apps/web/src/app/dashboard/branches/actions.ts | grep -q "requireCapability"` retorna exit 0
- [ ] `grep -A2 "^export async function fetchSuppliersPage" apps/web/src/app/dashboard/suppliers/actions.ts | grep -q "requireCapability"` retorna exit 0
- [ ] `grep -A2 "^export async function getStockMovements" apps/web/src/app/dashboard/stock/actions.ts | grep -q "requireCapability"` retorna exit 0
- [ ] `grep -A2 "^export async function getToolActivity" apps/web/src/app/dashboard/stock/actions.ts | grep -q "requireCapability"` retorna exit 0
- [ ] `grep -A2 "^export async function getCategory" apps/web/src/app/dashboard/categories/actions.ts | grep -q "requireCapability"` retorna exit 0
- [ ] `grep -A3 "^export const listCategories" apps/web/src/app/dashboard/categories/actions.ts | grep -q "requireCapability"` retorna exit 0
- [ ] `grep -A4 "^export async function fetchDashboardActivity" apps/web/src/app/dashboard/pending-data.ts | grep -q "requireCurrentSession"` retorna exit 0
- [ ] `grep -q "canStock\|canOrders\|canReviews" apps/web/src/app/dashboard/pending-data.ts` retorna exit 0
- [ ] `git diff --name-only` lista apenas arquivos dentro do scope deste plano
- [ ] Status row em `plans/README.md` atualizado para DONE

## STOP conditions

Pare e reporte (não improvise) se:

- O trecho de código nas localizações de "Current state" não bater com o código
  vivo (o repositório sofreu drift desde que este plano foi escrito).
- `categories.read` não existir no registry `src/lib/capabilities.ts` ao executar
  o grep do Passo 0.
- Adicionar o guard em qualquer função quebrar uma rota pública legítima (ex: fluxo
  de convite usa categorias sem sessão) — verificar o caller antes de assumir que
  é bug do plano.
- `bun check-types` ou `bun check` falhar após uma edição e a causa não for óbvia
  em ≤2 tentativas de correção.
- O Passo 5 (`fetchDashboardActivity`) produzir SQL inválido ou comportamento
  inesperado ao tentar construir o `UNION ALL` dinâmico — pare e proponha abordagem
  alternativa (ex: usar `sql.join` do Drizzle para concatenar sub-queries).
- Qualquer arquivo `data.ts` / `*-data.ts` sem `"use server"` aparecer no diff —
  esses não devem ser tocados.

## Maintenance notes

- **Branch-scope granular em `fetchDashboardActivity`**: este plano aplica gate de
  capability por segmento (stock/orders/reviews), mas não filtra por filial dentro
  de cada segmento. Um admin da filial A ainda vê movimentos de estoque da filial B.
  Para filtrar por `getUserBranchScope`, cada sub-query do UNION precisaria de um
  `WHERE branch_id IN (...)` — work deferred. Sinalizar como TODO em comentário no código:
  `// TODO(plan-012): branch-scope granular — ver plans/012-capability-guards-read-actions.md#maintenance-notes`

- **`listCategories` e o problema de read em criar/editar**: as páginas de `new` e
  `edit` de categoria chamam `listCategories` para popular o seletor de pai. Com o
  guard `categories.read`, o acesso a essas páginas também exige a capability. Por
  design, `categories.read` tem `defaultRoles: SAU` — logo todo usuário ativo tem
  acesso. Não há impacto prático, mas o revisor deve conferir se alguma rota de
  categories deveria ser pública.

- **Ao adicionar nova read action** em qualquer dos arquivos do escopo: o padrão
  obrigatório (ADR-0016) exige `requireCapability(cap)` como primeira instrução.
  O CI não testa isso automaticamente — é uma convenção codificada neste plano e
  em `apps/web/CLAUDE.md` (seção "Server actions").

- **Capacidade de testes**: os testes deste plano mockam `@/lib/permissions` como
  unidade. Se a implementação de `requireCapability` mudar de interface, atualizar
  os mocks.
