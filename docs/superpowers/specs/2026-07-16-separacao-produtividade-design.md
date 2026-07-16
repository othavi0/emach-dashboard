# Painel de produtividade de separação (issue #324)

Data: 2026-07-16 · Status: aprovado em brainstorming (mockup visual validado pelo user)

## Problema

As tabelas de picking (`order_picking`, `order_picking_scan`) registram quem separou,
início/fim de cada sessão e cada bipe com timestamp, mas nenhuma query lê esses dados.
A gestão diária do galpão não tem visibilidade de produtividade com o dado já pronto
no banco (auditoria operacional 2026-07-15).

## Decisões (validadas com o user)

| Decisão | Escolha |
| --- | --- |
| Placement | 4ª tab "Produtividade" em `/dashboard/separacao?tab=produtividade` |
| Janela temporal | Fixa: hoje + últimos 7 dias, sem seletor de período |
| Visibilidade | Mesma capability `orders.pick` da página, branch-scoped |
| Unidades separadas | Incluídas (subtexto dos KPIs + coluna na tabela) — ver nota sobre scans abaixo |
| Layout | KPIs no topo + tabela por operador (opção A do mockup) |
| KPI de taxa de exceção | **Removido** dos cards; a taxa aparece só como coluna da tabela por operador |

Mockup aprovado: `.superpowers/brainstorm/41464-1784202765/content/layout-final-v2.html`
(componentes reais do sistema: tabs pill com ativa em coral, KpiCard com ring sutil,
Table text-xs sem moldura de card).

## UI

Nova tab "Produtividade" ao lado de A separar / Em separação / Exceções, sem badge de
contagem (não é fila). O botão "Imprimir lista" do header fica oculto nela (mesma
condição já aplicada à tab `excecoes`).

Conteúdo da tab (Server Component `_components/productivity-panel.tsx`, recebe dados prontos):

1. **Linha de 3 `KpiCard`** (reusa `dashboard/_components/kpi-card.tsx`):
   - "Concluídas hoje" — sub: "N unidades separadas"
   - "Concluídas · 7 dias" — sub: "N unidades separadas"
   - "Tempo médio de sessão" — sub: "últimos 7 dias"
2. **Tabela "Por operador · últimos 7 dias"** (`Table` de `@emach/ui`, padrão
   `customer-orders-infinite.tsx` — sem moldura de card): avatar de iniciais + nome,
   Hoje, 7 dias, Tempo médio, Un. separadas, Exceções (%). Taxa de exceção colorida:
   `text-success` quando baixa (< 5%), `text-warning` quando ≥ 5%, `text-muted-foreground`
   quando 0%.
3. **Estado vazio**: "Nenhuma separação concluída nos últimos 7 dias" quando não há
   sessões finalizadas na janela.

Sem paginação: o universo é o conjunto de operadores ativos na semana (pequeno).
Ordenação da tabela: concluídas em 7 dias, decrescente.

## Dados e queries

Duas funções novas em `separacao/data.ts` (módulo `server-only`, guardado pelo caller
— sem capability própria, padrão ADR-0018). Só leitura agregada; **zero mudança de
schema** e zero toque no hot-path de bipagem.

### `fetchPickingProductivitySummary(scope: BranchScope)`

Uma query `db.execute` com subqueries agregadas:

- **Concluídas hoje / 7 dias**: `COUNT(*)` de `order_picking` com
  `status IN ('completed','exception')` e `completed_at` dentro da janela.
  "Concluída" = sessão finalizada; exceção conta como concluída (o problema dela
  aparece na coluna de exceções da tabela).
- **Unidades separadas hoje / 7 dias**: `SUM(qty_picked)` de `order_picking_item`
  das sessões finalizadas na janela (join por `picking_id`). **Não** contar linhas de
  `order_picking_scan`: re-bipe de item já completo insere scan sem incrementar
  unidade (`actions.ts` `registerScan`, caso `alreadyFull`) — COUNT de scans
  superconta e quebraria o critério de aceite (bater com contagem manual). As
  unidades seguem a janela da sessão (sessão finalizada hoje conta hoje), coerente
  com o KPI de concluídas.
- **Tempo médio de sessão (7 dias)**: `AVG(EXTRACT(EPOCH FROM completed_at - started_at))`
  sobre as sessões finalizadas na janela, em segundos (inteiro no boundary).

### `fetchPickingProductivityByOperator(scope: BranchScope)`

`GROUP BY picker_user_id` sobre sessões finalizadas nos últimos 7 dias:
concluídas hoje (`FILTER (WHERE completed_at >= <hoje>)`), concluídas 7 dias, tempo
médio (segundos), unidades separadas (`SUM(qty_picked)` dos itens das sessões do
grupo), exceções (`COUNT FILTER (WHERE status = 'exception')`) e taxa
(`exception ÷ (completed + exception)`).

`picker_name` é snapshot da sessão: agrupar por `picker_user_id` (quando não-nulo) e
exibir o `picker_name` da sessão mais recente. Sessões com `picker_user_id` nulo
(user deletado) agrupam pelo próprio `picker_name`.

### Regras transversais

- **Janela "hoje"**: início do dia local `America/Sao_Paulo`, calculado no SQL com
  `date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')` convertido de volta a
  timestamptz (ou boundary equivalente calculado em TS com util já testado). Nunca
  meia-noite UTC.
- **Sessões `canceled` e `in_progress` ficam fora de tudo** (nem denominador de taxa).
- **Branch-scoping**: `order_picking.branch_id` direto (a tabela tem a coluna — sem
  JOIN com `order`), reusando `isBlindScope` + a mesma mecânica de fragmento das
  queries existentes do módulo. Escopo cego → zeros/lista vazia (fail-closed).
- **Gotcha `db.execute`**: timestamps chegam como string e colunas em snake_case —
  coercer com `toDate`/`Number` no boundary e usar `AS "camelCase"` (ver
  `packages/db/CLAUDE.md`).
- **Índices**: `order_picking_branch_status_idx (branch_id, status, started_at DESC)`
  cobre as agregações de sessão; itens vêm por `picking_id` (FK indexada via unique
  `order_picking_item_unique`). Sem índice novo; revisar só se aparecer lentidão.

## Integração na página

`page.tsx` passa a aceitar `tab=produtividade`: quando ativa, busca
`fetchPickingProductivitySummary` + `fetchPickingProductivityByOperator` (em
`Promise.all`) e renderiza `<ProductivityPanel>` no lugar de `<PickingQueue>`;
as queries do painel NÃO rodam nas outras tabs (mesmo mecanismo server-side atual).
O type `Tab` local e o clamp de `rawTab` ganham o novo valor. A `PickingQueue`
continua recebendo só as 3 tabs de fila; a barra de tabs exibe as 4 (a de
Produtividade sem `TabsCountBadge`).

`AutoRefresh` da página continua ativo — na tab Produtividade ele re-busca os
agregados (aceitável: leituras baratas e a tela se mantém atual no turno).

## Permissões

Nada novo: `requireCapabilityOrRedirect("orders.pick")` + `getUserBranchScope` já
feitos pela página. Operador vê a própria filial (incluindo colegas); `super_admin`
vê todas. Interpretação da taxa de exceção (mistura qualidade de estoque físico com
comportamento do operador) fica documentada no código.

## Formatação

- Duração: helper puro `formatSessionDuration(seconds)` → "9min", "1h 12min"
  (< 1min → "<1min"). Vive em `_lib/` (testável).
- Percentual: `toLocaleString("pt-BR")` com 1 casa ("4,6%"); 0 exceções → "0%".
- Datas/números seguem `src/lib/format/*` (fuso fixo, tabular-nums).

## Error handling

Queries falham → erro sobe pro error boundary da rota (padrão das demais tabs; sem
try/catch silencioso). Dados vazios não são erro: estado vazio dedicado.

## Testes e verificação

- **Unit** (vitest): `formatSessionDuration`; cálculo de taxa de exceção (0 no
  denominador → 0%); boundary de dia local (se implementado em TS).
- **Critério de aceite da issue**: comparar os números renderizados com queries
  manuais diretas no banco (sessões do dia) — leitura apenas, banco único
  compartilhado, sem seed/mutação.
- **Smoke visual**: `bun dev:web` + navegar nas 4 tabs; conferir dado real renderizado
  (não só layout). `bun verify` (check-types + check + test) antes de commit.

## Fora de escopo

- Seletor de período, gráficos/séries temporais, export.
- Ritmo intra-sessão (scans/min, gaps entre bipes) — dado existe em
  `order_picking_scan`, fica pra iteração futura se a gestão pedir.
- Capability própria pra esconder números de colegas.
