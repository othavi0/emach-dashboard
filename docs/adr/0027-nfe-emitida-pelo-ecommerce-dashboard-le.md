# ADR 0027 — NF-e é emitida pelo ecommerce/Asaas; o dashboard só lê

**Data:** 2026-07-01
**Status:** Aceito — estende o ADR-0004 (integração DB-only) e o ADR-0008 (documentos Asaas via DB).

## Contexto

O `order` tem os campos `nfe_number`, `nfe_url`, `nfe_xml_url`, `nfe_status`, mas a auditoria de 2026-07-01 confirmou que a NF-e é **estruturalmente inemissível de forma compliant**:

- **Faltam campos obrigatórios:** não há **série** (toda NF-e tem número + série) nem **chave de acesso** de 44 dígitos (obrigatória para consulta/cancelamento na SEFAZ).
- **Sem writer:** nenhuma action, cron ou integração no dashboard preenche esses campos.
- **NCM nulo em 100% das tools** (corrigido na população de 2026-07-01) — sem NCM não se monta o XML item a item.
- **Vocabulário divergente:** o trigger `order_nfe_cancelled_note` dispara em `nfe_status='cancelled'`, mas o badge do dashboard só reconhece `canceled`/`cancelada`, e o contrato de integração usa `cancelled` — três grafias.

Precisamos decidir **quem emite** a NF-e e firmar o schema mínimo.

## Decisão

1. **A emissão fiscal ocorre no lado ecommerce/provedor (Asaas).** O ecommerce (ou o provedor via webhook do ecommerce) emite a nota e **grava os campos fiscais no `order`** via banco compartilhado. O dashboard **só lê e exibe** — coerente com o ADR-0004 (integração é DB-only; o dashboard não chama API externa) e o ADR-0008 (documentos do Asaas chegam pelo banco).
2. **Schema fiscal completo.** Adicionar ao `order`: `nfe_series` (text) e `nfe_access_key` (text, 44 dígitos — CHECK de tamanho quando presente).
3. **NCM obrigatório ao ativar tool.** O `toolFormSchema.superRefine` passa a exigir `ncm` preenchido quando `status='active'` (espelha o gate de imagens/specs). Rascunho fica livre.
4. **Vocabulário único de `nfe_status`.** Uma constante compartilhada (`authorized`/`pending`/`cancelled`/`rejected`) alinha trigger, badge e contrato; o badge passa a reconhecer `cancelled`.

## Opções consideradas

### Dashboard emite (ação manual de staff) — rejeitado

Staff acionaria a emissão no dashboard via integração fiscal (Focus NFe, NFe.io, etc.). Dá mais controle operacional, mas **quebra o princípio do ADR-0004** (o dashboard passaria a chamar API externa e a carregar credencial fiscal), e duplica responsabilidade com o ecommerce que já fala com o Asaas.

### Só firmar o schema agora, decidir o emissor depois — parcial

Adiciona `nfe_series`/`nfe_access_key` + NCM-gate, mas deixa o "quem emite" em aberto. Rejeitado como decisão final por deixar a lacuna operacional que originou o achado; incorporado como o **passo de schema** desta decisão.

## Consequências

- Schema change (`nfe_series`, `nfe_access_key`) coordenado com o ecommerce (ADR-0009) — é ele quem escreve.
- NCM-gate exige que toda tool ativa tenha NCM; backfill já feito na população de 2026-07-01.
- O badge de `nfe_status` passa a reconhecer `cancelled` (fecha o achado de vocabulário de 3 pontas).
- O dashboard permanece **leitor**: nenhuma credencial fiscal vive aqui.
- Enquanto a emissão real não existe, os campos ficam nulos em pedidos novos (estado honesto) — a demo de 2026-07-01 tem NF-e mocada só para exercitar a UI e o trigger.
