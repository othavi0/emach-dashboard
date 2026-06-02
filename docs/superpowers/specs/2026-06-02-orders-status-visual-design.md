# Sistema visual de status em Pedidos (histórico + pendências)

**Data:** 2026-06-02
**Escopo:** `apps/web/src/app/dashboard/orders` + componentes compartilhados `activity-feed`, `pending-panel`

## Problema

No topo de `/dashboard/orders`, o **Histórico recente** (`ActivityFeed`) mostra
todo evento de pedido com o **mesmo** ícone (Package) e cor (amarelo,
`text-warning` do kind `order`), independente do status real. Não comunica de
relance que um pedido foi para "Em preparação" vs "Cancelado". O ícone + cor por
status já existem nos badges dos cards (`order-status-badge.tsx`) mas não são
reaproveitados. Além disso, o histórico e as pendências ainda exibem "Aguardando
pgto" (abreviado), divergindo das tabs (já renomeadas para "Aguardando pagamento").

## Objetivo

Status com **ícone + cor consistentes em todo o fluxo de pedidos**, vindos de uma
fonte única, aplicados a: badges dos cards (já têm), **histórico recente** e
**pendências**. Renomear "Aguardando pgto" → "Aguardando pagamento" em todo lugar.

## Decisões (validadas com o usuário)

- **Histórico (abordagem C):** ícone do status colorido à esquerda + nome do
  status na cor do status (sem pílula). Mantém densidade da lista.
- **Pendências:** ícone de status à esquerda de cada linha.
- **Label:** muda em `ORDER_STATUS_LABELS` → propaga a histórico, pendências,
  badges dos cards e timeline do detalhe ("Aguardando pgto" some do sistema).

## Arquitetura

**Fonte única de status.** Hoje ícone e cor vivem em `order-status-badge.tsx`
(`STATUS_ICONS` + `STATUS_VARIANTS`). Centralizar num módulo de vocabulário visual:

- `apps/web/src/components/status-visual.tsx` (**novo**, client):
  - `STATUS_ICONS: Record<StatusIconKey, LucideIcon>` — único mapa nome→ícone
    lucide (`clock, ban, check, package, truck, checkCheck, undo, xCircle, rotate`).
  - `TONE_TEXT: Record<Tone, string>` (`text-success/info/warning/destructive`) e
    `TONE_BADGE_VARIANT` (variant do `<Badge>`).
  - Tipos `StatusIconKey`, `Tone`.
- `status-meta.ts` (server-safe): adiciona
  `ORDER_STATUS_META: Record<OrderStatus, { label; iconKey: StatusIconKey; tone: Tone }>`
  — **fonte única de dados** de status. `ORDER_STATUS_LABELS` passa a derivar dela.
  Importa só `type` de `status-visual` (apagado em runtime → não arrasta client p/ server bundle).

**Por que iconKey (string) e não o LucideIcon direto:** o histórico carrega seus
eventos via server action (`fetchOrderActivityPage`), cujo retorno precisa ser
serializável — não pode conter componentes. Os componentes recebem `iconKey`/`tone`
(strings) e resolvem para ícone/cor no client via `status-visual`.

## Mudanças por arquivo

| Arquivo | Ação |
|---|---|
| `components/status-visual.tsx` | **criar** — registry ícone/tone + tipos. |
| `orders/status-meta.ts` | `ORDER_STATUS_META`; `ORDER_STATUS_LABELS` derivado; `pending_payment` label = "Aguardando pagamento". |
| `orders/_components/order-status-badge.tsx` | refatora p/ consumir `ORDER_STATUS_META` + `status-visual` (remove `STATUS_ICONS`/`STATUS_VARIANTS` locais). Comportamento visual idêntico. |
| `components/activity-feed.tsx` | `ActivityEvent` ganha opcionais `iconKey?`, `tone?`, `accentLabel?`. Quando presentes: ícone = `STATUS_ICONS[iconKey]` na cor `TONE_TEXT[tone]`, e o `accentLabel` (nome do status) renderizado colorido após `primary`. Sem eles → `KIND_META` (comportamento atual; outros módulos intactos). |
| `orders/pending-data.ts` | `fetchOrderActivityPage`: `primary` = `#<número>` e preenche `iconKey/tone/accentLabel` do `ORDER_STATUS_META[toStatus]`. `PENDING_ORDER_BADGE` ganha `iconKey/tone` e usa label "Aguardando pagamento". |
| `components/pending-panel.tsx` | `PendingRow` ganha `iconKey?`/`tone?`; renderiza ícone de status à esquerda quando presentes. |

## Compatibilidade

`ActivityFeed` e `PendingPanel` são compartilhados (customers, users, stock,
reviews). Todos os campos novos são **opcionais** → consumidores que não os passam
mantêm o comportamento atual (`KIND_META` / sem ícone). Sem regressão.

## Não-objetivos (YAGNI)

- Mudar a transição mostrada no histórico (continua "→ destino", sem "origem →").
- Badge-pílula no histórico (abordagem B, descartada — pesa na lista).
- Mexer no aging das pendências ou na query de contagem (já corrigida antes).

## Verificação

- `bun check-types` + `ultracite check` (arquivos tocados).
- Smoke em `localhost:3006/dashboard/orders`: histórico com ícone+cor+nome por
  status; "Aguardando pagamento" no histórico/pendências/badge; pendências com
  ícone; conferir que Clientes/Usuários (outros consumidores do ActivityFeed/
  PendingPanel) seguem inalterados.
