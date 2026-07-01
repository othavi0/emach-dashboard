# Métricas de carrinho por ferramenta (15/30/90 dias)

- **Data:** 2026-07-01
- **Status:** aprovado (brainstorm com mockups no visual companion)
- **Origem:** sugestão de reunião — exibir no admin quantas vezes cada ferramenta
  é adicionada ao carrinho na loja, nas janelas de 15, 30 e 90 dias.

## Objetivo

Dar ao time do dashboard um sinal de demanda comercial por produto: adições ao
carrinho no ecommerce, visíveis na listagem de ferramentas e no detalhe de cada
ferramenta. A captura é feita pelo app ecommerce (repo separado, banco
compartilhado — ADR-0004); este spec cobre o lado dashboard + o contrato, e uma
issue no repo do ecommerce instrui a implementação de lá.

## Decisões tomadas (com o usuário)

| Decisão | Escolha |
| --- | --- |
| Unidade de contagem | Cada clique de "adicionar ao carrinho" = 1 evento (sem dedup; sessão gravada permite dedup futura em query) |
| Modelo de dado | Eventos brutos (`cart_event`), janelas calculadas na leitura |
| Card da listagem | Footer de métricas: coluna **Filiais → Carrinho 30d** (continua 3 colunas) |
| Detalhe da ferramenta | Novo `SectionCard` "Carrinho (ecommerce)" na coluna direita da Visão geral, entre "Estoque" e "Logística & metadados", com trio 15/30/90 |

## 1. Schema (`packages/db/src/schema/cart-events.ts`)

Tabela `cart_event`, dentro da superfície de sync CI dashboard → ecommerce
(ADR-0009). Push-only via `bun db:sync` (ADR-0006).

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `text` PK | `crypto.randomUUID()` no caller |
| `tool_id` | `text` FK → `tool.id` | `onDelete: cascade`, NOT NULL — métrica é por produto-pai |
| `variant_id` | `text` FK → `tool_variant.id` | `onDelete: set null`, nullable — deletar variante preserva histórico do tool |
| `client_id` | `text` FK → `client.id` | `onDelete: set null`, nullable — preenchido se o cliente estiver logado |
| `session_id` | `text` | NOT NULL — id de sessão/visitante do storefront (anônimo ou logado) |
| `quantity` | `integer` | NOT NULL, default 1, CHECK `quantity > 0` |
| `created_at` | `timestamptz` | `defaultNow()`, NOT NULL |

- Índices: `cart_event_tool_created_idx (tool_id, created_at DESC)` (janelas por
  tool) e `cart_event_created_idx (created_at)` (expurgo).
- Sem colunas de actor/auditoria — não é trilha de staff; escrita é sempre do
  app ecommerce (equivalente a `actorType: system`).
- RLS deny-all: adicionar `cart_event` ao `src/sql/rls.sql` (ADR-0014).
- Exportar no barrel `src/schema/index.ts`.
- Ownership no `docs/integration/admin-ecommerce.md`: **dono primário
  E-commerce (INSERT-only), dashboard lê**. Dashboard também deleta no expurgo.

## 2. Queries (dashboard)

Sem branch-scoping: catálogo é global (ADR-0016). Exibição coberta pelo
`tools.read` existente — nenhuma capability nova no registry.

### Listagem (`apps/web/src/app/dashboard/tools/data.ts`)

No `db.execute` raw de `fetchToolsPage`:

- **Adicionar** subquery
  `COALESCE((SELECT COUNT(*)::int FROM cart_event ce WHERE ce.tool_id = t.id AND ce.created_at >= now() - interval '30 days'), 0) AS cart_adds_30d`.
- **Remover** a subquery `branches_breakdown` (json_agg aninhado — a mais cara
  da query) e o campo `branches` de `ToolCardData`. Verificado: `ToolCard` é
  consumido apenas por `tools-infinite.tsx`; suppliers usa card/tipo próprios
  (`SupplierStockToolRow`).
- A armadilha de subquery escalar correlacionada (packages/db/CLAUDE.md) não se
  aplica: esta query já é `db.execute` raw.

### Detalhe (`apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts`)

Uma query agregada por tool:

```sql
SELECT
  COUNT(*) FILTER (WHERE created_at >= now() - interval '15 days')::int AS d15,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS d30,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '90 days')::int AS d90
FROM cart_event WHERE tool_id = $1
```

Entra no payload de `getToolDetail` como `cartSummary: { d15, d30, d90 }`.

## 3. UI

### Card da listagem (`apps/web/src/app/dashboard/_components/tool-card.tsx`)

- Footer continua com 3 colunas: **Estoque · Variantes · Carrinho 30d**.
- Coluna nova substitui "Filiais": número em coral (`text-primary`), label
  `CARRINHO 30D` no mesmo padrão uppercase 9px.
- Zero é exibido como `0` (zero é informação — produto sem demanda).
- `ToolCardData`: remove `branches`, adiciona `cartAdds30d: number`.

### Detalhe (`apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx`)

- Novo `SectionCard` "Carrinho (ecommerce)" na coluna direita, entre "Estoque"
  e "Logística & metadados".
- Grid de 3 colunas com separadores (`border-r`): valor coral bold tabular-nums
  + label uppercase (`15 DIAS` / `30 DIAS` / `90 DIAS`), espelhando o footer do
  card da listagem.

## 4. Expurgo (cron)

Route handler `apps/web/src/app/api/cron/prune-cart-events/route.ts`, diário
(sugestão 04:30 UTC, após `cancel-stale-orders`), registrado em
`apps/web/vercel.json`. Convenções de `apps/web/CLAUDE.md` §Cron: Bearer
`CRON_SECRET` antes de qualquer query, `force-dynamic` + `runtime nodejs`,
`logger` (nunca console).

```sql
DELETE FROM cart_event WHERE created_at < now() - interval '180 days'
```

180 dias = 2× a maior janela (90d), margem pra análises retroativas curtas.
Operação idempotente e sem lock relevante (DELETE por índice `created_at`).

## 5. Lado ecommerce (issue cross-repo — não implementado aqui)

O schema chega ao ecommerce pelo CI sync automático (ADR-0009) quando este
trabalho mergear na `main`. Issue no repo do ecommerce com:

- **Porquê:** admin passa a exibir demanda por produto (reunião de 2026-06).
- **Onde:** no ponto de add-to-cart (server action / handler do carrinho),
  INSERT em `cart_event` com `toolId` (derivado da variante), `variantId`,
  `sessionId` (id de sessão/visitante já usado pelo carrinho), `clientId` se
  logado, `quantity` adicionada.
- **Como:** fire-and-forget — `try/catch` com log; falha na métrica **jamais**
  quebra o fluxo de carrinho do cliente. Sem retry, sem fila.
- **Contrato:** INSERT-only; ecommerce não lê nem deleta; expurgo >180d é do
  dashboard.
- Atualizar `docs/integration/admin-ecommerce.md` (linha de ownership) neste
  repo, no mesmo PR do schema.

## 6. Dev, seed e verificação

- `bun db:sync` após criar o schema (banco compartilhado espelha a branch).
- `db:seed-demo`: gerar eventos sintéticos distribuídos nos últimos ~100 dias
  (volumes distintos por tool, incluindo tools com 0) para smoke visual real.
- Smoke obrigatório via dev server na porta 3006 (`/dev-up 3006`): listagem
  `/dashboard/tools` (coluna Carrinho 30d) e detalhe (trio 15/30/90) —
  `check-types` não pega SQL inválido em template string.
- Testes unitários: apenas onde houver lógica pura extraível; as queries são
  verificadas pelo smoke.
- `bun verify` (check-types + check + test) antes de commit/PR.

## Fora de escopo (YAGNI — o evento bruto mantém as portas abertas)

- Ordenar/filtrar a listagem por demanda.
- Gráfico de curva diária de adições.
- Taxa de conversão carrinho → pedido.
- Dedup por sessão na exibição (dado permite; UI atual mostra contagem bruta).

## Riscos e mitigação

- **Ecommerce ainda não emite eventos** → tabela vazia → UI mostra zeros;
  degradação graciosa, sem erro.
- **Volume:** mesmo em cenário exagerado (1.000 adds/dia), ~90k linhas na
  janela de 90d — trivial com os índices propostos; expurgo segura o total.
- **Coordenação de deploy:** aditivo puro (tabela nova) — nenhum deploy
  coordenado necessário; ecommerce adota quando o PR de sync chegar.
