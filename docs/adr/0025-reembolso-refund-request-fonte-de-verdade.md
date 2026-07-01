# ADR 0025 — `refund_request` é a fonte de verdade do reembolso

**Data:** 2026-07-01
**Status:** Aceito
**Relaciona:** ADR-0005 (eixo único de status), ADR-0008 (documentos Asaas via DB), ADR-0009 (sync schema com o ecommerce).

## Contexto

A tabela `refund_request` existe no schema com um ciclo de vida completo (`requested → under_review → approved → refunded | rejected`), snapshot de valor (`amount`), vínculo com o Asaas (`asaas_refund_ref`), categorização de motivo (`refund_reason`) e um índice parcial garantindo **no máximo 1 solicitação ativa por pedido** (`refund_request_one_open_per_order`).

Na prática, porém, a tabela está **morta na escrita**. A auditoria de 2026-07-01 confirmou:

- `refundOrder()` (`orders/actions.ts`) faz `UPDATE order SET status='refunded'` + `order_status_history`, mas **nunca** insere ou atualiza `refund_request`.
- Não existe nenhuma action `approveRefund` / `rejectRefund` / `reviewRefund` em todo o `apps/web` — a busca por escritas em `refundRequest` retorna vazio.
- A tab de reembolso do pedido é **read-only**.
- Resultado: 0 linhas em `refund_request` apesar de pedidos com `status='refunded'`/`'returned'`.

O reembolso acontece **por fora** da tabela criada para modelá-lo. São duas fontes da mesma verdade (o `status` do pedido e a tabela de solicitação) que só podem divergir.

## Decisão

**`refund_request` é a fonte de verdade do ciclo de reembolso.** Toda solicitação e execução de reembolso passa pela tabela; `order.status = 'refunded'` é uma **consequência derivada**, não o registro primário.

1. **Criação da solicitação.** Uma solicitação nasce em `refund_request` — pelo cliente no ecommerce (`status='requested'`) ou pelo staff no dashboard. O índice parcial `refund_request_one_open_per_order` já impede duas solicitações ativas simultâneas.
2. **Workflow de staff.** Adicionar as actions `reviewRefund` (→ `under_review`), `approveRefund` (→ `approved`) e `rejectRefund` (→ `rejected`, exige `rejection_reason`), todas com `requireCapability('orders.refund')` e `lockOrderAndAuthorize`.
3. **Execução.** `refundOrder()` passa a **atualizar** a `refund_request` para `status='refunded'` (setando `resolved_at`, `asaas_refund_ref`) **na mesma transação** em que grava `order.status='refunded'` + `order_status_history` + (opcional) o crédito de estoque de devolução (ADR-0026). O crédito ao cliente no Asaas é registrado via `asaas_refund_ref`.
4. A tab de reembolso vira **acionável** (aprovar/rejeitar/reembolsar) conforme o estado.

## Opções consideradas

### Remover `refund_request` — rejeitado

Tratar reembolso como uma simples transição de status (`order.status='refunded'` + `reason` no history) e dropar a tabela e os enums `refund_reason`/`refund_status`. Mais simples, mas **perde o workflow de aprovação** (um reembolso de e-commerce passa por análise antes de devolver dinheiro) e o vínculo estruturado com o Asaas. Descarta modelagem já pronta e correta.

### Ligar `refund_request` como fonte de verdade — **escolha atual**

Aproveita o schema existente, dá um fluxo auditável de aprovação e um ponto único para o `asaas_refund_ref`. O `status` do pedido deriva do estado da solicitação.

## Consequências

- Novas actions de staff (`reviewRefund`/`approveRefund`/`rejectRefund`) + `refundOrder()` reescrita para gravar a tabela. Fecha o **P0** da auditoria.
- O ecommerce pode criar `refund_request` (cliente solicita reembolso) — a escrita nessa tabela entra na superfície compartilhada (ADR-0009); coordenar.
- A idempotência de "1 reembolso ativo por pedido" já é garantida pelo índice parcial — não duplicar em código.
- Migração de dados: pedidos já `refunded`/`returned` sem `refund_request` recebem backfill (feito na população de 2026-07-01, `enrich-demo.ts`).
