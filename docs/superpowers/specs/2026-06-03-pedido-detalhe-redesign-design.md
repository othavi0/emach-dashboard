# Redesign — Detalhe do pedido (`/dashboard/orders/[id]`)

> Data: 2026-06-03 · Status: aprovado para planejamento
> Origem: brainstorming + visual companion (mockups em `.superpowers/brainstorm/`)

## 1. Problema

A página de detalhe do pedido é a tela de uso diário do fluxo operacional, mas **não segue o Entity detail pattern** do sistema (`EntityIdentityHeader` + `EntityTabs`, canônico em `branches/[id]`, usado também em `users/[id]`/`customers`). Hoje ela é um `PageHeader` + grid de dois blocos empilhando tudo num scroll longo (`order-detail-info.tsx` + `order-actions-panel.tsx` + `order-timeline.tsx` + `order-reviews-section.tsx`).

Consequências (validadas com o usuário):

1. **Sobrecarga cognitiva** — identidade, stepper, itens, entrega, pagamento, documentos, avaliações, ações e timeline competem na mesma tela. "Complicado entender o que está acontecendo."
2. **Hierarquia plana** — o que importa no dia (status + próxima ação) divide espaço com dados fiscais raros (NCM/CEST/dimensões) e seções quase sempre vazias (0 anexos, 0 recibos Asaas no banco atual).
3. **Status repetido 3×** — badge no header + badge no card de identidade + stepper.
4. **Ação operacional na coluna lateral**, não integrada ao padrão de detalhe.
5. **Dados coletados que ficam submersos** (ver §6) — desconto, telefone/documento do cliente, observação do cliente, reembolsos, motivo das transições, e ações sem rastro de auditoria (rastreio definido, filial atribuída).

## 2. Objetivo

Reconstruir a tela sobre o Entity detail pattern, com tabs, organizando as três tarefas de peso igual (**fluxo · atendimento · auditoria**) sem sobrecarga, e **trazendo à superfície todo dado relevante** que o pedido coleta. Padronizar componentes visuais (footer de métricas dos cards, status-visual, divisores edge-to-edge).

### Não-objetivos

- Alterar a máquina de estados do pedido ou as regras de transição (`PRIMARY_TRANSITION`, `lockOrderAndAuthorize`).
- Alterar o schema de `order`/`orderItem` (apenas **adicionar** `order_event`; ver §7).
- Religar gates role-based (ADR-0012 segue como está; `requireCapability` mantém-se nas actions).
- Redesenhar a listagem `/dashboard/orders` (já migrada para card-grid).

## 3. Decisões tomadas (brainstorming)

| Tema | Decisão |
|---|---|
| Tarefa diária | As três (fluxo/atendimento/auditoria) têm **peso igual** |
| Dados fiscais por item | **Aba fiscal dedicada** (itens enxutos) |
| Estrutura de navegação | **Direção C** — coluna de ação fixa + abas de leitura |
| Aba de cliente/endereço | Renomeada **"Cliente / Entrega"** |
| Eventos de auditoria faltantes | **Registrar agora** (rastreio, filial etc. geram evento) |
| Pagamento/NF-e/anexos | **"Pagamento & Fiscal"** numa aba; **anexos da equipe entram no Histórico** |

## 4. Arquitetura da página

Layout em três faixas verticais, dentro do container padrão de detalhe (`flex flex-col gap-6 p-6`):

```
┌ EntityIdentityHeader ───────────────────────────────────────────┐
│ avatar(iniciais cliente) · "EM-2026-0014" + badge status        │
│ subtitle: cliente · email · criado                  [Imprimir ▾] │
└─────────────────────────────────────────────────────────────────┘
┌ Card de resumo (full-width, footer de métricas edge-to-edge) ───┐
│ topo: Cliente(nome+tel+doc) · Filial · Pagamento · Obs. cliente  │
│ footer: Itens │ Total(coral) │ Frete │ "Em preparação há Nd"     │
└─────────────────────────────────────────────────────────────────┘
┌ grid [minmax(0,1.55fr) · minmax(330px,1fr)] ────────────────────┐
│ ZONA LEITURA (EntityTabs, ?tab=)      │ COLUNA DE AÇÃO (fixa)    │
│  Itens · Cliente/Entrega · Pagamento  │  Andamento (stepper)     │
│  & Fiscal · Histórico · Avaliações    │  Próxima ação            │
│  [· Reembolso, condicional]           │  Exceções                │
│                                       │  Nota interna            │
└─────────────────────────────────────────────────────────────────┘
```

### Divergência consciente do pattern

O Entity pattern manda a **ação primária no header, contextual por tab**. Aqui a ação de fluxo é complexa (textarea + select de filial + input de rastreio + transição) e, com as três tarefas de peso igual, precisa estar **sempre visível** — não cabe no header nem deve sumir ao trocar de aba. Por isso a **coluna de ação é fixa** ao lado das abas. Decisão documentada para não ser lida como desvio acidental do `branches/[id]`. O slot `actions` do header fica para o **Imprimir ▾** (ação read-only sempre disponível).

Em telas estreitas (`< xl`) a coluna de ação empilha **acima** das abas (a ação é prioritária no mobile).

## 5. Estrutura de abas (zona de leitura)

Sub-navegação `?tab=` via `EntityTabs`. Tab default: **Itens** (omitir param). Todas as coleções carregam o conteúdo; tabs pesadas podem ser lazy por `sp.tab` (padrão do sistema).

1. **Itens** `[badge: nº de linhas]` — tabela enxuta (Item · Qtd · Unitário · Total) + **footer de métricas edge-to-edge** (Subtotal · Desconto · Frete · **Total** em coral). Detalhes por item (modelo/voltagem/marca) como subtítulo da linha.
2. **Cliente / Entrega** — bloco Cliente (nome, e-mail, telefone, CPF/CNPJ, link "Ver cliente ↗") + Endereço congelado + frete/método + rastreio (read-only; edição na coluna de ação) + **Observação do cliente** em destaque sutil. Divisores edge-to-edge.
3. **Pagamento & Fiscal** — Pagamento (método, ref. gateway, comprovante Asaas) + NF-e (número, status, DANFE/XML) + tabela fiscal por item (NCM, CEST, peso, dimensões). Reaproveita `AsaasBlock`/`NfeStatusBadge` de `order-documents-section.tsx`.
4. **Histórico** `[badge: nº eventos]` — feed de auditoria unificado (§6). Chips de filtro (Tudo · Status · Notas · Documentos · Financeiro). Inclui upload de evidência (anexo) inline.
5. **Avaliações** — overview por ferramenta (reaproveita `getOrderReviewsOverview` + `order-reviews-section.tsx`).
6. **Reembolso** `[badge alerta]` — **condicional**: só renderiza a tab quando há `refundRequest`. Mostra categoria, valor, status, ref. Asaas, motivo, rejeição.

## 6. Inventário de dados → destino

Dados que o pedido coleta e onde passam a aparecer. **Negrito** = hoje submerso.

| Dado | Origem | Destino |
|---|---|---|
| number, status, createdAt, cliente | order + client | Header |
| **desconto** (order + item) | `order.discountAmount`, `orderItem.discountAmount` | Footer de métricas / linha de item |
| subtotal, frete, total | order | Footer de métricas (Itens) + card resumo |
| itens (nome, sku, modelo, voltagem, marca, qtd, preço) | orderItem | Aba Itens |
| fiscais (ncm, cest, peso, dimensões, custo) | orderItem | Aba Pagamento & Fiscal |
| **telefone, CPF/CNPJ do cliente** | client.phone, **client.document** | Card resumo + Cliente/Entrega |
| endereço, método/valor frete, rastreio | order | Cliente/Entrega |
| **observação do cliente** (checkout) | order.notes (`customerNotes`) | Card resumo + Cliente/Entrega |
| filial | order.branchId/branchName | Card resumo + ação atribuir |
| pagamento (método, ref, recibo Asaas) | order | Pagamento & Fiscal |
| NF-e (número, url, xml, status) | order | Pagamento & Fiscal |
| datas de transição (paidAt, shippedAt…) | order | Stepper "Andamento" + Histórico |
| histórico de status + **motivo** | orderStatusHistory (reason) | Histórico |
| notas internas | orderNote | Histórico |
| anexos / evidências | orderAttachment | Histórico (evento + upload) |
| **reembolsos** (categoria, valor, status, rejeição) | refundRequest | Aba Reembolso (condicional) |
| **rastreio definido / filial atribuída** | **`order_event` (novo)** | Histórico |

## 7. Histórico de auditoria — modelo

O feed unifica fontes cronologicamente, cada evento com `iconKey` + `tone` (serializáveis, padrão `status-visual.tsx`):

- **Transições de status** — `orderStatusHistory` (from→to, ator, **reason**).
- **Notas internas** — `orderNote`.
- **Anexos** — `orderAttachment` (já tem `createdAt`/`uploadedBy` → derivável de graça).
- **Reembolsos** — `refundRequest` (aberto/resolvido).
- **Ações operacionais sem timestamp próprio** — nova tabela **`order_event`**.

### Nova tabela `order_event`

Auditoria de ações que hoje não deixam rastro (rastreio definido, filial atribuída e futuras). Genérica para não criar uma tabela por ação:

```
order_event:
  id text pk
  order_id text fk → order(id) on delete cascade
  event_type text  -- 'tracking_set' | 'branch_assigned' | ... (enum no app)
  metadata jsonb   -- { trackingCode } | { branchId, branchName, via } | ...
  actor_type actor_type ('user'|'system')   -- CHECK actor_coherence
  actor_user_id text fk → user(id) on delete set null
  created_at timestamp default now()
  index (order_id, created_at desc)
```

Decisão deliberada: **não** estender `orderStatusHistory` (é estritamente from/to de status). `order_event` é aditiva — segue ADR-0009 (push-only, sync CI dashboard→ecommerce); coordenar como mudança aditiva. Aplicar com `bun db:sync`.

### Server actions que passam a registrar evento

Em `dashboard/orders/actions.ts`, dentro da transação já existente (`lockOrderAndAuthorize`):

- `updateTrackingCode` → insere `order_event{ tracking_set }`.
- `assignBranch` → insere `order_event{ branch_assigned }`.

Auditoria respeita o padrão: admin → `actorType:'user'` + `actorId`; automático → `'system'`. CHECK `actor_coherence` no DB.

## 8. Mudanças de dados (`orders/data.ts`)

`getOrderDetail` / tipo `OrderDetail` ganham:

- `clientDocument` (adicionar `c.document` ao SELECT base).
- `discountAmount` do pedido (já existe coluna; expor no shape).
- `refundRequests: OrderRefundItem[]` (nova query — hoje não carregado).
- `events: OrderEventItem[]` (nova query em `order_event`) — fundidos no feed do Histórico.
- Feed do Histórico passa a mesclar 5 fontes (status, notas, anexos, reembolsos, eventos) em vez de 2.

## 9. Componentes

Novos em `apps/web/src/app/dashboard/orders/[id]/_components/`:

- `order-identity.tsx` — wrapper de `EntityIdentityHeader` (avatar de iniciais do cliente + número + badge `OrderStatusBadge`).
- `order-summary-card.tsx` — card de resumo + **footer de métricas** (mesma técnica de `branch-stats-card.tsx`: grid `border-t`/`border-r`, valor `font-bold tabular-nums`, label `text-[10px] uppercase`; Total em `text-primary`, SLA em âmbar).
- `tabs/items-tab.tsx`, `tabs/customer-delivery-tab.tsx`, `tabs/payment-fiscal-tab.tsx`, `tabs/history-tab.tsx`, `tabs/reviews-tab.tsx`, `tabs/refund-tab.tsx`.
- `order-action-column.tsx` — refatoração de `order-actions-panel.tsx`, dividido em `andamento` (stepper vertical com timestamps), `próxima ação`, `exceções`, `nota`.
- `order-history-feed.tsx` — feed unificado com filtros, reusando `status-visual`.
- `print-menu.tsx` — dropdown "Imprimir ▾" (DANFE, etiqueta de envio, lista de separação, pedido completo) reusando `print-shipping-label`/`print-picking-slip`/`print-button` existentes.

`page.tsx` passa a montar header + summary + grid(EntityTabs · action-column), lendo `sp.tab`.

Reaproveitar: `EntityIdentityHeader`, `EntityTabs`, `OrderStatusBadge`, `status-visual.tsx`, `ORDER_STATUS_META`, `AsaasBlock`/`NfeStatusBadge`, `getOrderReviewsOverview`, `OrderLifecycleStepper` (adaptado para vertical).

## 10. Fluxo de botões (revisão)

- **Imprimir ▾** no header agrupa os documentos imprimíveis (antes: botão único).
- **1 só coral por superfície** — o coral é a próxima ação de fluxo. Demais: secondary/outline/warning/ghost.
- **Exceções** com peso menor: devolução `warning` (outline), reembolso `outline`, cancelar `destructive` — `cancelar` aparece só em `pending_payment`/`payment_failed` (regra atual mantida).
- Nota interna em `secondary`.
- Botão destrutivo nunca coral (DESIGN.md).

## 11. Refinos visuais (feedback do usuário)

- **Divisores edge-to-edge** — divisores internos furam o padding do card (`-mx`, técnica DESIGN.md §4), encostando na borda.
- **Observação do cliente sutil** — destaque pela borda âmbar fina + fundo bem leve (≈5–6% warning), não bloco saturado.
- **Totais como footer de métricas** — substitui a caixinha alinhada à direita por footer edge-to-edge de 4 métricas.

## 12. Acessibilidade & design system

- AAA, focus ring hairline coral, `prefers-reduced-motion` (herdados do design system).
- Status = **ícone + label + cor** (color-blind safe) via `status-visual`.
- Cormorant em h1/h2; Inter no resto; tokens oklch, sem hex.
- `next/image` salvo thumbs Supabase; sem `console.*` (usar `logger`); sem `: any`.

## 13. Escopo & fases

Entrega única (o usuário optou por incluir tudo agora), implementável em ordem:

1. **Dados/backend** — `order_event` (schema + `db:sync`), enriquecer `getOrderDetail` (document, desconto, reembolsos, eventos), actions registram eventos.
2. **Shell** — `page.tsx` + identity + summary card + grid + action-column (paridade funcional com hoje).
3. **Abas** — Itens, Cliente/Entrega, Pagamento & Fiscal, Avaliações.
4. **Histórico** — feed unificado + filtros + upload inline.
5. **Reembolso** — aba condicional.
6. **Polimento** — refinos visuais, Imprimir ▾, smoke visual por status.

## 14. Arquivos afetados (principais)

- `packages/db/src/schema/orders.ts` (+`order_event`), `schema/index.ts` (barrel).
- `apps/web/src/app/dashboard/orders/data.ts` (shape + queries).
- `apps/web/src/app/dashboard/orders/actions.ts` (registro de eventos).
- `apps/web/src/app/dashboard/orders/[id]/page.tsx` (reescrita do layout).
- Novos componentes em `[id]/_components/` (§9); aposentar `order-detail-info.tsx`, `order-actions-panel.tsx`, `order-timeline.tsx` conforme migrados.

## 15. Verificação

- `bun check-types` + `bun check` (ultracite).
- **Smoke visual obrigatório** (tsc não pega SQL/RSC): visitar pedidos de status variados — `preparing` (EM-2026-0014), `shipped` (com rastreio), `delivered`, `canceled` (EM-2026-0001, terminal), `paid` (atribuir filial). Conferir: footer de métricas, divisores edge-to-edge, feed de auditoria com eventos novos, aba Reembolso aparecendo só quando há refund, Imprimir ▾.
- `bun db:sync` após editar schema; confirmar `order_event` no banco.
