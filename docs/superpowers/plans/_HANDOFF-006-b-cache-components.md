# Handoff — 006-B Cache Components (Fase 1 ✅) + próximo: Opção A (skeletons de navegação)

> **Para retomar numa sessão nova, cole:** **"continue de @docs/superpowers/plans/_HANDOFF-006-b-cache-components.md"**
>
> Gerado 2026-06-19. Branch: `feat/006-b-cache-components` (cortada da `main` pós-#230).

## TL;DR (1 frase)

Fase 1 do Cache Components **+ Opção A (skeletons de navegação) DONE** na branch `feat/006-b-cache-components` — falta só **abrir o PR** (`finishing-a-development-branch`).

## ⚡ ATUALIZAÇÃO 2026-06-19 — Opção A concluída (mecanismo corrigido)

O plano original da Opção A (trocar `fallback={null}` no `<Suspense>` **interno** da page) estava **errado** — o piloto provou que o Suspense interno **não** serve de fallback de navegação (continua preto). O mecanismo canônico do Next sob `cacheComponents` é o **`loading.tsx` por segmento**.

**Feito:**
- `apps/web/src/components/page-skeletons.tsx` — **7 arquétipos coerentes**: `ListPageSkeleton` (variantes `media`/`identity`/`table`), `DetailPageSkeleton` (±`sideColumn`), `FormPageSkeleton`, `TreePageSkeleton`, `OrdersListSkeleton`, `DashboardHomeSkeleton`, `SettingsPageSkeleton`.
- **33 `loading.tsx`** — um por rota-folha, mapeado ao arquétipo certo. (3 rotas de stock = redirects puros → **sem** loading.tsx.)
- **Coerência verificada por workflow** (16 agentes) + leitura própria dos cards → variantes corrigidas (reviews=media, promotions=identity, orders=identity grid; revertidas minhas escolhas "table" erradas).
- **Gate verde:** `bun run verify` (check-types + lint + 513 testes) + build PPR (todas as rotas `◐`). Smoke visual: tools (skeleton na nav capturado), orders + promotions (conteúdo identity confere).

**Decisão chave:** `loading.tsx` (não Suspense interno) é o fallback de nav; o Suspense interno fica **puro** (só satisfação do build do cacheComponents). Reintroduz os `loading.tsx` que o #222 removeu — justificado: o freeze do #222 morreu sob cacheComponents.

**Falta:** abrir o PR. (Em dev, rota fria mostra o freeze-de-compile antes do skeleton — artefato dev-only; em prod o skeleton aparece direto.)

## Estado atual

- **Branch `feat/006-b-cache-components`**, 8 commits à frente da `main`. **PR ainda NÃO aberto.**
- Verde: `bun check-types` + `bun check` (lint) + **513 testes** + `bun run --cwd apps/web build` (**54 rotas em `◐ PPR` / `○ Static`**, exit 0).
- **Review final whole-branch (Opus): "Ready to merge: Yes", ZERO Critical.** Guards de capability + redirects todos preservados nos 43 arquivos.
- **Smoke (browser "Othavio", logado como super_admin):** `/dashboard`, `/dashboard/tools`, `/dashboard/orders` renderizam limpo com dados reais; `/login`→`/dashboard` (gate ok); **zero erro no console**.
- **Issue #231** aberta (hardening pré-existente do guard de `site/settings` — `requireCurrentSession` deveria ser `requireCapabilityOrRedirect("site.update_settings")`; baixa severidade, não desta branch).
- **Ambiente `/dev-up`:** server em `:3001` (bg, pode ter morrido entre turnos — re-checar `ss -ltn "sport = :3001"`), watcher Monitor, browser **"Othavio"** (o PC do user — usar `switch_browser` se nomes vierem genéricos; os outros Braves dão "error page" em localhost). Ledger SDD em `.superpowers/sdd/progress.md`.

## Decisões tomadas (NÃO re-litigar)

1. **Escopo = só a Fase 1** (fundação Cache Components); Fases 2-3 (cachear dado de referência com `use cache`) são roadmap.
2. **Abordagem A (componentizar):** `DashboardChrome` (async, sessão+gate+sidebar) + `SidebarSkeleton` sob `<Suspense>` no `dashboard/layout.tsx`. Alternativas `connection()`/Suspense-único descartadas.
3. **ZERO `use cache`** nesta fase — nenhum dado cacheado, tudo lê fresco no request.
4. **Auth no RSC, sem middleware** (respeita ADR-0021).
5. **`cacheComponents: true` é top-level** no `next.config.ts` (Next 16; o `experimental.cacheComponents` é deprecado).
6. **Escopo explodiu 6→43 arquivos** — o build é o oráculo: TODO `async page.tsx` precisou de `<Suspense>` + remoção de `force-dynamic`/`runtime` (proibidos sob cacheComponents). Usuário escolheu **"seguir com review rigoroso"** (não reverter). O review aprovou o sweep como estruturalmente sólido.
7. **Smoke:** usuário já está logado como super_admin no Brave real → confirmado o caso mais completo. **Decidido NÃO criar contas de teste no banco prod** pra admin/user/pending/suspended — a matriz está coberta pelo **teste automatizado do `DashboardChrome`** (pending→`/pending`, suspended→`/suspended`, active nos 3 roles) + o mesmo caminho de render já provado.
8. **⭐ Opção A (skeletons) escolhida** pra resolver a regressão de UX de navegação (ver abaixo). Reverter o PPR (Opção B) descartado.

## O que foi feito (8 commits na branch)

| Commit | O quê |
|---|---|
| `155db59a` | spec (`docs/superpowers/specs/2026-06-19-006-b-cache-components-foundation-design.md`) |
| `19502d5c` | plano de implementação (`docs/superpowers/plans/2026-06-19-006-b-cache-components-foundation.md`) |
| `44bccb1e` | **Task 1** — `DashboardChrome` + `SidebarSkeleton` + teste de regressão de auth (matriz 5 estados) |
| `7dc01785` | **Task 2** — `SidebarProvider` lê o cookie `sidebar_state` no client (useEffect; sem hydration mismatch) |
| `512a39b9` | **Task 3** — refactor do `dashboard/layout.tsx` (split: `<Suspense><DashboardChrome/></Suspense>`) |
| `6b741202` | **Task 4** — defere read de sessão nas 5 páginas auth/landing (`/`, login, pending, suspended, esqueci-senha) |
| `0fbd2ca2` | **Task 5** — liga `cacheComponents:true` + **sweep de 43 arquivos** (Suspense em ~38 pages, remoção de ~20 `force-dynamic`, Suspense em `providers.tsx`/`layout.tsx` por `usePathname`) |
| `bbf415b8` | polish do review (comentários explicando Suspense/usePathname + redirect do `/`) |

Executado via **subagent-driven-development** (1 implementer + 1 reviewer por task, todas aprovadas) + review final Opus.

---

## ⭐ PRÓXIMO PASSO: Opção A — skeletons de navegação (investigar → evidenciar → aplicar)

### O problema de UX (identificado pelo usuário, real — o review já tinha flagado como Minor #4)

**Sintoma:** ao navegar por clique na sidebar (ex: Ferramentas → Filiais), a barra de progresso topo carrega, troca de rota, mas a **área de conteúdo à direita aparece VAZIA/PRETA por um instante** e só depois os itens fazem stream e aparecem. Antes do PPR, o router **segurava a página atual** até o RSC novo estar pronto (a UX do **#222** = "navega só quando o conteúdo está na tela").

**Causa (onde mudou):** a **Task 5** (commit `0fbd2ca2`):
1. `cacheComponents: true` faz o **shell estático** chegar na hora → o router troca pra ele imediatamente (não segura mais a página antiga).
2. Os **~38 `<Suspense>` de página foram criados SEM `fallback`** → `fallback` default = `null` → a área de conteúdo renderiza **nada (preto)** enquanto o `XxxContent` faz stream. **Esse `null` É o flash preto.**

Isso **quebrou a decisão do #222** (freeze-até-pronto, sem skeleton) — porque sob PPR o freeze não funciona mais.

### A correção (Opção A): skeletons com a forma do conteúdo

Trocar `fallback={null}` por um **skeleton com a forma do conteúdo** em cada página → navegação vira **shell instantâneo → skeleton (forma certa) → conteúdo**. Mata o preto, **mantém** o ganho do PPR.

**Prós:**
- Elimina o flash preto; dá feedback imediato (a tela mostra "está carregando, com a forma certa").
- Mantém o PPR/static shell (não joga fora a Task 5).
- Indiscutivelmente **melhor que o feel antigo** (some o "stare na página velha" E some o preto).

**Cons / cuidados:**
- Re-introduz skeletons que o **#222 removeu de propósito** (os 35 `loading.tsx`). MAS: o mecanismo do #222 (freeze-da-página-atual) **não funciona mais sob PPR**, então skeleton volta a ser a ferramenta certa — não é "desfazer o #222", é adaptar à realidade do PPR.
- ~37 páginas precisam de fallback. Fazer via **componentes de skeleton compartilhados por arquétipo** (lista / detalhe / form) — NÃO um skeleton ad-hoc por página. Ver `DESIGN.md` (já tem padrões de card/skeleton; `SidebarSkeleton` da Task 1 é o exemplar de fallback).
- Cada skeleton deve casar a forma do conteúdo real (senão dá outro tipo de "pulo" no swap skeleton→conteúdo).

### Plano: investigar → evidenciar → aplicar

1. **Investigar:** achar todos os `<Suspense>` de página sem `fallback` (o sweep da Task 5). `rg "<Suspense>" apps/web/src/app/dashboard --type tsx` + identificar os arquétipos (listas com cards, detalhes `[id]`, forms `/new` e `/edit`). Mapear quais skeletons compartilhados cobrem cada grupo.
2. **Evidenciar (piloto):** colocar skeleton em **1 rota** (sugestão: `/dashboard/orders` = Pedidos, ou `/dashboard/tools`). Subir `/dev-up :3001`, navegar no browser "Othavio", e o **usuário compara** o skeleton vs o preto atual vs o feel antigo. Confirmar que é a UX desejada ANTES de rolar pras 37.
3. **Aplicar:** criar os componentes de skeleton compartilhados (lista/detalhe/form) + plugar como `fallback` nas ~37 páginas. Gate: `bun verify` + build PPR verde + smoke visual de algumas rotas (sem flash preto). Provavelmente cabe um plano curto (`writing-plans`) + `subagent-driven-development`, ou inline se ficar mecânico com os componentes prontos.

---

## Outros próximos passos (depois da Opção A)

- **`finishing-a-development-branch` → abrir o PR** da branch (com a evidência: build PPR + 513 testes + review Opus + smoke). Mencionar a issue #231 como follow-up.
- **Ao mergear:** `cacheComponents` é global — confirmar em prod/preview que o first-paint melhora e nenhuma rota serve stale (ZERO `use cache`, então tudo é fresco).
- **Deferido (roadmap):** Fases 2-3 do Cache Components (`use cache` + `revalidateTag` só em **referência global** — suppliers/categorias/catálogo/banners; **operacional NUNCA**). Matriz de roles visual (coberta por teste automatizado, contas prod não criadas).

## Ponteiros

- Spec: `docs/superpowers/specs/2026-06-19-006-b-cache-components-foundation-design.md`
- Plano: `docs/superpowers/plans/2026-06-19-006-b-cache-components-foundation.md`
- Ledger SDD: `.superpowers/sdd/progress.md` (todos os 5 tasks + review + smoke registrados)
- Exemplar de fallback: `apps/web/src/app/dashboard/_components/sidebar-skeleton.tsx` (Task 1)
- Decisão de UX do #222 (loading.tsx → barra de progresso, freeze): memória do projeto + `docs/superpowers/{specs,plans}/2026-06-18-navegacao-progress-bar*`
- ADR-0021 (sem middleware de sessão), ADR-0019 (3-camadas), `next-cache-components` (sintaxe da flag)
