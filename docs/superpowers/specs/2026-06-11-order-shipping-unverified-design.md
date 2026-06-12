# Coluna `order.shippingUnverified` + revisão de frete fail-open (#143)

> Spec de brainstorming. Issue: othavioquiliao/emach-dashboard#143.
> Habilita: emach-ecommerce#97 (endurecer frete fail-open).

## Objetivo

No storefront, quando a API SuperFrete está fora, o checkout hoje aceita o pedido
com **qualquer** `shippingAmount` do cliente (inclusive R$ 0). Para endurecer sem
travar venda legítima por instabilidade, o ecommerce passará a **marcar** o pedido
(`shippingUnverified = true`) em vez de aceitar silenciosamente. Este repo
(dashboard, autoritativo do schema — ADR-0009) entrega: a **coluna**, a **UI admin**
para o staff ver/triar, e a **ação** de marcar como revisado.

## Fronteira de responsabilidade

- **Ecommerce (#97, fora deste repo):** escreve `shippingUnverified = true` no
  checkout quando não consegue revalidar o frete; decisão de produto fail-open
  (pedido **segue para pagamento** + alerta no dashboard, não trava).
- **Dashboard (este spec):** schema (fonte de verdade), exibição, ação de revisão.
  Não toca `place-order.ts`/lógica de checkout.

## Estado validado (2026-06-11)

- Coluna **não existe**: `order` tem `shippingAmount`, `shippingMethod`,
  `shippingAddress`, `shippingTrackingCode` — sem `shippingUnverified`.
- `orderEventTypeEnum` existe com `tracking_set`, `branch_assigned` (aditivo).
- UI de pedido segue o entity-detail pattern (`EntityIdentityHeader` + tabs);
  badge via `Badge` + `TONE_BADGE_VARIANT` (`order-status-badge.tsx`).
- Mutações de pedido passam por `lockOrderAndAuthorize(tx, cap, orderId)`
  (`orders/actions.ts`) — SELECT FOR UPDATE + capability/branch-scoping.

## Decisões travadas (brainstorming)

1. **Flag é read-write:** o staff pode **marcar como revisado** (ação dedicada,
   auditável). Sem isso o flag/filtro nunca esvaziaria.
2. **Auditoria via `orderEvent`:** novo eventType `shipping_reviewed` — encaixa no
   enum aditivo cuja função é "evento operacional auditável que não é transição de
   status". Não polui `orderStatusHistory`.
3. **Badge em dois lugares:** header do detalhe + card da listagem (não na aba de
   entrega, não banner dedicado).
4. **Filtro incluído agora:** toggle "Frete a revisar" na listagem.

## Componentes

### 1. Schema (`packages/db/src/schema/orders.ts`)

- `shippingUnverified: boolean("shipping_unverified").notNull().default(false)` na
  tabela `order`, junto aos campos de frete.
- Adicionar `"shipping_reviewed"` ao final de `orderEventTypeEnum` (aditivo — a
  regra do arquivo exige novos valores no fim; ALTER TYPE ADD VALUE é seguro).
- Aplicar com `bun db:sync` (push-only, ADR-0006).

### 2. Camada de dados (`orders/data.ts`)

Incluir `shippingUnverified` no select do `OrderDetail` e no tipo que alimenta o
`order-card` da listagem. (Atenção ao gotcha de `db.execute` raw → snake_case /
timestamp string, caso a query use execute; ver `packages/db/CLAUDE.md`.)

### 3. UI detalhe — badge (`orders/[id]/_components/order-identity.tsx`)

Badge **"Frete não verificado"** (tone de alerta — `warning`/amber via
`TONE_BADGE_VARIANT`) ao lado do `OrderStatusBadge` no `EntityIdentityHeader`,
condicional a `order.shippingUnverified`.

### 4. Ação "marcar revisado" (`orders/actions.ts` + UI)

Server action `markShippingReviewed(orderId)`:
- `"use server"`, `await requireCapability(...)`, `ActionResult<T>`.
- `lockOrderAndAuthorize(tx, cap, orderId)` (FOR UPDATE + branch-scoping).
- `UPDATE order SET shipping_unverified = false WHERE id = orderId`.
- Insert `orderEvent`: `eventType: "shipping_reviewed"`, `actorType: "user"`,
  `actorUserId: session.user.id` (CHECK `order_event_actor_coherence` exige).
- `revalidateTag("orders")`.
- Botão dispara no header `actions` do detalhe quando `unverified` (ação
  contextual por estado), com `useTransition` p/ cobrir double-submit.

### 5. Listagem — badge + filtro

- `order-card.tsx`: realce/badge quando `unverified`.
- `order-list-filters.tsx`: toggle "Frete a revisar".
- `data.ts`: predicado `where shipping_unverified = true` na query paginada
  (keyset cursor, padrão `useInfiniteList` / `BATCH_SIZE`).

### 6. Sync (`sync-db-schema.yml`)

Merge na `main` → PR automático no ecommerce com o schema novo (a coluna que o
`place-order.ts` de lá vai escrever). Sem ação manual além de revisar/mergear o PR.

## Testes

- Unit (`apps/web`, vitest node): `markShippingReviewed` — caminho feliz (seta
  false + insere event) e guard (pedido de outra filial bloqueado). Mock de
  `@emach/db` via `vi.hoisted` (ref: `__tests__/activity.test.ts`).
- Smoke visual: `bun dev:web` → abrir pedido `unverified` (badge no header),
  listagem com filtro ligado, clicar "marcar revisado" → badge some + event no
  history feed. (`tsc` não pega SQL inválido nem hook client em Server Component.)

## Fora de escopo (YAGNI)

- `place-order.ts` / lógica de checkout / a escrita do flag (ecommerce #97).
- Banner dedicado, badge na aba de entrega (não escolhidos).
- Religar gates de role (ADR-0012) — usar `requireCapability` como no-op atual.

## Arquivos tocados (dashboard)

| Arquivo | Ação |
|---------|------|
| `packages/db/src/schema/orders.ts` | coluna + enum value |
| `apps/web/src/app/dashboard/orders/data.ts` | select + filtro |
| `apps/web/src/app/dashboard/orders/actions.ts` | `markShippingReviewed` |
| `apps/web/src/app/dashboard/orders/[id]/_components/order-identity.tsx` | badge header |
| `apps/web/src/app/dashboard/orders/_components/order-card.tsx` | badge card |
| `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx` | toggle filtro |
| UI da ação (botão "marcar revisado") | no header/detalhe |

## Verificação

- `bun db:sync` aplica a coluna + enum sem erro.
- `bun check-types` + `bun check` limpos.
- Testes vitest verdes.
- Smoke visual das rotas afetadas.
- PR de sync abre no ecommerce após merge.
- Fechar #143 referenciando o PR.
