# Cards Pendências + Atividade — altura limitada, scroll interno e lazy loading

Data: 2026-05-18
Rotas alvo: `/dashboard` e `/dashboard/orders`

## Contexto

As duas rotas exibem um par de cards lado a lado:

- **Pendências** (`PendingList`) — hoje é um **resumo de contadores agregados** agrupados (ex.: "3 — Pagos · aguardando preparação"). Não é lista de itens; cada grupo tem 1–3 linhas de número + rótulo.
- **Atividade / Histórico recente** (`ActivityFeed`) — hoje é uma **lista estática de 15 eventos**, sem scroll interno e sem lazy loading.

O único componente do projeto com scroll + lazy loading real (`IntersectionObserver` + cursor) é a tabela de pedidos (`OrdersInfinite` + `useInfiniteList` + `InfiniteSentinel`).

## Objetivo

Padronizar o par de cards nas duas rotas:

1. **Pendências** deixa de ser contador e passa a listar **itens reais**, organizado em **abas (segment control)** — uma lista rolável e com lazy loading por aba.
2. **Atividade / Histórico recente** ganha altura máx/mín, scroll interno e lazy loading real (cursor-based).

Sem mudança de paleta ou tipografia — segue `DESIGN.md`.

## Decisões tomadas (brainstorming)

- Pendências mostra **listas de itens reais**, não contadores.
- Os **3 grupos** de `/dashboard` (Estoque, Pedidos, Moderação) viram listas — card consistente, sem formato misto.
- Layout do card Pendências: **abas/segmentos**, com **uma** lista rolável + lazy loading da aba ativa (encaixa no `useInfiniteList`, que é uma lista / um cursor).

## Componentes

### 1. `PendingPanel` (novo, client — substitui `PendingList`)

Arquivo: `apps/web/src/components/pending-list.tsx` → reescrito como `pending-panel.tsx`.

- Header com segment control (`tabs.tsx` ou `toggle-group.tsx` de `@emach/ui`). Cada aba: label + badge de contagem, cor pela `role` do grupo.
- Abaixo, **uma** lista da aba ativa em container com `min-h`/`max-h` + scroll interno + `InfiniteSentinel`.
- Trocar de aba reseta a lista (`resetKey = tabId`), reusando `useInfiniteList`.
- Linha uniforme: `PendingRow { id, href, primary, secondary?, badge? }` — clicável, leva ao item.
- Props: `tabs: { id, label, count, role?, initial: PendingRow[], initialCursor: string | null, fetchPage: (cursor) => Promise<InfiniteResult<PendingRow>> }[]`.
- Abas por rota:
  - `/dashboard`: **Estoque · Pedidos · Moderação**.
  - `/dashboard/orders`: **Aguardando ação · Em fluxo** (mesmos grupos de hoje, agora listas de pedidos).

### 2. `ActivityFeed` (refatorado)

Arquivo: `apps/web/src/components/activity-feed.tsx`.

- Vira client component sobre `useInfiniteList` (hoje recebe array fixo).
- Container `min-h`/`max-h` + scroll interno + `InfiniteSentinel`.
- Continua genérico: recebe `initialItems`, `initialCursor`, `fetchPage`, `title`, `emptyMessage`.
- Mantém `KIND_META`, `formatWhen` e o visual de linha atuais.

### 3. `InfiniteSentinel` (ajuste)

Arquivo: `apps/web/src/components/infinite-sentinel.tsx`.

- Hoje o `IntersectionObserver` usa `root` = viewport (correto para a tabela de pedidos, que rola a página).
- Para scroll **interno** ao card, adicionar prop opcional `root?: RefObject<HTMLElement | null>` — passada ao `IntersectionObserver`. Sem isso o lazy loading não dispara dentro do card.
- A tabela de pedidos continua sem passar `root` (comportamento inalterado).

## Camada de dados

Padrão de cursor já usado no projeto: `(created_at, id) < (cursor_created_at, cursor_id)`, lotes via `BATCH_SIZE` (`apps/web/src/lib/infinite.ts`).

### `/dashboard` (`apps/web/src/app/dashboard/`)

Novas server actions cursor-paginadas (retornam `InfiniteResult<PendingRow>` / `InfiniteResult<ActivityEvent>`):

- `fetchPendingStock(cursor)` — `stock_level` com `quantity = 0` OU (`reorder_point > 0` AND `quantity <= reorder_point`); ordena zerados primeiro, depois por quantidade asc. Linha → `/dashboard/stock`.
- `fetchPendingOrders(cursor)` — pedidos em `paid`/`preparing`/`shipped`, ordenados por `created_at` desc. Linha → `/dashboard/orders/[id]`.
- `fetchPendingReviews(cursor)` — `review` com `status = 'pending'`, ordenados por `created_at` desc. Linha → `/dashboard/reviews/[id]`.
- `fetchDashboardActivity(cursor)` — a UNION stock/order/review atual (`fetchRecentActivity`), agora com filtro de cursor por `created_at` em cada subquery e lote por `BATCH_SIZE`.
- `fetchPendingCounts` permanece — alimenta os badges de contagem das abas.

### `/dashboard/orders` (`apps/web/src/app/dashboard/orders/`)

- Pendências reusa `fetchOrdersPage` (já cursor-based e branch-scoped). As abas mapeiam para conjuntos de status:
  - Aguardando ação → `paid`, `pending_payment`.
  - Em fluxo → `preparing`, `shipped`.
  - Se `resolveTab` não aceitar multi-status, adicionar duas tabs lógicas ou data fns finas dedicadas — mantendo o branch-scoping de `fetchOrdersPage`.
- Atividade: nova `fetchOrderActivityPage(cursor)` — versão paginada de `getRecentOrderActivity` (tabela `order_status_history`, cursor `(created_at, id)`).

## Carga inicial

O Server Component de cada página busca em paralelo (`Promise.all`):

- contagens das abas;
- 1ª página de **cada** aba do `PendingPanel`;
- 1ª página da atividade.

Lotes de ~24 linhas são baratos — busca antecipada evita flash de loading ao trocar de aba.

## Estados vazios

- Por aba: "Nada pendente nesse grupo."
- Atividade vazia: mensagem atual (`emptyMessage`).
- Mantém o tom atual dos componentes.

## Layout / heights

- Ambos os cards do grid compartilham o mesmo `min-h`/`max-h` para alinhamento visual. Sugestão inicial: `min-h-72 max-h-[28rem]` (ajustável no smoke).
- Scroll interno via `overflow-y-auto` no corpo do card (ou `ScrollArea` de `@emach/ui`).
- O `InfiniteSentinel` fica dentro do container rolável e recebe o `root` desse container.

## Arquivos afetados

- `apps/web/src/components/pending-list.tsx` → reescrito como `pending-panel.tsx`.
- `apps/web/src/components/activity-feed.tsx` → refatorado para infinite.
- `apps/web/src/components/infinite-sentinel.tsx` → prop `root`.
- `apps/web/src/app/dashboard/page.tsx` → novas data fns + wiring do painel.
- `apps/web/src/app/dashboard/orders/page.tsx` → wiring.
- `apps/web/src/app/dashboard/orders/data.ts` / `actions.ts` → `fetchOrderActivityPage` + mapeamento de abas.

## Validação

- `bun check-types` nos workspaces alterados.
- `bun fix` no escopo.
- Smoke em `bun dev:web`: visitar `/dashboard` e `/dashboard/orders`, trocar abas, rolar até disparar o lazy loading, conferir estados vazios. `tsc` não detecta SQL inválido nem falha de `IntersectionObserver`.

## Fora de escopo

- Refatoração da tabela de pedidos (`OrdersInfinite`).
- Mudanças de paleta/tipografia.
- Filtros novos nas listas de pendências.
