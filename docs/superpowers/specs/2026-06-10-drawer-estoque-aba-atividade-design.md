# Drawer de estoque + Aba "Atividade" da filial — Design

> Data: 2026-06-10 · Rota afetada: `/dashboard/branches/[id]?tab=stock` e nova `?tab=activity`

## Problema

A drawer de edição de estoque (`branch-stock-edit-sheet.tsx`) é estreita (580px) e empilha
verticalmente estoque atual + ajuste + limites + histórico, ficando apertada. Parte do conteúdo
— o histórico de movimentação — é informação que merece um espaço próprio com filtros, em vez
de ficar comprimida no fim da drawer.

## Objetivos

1. **Drawer mais larga e reorganizada** em duas colunas, usando o esqueleto visual da drawer
   "Editar filial" (header com borda, seções espaçadas), mas preservando os **dois submits
   independentes** (ajustar quantidade × salvar limites).
2. **Nova aba "Atividade" da filial** — feed amplo agrupado por dia, agregando estoque + pedidos
   + equipe, com filtros (período, tipo, ferramenta). Reusa a infra de feed que já existe.
3. O histórico na drawer vira **resumo com scroll interno + lazy load** e um link que abre a
   nova aba já filtrada pela ferramenta.

## Decisões tomadas (validadas com o usuário)

- **Layout da drawer:** opção A — painel de "Estoque atual" em 4 stat-cards no topo (full-width),
  abaixo duas colunas: **Ajustar quantidade** à esquerda; **Limites de alerta** + **Movimentos
  recentes** empilhados à direita.
- **Divisores edge-to-edge:** linhas/separadores dentro dos cards vão até a borda (padrão
  `-mx-4 px-4` do `DESIGN.md`). Nada de divisor parando no padding.
- **Seções que crescem** (Movimentos recentes): scroll interno + lazy load (`useInfiniteList` +
  `InfiniteSentinel`); o render inicial varia com a altura disponível. Scrollbar herda o padrão
  global (`packages/ui/src/styles/globals.css`: thin, thumb `--border` → hover `--muted-foreground`
  → active `--primary`).
- **Escopo da aba:** estoque + pedidos + equipe (feed amplo).
- **Nome/posição da aba:** "Atividade", como última aba (após Estoque).
- **Densidade da timeline:** agrupada por dia (Hoje / Ontem / data) com ícone colorido por tipo.

## Parte 1 — Redesign da drawer de estoque

**Arquivo:** `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx`

### Layout

```
┌────────────────────────────────────────────────────────────┐
│ [img] Nome · SKU · Filial · [badge]   ↗ Editar ficha        │  header (fixo, border-b)
├────────────────────────────────────────────────────────────┤
│ ESTOQUE ATUAL                                                │  painel (fixo, border-b)
│ ┌──────┐┌──────┐┌──────┐┌──────┐                            │
│ │  95  ││  13  ││  33  ││  89  │   6 reservados…            │
│ │ Atual││ Mín  ││ Repor││ Disp │                            │
│ └──────┘└──────┘└──────┘└──────┘                            │
├──────────────────────────────┬─────────────────────────────┤
│ Ajustar quantidade           │ Limites de alerta (card)     │  corpo 2 colunas
│  Nova quantidade *           │  [Mín] [Repor] [Salvar]      │  (flex-1, min-h-0)
│  [motivos 2×2]               │ ┌─────────────────────────┐  │
│  Observação                  │ │ Movimentos recentes     │  │  card grow:
│  [Salvar ajuste]             │ │  +95 entrada compra …   │  │  scroll interno
│                              │ │  −4  saída venda …      │  │  + lazy load
│                              │ │  … (scroll) ⟳           │  │
│                              │ │ Ver atividade da filial→│  │  footer (border-t)
│                              │ └─────────────────────────┘  │
└──────────────────────────────┴─────────────────────────────┘
```

- **Largura:** `sm:max-w-3xl` (≈768px), ante `sm:max-w-[580px]` atual. (Filial usa `2xl`; estoque
  precisa de mais por causa das duas colunas.)
- **Shell:** `SheetContent` em `flex flex-col p-0`; header e painel "Estoque atual" são `flex-none`;
  o bloco de colunas é `flex-1 min-h-0` com `grid grid-cols-2`.
- **Coluna esquerda:** `overflow-y-auto` (rola se o form não couber). Contém o form de
  `adjustStock` (input nova qtd + grid de motivos + observação + botão).
- **Coluna direita:** `flex flex-col gap-4 min-h-0`. "Limites de alerta" é um card `flex-none`;
  "Movimentos recentes" é um card `flex-1 min-h-0` com corpo `overflow-y-auto`.
- **Não** reusar `EntityEditSheet` diretamente — ele tem footer de submit único, e aqui há dois
  forms independentes. Adota-se o esqueleto visual, não o componente.

### Cards com divisores edge-to-edge

Card de "Movimentos recentes" estruturado como header / body / footer, cada borda full-bleed:
`card-h` (`border-b`), `card-body` (`px-` com itens `border-b` que esticam via `-mx px`), `card-f`
(`border-t`). Mesma técnica do footer edge-to-edge do `DESIGN.md`.

### Movimentos recentes paginados

Hoje `getStockMovementsByVariantBranch(variantId, branchId, limit=5)` traz 5 fixos. Substituir por
um fetcher paginado:

```ts
// stock/actions.ts (ou branch-stock-data.ts)
fetchVariantBranchMovementsPage(
  variantId: string, branchId: string, cursor: string | null
): Promise<InfiniteResult<StockMovementRow>>
```

Keyset `(created_at, id) DESC`, `BATCH_SIZE`. O client usa `useInfiniteList` + `InfiniteSentinel`
com `root` apontando para o container scrollável do card (igual ao `ActivityFeed`).

O link do footer aponta para `?tab=activity&type=stock&toolId=<toolId>` (aba pré-filtrada).

## Parte 2 — Aba "Atividade" da filial

### Wiring na página

`apps/web/src/app/dashboard/branches/[id]/page.tsx`: adicionar 5ª `EntityTab` (`value: "activity"`,
label "Atividade", ícone `Activity` do lucide), **lazy** (`content` só quando
`sp.tab === "activity"`), após "Estoque". Sem ação no header para essa aba.

### Componentes novos (`branches/[id]/_components/`)

- `activity-tab.tsx` (Server Component): chama `fetchBranchActivityPage` (1ª página) +
  `fetchBranchTools(branchId)` (ferramentas com estoque na filial, para o select). Passa ao client.
- `activity-tab-client.tsx` (Client): estado de filtros (`period`, `types: ('stock'|'order'|'team')[]`,
  `toolId?`), `useInfiniteList` com `resetKey = JSON.stringify(filters)`, empty state, render da
  timeline.
- `branch-activity-timeline.tsx`: timeline **multi-kind agrupada por dia**. Combina o `groupByDay`
  do `tools/[id]/_components/activity-timeline.tsx` com o mapa de ícones/cores por kind do
  `components/activity-feed.tsx` (`BoxIcon`/`PackageIcon`/`UserCogIcon`).
- `branch-activity-filters.tsx`: período segmentado + chips de tipo (multi) + select de ferramenta.
  Espelha `tools/[id]/_components/activity-filters.tsx`. O select de ferramenta só afeta os eventos
  de estoque.

### Backend — fetcher unificado

**Arquivo:** `branches/[id]/activity-data.ts` (impl, `server-only`) + wrapper `"use server"` em
`branches/actions.ts` para o client paginar.

Espelha `fetchDashboardActivity` (UNION ALL com cursor `(created_at, id) DESC`), escopado por
`branchId` e filtros:

| kind | fonte | escopo |
|---|---|---|
| `stock` | `stock_movement sm` JOIN `tool_variant` | `sm.branch_id = :branchId` (+ `tv.tool_id = :toolId` se filtrado, + motivo) |
| `order` | `order_status_history osh` JOIN `"order" o` | `o.branch_id = :branchId` |
| `team` | `user_activity_log ual` | `(target_type='branch' AND target_id=:branchId)` **OR** `(action IN ('user.branch_linked','user.branch_unlinked') AND metadata->>'branchId' = :branchId)` |

- **Filtro de tipo:** incluir/excluir cada SELECT do UNION conforme `types[]`. Se `types` vazio →
  tratar como todos (ou empty state).
- **Período:** `WHERE created_at >= cutoff` (reusar `computePeriodCutoff`).
- **Retorno:** `ActivityEvent` (já tem `kind`/`primary`/`secondary`/`accentLabel`/`tone`/`href`/`at`).
  Traduzir status crus (`to_status` de pedido) pelos mapas canônicos no boundary, como
  `fetchDashboardActivity` faz. Coercer timestamps com `toDate` (db.execute devolve string).
- **Autoria:** `actorType`/`actorId`/`actorUserId` conforme a tabela (CLAUDE.md: `stockMovement`
  usa `actorId`; as demais `actorUserId`). LEFT JOIN `user` para o nome.

### Notas de implementação

- O filtro de equipe por `metadata->>'branchId'` não tem índice — volume de logs de equipe é baixo,
  varredura é aceitável. Registrar como limitação conhecida; criar índice GIN/expressão depois se
  necessário.
- `requireCapability("stock.read")` (ou a capability de leitura da filial) no fetcher, seguindo o
  padrão obrigatório de server actions mesmo com gates em no-op (ADR-0012).

## Arquivos tocados (resumo)

**Modificados**
- `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` (redesign + lazy load)
- `apps/web/src/app/dashboard/stock/actions.ts` (novo `fetchVariantBranchMovementsPage`)
- `apps/web/src/app/dashboard/branches/[id]/page.tsx` (5ª aba)
- `apps/web/src/app/dashboard/branches/actions.ts` (wrapper `fetchBranchActivityPage`)

**Novos**
- `apps/web/src/app/dashboard/branches/[id]/activity-data.ts`
- `apps/web/src/app/dashboard/branches/[id]/_components/activity-tab.tsx`
- `apps/web/src/app/dashboard/branches/[id]/_components/activity-tab-client.tsx`
- `apps/web/src/app/dashboard/branches/[id]/_components/branch-activity-timeline.tsx`
- `apps/web/src/app/dashboard/branches/[id]/_components/branch-activity-filters.tsx`

## Verificação

- `bun check-types` + `bun check` (ultracite) antes de commit.
- Smoke run-time obrigatório (CLAUDE.md: tsc não pega SQL inválido em template/coluna removida):
  `bun dev:web`, visitar `?tab=stock` (abrir drawer, ajustar, scroll do histórico) e `?tab=activity`
  (filtros, scroll infinito). Stack trace via `nextjs_call <port> get_errors` se quebrar.

## Fora de escopo (YAGNI)

- Índice dedicado para `metadata->>'branchId'` (adicionar só se virar gargalo).
- Exportação/CSV do feed.
- Eventos de equipe além de vínculo/desvínculo e edição da filial.
