# Atrasados como overlay — abas de Pedidos

**Data:** 2026-07-13
**Status:** aprovado
**Substitui parcialmente:** spec 2026-07-10 (a regra de 72h e o relógio permanecem; a *exclusividade* da aba Atrasados é revertida)

## Problema

A aba "Atrasados" é exclusiva: pedido `paid`/`preparing` com ≥72h *sai* de "Pago"/"Em preparação" e só aparece em "Atrasados" (flag `lateness: "exclude"` nas defs das abas). Na prática a aba "Pago" fica vazia enquanto "Atrasados" acumula pagos e em-preparação misturados, e a posição da aba (no meio do funil) sugere uma etapa do fluxo, o que ela não é.

## Decisões (todas validadas com o user, mockups no visual companion)

1. **Overlay, não exclusividade.** Pedido atrasado permanece na aba do seu status **e** aparece em "Atrasados". Regra de 72h e relógio `COALESCE(paid_at, created_at)` inalterados (`_lib/lateness.ts`).
2. **Posição da aba:** fim do grupo de fluxo — `Todos · Pago · Em preparação · Enviados · Entregues · Atrasados`. Grupo de exceções à direita inalterado.
3. **Contagens:** badges de "Pago"/"Em preparação" mostram o **total** (incluindo atrasados — o número bate com a lista). "Atrasados" conta só atrasados. "Todos" inalterado.
4. **Sub-abas em Atrasados:** pills `Todos · Pagos · Em preparação` (com contagem) filtram a lista por status. Default "Todos". URL: `?tab=late&lateStatus=paid|preparing` (linkável, sobrevive a refresh). Trocar de aba principal descarta `lateStatus`.
5. **Chip "ATRASADO"** (âmbar, `bg-warning text-warning-foreground`) ao lado do badge de status no card, quando `lateness === "late"` — **exceto dentro da aba Atrasados** (todos lá estão atrasados; seria ruído idêntico em todo card). Borda âmbar + idade âmbar existentes permanecem.
6. **Badge do card na aba Atrasados = status real** ("Pago"/"Em preparação"), não o sub-estado da separação. Divergência consciente da regra "sub-estado > status dentro de preparing" (spec 2026-07-08): a aba Atrasados é triagem, não operação de picking; o sub-estado vive na página Separação. Documentar inline em `display-state.ts`.
7. **Inalterados:** toast "N pedidos atrasados", `getLateOrdersCount` (página Separação), faixa âmbar 48–72h (sem chip — chip é só ≥72h), FIFO `paidAtAsc` nas filas, TTL de 30s dos counts.

## Abordagem técnica

Declarativa, dentro do modelo existente (abordagem 1 de 3 avaliadas; rejeitadas: status persistido via cron — dessincroniza e escreve no banco compartilhado; sub-abas como abas de 1ª classe em `ORDER_TABS` — polui todos os consumidores da lista). O WHERE e as contagens continuam derivando do builder único `orders-where.ts` (invariante do redesign 2026-07-10 — sem filtros inline).

### Mudanças por arquivo (`apps/web/src/app/dashboard/orders/`)

| Arquivo | Mudança |
| --- | --- |
| `status-meta.ts` | Remover `lateness: "exclude"` das defs `paid`/`preparing`; mover a def `late` para o fim de `ORDER_FLOW_TABS`; adicionar `LATE_SUB_TABS` (client-safe): `all`/`paid`/`preparing` com labels `Todos`/`Pagos`/`Em preparação`. |
| `_lib/orders-where.ts` | `OrdersWhereFilters.lateStatus?: "paid" \| "preparing"`; em `buildOrdersListConditions`, quando a aba é `late` e há `lateStatus`, estreitar o filtro de status para ele. `foldTabCounts`: linha atrasada soma no bucket `late` **e** no bucket do próprio status (trocar atribuição por `+=`; remover o `continue`); adicionar `late_paid`/`late_preparing` a `OrderTabCounts` e ao `emptyTabCounts`. SQL agregado (`status × is_late`) **não muda**. |
| `schema.ts` | `lateStatus: z.enum(["paid", "preparing"]).optional()` no `ordersListFiltersSchema`. |
| `page.tsx` | Encanar `lateStatus` para `filters`/`pageFilters` apenas quando `activeTab === "late"`. `hasFilters` não considera `lateStatus` (a aba late já é não-default). |
| `data.ts` / `export/` | Encanar `lateStatus` pelos caminhos existentes (`fetchOrdersPage`, export CSV, resumo de produto) — nenhum filtro novo inline. |
| `_components/order-list-filters.tsx` | Renderizar a fileira de pills abaixo da barra de abas somente quando `currentTab === "late"`; cada pill é `<Link>` preservando os demais filtros e setando/limpando `lateStatus`; ativo em âmbar, contagem em mono (`late`, `late_paid`, `late_preparing`). `buildTabHref` **não** propaga `lateStatus` (descarta ao trocar de aba). |
| `_lib/display-state.ts` | `orderBadgeSource` passa a considerar a aba: na aba `late`, fonte é sempre `status` (com comentário da divergência do spec 2026-07-08). |
| `_components/order-card.tsx` | Chip "ATRASADO" ao lado do badge de estado quando `lateness === "late" && tabKey !== "late"`. Chip é flag de atraso, não segundo badge de estado (não viola a regra "nunca dois badges de estado"). |

### Testes

- `__tests__/status-meta.test.ts` — nova ordem de `ORDER_FLOW_TABS`; ausência de `lateness: "exclude"`; `LATE_SUB_TABS`.
- Fold de counts — pedido atrasado soma em `late` **e** no bucket do status; `late_paid`/`late_preparing`; `all_count` inalterado.
- Builder de WHERE — `lateStatus` estreita o status na aba late; ignorado nas demais.

### Verificação (3 provas antes de "pronto")

1. Funcional: `bun verify` (check-types + check + test).
2. Perceptual: smoke visual nas abas Pago / Em preparação / Atrasados (porta 3006) comparando com os mockups aprovados (`.superpowers/brainstorm/152347-1783953346/content/`).
3. Dados: conferir no seed real que os 10 atrasados aparecem em "Pago"/"Em preparação" com chip, que os badges de contagem batem com as listas e que os pills somam 10 (6 pagos + 4 em preparação, conforme estado atual do banco).
