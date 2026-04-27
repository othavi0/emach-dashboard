# Spec — Fase B: Orders + Reviews

**Data:** 2026-04-27
**Status:** Aprovado para implementação
**Plano-pai:** `/home/othavio/.claude/plans/eu-quero-que-voce-curious-sun.md`
**Handoff:** `docs/superpowers/HANDOFF-FASE-B.md`
**Branch:** `feat/fase-b-orders`
**Pré-requisito:** Fase A concluída (`feat/fase-a-fundacao` — PR #8)

---

## Contexto

A Fase A entregou a fundação: pgEnum para roles, check de oversell em `stockLevel`, auditoria com `actorType` em `stockMovement`, idempotência de débito de venda, capabilities granulares em `permissions.ts`, categorias hierárquicas, LGPD básico e Vitest baseline.

A Fase B constrói sobre essa fundação para entregar o módulo de **pedidos** (read + fulfillment) e **moderação de reviews**. O admin não cria pedidos nem processa pagamento — o site ecomerce faz isso. O admin gerencia o ciclo de fulfillment: preparação → envio → entrega, com cancelamento/reembolso e devolução semi-manual ao estoque.

---

## Decisões confirmadas (não rebrainstormar)

| Tema | Decisão |
|---|---|
| Pagamento/gateway | 100% no site ecomerce — admin read-only |
| Frete | 100% no site — admin pode editar `trackingCode` |
| `order.number` | Postgres SEQUENCE `order_number_seq`, formato `YYYY-000NNN` |
| Snapshot fiscal | Completo em `orderItem` (NF-e exige imutabilidade) |
| Reviews verified-buyer | `orderId` obrigatório (NOT NULL) |
| Auditoria de status | Mesmo padrão `actorType` de `stockMovement` |
| Idempotência débito venda | Já implementada via partial unique em `stockMovement` (Fase A) |
| Distribuição schema | Cópia versionada manual a cada migration |

## Decisões tomadas no brainstorming

| Tema | Decisão |
|---|---|
| Devolução ao estoque (cancel/refund) | Semi-manual — modal com checkboxes por item perguntando o que devolver |
| Listagem de pedidos | Tabs por status + search bar ILIKE (número/nome cliente) + filtros data/filial |
| Detalhe do pedido | Split layout — esquerda: dados; direita: timeline + ações. Sem rota `/edit` separada |
| Impressão | Romaneio de separação + etiqueta de envio na mesma rota via `?type=picking\|shipping` |
| Moderação de reviews | Fila simples (listagem → detalhe com ações approve/reject/spam) |

---

## 1. Schema

### 1.1 `packages/db/src/schema/orders.ts` (novo)

#### Enums

```ts
export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment", "paid", "preparing", "shipped", "delivered", "canceled", "refunded",
]);
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending", "authorized", "paid", "failed", "refunded",
]);
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
```

#### `order`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `text pk` | `crypto.randomUUID()` no caller |
| `number` | `text unique notNull` | Gerado via SEQUENCE — formato `YYYY-000NNN` |
| `clientId` | `text FK client.id` | `onDelete: "restrict"` |
| `branchId` | `text FK branch.id nullable` | Atribuído na separação pelo admin |
| `status` | `orderStatusEnum notNull default "pending_payment"` | |
| `paymentStatus` | `paymentStatusEnum notNull default "pending"` | Read-only no admin |
| `paymentMethod` | `text` | Read-only no admin |
| `paymentProviderRef` | `text` | Read-only no admin |
| `subtotalAmount` | `numeric(12,2) notNull` | |
| `discountAmount` | `numeric(12,2) notNull default "0"` | |
| `shippingAmount` | `numeric(12,2) notNull default "0"` | |
| `totalAmount` | `numeric(12,2) notNull` | |
| `shippingAddress` | `jsonb notNull` | Snapshot: `{ zipCode, street, number, complement, neighborhood, city, state, country, recipient }` |
| `shippingMethod` | `text` | |
| `shippingTrackingCode` | `text nullable` | Admin edita ao despachar |
| `notes` | `text` | Notas do cliente no checkout |
| `createdAt` | `timestamp defaultNow notNull` | |
| `paidAt` | `timestamp nullable` | |
| `shippedAt` | `timestamp nullable` | |
| `deliveredAt` | `timestamp nullable` | |
| `canceledAt` | `timestamp nullable` | |

**Indexes:** `(clientId)`, `(branchId)`, `(status, createdAt desc)`, `(number)` — para busca ILIKE.

#### `orderItem` — snapshot fiscal imutável

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `text pk` | |
| `orderId` | `text FK order.id onDelete cascade notNull` | |
| `toolId` | `text FK tool.id onDelete restrict notNull` | |
| `sku` | `text` | Snapshot de `tool.sku` |
| `name` | `text notNull` | Snapshot de `tool.name` |
| `model` | `text` | Snapshot |
| `voltage` | `text` | Snapshot |
| `unitPrice` | `numeric(12,2) notNull` | |
| `quantity` | `integer notNull` | CHECK > 0 |
| `lineTotal` | `numeric(12,2) notNull` | `unitPrice × quantity` |
| `discountAmount` | `numeric(12,2) notNull default "0"` | |
| `cost` | `numeric(12,2)` | Para relatório de margem |
| `ncm` | `text` | BR fiscal |
| `cest` | `text` | BR fiscal |
| `manufacturerName` | `text` | |
| `weightKg` | `numeric(10,3)` | |
| `lengthCm` | `numeric(10,2)` | |
| `widthCm` | `numeric(10,2)` | |
| `heightCm` | `numeric(10,2)` | |

**Indexes:** `(orderId)`.
**Check:** `quantity_positive` → `quantity > 0`.

#### `orderStatusHistory` — auditoria

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `text pk` | |
| `orderId` | `text FK order.id onDelete cascade notNull` | |
| `fromStatus` | `orderStatusEnum notNull` | |
| `toStatus` | `orderStatusEnum notNull` | |
| `actorType` | `actorTypeEnum notNull` | Reusa enum de `stock-movements.ts` |
| `actorUserId` | `text FK user.id nullable onDelete set null` | |
| `actorApiKeyId` | `text FK apiKey.id nullable onDelete set null` | |
| `reason` | `text` | |
| `createdAt` | `timestamp defaultNow notNull` | |

**CHECK:** `actor_coherence` — idêntico ao de `stockMovement`:
```sql
(actorType = 'user'   AND actorUserId IS NOT NULL AND actorApiKeyId IS NULL)
OR (actorType = 'apiKey' AND actorApiKeyId IS NOT NULL AND actorUserId IS NULL)
OR (actorType = 'system' AND actorUserId IS NULL AND actorApiKeyId IS NULL)
```

**Indexes:** `(orderId, createdAt desc)`.

#### `orderNote` — notas internas

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `text pk` | |
| `orderId` | `text FK order.id onDelete cascade notNull` | |
| `authorId` | `text FK user.id notNull` | |
| `body` | `text notNull` | |
| `createdAt` | `timestamp defaultNow notNull` | |

**Indexes:** `(orderId, createdAt desc)`.

#### Relations

- `order` → `client` (one), `branch` (one nullable), `items` (many orderItem), `statusHistory` (many), `notes` (many orderNote)
- `orderItem` → `order` (one), `tool` (one)
- `orderStatusHistory` → `order` (one), `actorUser` (one nullable), `actorApiKey` (one nullable)
- `orderNote` → `order` (one), `author` (one user)

### 1.2 `packages/db/src/schema/reviews.ts` (novo)

#### Enum

```ts
export const reviewStatusEnum = pgEnum("review_status", [
  "pending", "approved", "rejected", "spam",
]);
export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];
```

#### `review`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `text pk` | |
| `toolId` | `text FK tool.id onDelete restrict notNull` | |
| `clientId` | `text FK client.id onDelete restrict notNull` | |
| `orderId` | `text FK order.id onDelete restrict notNull` | Verified buyer |
| `rating` | `integer notNull` | CHECK 1–5 |
| `title` | `text` | |
| `body` | `text notNull` | |
| `status` | `reviewStatusEnum notNull default "pending"` | |
| `moderatedBy` | `text FK user.id nullable onDelete set null` | |
| `moderatedAt` | `timestamp nullable` | |
| `moderationNote` | `text` | |
| `createdAt` | `timestamp defaultNow notNull` | |
| `updatedAt` | `timestamp defaultNow notNull $onUpdate` | |

**Unique index:** `(clientId, toolId, orderId)` — 1 review por compra.
**Indexes:** `(toolId)`, `(status, createdAt desc)`.

#### Relations

- `review` → `tool` (one), `client` (one), `order` (one), `moderator` (one user nullable)

### 1.3 Alterações em schemas existentes

| Arquivo | Mudança |
|---|---|
| `stock-movements.ts` | Adicionar FK constraints reais: `orderId` → `order.id` ON DELETE SET NULL, `orderItemId` → `orderItem.id` ON DELETE SET NULL |
| `schema/index.ts` | Re-exportar `orders.ts` e `reviews.ts` |

### 1.4 Triggers / Sequence (em `_triggers.sql`)

```sql
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
```

O `order.number` é montado server-side no momento da criação (pelo site ecomerce):
```ts
const year = new Date().getFullYear();
const seq = await tx.execute(sql`SELECT nextval('order_number_seq') AS seq`);
const number = `${year}-${String(seq.rows[0].seq).padStart(6, "0")}`;
```

---

## 2. Rotas e Telas

### 2.1 Estrutura de arquivos

```
apps/web/src/app/dashboard/
  orders/
    page.tsx                    — listagem com tabs + search + filtros
    [id]/page.tsx               — split layout (dados esquerda + timeline/ações direita)
    [id]/print/page.tsx         — romaneio + etiqueta via ?type=picking|shipping
    actions.ts                  — updateStatus, addNote, assignBranch, updateTrackingCode
    schema.ts                   — Zod schemas
    _components/
      order-list-filters.tsx    — tabs de status + search bar + filtros data/filial
      order-table.tsx           — tabela: número, cliente, status badge, total, data
      order-detail-info.tsx     — painel esquerdo: itens, endereço, pagamento, frete
      order-timeline.tsx        — timeline vertical: statusHistory + notas intercalados
      order-actions-panel.tsx   — próximo status, atribuir filial, add nota, edit tracking
      stock-return-dialog.tsx   — modal de devolução ao estoque (checkboxes por item)
      print-picking-slip.tsx    — romaneio de separação (print-friendly)
      print-shipping-label.tsx  — etiqueta de envio (print-friendly)

  reviews/
    page.tsx                    — fila de moderação (pending por padrão)
    [id]/page.tsx               — detalhe + ações moderate
    actions.ts                  — moderateReview
    schema.ts
    _components/
      review-queue-table.tsx    — tabela: produto, cliente, rating, trecho body, data
      review-detail-card.tsx    — review completo com produto thumbnail
      moderate-actions.tsx      — botões approve/reject/spam + campo nota moderação
```

### 2.2 Orders — Listagem

- **Tabs fixas:** Todos | Aguardando pgto (`pending_payment`) | Pagos (`paid`) | Em preparação | Enviados | Entregues | Cancelados (`canceled`+`refunded`)
- **Search bar:** ILIKE em `order.number` e `client.name` (via LEFT JOIN client)
- **Filtros:** date range (`createdAt`), filial (`branchId` select)
- **Paginação:** server-side, 20 por página, via URL search params (`?tab=preparing&q=2026-000&page=2`)
- **Sem cache:** dados mudam frequentemente — query direta no `db`
- **Colunas da tabela:** Número, Cliente (nome), Status (badge colorido), Total (formatado R$), Data (relativa), Filial (nome ou "—")

### 2.3 Orders — Detalhe (split layout)

**Coluna esquerda (dados):**
- Header: número do pedido + status badge + `createdAt` formatado
- Card "Itens": tabela com SKU, nome, modelo, qtd, preço unitário, total da linha
- Card "Endereço de entrega": snapshot formatado (recipient, rua, número, complemento, bairro, cidade-UF, CEP)
- Card "Pagamento" (read-only): método, status, referência do provedor
- Card "Frete": método, valor (R$), tracking code (editável via inline input + botão salvar)

**Coluna direita (ações + timeline):**
- **Painel de ações (topo):**
  - Botão contextual de próximo status (ex: se `preparing` → "Marcar como Enviado")
  - Se `preparing`/`paid`: select de filial para atribuir
  - Se `shipped`: campo tracking code (se não preenchido)
  - Form de nota interna (textarea + botão)
  - Se clicou "Cancelar" ou "Reembolsar": abre `stock-return-dialog`
- **Timeline (abaixo):** lista vertical cronológica (desc) mesclando `orderStatusHistory` e `orderNote`. Cada entry mostra ícone por tipo, ator (nome do user ou "Sistema" ou "Site"), data relativa, e motivo/body.

**Mobile:** colunas empilham (dados primeiro, ações + timeline abaixo).

### 2.4 Orders — Print

Rota `orders/[id]/print/page.tsx` com query param `?type=picking` (default) ou `?type=shipping`.

**Romaneio de separação (`picking`):**
- Número do pedido, data, filial atribuída
- Tabela: SKU, nome do produto, modelo, quantidade
- Notas do cliente (se houver)
- Layout A4, `@media print` otimizado, sem sidebar/header

**Etiqueta de envio (`shipping`):**
- Número do pedido, tracking code
- Destinatário, endereço completo (formatado BR)
- Layout compacto ~10×15cm
- Botão "Imprimir" via `window.print()`

### 2.5 Reviews — Listagem (fila de moderação)

- Filtro padrão `status=pending`. Select para trocar: todos, pending, approved, rejected, spam.
- Tabela: produto (nome + thumbnail pequena), cliente, rating (estrelas), trecho do body (80 chars truncados), data.
- Paginação server-side, 20 por página.
- Clicar na row navega para detalhe.

### 2.6 Reviews — Detalhe

- Card principal: produto (imagem + nome + link para `/dashboard/tools/[id]`), cliente (nome + email), pedido (link para `/dashboard/orders/[id]`), rating (estrelas), título, body completo.
- Se `status=pending`: botões Aprovar / Rejeitar / Spam.
  - Aprovar: submete direto, sem campo extra.
  - Rejeitar ou Spam: revela campo de nota de moderação (obrigatório), depois submete.
- Se já moderado: exibe status atual, moderador, data, nota.

### 2.7 Sidebar

Adicionar grupo "Vendas" em `NAV_GROUPS` no `app-sidebar.tsx`:

```ts
{
  label: "Vendas",
  items: [
    { label: "Pedidos", href: "/dashboard/orders" as Route },
    { label: "Avaliações", href: "/dashboard/reviews" as Route },
  ],
},
```

Posicionar entre "Catálogo" e "Cadastros".

### 2.8 Dashboard home

Adicionar stat card "Pedidos pendentes" na grid de `page.tsx`:
- Query: `COUNT(*) FROM order WHERE status IN ('paid', 'preparing')`
- Descrição: `"{paid} pagos · {preparing} em separação"`
- Link: `/dashboard/orders?tab=paid`

---

## 3. Server Actions

### 3.1 `orders/actions.ts`

#### `updateOrderStatus`

```ts
"use server";
// Capability: orders.update_status | orders.cancel | orders.refund (depende de toStatus)
// Input Zod: { orderId: string, toStatus: OrderStatus, reason?: string,
//              trackingCode?: string, branchId?: string,
//              returnItems?: { orderItemId: string, branchId: string }[] }
// Transação:
//   1. SELECT order FOR UPDATE
//   2. Validar transição (state machine)
//   3. UPDATE order.status + timestamp
//   4. INSERT orderStatusHistory (actorType: "user", actorUserId: session.user.id)
//   5. Se shipped + trackingCode: UPDATE order.shippingTrackingCode
//   6. Se preparing + branchId: UPDATE order.branchId
//   7. Se canceled/refunded + returnItems: para cada item →
//      INSERT stockMovement (reason: "ajuste_inventario", delta: +qty, orderId, orderItemId, actorType: "user")
//      UPDATE stockLevel.quantity += qty
// revalidatePath("/dashboard/orders") + revalidatePath(`/dashboard/orders/${orderId}`)
```

#### Máquina de estados (transições válidas)

```
pending_payment → canceled        (admin ou site)
paid            → preparing       (admin)
paid            → canceled        (admin — modal devolução)
paid            → refunded        (admin — modal devolução)
preparing       → shipped         (admin — pede tracking code)
preparing       → canceled        (admin — modal devolução)
shipped         → delivered       (admin)
shipped         → canceled        (admin — modal devolução)
```

`pending_payment → paid` é feito pelo site (não admin). `delivered` e `refunded` são estados finais. Transições não listadas são rejeitadas com erro.

#### `addOrderNote`

```ts
// Capability: orders.add_note
// Input Zod: { orderId: string, body: string } — body min 1, max 2000
// INSERT orderNote (authorId: session.user.id)
// revalidatePath
```

#### `assignBranch`

```ts
// Capability: orders.update_status
// Input Zod: { orderId: string, branchId: string }
// UPDATE order.branchId
// revalidatePath
```

#### `updateTrackingCode`

```ts
// Capability: orders.update_status
// Input Zod: { orderId: string, trackingCode: string } — trim, min 1
// UPDATE order.shippingTrackingCode
// revalidatePath
```

### 3.2 `reviews/actions.ts`

#### `moderateReview`

```ts
// Capability: reviews.moderate
// Input Zod: { reviewId: string, status: "approved" | "rejected" | "spam",
//              moderationNote?: string }
// — moderationNote obrigatório se status = "rejected" ou "spam" (Zod superRefine)
// UPDATE review.status, review.moderatedBy, review.moderatedAt, review.moderationNote
// revalidatePath("/dashboard/reviews")
```

---

## 4. Arquivos existentes tocados

| Arquivo | Mudança |
|---|---|
| `packages/db/src/schema/index.ts` | Adicionar `export * from "./orders"` e `export * from "./reviews"` |
| `packages/db/src/schema/stock-movements.ts` | Adicionar FK constraints reais: `orderId` → `order.id` ON DELETE SET NULL, `orderItemId` → `orderItem.id` ON DELETE SET NULL. Importar `order` e `orderItem`. |
| `packages/db/src/migrations/_triggers.sql` | Adicionar `CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1` |
| `apps/web/src/app/dashboard/_components/app-sidebar.tsx` | Adicionar grupo "Vendas" (Pedidos + Avaliações) entre Catálogo e Cadastros |
| `apps/web/src/app/dashboard/page.tsx` | Adicionar stat card "Pedidos pendentes" + query SQL correspondente |

---

## 5. Fora de escopo (Fase B)

- Criar pedido no admin (site cria via apiKey)
- Processar/editar pagamento ou status de pagamento
- Calcular/editar frete (exceto tracking code)
- Bulk actions em reviews
- Email transacional ao mudar status (Fase C — Resend)
- Endpoint `/api/internal/revalidate` (Fase D)
- Tree-view drag-and-drop de categorias (Fase E)
- Testes E2E Playwright (Fase F)

---

## 6. Migration

Sequência operacional:

1. Criar `packages/db/src/schema/orders.ts` e `reviews.ts`
2. Atualizar `stock-movements.ts` com FK constraints reais
3. Atualizar `schema/index.ts` com re-exports
4. `bun db:generate` — gerar migration SQL
5. Revisar SQL gerado (conferir enums, FKs, checks, indexes)
6. `bun db:push` em dev (ou `bun db:migrate` se staging)
7. Adicionar sequence em `_triggers.sql` e rodar `bun db:apply-triggers`
8. Comunicar ao time do site: novas tabelas `order*` e `review` no schema compartilhado

---

## 7. Verificação (definição de pronto)

```bash
bun check-types          # zero erros
bun fix                  # auto-format
bun db:push              # dev — tabelas criadas
bun db:apply-triggers    # sequence criada
bun dev:web              # smoke manual:
                         #   - /dashboard mostra stat "Pedidos pendentes"
                         #   - /dashboard/orders mostra listagem vazia com tabs
                         #   - sidebar tem grupo "Vendas"
                         #   - /dashboard/reviews mostra fila vazia
```

**Critérios qualitativos:**
- Todas as server actions usam `requireCapability` com a capability correta
- `updateOrderStatus` roda em transação Drizzle com `orderStatusHistory` + `stockMovement` reverso (quando aplicável)
- `orderStatusHistory` sempre preenchido com `actorType: "user"` e `actorUserId`
- State machine rejeita transições inválidas
- Modal de devolução ao estoque aparece ao cancelar/reembolsar pedido pago/em preparação/enviado
- Impressão funciona com `window.print()` nos dois formatos
- Schema está exportado no barrel `index.ts`
- `_triggers.sql` contém a sequence

---

## 8. Riscos

| Risco | Mitigação |
|---|---|
| FK circular `stockMovement` ↔ `order`/`orderItem` causa problema em `db:generate` | FKs são unidirecionais (`stockMovement` → `order`). Drizzle suporta forward references. Testar `db:generate` antes de commitar. |
| Race condition: admin cancela enquanto site muda payment status | `SELECT FOR UPDATE` no order dentro da transação de `updateOrderStatus`. Site deve usar o mesmo padrão. Documentar em `admin-ecommerce.md`. |
| `order.number` SEQUENCE reset ao recrear schema em dev | `CREATE SEQUENCE IF NOT EXISTS` — não reseta se já existe. Em dev com `db:push --force`, aceita-se reset. |
| Volume de dados na listagem com JOIN client | Index em `order.clientId` + `order.status` + `order.createdAt desc`. Query paginada, 20 rows. |
