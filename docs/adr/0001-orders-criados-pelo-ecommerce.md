# ADR 0001 — Orders são criados apenas pelo site e-commerce

**Data:** 2026-05-17
**Status:** Aceito
**Relaciona:** ADR-0004 (integração só DB compartilhada).

## Contexto

O dashboard admin compartilha o banco Postgres com o site e-commerce. Precisamos decidir quem pode criar um **Order**: só o site, ou também o admin (venda B2B ou por telefone, pedido manual)?

## Decisão

A criação de **Order** pertence exclusivamente ao site — o admin apenas progride o ciclo de vida do pedido (status, rastreio, notas, filial de fulfillment). Manter um único ponto de origem evita divergência das regras de carrinho, precificação e débito de estoque entre os dois apps.

## Consequências

- Descartamos dar ao admin a criação de pedido. Reabrir essa decisão exige replicar essas regras no admin — não é uma mudança barata.
