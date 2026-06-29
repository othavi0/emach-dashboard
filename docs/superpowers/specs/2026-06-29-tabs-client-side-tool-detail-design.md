# Design — Tabs client-side no detalhe da ferramenta (piloto)

**Data:** 2026-06-29
**Status:** Aprovado (pendente review do spec)
**Relaciona:** ADR-0023 (staleTimes — cache de revisita no Router Cache), ADR-0022 (freeze de navegação #222), ADR-0016 (gate de status/role). Entity detail pattern (`DESIGN.md` §4, `apps/web/CLAUDE.md`).

## Problema

Toda troca de tab no detalhe de entidade hoje é uma **navegação por search param** (`?tab=` via `router.replace`), que re-renderiza o Server Component da página no servidor. Para o tool detail, cada troca re-executa:

- `requireCurrentSession()` — 1 query de sessão
- `can(...)` — 0 query (super_admin) ou 1–2 (admin/user)
- **`getToolDetail(id)` — 7 queries** (o desperdício real: as tabs visão-geral/variantes/estoque fatiam o **mesmo** objeto `detail`)
- query da tab ativa — 1–2

O `staleTimes` (ADR-0023) já cacheia o **resultado** dessa navegação no cliente, tornando **revisitas** instantâneas. Mas a **1ª abertura** de cada tab ainda paga o round-trip + re-auth + re-busca do `detail` que o cliente já tinha. Medição: servidores (app + Postgres `sa-east-1`) estão no Brasil — o custo é **execução + nº de queries**, não latência de rede. Não faz sentido re-autenticar e re-buscar dados ao trocar de tab estando numa rota já autenticada.

## Decisão

Tornar a navegação entre tabs **100% client-side** no detalhe da ferramenta: trocar de tab não toca o servidor (zero re-auth, zero re-busca do `detail`). **Piloto** restrito ao tool detail; o `EntityTabs` compartilhado (server-nav) fica intacto para as outras 8 páginas de detalhe, que migram depois.

## Arquitetura

### Modelo de render

A página `ToolDetailPageContent` (Server Component) continua rodando **uma vez** na entrada: auth + `getToolDetail(id)` → `detail`. A diferença é o que ela monta:

- **Tabs eager** (visão-geral, variantes, estoque): conteúdo derivado inteiramente de `detail`. Renderizadas como Server Components **uma vez** e passadas como `ReactNode` (props) para o shell client. Trocar entre elas é Base UI puro com `keepMounted` — instantâneo, sem servidor.
- **Tabs lazy** (atividade, avaliações): dado pesado/extra. O shell monta o loader **só na 1ª ativação**; o loader (client) busca via `"use server"` action, renderiza a view existente e mantém montado (cache no próprio estado).

### Shell client (componente novo)

`tool-detail-tabs.tsx` (client) — local ao tool detail no piloto; generaliza para `EntityTabs` numa migração futura. Responsabilidades:

- Renderiza um **único `<Tabs>` do Base UI** envolvendo **header + lista de tabs + painéis** (para o header compartilhar o estado da tab ativa — ver abaixo).
- Estado `activeTab` inicializado de uma prop (`initialTab`, lida do `?tab=` no servidor).
- Painéis eager: renderizam o `ReactNode` recebido, `keepMounted`.
- Painéis lazy: renderizam o loader recebido **apenas após a 1ª ativação** (`activated.has(value) ? loader : <Skeleton/>`); uma vez ativado, fica montado.
- **URL sync:** `onValueChange` → `setActive(next)` + `window.history.replaceState(null, "", url)` com o `?tab=` atualizado. **Nunca `router.replace`** (dispararia RSC). Listener de `popstate` sincroniza `activeTab` no voltar/avançar do browser.

### Estado da tab ativa compartilhado com o header

A ação contextual do header (`ToolDetailActions` — "Editar ferramenta" só na visão-geral) hoje recebe `tab` calculado no servidor. Passa a **ler a tab ativa de um React Context próprio do shell** (`TabActiveContext`, provido pelo shell client que detém o estado `activeTab`; **não Zustand** — estado local de uma página, e Context próprio evita depender do Base UI expor seu estado interno a descendentes arbitrários). Para isso, o header (Server Component, com seu slot de `actions`) é renderizado **dentro** do provider do shell. `ToolDetailActions` vira client component que consome o context e renderiza a ação certa — funciona mesmo o header sendo server (padrão "client context + server children").

### Loaders lazy + auth

- `ActivityTabLoader` (client): na montagem, chama uma `"use server"` action que envolve `fetchToolActivityPage` + `getActiveBranches` com `requireCapability`; renderiza o `ActivityTabClient` existente com os dados.
- `ReviewsTabLoader` (client): idem, action envolvendo `getToolReviewsSummary` com guard; renderiza `ToolReviewsSection`.
- Auth roda **fresca por chamada da action** (sem janela de staleness), mas só dispara na 1ª abertura da tab — não a cada troca.

### Suppliers do estoque

`getActiveSuppliers` (hoje carregado na tab estoque, usado só na sheet de entrada) passa a ser buscado **na abertura da sheet**, não na abertura da tab — tira 1 query do caminho de render do estoque.

## Fluxo de dados

1. **Entrada (servidor, 1×):** auth + `getToolDetail` → `detail`. Renderiza `OverviewTab`/`VariantsTab`/`EstoqueTab` (server) de `detail`. Passa esses nós + os loaders lazy (elementos client) + `initialTab` (do `?tab=`) ao shell.
2. **Shell (client):** Base UI Tabs com `value=activeTab`. Troca → `setActive` + `history.replaceState`. Eager: nós já prontos, escondidos/mostrados. Lazy: monta loader na 1ª ativação.
3. **Loader lazy (client):** monta → chama action `"use server"` → dados → renderiza a view; cacheia no estado (fica montado).
4. **Header:** `ToolDetailActions` (client) lê `activeTab` do contexto e mostra a ação.

## Raio de impacto

**Criar:**
- `tool-detail-tabs.tsx` (shell client)
- `activity-tab-loader.tsx` + `reviews-tab-loader.tsx` (client)
- 2 wrappers `"use server"` (actions) para os dados lazy, com `requireCapability`

**Alterar:**
- `tools/[id]/page.tsx` — montar eager de `detail`, passar props ao shell, ler `?tab` para `initialTab`
- `tool-detail-actions.tsx` — vira client, lê contexto do Tabs
- `estoque-tab.tsx` — suppliers buscados na sheet

**Intacto:**
- `EntityTabs` compartilhado (server-nav) — as outras 8 páginas de detalhe não mudam
- `OverviewTab`/`VariantsTab`/`EstoqueTab` (core) — continuam server, passados como props
- `ActivityTabClient`/`ToolReviewsSection` — reusados pelos loaders

## Trade-offs

- A 1ª carga renderiza o markup das 3 tabs eager de uma vez — barato (mesmo `detail`, sem queries extras), só mais HTML.
- Tab lazy mostra skeleton breve na 1ª abertura (inclusive em deep-link `?tab=atividade`) — decisão aprovada (simplicidade > evitar o flash).
- Mais peças que o modelo server, mas isoladas no tool detail (piloto).
- Mutações (editar/ajustar estoque) continuam revalidando via os caminhos existentes (`revalidatePath`/`router.refresh`); o shell client não altera isso.

## Restrições técnicas (do projeto)

- `"use server"`: actions são async functions; **não** re-exportar não-async de arquivo `"use server"` (quebra o build — não pego por `check-types`/lint). Gate: `bun run build`.
- React Compiler ativo — sem `useMemo`/`useCallback` manuais.
- Client Component não importa fn de módulo `server-only`/`@emach/db` — os dados lazy vêm via `"use server"` action; tipos via `import type`.

## Verificação

- **Resource Timing:** trocar entre visão-geral/variantes/estoque = **0 requests**; tab lazy = 1 request na 1ª abertura, 0 ao reabrir.
- Ação do header alterna ao entrar/sair de visão-geral.
- Deep-link `?tab=estoque` e `?tab=atividade` abrem a tab certa; voltar/avançar do browser (popstate) sincroniza.
- Mutações revalidam.
- `bun verify` (check-types + check + test) **e** `bun run build` (gate do `"use server"`); smoke visual no browser (Resource Timing acima).

## Fora de escopo

- Migrar as outras 8 páginas de detalhe (branches, customers, suppliers, promotions, categories, users, carriers, orders) — migração futura, página a página.
- Generalizar o shell client em `EntityTabs` — após o piloto provar o padrão.
- Cache server-side de dados (`unstable_cache`/`cacheTag`) — alternativa não escolhida; complementar, não necessária aqui.
