# Fluxo de separação em Pedidos — bulk, terminologia, atraso, responsável e tab Separado

**Data:** 2026-07-11 · **Status:** aprovado (brainstorm com mockups no visual companion)

## Contexto

A listagem de Pedidos tem seleção em massa só para exportar CSV. Mover um pago
para a etapa seguinte é um a um (via `startPicking` na Separação ou detalhe do
pedido). No banco de hoje: 5 pagos (fixtures `EM-TEST-*`, 3 com +72h) e 6
`EM-2026-*` em `preparing` — **todos os 6 na tab Atrasados**, porque a régua de
atraso conta de `paid_at` (junho) mesmo para quem já está em separação. A tab
"Em preparação" renderiza vazia. O responsável pela separação já é persistido
(`order_picking.picker_name`) mas não aparece nos cards.

Decisões tomadas uma a uma na entrevista; mockups em escala real (card de
785px medido no dashboard) validaram badge e tabs.

## Decisões

### 1. Terminologia — "separação" como termo único (só UI)

O enum `order_status` do banco compartilhado **não muda** (`preparing`
permanece; contrato com o ecommerce, ADR-0004). Só labels do dashboard:

| Conceito | Antes | Depois |
| --- | --- | --- |
| Status `preparing` (badge, tabs, histórico, KPIs, copy "Em preparação há") | Em preparação | **Em separação** |
| Fulfillment `picking_in_progress` | Em separação | **Separando** |
| Fulfillment `awaiting_picking` / `picked` / `picking_exception` | A separar / Separado / Exceção na separação | inalterados |
| Página Separação: tab e KPI `em_separacao` | Em separação | **Separando** (a key `em_separacao` da URL não muda) |

Resolve a colisão que o spec 2026-07-08 evitava: o macro-status usa
"Em separação"; a sessão de bipagem ativa usa "Separando".

### 2. Ação em massa "Enviar para separação"

- Nova ação na `BulkActionBar` de Pedidos, ao lado de "Exportar CSV".
  Aparece quando a seleção contém ≥1 pedido `paid` (o client conhece
  `item.status`).
- Server action `bulk` (nome final no plano): mesma capability da transição
  individual de status. Por pedido, em transação própria:
  `lockOrderAndAuthorize` → exige `status='paid'` **e** `branchId` não-nulo →
  `status='preparing'`, `preparingAt=now()` → insere `orderStatusHistory`
  (`actorType:'user'`, `actorUserId` da sessão).
- Resultado `{ moved, skipped: [{id, number, reason}] }`; toast
  "X enviados para separação · Y pulados (sem filial / status mudou)".
- Pedidos movidos caem na fila "A separar" da página Separação (preparing sem
  sessão — comportamento já existente). O bulk **não** cria sessão de picking
  nem define responsável.

### 3. Régua de atraso por etapa

- `preparing`: atraso conta de `COALESCE(preparing_at, paid_at, created_at)`
  (era `COALESCE(paid_at, created_at)`). `paid` não muda.
- Aplicar nos dois lados da fonte única: condições SQL em
  `_lib/orders-where.ts` (tabs/counts/export) e `latenessOf`/`_lib/lateness.ts`
  (borda warning do card). Limiares 48/72h inalterados.
- Rodapé do card nas tabs de separação passa a mostrar "Em separação há X"
  (base `preparingAt`) em vez de "Pago há X" (`_lib/age-meta.ts`).
- **Saneamento one-off** (executar com confirmação do user na hora, banco
  compartilhado): `UPDATE "order" SET preparing_at = now() WHERE status =
  'preparing'` — atinge exatamente os 6 `EM-2026-*`, que saem de Atrasados.
  `paid_at` não é tocado (dado financeiro visível ao cliente). Sem script
  versionado; SQL documentado aqui.

### 4. Responsável no badge do card (mockup B)

- Quando o badge do card vem do eixo fulfillment e há sessão relevante, o
  label compõe estado + nome: **"SEPARANDO · OTHAVIO QUILIAO"**,
  **"SEPARADO · OTHAVIO QUILIAO"**, **"EXCEÇÃO · OTHAVIO QUILIAO"** (forma
  curta "Exceção" no badge composto).
- "A separar" nunca mostra nome (não há responsável ainda).
- Vale para os cards de Pedidos e da fila de Separação. Fonte:
  `picker_name` da **última** sessão (`order_picking`, `started_at DESC`) —
  a listagem de Pedidos precisa selecionar `picker_name` junto do
  `fulfillmentState` que já deriva.

### 5. Tab "Separado" top-level em Pedidos (mockup A)

- Barra de fluxo: Todos · Pago · **Em separação** · **Separado** · Atrasados ·
  Enviados · Entregues (+ exceções à direita, inalteradas).
- "Separado" é computada, como Atrasados: `status='preparing'` **e** última
  sessão de picking `completed`. "Em separação" passa a excluir esses
  (`status='preparing'` e última sessão ≠ `completed`) — sem duplicação.
- Lateness segue exclusiva e vence: separado ou em separação com +72h (régua
  nova) aparece só em Atrasados. `lateness: "exclude"` na tab Separado.
- A condição "última sessão completed" entra no filter-builder único
  (`buildOrdersListConditions`) — tabs, counts, CSV e resumo de produto ficam
  consistentes de graça.
- A página Separação **não** ganha 4ª tab; segue A separar · Separando ·
  Exceções.

## Fora de escopo

- Enum/colunas do banco, app ecommerce, transições além de `paid→preparing`.
- Envio em massa (código de rastreio é por pedido; `ship_forced` continua
  exclusivo de super_admin).
- Tab "Separados" na página Separação.
- Religar obrigatoriedade individual de atributos e demais pendências não
  relacionadas.

## Dados de referência (11/07, banco real)

| Grupo | Qtd | Nota |
| --- | --- | --- |
| `paid` sem sessão | 5 | fixtures `EM-TEST-900x`; 3 com +72h |
| `preparing` + sessão cancelada | 1 | vira "A separar" |
| `preparing` + sessão `completed` | 2 | tab Separado = 2 no dia 1 |
| `preparing` + sessão `in_progress` | 3 | "Separando", paradas desde ~20/06 |

Picker único até aqui: "Othavio Quiliao".

## Verificação

- `bun verify` (check-types + check + test) e testes novos de
  `orders-where`/tabs (Separado computada, exclusões mútuas, régua nova).
- Smoke no browser (dev `:3007`): contagens das tabs batendo com o SQL acima;
  bulk em 2+ pagos → toast com moved/skipped e cards na fila A separar;
  badge composto com nome; pós-saneamento, Atrasados sem os `EM-2026-*`;
  página Separação com "Separando".
- `bun run build` se algum `actions.ts` for refatorado (regra `"use server"`).
