# Redesenho da tabela de Pedidos do cliente — Design

**Data:** 2026-06-23
**Rota:** `/dashboard/customers/[id]?tab=pedidos`
**Componente-âncora:** `apps/web/src/app/dashboard/customers/_components/customer-orders-table.tsx`
**Status:** aprovado no brainstorming (Direção A1) — pronto para plano de implementação.

## 1. Contexto & objetivo

A aba "Pedidos" do detalhe de cliente lista o histórico de pedidos numa tabela. Hoje ela é a
implementação **canônica** de tabela do DESIGN.md (§4), então melhorá-la melhora o padrão por
exemplo. O usuário pediu para resolver quatro incômodos simultâneos:

1. **Densidade / vão morto** — as 6 colunas curtas clusterizam à esquerda e a coluna de ação
   (`w-full`) absorve toda a sobra, criando um vazio horizontal grande entre `Data` e `Ação`.
2. **Falta de informação útil** — só `Número · Status · Itens · Total · Data`. Não diz onde o
   pedido foi atendido nem o que foi comprado; a linha não é clicável.
3. **Consistência com o app** — usa paginação numerada, enquanto o resto do dashboard usa
   **scroll infinito** (`useInfiniteList` + `InfiniteSentinel`), inclusive "tabs internas que
   listam coleções" (regra em `apps/web/CLAUDE.md`).
4. **Estética** — sem data relativa, total sem destaque, sem hover de linha.

## 2. Estado atual (a substituir)

- **Componente** (`customer-orders-table.tsx`): Server Component que recebe `result:
  CustomerOrdersResult` por prop e renderiza `<Table>` + `<Pagination>` numerada.
- **Dados** (`data.ts` → `getCustomerOrders(id, page)`): `OFFSET/LIMIT` por página
  (`CUSTOMER_ORDERS_PAGE_SIZE`), `COUNT(*) OVER()` para `totalPages`. Campos por linha:
  `number, status, itemsCount, totalAmount, createdAt, id`.
- **Página** (`[id]/page.tsx`): lê `?page=` via `parsePage`; chama `getCustomerOrders(id, page)`
  na aba pedidos **e** `getCustomerOrders(id, 1)` na visão geral (`recentOrders`, fatiado em 3).

## 3. Design aprovado — Direção A1

Tabela enriquecida, linha clicável, **ação inline**, colunas distribuídas pela largura toda,
scroll infinito. Sete colunas:

| Coluna | Conteúdo | Alinhamento / largura |
|---|---|---|
| **Pedido** | `number` em mono, peso 600 | esquerda, ~16% |
| **Data** | data relativa ("há 23 dias"); `title` = data/hora exata | esquerda, ~12% |
| **Itens** | `itemsCount` em peso 600 + preview: `· {primeiro produto}` e, se `itemsCount > 1`, sufixo ` +{itemsCount - 1}` | esquerda, ~27% (absorve sobra) |
| **Filial** | `branch.name` (ou "—" se nulo), `text-muted-foreground` | esquerda, ~16% |
| **Status** | `<Badge>` (ícone-dot + label) com a variante de `ORDER_STATUS_VARIANTS` | esquerda, ~15% |
| **Total** | `R$ x,xx` em mono, **cor `primary` (coral)**, peso 600 | direita, ~11% |
| **Ação** | botão-ícone `EyeIcon` (`size="icon-sm"`, `variant="outline"`), `<Link>` para o pedido | direita, largura fixa (~64px) |

**Comportamentos:**

- **Linha clicável**: `<tr>` é um link para `/dashboard/orders/{id}` com hover sutil
  (`bg primary 6%`). A ação inline `Eye` permanece (canônico DESIGN.md `TableActionsCell`) e
  pára a propagação se necessário — redundância intencional (linha = atalho, botão = affordance
  explícita e acessível).
- **Distribuição**: `table-layout: fixed` com `<colgroup>` de larguras proporcionais; a sobra é
  repartida (principalmente em **Itens**), eliminando o vão sem coluna gulosa. Colunas de texto
  livre usam `truncate` (`overflow:hidden; text-overflow:ellipsis`).
- **Scroll infinito**: substitui a paginação numerada. Primeira página renderizada no servidor;
  `InfiniteSentinel` carrega as próximas via server action. Sem rodapé "fim da lista" (padrão).
- **Data relativa**: helper compartilhado (ver §4) reutilizado de `order-card.tsx`.

Mockup de referência: `.superpowers/brainstorm/157036-1782221175/content/orders-table-a-v2.html`
(A1).

## 4. Mudanças por camada

### 4.1 Dados — `customers/data.ts`

- **Enriquecer a query** com:
  - `LEFT JOIN branch b ON b.id = o.branch_id` → `branch_name` (nullable).
  - **Preview de itens** a partir de `order_item.name` (nome é *denormalizado* no item — snapshot
    da compra, não precisa join em `tool`/`variant`): subquery que pega o primeiro item
    (ex.: `ORDER BY oi.id LIMIT 1`) como `first_item_name`. `itemsCount` já existe.
- **Novo fetch keyset** `listCustomerOrders({ clientId, cursor }): Promise<InfiniteResult<CustomerOrderRow>>`:
  - Ordena `o.created_at DESC, o.id DESC` (igual a hoje).
  - Cursor = `NewestCursor` (`{ createdAt, id, sort: "newest", v: 1 }`) de `lib/cursor.ts`.
  - Busca `BATCH_SIZE + 1` linhas e usa `paginate()` de `lib/infinite.ts` para emitir
    `{ items, nextCursor }`.
  - `WHERE o.client_id = $id AND (cursor ? (o.created_at, o.id) < (cursorCreatedAt, cursorId) : true)`.
- **`CustomerOrderRow`** ganha `branchName: string | null` e `firstItemName: string | null`.
- **Aposentar** `getCustomerOrders(id, page)`, `CustomerOrdersResult` (page/total/totalPages) e
  `CUSTOMER_ORDERS_PAGE_SIZE`. A visão geral (`recentOrders`) passa a usar
  `listCustomerOrders({ clientId, cursor: null })` e fatia 3 (`.items.slice(0, 3)`).

### 4.2 Server action — `customers/actions.ts`

- `fetchCustomerOrdersPage(input: { clientId: string; cursor: string | null }):
  Promise<InfiniteResult<CustomerOrderRow>>` — `"use server"`, `await
  requireCapability("customers.read")` no topo, delega a `listCustomerOrders`. Espelha
  `fetchCustomersPage` (mesmo arquivo). É o endpoint que o Client Component chama.

### 4.3 Componentes — `customers/_components/`

- **`customer-orders-table.tsx`** vira um Server Component fino: busca a primeira página
  (`listCustomerOrders({ clientId, cursor: null })`) e renderiza o shell `<Card>` + cabeçalho +
  estado vazio (`<Empty>`), passando `initialItems`/`initialCursor` para o client.
- **Novo `customer-orders-infinite.tsx`** (`"use client"`): usa `useInfiniteList`
  (`fetchPage: (cursor) => fetchCustomerOrdersPage({ clientId, cursor })`) + `InfiniteSentinel`,
  renderiza as linhas A1 (`<Table>` com `<colgroup>`, badges, data relativa, total coral, ação
  inline `Eye`, linha-link). Espelha `customers-infinite.tsx`, sem seleção em massa.
- **Status badge**: reutilizar o mapa `ORDER_STATUS_VARIANTS` + `ORDER_STATUS_LABELS` já no
  arquivo atual (ou `OrderStatusBadge` de `orders/_components/` se servir sem acoplar contexto).

### 4.4 Página — `customers/[id]/page.tsx`

- Aba pedidos: trocar `getCustomerOrders(id, page)` por `<CustomerOrdersTable clientId=… />`
  (que busca a 1ª página internamente). Remover `ordersResult` do `Promise.all`, `parsePage`, o
  param `?page=` e qualquer `buildPageHref`.
- Visão geral: `recentOrders` passa a vir de `listCustomerOrders({ clientId: id, cursor: null })`.

### 4.5 Util compartilhado — `lib/format/datetime.ts`

- Extrair o `formatRelativeDate` que hoje é local em `order-card.tsx` para um helper
  compartilhado (ex.: `formatRelative(date)`), e fazer ambos (card + nova tabela) usarem.
  Melhoria pontual no escopo do trabalho — não refator amplo.

## 5. Fluxo de dados

```
[id]/page.tsx (Server, tab=pedidos)
  └─ <CustomerOrdersTable clientId> (Server)
       └─ listCustomerOrders({clientId, cursor:null})  → 1ª página + nextCursor
       └─ <CustomerOrdersInfinite initialItems initialCursor clientId> (Client)
            └─ useInfiniteList → fetchCustomerOrdersPage({clientId, cursor})  ["use server", guard]
                 └─ listCustomerOrders → paginate() → {items, nextCursor}
            └─ <InfiniteSentinel> dispara loadMore ~200px antes do fim
```

## 6. Edge cases

- **Vazio**: `initialItems.length === 0` → `<Empty>` "Nenhum pedido encontrado" (mantém atual).
- **Filial nula**: `branchName == null` → "—".
- **Item único / sem itens**: preview = `firstItemName` puro (sem " +N"); `itemsCount` 0 →
  só "0" sem preview.
- **Nome de produto longo**: célula Itens com `truncate` (a coluna estica mas não quebra layout).
- **Status desconhecido**: fallback `variant="secondary"` + label cru (igual a hoje).
- **Data relativa e hidratação**: relativo é derivado de `Date.now()`; arredondado em dias/horas,
  estável entre SSR e cliente exceto no instante de virada de limite (mesmo comportamento já
  aceito em `order-card.tsx`); o `title` carrega a data/hora exata via `formatDateTime`.
- **Capability**: `customers.read` cobre tanto o SSR (página) quanto o action (scroll). Sem
  acesso → a página já redireciona antes de montar a aba.

## 7. Testes

- **Unit (`vitest`, node)**: `listCustomerOrders` — mock do `@emach/db` (padrão `vi.hoisted` +
  `vi.mock`): valida ordenação, derivação de `nextCursor` (com/sem mais páginas via
  `BATCH_SIZE+1`), `branchName`/`firstItemName`/" +N" e `WHERE` do cursor. Helper `formatRelative`
  ganha teste de fronteiras (minutos/horas/dias/meses).
- **Smoke visual obrigatório** (regra do projeto — `tsc` não pega SQL inválido em template nem
  hook client em Server Component): `bun dev:web` → visitar
  `/dashboard/customers/{id}?tab=pedidos` com cliente de ≥1 pedido e com 0 pedidos; conferir
  scroll infinito, hover/linha-link, ação inline, total coral, distribuição sem vão.
- **Gate**: `bun verify` (`check-types && check && test`) + `bun run build` (obrigatório por
  mexer em `"use server"` — re-export de não-async quebra só no build).

## 8. Fora de escopo

- As outras tabelas de coleção do detalhe de cliente (Avaliações, Sessões, Auditoria, Consentimento)
  — migram depois, seguindo este como novo exemplar.
- Filtros/ordenação por coluna na tabela de pedidos.
- Atualizar a referência canônica no `DESIGN.md`/`/design#table` — anotar como follow-up se A1 for
  promovido a padrão.

## 9. Arquivos tocados

- `apps/web/src/app/dashboard/customers/data.ts` (query + `listCustomerOrders` + tipos; remover page-based)
- `apps/web/src/app/dashboard/customers/actions.ts` (`fetchCustomerOrdersPage`)
- `apps/web/src/app/dashboard/customers/_components/customer-orders-table.tsx` (vira shell server)
- `apps/web/src/app/dashboard/customers/_components/customer-orders-infinite.tsx` (**novo**, client)
- `apps/web/src/app/dashboard/customers/[id]/page.tsx` (fetch da aba + recentOrders; remover `?page`)
- `apps/web/src/lib/format/datetime.ts` (extrair `formatRelative`)
- `apps/web/src/app/dashboard/orders/_components/order-card.tsx` (usar o helper compartilhado)
- testes: `data.ts`/`format` (vitest)
