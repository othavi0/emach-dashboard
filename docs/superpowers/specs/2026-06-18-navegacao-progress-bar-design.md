# Barra de progresso de navegação (substituir skeleton)

> Spec de design. Data: 2026-06-18. Topo: UX de navegação do dashboard.

## Objetivo

Trocar o skeleton-por-rota (`loading.tsx`) por uma barra fina no topo da tela que
corre enquanto a navegação está "segurando", mantendo a página atual **visível e
intacta** até o conteúdo novo chegar — em vez de substituir a tela inteira por um
skeleton.

Motivação: em navegação soft (clicar na sidebar / links internos), o skeleton
pisca a tela inteira e descarta o contexto visual. Uma barra de progresso no topo
sinaliza "carregando" sem destruir a página atual — percepção de UX mais fluida.

## Abordagem

Combinar dois mecanismos:

1. **Comportamento nativo do Next 16 App Router:** ao **remover** o `loading.tsx`
   de um segmento, a navegação soft deixa de ter fallback de Suspense e vira uma
   React transition que **segura a página atual visível** até os dados resolverem,
   trocando de uma vez no commit. É exatamente o "congelar" desejado.
2. **`@bprogress/next`** (reimplementação TS mantida do NProgress) para a barra
   global. Intercepta cliques em `<a>`/`<Link>` e os métodos do router
   (`router.push`/`replace`) e **completa a barra quando a URL muda no commit**
   (não cobre o voltar/avançar nativo do browser — ver tabela de Comportamento) — como o
   commit só ocorre quando os dados chegam (sem `loading.tsx`), a barra corre
   exatamente durante o "segurar".

Alternativas descartadas:

- **Hand-rolled nativo** (patch próprio de `history` + interceptação de clicks +
  detecção de fim via `usePathname`/`useSearchParams`): reimplementa o que o
  BProgress já faz; mais código, mais superfície de bug, manutenção nossa.
- **`useLinkStatus` nativo**: é per-`<Link>`, não cobre `router.push` nem
  voltar/avançar — não serve para barra global.
- **Manter skeleton em rotas pesadas / skeleton mínimo só no hard load**: o
  `loading.tsx` não distingue soft de hard load (aparece nos dois). Optou-se por
  remover todos, por consistência.

## Mudanças

### 1. Dependência

Adicionar `@bprogress/next` em `apps/web`.

### 2. `apps/web/src/components/providers.tsx`

Envolver `children` com `<ProgressProvider>` de `@bprogress/next/app`. Config:

- `color="oklch(0.65 0.13 38)"` — coral `--primary` (cor de ação/ring/charts do
  dashboard).
- `height="2px"` — fina, combina com a sobriedade do dashboard dark.
- `options={{ showSpinner: false }}` — sem spinner de canto.
- `delay={0}` — mostrar imediato (feedback de que o clique pegou; aceita-se o
  flash em navegação instantânea).
- `targetPreprocessor` usando `isSameURLWithoutSearch` (exportado pelo BProgress):
  retorna `null` quando a navegação muda **só o search param** (mesmo pathname).
  Resultado: **só mudança de pathname dispara a barra**.

O `Providers` já é Client Component (`"use client"`), então o `ProgressProvider`
entra direto. O `<Toaster>` existente permanece.

### 3. Remover os 42 `loading.tsx`

Remover todos os `apps/web/src/app/dashboard/**/loading.tsx`. Lista completa
(verificar com `bfs apps/web/src/app/dashboard -name loading.tsx` no momento da
implementação — pode ter mudado):

`branches`, `categories`, `customers`, `orders`, `promotions`, `reviews`,
`suppliers`, `tools`, `users` (listagens) + os respectivos `[id]`, `[id]/edit`,
`new`, e os aninhados (`stock/branches`, `stock/movements`, `branches/[id]/stock`,
`branches/[id]`, `branches/new`, `site/settings`, `site/banners`,
`site/banners/new`, `site/banners/[id]/edit`, `tools/[id]/stock`, etc.).

**Não** remover:

- O `<Suspense>` dentro de `dashboard/page.tsx` — é streaming de widgets da visão
  geral (component-level), não skeleton de rota. Coexiste com a barra.

## Comportamento

| Cenário | Resultado |
|---|---|
| Soft nav (sidebar, link interno, `router.push`) p/ outro pathname | Página atual congela; barra coral 2px corre no topo; troca no commit |
| Navegação para a mesma URL exata | Sem barra (`disableSameURL`, default `true`) |
| Troca de `?tab=` / filtro URL / `?edit=1` drawer (mesmo pathname) | Sem barra (`targetPreprocessor`) |
| Voltar/avançar nativo do browser (popstate) | **Sem barra** — o BProgress não intercepta popstate (não há listener no código-fonte). Aceito: medido que essas navegações são servidas instantâneas do client router cache do Next (sem refetch no servidor), logo não há espera a sinalizar. |
| Hard load / F5 / URL direta | Sidebar + conteúdo em branco até a query resolver (sem skeleton) — regressão aceita no caso raro |

### Política de query-param (decisão explícita)

Barra **só em mudança de pathname**. Esperas no mesmo pathname (aba-lazy modo-1
via `router.push` para `?tab=`, filtros que refazem query) **não** mostram
feedback. Trade-off aceito: zero ruído em trocas instantâneas (aba modo-2 com
conteúdo pré-renderizado via `router.replace`, abrir drawer) em troca de não
sinalizar as esperas same-path.

## Acessibilidade e motion (defaults de boa prática)

- A barra é `aria-hidden`.
- Região `aria-live="polite"` visualmente escondida anuncia "Carregando…" no
  início da navegação — a barra visual sozinha não é anunciada a leitor de tela.
  (Avaliar na implementação se o BProgress já oferece hook de start/stop para
  alimentar a região; senão, um pequeno componente cliente que observa o estado
  via `useProgress`.)
- `prefers-reduced-motion`: manter a barra (transição de posição é suave); sem
  efeitos extras.

## Pontos de melhoria identificados (fora do escopo — registrados)

1. **`DashboardLayout` bloqueia o shell inteiro no hard load:** dá `await` em
   session + `can()` + `getUserCapabilities` + `pendingCount` + `fetchDashboardCounts`
   antes de renderizar qualquer pixel. É o real gargalo de latência percebida no
   refresh, independente de skeleton/barra. Candidato a PPR (prerender da sidebar)
   ou paralelizar/cachear melhor. **Não tratado aqui.**
2. **Esperas no mesmo pathname perdem feedback** com a política "só pathname". Se
   alguma aba-lazy ou filtro for lento de fato, considerar um indicador inline
   localizado depois (ex: `useLinkStatus` na tab, ou spinner discreto no conteúdo).
   Gap conhecido da escolha.
3. **`useProgress` para mutações com redirect:** server actions que fazem
   `redirect`/`router.push` pós-submit já são cobertas pela barra global. Mostrar a
   barra durante o processamento do submit (antes do redirect) seria uma extensão
   futura via `useProgress` — fora do escopo (escopo é navegação, não submit).

## Verificação

- `bun check-types` + `bun check` (ultracite).
- Smoke visual no browser (tab `localhost:3006`):
  - Clicar pela sidebar entre rotas → barra coral aparece e some no commit; página
    anterior fica visível durante a espera.
  - Trocar `?tab=` numa entidade (ex: detalhe de filial) → **sem** barra.
  - Abrir drawer `?edit=1` (se aplicável) → **sem** barra.
  - F5 numa rota → **sem** skeleton (sidebar + conteúdo em branco até a query).
  - Voltar/avançar do browser → **sem** barra (servido do cache, instantâneo) — comportamento aceito.
- Validar ao vivo que o `targetPreprocessor` suprime corretamente as mudanças
  same-path e que `router.push`/`router.replace`/popstate são todos cobertos pelo
  BProgress da forma esperada (ponto de incerteza a confirmar no browser).
