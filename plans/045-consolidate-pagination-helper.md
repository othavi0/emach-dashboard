# Plan 045: Migrar sites de paginação keyset hand-rolled para paginate()

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 03984800..HEAD -- \
>   apps/web/src/app/dashboard/branches/actions.ts \
>   apps/web/src/app/dashboard/branches/\[id\]/activity-data.ts \
>   apps/web/src/app/dashboard/customers/data.ts \
>   apps/web/src/app/dashboard/orders/data.ts \
>   apps/web/src/app/dashboard/suppliers/actions.ts \
>   apps/web/src/app/dashboard/suppliers/data.ts \
>   apps/web/src/app/dashboard/tools/data.ts \
>   apps/web/src/app/dashboard/users/data.ts \
>   apps/web/src/app/dashboard/stock/actions.ts \
>   apps/web/src/app/dashboard/stock/movements-data.ts \
>   apps/web/src/app/dashboard/stock/branch-stock-data.ts \
>   apps/web/src/lib/infinite.ts \
>   apps/web/__tests__/infinite.test.ts
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/041-*.md, plans/042-*.md (stock/* e categories/* portions — não editar stock/* até esses plans fecharem)
- **Category**: tech-debt
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

`paginate()` em `apps/web/src/lib/infinite.ts` encapsula a lógica de fence-post
(`hasMore = rows.length > BATCH_SIZE`, slice, cursor) que ~9 sites duplicam na
mão. A duplicação não é um bug hoje, mas any future fix (ex: mudar `BATCH_SIZE`,
adicionar telemetria de paginação, corrigir um edge-case de cursor) exige 9
edições sincronizadas. Consolidar garante que um único ponto de mudança basta.
A ausência de barreira hoje é coincidência — todos os sites fizeram o slice
corretamente; ao escalar o codebase, a chance de erro em novo site cresce.

## Current state

### `paginate()` — o helper a usar (apps/web/src/lib/infinite.ts:16–28)

```ts
export function paginate<TRaw, TItem>(
    rawRows: TRaw[],
    mapRow: (row: TRaw) => TItem,
    makeCursor: (lastRaw: TRaw) => Cursor
): InfiniteResult<TItem> {
    const hasMore = rawRows.length > BATCH_SIZE;
    const pageRows = hasMore ? rawRows.slice(0, BATCH_SIZE) : rawRows;
    const items = pageRows.map(mapRow);
    const lastRaw = pageRows.at(-1);
    const nextCursor =
        hasMore && lastRaw ? encodeCursor(makeCursor(lastRaw)) : null;
    return { items, nextCursor };
}
```

`makeCursor` recebe a **última linha raw** (índice `BATCH_SIZE - 1`) — antes do
slice já feito internamente. Query deve pedir `LIMIT BATCH_SIZE + 1`.

### Sites em escopo e padrão atual

**Grupo A — `rows` Drizzle (tipo inferido, não raw):**

`branches/actions.ts` — `fetchBranchesPage` (linhas 149–164): monta `items` e
depois `nextCursor` com switch no sort. `fetchBranchOrdersPage` (linhas 200–212):
mesmo padrão, sort único "newest". Drizzle rows são o tipo direto; sem
transformação de campos (a única mudança é o sort-switch no `makeCursor`).

`suppliers/actions.ts` — `fetchSuppliersPage` (linhas 95–110): idêntico ao
branches, sort "newest"/"name".

`tools/data.ts` — `fetchToolsPage` (linhas 290–300): usa um helper
`buildToolsNextCursor(filters.sort, last)` para o cursor e faz um `.map` de
limpeza (`{ __createdAt: _c, __name: _n, ...rest }`) após o slice. A lógica de
hasMore/slice (linhas 290–292) é o que se migra; o cursor e o cleanup já estão
em helpers separados — manter e passar para `paginate` como `makeCursor` e
`mapRow`.

`users/data.ts` — `fetchUsersPage` (linhas 166–177): usa `limit` variável (pode
não ser `BATCH_SIZE`; aceita `filters.limit`). `fetchPendingUsersPage` (linhas
210–221): usa `BATCH_SIZE` direto.

**Grupo B — `db.execute` raw (rows em `result.rows`, snake_case):**

`customers/data.ts` — `listCustomers` (linhas 310–363): chama
`rows.rows.map(mapRow)` gerando `mapped: CustomerListItem[]`, **depois** faz
`hasMore = mapped.length > BATCH_SIZE` e slice. Para usar `paginate()`: passar
`rows.rows` como rawRows e mover o `mapRow` para o segundo arg; o `makeCursor`
recebe a linha raw e faz o switch de sort igual ao trecho atual (linhas 332–360).

`orders/data.ts` — `fetchOrdersPage` (linhas 374–386): mesmo padrão que
customers — `db.execute`, `rows.rows.map(mapRow)` em `mapped`, depois
hasMore/slice. Cursor único "newest".

`suppliers/data.ts` — `fetchSupplierStockPage` (linhas 205–240): padrão misto —
faz `db.execute`, `result.rows`, hasMore/slice manual, depois enriquece
`pageRows` via `getToolCardMeta` **antes** de montar os items. Aqui `paginate()`
**não se aplica bem** porque o enriquecimento async (segundo passo) quebra o
`mapRow` síncrono. Deixar com um comentário explicando a incompatibilidade.

`branches/[id]/activity-data.ts` — `fetchBranchActivityPage` (linhas 243–276):
`db.execute`, faz slice manual (`pageRows`), depois `pageRows.map(mapRow)`. Para
usar `paginate()`: passar `result.rows` como rawRows e mover o map dentro de
`mapRow`; `makeCursor` retorna o cursor de atividade (sort "activity").

`stock/movements-data.ts` (linha 133–135) e `stock/actions.ts`
`fetchVariantBranchMovementsPage` (linhas 460–462) e `fetchToolActivityPage`
(linhas 606–608): esses três já delegam o cursor para `encodeMovementCursor` e
o hasMore/slice estão inline. São dependentes de plans 041/042 — **não editar**
até esses planos fecharem.

`stock/branch-stock-data.ts` — `fetchBranchStockPage` (linhas 244–274): usa
`db.execute`, monta `all` (mapped), hasMore/slice manual, depois switch de sort
no cursor. Dependente de plans 041/042 se esses planos tocarem em stock/* — ver
seção Scope.

**Teste existente** (`apps/web/__tests__/infinite.test.ts`): já cobre 5 casos —
`< BATCH_SIZE`, `== BATCH_SIZE`, `> BATCH_SIZE`, `mapRow applied`, lista vazia.
Nenhuma extensão necessária (os cenários já testam o helper de forma completa).

### Convenções que este plano deve respeitar

- `"use server"` exporta **só async functions** — `paginate()` é helper síncrono
  **puro** e já vive em `@/lib/infinite` (não em arquivo `"use server"`). Importá-
  lo em qualquer arquivo `"use server"` é seguro; **não re-exportar** `paginate`
  de um `"use server"`.
- Arquivos `data.ts` têm `import "server-only"` no topo — não remover.
- Cada arquivo `"use server"` editado: rodar `bun run --cwd apps/web build` para
  garantir que não quebrou o constraint de "only async exports".
- `BATCH_SIZE` = 20 (importar de `@/lib/infinite`). Não alterar.
- Conventional Commits em PT, subject ≤ 50 chars.
- Rodar `bun check-types && bun check` após cada grupo de edições.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` | exit 0, zero erros |
| Lint | `bun check` | exit 0, zero warnings |
| Tests (infinite) | `bun --cwd apps/web test infinite` | 5 tests passando |
| Tests (all) | `bun --cwd apps/web test` | todos passando |
| Build gate | `bun run --cwd apps/web build` | exit 0 |
| Verify (ambas) | `bun verify` | exit 0 |

## Suggested executor toolkit

- Use `Read` para ler o arquivo completo antes de qualquer `Edit` (harness
  rastreia estado — nunca editar de memória).
- Após qualquer `Edit` que falhe com `string not found`, re-`Read` o arquivo
  antes de re-tentar.

## Scope

**In scope** (os únicos arquivos que você deve modificar):

- `apps/web/src/app/dashboard/branches/actions.ts`
- `apps/web/src/app/dashboard/branches/[id]/activity-data.ts`
- `apps/web/src/app/dashboard/customers/data.ts`
- `apps/web/src/app/dashboard/orders/data.ts`
- `apps/web/src/app/dashboard/suppliers/actions.ts`
- `apps/web/src/app/dashboard/tools/data.ts`
- `apps/web/src/app/dashboard/users/data.ts`
- `apps/web/__tests__/infinite.test.ts` (somente se quiser adicionar smoke test de regressão, mas os 5 existentes já cobrem — editável opcionalmente)

**Candidatos adiados por dependência ou incompatibilidade:**

- `apps/web/src/app/dashboard/stock/actions.ts` — aguardar plans 041/042
- `apps/web/src/app/dashboard/stock/movements-data.ts` — aguardar plans 041/042
- `apps/web/src/app/dashboard/stock/branch-stock-data.ts` — aguardar plans 041/042 (verificar se foram tocados; se não, pode ser migrado neste plano como bônus — ver STOP condition)
- `apps/web/src/app/dashboard/suppliers/data.ts:fetchSupplierStockPage` — incompatível com `paginate()` por causa do segundo passo async de enriquecimento; deixar comentário (ver Step 7)

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):

- `apps/web/src/lib/infinite.ts` — o helper está correto; não alterar assinatura, `BATCH_SIZE` ou lógica
- `apps/web/src/lib/cursor.ts` — não alterar encodings
- Qualquer arquivo fora de `apps/web/src/app/dashboard/` ou `apps/web/__tests__/`
- Nenhum componente React (`.tsx`), schema, ou action de mutação
- `packages/db/**` — não é afetado

## Git workflow

- Branch: `advisor/045-consolidate-pagination-helper`
- Commit por step ou por grupo lógico; exemplo de mensagem:
  `refactor(branches): usa paginate() nos fns de listagem`
- Não fazer push nem abrir PR.

## Steps

### Step 1: Criar branch

```bash
git checkout -b advisor/045-consolidate-pagination-helper
```

**Verify**: `git branch --show-current` → `advisor/045-consolidate-pagination-helper`

---

### Step 2: Migrar `branches/actions.ts` — `fetchBranchesPage` e `fetchBranchOrdersPage`

Ler o arquivo completo com `Read` antes de editar.

**`fetchBranchesPage` (linhas 149–164 no HEAD):** substituir o bloco:
```ts
const hasMore = rows.length > BATCH_SIZE;
const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
const last = items.at(-1);
let nextCursor: string | null = null;
if (hasMore && last) {
    nextCursor =
        filters.sort === "name"
            ? encodeCursor({ v: 1, sort: "name", name: last.name, id: last.id })
            : encodeCursor({
                    v: 1,
                    sort: "newest",
                    createdAt: last.createdAt.toISOString(),
                    id: last.id,
                });
}
return { items, nextCursor };
```
por:
```ts
return paginate(rows, (r) => r, (last) =>
    filters.sort === "name"
        ? { v: 1, sort: "name" as const, name: last.name, id: last.id }
        : { v: 1, sort: "newest" as const, createdAt: last.createdAt.toISOString(), id: last.id }
);
```

Adicionar `paginate` ao import de `@/lib/infinite` (já importa `BATCH_SIZE` e
`InfiniteResult`).

Remover `encodeCursor` do import de `@/lib/cursor` **somente se** não for mais
usado em nenhum outro lugar do arquivo (verificar — `fetchBranchOrdersPage`
também usa `encodeCursor`; remover só após migrar ambas as funções).

**`fetchBranchOrdersPage` (linhas 200–212):** substituir o bloco:
```ts
const hasMore = rows.length > BATCH_SIZE;
const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
const last = items.at(-1);
const nextCursor =
    hasMore && last
        ? encodeCursor({
                v: 1,
                sort: "newest",
                createdAt: last.createdAt.toISOString(),
                id: last.id,
            })
        : null;
return { items, nextCursor };
```
por:
```ts
return paginate(rows, (r) => r, (last) => ({
    v: 1,
    sort: "newest" as const,
    createdAt: last.createdAt.toISOString(),
    id: last.id,
}));
```

Após ambas as migrações, remover `encodeCursor` do import de `@/lib/cursor` se
não houver mais usos no arquivo.

**Verify**: `bun check-types` → exit 0

---

### Step 3: Migrar `suppliers/actions.ts` — `fetchSuppliersPage`

Ler o arquivo antes de editar.

O bloco hand-rolled está nas linhas 95–110:
```ts
const hasMore = rows.length > BATCH_SIZE;
const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
const last = items.at(-1);
let nextCursor: string | null = null;
if (hasMore && last) {
    nextCursor =
        filters.sort === "name"
            ? encodeCursor({ v: 1, sort: "name", name: last.name, id: last.id })
            : encodeCursor({
                    v: 1,
                    sort: "newest",
                    createdAt: last.createdAt.toISOString(),
                    id: last.id,
                });
}
return { items, nextCursor };
```

Substituir por (mesmo padrão do Step 2):
```ts
return paginate(rows, (r) => r, (last) =>
    filters.sort === "name"
        ? { v: 1, sort: "name" as const, name: last.name, id: last.id }
        : { v: 1, sort: "newest" as const, createdAt: last.createdAt.toISOString(), id: last.id }
);
```

Adicionar `paginate` ao import de `@/lib/infinite`. Verificar se `encodeCursor`
ainda é usado em outro lugar no arquivo; remover do import se não for.

**Verify**: `bun check-types` → exit 0

Commit: `refactor(suppliers): usa paginate() em fetchSuppliersPage`

---

### Step 4: Migrar `tools/data.ts` — `fetchToolsPage`

Ler o arquivo antes de editar. Este arquivo é `"use server"` — **não** introduzir
nenhum export não-async.

O bloco hand-rolled está nas linhas 290–300:
```ts
const hasMore = all.length > BATCH_SIZE;
const items = hasMore ? all.slice(0, BATCH_SIZE) : all;
const last = items.at(-1);
const nextCursor =
    hasMore && last ? buildToolsNextCursor(filters.sort, last) : null;

const cleanItems: ToolCardData[] = items.map(
    ({ __createdAt: _c, __name: _n, ...rest }) => rest
);

return { items: cleanItems, nextCursor };
```

Substituir por:
```ts
return paginate(
    all,
    ({ __createdAt: _c, __name: _n, ...rest }) => rest as ToolCardData,
    (last) => buildToolsNextCursor(filters.sort, last)
);
```

`paginate()` já faz o map + slice na ordem correta (mapRow recebe linha raw;
`buildToolsNextCursor` recebe a linha com `__createdAt`/`__name` — OK porque
`makeCursor` recebe o raw antes de limpar). Adicionar `paginate` ao import de
`@/lib/infinite`. Remover `BATCH_SIZE` do import se não houver mais usos
(verificar o resto do arquivo).

**Verify**: `bun check-types` → exit 0, depois `bun run --cwd apps/web build` →
exit 0 (gate obrigatório pois é arquivo `"use server"`)

Commit: `refactor(tools): usa paginate() em fetchToolsPage`

---

### Step 5: Migrar `customers/data.ts` — `listCustomers`

Este arquivo tem `import "server-only"` — não remover. Ler antes de editar.

O padrão atual (linhas 310–363) faz `rows.rows.map(mapFn)` gerando `mapped`,
depois `hasMore = mapped.length > BATCH_SIZE`, slice, e switch de cursor.

Para usar `paginate()`: passar `rows.rows` como rawRows (tipo do `db.execute`)
e mover o map inline. O `makeCursor` deve receber a linha raw e emitir o cursor
igual ao switch atual.

Substituir o bloco que começa em:
```ts
const mapped: CustomerListItem[] = rows.rows.map((r) => ({ ...
```
até:
```ts
return { items, nextCursor };
```
por:
```ts
return paginate(rows.rows, (r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    emailVerified: r.email_verified,
    image: r.image,
    document: r.document,
    status: r.status,
    clientType: r.client_type,
    ltv: Number(r.ltv ?? 0),
    ordersCount: Number(r.orders_count ?? 0),
    lastOrderAt: toDate(r.last_order_at),
    lastOrderStatus: r.last_order_status,
    createdAt: toDate(r.created_at),
}), (last) => {
    const mapped = {
        createdAt: toDate(last.created_at),
        ltv: Number(last.ltv ?? 0),
        lastOrderAt: last.last_order_at ? toDate(last.last_order_at) : null,
        id: last.id,
        name: last.name,
    };
    if (sort === "createdDesc") {
        return { v: 1, sort: "newest" as const, createdAt: mapped.createdAt.toISOString(), id: mapped.id };
    }
    if (sort === "ltvDesc") {
        return { v: 1, sort: "ltvDesc" as const, ltv: mapped.ltv, id: mapped.id };
    }
    if (sort === "lastOrderDesc") {
        return { v: 1, sort: "lastOrderDesc" as const, lastOrderAt: mapped.lastOrderAt ? mapped.lastOrderAt.toISOString() : null, id: mapped.id };
    }
    return { v: 1, sort: "nameAsc" as const, name: mapped.name, id: mapped.id };
});
```

Adicionar `paginate` ao import de `@/lib/infinite`. Remover `encodeCursor` do
import de `@/lib/cursor` se não houver mais usos.

**Verify**: `bun check-types` → exit 0

Commit: `refactor(customers): usa paginate() em listCustomers`

---

### Step 6: Migrar `orders/data.ts` — `fetchOrdersPage`

Ler o arquivo antes de editar. Verificar o nome exato da função no arquivo (o
lead chama `fetchOrdersPage`; confirmar no cabeçalho da função). É `"use server"`
ou `data.ts`? Verificar se tem `"use server"` no topo — se sim, rodar o build
gate.

O bloco hand-rolled (linhas 362–386 no HEAD) está após o `rows.rows.map`:
```ts
const mapped = rows.rows.map((row) => ({ ... }));

const hasMore = mapped.length > BATCH_SIZE;
const items = hasMore ? mapped.slice(0, BATCH_SIZE) : mapped;
const last = items.at(-1);
const nextCursor =
    hasMore && last
        ? encodeCursor({
                v: 1,
                sort: "newest",
                createdAt: last.createdAt.toISOString(),
                id: last.id,
            })
        : null;
return { items, nextCursor };
```

Substituir por:
```ts
return paginate(rows.rows, (row) => ({
    id: row.id,
    number: row.number,
    status: row.status,
    totalAmount: Number(row.total_amount),
    itemsCount: row.items_count,
    createdAt: toDate(row.created_at),
    clientName: row.client_name,
    branchName: row.branch_name,
    shippingUnverified: row.shipping_unverified,
}), (last) => ({
    v: 1,
    sort: "newest" as const,
    createdAt: toDate(last.created_at).toISOString(),
    id: last.id,
}));
```

Adicionar `paginate` ao import de `@/lib/infinite`. Remover `encodeCursor` do
import se não houver mais usos. Se o arquivo for `"use server"`, rodar o build
gate.

**Verify**: `bun check-types` → exit 0; se `"use server"`:
`bun run --cwd apps/web build` → exit 0

Commit: `refactor(orders): usa paginate() em fetchOrdersPage`

---

### Step 7: Migrar `branches/[id]/activity-data.ts` — `fetchBranchActivityPage`

Ler o arquivo antes de editar. O arquivo tem `import "server-only"`.

O bloco hand-rolled (linhas 243–275):
```ts
const hasMore = result.rows.length > BATCH_SIZE;
const pageRows = hasMore ? result.rows.slice(0, BATCH_SIZE) : result.rows;
const items: BranchActivityRow[] = pageRows.map((r) => ({ ... }));

const last = pageRows.at(-1);
const nextCursor =
    hasMore && last
        ? encodeCursor({
                v: 1,
                sort: "activity",
                id: last.id,
                createdAt: toDate(last.created_at).toISOString(),
            })
        : null;

return { items, nextCursor };
```

Substituir por:
```ts
return paginate(result.rows, (r) => ({
    id: r.id,
    kind: r.kind,
    at: toDate(r.created_at),
    delta: r.delta === null ? null : Number(r.delta),
    reason: r.reason,
    sku: r.sku,
    toolName: r.tool_name,
    orderNumber: r.order_number,
    toStatus: r.to_status,
    clientName: r.client_name,
    action: r.action,
    memberName: r.member_name,
    note: r.note,
    actorName: r.actor_name,
    href: r.href,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
}), (last) => ({
    v: 1,
    sort: "activity" as const,
    id: last.id,
    createdAt: toDate(last.created_at).toISOString(),
}));
```

Adicionar `paginate` ao import de `@/lib/infinite`. Remover `encodeCursor` do
import se não houver mais usos no arquivo.

**Verify**: `bun check-types` → exit 0

Commit: `refactor(branches): usa paginate() na atividade da filial`

---

### Step 8: Adicionar comentário em `suppliers/data.ts` — `fetchSupplierStockPage`

Ler `suppliers/data.ts`. Localizar `fetchSupplierStockPage` (por volta da linha
162 no HEAD). O bloco de hasMore/slice está por volta das linhas 205–240.

Adicionar um comentário `// NOTE` imediatamente antes do bloco de hasMore **sem
alterar a lógica**:
```ts
// NOTE(045): paginate() não se aplica aqui — o enriquecimento assíncrono
// (getToolCardMeta) ocorre entre o slice e a montagem de items, quebrando o
// contrato do mapRow síncrono de paginate(). Manter hand-rolled.
const rawRows = result.rows;
const hasMore = rawRows.length > BATCH_SIZE;
...
```

**Verify**: `bun check-types` → exit 0

---

### Step 9: Verificar `users/data.ts` e adicionar comentário onde `paginate()` não se aplica

Ler `users/data.ts`. Em `fetchUsersPage`, o limite é `filters.limit ?? BATCH_SIZE`
(variável, não literal `BATCH_SIZE`). Isso quebra o contrato de `paginate()` (que
assume `BATCH_SIZE` como page size).

Não migrar `fetchUsersPage`. Adicionar comentário antes do bloco hasMore:
```ts
// NOTE(045): paginate() não se aplica — limit é variável (filters.limit),
// não o BATCH_SIZE fixo. Manter hand-rolled para preservar flexibilidade.
```

`fetchPendingUsersPage` usa `BATCH_SIZE` fixo e pode ser migrada. Ler o bloco
(linhas 208–230 no HEAD):
```ts
const hasMore = rows.length > BATCH_SIZE;
const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
const last = items.at(-1);
const nextCursor =
    hasMore && last
        ? encodeCursor({
                v: 1,
                sort: "newest",
                createdAt: last.createdAt.toISOString(),
                id: last.id,
            })
        : null;

return {
    items: items.map((r) => ({
        href: `/dashboard/users/${r.id}`,
        id: r.id,
        primary: r.name,
        secondary: r.email,
    })),
    nextCursor,
};
```

Substituir por:
```ts
return paginate(rows, (r) => ({
    href: `/dashboard/users/${r.id}`,
    id: r.id,
    primary: r.name,
    secondary: r.email,
}), (last) => ({
    v: 1,
    sort: "newest" as const,
    createdAt: last.createdAt.toISOString(),
    id: last.id,
}));
```

Adicionar `paginate` ao import de `@/lib/infinite`. Remover `encodeCursor` do
import se não houver mais usos.

**Verify**: `bun check-types` → exit 0

Commit: `refactor(users): usa paginate() em fetchPendingUsersPage`

---

### Step 10: Verificação final e commit de encerramento

Rodar a suite completa:
```bash
bun verify
bun run --cwd apps/web build
```

Confirmar que o padrão antigo não sobrou nos arquivos migrados:
```bash
grep -n "hasMore = .*\.length > BATCH_SIZE" \
  apps/web/src/app/dashboard/branches/actions.ts \
  apps/web/src/app/dashboard/branches/\[id\]/activity-data.ts \
  apps/web/src/app/dashboard/customers/data.ts \
  apps/web/src/app/dashboard/orders/data.ts \
  apps/web/src/app/dashboard/suppliers/actions.ts \
  apps/web/src/app/dashboard/tools/data.ts \
  apps/web/src/app/dashboard/users/data.ts
```
→ zero matches (os únicos que sobram são `stock/*` e `suppliers/data.ts` —
intencionalmente excluídos do grep acima)

Confirmar que os arquivos não-tocados não foram alterados:
```bash
git status
```
→ nenhuma modificação em arquivos fora da lista in-scope acima.

Commit: `refactor: verifica gates finais plano 045`

Atualizar `plans/README.md` marcando este plano como DONE.

**Verify**: `bun verify` → exit 0 (encadeia check-types + check + test)

## Test plan

O teste existente em `apps/web/__tests__/infinite.test.ts` já cobre os três casos
de fence-post (`< BATCH_SIZE`, `== BATCH_SIZE`, `> BATCH_SIZE`), `mapRow`, e
lista vazia — 5 tests no total. Nenhum teste novo é obrigatório para este plano.

Se o executor quiser adicionar um smoke de regressão para um dos sites migrados
(ex: confirmar que o `mapRow` de `fetchPendingUsersPage` produz a shape certa),
pode adicionar ao `infinite.test.ts` modelando a estrutura do teste existente
(usa `vi.fn()` como spy + `expect(spy).toHaveBeenCalledWith(lastRaw)`).

**Verificação de testes**: `bun --cwd apps/web test infinite` → `5 tests passing`
(ou mais, se novas regressões forem adicionadas).

## Done criteria

Machine-checkable. Todos devem passar:

- [ ] `bun verify` → exit 0 (check-types + lint + test)
- [ ] `bun run --cwd apps/web build` → exit 0
- [ ] `grep -n "hasMore = .*\.length > BATCH_SIZE" apps/web/src/app/dashboard/branches/actions.ts` → zero matches
- [ ] `grep -n "hasMore = .*\.length > BATCH_SIZE" apps/web/src/app/dashboard/branches/\[id\]/activity-data.ts` → zero matches
- [ ] `grep -n "hasMore = .*\.length > BATCH_SIZE" apps/web/src/app/dashboard/customers/data.ts` → zero matches
- [ ] `grep -n "hasMore = .*\.length > BATCH_SIZE" apps/web/src/app/dashboard/orders/data.ts` → zero matches
- [ ] `grep -n "hasMore = .*\.length > BATCH_SIZE" apps/web/src/app/dashboard/suppliers/actions.ts` → zero matches
- [ ] `grep -n "hasMore = .*\.length > BATCH_SIZE" apps/web/src/app/dashboard/tools/data.ts` → zero matches
- [ ] `grep -n "hasMore = .*length > BATCH_SIZE" apps/web/src/app/dashboard/users/data.ts` → máximo 1 match (em `fetchUsersPage`, que permanece hand-rolled por ter `limit` variável)
- [ ] `grep -n "// NOTE(045)" apps/web/src/app/dashboard/suppliers/data.ts` → 1 match
- [ ] `grep -n "// NOTE(045)" apps/web/src/app/dashboard/users/data.ts` → 1 match
- [ ] Nenhum arquivo fora da lista in-scope modificado (`git status` limpo exceto arquivos in-scope)
- [ ] `plans/README.md` atualizado com status DONE para o plano 045

## STOP conditions

Parar e reportar (não improvisar) se:

1. O código nos locais descritos em "Current state" não corresponde aos excerpts
   (o codebase derivou desde que este plano foi escrito).
2. `bun check-types` ou `bun run build` falhar após uma migração, e a causa não
   for imediatamente óbvia (erro de tipo no `as const`, shape incompatível com
   `Cursor`).
3. Qualquer migração exigir tocar um arquivo fora da lista in-scope (ex: precisar
   alterar `@/lib/cursor.ts` para adicionar um novo tipo de cursor).
4. Plans 041 ou 042 já tocaram `stock/*` — se `git log --oneline --all -- apps/web/src/app/dashboard/stock/` mostrar commits mais novos que `03984800`, confirmar que `branch-stock-data.ts` não foi alterado antes de tentar migrá-lo.
5. Um step de verificação falhar duas vezes após tentativa razoável de correção.
6. O arquivo `orders/data.ts` tiver `"use server"` no topo — rodar build gate
   extra e reportar se quebrar.

## Maintenance notes

- Os três arquivos `stock/*` (actions.ts, movements-data.ts, branch-stock-data.ts)
  têm o mesmo padrão hand-rolled e devem ser migrados em follow-up após os plans
  041/042 fecharem. O padrão a seguir é idêntico ao das funções de `branches/actions.ts`
  (Step 2); a única diferença é que `encodeMovementCursor` já encapsula o cursor
  mas o hasMore/slice ainda fica inline.
- `fetchSupplierStockPage` em `suppliers/data.ts` permanece hand-rolled. Se o
  segundo passo de enriquecimento (`getToolCardMeta`) for removido no futuro,
  a função passa a ser elegível para `paginate()` sem mais mudanças.
- `fetchUsersPage` permanece hand-rolled por aceitar `filters.limit` variável.
  Se esse parâmetro for removido, a migração é trivial.
- Revisor deve checar que `as const` nos cursor literals foi corretamente aplicado
  para que o TypeScript estreite o discriminante `sort` ao tipo `Cursor` correto.
- Nenhuma mudança de comportamento runtime é esperada — esta é uma refatoração
  pura de estrutura. Qualquer diferença de resultado indica bug na migração.
