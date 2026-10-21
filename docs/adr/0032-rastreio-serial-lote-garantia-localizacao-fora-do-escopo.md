# ADR 0032 — Rastreio por serial, lote, garantia e localização fora do escopo por ora

**Data:** 2026-10-21
**Status:** Aceito
**Relaciona:** ADR-0015 (estoque é por variante e filial), ADR-0026 (devolução re-credita por quantidade). Fecha o #452.

## Contexto

A §6 da auditoria (`docs/audits/2026-07-01-auditoria-banco.md`) listou duas linhas sem decisão: "Serial/lote/garantia" (vale re-decidir "Talvez — depende do pós-venda") e "Localização (bin/prateleira)" (vale re-decidir "Talvez — depende do tamanho do armazém"). O #452 as agrupou e pediu ao dono adotar ou descartar cada uma.

O schema de `packages/db/src/schema/` não tem coluna ou tabela de número de série, lote, garantia nem localização no armazém. O estoque é uma contagem: `stock_level` tem chave `(variant_id, branch_id)` e o campo `quantity` (`packages/db/src/schema/inventory.ts:69-87`). O ledger `stock_movement` grava `delta` por variante e filial, sem identificar a unidade física.

## Decisão

Ficam fora do escopo por ora, os quatro:

- rastreio por número de série;
- rastreio por lote;
- garantia (prazo e vínculo com a unidade vendida);
- localização no armazém (bin ou prateleira).

O estoque continua sendo quantidade por variante e filial. Nenhuma tabela, coluna ou tela nova entra.

## O que cobre hoje

- Quantidade por variante e filial em `stock_level.quantity` (`inventory.ts:78`), com histórico em `stock_movement` e motivos `entrada_compra`, `saida_venda`, `ajuste_inventario`, `devolucao_retorno`, `perda` e `outro` (`stock-movements.ts:18-24`).
- Proveniência da compra por fornecedor na entrada (ADR-0015), que identifica a origem de cada recebimento, não de cada unidade.
- Devolução por pedido, com crédito idempotente por `order_item_id` (índice `stock_movement_return_idempotency`, `stock-movements.ts:84`, ADR-0026).
- A filial é a única granularidade de local (`stock_level.branch_id`).

## Opções consideradas

- **Adotar os quatro.** Rejeitada por ora. Série e lote mudam o modelo de estoque de contagem para unidade identificada, o que atinge `stock_level`, o débito do ADR-0007, a devolução do ADR-0026 e o schema compartilhado com o ecommerce (ADR-0009). O dono decidiu em 2026-10-21 não adotar agora.
- **Adotar só localização.** Rejeitada por ora. A auditoria a condicionou ao tamanho do armazém, e a decisão do dono de 2026-10-21 é descartar por ora.
- **Descartar por ora.** Escolhida.

## Consequências

- O #452 fecha sem código. As linhas "§6 · serial, lote e garantia" e "§6 · localização (bin/prateleira)" da tabela de status da auditoria passam a "decidido (descartado)".
- Recall por lote, busca por número de série e prazo de garantia não existem no sistema.
- Adotar qualquer um depois muda schema compartilhado e segue o expand-contract do ADR-0030.

## Sinal que reabre

Reabrir o item correspondente, com ADR novo que substitua este, quando acontecer um destes:

- **Serial, lote ou garantia:** o pós-venda precisa identificar a unidade vendida (reclamação de garantia, recall) ou o fabricante exige rastreio por lote;
- **Localização:** o armazém passa a ter mais de uma área por filial e a separação perde tempo procurando o item, ou a contagem de inventário exige endereço.
