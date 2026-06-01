# Design — Polish das listagens + infinite scroll padronizado

> Data: 2026-06-01 · Escopo: `apps/web` (dashboard) · Branch foco: `/dashboard/branches` e tabs internas, com efeito sistêmico no `InfiniteSentinel`.

## Objetivo

1. Limpar a listagem de filiais: remover ação de **editar** inline do card.
2. Substituir o rodapé "— fim da lista —" (e o botão "Carregar mais" redundante) por um padrão de carregamento mais fluido — **em todas as ~12 listagens** que compartilham o `InfiniteSentinel`.
3. Padronizar paginação nas tabs internas da filial onde faz sentido (Pedidos), polir onde não faz (Equipe).
4. **Documentar o padrão de scroll infinito** no repo, já que vale pro sistema todo.

## Contexto verificado

- `InfiniteSentinel` (`apps/web/src/components/infinite-sentinel.tsx`) é consumido por **12 listagens**: branches, customers, orders, promotions, stock, suppliers, tools, users, activity (×2), activity-feed, pending-panel.
- Page size global: `BATCH_SIZE` (`apps/web/src/lib/infinite.ts`) — vale pra 1ª carga (SSR) e páginas seguintes. Query usa `limit(BATCH_SIZE + 1)` (peek, sem count extra). **Será alterado de 24 → 20** (decisão do usuário, aplica ao sistema todo).
- Auto-scroll dispara 200px antes do fim (`rootMargin: "200px"`). Hook `useInfiniteList` é sólido: keyset cursor, race-guard (`refetchSeq`), `inflightRef`.
- Hoje o sentinel exibe, **simultaneamente**: auto-scroll (IntersectionObserver) **e** um botão ghost "Carregar mais" permanente — redundância visual.
- Na página de detalhe da filial (`branches/[id]/page.tsx`), `StockTab` é lazy (só renderiza com `?tab=stock`), mas `getBranchTeam` e `getBranchRecentOrders` rodam **sempre** no `Promise.all`, mesmo na "Visão geral".

## Decisões

| Item | Decisão |
|---|---|
| Page size | **`BATCH_SIZE` 24 → 20** (global, todas as 12 listagens). |
| Modelo de carregamento | **Auto-scroll + skeleton**. Botão só como fallback de erro. |
| Rodapé "fim da lista" | **Some** — quando `!hasMore`, sentinel retorna `null`. |
| Tab Pedidos | **Pagina** (cursor `createdAt`+`id`) + **lazy** (só carrega com `?tab=orders`). |
| Tab Equipe | **Não pagina** (baixo volume) — só alinha visual/empty state; badge passa a usar `kpis.teamSize`. |

---

## Componente A — Listagem de filiais (`branch-card.tsx`)

- **Remover** o `<Link>` de editar (`Pencil` → `?edit=1`) do bloco `canManage`.
- **Manter** o botão de Estoque (`Boxes` → `?tab=stock`) com `border border-border bg-muted` (já presente). Confirmar visualmente que a borda renderiza nítida sobre `bg-muted`.
- Editar continua disponível no **detalhe** da filial (drawer `?edit=1`), conforme entity pattern — mutação não pertence ao card de listagem.
- Import `Pencil` deixa de ser usado → remover.

## Componente B — `InfiniteSentinel` (rework global)

Reescrever o componente preservando a assinatura de props (`hasMore`, `pending`, `error`, `onLoadMore`, `root`) + nova prop opcional `skeleton?: ReactNode`:

- `!hasMore` → `return null` (sem "— fim da lista —").
- Auto-scroll via `IntersectionObserver` preservado (mesmo `rootMargin: 200px`).
- `pending` → renderiza `skeleton` se passado; senão, um **spinner discreto** (`Loader2 animate-spin`, `text-muted-foreground`, centralizado, `py-6`). Sem o texto "Carregando…".
- **Remover** o botão ghost "Carregar mais" permanente.
- `error` → mantém mensagem `text-destructive` + botão `outline` "Tentar de novo" (único caso com botão).
- O `div` com `ref` (alvo do observer) precisa continuar montado enquanto `hasMore && !error` pra o observer disparar.

Nenhum caller atual precisa mudar (skeleton é opcional) — as 12 listagens herdam a melhoria. Listagens de cards podem, opcionalmente, passar `skeleton` num passo futuro.

## Componente C — Skeleton de card (opcional, escopo branches)

Para a listagem de filiais e a tab Pedidos, passar um `skeleton` com 3–4 placeholders no shape do card (avatar `rounded-[10px]` + 2 linhas + footer), usando o `Skeleton` de `@emach/ui`. Evita o "pulo" entre spinner e card. Aplicar só em branches/orders neste escopo; demais listagens ficam com o spinner default.

## Componente D — Tab Pedidos → infinite scroll + lazy

Espelhar o padrão `StockTab` / `BranchStockInfinite`:

1. **Data** (`branches/data.ts` ou nova `branch-orders-data.ts`): `fetchBranchOrdersPage({ branchId, cursor })` → `InfiniteResult<BranchOrderRow>`, keyset por `(createdAt desc, id desc)`, `limit(BATCH_SIZE + 1)`, via helper `paginate`. Cursor codificado com `encodeCursor`/`decodeCursor` (`apps/web/src/lib/cursor.ts`). Substitui `getBranchRecentOrders` (limit fixo 20).
2. **Server action** `fetchBranchOrdersPage` em `branches/actions.ts` (`"use server"` + `requireCapability`/sessão, padrão `ActionResult`-free igual aos outros `fetch*Page`).
3. **Client** `branches/[id]/_components/branch-orders-infinite.tsx`: `useInfiniteList` + grid de `OrderCard` (reaproveita o `OrderCard` já existente em `orders-tab.tsx`) + `InfiniteSentinel`. Mantém o empty state atual.
4. **Lazy**: em `page.tsx`, carregar a 1ª página só quando `sp.tab === "orders"` (como `StockTab` faz), e remover `getBranchRecentOrders` do `Promise.all`. `OrdersTab` vira `async` Server Component que faz `fetchBranchOrdersPage({ cursor: null })` e passa pro client.

## Componente E — Tab Equipe (só polir)

- Não paginar (volume baixo; render completo é aceitável).
- Badge da tab passa a usar `kpis.teamSize` (já disponível) em vez de `team.length`, permitindo **remover `getBranchTeam` do `Promise.all`** e carregá-lo lazy dentro de `TeamTab`/`TeamGrid` quando a tab abre — mesma economia da Pedidos. (Se preferir manter simples, pode ficar no `Promise.all`; decisão de implementação menor.)
- Alinhar empty state / espaçamento com o padrão das outras tabs.

## Componente F — Documentação

1. **`apps/web/CLAUDE.md`** (seção entity pattern):
   - Cards de listagem **não** têm ação de editar inline — editar via detalhe (`?edit=1`).
   - Padrão de scroll infinito: todas as listagens usam `useInfiniteList` + `InfiniteSentinel`, `BATCH_SIZE = 24`, auto-scroll com `rootMargin: 200px`. `InfiniteSentinel` **não** exibe "fim da lista" (retorna `null`); loading é skeleton/spinner; botão só em erro.
2. **`DESIGN.md`** (§ listagens, se houver): registrar o tratamento de rodapé/loading como canônico.

## Verificação

- `bun check-types`.
- Smoke visual no dev server (`:3001` já rodando, ou `:3005` se liberar a porta) via claude-in-chrome:
  - `/dashboard/branches`: card sem botão editar, botão estoque com borda; scroll até o fim → sem "fim da lista", skeleton durante load.
  - `/dashboard/branches/[id]?tab=orders`: infinite scroll funcional, skeleton, sem botão duplicado.
  - `/dashboard/branches/[id]?tab=team`: visual alinhado.
  - Conferir 2–3 outras listagens (tools, users) pra garantir que o rework do sentinel não regrediu.

## Fora de escopo

- Mudar o algoritmo de paginação (keyset).
- Paginar Equipe.
- Refactor de outras tabs/listagens além das citadas.
