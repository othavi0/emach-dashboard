# ADR 0024 — Tabs client-side no detalhe de entidade (piloto tool detail)

**Data:** 2026-06-29
**Status:** Aceito (piloto — `tools/[id]`; generalização para as outras 8 páginas é follow-up)
**Relaciona:** ADR-0023 (`staleTimes` — cache de revisita no Router Cache), ADR-0022 (freeze de navegação #222), ADR-0016 (gate de status/role). Entity detail pattern (`DESIGN.md` §4, `apps/web/CLAUDE.md`). PR #259.

## Contexto

No Entity detail pattern, trocar de tab era uma navegação por search param (`?tab=` via `router.replace`), que re-renderiza o Server Component da página no servidor. Para `tools/[id]`, cada troca re-executava: `requireCurrentSession()` (1 query) + `can(...)` + **`getToolDetail(id)` (7 queries — o desperdício real: as tabs visão-geral/variantes/estoque fatiam o mesmo objeto `detail`)** + a query da tab ativa.

O `staleTimes` (ADR-0023) já cacheia o resultado dessa navegação no cliente, tornando **revisitas** instantâneas. Mas a **1ª abertura** de cada tab ainda pagava o round-trip: re-validava a sessão e re-buscava o `detail` que o cliente já tinha. Com app + Postgres no Brasil (`sa-east-1`), o custo é execução + nº de queries, não latência de rede. Não faz sentido re-autenticar e re-buscar dados ao trocar de tab estando numa rota já autenticada.

## Decisão

No detalhe da ferramenta (`tools/[id]`), tornar a navegação entre tabs **100% client-side**: trocar de tab não toca o servidor.

- **Shell client** (`ToolDetailTabs`): controla a tab ativa, sincroniza a URL via `window.history.replaceState` (**não** `router.replace` — isso dispararia RSC), e expõe a tab ativa por um **React Context próprio**. Listener de `popstate` cobre voltar/avançar do browser. `initialTab` (lido de `?tab=` no servidor) é clampado a valores conhecidos.
- **Tabs eager** (visão-geral, variantes, estoque): conteúdo derivado de `detail`, renderizado **uma vez** como Server Component e passado como prop ao shell. Trocar entre elas é Base UI puro (`keepMounted`) — instantâneo, sem servidor.
- **Tabs lazy** (atividade, avaliações): loader client busca via `"use server"` action na 1ª ativação (com `requireCapability` — `stock.read` / `reviews.read`), com error state + retry; cacheadas ao reabrir.
- **Ação do header** reativa no cliente via `useActiveTab` (substitui a decisão server-side por `sp.tab`).

**Piloto** restrito ao tool detail. O `EntityTabs` compartilhado (server-nav) permanece para as outras 8 páginas de detalhe, que migram aos poucos (follow-up).

## Opções consideradas

- **A (escolhida)** — tabs client-side, piloto no tool detail. Elimina o round-trip por troca de tab (re-auth + re-busca do `detail`). Verificado: trocar entre tabs eager = 0 requests (Resource Timing). Custo: refactor do padrão de navegação (isolado no piloto), e uma janela menor de robustez (error state nos loaders, resolvida).
- **B (rejeitada agora)** — cachear `getToolDetail` no servidor (`unstable_cache`/`cacheTag`), mantendo as tabs server-nav. Mataria as 7 queries redundantes sem refactor client, e sem trade-off de auth — mas mantém um round-trip + re-auth por troca de tab. Reservado como alternativa caso a migração das 8 páginas não se justifique.
- **C (rejeitada)** — reabrir `cookieCache` (ADR-0021) para baratear a re-auth. Já rejeitado por medição de prod; com tabs client-side a re-auth por troca simplesmente desaparece, tornando o ganho irrelevante.
- **Zustand** — descartado: o estado da tab ativa é local da página (React Context basta); cache de dados de servidor por tab seria TanStack Query, não Zustand. Nenhum dos dois é necessário no piloto.

## Consequências

- **Trocar de tab no tool detail não toca o servidor** (0 requests; verificado em dev e via build). Header reativo no cliente; URL `?tab=` preservada (deep-link + voltar/avançar via `popstate`).
- A **1ª carga** da página renderiza o markup das 3 tabs eager de uma vez — barato (mesmo `detail`, sem queries extras). Tabs lazy mostram skeleton breve na 1ª abertura (inclusive deep-link).
- **Invariante P0 mantido fresco:** a auth das tabs lazy roda por chamada da `"use server"` action (`requireCapability`), sem janela de staleness — diferente do trade-off de revisita do `staleTimes` (ADR-0023) e do `cookieCache` (ADR-0021).
- **Estado dual e consciente:** `tools/[id]` é client-side; as outras 8 páginas de detalhe seguem o `EntityTabs` server-nav (ADR/DESIGN documentam ambos). Generalizar o shell em `EntityTabs` e migrar as 8 é follow-up rastreado em issue.
- **Pendência conhecida (follow-up):** atalhos in-content que linkam para outra tab (ex: "Ver aba →") ainda usam `<Link>` (server-nav) — não regressão, mas devem passar pelo tab switcher client para 100% client-side.
