# ADR 0007 — Débito de estoque ocorre na transição para `paid`, não na criação do pedido

**Data:** 2026-05-18
**Status:** Aceito
**Relaciona:** ADR-0005 (eixo único de status), ADR-0006 (push-only).

## Contexto

Todo pedido nasce com status `pending_payment` — o cliente iniciou a compra mas o pagamento ainda não foi confirmado. Entre a criação do pedido e a confirmação do pagamento pode haver minutos ou horas (gateway aguardando, PIX pendente, cartão em análise). Precisamos decidir quando o estoque é decrementado: na criação do pedido ou na confirmação do pagamento.

## Decisão

O débito de estoque — decremento de `stock_level.quantity` e inserção em `stock_movement` com `reason = 'saida_venda'` — ocorre **somente quando o pedido transita para `paid`**.

Um pedido em `pending_payment` ou `payment_failed` **não reserva estoque** de nenhuma forma.

## Opções consideradas

### Reservar estoque na criação (`pending_payment`)

Decrementar `stock_level` no INSERT do pedido e restaurar se o pagamento não for confirmado.

Rejeitado pelos seguintes motivos:
- Pedidos abandonados (o cliente cria e nunca paga) travem estoque real, impedindo vendas que aconteceriam.
- Cancelar um pedido não pago exigiria estorno de estoque — lógica adicional e fonte de divergência se o rollback falhar.
- O volume de pedidos não pagos (carrinhos iniciados, PIX expirados) pode ser significativamente maior que pedidos confirmados; o impacto no estoque disponível seria proporcional.
- O modelo de "reserva" implica TTL de reserva e cleanup periódico — complexidade que não traz benefício operacional real para a Emach.

### Débito no pagamento (`paid`) — **escolha atual**

Mantém o estoque disponível para outros compradores enquanto o pagamento está pendente. Não requer lógica de rollback em cancelamentos de pedidos não pagos. O CHECK `quantity >= 0` em `stock_level` é a guarda final contra oversell.

## Consequências

- Cancelar um pedido em `pending_payment` ou `payment_failed` **não gera nenhuma entrada em `stock_movement`** — não há estoque a devolver.
- O e-commerce, ao confirmar o pagamento e gravar status `paid`, deve também decrementar `stock_level` e inserir `stock_movement` por item. Ver `docs/integration/admin-ecommerce.md`.
- O partial unique index `stock_movement_sale_idempotency` (`UNIQUE` em `order_item_id WHERE reason = 'saida_venda'`) garante idempotência: um segundo disparo do mesmo evento de pagamento não gera duplo débito.
- Em cenário de oversell (dois compradores confirmam pagamento pelo último item quase simultaneamente), o CHECK `quantity >= 0` rejeita o segundo UPDATE — o gateway precisa tratar o conflito (cancelar o segundo pedido e estornar). Esse cenário é raro mas possível; aceito para o estágio atual.
