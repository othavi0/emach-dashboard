# ADR 0026 — Devolução re-credita estoque com motivo próprio e idempotente

**Data:** 2026-07-01
**Status:** Aceito — estende o ADR-0015 (motivos de movimento de estoque) e o ADR-0007 (débito no pagamento).

## Contexto

O ADR-0007 define que o estoque é **debitado** (`saida_venda`) na transição para `paid`. O caminho inverso — devolver estoque quando um pedido é **devolvido** (`returned`) ou **reembolsado** (`refunded`) — não tem motivo próprio. Os motivos de `stock_movement` (ADR-0015) são `entrada_compra`, `saida_venda`, `ajuste_inventario`, `perda`, `outro`.

Hoje o crédito de devolução (`applyStockReturns`) usa `reason = 'ajuste_inventario'`. A auditoria de 2026-07-01 achou dois problemas:

1. **Conflação no kardex.** Uma devolução de venda fica **indistinguível** de uma recontagem física de inventário no ledger e nos relatórios — duas operações com semântica e causa diferentes viram o mesmo motivo.
2. **Duplo-crédito (P1).** A transição `returned → refunded` é permitida, e **tanto** `updateOrderStatus('returned')` **quanto** `refundOrder()` chamam `applyStockReturns` sobre os itens, **sem guarda de idempotência**. Ao contrário de `saida_venda` (que tem `stock_movement_sale_idempotency`, unique parcial em `order_item_id`), não há nada que impeça creditar o mesmo item duas vezes → estoque fantasma positivo.

## Decisão

1. **Motivo próprio `devolucao_retorno`.** O crédito de estoque por devolução/reembolso usa `reason = 'devolucao_retorno'` (delta **positivo**), separado de `ajuste_inventario` (recontagem física). Como `stock_movement.reason` é `text` tipado só no TS (`StockMovementReason`), sem `pgEnum` — adicionar o valor **não** exige `ALTER TYPE`/`db:sync` (mesma escolha do registry de capabilities, ADR-0017).
2. **Idempotência.** Índice parcial único `stock_movement_return_idempotency` em `order_item_id WHERE reason = 'devolucao_retorno' AND order_item_id IS NOT NULL` — espelha o `stock_movement_sale_idempotency`. `applyStockReturns` passa a ser idempotente: creditar o mesmo `order_item` duas vezes (o caminho `returned → refunded`) é rejeitado pelo banco.

## Opções consideradas

### Manter `ajuste_inventario` + adicionar só a guarda de idempotência — rejeitado

Resolve o duplo-crédito, mas mantém a conflação: devolução continua indistinguível de recontagem no kardex e nos relatórios de fluxo (`getStockFlow`). Meia-solução.

### Motivo próprio `devolucao_retorno` + idempotência — **escolha atual**

Separa contabilmente a devolução da recontagem **e** mata o duplo-crédito. Custo baixo (reason é TS-only).

## Consequências

- `applyStockReturns` passa a usar `devolucao_retorno` e a ser idempotente; fecha o **P1** de duplo-crédito.
- O ledger global de movimentações e `getStockFlow` ganham a categoria "devolução" separada de "ajuste"; a UI de filtro de motivo lista a nova opção.
- Índice parcial vive no schema Drizzle (mantido pelo push) — atenção à armadilha de predicado de partial index (`packages/db/CLAUDE.md`): se o predicado mudar depois, recriar manualmente.
- Superfície compartilhada: o ecommerce não escreve devolução (só `saida_venda`), então não é afetado, mas o valor novo do enum TS entra no sync (ADR-0009).
- **Transferência entre filiais** permanece fora do escopo (ADR-0015) — este ADR só adiciona devolução.
