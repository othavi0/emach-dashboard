# Redesign do Detalhe de Pedido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir `/dashboard/orders/[id]` sobre o Entity detail pattern (header + tabs + coluna de ação fixa), trazendo à superfície todo dado relevante do pedido e padronizando os componentes visuais do sistema.

**Architecture:** Direção C da spec — `EntityIdentityHeader` + card de resumo (footer de métricas) + grid `[abas de leitura · coluna de ação fixa]`. Abas via `EntityTabs` (`?tab=`). Histórico vira feed de auditoria unificado (status + notas + anexos + reembolsos + nova tabela `order_event`). Backend ganha `order_event`, queries enriquecidas e registro de eventos nas actions.

**Tech Stack:** Next 16 (App Router, RSC), React 19, Drizzle (push-only), Supabase Postgres, Tailwind v4 + tokens oklch, base-ui/shadcn (`@emach/ui`).

**Fonte visual de verdade:** mockup aprovado em `.superpowers/brainstorm/141465-1780495199/content/pedido-detalhe-v3.html` — abrir no navegador ao implementar a UI. Componentes de referência: `branches/_components/branch-stats-card.tsx` (footer de métricas), `components/entity/*`, `components/status-visual.tsx`, `orders/status-meta.ts`.

**Verificação global:** sem testes unitários de UI no projeto (cultura de smoke visual). Cada task roda `bun check-types` e `bun check`; tasks de UI exigem smoke visual no browser (server já em `localhost:3001`). Após schema: `bun db:sync`.

**Convenções obrigatórias (CLAUDE.md):** sem `console.*` (usar `logger`), sem `: any`/`as any`, IDs via `crypto.randomUUID()` no caller, `revalidatePath` após mutação, server actions com `requireCapability*`, Read antes de Edit em cada arquivo, rodar `check-types` antes de commit.

---

## Task 1: Tabela `order_event` (auditoria de ações operacionais)

**Files:**
- Modify: `packages/db/src/schema/orders.ts` (adicionar enum + tabela + relations + types)
- Verify: `packages/db/src/schema/index.ts` (barrel já reexporta `./orders` — nada a fazer)

- [ ] **Step 1: Adicionar enum, tabela, relations e types em `orders.ts`**

Adicionar após o bloco `refundReasonEnum`/`refundStatusEnum` (área de enums):

```ts
// Tipos de evento operacional auditável que não são transição de status.
// Aditivo: novos valores entram no fim (mesma regra do orderStatusEnum).
export const orderEventTypeEnum = pgEnum("order_event_type", [
	"tracking_set",
	"branch_assigned",
]);
export type OrderEventType = (typeof orderEventTypeEnum.enumValues)[number];
```

Adicionar a tabela após `orderAttachment` (antes de `refundRequest`):

```ts
export const orderEvent = pgTable(
	"order_event",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		eventType: orderEventTypeEnum("event_type").notNull(),
		// Payload livre por tipo: { trackingCode } | { branchId, branchName, via }
		metadata: jsonb("metadata"),
		actorType: actorTypeEnum("actor_type").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("order_event_order_idx").on(table.orderId, table.createdAt.desc()),
		check(
			"order_event_actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
			)`
		),
	]
);
```

Adicionar relations junto aos demais `*Relations`:

```ts
export const orderEventRelations = relations(orderEvent, ({ one }) => ({
	order: one(order, { fields: [orderEvent.orderId], references: [order.id] }),
	actorUser: one(user, {
		fields: [orderEvent.actorUserId],
		references: [user.id],
	}),
}));
```

Adicionar à relação `orderRelations` (dentro do `many`): `events: many(orderEvent),`

Adicionar types ao fim:

```ts
export type OrderEvent = typeof orderEvent.$inferSelect;
export type NewOrderEvent = typeof orderEvent.$inferInsert;
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS (sem erros novos)

- [ ] **Step 3: Aplicar schema no banco**

Run: `bun db:sync`
Expected: drizzle-kit cria `order_event` + índice + check. Confirmar:

Run (psql/MCP): `SELECT to_regclass('public.order_event');`
Expected: `order_event` (não null)

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/orders.ts
git commit -m "feat(db): tabela order_event para auditoria de ações de pedido"
```

---

## Task 2: Enriquecer `getOrderDetail` (dados submersos)

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/data.ts`

Expor: documento/tipo do cliente, desconto do pedido, reembolsos e eventos operacionais. Lembrar das armadilhas de `db.execute` (snake_case + timestamp string → usar `AS "camel"` e `toDate`).

- [ ] **Step 1: Adicionar tipos no topo de `data.ts` (junto aos demais `OrderXItem`)**

```ts
export interface OrderRefundItem {
	id: string;
	reasonCategory: string;
	reasonText: string | null;
	status: string;
	amount: number;
	asaasRefundRef: string | null;
	rejectionReason: string | null;
	requestedAt: Date;
	resolvedAt: Date | null;
}

export interface OrderEventItem {
	id: string;
	eventType: string;
	metadata: Record<string, unknown> | null;
	actorLabel: string;
	createdAt: Date;
}
```

- [ ] **Step 2: Estender a interface `OrderDetail`**

Adicionar os campos:

```ts
	clientDocument: string | null;
	clientType: string | null;
	discountAmount: number;
	refundRequests: OrderRefundItem[];
	events: OrderEventItem[];
```

- [ ] **Step 3: Carregar documento/tipo/desconto na query base de `getOrderDetail`**

No `SELECT` base, adicionar à projeção: `o.discount_amount`, `c.document AS client_document`, `c.client_type AS client_type`. Adicionar ao tipo inline do `db.execute<{...}>`: `discount_amount: string; client_document: string | null; client_type: string | null;`. No objeto de retorno, adicionar:

```ts
		clientDocument: row.client_document,
		clientType: row.client_type,
		discountAmount: Number(row.discount_amount),
```

- [ ] **Step 4: Adicionar queries de reembolsos e eventos ao `Promise.all`**

Importar no topo: `orderEvent, refundRequest` de `@emach/db/schema/orders`. Adicionar duas leituras ao array do `Promise.all` (depois de `attachmentRows`):

```ts
		db
			.select({
				id: refundRequest.id,
				reasonCategory: refundRequest.reasonCategory,
				reasonText: refundRequest.reasonText,
				status: refundRequest.status,
				amount: refundRequest.amount,
				asaasRefundRef: refundRequest.asaasRefundRef,
				rejectionReason: refundRequest.rejectionReason,
				requestedAt: refundRequest.requestedAt,
				resolvedAt: refundRequest.resolvedAt,
			})
			.from(refundRequest)
			.where(eq(refundRequest.orderId, id))
			.orderBy(desc(refundRequest.requestedAt)),
		db
			.select({
				id: orderEvent.id,
				eventType: orderEvent.eventType,
				metadata: orderEvent.metadata,
				actorType: orderEvent.actorType,
				actorUserName: user.name,
				createdAt: orderEvent.createdAt,
			})
			.from(orderEvent)
			.leftJoin(user, eq(orderEvent.actorUserId, user.id))
			.where(eq(orderEvent.orderId, id))
			.orderBy(desc(orderEvent.createdAt)),
```

Atualizar a desestruturação do `Promise.all` para incluir `refundRows, eventRows` ao fim.

- [ ] **Step 5: Mapear no objeto de retorno**

```ts
		refundRequests: refundRows.map((r) => ({
			id: r.id,
			reasonCategory: r.reasonCategory,
			reasonText: r.reasonText,
			status: r.status,
			amount: Number(r.amount),
			asaasRefundRef: r.asaasRefundRef,
			rejectionReason: r.rejectionReason,
			requestedAt: r.requestedAt,
			resolvedAt: r.resolvedAt,
		})),
		events: eventRows.map((e) => ({
			id: e.id,
			eventType: e.eventType,
			metadata: (e.metadata ?? null) as Record<string, unknown> | null,
			actorLabel: formatActorLabel({
				actorType: e.actorType,
				actorUserName: e.actorUserName,
			}),
			createdAt: e.createdAt,
		})),
```

(Os `.select()` do query builder devolvem `Date` — sem `toDate`. `formatActorLabel` já existe no arquivo.)

- [ ] **Step 6: Verificar tipos**

Run: `bun check-types`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/orders/data.ts
git commit -m "feat(orders): expor documento, desconto, reembolsos e eventos no detalhe"
```

---

## Task 3: Actions registram `order_event`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/actions.ts`

Substituir as notas-de-sistema genéricas de `assignBranch`/`updateTrackingCode` por `order_event` tipado (separa auditoria de notas humanas). `updateOrderStatus` ao entrar em `shipped` com `trackingCode` também grava `tracking_set`.

- [ ] **Step 1: Importar `orderEvent` no topo**

No import de `@emach/db/schema/orders`, adicionar `orderEvent` à lista.

- [ ] **Step 2: Helper de inserção de evento (após `lockOrderAndAuthorize`)**

```ts
async function insertOrderEvent(
	tx: OrderTx,
	args: {
		orderId: string;
		eventType: "tracking_set" | "branch_assigned";
		metadata: Record<string, unknown>;
		actorUserId: string | null;
	}
): Promise<void> {
	await tx.insert(orderEvent).values({
		id: crypto.randomUUID(),
		orderId: args.orderId,
		eventType: args.eventType,
		metadata: args.metadata,
		actorType: args.actorUserId ? "user" : "system",
		actorUserId: args.actorUserId,
	});
}
```

- [ ] **Step 3: `assignBranch` grava evento em vez de nota**

Trocar o bloco que insere em `orderNote` (`Filial reatribuída para: ...`) por:

```ts
				await insertOrderEvent(tx, {
					orderId,
					eventType: "branch_assigned",
					metadata: { branchId, branchName: branchRow?.name ?? branchId },
					actorUserId: null, // ação fora do lock; ator de sistema (reatribuição manual via select)
				});
```

(Nota: `assignBranch` hoje não usa `lockOrderAndAuthorize`; mantém-se assim. `authorId`/`actorUserId` null → `actorType:'system'`, coerente com o CHECK.)

- [ ] **Step 4: `updateTrackingCode` grava evento em vez de nota**

Trocar o bloco `orderNote` (`Código de rastreio atualizado: ...`) por:

```ts
				await insertOrderEvent(tx, {
					orderId,
					eventType: "tracking_set",
					metadata: { trackingCode },
					actorUserId: locked.session.user.id,
				});
```

- [ ] **Step 5: `updateOrderStatus` grava `tracking_set` ao enviar com rastreio**

Dentro da transação, logo após o `insert(orderStatusHistory)`, adicionar:

```ts
				if (toStatus === "shipped" && trackingCode) {
					await insertOrderEvent(tx, {
						orderId,
						eventType: "tracking_set",
						metadata: { trackingCode },
						actorUserId: session.user.id,
					});
				}
```

- [ ] **Step 6: Verificar tipos**

Run: `bun check-types`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/orders/actions.ts
git commit -m "feat(orders): registrar order_event em rastreio/filial"
```

---

## Task 4: Stepper vertical "Andamento"

**Files:**
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/order-progress.tsx`

Stepper vertical para a coluna de ação, derivando estado e timestamps do pedido. Reusa `ORDER_STATUS_META` (ícone/label) e a lógica de done/current de `order-lifecycle-stepper.tsx` (linha linear `pending_payment → paid → preparing → shipped → delivered`; estados terminais marcam até o branch).

- [ ] **Step 1: Criar `order-progress.tsx`**

Props: `{ order: Pick<OrderDetail, "status" | "createdAt" | "paidAt" | "preparingAt" | "shippedAt" | "deliveredAt" | "canceledAt" | "returnedAt" | "refundedAt"> }`. (Nota: `preparingAt` já existe no schema `order`; garantir que `OrderDetail` o exponha — se não, adicionar `preparingAt: Date | null` ao shape em `data.ts` e ao SELECT/map, análogo a `paidAt`.)

Renderizar lista vertical: cada etapa linear com bolinha (done=success, current=primary com ring, upcoming=muted), label (`ORDER_STATUS_META[step].label`) e timestamp formatado (`Intl.DateTimeFormat pt-BR` curto `dd/MM HH:mm`) quando houver. Linha conectora vertical entre etapas (`bg-success` se done, senão `bg-border`). Para estado terminal, exibir badge final via `OrderStatusBadge`. Estrutura visual conforme a coluna "Andamento" do mockup v3 (`.vstep`).

Container: `rounded-lg border border-border bg-card` com header `Andamento` (`text-[11px] uppercase tracking-widest text-muted-foreground`).

- [ ] **Step 2: Verificar tipos + smoke**

Run: `bun check-types`
Expected: PASS. (Render validado na Task 8 quando montado na página.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/[id]/_components/order-progress.tsx
git commit -m "feat(orders): stepper vertical de andamento"
```

---

## Task 5: Card de resumo com footer de métricas

**Files:**
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/order-summary-card.tsx`

Card full-width abaixo do header. Topo: Cliente (nome + telefone + documento), Filial, Pagamento (método + badge status), Observação do cliente (destaque sutil). Footer de métricas **edge-to-edge** copiando a técnica de `branch-stats-card.tsx`.

- [ ] **Step 1: Criar o componente**

Props: `{ order: OrderDetail }`. Estrutura:

```tsx
<div className="overflow-hidden rounded-lg border border-border bg-card">
  <div className="flex flex-wrap gap-6 px-4 pt-4 pb-3">
    {/* Cliente / Filial / Pagamento como colunas label+valor */}
    {/* Observação do cliente: só quando order.customerNotes */}
  </div>
  <div className="grid grid-cols-4 border-border border-t">
    {/* 4 células: Itens · Total(coral) · Frete · "Em preparação há Nd" */}
  </div>
</div>
```

- Footer: cada célula `flex flex-col items-center py-2.5`, exceto última com `border-border border-r`. Valor `font-bold text-[18px] tabular-nums` (monetário pode usar `text-[15px]`); Total em `text-primary`; SLA (dias no estado atual) em `text-amber-500`. Label `text-[10px] uppercase tracking-wider text-muted-foreground`.
- Métricas: Itens = `order.items.reduce((s,i)=>s+i.quantity,0)`; Total = `formatCurrency(order.totalAmount)`; Frete = `formatCurrency(order.shippingAmount)`; SLA = dias desde o timestamp do estado atual (ex.: `preparingAt`) — `"{n}d"`.
- Observação do cliente: `rounded-md border border-warning/30 bg-warning/5 px-3 py-2` com label âmbar `📝 Observação do cliente` (ver `.cust-note` do mockup v3; **sutil** — fundo ~5%).
- `formatCurrency` = `new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"})` (replicar helper já usado em `order-detail-info.tsx`).

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/[id]/_components/order-summary-card.tsx
git commit -m "feat(orders): card de resumo com footer de métricas"
```

---

## Task 6: Abas de leitura (Itens, Cliente/Entrega, Pagamento & Fiscal, Avaliações)

**Files:**
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/tabs/items-tab.tsx`
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/tabs/customer-delivery-tab.tsx`
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/tabs/payment-fiscal-tab.tsx`
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/tabs/reviews-tab.tsx`

Seguir o mockup v3 (painéis Itens, Cliente/Entrega, Pagamento & Fiscal, Avaliações). Usar `Card`/`Table` de `@emach/ui`. Divisores internos **edge-to-edge** (`-mx-…` furando o padding do `CardContent`).

- [ ] **Step 1: `items-tab.tsx`** — Props `{ order: OrderDetail }`. `Card` com `Table` (Item · Qtd · Unitário · Total; item com subtítulo modelo/voltagem/marca quando houver). Abaixo da tabela, **footer de métricas edge-to-edge** (mesma técnica do Task 5): Subtotal · Desconto · Frete · **Total** (coral). Desconto = `formatCurrency(order.discountAmount)` com `−` prefixo, classe `text-success` quando > 0.

- [ ] **Step 2: `customer-delivery-tab.tsx`** — Props `{ order: OrderDetail }`. Seções com `subhead` uppercase: **Cliente** (nome, e-mail, telefone, CPF/CNPJ via `clientDocument`, link `Ver cliente ↗` → `/dashboard/customers/${order.clientId}`), divisor edge-to-edge, **Endereço de entrega** (formatar `shippingAddress` reusando `formatAddress` de `order-detail-info.tsx` — extrair para `_lib/format-address.ts` e importar nos dois lugares; DRY), método/valor frete, rastreio (read-only), divisor, **Observação do cliente** (`order.customerNotes`, mesmo bloco sutil do Task 5; ou "—" quando vazio).

- [ ] **Step 3: `payment-fiscal-tab.tsx`** — Props `{ order: OrderDetail }`. Seção **Pagamento** (método, ref. gateway, comprovante Asaas — reusar `AsaasBlock`/`NfeStatusBadge` de `order-documents-section.tsx`; extrair `AsaasBlock` e `NfeStatusBadge` para arquivo próprio `_components/asaas-block.tsx` se ainda acoplados, mantendo `order-documents-section` funcional até ser aposentado). Divisor. Seção **NF-e** (número, status, DANFE/XML). Divisor. Tabela fiscal por item (Item · NCM · CEST · Peso · Dimensões) — valores `"—"` quando null.

- [ ] **Step 4: `reviews-tab.tsx`** — Props `{ rows: OrderReviewRow[] }`. Reaproveitar a renderização de `order-reviews-section.tsx` (mesma lista por ferramenta com `reviewState`/`daysRemaining`). Pode envolver o componente existente.

- [ ] **Step 5: Verificar tipos**

Run: `bun check-types`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/orders/[id]/_components/tabs apps/web/src/app/dashboard/orders/_lib/format-address.ts apps/web/src/app/dashboard/orders/_components/asaas-block.tsx
git commit -m "feat(orders): abas itens, cliente/entrega, pagamento & fiscal, avaliações"
```

---

## Task 7: Histórico — feed de auditoria unificado

**Files:**
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/tabs/history-tab.tsx`
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/order-history-feed.tsx`

Feed cronológico unindo 5 fontes do `OrderDetail`, com filtros (Tudo · Status · Notas · Documentos · Financeiro) e upload de evidência inline.

- [ ] **Step 1: `order-history-feed.tsx`** (Client Component) — Props `{ order: OrderDetail }`.

Construir lista normalizada de eventos a partir de:
- `order.history` → categoria `status`; ícone/cor por `ORDER_STATUS_META[toStatus]`; título `${LABELS[from]} → ${LABELS[to]}`; subtítulo `actorLabel`; `reason` em bloco destacado quando presente.
- `order.notes` → categoria `notes`; ícone nota (tone neutro); título `Nota interna · ${authorName}`; corpo `body`.
- `order.attachments` → categoria `documents`; título `Anexo adicionado`; link para `url`; subtítulo `uploaderName`.
- `order.events` → categoria por tipo: `tracking_set` (🚚 `truck`, categoria `documents`/`status`), `branch_assigned` (🏢 `package`/building, categoria `status`); montar texto a partir de `metadata`.
- `order.refundRequests` → categoria `financeiro`; título `Reembolso solicitado` / `resolvido`; valor + status.

Ordenar por `createdAt`/`requestedAt` desc. Estado `useState` para filtro ativo; chips (`Tabs` ou botões pill `bg-secondary` quando ativo). Render visual conforme `.tl`/`.ev` do mockup v3 (linha vertical + bolinha colorida por tone via `TONE_TEXT`/cores; ícone de `STATUS_ICONS`). Upload inline: reusar `AttachmentUploadForm` de `order-documents-section.tsx` (extrair se necessário) no topo ou rodapé do feed.

- [ ] **Step 2: `history-tab.tsx`** — `Card` com header "Histórico & auditoria" + `<OrderHistoryFeed order={order} />`.

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/[id]/_components/order-history-feed.tsx apps/web/src/app/dashboard/orders/[id]/_components/tabs/history-tab.tsx
git commit -m "feat(orders): histórico como feed de auditoria com filtros"
```

---

## Task 8: Coluna de ação + montagem da página (`page.tsx`)

**Files:**
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx`
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/order-identity.tsx`
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/print-menu.tsx`
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/tabs/refund-tab.tsx`
- Modify: `apps/web/src/app/dashboard/orders/[id]/page.tsx`

- [ ] **Step 1: `order-action-column.tsx`** — Client Component. Reaproveitar TODA a lógica de `order-actions-panel.tsx` (estados, `runPrimaryStatusUpdate`, `runAssignBranch`, `runTrackingUpdate`, `runAddNote`, dialogs de cancel/refund/return). Reorganizar a saída em **4 cards** empilhados (`stack gap-4`): `<OrderProgress>` (Task 4), **Próxima ação**, **Exceções**, **Nota interna**. Mesmas props que `OrderActionsPanel` (`branches`, `canAddNote`, `canCancel`, `canRefund`, `canUpdateStatus`, `order`).

- [ ] **Step 2: `order-identity.tsx`** — wrapper de `EntityIdentityHeader`: `avatarFallback={getInitials(order.clientName)}`, `title={order.number}` (classe serif), `badges={<OrderStatusBadge status={order.status} />}`, `subtitle={cliente · email · criado}`, `actions={<PrintMenu order={order} />}`.

- [ ] **Step 3: `print-menu.tsx`** — dropdown (base-ui `DropdownMenu` de `@emach/ui`) "Imprimir ▾" agrupando os documentos existentes: DANFE (link `nfeUrl`), Etiqueta de envio (reusar `print-shipping-label`), Lista de separação (reusar `print-picking-slip`), Pedido completo (link `/dashboard/orders/${id}/print`). Itens que dependem de dado ausente (sem NF-e) ficam desabilitados.

- [ ] **Step 4: `refund-tab.tsx`** — Props `{ refunds: OrderRefundItem[] }`. Card listando cada `refundRequest` (categoria, valor `formatCurrency`, status badge, datas, `reasonText` em bloco, `rejectionReason` quando houver). Ver `.refbox` do mockup v3.

- [ ] **Step 5: Reescrever `page.tsx`**

```tsx
import { ShoppingBag, Truck, Receipt, History, Star, RotateCcw } from "lucide-react";
// ... imports dos novos componentes, EntityTabs, data, permissions

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params, searchParams }: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string; edit?: string }>;
}) {
	const session = await requireCapability("orders.read");
	const { id } = await params;
	const sp = await searchParams;
	const [branches, order, reviewsOverview] = await Promise.all([
		listOrderBranches(),
		getOrderDetail(id),
		getOrderReviewsOverview(id),
	]);
	if (!order) notFound();
	const role = (session.user.role ?? "user") as UserRole;

	const tabs: EntityTab[] = [
		{ value: "itens", label: "Itens", icon: <ShoppingBag aria-hidden className="size-3.5" />,
		  badge: <TabCount n={order.items.length} />, content: <ItemsTab order={order} /> },
		{ value: "cliente", label: "Cliente / Entrega", icon: <Truck aria-hidden className="size-3.5" />,
		  content: <CustomerDeliveryTab order={order} /> },
		{ value: "fiscal", label: "Pagamento & Fiscal", icon: <Receipt aria-hidden className="size-3.5" />,
		  content: <PaymentFiscalTab order={order} /> },
		{ value: "historico", label: "Histórico", icon: <History aria-hidden className="size-3.5" />,
		  content: <HistoryTab order={order} /> },
		{ value: "avaliacoes", label: "Avaliações", icon: <Star aria-hidden className="size-3.5" />,
		  content: <ReviewsTab rows={reviewsOverview} /> },
		...(order.refundRequests.length > 0
			? [{ value: "reembolso", label: "Reembolso", icon: <RotateCcw aria-hidden className="size-3.5" />,
			    content: <RefundTab refunds={order.refundRequests} /> }]
			: []),
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<OrderIdentity order={order} />
			<OrderSummaryCard order={order} />
			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)]">
				<EntityTabs defaultValue="itens" tabs={tabs} />
				<OrderActionColumn
					branches={branches}
					canAddNote={can(role, "orders.add_note")}
					canCancel={can(role, "orders.cancel")}
					canRefund={can(role, "orders.refund")}
					canUpdateStatus={can(role, "orders.update_status")}
					order={order}
				/>
			</div>
		</div>
	);
}
```

`TabCount` = pequeno helper inline (`<span className="ml-1 inline-flex h-5 min-w-5 ... bg-secondary ...">{n}</span>`, igual ao usado em `branches/[id]/page.tsx`). No mobile (`< xl`) a coluna empilha após as tabs — aceitável; se quiser a ação acima, usar `order-2`/`order-1` (opcional, não bloqueante).

- [ ] **Step 6: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS

- [ ] **Step 7: Smoke visual (obrigatório)**

Abrir no browser (server em `localhost:3001`):
- `…/orders/52c6ead3-7acf-47f8-9dc2-847f80783b66` (preparing) — próxima ação "Marcar como Enviado", footer de métricas, abas navegam, histórico com eventos.
- `…/orders/563edfec-3367-4cd2-83df-a5dff32a0cea` (canceled, terminal) — sem aba Reembolso (ou com, se houver refund), stepper terminal.
- Um pedido `paid` (EM-2026-0003 `84e1b9db-…`) — atribuir filial visível.
- Um pedido `shipped` (EM-2026-0005 `c2f4551a-…`) — rastreio preenchido, aba fiscal com NF-e.

Conferir: divisores edge-to-edge encostam na borda; observação do cliente sutil; Total em coral no footer; Imprimir ▾ abre.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/orders/[id]
git commit -m "feat(orders): nova página de detalhe (header + resumo + abas + coluna de ação)"
```

---

## Task 9: Limpeza dos componentes aposentados

**Files:**
- Delete: `apps/web/src/app/dashboard/orders/_components/order-detail-info.tsx`
- Delete: `apps/web/src/app/dashboard/orders/_components/order-actions-panel.tsx`
- Delete: `apps/web/src/app/dashboard/orders/_components/order-timeline.tsx`
- Possivelmente: `order-documents-section.tsx`, `order-reviews-section.tsx`, `customer-note-card.tsx`, `order-lifecycle-stepper.tsx` (se totalmente substituídos e sem outros consumidores)

- [ ] **Step 1: Confirmar que não há mais imports**

Run: `ugrep -rl "order-detail-info\|order-actions-panel\|order-timeline\|customer-note-card" apps/web/src`
Expected: nenhum resultado (fora os próprios arquivos a deletar). Para cada candidato extra, confirmar 0 consumidores antes de deletar.

- [ ] **Step 2: Deletar os arquivos sem consumidores**

```bash
git rm apps/web/src/app/dashboard/orders/_components/order-detail-info.tsx \
       apps/web/src/app/dashboard/orders/_components/order-actions-panel.tsx \
       apps/web/src/app/dashboard/orders/_components/order-timeline.tsx
```

(Os demais só se a Task 6/7 absorveu integralmente e o grep confirmar 0 usos.)

- [ ] **Step 3: Verificar build completo**

Run: `bun check-types && bun check`
Expected: PASS

- [ ] **Step 4: Smoke visual final** — revisitar os 4 pedidos da Task 8 Step 7; confirmar nada quebrou após a remoção.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(orders): remover componentes do layout antigo de pedido"
```

---

## Self-review (cobertura da spec)

- §4 layout (header+resumo+grid+coluna fixa) → Tasks 5, 8 ✓
- §5 abas (Itens, Cliente/Entrega, Pagamento&Fiscal, Histórico, Avaliações, Reembolso condicional) → Tasks 6, 7, 8 ✓
- §6 inventário (document, desconto, obs cliente, reembolsos, eventos) → Tasks 2, 5, 6, 7 ✓
- §7 order_event + actions → Tasks 1, 3 ✓
- §8 mudanças data.ts → Task 2 ✓
- §9 componentes → Tasks 4–8 ✓
- §10 fluxo de botões (Imprimir ▾, hierarquia) → Task 8 ✓
- §11 refinos (edge-to-edge, obs sutil, footer métricas) → Tasks 5, 6 ✓
- §13 fases → ordem das tasks espelha as 6 fases ✓
