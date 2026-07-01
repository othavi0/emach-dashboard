# ADR 0028 — Conciliação financeira Asaas via ledger de transações (design; implementação adiada)

**Data:** 2026-07-01
**Status:** Aceito (design) — estende o ADR-0008 (documentos Asaas via DB). Implementação **adiada** até o Asaas real entrar.

## Contexto

Todo o ciclo financeiro de um pedido é representado por **dois campos texto** no `order`: `payment_method` e `payment_provider_ref`. Não há registro dos **eventos** do provedor (pagamento criado, confirmado, estornado, chargeback, falha), nem um ponto de conciliação entre o que o Asaas diz e o que o dashboard mostra. A auditoria de 2026-07-01 marcou isso como gap pré-produção.

O pagamento Asaas ainda é um **stub** (a rota `/pagar` não integra de verdade). Modelar agora o ledger completo seria construir sobre uma integração que não existe.

## Decisão

**Direção registrada; implementação adiada.** Quando o Asaas real entrar, introduzir uma tabela `payment_transaction` como ledger append-only, alimentada por webhook idempotente:

- Colunas mínimas: `id`, `order_id` (FK), `asaas_id` (idempotência do evento), `event_type` (`created`/`confirmed`/`received`/`refunded`/`chargeback`/`failed`), `amount` (`numeric(12,2)`), `status`, `raw` (`jsonb` do payload), `created_at`.
- O **estado de pagamento do pedido deriva do ledger** (o campo `order.status` continua sendo o eixo único — ADR-0005 — mas a transição para `paid`/`refunded`/`payment_failed` passa a ter proveniência auditável).
- O webhook segue o padrão de idempotência dos crons (`apps/web/CLAUDE.md` §Cron): transação por evento com `FOR UPDATE` + re-check + `asaas_id` único.

## Opções consideradas

### Só adicionar campos estruturados no `order` (ex.: `paid_amount`, `asaas_payment_id`) — rejeitado

Modela um único evento por pedido. Não representa a sequência real (confirmado → estornado → chargeback), que é exatamente o que a conciliação precisa ver.

### Manter os 2 campos texto — rejeitado

É o estado atual; não concilia nada e esconde estornos/chargebacks.

### Ledger `payment_transaction` alimentado por webhook — **escolha atual (direção)**

Modela a sequência de eventos, dá conciliação e proveniência, e reusa o padrão de webhook idempotente já estabelecido. Só não se implementa agora porque depende do Asaas real.

## Consequências

- **Nenhum código agora.** Este ADR fixa a direção para evitar decisões ad-hoc quando a integração chegar.
- Ao implementar: tabela nova + rota de webhook autenticada + coordenação com o ecommerce (quem recebe o webhook do Asaas — ADR-0004/0009).
- Relatórios financeiros (margem, recebido × faturado) passam a ter fonte; hoje não têm (agravado por não haver COGS — decisão separada, ADR-0015).
