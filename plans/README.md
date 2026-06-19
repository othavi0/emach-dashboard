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

---

## Audit fresco — todas as categorias (rodada 2026-06-17, commit 79379ef5, branch chore/improve-audit-2026-06)

Esta rodada cobriu correctness/security/tests/tech-debt/deps/dx/docs/direction — todas as categorias exceto performance, que já foi auditada em profundidade nos planos 001-011 acima. Foi gerada pela skill `improve` em escopo completo contra o commit `79379ef5` no branch `chore/improve-audit-2026-06`.

| Plano | Slug | Prioridade | Esforço | Risco | Categoria | Depende de | Review | Status |
|-------|------|------------|---------|-------|-----------|------------|--------|--------|
| 012 | capability-guards-read-actions | P1 | M | MED | security | none (014 recomendado em paralelo) | FIXED | DONE (onda 2, `ad24705c`; +fix 1-bloco `a59bbf19`; smoke 1-cap activity feed pré-prod) |
| 013 | assign-branch-lock-authorization | P1 | S | LOW | security | none | PASS | DONE (onda 1, `8fccf543`; smoke multi-role recomendado pré-prod) |
| 014 | tests-branch-scope-capability | P1 | S | LOW | tests | none | FIXED | DONE (onda 1, `225eefca`) |
| 015 | tests-apply-stock-returns | P1 | S | LOW | tests | none | PASS | DONE (onda 1, `225eefca`) |
| 016 | consolidate-action-error-message | P1 | S | LOW | tech-debt | none | FIXED | DONE (onda 1, `225eefca`) |
| 017 | ci-test-gate-and-verify-script | P1 | S | LOW | dx | none | FIXED | DONE (onda 1, `98fda766`) |
| 018 | env-example-required-vars | P2 | S | LOW | dx | none | FIXED | DONE (onda 1, `225eefca`) |
| 019 | fix-doc-drift | P2 | S | LOW | docs | none | FIXED | DONE (onda 1, `225eefca`) |
| 020 | fix-revalidate-tag-banners | P2 | S | LOW | bug | none | PASS | DONE (onda 2, `1d882cf8`; premissa do plano corrigida: Next 16 exige 2º arg → `"max"`) |
| 021 | invite-user-atomicity | P2 | M | MED | bug | none | FIXED | DONE (onda 2, `5e4a531c`) |
| 022 | unlink-branch-last-branch-race | P2 | S | LOW | bug | none | FIXED | DONE (onda 3, `aaf2f159`) |
| 023 | tests-cpf-cnpj | P2 | S | LOW | tests | none (pairs with 025) | FIXED | DONE (onda 1, `c2c3c735`) |
| 024 | tests-cron-cancel-stale-orders | P2 | S | LOW | tests | none | FIXED | DONE (onda 1, `150d7c3f`) |
| 025 | dedup-cnpj-validator | P2 | S | LOW | tech-debt | plans/023-*.md (characterization tests for cpf-cnpj.ts) | FIXED | DONE (onda 2, `3d622414`) |
| 026 | update-tool-video-in-transaction | P3 | S | LOW | bug | none | FIXED | DONE (onda 2, `bee932ac`) |
| 027 | security-response-headers | P2 | M | MED | security | none | FIXED | DONE (onda 2, `42906fd0`; CSP report-only) |
| 028 | split-god-module-actions | P3 | M | MED | tech-debt | none | FIXED | DONE (re-do sem shim: `data.ts` server-only + consumers atualizados, commits `f6fdc11c`/`d2a93510`; ver `docs/superpowers/specs/2026-06-18-028-split-god-modules-design.md`) |
| 029 | decompose-branch-stock-edit-sheet | P3 | M | MED | tech-debt | none | FIXED | DONE (onda 1, `387e1491`; code-review OK, smoke visual 3 modos pré-merge-to-main) |
| 030 | structured-logger | P3 | M | LOW | dx | none | FIXED | DONE (onda 1, `4334879c`; requestId threading deferido) |
| 031 | dependency-hygiene | P3 | S | LOW | dependencies | none | PASS | DONE (onda 2, `6b242456`; bun.lock gitignore mantido por decisão; postcss pinado pelo next) |
| 032 | barrel-annotations-and-precommit | P3 | S | LOW | dx | none | FIXED | DONE (onda 3, `1017337e`; hooks instalam no próximo `bun install` via prepare) |
| 033 | env-import-better-auth-url | P3 | S | LOW | security | none | FIXED | DONE (onda 4, `bc50c82b`) |
| 034 | lgpd-anonymization-spike | P2 | M | MED | direction | none | FIXED | TODO |
| 035 | refund-request-actions-spike | P3 | M | MED | direction | none | FIXED | TODO |
| 036 | reorder-point-alerts-spike | P3 | M | LOW | direction | none | FIXED | TODO |
| 037 | bulk-moderation-actions-spike | P3 | M | LOW | direction | none | PASS | TODO |

### Notas de dependência (rodada 2026-06-17)

- **012** (capability guards em read actions) recomenda **014** (testes de branch-scope/capability) antes ou em paralelo — os testes caracterizam o comportamento atual e evitam regressão silenciosa ao adicionar os guards.
- **025** (dedup CNPJ validator) depende de **023** (testes de characterization de cpf-cnpj.ts) — consolidar sem cobertura de testes é risco de regressão.
- **028** e **029** são refactors de risco MED — rodar smoke visual nas rotas afetadas (actions de pedidos e sheet de estoque de filial) antes de marcar DONE.
- **034-037** são SPIKE/DESIGN — aprovar a direção com o produto antes de iniciar qualquer implementação; entregável é um documento de decisão, não código.

### Findings considered and rejected (rodada 2026-06-17)

- Credenciais reais em `apps/web/.env.example` (SECURITY-01): REJEITADO — alucinação do auditor; o arquivo só contém placeholders (`"<32+ chars random>"`, `"eyJ..."`, `"<password>"`, `"<64 chars hex>"`) e o relatório inventou chaves (RESEND/GOOGLE/UPSTASH/SUPERFRETE) que não existem nele. Verificado lendo o arquivo.
- `updateToolVariant` sem branch-scope (SECURITY-09): REJEITADO — catálogo é global por design (ADR-0016); mutação de variante de tool é intencionalmente não branch-scoped.
- `sql.raw` com strings hardcoded (SECURITY-10): REJEITADO — todos os inputs são literais de compile-time; seguro hoje, risco apenas latente; LOW.
- dev-preview só checa `NODE_ENV` no layout (SECURITY-11): REJEITADO — o guard funciona (`notFound` em prod); só fragilidade futura, LOW.
- shadcn/hono advisories (DEPS-05): REJEITADO — dev-only (gerador de código), não afeta build de produção.
- Falhas de `banner-schema.test.ts`: REJEITADO — não falham mais (54/359 verdes); eram pré-existentes já corrigidas.

### Não auditado nesta rodada

Performance foi auditada na rodada anterior (001-011). Itens de Tier 4 e Direction são backlog — os planos 034-037 capturam as oportunidades de direção identificadas, mas dependem de aprovação de produto antes de execução.

---

## Audit de arquitetura (rodada 2026-06-19, commit `03984800`, branch `arquiteruta2`)

Invocação `/improve-codebase-architecture` — foco **tech-debt & arquitetura**. Auditado via fan-out (6 dimensões: layering/boundaries, god-modules+ADR-0019, duplicação/abstração, RSC/Next, schema/db, dead-code/drift) + verificação adversarial por finding. **41 findings brutos → 38 confirmados → clusterizados em 14 planos** (38-51). Cada plano foi escrito por um agente que **re-leu o código real** contra o HEAD `03984800` (não confiou nos números de linha do audit).

**Tema central:** o padrão 3-camadas (ADR-0019: `data.ts` server-only + `_lib` puro + `actions.ts` thin) só foi aplicado a `tools/`+`promotions/` (plano 028). O resto do dashboard está inconsistente — daí o grosso dos planos. Os achados de **segurança** (038-040) surgiram incidentalmente no eixo arquitetura.

### Ordem de execução & status

| Plano | Título | Prioridade | Esforço | Risco | Categoria | Depende de | Status |
|-------|--------|------------|---------|-------|-----------|------------|--------|
| 038 | `zodErrorMessage` local → `actionErrorMessage` (para vazamento de SQL no toast) | P1 | S | LOW | security | — | DONE (branch `advisor/038-fix-zod-error-message-sql-leak`, commit `c05c8311`; review APPROVE — testes de não-vazamento auditados; lefthook agrupou os 4 arquivos em 1 commit) |
| 039 | `requireCapability("orders.read")` nas 5 read actions de orders (ADR-0018) | P1 | S | LOW | security | — | DONE (branch `advisor/039-orders-read-actions-capability-guard`, commit `edb9c0f9`; review APPROVE — 5 guards + teste do guard auditado, build verde) |
| 040 | Scrub PII + status estale do `RESET-PLAN.md` | P1 | S | LOW | security | — | DONE (branch `advisor/040-scrub-reset-plan-pii`, commit `d6c0db06`; review APPROVE — tombstone, zero PII na working tree. ⚠️ PII permanece no histórico git — purge cross-repo é decisão à parte) |
| 041 | Split `categories/` → `data.ts` + relocar mutations do `_lib` (ADR-0019) | P1 | M | MED | tech-debt | — | DONE (branch `advisor/041-split-categories-data-layer`, commit `ced2aaea`; review APPROVE após re-dispatch — 1ª tentativa teve REGRESSÃO de segurança (pages largaram `categories.read`); plano corrigido + guard restaurado em page.tsx:30/[id]/page.tsx:45) |
| 042 | Extrair 6 reads de `stock/actions.ts` → data modules; `branch-stock-data.ts`→`server-only` | P2 | M | MED | tech-debt | — | DONE (branch `advisor/042-extract-stock-reads-data-layer`, commit `b7bf7b67`; review APPROVE — expansão de escopo documentada selou bug latente de boundary em branch-stock-infinite.tsx) |
| 043 | `import "server-only"` nos `data.ts` faltantes (orders/customers/reviews/pending ×3) | P2 | S | LOW | tech-debt | — | DONE (branch `advisor/043-normalize-data-layer-server-only`; review APPROVE — 6 arquivos +2 cada, check-types/check/test/build verdes) |
| 044 | Split `queries/catalog.ts` (1166 LOC) em 4 contextos + extrair SQL promo duplicado | P2 | M | MED | tech-debt | — | DONE (branch `advisor/044-split-catalog-queries`, commit `517e6d4f`; review APPROVE — boundary ADR-0009 limpo, dedup `fetchPromoTools`. ⚠️ pós-merge: imports `@emach/db/queries/catalog` no **ecommerce** precisam migrar pros novos paths via PR de sync) |
| 045 | Consolidar ~12 sites de paginação keyset no helper `paginate()` | P2 | M | LOW | tech-debt | 041, 042 | DONE (mergeado, Onda C; review APPROVE — 9 sites migrados, cursor-shapes preservados; `fetchSupplierStockPage`+`fetchUsersPage` deixados hand-rolled c/ NOTE(045); `movements-data.ts` deferido — `encodeMovementCursor` API incompatível) |
| 046 | Dedup 4 helpers (`isCapabilityError`, `fetchActiveBranches`, branch-filter, `coerceDates`) | P3 | S | LOW | tech-debt | 044 | DONE (mergeado na arquiteruta2, Onda C; review APPROVE — branchId-override preservado, coerceDates→@emach/db/utils) |
| 047 | `getCategoryAncestors`: N queries seriais → 1 (CTE/path) + request-cache | P2 | S | LOW | perf | 041 | DONE (mergeado, Onda C; review APPROVE — WITH RECURSIVE CTE verificado idêntico ao loop; +cache(); fix de teste noUncheckedIndexedAccess pelo gate integrado) |
| 048 | Batch do N+1 (1+2N) de `getActivePromotions` | P2 | M | MED | perf | 044 | DONE (mergeado, Onda C; review APPROVE — batch ANY() 1+1+N verificado fiel ao 1+2N) |
| 049 | Decompor `branch-stock-edit-sheet` (follow-up do 029) + `order-action-column` import @emach/db | P3 | S | LOW | tech-debt | 029; 042 | DONE (mergeado, Onda C; review APPROVE — sheet 616→287 LOC, 3 componentes extraídos + cep-match.ts tira matchBranchByCep do import client) |
| 050 | Fix drift: índice de ADRs do CONTEXT.md + contradição trigger do db/CLAUDE.md + money-boundary | P2 | S | LOW | docs | — | DONE (branch `advisor/050-fix-context-and-db-doc-drift-v2`, commit `53f94b46`; review APPROVE — re-dispatch após STOP: plano refinado p/ incluir o 5º produtor de `BranchOrderRow` (`branches/actions.ts`); ambos coercem `Number()`, check-types verde) |
| 051 | Remover dead code `buildAttributeValuesSchema`/`buildOneAttributeSchema` (~83 LOC) | P3 | S | LOW | dead-code | — | DONE (branch `advisor/051-remove-orphan-attribute-schema`, commit `450a598b`; review APPROVE — só o bloco órfão + import removidos, check-types verde) |

Status: TODO | IN PROGRESS | DONE | BLOCKED (motivo) | REJECTED (motivo)

### Ordas recomendadas (arquivos disjuntos → paralelizável em worktrees)

- **Onda A — segurança + baratos (todos S, independentes):** 038, 039, 040, 043, 050, 051. Arquivos disjuntos; podem rodar em paralelo. (039 toca `orders/actions.ts`, 043 toca `orders/data.ts` — disjuntos.)
- **Onda B — splits de arquitetura (M, por feature):** 041 (categories), 042 (stock), 044 (catalog/packages-db). Features disjuntas → paralelizáveis. **Gate `bun run build` obrigatório** (regra de export de `"use server"`).
- **Onda C — dependentes (após B):** 045 (após 041+042), 046 (após 044), 047 (após 041), 048 (após 044), 049 (após 042).

### Notas de dependência (rodada 2026-06-19)

- **045** depende de **041**/**042** para os sites em `stock/*` e `categories/*` (não editar os mesmos arquivos concorrentemente); os sites em branches/customers/orders/tools/suppliers são independentes e podem ir primeiro. **Verificado pelo plan-writer:** `suppliers/data.ts:fetchSupplierStockPage` (enriquecimento async entre slice e build) e `users/data.ts:fetchUsersPage` (usa `limit` variável, não `BATCH_SIZE`) **não** são migráveis → ficam hand-rolled com comentário.
- **046** item 4 (`coerceDates`) toca `catalog.ts` — se **044** já tiver rodado, `coerceDates` pode estar em `catalog-helpers.ts`; o executor confere qual arquivo o contém.
- **047** edita `categories/actions.ts` OU `categories/data.ts` conforme **041** tenha rodado — recomenda-se 041 primeiro.
- **048** depende de **044** (o split extrai o bloco SQL promo compartilhado `buildPromoToolsFetch`, base do batch). Rodar 044 antes.
- **049** é follow-up do **029** (que ficou em 616 LOC, acima do próprio critério ≤450); coordena com **042** (o tipo `StockMovementRow` pode mudar de casa).
- **044**/**048** estão na **superfície de sync ADR-0009** (`packages/db/src/queries/`) — mudanças propagam ao ecommerce via CI PR; novos arquivos devem ficar dentro de `queries/`.

### Findings considerados e rejeitados (rodada 2026-06-19)

- **`loading.tsx` ausente em todas as rotas** (rsc): REJEITADO by-design — o #222 (`5ae12375`) removeu os 35 `loading.tsx` de propósito em favor da barra de progresso `@bprogress/next`. Re-adicionar reverteria decisão explícita.
- **`revalidateTag('site-banners')` no-op** (rsc): REJEITADO already-addressed — pré-fiação intencional do contrato de invalidação (plano 006, aguardando rollout de Cache Components); o bug real do 2º arg já foi corrigido pelo plano 020 (`"max"`).
- **ADR-0020 não marcado superseded** (dead-code): REJEITADO mis-attributed — ADR-0020 linha 4 **já** contém "⚠️ Superseded por ADR-0021" com link; sem gap de navegação.

### Não auditado / backlog

- Foco = tech-debt & arquitetura. Correctness/security/perf/tests **não** foram re-auditados em profundidade (rodadas anteriores: 001-011 perf, 012-037 completo).
- **Backlog não-planejado (O):** wrapper tipado para `db.execute` (~84 sites onde o type-system é bypassado — timestamp-string, snake_case). Esforço L, sem bug atual (footgun documentado em `packages/db/CLAUDE.md`). Candidato futuro, não virou plano.
- `graphify-out/` está estale (grafo de 2026-06-08, anterior ao split 028) — a análise desta rodada foi **direta** (rg/Read), não via graph.
