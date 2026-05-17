# Order tem um eixo único de status

O `order` tinha dois campos de estado — `status` (logística) e `paymentStatus` (financeiro) — com `paid` e `refunded` sobrepostos nos dois enums. Decidimos colapsar tudo em **um eixo único** `status`, removendo `paymentStatus`.

Estados e transições:

```
pending_payment  → paid | payment_failed | canceled
payment_failed   → pending_payment | canceled
paid             → preparing | refunded
preparing        → shipped | refunded
shipped          → delivered | refunded
delivered        → returned
returned         → refunded
canceled         (terminal)
refunded         (terminal)
```

Regras:

- `canceled` só é alcançável de estados **não pagos** (`pending_payment`, `payment_failed`) — encerrar um pedido já pago é sempre `refunded`.
- Refund e return são sempre do **pedido inteiro**; não há granularidade parcial. `returnItems[]` só informa a qual filial o estoque de cada item retorna.
- O e-commerce dirige o Order até `paid`; o admin assume de `paid` em diante.

## Considered Options

O modelo convencional de e-commerce separa fulfillment status e payment status em dois eixos ortogonais. Rejeitado: para a operação da Emach, um eixo linear único é mais simples de raciocinar e de exibir. O custo aceito é não representar nuances de pagamento — autorizado-mas-não-capturado, captura parcial.

## Consequences

A coluna `payment_status` e o enum `payment_status` saem numa migration. O enum `order_status` ganha `payment_failed` e `returned`.
