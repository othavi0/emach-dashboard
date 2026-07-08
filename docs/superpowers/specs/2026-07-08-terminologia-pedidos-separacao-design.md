# Consolidação de terminologia: Pedidos × Separação

- **Data:** 2026-07-08
- **Status:** aprovado (brainstorming com user; opção de card escolhida via visual companion)
- **Escopo:** só UI/labels e estrutura de abas do dashboard. Banco, enums e app ecommerce intocados.

## Problema

Dois eixos de estado coexistem com vocabulário quase idêntico e sinônimos gratuitos:

1. **Status do pedido** (`order.status`, contrato ecommerce): `paid → preparing → shipped → delivered`. Label de `preparing` = "Em preparação".
2. **Sub-estado de fulfillment** (derivado da última sessão de `order_picking`, só dashboard): `awaiting_picking → picking_in_progress → picked` (desvio `picking_exception`).

Sintomas observados na UI:

- O card de pedido empilha **dois badges** parecidos: "Em preparação" + "Em separação" (ou "Em preparação" + "Separado").
- O estado `in_progress` tem **4 nomes**: "Em separação" (tab), "Em andamento" (KPI header), "Separando" (badge do card na fila), "Separação em andamento" (título da execução).
- O dialog de cancelamento mistura os eixos: "O pedido permanece **em preparação** e pode ser **separado** novamente".
- `awaiting_picking` chama-se "Aguardando separação" no badge, mas a fila correspondente chama-se "A separar".

## Decisões

### 1. Pedidos — abas de fluxo

A aba agregada **"A preparar" é removida**. Grupo de fluxo (esquerda):

**Pago · Em preparação · Enviados · Entregues**

- Cada status do funil tem aba própria (pedido explícito do user: "Pagos" com tab separada).
- Grupo de exceções (direita) inalterado: Aguardando pagamento · Devolvidos · Cancelados.
- `ORDER_FUNNEL_TABS` (abas ocultas `paid`/`preparing` de drill-down) é absorvido pelas abas de fluxo; deep-links `?tab=paid` e `?tab=preparing` continuam resolvendo. `?tab=to_prepare` (chave antiga) deve resolver para um fallback razoável (`paid`) em vez de quebrar.
- **`DEFAULT_ORDER_TAB` = `paid`** ("Pago"): primeira aba do funil e fila de entrada. Badges de contagem nas abas mostram o volume das demais.
- Semântica de "Pago": pagamento confirmado e separação ainda não iniciada. `startPicking` já transiciona `paid → preparing` automaticamente (verificado em `separacao/actions.ts`), então "Pago" ≙ fila "A separar" da página Separação.

### 2. Card de pedido — badge único (estado mais específico)

Regra determinística, sem badge duplo:

```
displayState(order) =
  order.status === 'preparing' → label do FulfillmentState
  senão                        → label do OrderStatus
```

- `preparing` + `awaiting_picking` → **A separar**
- `preparing` + `picking_in_progress` → **Em separação**
- `preparing` + `picking_exception` → **Exceção na separação**
- `preparing` + `picked` → **Separado**
- Demais status → Pago, Enviado, Entregue, Devolvido, Cancelado, …

Aplica-se a todas as abas, incluindo "Todos". Badges auxiliares de outra natureza (ex.: `ShippingUnverifiedBadge`) não mudam.

### 3. Separação — um termo por estado

`in_progress` fica **"Em separação"** em toda superfície:

| Superfície | Hoje | Passa a ser |
|---|---|---|
| KPI do header da página | "Em andamento" | "Em separação" |
| Badge do card na fila (`Separando`) | "Separando" | **removido** — a aba já diz o estado; o card mantém só o alerta "Parada há X" |
| Título da tela de execução | "Separação em andamento" | "Separação do pedido EM-XXXX" |
| `FULFILLMENT_STATE_META.awaiting_picking` | "Aguardando separação" | "A separar" |
| Copy do dialog de cancelar | "O pedido permanece em preparação e pode ser separado novamente" | "O pedido volta para a fila A separar" |

Verbos de ação (inalterados): **Separar** (iniciar), **Retomar separação**, **Assumir separação**, **Cancelar separação**, **Concluir separação**.

### 4. Glossário canônico

- **Eixo status do pedido** — nomes das abas de Pedidos e steps do funil no detalhe: Pago → Em preparação → Enviado → Entregue.
- **Eixo separação** — página Separação, badges de card e sub-labels: A separar → Em separação → Separado (desvio: Exceção na separação).
- **"Preparação" nunca aparece como badge nem em copy operacional** — é exclusivamente nome de aba/step do funil de status.

## Fora de escopo (registrado para depois)

- **Aba "Atrasados"** em Pedidos: pedido parado em separação por ~3 dias entra numa fila de atraso. Sessão futura definirá regra e UI.
- Qualquer mudança de schema/enum (`order.status`, `order_picking.status`) ou de comportamento de transição.
- Qualquer superfície do app ecommerce (cliente final continua vendo o vocabulário próprio dele).

## Critérios de aceite

1. Pedidos abre na aba "Pago"; abas de fluxo = Pago · Em preparação · Enviados · Entregues, com contagens.
2. Nenhum card de pedido exibe dois badges de estado simultâneos; o badge segue a regra `displayState`.
3. `rg -n "Em andamento|Separando|Aguardando separação" apps/web/src/app/dashboard/{orders,separacao}` não retorna nenhuma superfície de UI viva (fora testes) — todas consolidadas nos termos canônicos.
4. Dialog de cancelamento usa a copy nova; cancelar sessão devolve o pedido à fila "A separar" (comportamento já existente, só copy).
5. Deep-links `?tab=paid`, `?tab=preparing` e `?tab=to_prepare` (legado) resolvem sem erro.
6. `bun verify` verde; smoke visual nas rotas `/dashboard/orders` e `/dashboard/separacao`.

## Arquivos-âncora (não exaustivo)

- `apps/web/src/app/dashboard/orders/status-meta.ts` — `ORDER_FLOW_TABS`, `ORDER_FUNNEL_TABS`, `DEFAULT_ORDER_TAB`, `ORDER_STATUS_META`
- `apps/web/src/app/dashboard/orders/_components/order-card.tsx` — badge duplo → badge único
- `apps/web/src/app/dashboard/separacao/fulfillment-meta.ts` — labels do eixo separação
- `apps/web/src/app/dashboard/separacao/page.tsx` — KPIs do header
- `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx` / `picking-order-card.tsx` — badge "Separando"
- `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx` — título + dialog de cancelar
- `apps/web/src/app/dashboard/orders/[id]/_components/*` — steps/sub-labels do detalhe
