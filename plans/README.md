# Implementation Plans — Performance de navegação & carregamento

Gerado pela skill `improve` em 2026-06-17, contra o commit `b4c63a64` (branch
`inprove`). Foco: melhorar a velocidade percebida e real de navegação/carregamento
do dashboard. Cada executor: leia o plano inteiro antes de começar, honre as
"STOP conditions" e atualize sua linha de status ao terminar.

**Contexto do diagnóstico**: a arquitetura de dados é boa (keyset pagination,
`Promise.all`, scroll infinito), mas três alavancas sistêmicas estão desligadas:
1. **Streaming** — só 1 de 39 páginas tem `loading.tsx` → navegação = tela branca.
2. **Cache** — zero `use cache`/`cacheTag`; os `revalidateTag` são no-ops; 19
   páginas `force-dynamic` → nada cacheado entre requests.
3. **Bundle** — zero `next/dynamic`; recharts/motion eager. 

O `dashboard/page.tsx` (home) é o **exemplar correto** de streaming — os planos
estendem o padrão dele ao resto.

## Integração (2026-06-17)

**Wave 1 COMPLETA, mergeada e smoke-testada.** `inprove` foi sincronizada com `origin/main`
(fast-forward para `73175991`, trazendo #210 banners + #211 tools-wizard) e os 6 branches
da Wave 1 foram mergeados (zero conflito — arquivos disjuntos dos commits novos da main).
**Não foi feito push.** Verificação no tree integrado: `check-types` exit 0, build exit 0,
smoke visual no `:3001` OK (charts 003, KPIs 004, lazy tabs 005, orders/filtro 007 — sem
erros de console).

⚠️ **5 testes falhando pré-existentes da `main`** (`banner-schema.test.ts`) — introduzidos por
#210 (`dd1fcc31`), **não pela Wave 1** (nenhum commit da Wave 1 tocou banner-schema). Bug da
própria main, a corrigir à parte.

## Ordem de execução & status

Comece pela **Wave 1** (S, risco BAIXO, maior UX percebida). A **Wave 2** (M,
risco MÉDIO) depois — mexe em invalidação de cache, query plans e animação.

**Ordem decidida da Wave 2 (2026-06-17, slate completo):**
1. **Tier 1 — paralelo (worktrees):** `009` + `010` (disjuntos; ganho de bundle garantido).
2. **Tier 2 — sequencial:** `008` (EXPLAIN primeiro; STOP se já indexado) → `011`.
   Sequenciados porque **ambos tocam `orders/data.ts`** (funções diferentes — não paralelizar).
3. **Tier 3 — solo, timeboxed:** `006` (spike de Cache Components, por último).

**Integração (2026-06-17): MERGEADA.** 009+010+011 → `perf/wave-2` → **PR #216 mergeado (squash)** em `main` = `db5d1c23`. `inprove` resetado p/ `main`; worktrees da wave removidos. 008 não entrou (rejeitado); 006 não entrou (spike STOPPED → 006-A pendente). Smoke visual `:3001` passou sem erro de console; drag-reorder e abrir-anexo-ao-vivo seguem pendentes de verificação manual.

| Plano | Título | Wave | Prioridade | Esforço | Depende de | Status |
|-------|--------|------|------------|---------|------------|--------|
| 001 | `loading.tsx` streaming em todas as rotas | 1 | P1 | M | — | DONE (worktree `worktree-agent-a4c7d8ca7857a49c7`, commit `1da899fd`) |
| 002 | `optimizePackageImports` + bundle-analyzer | 1 | P1 | S | — | DONE (worktree `worktree-agent-a989122f1e6968ad6`, commit `8e6a450e`) |
| 003 | recharts via `next/dynamic` na home | 1 | P1 | S | 002 (recom.) | DONE (worktree `worktree-agent-a95050ce6b7ccb848`, commit `perf: lazy-load charts (recharts) na home`) |
| 004 | Paralelizar KPI fetchers de detalhe | 1 | P1 | S | — | DONE (worktree `worktree-agent-aa38279a70c991cda`, commit `perf: paraleliza queries de KPI de detalhe`) |
| 005 | Lazy tabs Atividade/Sessões em `users/[id]` | 1 | P1 | S | — | DONE (worktree `worktree-agent-a38b4739d31e76834`, commit `330ce3c1`) |
| 007 | Dedup request-scoped com React `cache()` | 1 | P2 | S | — | DONE (worktree `worktree-agent-a2521949f98edabe9`; build exit 0 verificado — `cache()` OK em arquivo `use server`) |
| 006 | Cache Components + piloto (spike) | 2 | P2 | L | 007, 002 | STOPPED — spike COMPLETO (desfecho válido). Ligar `cacheComponents: true` quebra o build com 21 erros (20 rotas `force-dynamic` + 1 cron `runtime`); flag revertida (next.config sem net change). Entregável = `plans/006-rollout-notes.md` (decisão de rollout + ordem de domínios). Descobriu prerequisito **006-A**. Re-rodar 006 (piloto suppliers) após 006-A. |
| 006-A | Remover `force-dynamic` de 20 rotas + habilitar Cache Components (fundação) | 3 | P2 | S-M | — | STOPPED no layout (executor `aaed9ca5`, worktree `agent-aaed9ca5907857a20`). Remoção dos 21 configs limpa, mas o build com `cacheComponents:true` falha em **2 lugares**: (1) `dashboard/layout.tsx:30` → `getCurrentSession()`/`await headers()` no topo sem Suspense → quebra todas ~19 rotas dashboard; (2) `components/providers.tsx:5` (root) → uncached data fora de Suspense (rota `/convite`). → escopa **006-B** (refactor de layout+providers). **DECIDIDO (2026-06-17): fazer 006-B faseado + cache conservador** (só referência global; operacional fica fresco). Plano faseado + razão em `plans/_NEXT-SESSION.md`. |
| 008 | Eliminar subqueries correlacionadas (N+1) | 2 | P2 | M | — | REJECTED (gate Step 0, 2026-06-17): colunas já otimamente indexadas (`tool_image_tool_sort_idx` composto `(tool_id,sort_order)`; `order_item_order_id_idx`). EXPLAIN ANALYZE em prod: subquery `image_url` já é Index Scan (0.006ms/linha), query total 0.501ms. Reescrita MÉD-risk sem ganho mensurável. Revisitar só se surgir gargalo sob carga real. |
| 009 | Remover `motion` do shell do layout | 2 | P2 | M | 002 (medir) | DONE (worktree `worktree-agent-aa5c2ddb7626af60a`, commit `8c1bafa7`; review tech-lead OK — escopo limpo, check-types/ultracite/build/359 testes; 1 round de fix de indentação. Smoke visual pendente) |
| 010 | Lazy-load de deps de editor (dnd-kit, image-compression) | 2 | P2 | M | 002 (medir) | DONE (worktree `worktree-agent-a601e6dfa466bd4c5`, commit `b07983d0`; review OK — alias `nextDynamic` p/ colisão com `export const dynamic`. Smoke interativo pendente: upload+compress + 2 drag-reorder) |
| 011 | Assinar anexos de pedido sob demanda | 2 | P2 | M | — | DONE (worktree `worktree-agent-aed878a7daba568b1`, commit `a120005e`; RECONCILIADO: consumidor real = feed polimórfico `order-history-feed.tsx`. `signOrderAttachment(attachmentId)` IDOR-safe via `lockOrderAndAuthorize(tx,"orders.read",orderId)` no orderId do banco. Review OK — auth escrutinada, check-types/ultracite/359 testes. Inclui normalização cosmética incidental de `listOrderBranches`. Smoke interativo + rejeição out-of-scope pendentes) |

Status: TODO | IN PROGRESS | DONE | BLOCKED (com motivo) | REJECTED (com motivo)

## Notas de dependência

- **003** recomenda **002** antes (o analyzer dá o número before/after da queda de
  bundle), mas não é bloqueante — pode rodar standalone.
- **006** (Cache Components) recomenda **007** antes: faça o dedup request-scoped
  seguro primeiro; o `use cache` cross-request é o teto, o `cache()` é o piso.
  **006** também usa o analyzer de **002** para medir.
- **009** e **010** usam o analyzer de **002** para provar a queda de bundle.
- Os planos da Wave 1 são todos independentes entre si — podem ser paralelizados
  em worktrees separados (cada um toca arquivos distintos; ver "Scope" de cada).
- **001** (loading.tsx) e **006** (cache) compõem: skeletons instantâneos +
  navegações cacheadas = navegação que parece imediata.

## Como rodar a verificação (comum a todos)

- Typecheck: `bun check-types` (raiz) → exit 0
- Lint: `bun check` (raiz, ultracite) → exit 0
- Testes: `bun --cwd apps/web test` → verde (baseline 30 arquivos / 183 testes)
- Build: `bun run --cwd apps/web build` (Turbopack, default)
- Bundle analyzer (após 002): **só funciona com webpack** — `ANALYZE=true npx next build --webpack` (de `apps/web/`); reports em `apps/web/.next/analyze/*.html`. O build Turbopack NÃO emite tabela de First Load JS nesta versão; medir bundle pelos HTMLs do analyzer.
- Smoke visual: `bun dev:web` → `http://localhost:3001` (porta 3001)

## Findings considered and rejected

- **react-markdown lazy-load** (audit de bundle, "PERF-04"): **rejeitado** — os
  consumidores de `components/tool-description.tsx`
  (`tools/[id]/_components/overview-tab.tsx`,
  `suppliers/[id]/_components/overview-tab.tsx`) são **Server Components**, então
  react-markdown renderiza no servidor e **não vai pro bundle client**. Sem custo
  de bundle a remover. (Verificado lendo o `head` dos dois arquivos: nenhum tem
  `"use client"`.)
- **`getBranchTeam` sem `LIMIT`** (audit de data-fetching, "PERF-03"): **adiado,
  não rejeitado** — risco real só com times muito grandes (centenas de usuários
  por filial), e a tab já carrega lazy. Vale paginar quando 006/lazy-tabs
  estiverem feitos; baixa prioridade isolada. Não virou plano nesta rodada.
- **`fetchDashboardCounts` dedup "frágil"** (audit de cache, "PERF-07"): o dedup
  **funciona** hoje (o wrapper em `actions.ts` chama o impl `cache()`-wrapped). É
  fragilidade, não bug. Pode ser endereçado de carona no 007 (importar direto de
  `pending-data.ts`), mas não justifica plano próprio.
- **Granularizar o `<Suspense>` único de `PendingSection`** na home (audit de
  streaming/data, "PERF-05"): polish de baixo impacto — a home já transmite por
  seção; dividir mais um nível rende pouco. Não priorizado.

## Não auditado (gaps conhecidos)

- Índices do Postgres (o N+1 do plano 008 pode já ter índice cobrindo — o plano
  manda verificar com `EXPLAIN` antes de mexer).
- Tamanhos reais de bundle (nenhum `next build` rodado pela skill; estimativas via
  tamanhos publicados no npm). O plano 002 estabelece o baseline real.
- Rotas `stock/branches`, `stock/movements`, `reviews`, `promotions` em
  profundidade de query.
- Tree-shaking do barrel de `@emach/ui` (`packages/ui`).
