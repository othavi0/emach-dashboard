# ADR 0005 — Order tem um eixo único de status

**Data:** 2026-05-17
**Status:** Aceito
**Relaciona:** ADR-0006 (push-only, schema sync).

## Contexto

O `order` tinha dois campos de estado — `status` (logística) e `paymentStatus` (financeiro) — com `paid` e `refunded` sobrepostos nos dois enums.

## Decisão

Colapsar tudo em **um eixo único** `status`, removendo `paymentStatus`.

Estados e transições:

```
pending_payment  → paid | payment_failed | canceled
payment_failed   → pending_payment | canceled
paid             → preparing | refunded
preparing        → shipped | refunded
shipped          → delivered | returned | refunded
delivered        → returned
returned         → refunded
canceled         (terminal)
refunded         (terminal)
```

Regras:

- `canceled` só é alcançável de estados **não pagos** (`pending_payment`, `payment_failed`) — encerrar um pedido já pago é sempre `refunded`.
- Refund e return são sempre do **pedido inteiro**; não há granularidade parcial. `returnItems[]` só informa a qual filial o estoque de cada item retorna.
- O e-commerce dirige o Order até `paid`; o admin assume de `paid` em diante.
- **`returned` cobre dois casos:** devolução iniciada pelo cliente após entrega (`delivered → returned`) **e** falha de entrega pela transportadora (`shipped → returned`). Não há status separado para falha de entrega — o mesmo `returned` é reaproveitado. O `reason` em `order_status_history` distingue os dois casos na trilha de auditoria.

## Opções consideradas

O modelo convencional de e-commerce separa fulfillment status e payment status em dois eixos ortogonais. Rejeitado: para a operação da Emach, um eixo linear único é mais simples de raciocinar e de exibir. O custo aceito é não representar nuances de pagamento — autorizado-mas-não-capturado, captura parcial.

Fluxo separado de "falha de entrega" (status `delivery_failed`). Rejeitado: a Emach não precisa distinguir a causa do retorno para fins de reprocessamento — em ambos os casos o pedido volta ao centro de distribuição e exige mesma ação (reagendar entrega ou acionar reembolso). Manter um único status `returned` com `reason` descritivo é suficiente e evita ampliar a máquina de estados.

## Consequências

A coluna `payment_status` e o enum `payment_status` foram removidos via `bun db:sync` (schema push-only — ver ADR-0006; não há migration versionada). O enum `order_status` ganhou `payment_failed` e `returned`. A aresta `shipped → returned` foi acrescentada para cobrir falha de entrega sem adicionar novo status.
