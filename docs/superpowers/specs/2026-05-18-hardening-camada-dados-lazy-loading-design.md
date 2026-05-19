# Hardening da camada de dados dos cards de lazy loading

Data: 2026-05-18
Follow-up de: `2026-05-18-cards-pendencias-atividade-lazy-loading-design.md`

## Contexto

A feature de lazy loading dos cards Pendências + Atividade (3 rotas: `/dashboard`, `/dashboard/orders`, `/dashboard/customers`) deixou dois follow-ups identificados no code review final:

1. **Duplicação + arquivos grandes** — as 8 funções `fetch*Page` repetem o mesmo bloco de paginação (`hasMore`/`slice`/`lastRaw`/`encodeCursor`); `orders/data.ts` (~975 linhas) e `customers/data.ts` (~961 linhas) cresceram ao absorver as funções de paginação.
2. **Cobertura de teste** — as 8 server actions cursor-paginadas foram validadas só por review + smoke manual; o projeto tem testes unitários sem DB (`branch-scope`, `order-transitions`, `permissions`), mas a lógica de paginação está entrelaçada com `db.execute`, logo não-testável como está.

Um terceiro item (cursor da atividade de customers carregar `id` prefixado) foi avaliado e **descartado do escopo** — é inofensivo (keyset da atividade de customers é timestamp-only por design, UNION de 3 fontes sem id comum).

## Objetivo

Refactor coeso que une os dois follow-ups: extrair a lógica pura de paginação para `lib/`, o que (a) elimina a duplicação, (b) cria a superfície testável sem DB, (c) encolhe os arquivos `data.ts`. Em seguida, organizar as funções dos cards em um arquivo dedicado por rota.

**Não há mudança de comportamento** — é refactor estrutural + testes.

## Decisões tomadas (brainstorming)

- Estratégia de teste: extrair helper puro de paginação + helpers de cursor para `lib/`, com testes unitários reais (sem DB — coerente com os testes existentes).
- Organização: `pending-data.ts` nas 3 rotas (incluindo dashboard, para estrutura uniforme).
- Item do cursor `id` da atividade de customers: fora de escopo.
- Nome do arquivo: `pending-data.ts` (curto; "pending" é o card dominante, ainda que o arquivo leve também as funções de atividade).

## Parte A — Helper puro de paginação

### `lib/infinite.ts` — função `paginate`

`lib/infinite.ts` hoje exporta `BATCH_SIZE` e `InfiniteResult<T>`. Adicionar:

```ts
function paginate<TRaw, TItem>(
	rawRows: TRaw[],
	mapRow: (r: TRaw) => TItem,
	makeCursor: (lastRaw: TRaw) => Cursor,
): InfiniteResult<TItem>
```

Comportamento:
- `hasMore = rawRows.length > BATCH_SIZE`.
- `pageRows = hasMore ? rawRows.slice(0, BATCH_SIZE) : rawRows`.
- `items = pageRows.map(mapRow)`.
- `nextCursor = hasMore ? encodeCursor(makeCursor(rawRows[BATCH_SIZE - 1])) : null`.
- `makeCursor` é chamado **somente** quando `hasMore` — recebe a última linha **raw** da página (índice `BATCH_SIZE - 1`), de onde extrai os campos do cursor (`created_at`, `quantity`, ids).
- Retorna `{ items, nextCursor }`.

Cada `fetch*Page` passa a terminar com `return paginate(result.rows, mapRow, makeCursor)` em vez do bloco manual repetido.

### `lib/cursor.ts` — função `decodeCursorAs`

Hoje cada função decodifica o cursor e valida o discriminante `sort` à mão (`if (c.sort !== "newest") throw ...`); `dashboard/actions.ts` tem um helper solto `newestCursor()`. Consolidar em:

```ts
function decodeCursorAs<S extends Cursor["sort"]>(
	raw: string,
	sort: S,
): Extract<Cursor, { sort: S }>
```

Decodifica via `decodeCursor`, valida `parsed.sort === sort`, lança `Error("Cursor incompatível: esperado <sort>")` se divergir, retorna o tipo estreitado. Substitui `newestCursor()` e os checks inline nas 8 funções.

## Parte B — `pending-data.ts` por rota

Mover as funções dos cards para um arquivo dedicado por rota. `actions.ts` de cada rota fica como wrapper fino `"use server"` que re-exporta (mantém os call sites client-side funcionando — server actions precisam de `"use server"`).

| Rota | `pending-data.ts` (novo, plain — sem `"use server"`) | `actions.ts` |
|---|---|---|
| `dashboard` | `fetchPendingStock`, `fetchPendingOrders`, `fetchPendingReviews`, `fetchDashboardActivity`, `fetchDashboardCounts` | **novo** `dashboard/actions.ts` `"use server"` que re-exporta as 5 funções (hoje elas vivem direto no `actions.ts`) |
| `orders` | `fetchPendingOrdersPage`, `fetchOrderActivityPage`, const `PENDING_ORDER_BADGE` | re-export ajustado para importar de `./pending-data` |
| `customers` | `fetchPendingCustomersPage`, `fetchCustomerActivityPage`, `CustomerPendingKind`, `CUSTOMER_PENDING_PREDICATE`, `CUSTOMER_PENDING_BADGE`, `CUSTOMER_ACTIVITY_LABELS` | re-export ajustado para importar de `./pending-data` |

Notas:
- `pending-data.ts` **não** leva `"use server"` — são funções chamadas tanto server-side (carga inicial em `page.tsx`) quanto via o wrapper de `actions.ts` (passadas como `fetchPage` a Client Components).
- `dashboard/page.tsx`, `orders/page.tsx`, `customers/page.tsx` podem continuar importando das funções via `actions.ts` (wrapper) — ajustar imports onde necessário; nenhuma mudança de assinatura pública.
- As funções de paginação de pedidos/clientes saem de `orders/data.ts` e `customers/data.ts`; esses arquivos voltam a ~750–850 linhas. `getRecentCustomerActivity`/`getOrdersTabCounts`/etc. permanecem em `data.ts` (não são funções dos cards lazy-loaded — `fetchCustomerActivityPage` é a versão paginada nova e essa sim move).
- `CUSTOMER_ACTIVITY_LABELS` é exportada e consumida por `fetchCustomerActivityPage` — move junto. Conferir que nenhum outro arquivo a importa de `data.ts`; se importar, atualizar o import.

Resultado: estrutura uniforme nas 3 rotas — `data.ts` (dados gerais) + `pending-data.ts` (cards lazy-loaded) + `actions.ts` (`"use server"` wrappers).

## Parte C — Testes (vitest, `environment: "node"`, sem DB)

Testes em `apps/web/__tests__/` (padrão do projeto).

### `__tests__/infinite.test.ts` — `paginate()`

- Menos que `BATCH_SIZE` linhas → `nextCursor === null`, todos os itens retornados, `makeCursor` não chamado.
- Exatamente `BATCH_SIZE` linhas → `nextCursor === null`, todos retornados, `makeCursor` não chamado.
- `BATCH_SIZE + 1` linhas → `nextCursor` não-nulo, `items.length === BATCH_SIZE`, cursor derivado da linha de índice `BATCH_SIZE - 1`.
- `mapRow` aplicado a cada item retornado.
- `makeCursor` recebe a linha raw correta (índice `BATCH_SIZE - 1`).

### `__tests__/cursor.test.ts` — `cursor.ts`

- `encodeCursor` → `decodeCursor` roundtrip preserva o objeto, para cada variante da união `Cursor` (`newest`, `pendingStock`, e ao menos mais uma existente).
- `decodeCursor` lança em cursor com `v` incompatível.
- `decodeCursorAs(raw, "newest")` retorna o cursor quando o `sort` bate.
- `decodeCursorAs(raw, "newest")` lança `Error` quando o `sort` diverge (ex.: cursor `pendingStock` decodificado como `newest`).

## Verificação

- `bun check-types` — limpo.
- `biome check` nos arquivos tocados — limpo.
- `bun --cwd apps/web test` — suíte passa, incluindo os 2 novos arquivos de teste.
- Smoke rápido em `bun dev:web` nas 3 rotas — como é refactor sem mudança de comportamento, confirmar que os cards ainda carregam e paginam.

## Fora de escopo

- Cursor `id` da atividade de customers (avaliado e descartado).
- Harness de teste com DB / testes de integração das queries SQL (Fase F).
- Qualquer mudança de comportamento dos cards ou das queries.
