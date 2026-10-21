# Auditoria do banco de dados — Emach Dashboard

**Data:** 2026-07-01
**Escopo:** filiais, ferramentas, estoque, fornecedores, movimentações e o ciclo completo de pedidos.
**Banco auditado:** `wrxohbzepoyscsacjzvd` (emach-ferramentas, `sa-east-1`) — o mesmo Supabase que o `.env` local aponta.
**Método:** ground-truth por SQL read-only no banco real + leitura de schema/queries/actions + 8 agentes de auditoria + verificação manual dos P0 no código.

> **Nota de leitura.** Separei rigorosamente **bug/gap real** de **decisão de arquitetura já tomada**. Vários "gaps óbvios" (custo/COGS, catálogo de fornecedor, reserva de estoque, transferência entre filiais) são **não-goals documentados** nos ADR-0007/0015 — estão na §6, não na lista de problemas. Reportá-los como defeito seria erro meu.

---

## 1. Sumário executivo

O núcleo transacional está **sólido e consistente** — a contabilidade de estoque bate no centavo/unidade, o dinheiro dos pedidos fecha 100%, e os invariantes de auth/filial estão respeitados. O que existe de problema é de **dois tipos**:

1. **Dados incompletos** (seu pedido explícito): filiais são cascas sem endereço, fornecedores só têm nome, ferramentas sem NCM, e várias trilhas do ciclo de pedido (reembolso, eventos, NF-e, cupom) nunca foram exercitadas com dado real.
2. **Bugs de código reais** (5 P0 confirmados manualmente): a tabela de reembolso está morta na escrita, a flag de "ocultar variante" não tem efeito no storefront, a exceção de separação trava o fluxo, um caminho de devolução→reembolso credita estoque em dobro, e a NF-e é estruturalmente inemissível.

| Categoria | Qtd | Nota |
|---|---|---|
| **P0** (bug/inviabiliza operação) | 5 | 4 bugs de código + 1 gap estrutural de NF-e — todos verificados |
| **P1** (vira incidente) | 21 | roteamento de filial inoperante, checks monetários ausentes, duplo-crédito, etc. |
| **P2** | 18 | higiene de schema, validações de shape, seed que viola as próprias regras |
| **P3** | 7 | índices, redundância de transportadora, determinismo do PRNG do seed |
| **Candidatos a ADR** | ~10 | reembolso, devolução→estoque, NF-e, conciliação Asaas, LGPD, etc. |

---

## 2. O que está SAUDÁVEL (confirmado por SQL — dá pra confiar)

Isto importa tanto quanto os problemas: prova que o núcleo funciona.

- **Ledger de estoque bate exatamente.** 85 movimentos → 51 `stock_level`; `SUM(delta)` por par (variante×filial) == `stock_level.quantity` em **todos os 51 pares**, 0 órfãos, 0 mismatches.
- **Invariante monetária fecha nos 17 pedidos:** `total = subtotal − desconto + frete` e `Σ line_total == subtotal` em 100%.
- **Timestamps coerentes com status** (paid/shipped/delivered/canceled setados conforme o estágio alcançado).
- **CHECK `entrada_requires_supplier`** respeitado (51 entradas, todas com fornecedor, todas `actor=user`).
- **Fail-closed de filial** satisfeito (todos os 5 usuários têm ≥1 vínculo `user_branch`).
- **Cobertura de estoque completa** (cada variante existe nas 3 filiais) e **1 variante default por tool** em 100%.
- **RLS deny-all** cobre corretamente as tabelas expostas hoje (ADR-0014).

---

## 3. Bugs de código confirmados (P0 / P1)

Todos abaixo foram **verificados por mim diretamente no código** (não só reportados por agente).

### P0-1 · `refund_request` está morta na escrita — reembolso acontece por fora
`refundOrder()` (`orders/actions.ts:543-609`) faz `UPDATE order SET status='refunded'` + `orderStatusHistory`, mas **nunca** insere/atualiza `refund_request`. Grep de INSERT/UPDATE de `refundRequest` em todo `apps/web` = **vazio**. A tab de reembolso é read-only; não existe `approveRefund`/`rejectRefund`/`reviewRefund`. **Consequência:** o ciclo `requested→under_review→approved→refunded|rejected`, o snapshot de valor e o `asaasRefundRef` nunca são gravados — banco confirma `refund_request` com **0 linhas** apesar de 2 pedidos `refunded` + 1 `returned`. Duas fontes da mesma verdade que só podem divergir.

### P0-2 · `tool_variant.visible_on_site` é ignorado pelas queries de catálogo
`queries/tools.ts`: `getTools`, `getToolBySlug` e `searchTools` só filtram `t.visible_on_site` (tool); **nenhuma** filtra `dv.visible_on_site` (variante). Do lado da escrita, `setVariantVisibility` persiste a flag e até emite warning `default_hidden`. **Consequência:** ocultar uma variante no dashboard **não tem efeito nenhum** na loja — ela continua vendável. Bug de correção cross-repo (a loja lê essas queries).

### P0-3 · Exceção de separação trava o fluxo que a UI diz que continua
`separacao/actions.ts::reportMissing` seta `orderPicking.status='exception'` na **sessão inteira**; `scanItem` (linha 197-199) rejeita qualquer scan com `if (picking.status !== 'in_progress') throw`. Mas a UI (`picking-execution.tsx`) mostra "Resolva a exceção e bipe os N restantes para liberar" com o `ScanInput` **habilitado**, e não há ação para reverter `notFound`. **Consequência:** ao reportar 1 item faltante, o operador é bloqueado de bipar o resto — mas a tela promete o contrário. Sessão fica presa (nem completa, pois `isPickingComplete` exige `!notFound` em todos).

### P1 · Duplo-crédito de estoque em `returned → refunded`
A transição `returned→refunded` é permitida (`orders/schema.ts:47`). `updateOrderStatus('returned')` **e** `refundOrder()` chamam ambos `applyStockReturns` sobre os itens, **sem guarda de idempotência** (ao contrário de `saida_venda`, que tem unique index em `order_item_id`). O `RefundDialog` pré-marca `creditStock` quando o pedido já está `returned`. **Consequência:** devolver e depois reembolsar credita o estoque **duas vezes** — estoque fantasma positivo.

### P1 · "Estoque baixo" tem duas definições divergentes
`branches/data.ts::getBranchTableAggregates` conta baixo como `quantity <= minQty AND minQty > 0` — só `minQty`. A regra canônica (`stock-status.ts`, o badge global e o partial index `stock_level_pending_idx`) também considera `reorderPoint > 0 AND quantity <= reorderPoint`. **Consequência:** assim que qualquer item cair na faixa `minQty < qtd ≤ reorderPoint` (o estado mais comum de "hora de repor"), o card de filiais mostra `0` enquanto o resto do sistema mostra alerta.

### P1 · `order.branch_id` (manual) não é reconciliado com `stock_movement.branch_id` (débito real)
`assignBranch` só faz `UPDATE order SET branch_id` — sem checar contra a filial que de fato debitou o estoque. Nada (FK/trigger/CHECK) liga as duas colunas. **Consequência:** reatribuir um pedido para outra filial faz o KPI/atividade da filial divergir silenciosamente do ledger físico. Hoje consistente, mas sem trava.

### P2 · Erros de unique reportados errado + peso de embalagem zerado
- Erro de `unique` em `tool.slug` é sempre reportado como "conflito de SKU" (`tools/actions.ts`).
- `packaging_weight_kg = 0` em **100%** do catálogo, apesar de alimentar o cálculo real de peso de despacho (`weightKg + packagingWeightKg`) → frete subestima a embalagem.

---

## 4. Integridade de dados / riscos latentes

- **`deleteToolVariant` não checa `stock_movement` antes do delete físico** — `variant_id` é `set null`, então o ledger perde a rastreabilidade permanentemente, sem snapshot. Órfã o histórico de auditoria. (P1)
- **`order`/`order_item`/`refund_request` são as únicas tabelas monetárias SEM `CHECK >= 0`** — todas as outras (tools, promotions, shipping, store-settings) têm. `SELECT ... FROM pg_constraint WHERE conrelid='"order"'::regclass AND contype='c'` retorna 0. Nada impede um total/preço negativo por bug de app. (P1)
- **`stock_movement.reason` e outras 2 colunas usam enum só-TS do Drizzle, sem `CHECK`/`pgEnum` no banco** — inconsistente com `tool.status` (que tem CHECK). Escrita fora do app pode gravar reason inválido. (P2)
- **`client.document` (CPF/CNPJ) sem CHECK de tamanho** — escrito por dois apps. (P2)
- **`supplier` não tem unique natural funcional** — o único unique (cnpj parcial) é no-op com cnpj nulo em 100%. Permite fornecedores duplicados por nome. (P2)
- **Devolução/reembolso credita sob `ajuste_inventario`** — indistinguível de recontagem física real no kardex/relatórios. (P2, ligado a ADR)
- **Advisor de performance:** 24 FKs sem índice de cobertura + 12 índices nunca usados (`idx_scan=0`). (P3)

---

## 5. Incompletude de dados — o que falta popular (seu pedido)

**Causa raiz:** o `seed/core.ts` insere filiais **só com `name`**, e `catalog.ts` nunca seta campos fiscais de tool nem contato de fornecedor. Ou seja, o próprio seed produz o banco incompleto. Além disso, o banco **derivou por uso orgânico** (3 sessões de separação reais de "Othavio Quiliao", 2026-06-25/29; pedidos avançados manualmente na UI), então **re-rodar o seed NÃO é opção** — o `TRUNCATE...CASCADE` apagaria esses dados orgânicos.

| Área | Estado | O que falta |
|---|---|---|
| **Filiais** | vazio | endereço completo, telefone, horário, `cep_ranges`, responsável — nas 3 |
| **Fornecedores** | vazio | cnpj, e-mail, telefone, site — nos 6 |
| **Ferramentas** | vazio | `ncm`, `manufacturer_name`, `hs_code` — nos 11 |
| **Roteamento por CEP** | inoperante | sem `cep_ranges` + sem `store_settings.shipping_origin_branch_id` → auto-assign de filial nunca funcionou (provável raiz do "frete fail-open") |
| **Reembolso** | não exercitado | `refund_request` com 0 linhas apesar de refunded/returned |
| **Eventos de pedido** | vazio | `order_event` (tracking/branch_assigned/shipping_reviewed) nunca gravado |
| **NF-e** | vazio | `nfe_*` null nos 17 |
| **Cupom/desconto** | vazio | `discount=0` em 100% apesar de 2 promocodes ativos |
| **Distribuição geográfica** | concentrada | **17/17 pedidos na Matriz-SP**; Campinas e Ribeirão com 0 → branch-scoping de Vendas nunca visto |
| **Role admin** | inexistente | 4 super_admin + 1 user; nenhum `admin` branch-scoped real → ADR-0016 nunca exercitado |
| Clientes/endereços | **ok** | 12 clientes com endereço real completo + consent — bom padrão de referência |

**Plano de população (aditivo, seguro, idempotente)** — detalhado em [§8](#8-plano-de-população). Endereços/CEPs reais das cidades, NCM real por categoria, CNPJ com dígito válido mas **fictício** (não impersonar Bosch/Makita reais).

---

## 6. Gaps estruturais × decisões já tomadas (candidatos a novo ADR)

Aqui está o reenquadramento crítico. **Não são bugs** — são fronteiras de escopo que talvez o negócio já tenha ultrapassado. Cada um é uma **decisão sua**, e é aqui que o `/grill-with-docs` entra.

| Tema | Status hoje | Decisão registrada | Vale re-decidir? |
|---|---|---|---|
| **Custo/COGS, margem, valoração** | ausente | `cost_amount` saiu em limpeza separada (PR #171); o ADR-0015:48 registra que a remoção ficou fora daquela decisão | Só se agora precisar de margem/relatório financeiro |
| **Catálogo de fornecedor `supplier_product`** | ausente | **ADR-0015** rejeitou (2 fontes de verdade) | Não — decisão firme |
| **Ordem de compra (purchase order)** | ausente | *não considerado nos ADRs* | **Sim** — procurement (qtd esperada, prazo) é conceito distinto do catálogo rejeitado |
| **Reserva de estoque (anti-oversell)** | ausente | **ADR-0007** aceitou o risco de oversell | Só se o volume crescer |
| **Transferência entre filiais** | ausente | **ADR-0015** = não-goal explícito | Não |
| **Reembolso: `refund_request` como fonte de verdade** | tabela morta | *nunca decidido* | **Sim — P0.** Ou liga a tabela, ou a remove |
| **Devolução re-credita estoque com reason próprio** | usa `ajuste_inventario` | *não decidido* | **Sim** — separar de recontagem no kardex |
| **NF-e: quem emite + série/chave de acesso** | inemissível | ADR-0008 é sobre Asaas, não NF-e | **Sim — P0** para faturar de verdade |
| **Conciliação de pagamento Asaas** | 2 campos texto | *não decidido* | **Sim** — sem ledger financeiro por pedido |
| **Anonimização LGPD (esquecimento)** | inexistente | gap conhecido (`packages/db/CLAUDE.md`) | **Sim** — antes de produção |
| **Serial/lote/garantia** | ausente | *não decidido* | Talvez — depende do pós-venda |
| **Localização (bin/prateleira)** | ausente | *não decidido* | Talvez — depende do tamanho do armazém |

---

## 7. Recomendação de sequência

1. **Popular o banco** (§8) — direto, seguro, aditivo. Desbloqueia demonstrar filiais/roteamento/reembolso/NF-e e o branch-scoping real. *Maior valor imediato.*
2. **Rascunhar 2-3 ADRs** via `/grill-with-docs` para as decisões que travam os P0: **reembolso** (`refund_request`), **devolução→estoque** (reason próprio) e **NF-e** (emissão + série/chave). Decisão precede o fix.
3. **Corrigir os P0/P1 de código** — como follow-up focado (com smoke visual), já que 2 deles dependem das ADRs acima.

---

## 8. Plano de população

Script novo **aditivo** `packages/db/scripts/enrich-demo.ts` (mantém o guard `--force`, **sem** truncate, transação única, reusa os checks de `verify.ts` antes do COMMIT). Idempotente (`WHERE campo IS NULL`).

1. **Filiais (3 UPDATE):** Matriz — Rua Vergueiro 1000, Vila Mariana, São Paulo/SP, 04101-000; Campinas — Av. Barão de Itapura 3388, Guanabara, 13020-431; Ribeirão — Av. Presidente Vargas 2121, Jardim América, 14020-260. + telefone, horário, `cep_ranges` sem overlap, responsável (super_admin round-robin, exceto o pending).
2. **Fornecedores (6 UPDATE):** cnpj (dígito válido, fictício), e-mail, telefone, site.
3. **Ferramentas (11 UPDATE):** NCM real por categoria (8467.2x elétricas, 8414.80.19 compressor, 8205.20.00 martelo, 8203.20.90 alicate, 6804.22.00 disco) + `manufacturer_name`. CEST deixado null (depende de convênio ICMS — não fingir precisão).
4. **Role admin real (1 UPDATE + 1 DELETE user_branch):** 1 super_admin ativo → `admin` restrito a 2 filiais (mantendo fail-closed + last-super-admin).
5. **Pedidos novos (~6-8 INSERT, tabelas SHARED):** em Campinas/Ribeirão, incluindo `pending_payment` e `paid`, com **preço/nome/endereço reais** (corrige o hardcode do `sales.ts`), debitando estoque e mantendo o ledger.
6. **`refund_request` (3 INSERT):** para os 2 refunded + 1 returned.
7. **`order_event` (~10-15 INSERT):** tracking/branch_assigned/shipping_reviewed.
8. **Cupom (1-2 UPDATE, SHARED):** aplicar BEMVINDO10 preservando a invariante monetária.
9. **NF-e (backfill ~7-8 UPDATE):** número/série/status nos fulfilled; 1 `cancelada` para exercitar o trigger de `order_note`.

**Riscos:** passos 5 e 8 tocam `order`/`order_item`/`stock_movement` (compartilhadas com o ecommerce, ADR-0009) — inserts pontuais de linha são seguros; mudança de shape não. Banco compartilhado sem ambiente isolado.

---

## Apêndice — os 50 achados

> Gerados por 8 agentes; consolidados e priorizados. O finding com título "t" foi descartado (artefato de schema).

A lista bruta dos 50 achados (JSON por domínio, com evidência, impacto e recomendação) não foi guardada. As §3 a §6 consolidam o que dela foi aproveitado.

---

## Adendo A — População aplicada (2026-07-01)

Script aditivo idempotente `packages/db/scripts/enrich-demo.ts` (não trunca; UPDATE `WHERE IS NULL` + INSERT com guardas de existência; VERIFY de ledger/money/fail-closed antes do COMMIT). Aplicado com sucesso — 48 mudanças:

- 3 filiais com endereço real, telefone, horário, `cep_ranges` e responsável.
- 6 fornecedores com CNPJ (dígito válido, fictício), e-mail, telefone, site.
- 11 tools com NCM real por categoria + fabricante.
- 1 super_admin → `admin` branch-scoped real (Matriz+Campinas) — exercita o ADR-0016.
- 6 pedidos novos em Campinas/Ribeirão (incl. `pending_payment`, `paid`, cupom BEMVINDO10, NF-e) com preço/nome/endereço **reais**.
- 3 `refund_request` (2 refunded + 1 returned) · 16 `order_event` · 8 pedidos com NF-e.
- Trigger de NF-e cancelada disparado → 1 `order_note` automático (validado).

Invariantes pós-escrita: ledger de estoque 0 divergências, money 0, fail-closed 0, 2 super_admins ativos.

## Adendo B — Achado novo (durante a população)

**Vocabulário de `nfe_status` diverge em 3 pontas (P2, latente).** O trigger `order_nfe_cancelled_note` (`triggers.sql:111`) dispara só em `nfe_status = 'cancelled'` (grafia britânica, 2 L). Mas o badge do dashboard (`asaas-block.tsx:27-38`, `NFE_STATUS_LABELS`) só reconhecia `canceled`/`cancelada` — **não** `cancelled`. E o contrato de integração (`admin-ecommerce.md:309`) usa `cancelled`. Consequência: se o ecommerce grava `cancelled` (como o contrato manda), o trigger dispara mas o dashboard mostrava o texto cru. **Corrigido** (Adendo C) — badge passou a reconhecer `cancelled`.

## Adendo C — Correções aplicadas (Fase 3)

Todas type-checkam e passam nos testes (48 testes em orders+stock verdes; `check-types` limpo nos dois pacotes).

| Item | Status | O que foi feito |
|---|---|---|
| **ADR-0026** · devolução idempotente | ✅ feito | reason `devolucao_retorno` + índice parcial único `stock_movement_return_idempotency` (aplicado no banco) + `applyStockReturns` idempotente + labels do ledger + testes (4/4). **Mata o duplo-crédito `returned→refunded`** e separa devolução de recontagem no kardex. |
| **ADR-0027** · NF-e schema/gate | ✅ feito | colunas `nfe_series` + `nfe_access_key` (CHECK 44 díg., aplicado) + NCM obrigatório ao ativar tool + badge reconhece `cancelled`. |
| **P0-2** · variante oculta na loja | ✅ feito (núcleo) | `getToolBySlug` filtra `visible_on_site=true` — a página de produto não oferece mais variante oculta. *Nuance:* a listagem (`getTools`/`searchTools`) mostra a variante default; se a default for ocultada (a UI já avisa contra), o card ainda a exibe — fix de "default visível" fica como follow-up (código da loja, exige smoke no repo ecommerce). |
| **P0-1** · reembolso (ADR-0025) | ✅ feito | `refundOrder()` grava `refund_request` (fecha a divergência) **+ workflow acionável**: actions `reviewRefund/approveRefund/rejectRefund` (transições `requested→under_review→approved→rejected`, com guarda de transição válida + capability + lock) e componente `RefundActions` com botões na tab (Analisar/Aprovar/Rejeitar, recusa via `DestructiveActionDialog` com motivo). *Follow-up:* `reasonCategory` no dialog do cliente (hoje default `outro`). |
| **P0-3** · exceção de separação | ✅ feito | `reportMissing` marca só o item `notFound` e mantém a sessão `in_progress` (segue bipando); re-bipar um ausente **limpa** a pendência; `completePicking` aceita finalizar com pendência (→ status `exception`) via `canFinalizePicking`. UI: botão "Finalizar com pendência" + gate atualizado. Testes de picking atualizados (26/26). |

**Aplicado no banco (DDL aditivo):** 2 colunas NF-e + 1 CHECK + 1 índice de idempotência — casando os nomes do Drizzle, então `db:sync` futuro é no-op. Superfície compartilhada (ADR-0009): as colunas de NF-e e o valor de reason `devolucao_retorno` entram no sync CI para o ecommerce.

## Status em 2026-10-15

Esta tabela vale sobre o texto das §3 a §6 e dos adendos. O resto do arquivo é histórico e descreve o banco e o código de 2026-07-01. O status foi conferido no código da `main` em `4ecce97e`. Os itens de dado foram conferidos por `db:read` no banco de hoje, que foi recriado depois do Adendo A, então os números da §2 e da §5 não descrevem mais o banco.

Status possíveis: `resolvido`, `parcial`, `aberto`, `decidido` (fechado por ADR) e `não verificável sem banco`. A coluna Issue aponta para a issue de cada item `aberto` ou `parcial`.

| Item | Status | Evidência | Issue |
|---|---|---|---|
| §3 P0-1 · `refund_request` morta na escrita | resolvido | `apps/web/src/app/dashboard/orders/actions.ts:1046` e `:1055` (`update`/`insert` de `refundRequest`); ADR-0025 | |
| §3 P0-2 · variante oculta na loja | parcial | a PDP filtra `visible_on_site = true` (`packages/db/src/queries/tools.ts:321`). A listagem faz join em `dv.is_default = true` sem filtrar `dv.visible_on_site` em `getTools` (`tools.ts:188` e `:247`) e em `searchTools` (`tools.ts:558`). É o follow-up do Adendo C | #441 |
| §3 P0-3 · exceção de separação trava o fluxo | resolvido | `canFinalizePicking` em `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts:49`; Adendo C | |
| §3 P1 · duplo crédito `returned → refunded` | resolvido | índice `stock_movement_return_idempotency` em `packages/db/src/schema/stock-movements.ts:84`; ADR-0026 | |
| §3 P1 · "estoque baixo" com duas definições | aberto | `apps/web/src/app/dashboard/branches/data.ts:245` conta baixo só por `minQty`, sem `reorderPoint` | #442 |
| §3 P1 · `order.branch_id` sem reconciliação com o ledger | aberto | `assignBranch` (`apps/web/src/app/dashboard/orders/actions.ts:694`) faz `tx.update(order).set({ branchId })` em `:728` sem consultar `stock_movement` | #443 |
| §3 P2 · conflito de `tool.slug` reportado como SKU | aberto | `mapToolMutationError` (`apps/web/src/app/dashboard/tools/actions.ts:60-76`) devolve "SKU já existe para outra variante" para todo `23505` que não seja `tool_variant_barcode_key` | #444 |
| §3 P2 · `packaging_weight_kg = 0` no catálogo | resolvido | `db:read` em 2026-10-15: 0 de 12 tools com `packaging_weight_kg` zero ou nulo | |
| §4 · `deleteToolVariant` sem olhar `stock_movement` | parcial | `apps/web/src/app/dashboard/tools/actions.ts:885` bloqueia com estoque em `stock_level` e com pedido (#335), mas não consulta `stock_movement`. Variante com estoque zerado e histórico ainda é apagada, e o `variant_id` do ledger vira `NULL` (`stock-movements.ts:30-31`, `onDelete: "set null"`) | #445 |
| §4 · `order`/`order_item`/`refund_request` sem `CHECK >= 0` monetário | aberto | os CHECKs de `packages/db/src/schema/orders.ts` são `nfe_access_key_len`, `quantity_positive`, os três `*actor_coherence` e os de picking; nenhum de valor | #446 |
| §4 · `stock_movement.reason` só tipado no TS | aberto | `packages/db/src/schema/stock-movements.ts:39`: `text("reason").$type<StockMovementReason>()` | #446 |
| §4 · `client.document` sem CHECK de tamanho | aberto | `packages/db/src/schema/client.ts:32`: só `.unique()`. O formato aceito depende do #412 (CNPJ alfanumérico) | #446 |
| §4 · `supplier` sem unique natural | aberto | `packages/db/src/schema/tools.ts:55`: só `supplier_cnpj_unique_when_present` | #447 |
| §4 · devolução credita como `ajuste_inventario` | resolvido | reason `devolucao_retorno` (`stock-movements.ts:22`); ADR-0026 | |
| §4 · FKs sem índice e índices sem uso | aberto | `db:read` em 2026-10-15 no catálogo do Postgres: 32 FKs sem índice que comece pelas colunas da FK e 13 índices não únicos com `idx_scan = 0`. O tráfego do banco é baixo, então `idx_scan = 0` é sinal fraco. O advisor do Supabase não foi rodado | #448 |
| §5 · dados incompletos (filiais, fornecedores, NCM, roteamento por CEP, reembolso, eventos, NF-e, cupom, distribuição, role admin) | parcial | o Adendo A preencheu o banco de 2026-07-01, mas o banco foi recriado depois. `db:read` em 2026-10-15: 1 filial com endereço e sem `cep_ranges`, 1 fornecedor com CNPJ, NCM em 11 de 12 tools, `store_settings.shipping_origin_branch_id` preenchido, 1 `admin`, 2 pedidos numa filial só, 0 `refund_request`, 0 `order_event`, 0 pedido com NF-e e 0 com desconto. É estado do seed, não defeito de código | #449 |
| §6 · custo/COGS | decidido | coluna removida no PR #171 (`d8c10be6`); ADR-0015:48 | |
| §6 · catálogo de fornecedor `supplier_product` | decidido (rejeitado) | ADR-0015 | |
| §6 · ordem de compra | aberto (sem decisão) | nenhum ADR | #451 |
| §6 · reserva de estoque contra oversell | decidido (risco aceito) | ADR-0007 | |
| §6 · transferência entre filiais | decidido (fora de escopo) | ADR-0015:49 | |
| §6 · reembolso com `refund_request` como fonte de verdade | decidido | ADR-0025; implementado (P0-1) | |
| §6 · devolução com reason própria | decidido | ADR-0026; implementado (`devolucao_retorno`) | |
| §6 · NF-e | decidido | ADR-0027, com a emenda de 2026-07-28 que suspende o gate de NCM | |
| §6 · conciliação Asaas | decidido, implementação adiada | ADR-0028 | |
| §6 · anonimização LGPD | parcial | ADR-0029 (design). O ecommerce tem `db:anonymize-client` (`packages/db/scripts/anonymize-client.ts` daquele repo). O dashboard não tem `anonymizeClient` nem a capability `customers.anonymize` | #450 |
| §6 · serial, lote e garantia | aberto (sem decisão) | nenhum ADR | #452 |
| §6 · localização (bin/prateleira) | aberto (sem decisão) | nenhum ADR | #452 |
| Adendo B · vocabulário de `nfe_status` | resolvido | `apps/web/src/app/dashboard/orders/[id]/_components/asaas-block.tsx:19` e `:33` reconhecem `cancelled` | |
