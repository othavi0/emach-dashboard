# Spec — Fluxo de separação e despacho de pedidos

- **Data:** 2026-07-06
- **Status:** aprovado (brainstorming com owner)
- **Escopo:** dashboard (`apps/web` + `packages/db`). Zero mudança de contrato com o ecommerce.

## 1. Problema

Dois furos operacionais relatados pelo owner, confirmados no código:

1. **Visibilidade:** o detalhe do pedido não mostra o estado da separação. Quem está separando, progresso e conclusão só aparecem na aba Histórico (`orders/[id]/_components/order-history-feed.tsx`), enterrados na timeline. O funil (`order-progress.tsx`) e a coluna de ação ignoram o picking; não há nem link para `/dashboard/separacao/[orderId]`.
2. **Gate de envio furado:** `updateOrderStatus` (`orders/actions.ts:210-216`) exige separação concluída para `preparing → shipped`, **exceto para `super_admin`** — bypass explícito, coberto por teste como intencional. Na prática o owner (super_admin) envia qualquer pedido só digitando um código de rastreio. Além disso, o gate usa `hasCompletedPicking` (`separacao/data.ts:96-108`), que aceita *qualquer* sessão `completed` histórica — não a mais recente.

Bugs adjacentes encontrados na exploração (entram no escopo):

- `reportMissing` (`separacao/actions.ts:300-378`) não valida que a sessão está `in_progress`.
- `cancelPicking` (`separacao/actions.ts:476-528`) não valida o status da sessão — cancela sessão já `completed`/`exception`/`canceled`.
- `scanItem`/`reportMissing`/`completePicking` não validam que o ator é o dono da sessão (`pickerUserId`) — qualquer um com `orders.pick` pode operar a sessão alheia.
- `getPickingForOrderAction` (`separacao/actions.ts:549-552`) não checa branch-scope.
- A tab de exceções (`separacao/data.ts:238-242`) mostra o pedido para sempre se *qualquer* sessão histórica teve exceção, mesmo depois de re-separado com sucesso.

## 2. Decisões (e alternativas rejeitadas)

| # | Decisão | Rejeitado |
|---|---|---|
| 1 | Gate de envio vale para **todos os roles**; super_admin ganha **override explícito e auditado** (`forceShip` + motivo) | Manter bypass silencioso; gate sem exceção nenhuma |
| 2 | Sub-estado de fulfillment **derivado da última sessão de `order_picking`** — `order.status` intocado | Novo valor no enum `order_status` (vaza pro cliente do ecommerce, deploy coordenado); coluna denormalizada `fulfillment_status` (duplica verdade) |
| 3 | Exceção de separação **bloqueia o envio até resolver**; resoluções: **reabrir separação** ou **encaminhar reembolso** | Envio parcial (mexe em valores/NF-e/reembolso parcial); reatribuir filial como resolução; cancelamento total automático |
| 4 | Sessão presa: **admin assume ou cancela (auditado)** + alerta visual de sessão parada | Timeout automático (risco de matar separação em andamento físico); só o dono resolve |
| 5 | Envio continua com `orders.update_status` (todos os roles) | Restringir a admin; capability nova `orders.ship` |
| 6 | Despacho acontece no detalhe do pedido **e** na tela de separação ao concluir (painel "Despachar agora" opcional) | Despacho só no detalhe do pedido |
| 7 | Auto-refresh leve por polling (~45s, aba visível) na fila e no detalhe | Refresh só manual; Supabase Realtime (escala de ~20 pedidos/dia não justifica) |

Escala de referência: até ~20 pedidos/dia, 1–2 pessoas separando.

## 3. Modelo de estado — sub-estado de fulfillment derivado

Fonte de verdade: a sessão de `order_picking` **mais recente** do pedido (`ORDER BY startedAt DESC LIMIT 1`; a unique parcial `order_picking_one_active` garante no máximo 1 `in_progress`).

| Última sessão | Sub-estado | Label | Tone |
|---|---|---|---|
| nenhuma, ou `canceled` | `awaiting_picking` | Aguardando separação | secondary |
| `in_progress` | `picking_in_progress` | Em separação | info |
| `exception` | `picking_exception` | Exceção na separação | warning |
| `completed` | `picked` | Separado | success |

- Sub-estado só se aplica a pedidos em `paid`/`preparing`. Para `shipped`+ o card de separação vira resumo histórico (quem separou, quando, ou "envio forçado"); para `pending_payment`/`payment_failed`/`canceled` o card não aparece.
- **Helper único server-side** em `separacao/data.ts`: tipo `FulfillmentState` + função que resolve o sub-estado (com picker, progresso em unidades, `lastScannedAt`) para um pedido, e fragmento SQL de "última sessão" reutilizável nas queries de lista/fila. Nenhum consumidor recalcula por conta própria.
- Meta visual segue o pattern de `status-visual.tsx` + `*_STATUS_META` (DESIGN.md §4): novo `FULFILLMENT_STATE_META` com `{ label, iconKey, tone }` serializável.
- **Correção da tab exceções:** todas as queries que hoje perguntam "existe sessão X" (`fetchPickingQueue` tabs, `hasCompletedPicking`) passam a usar a semântica de última sessão. Pedido re-separado com sucesso sai da tab de exceções.

## 4. Gate de envio

Em `updateOrderStatus` quando `toStatus === "shipped"`:

1. **Remove o bypass `session.user.role !== "super_admin"`.** O gate vale para todos.
2. A condição passa a ser: **última sessão do pedido é `completed`**. Substitui `hasCompletedPicking` (existência histórica).
3. Mensagens de erro distintas por sub-estado: aguardando ("Conclua a separação antes de despachar"), em separação ("Separação em andamento por {picker}"), exceção ("Separação com exceção — resolva antes de despachar").
4. **Override `forceShip`** (novos campos no schema Zod da action, opcionais):
   - Só `super_admin` (checagem de role no server; não é capability nova).
   - `forceReason` obrigatório, mínimo 10 caracteres.
   - **Bloqueado se a última sessão está `in_progress`** — não se força envio por cima de alguém separando; cancele/assuma antes.
   - Auditoria: insere `order_event` com novo tipo `ship_forced` e `metadata: { reason }`, além do registro normal em `order_status_history` (reason = motivo do força).
   - Client: ação separada "Forçar envio sem separação…" (AlertDialog com textarea de motivo), visível só para super_admin — nunca o caminho primário.
5. O espelho client-side: botão "Marcar como Enviado" desabilitado (com tooltip explicando) enquanto o sub-estado não for `picked`. A validação real continua no server.

## 5. Sessões de separação — ownership, takeover, guards

- **Ownership:** `scanItem`, `reportMissing` e `completePicking` passam a exigir (a) sessão `in_progress` e (b) `session.user.id === picking.pickerUserId`. Fecha os bugs de guard e de sessão alheia.
- **`cancelPicking`:** exige sessão `in_progress`; permitido para o dono **ou** admin/super_admin (branch-scoped). Grava auditoria nas novas colunas (`canceledByUserId/Name`, `canceledAt`, `cancelReason` opcional).
- **`takeoverPicking` (nova action):** admin/super_admin, branch-scoped, exige sessão `in_progress` de outro usuário. Atomicamente (mesma transação): cancela a sessão atual com auditoria (`cancelReason = "Assumida por {nome}"`) e cria nova sessão `in_progress` para o ator, **do zero** (sem herdar `qtyPicked` — quem assume re-confere fisicamente).
- **Página `/dashboard/separacao/[orderId]` para não-donos:** hoje renderiza `PickingExecution` para qualquer um. Passa a: dono → execução; não-dono → visão read-only ("{picker} está separando — X/Y unidades, desde HH:MM") com ações Assumir/Cancelar se o viewer for admin/super_admin.
- **Sessão parada:** constante `STALE_PICKING_MS = 1h` sem bipagem (`max(startedAt, lastScannedAt máximo)`). Badge warning "Parada há {duração}" no card da fila (`em_separacao`), no card de separação do detalhe do pedido e na visão read-only. Só alerta — não bloqueia nem expira nada.
- **`getPickingForOrderAction`:** adicionar checagem de branch-scope (mesma régua de `lockOrderAndAuthorize`).

## 6. Exceções — resoluções

No card de separação do detalhe do pedido e na tab de exceções da fila:

- Exibir `exceptionReason` + itens `notFound` da sessão.
- **"Reabrir separação"** — inicia nova sessão (`startPicking` normal; requer `orders.pick`, branch-scoped). A nova sessão vira a "última" → pedido sai do sub-estado de exceção e volta para "Em separação". Uso típico: estoque foi reposto/ajustado.
- **"Encaminhar reembolso"** — abre o `RefundDialog` existente (`orders.refund`, admin/super_admin). Pedido reembolsado sai da fila naturalmente (status ≠ `paid`/`preparing`).

## 7. Telas

### Detalhe do pedido (`orders/[id]`)

- **Card "Separação"** na coluna de ação (`order-action-column.tsx`), acima do bloco de rastreio, para status `paid`/`preparing`:
  - `awaiting_picking`: estado + botão "Iniciar/abrir separação" (link para `/dashboard/separacao/[orderId]`). Em `paid` sem `branchId`, o card orienta atribuir a filial primeiro (o `startPicking` exige filial) — sem link de separação até lá.
  - `picking_in_progress`: dot + "{picker} · desde HH:MM", barra de progresso (unidades), badge de parada quando aplicável, ações: Abrir separação (link) / Assumir / Cancelar sessão (admin).
  - `picking_exception`: motivo + resoluções (§6).
  - `picked`: "{picker} · HH:MM–HH:MM", barra completa.
  - Para `shipped`+: resumo compacto (quem/quando separou, ou "Envio forçado — {motivo}").
- **Envio:** input de rastreio como hoje; "Marcar como Enviado" travado até `picked` (§4.5); "Forçar envio…" (super_admin) como ação destacada à parte.
- **`OrderProgress`:** o nó "Em preparação" ganha sub-label com o sub-estado ("Em separação — João", "Separado").

### Separação (`/dashboard/separacao`)

- **Pós-conclusão (opção A aprovada em mockup):** ao `completePicking` com sucesso, a tela de execução mostra o estado "Concluída" com painel **"Despachar agora" (opcional)** — input de rastreio + "Marcar como Enviado" (chama `updateOrderStatus` normal; gate passa pois a sessão acabou de completar). Botão "Voltar à fila"; caption explica que o pedido fica "Separado" e pode ser despachado depois no detalhe. Painel só aparece quando a conclusão foi `completed` (não `exception`) e o user tem `orders.update_status`.
- **Fila, tab `em_separacao`:** cards ganham nome do picker e badge de sessão parada.
- **Fila, tab `excecoes`:** cards ganham motivo + botões de resolução (§6); query corrigida para última sessão (§3).

### Lista de pedidos (`orders`)

- Cards com status `preparing` ganham badge do sub-estado (Em separação / Separado / Exceção) ao lado do `OrderStatusBadge`. A query da lista junta a última sessão via o fragmento do helper (§3).

### Auto-refresh

- Componente client reutilizável `<AutoRefresh intervalMs={45_000} />`: `router.refresh()` em intervalo, pausado quando `document.visibilityState !== "visible"`.
- Aplicado em: fila de separação e detalhe do pedido. **Não** na tela de execução de picking (o scan já revalida; refresh periódico atrapalharia a digitação/fila de scans).

## 8. Schema (`packages/db`, push-only, tudo add-only)

- `order_picking`: novas colunas nullable `canceledByUserId` (FK `user`, `set null`), `canceledByName` (text), `canceledAt` (timestamptz), `cancelReason` (text).
- `orderEventTypeEnum`: novo valor `ship_forced` (append — `ALTER TYPE ... ADD VALUE`, seguro para o sync ADR-0009; ecommerce não lê `order_event`).
- `bun db:sync` após editar; sync TS pro ecommerce via CI PR automático, sem impacto no cliente.

## 9. Capabilities e permissões

Nenhuma capability nova. Resumo de quem faz o quê:

| Ação | Requisito |
|---|---|
| Separar (iniciar, bipar, concluir) | `orders.pick`, branch-scoped, dono da sessão |
| Cancelar sessão | dono, ou admin/super_admin (branch-scoped) |
| Assumir sessão | admin/super_admin (branch-scoped) |
| Despachar (`shipped`) | `orders.update_status` + última sessão `completed` |
| Forçar envio | role `super_admin` + motivo ≥10 chars |
| Reabrir separação (exceção) | `orders.pick` |
| Encaminhar reembolso (exceção) | `orders.refund` |

## 10. Testes

- **Estender `ship-gating.test.ts`:** gate vale para super_admin (sem bypass); semântica de última sessão (completed antiga + canceled recente = bloqueia); `forceShip` só super_admin, exige motivo, bloqueado com sessão `in_progress`, grava `order_event`.
- **Novos:** ownership de sessão (scan/complete/reportMissing de não-dono falham); guards de status em `reportMissing`/`cancelPicking`; `takeoverPicking` (atomicidade, auditoria, só admin); resolução de exceção (reabrir tira da tab de exceções).

## 11. Rollout e edge cases

- **Pedidos em vôo:** pedidos hoje em `preparing` sem sessão `completed` ficarão bloqueados para envio ao deployar — comportamento desejado (é o gate). Com ~20 pedidos/dia, resolve-se separando ou forçando com motivo.
- Pedido `preparing` sem nenhuma sessão (atribuído antes da feature ou fluxo manual): sub-estado `awaiting_picking`, envio bloqueado até separar ou forçar.
- `completed` é terminal de verdade: com o guard novo, `cancelPicking` não cancela sessão concluída — "última = completed" é estável.
- Despacho pós-conclusão na tela de separação usa a mesma action e o mesmo gate — sem caminho especial.

## 12. Fora de escopo

- Envio parcial / reembolso parcial.
- Reatribuição de filial como resolução de exceção.
- Notificação ao cliente em mudança de status (não existe hoje; continua não existindo).
- Realtime (websocket) — polling leve cobre a escala atual.
- Mudanças no enum `order_status` ou em qualquer superfície lida pelo ecommerce.
