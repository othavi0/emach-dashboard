# ADR 0029 — Anonimização LGPD (direito ao esquecimento) preservando histórico fiscal

**Data:** 2026-07-01
**Status:** Aceito (design) — estende o ADR-0011 (audit log sobrevive ao delete). Implementação **a fazer antes de produção**.

## Contexto

Existe **export** de dados do cliente (`client_export_log` + `dashboard/customers/export/`), mas **não há anonimização** — nenhum script nem action para o "direito ao esquecimento" da LGPD. A auditoria de 2026-07-01 (e o `packages/db/CLAUDE.md`) marcam isso como gap conhecido, obrigatório antes de produção.

Um `hard delete` do cliente não é viável: `order.client_id` é `ON DELETE restrict` (um cliente com pedidos não pode ser apagado), e apagar histórico de pedido quebraria a obrigação fiscal/contábil de retenção.

## Decisão

**Direção e contrato registrados; implementação antes de produção.** Uma operação `anonymizeClient(clientId)` que **substitui os dados pessoais por tombstones**, preservando os pedidos:

- **Scrub em `client`:** `name → 'Cliente anonimizado'`, `email → anon+<id>@anonimizado.local`, `phone/document/image/internal_notes → null`, `status → 'blocked'`. `client_address` do cliente é apagado (cascade natural) ou tombstoneado.
- **Pedidos preservados:** `order`/`order_item` **não** são tocados — já carregam **snapshots desnormalizados** (`shipping_address` no `order`, nome/sku/ncm/preço no `order_item`), então o histórico fiscal sobrevive sem PII viva vinculada. O `shipping_address` snapshot é scrubbed (nome/rua) mantendo cidade/UF/CEP para estatística agregada.
- **Auditoria:** registra em `client_audit_log` (ator + timestamp), operação **irreversível**, gated por capability (`customers.anonymize`, nova).
- Sessões/contas do cliente (`client_session`/`client_account`) são revogadas.

## Opções consideradas

### Hard delete do cliente — rejeitado

Impossível sem violar `order.client_id` (restrict) e a retenção fiscal dos pedidos. Cascatear apagaria histórico obrigatório.

### Não fazer nada (só export) — rejeitado

Descumpre a LGPD; bloqueia produção.

### Anonimizar preservando pedidos — **escolha atual**

Atende o direito ao esquecimento (PII sai) sem quebrar integridade fiscal (pedidos ficam, desnormalizados e scrubbed). Coerente com o ADR-0011 (o registro de auditoria sobrevive ao "delete").

## Consequências

- **Sem código agora** (decisão de design); implementar `anonymizeClient` + capability `customers.anonymize` + UI antes de produção.
- Depende de os snapshots de `order`/`order_item` serem suficientes — a auditoria confirmou que são (nome/sku/ncm/preço/endereço já desnormalizados).
- Irreversível e auditada; considerar confirmação forte na UI (padrão `DestructiveActionDialog` com reason).
- O `client_export_log` continua sendo o outro lado do direito do titular (portabilidade).
