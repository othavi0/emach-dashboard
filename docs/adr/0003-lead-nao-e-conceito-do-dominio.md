# ADR 0003 — Lead não é um conceito do domínio

**Data:** 2026-05-17
**Status:** Aceito

## Contexto

O schema de `consent_log` antecipa um ator `lead` (valor do enum `consent_actor`, coluna `leadId`, parte do CHECK de coerência), sugerindo a captura de contatos pré-cadastro — newsletter, orçamento, carrinho abandonado.

## Decisão

**Lead não é um conceito do domínio**: todo contato que importa é um Client registrado, com conta e histórico. Os artefatos de schema relativos a `lead` são código morto e devem ser removidos numa migration (o enum `consent_actor` deixa de existir ou colapsa em só `client`).

## Consequências

- Reabrir essa decisão significaria reintroduzir uma entidade pré-conta inteira — não é uma mudança barata.
