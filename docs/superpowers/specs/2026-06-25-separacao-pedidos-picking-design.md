# Separação de pedidos (picking com bipagem) — Design

> Status: aprovado no brainstorming · 2026-06-25
> Escopo: sub-fluxo interno de **conferência física dos itens** de um pedido entre `paid` e `shipped`, com bipagem de código de barras, registro de quem/quando/o quê, e gating do envio.
> Depende de: `2026-06-24-barcode-variante-design.md` (Fases A e D) — `tool_variant.barcode NOT NULL UNIQUE` e `order_item.barcode` (snapshot) precisam existir.

## Problema e objetivo

Quando um pedido é pago, alguém na filial precisa **pegar fisicamente cada item e conferir** antes de despachar. Hoje o dashboard só tem a transição `paid → preparing → shipped` (botão), sem registro de que os itens certos foram separados, por quem, ou quando. O objetivo é dar **controle operacional**: o funcionário (em geral role `user`) abre a separação, **bipa** cada item, o sistema confere contra o pedido e registra a sessão (operador, horário, item, quantidade, cada scan). Concluir a separação é **pré-requisito para despachar**.

Requisito-chave: esse sub-estado é **interno ao dashboard e invisível ao cliente** no e-commerce.

## Decisões de produto (validadas no brainstorming)

| Tema | Decisão |
|---|---|
| Scanner | **Leitor USB keyboard-wedge** (digita o código + Enter). Câmera fica para o futuro. Coerente com o spec de barcode. |
| Item faltante (short-pick) | **Bloquear conclusão** até `qtyPicked == qtyExpected` em todos os itens. Quando o item sumiu de vez: **"Reportar falta"** → sessão vai para `exception` e escala para admin/super_admin resolver (realocar filial, ajustar estoque ou reembolsar). |
| Pausar/retomar | **Sim.** A sessão fica `in_progress` e pode ser retomada (mesmo operador ou outro da filial). |
| Tracking code | **Não** entra na tela de separação — continua no detalhe do pedido. A tela de picking só confere itens. |
| Separação × status | **Amarrada com gating.** Iniciar separação move `paid → preparing`; concluir libera `preparing → shipped`. `super_admin` pode forçar o envio em exceção. |
| Quem conclui | **Qualquer operador da mesma filial** pode retomar/concluir. Cada scan registra quem bipou, preservando a auditoria individual. |

## Modelo de domínio: como encaixa no eixo de status (ADR-0005)

O **`order_status` não muda** — o cliente continua vendo `preparing`. A separação é um **sub-eixo próprio do dashboard**, em tabela dedicada. Justificativa (achados da investigação):

- ADR-0005 (`docs/adr/0005`) decidiu **eixo único de status**; novo valor no `orderStatusEnum` viola isso e, via sync (ADR-0009), chega ao e-commerce, que poderia exibir o label técnico ao cliente. Além disso, `ALTER TYPE ADD VALUE` só insere no fim do enum (`packages/db/src/schema/orders.ts:25-26`) — não dá para encaixar entre `paid` e `preparing`.
- O contrato já tem precedente de **tabelas dashboard-only que o e-commerce ignora** (`order_note`, `order_attachment`, `order_event`, `refund_request` — `docs/integration/admin-ecommerce.md:42-43`). A separação segue esse padrão.

```
order_status (compartilhado, visível ao cliente):  paid ───────────────→ preparing ───────────────→ shipped
                                                     │  startPicking          │  completePicking          ▲
sub-eixo order_picking (interno, invisível):         └─→ in_progress ─────────┴─→ completed ──────────────┘ (gate)
                                                                └─→ exception (escala admin)
```

## Modelo de dados

Três tabelas novas em `packages/db/src/schema/orders.ts`, seguindo as convenções do repo (PK `text` + `crypto.randomUUID()` no caller; `timestamptz`; `onDelete` explícito; snapshot de nome para sobreviver a `set null`; FK com nome explícito quando o auto-gerado passar de 63 chars).

### Enum

```ts
export const orderPickingStatusEnum = pgEnum("order_picking_status", [
  "in_progress",
  "completed",
  "exception",
  "canceled",
]);
```

Não há `pending`: iniciar a separação **cria** a sessão já `in_progress`. A "fila" são pedidos `paid` sem sessão ativa.

### `order_picking` (cabeçalho da sessão)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | text PK | uuid no caller |
| `orderId` | text NOT NULL → `order.id` | `onDelete: restrict` (preserva histórico) |
| `branchId` | text NOT NULL → `branch.id` | `onDelete: restrict` — filial onde separa (snapshot do `order.branchId` no início) |
| `status` | `orderPickingStatusEnum` NOT NULL | default `in_progress` |
| `pickerUserId` | text → `user.id` | `onDelete: set null` |
| `pickerName` | text NOT NULL | snapshot do nome (sobrevive ao set null) |
| `startedAt` | timestamptz NOT NULL | `defaultNow()` |
| `completedAt` | timestamptz | null = em aberto |
| `exceptionReason` | text | preenchido quando `status = exception` |
| `createdAt` | timestamptz NOT NULL | `defaultNow()` |

Índices:
- `uniqueIndex("order_picking_one_active").on(orderId).where(sql\`status = 'in_progress'\`)` — **1 sessão ativa por pedido** (anti-concorrência).
- `index("order_picking_branch_status_started").on(branchId, status, startedAt DESC)` — fila.

> A separação é sempre humana (não há ator `system`), então não usa o CHECK `actor_coherence`. `pickerName` NOT NULL garante a rastreabilidade mesmo se o usuário for deletado.

### `order_picking_item` (esperado × bipado, por item do pedido)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | text PK | |
| `pickingId` | text NOT NULL → `order_picking.id` | `onDelete: cascade` |
| `orderItemId` | text → `order_item.id` | `onDelete: set null` |
| `variantId` | text → `tool_variant.id` | `onDelete: set null` |
| `variantSnapshot` | jsonb NOT NULL | `{ sku, name, barcode, voltage }` no início (sobrevive a set null) |
| `qtyExpected` | integer NOT NULL | CHECK `qty_expected_positive` (`> 0`); copiado de `order_item.quantity` |
| `qtyPicked` | integer NOT NULL | default `0`; CHECK `qty_picked_within` (`>= 0 AND <= qtyExpected`) |
| `notFound` | boolean NOT NULL | default `false` (reportar falta) |
| `lastScannedAt` | timestamptz | |
| `createdAt` | timestamptz NOT NULL | `defaultNow()` |

Índice: `uniqueIndex("order_picking_item_unique").on(pickingId, orderItemId)`.

> O CHECK `qty_picked_within` reforça no DB que nunca se bipa além do esperado (a app já bloqueia — defesa em profundidade).

### `order_picking_scan` (1 linha por bipagem — o "quem bipou o quê e quando")

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | text PK | |
| `pickingId` | text NOT NULL → `order_picking.id` | `onDelete: cascade` |
| `pickingItemId` | text NOT NULL → `order_picking_item.id` | `onDelete: cascade` |
| `variantId` | text → `tool_variant.id` | `onDelete: set null` |
| `scannedCode` | text NOT NULL | código lido (gravado mesmo se não casar — auditoria) |
| `scannedBy` | text → `user.id` | `onDelete: set null` |
| `scannedByName` | text NOT NULL | snapshot |
| `scannedAt` | timestamptz NOT NULL | `defaultNow()` |

Índice: `index("order_picking_scan_session").on(pickingId, scannedAt DESC)`.

Exportar os tipos (`OrderPicking`, `NewOrderPicking`, `OrderPickingItem`, …) no barrel `packages/db/src/schema/index.ts`.

## Máquina de estados da sessão

```
(sem sessão) ──startPicking──→ in_progress ──completePicking (tudo conferido)──→ completed
                                   │
                                   ├──reportMissing──→ exception ──(admin resolve)──→ (fora da fila)
                                   └──cancelPicking──→ canceled
```

- `in_progress`: editável (scans, reportar falta). Retomável por qualquer operador da filial.
- `completed`: libera o gate `preparing → shipped`. Terminal.
- `exception`: item reportado como faltante; sai da fila do operador e entra na aba Exceções (admin). Terminal do ponto de vista do operador. A resolução usa actions já existentes (realocar filial, ajustar estoque, `refundOrder`); se o pedido permanecer para fulfillment (ex: realocado), o admin/operador **inicia uma nova sessão** via `startPicking` (o pedido segue em `preparing`, e o `uniqueIndex` parcial só conta sessões `in_progress`, então a sessão `exception` antiga não bloqueia). A sessão antiga fica como registro histórico.
- `canceled`: sessão abortada (ex: pedido cancelado/reembolsado por fora). Terminal.

## Server actions

Novo módulo `apps/web/src/app/dashboard/separacao/actions.ts` (`"use server"`). Reads em `data.ts` (`import "server-only"`) com wrappers thin, conforme ADR-0019. Toda mutação passa por `lockOrderAndAuthorize(tx, "orders.pick", orderId)` (`orders/actions.ts:128-165`) — lock `FOR UPDATE` + capability + branch-scope atômicos.

| Action | Cap | Efeito |
|---|---|---|
| `startPicking(orderId)` | `orders.pick` | Valida `status IN ('paid','preparing')`, `branchId != null` e ausência de sessão ativa. Cria `order_picking` (`in_progress`) + um `order_picking_item` por `order_item` (com `qtyExpected` e `variantSnapshot`). Se `paid`, transiciona `paid → preparing` no mesmo lock + `orderStatusHistory`; se já `preparing` (ex: nova separação após exceção resolvida/realocação), mantém o status. Retorna `pickingId`. O `uniqueIndex` parcial bloqueia 2ª sessão concorrente (catch 23505 → "Já existe separação em andamento"). |
| `scanItem(pickingId, code)` | `orders.pick` | Resolve `code`: primário `variantSnapshot->>'barcode' == code` entre os itens da sessão; fallback `tool_variant.barcode == code → variantId` casado com `order_picking_item.variantId` (cobre snapshot legado nulo). Sem match → `{ ok:false, kind:'not_in_order' }`. Item já completo → `{ ok:false, kind:'already_complete' }`. Senão `qtyPicked++`, `lastScannedAt`, insere `order_picking_scan`. **Não toca estoque nem `order_status`.** |
| `reportMissing(pickingItemId, reason)` | `orders.pick` | `notFound = true`, sessão → `exception`, `exceptionReason`. Sai da fila do operador. |
| `completePicking(pickingId)` | `orders.pick` | Exige todos os itens com `qtyPicked == qtyExpected` e `notFound == false`; senão rejeita. Sessão → `completed`, `completedAt`. **Não muda `order_status`** (fica `preparing`, agora liberado para `shipped`). |
| `cancelPicking(pickingId)` | `orders.pick` (admin para sessão de outro) | Sessão → `canceled`. Usada quando o pedido sai do fluxo (cancelado/reembolsado). |

### Gating do envio

Em `updateOrderStatus` (`orders/actions.ts`), quando `toStatus === 'shipped'`: exigir que exista `order_picking` com `status = 'completed'` para o pedido; senão erro "Conclua a separação antes de despachar". **`super_admin` bypassa** (exceção operacional). Mantém o resto da `VALID_TRANSITIONS` intacto.

## Capabilities & branch-scope

- Nova capability **`orders.pick`** em `apps/web/src/lib/capabilities.ts` (`resource: "Pedidos"`, `defaultRoles: [super_admin, admin, user]`). O tipo `Capability` e a UI de permissões acompanham automaticamente (derivado de `keyof typeof CAPABILITIES`). `capForStatus` **não** muda (picking não é transição de `order_status`).
- **Fila do `user`**: só pedidos da(s) filial(is) dele (`getUserBranchScope` → `scoped`, `includeUnassigned: false`). Pedido na **triagem** (`branchId` null) **não** aparece ao `user` — admin atribui a filial antes (comportamento atual fail-closed, `branch-scope.ts`).
- **Admin/super_admin**: veem todas as filiais do escopo + a aba Exceções; admin vê também a triagem.

## UI

Dark-only, coral + Cormorant em h1/h2 + Inter (DESIGN.md). Mockups aprovados em `.superpowers/brainstorm/` (layout "Item em foco" para execução; fila sem avatar).

### Fila — `/dashboard/separacao` (rota top-level, grupo Operação)

Precedente: `stock/movements` é área operacional top-level sem CRUD. Estrutura:

- `page.tsx` (Server Component, gate `orders.pick`, `getUserBranchScope`).
- **Header** h1 serif "Separação" + resumo (a separar / em andamento / exceções).
- **Banner de retomada** (teal/`info`): se o operador tem `order_picking in_progress` próprio, aparece no topo com barra de progresso + "Retomar".
- **Tabs split** (padrão `order-list-filters.tsx`): esquerda *A separar* (`paid`) · *Em separação* (`preparing` com sessão ativa); direita *Exceções* (`exception`, admin). Admin ganha aba de triagem.
- **Cards de pedido** (stat-card adaptado, **sem avatar** — o número do pedido é o elemento principal): nº, cliente (subtítulo), 📍 filial, **idade do pagamento** com destaque `warning` quando urgente (> ~1 dia), footer Itens · Unidades. CTA: **Separar** (coral) para `paid`; **Retomar** (outline) + barra + "por <operador>" para sessão em andamento.
- `useInfiniteList` + `<InfiniteSentinel>`, `BATCH_SIZE`, ordenado por `paidAt ASC` (mais antigo primeiro). Sem `loading.tsx` (ADR-0022).
- **Navegação**: item "Separação" em `nav-config.ts` (grupo Operação, `capability: 'orders.pick'`). Badge `picking` novo (count de `paid` no escopo) ou reusar `orders` — ver gotcha de 4 pontos de mudança em `nav-badge.tsx`.

### Execução — `/dashboard/separacao/[orderId]` (página dedicada, tela focada)

Layout "Item em foco" (escolhido). Tela focada (sem a sidebar competindo), 2 colunas:

- **Esquerda**: input de scan grande com **foco automático** (keyboard-wedge: captura buffer + Enter, sem debounce — padrão de `branch-stock-infinite.tsx`); card de **item em foco** (thumbnail, nome, variante, barcode mono, contador `N de M`, barra, botão "Item não encontrado" → `reportMissing`); **feedback do scan** com 3 estados explícitos — **Aceito** (verde, contador sobe), **Já completo** (mustard, ignora), **Não pertence ao pedido** (vermelho).
- **Direita**: checklist dos itens (concluído/atual/pendente/exceção), resumo (unidades bipadas, exceções), botão **Concluir separação** desabilitado até liberar, com nota explicando o que falta.
- Client component chama `scanItem`/`reportMissing`/`completePicking`; estado de scan via retorno da action; sucesso fecha/atualiza.

## Auditoria & timeline

- 8ª query paralela em `getOrderDetail` (`orders/data.ts`, hoje 7 em `Promise.all`) buscando `order_picking` + `order_picking_item`; adicionar às relações de `order`.
- `normalizePickings()` no `OrderHistoryFeed`: eventos "Separação iniciada por X", "Separação concluída", "Falta reportada: <item>" — categoria `status`, usando `iconKey`/`tone` serializáveis (`status-visual.tsx`).
- Scans individuais (`order_picking_scan`) carregam **lazy** numa aba "Separação" do detalhe (fora do `Promise.all`), análogo às reviews.
- Usar `db.select().from()` (não `db.execute` raw) nas queries das novas tabelas — recebe `Date` direto, evita o gotcha de timestamp string (`packages/db/CLAUDE.md`).

## Estoque (ADR-0007)

O estoque é debitado **no pagamento**, pelo e-commerce (`reason='saida_venda'`). Na separação ele **já foi debitado** — bipar é só confirmação física e **não movimenta estoque**. Não há reserva real no schema (`reserved` é derivado em runtime de `paid`+`preparing`). Short-pick (item sumido) não tem fluxo automático: a exceção escala para o admin, que corrige o saldo via `ajuste_inventario`/`perda` e, se for o caso, aciona `refundOrder` (reembolso parcial manual, item a item). Ligar isso automaticamente fica **fora de escopo**.

## Coordenação cross-repo (ADR-0009)

As três tabelas entram na superfície de sync e chegam ao `emach-ecommerce` via PR automático — **mas o e-commerce nunca lê nem escreve** (mesmo contrato de `order_note`/`order_event`). Diferente do spec de barcode, **não há mudança de código no checkout do ecommerce**. Ações:

1. Atualizar `docs/integration/admin-ecommerce.md`: adicionar `order_picking`, `order_picking_item`, `order_picking_scan` à tabela de ownership como **Dashboard/Dashboard · e-commerce nunca lê/escreve**.
2. Garantir que o PR de sync no ecommerce compile (sem exhaustive check quebrando) — as tabelas só precisam existir no schema espelhado.

## Testes

`bun --cwd apps/web test` (vitest, node):
- Lookup de scan: snapshot primário + fallback via `variantId` (snapshot nulo legado).
- Regra de contagem: rejeita scan além de `qtyExpected` (app + CHECK).
- `scanItem`: `not_in_order` e `already_complete`.
- Gating: `shipped` bloqueado sem `order_picking completed`; `super_admin` bypassa.
- `reportMissing` → `exception`; `completePicking` exige tudo conferido.
- Branch-scope: `user` só própria filial; bloqueado na triagem; concorrência (uniqueIndex parcial).
- **Smoke visual** (check-types não pega SQL inválido nem hook client em Server Component): `/dashboard/separacao`, `/dashboard/separacao/[orderId]`, e `/dashboard/orders/[id]` (8ª query não pode quebrar o detalhe existente).

## Faseamento

| Fase | Conteúdo | Depende |
|---|---|---|
| **1 — Schema** | 3 tabelas + enum + tipos no barrel; `bun db:sync` (nascem vazias, sem backfill) | barcode Fases A+D |
| **2 — Actions + gating** | `startPicking`/`scanItem`/`reportMissing`/`completePicking`/`cancelPicking`, gating em `updateOrderStatus`, capability `orders.pick`, testes | 1 |
| **3 — Fila** | `/dashboard/separacao` + nav + badge | 2 |
| **4 — Execução** | `/dashboard/separacao/[orderId]` (layout B) + scan client | 2 |
| **5 — Timeline** | 8ª query + `normalizePickings` + aba Separação (scans lazy) | 2 |
| **6 — Cross-repo** | ownership em `admin-ecommerce.md` + verificação do PR de sync | 1 |

## Riscos & gotchas

- **Dependência do barcode** (`2026-06-24`): sem `tool_variant.barcode`/`order_item.barcode` o scan não tem âncora. Confirmar que as Fases A e D daquele spec estão em produção antes da Fase 4 daqui.
- **FK name > 63 chars**: `order_picking_item_picking_id_...` está no limite — dar nome explícito via `foreignKey({ name })` (CLAUDE.md).
- **Partial uniqueIndex**: `drizzle-kit push` não faz diff do predicado `WHERE` — se mudar, recriar manual (DROP/CREATE) (`packages/db/CLAUDE.md`).
- **`"use server"`**: só async functions exportadas — consts/helpers em `_lib`/`data.ts` (regra do build, não pega em `check-types`).
- **Enum `order_status` intocado**: o cliente vê `preparing`; nunca adicionar valor de picking ao `orderStatusEnum`.
- **Smoke visual obrigatório** após schema/queries SSR.

## Fora de escopo / follow-ups

- **Alinhar `order-card.tsx`** (remover o avatar de iniciais do cliente também na listagem de Pedidos, para consistência com a fila de separação) — melhoria adjacente, decisão à parte.
- **Reembolso/cancelamento parcial automático** no short-pick — projeto próprio (o modelo não tem cancelamento parcial nativo hoje).
- **Scanner por câmera** (BarcodeDetector) — keyboard-wedge cobre o MVP.
- **Roteamento automático de filial** na triagem — já fora (existe `getBranchByCep` não-autoritativo).
