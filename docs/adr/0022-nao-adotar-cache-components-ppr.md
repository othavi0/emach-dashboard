# ADR 0022 — Não adotar Cache Components (PPR) no dashboard

**Data:** 2026-06-19
**Status:** Aceito
**Relaciona:** Spec do #222 (`docs/superpowers/specs/2026-06-18-navegacao-progress-bar-design.md` — freeze de navegação + barra de progresso). Spec/plano do 006-B (`docs/superpowers/{specs,plans}/2026-06-19-006-b-cache-components-foundation*` — a tentativa revertida). ADR-0021 (sessão lida fresca a cada request).

## Contexto

O #222 trocou os `loading.tsx` por uma **barra de progresso no topo** + o "freeze de navegação": ao remover o `loading.tsx` de um segmento, a navegação soft vira uma React transition que **segura a página atual visível** até o conteúdo novo resolver, trocando de uma vez no commit. UX preferida — a página não pisca para um skeleton.

O próprio #222 registrou um ponto em aberto: o `DashboardLayout` bloqueia o shell inteiro no hard load (await de sessão + caps + counts antes de qualquer pixel), e marcou isso como **candidato a PPR**. O **006-B** foi essa tentativa: habilitar `cacheComponents: true` (Partial Prerendering do Next 16) para prerenderizar a casca estática por rota e melhorar o first-paint.

Ao executar, descobriu-se um **conflito fundamental** entre PPR e o freeze do #222, mapeado empiricamente (validação em **prod local** — `next build` + `next start` — porque o **dev engana**: não prerenderiza a casca estática, então o comportamento de navegação no dev ≠ prod).

## Aprendizados (a mecânica do conflito)

1. **PPR não tem freeze.** Sob `cacheComponents`, a casca estática da **rota nova** é exibida na navegação **na hora** (prefetchada). Não existe "segurar a página antiga" — a casca nova vence. A casca só pode ser **skeleton** ou **null (tela preta)**; nunca a página anterior.
2. **`<Suspense fallback={null}>` interno = casca preta.** O PPR exige que todo read dinâmico (`cookies`/`searchParams`/`session`) fique sob um `<Suspense>`. Um Suspense interno com `fallback` vazio vira a casca estática prerenderizada → renderiza **null (preto)** na navegação, antes do conteúdo.
3. **`loading.tsx` é bypassed pela casca prefetchada.** Pôr o skeleton no `loading.tsx` **não** resolve: a casca estática (o Suspense interno null) tem **precedência** no prefetch. Sequência observada: clica → skeleton do `loading.tsx` pisca → casca null (preto) → conteúdo.
4. **Para skeleton-sem-preto sob PPR**, a casca estática tem que **SER** o skeleton: remover o `<Suspense>` interno → o read dinâmico suspende direto no boundary do `loading.tsx` → a casca estática passa a ser o skeleton. Isso funciona (validado: tools/media e suppliers/identity mostram skeleton na nav, sem preto). Mas entrega **skeleton**, não o **freeze** — são UX mutuamente exclusivas sob PPR.

## Decisão

**Não habilitar `cacheComponents`. Manter o freeze de navegação do #222** (sem `loading.tsx`, páginas dinâmicas, barra de progresso).

A UX desejada — segurar a página atual + barra no topo, sem skeleton nem preto — é **incompatível com PPR**. E o ganho do PPR para **este** dashboard é marginal: como é autenticado e quase tudo é dinâmico/session-gated, a casca estática é praticamente vazia; a **velocidade** de navegação percebida vem do **client-routing do Next**, não do PPR.

## Opções consideradas

- **A (escolhida)** — desligar `cacheComponents`, manter o freeze do #222. Páginas viram dinâmicas (`ƒ`) automaticamente (leem sessão/`searchParams`). Entrega exatamente a UX preferida; custo ~zero (a velocidade é do client-routing). Mantém as melhorias de arquitetura do 006-B que não dependem de PPR (split do `DashboardChrome`, defer de sessão nas páginas auth).
- **B (rejeitada)** — manter `cacheComponents` com **skeletons** coerentes por arquétipo (casca estática = skeleton). Funciona e some o preto, mas força skeleton na navegação (não o freeze) — UX que o usuário rejeitou.
- **C (rejeitada)** — manter `cacheComponents` com a casca null. Rejeitada: é a própria tela preta reportada.
- **D (não perseguida)** — desabilitar prefetch para tentar recuperar o freeze sob PPR. Rejeitada: prejudica a performance que motiva o PPR e a combinação é frágil/não-documentada.

## Consequências

- **Freeze do #222 preservado:** navegação soft segura a página atual + barra de progresso; sem skeleton, sem preto. (Validado em prod local.)
- **PPR descartado para o dashboard.** O ponto em aberto do #222 (hard-load do `DashboardLayout` bloqueando o shell) **não** é resolvido por PPR — endereçá-lo, se virar prioridade, é via paralelizar/cachear melhor os `await` do layout, não via Cache Components. O hard-load (F5/URL direta) mostra sidebar + conteúdo em branco até a query resolver, como no #222 (caso raro, aceito).
- **Arquitetura mantida do 006-B:** o split do `DashboardChrome` (sessão+gate+sidebar num RSC async sob `<Suspense fallback={<SidebarSkeleton/>}>`) fica — a sidebar streama no hard-load em vez de bloquar o layout. Efeito colateral: um skeleton **breve** da sidebar só no hard-load (não na navegação).
- **`force-dynamic` não é necessário:** sem `cacheComponents`, as páginas que leem sessão/`searchParams` são detectadas como dinâmicas automaticamente.
- **Disciplina de verificação:** comportamento de navegação sob/sem PPR **só é confiável em `next build` + `next start`** — o `next dev` não prerenderiza a casca estática e mascara o resultado real. Registrar isso evita repetir o ciclo de diagnóstico.
