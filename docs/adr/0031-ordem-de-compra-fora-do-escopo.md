# ADR 0031 — Ordem de compra fora do escopo por ora

**Data:** 2026-10-21
**Status:** Aceito
**Relaciona:** ADR-0015 (fornecedor na entrada de estoque), ADR-0007 (débito de estoque no pagamento). Fecha o #451.

## Contexto

A §6 da auditoria (`docs/audits/2026-07-01-auditoria-banco.md`, linha da tabela "Gaps estruturais") apontou que a ordem de compra (purchase order) estava ausente e que nenhum ADR a considerou. A auditoria a tratou como conceito distinto do `supplier_product`, que o ADR-0015 rejeitou, e marcou "Vale re-decidir? Sim". O #451 pediu ao dono adotar ou descartar.

O schema de `packages/db/src/schema/` não tem tabela nem coluna de ordem de compra, quantidade esperada ou prazo de entrega. O estoque só vê a compra depois que a mercadoria chega.

## Decisão

Ordem de compra fica fora do escopo por ora. Nenhuma tabela, coluna, tela ou capability de procurement entra no dashboard. A decisão vale até o sinal de reabertura abaixo.

## O que cobre hoje

- A entrada de estoque é o `stock_movement` com `reason = 'entrada_compra'` (`packages/db/src/schema/stock-movements.ts:18-24`), que o ADR-0015 firmou como único registro de compra recebida.
- O fornecedor é obrigatório na entrada: coluna `supplier_id` (`stock-movements.ts:47-48`) e CHECK `entrada_requires_supplier` (`stock-movements.ts:93-96`).
- A server action de entrada grava `reason: "entrada_compra"` com `supplierId` (`apps/web/src/app/dashboard/stock/actions.ts:203`).
- A relação fornecedor e ferramenta é derivada dessas entradas, sem tabela de vínculo (ADR-0015, Decisão 1).
- O ponto de reposição (`stock_level.reorder_point`, `packages/db/src/schema/inventory.ts:80`) e o mínimo (`min_qty`, `:79`) indicam quando repor. Não geram compra.
- O fluxo de estoque não captura custo (ADR-0015, Decisão 3).

## Opções consideradas

- **Adotar ordem de compra** (entidade com fornecedor, itens, quantidade esperada, prazo e recebimento que gera a `entrada_compra`). Rejeitada por ora. Cria uma segunda origem de dado para o que a entrada já registra. O dono decidiu em 2026-10-21 não adotar agora.
- **Descartar por ora.** Escolhida.

## Consequências

- O #451 fecha sem código. A linha "§6 · ordem de compra" da tabela de status da auditoria passa a "decidido (descartado)".
- Compra em andamento (pedida e não recebida) não aparece no sistema. Quem compra controla isso fora do dashboard.

## Sinal que reabre

Reabrir quando um destes acontecer, e abrir um ADR novo que substitua este:

- o dono precisa ver compra pedida e ainda não recebida (quantidade esperada ou prazo) dentro do dashboard;
- o dono pede relatório de pontualidade ou de divergência entre pedido e recebimento por fornecedor;
- a reposição por `reorder_point` deixa de bastar e a compra passa a ser planejada no sistema.
