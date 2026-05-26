# Ajuste UI Filiais — Design

**Data:** 2026-05-26
**Branch:** `ajuste-ui-filiais`
**Escopo:** Listagem `/dashboard/branches` + detalhe `/dashboard/branches/[id]` + integração do estoque no fluxo

## Motivação

A "tab" Estoque no detalhe é hoje um `href` (link externo) que joga o usuário em `/branches/[id]/stock` — uma página standalone com PageHeader e KPIs próprios, sem o contexto da filial (sem `BranchIdentity`, sem as outras tabs). Resultado: o estoque parece um produto separado.

A listagem tem `...` dropdown + dialog de delete solto + filtro "Mostrar inativas" pouco usado + ícones de KPI pequenos demais pro destaque que mereciam.

## Decisões (confirmadas com o usuário)

| Tópico | Decisão |
|---|---|
| Integração estoque | Tab interna com conteúdo embarcado (lazy via `?tab=stock`). Rota antiga vira redirect 308. |
| Ações no card | Estoque + Editar inline; sem dropdown `...`; sem item "Detalhes" (clicar o card já abre). Deletar fica dentro do detalhe. |
| Direção visual do card | **A — Refinado:** estrutura atual polida (monograma + endereço + status inline + KPI grid 3 col + ações inline). |
| Filtro "Mostrar inativas" | Removido. Inativas aparecem sempre, com `opacity-70` + badge (já existe). |
| Ícones dos KPIs do topo | `size-5` (20px) só em `/branches` — prop opcional `iconSize` no `EntityKpisRow`. |
| Rota antiga `/stock` | Redirect 308 → `/branches/[id]?tab=stock`. |

## Arquitetura — Tab Estoque embarcada (lazy RSC)

```
/dashboard/branches/[id]/page.tsx (RSC)
├── BranchIdentity (sempre)
├── EntityTabs (client, value via ?tab=)
│   ├── overview  → OverviewTab (já existe)
│   ├── team      → TeamTab (já existe)
│   ├── orders    → OrdersTab (já existe)
│   └── stock     → <StockTab branchId={id} searchParams={sp} /> (NOVO)
└── BranchEditSheet (se ?edit=1)
```

**`StockTab` (RSC):** lê `searchParams` da rota pai e dispara as queries de estoque (`getBranchStockKpis`, lista de `category`, `fetchBranchStockPage`). Renderiza um header compacto (sem `PageHeader` redundante — `BranchIdentity` já mostra o nome), os KPI cards do estoque (Itens, Críticas, A repor, OK), filtros e infinite list.

**Lazy real:** Radix `Tabs` monta só o `TabsContent` ativo. Quando `searchParams.tab !== "stock"`, o `StockTab` não é incluído na árvore RSC — não roda query nenhuma. Trocar de tab dispara `router.replace?tab=stock`, a página re-renderiza no servidor, e aí sim as queries de estoque rodam.

**Trade-off:** trocar pra Estoque tem latência de fetch (uma vez); navegar de volta pra Visão geral também (Next 16 cache amortiza). Aceitável — o usuário paga por dados que vai usar.

**Filtros de estoque na URL:** `?categoryId`, `?search`, `?sort`, `?status` continuam funcionando, agora coexistindo com `?tab=stock`. O `BranchStockFilters` já usa `basePath` configurável; passar `basePath="/dashboard/branches/[id]?tab=stock"` (ou helper) preserva o tab.

## Componentes — diff

### `branch-card.tsx` (refinado)
- Avatar 48px (mantido) com monograma + cor por estado de estoque (mantido).
- Header: nome + endereço (line-clamp-1) + status pill ("3 abaixo do mín." em âmbar / "Estoque OK" em verde).
- **Ações inline no header:** dois `IconButton` (Estoque → link `/branches/[id]/stock` redireciona pra `?tab=stock`; Editar → `?edit=1`). Ambos com `aria-label`. `stopPropagation` no wrapper para não disparar o clique do card.
- Remove: `DropdownMenu` ("..."), `DeleteBranchDialog` solto.
- KPI grid 3 colunas (Equipe, SKUs ativos, Abaixo mín.) — preservar layout, números 20px.
- Footer "Ver estoque" — **remove** (redundante com ícone inline no header).
- Inativas: `opacity-70` + badge "Inativa" (já existem, mantém).

### `branches-filters.tsx`
- Remove o botão "Mostrar inativas" e a coluna "Status" inteira do filtro.
- `TRACKED` vira `["search", "sort"]`.

### `branches/page.tsx`
- Remove `inactive` de `searchParams` e `BranchesFiltersInput`.
- Passa `iconSize="lg"` ao `EntityKpisRow`.

### `branches/actions.ts`
- Remove `includeInactive` de `BranchesFiltersInput`. `fetchBranchesPage` sem o filtro `if (!filters.includeInactive)`. Resultado: lista sempre traz ativas + inativas.
- **Decisão:** ordenação não muda; inativas misturam por createdAt/name. Visual diferencia (opacity).

### `entity-kpis-row.tsx`
- Adiciona prop opcional `iconSize?: "sm" | "lg"` (default `"sm"` = 16px atual). `"lg"` = `size-5` (20px).
- Único call-site mudado por enquanto: `branches/page.tsx`.

### `branches/[id]/page.tsx`
- Tab `stock`: muda de `href` pra `content: <StockTab ... />`.
- Lê `searchParams.tab` e passa adiante (já vem via `params` do Next).
- Mantém `BranchEditSheet` no `?edit=1`.

### `branches/[id]/_components/stock-tab.tsx` (NOVO)
- RSC. Recebe `branchId` + `searchParams` (categoria, busca, sort, status).
- Faz as 3 queries que hoje vivem em `[id]/stock/page.tsx`: `getBranchStockKpis`, `category` list, `fetchBranchStockPage`.
- Render: `EntityKpisRow` (KPIs de estoque, sem `iconSize` lg — esses são contextuais menores) + `BranchStockFilters` (com `basePath` ajustado pra preservar `?tab=stock`) + `BranchStockInfinite` ou `Empty`.
- `AddToolButton` vai num header local da tab (canto direito), só pra quem tem `stock.adjust`.

### `branches/[id]/stock/page.tsx`
- Substituído por `redirect(\`/dashboard/branches/\${id}?tab=stock\`, RedirectType.replace)` (308 permanente).
- Preserva quaisquer query params (`?categoryId=...&search=...` etc.) na URL final.

### `delete-branch-dialog.tsx`
- Não muda em assinatura. Some da listagem; passa a viver no rodapé do `BranchEditSheet` (zona destrutiva, fora do fluxo principal — clicar Editar é intencional).

## Permissões

- Visualizar Estoque: `stock.adjust` com `targetBranchIds: [id]`. Se user não tem, a tab é omitida do array (não renderizada). Acesso direto a `?tab=stock` cai pra Visão geral.
- Ações inline no card: `Editar` aparece só se `canManage` (já existe).
- Deletar: dentro do detalhe, só se `canManage` (mantém checagem).

## Riscos & Mitigações

1. **Switch de tab faz round-trip ao servidor.** Próximas visitas amortizam via Next cache. Aceitável.
2. **`BranchStockFilters` precisa saber o `basePath` que preserve `?tab=stock`.** Já é parametrizado — só ajustar o caller.
3. **Inativas sem filtro:** se houver volume grande, lista fica longa. Hoje não é o caso (poucas filiais). Se virar problema, voltar a esconder por padrão é trivial.
4. **`/branches/[id]/stock` deep-link externo:** o 308 preserva method e cobre `GET`. Bookmarks continuam funcionando.

## Não escopo

- Não redesenha a página de estoque em si (filtros, lista, dialog de ajuste).
- Não mexe em `TeamTab`, `OrdersTab`, `OverviewTab`.
- Não muda permissões/capabilities.
- Não adiciona testes E2E novos (smoke run-time conforme `CLAUDE.md`).

## Verificação

- `bun check-types` limpo.
- `bun dev:web`: navegar `/dashboard/branches` → cards novos, filtros sem "inativas", KPIs com ícones maiores.
- Clicar em filial → detalhe, clicar tab Estoque → conteúdo embarca sem sair da rota.
- Visitar URL antiga `/branches/[id]/stock` → redireciona pra `?tab=stock`.
- Console sem erros (Monitor já armado em `/tmp/emach-dev.log`).
