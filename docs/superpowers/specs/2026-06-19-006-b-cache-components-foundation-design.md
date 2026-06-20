# 006-B Fase 1 — Fundação Cache Components (design)

> **Status:** Aprovado no brainstorming (2026-06-19), pronto pra virar plano de implementação.
> **Base:** branch `feat/006-b-cache-components`, cortada da `main` pós-#230 (2026-06-19).
> **Relaciona:** `plans/_HANDOFF-arquiteruta2.md`, `plans/_NEXT-SESSION.md` (decisão de 2026-06-17), `plans/006-A-remove-force-dynamic.md`, ADR-0021 (remoção do middleware de sessão). Skill de sintaxe: `next-cache-components`.

## 1. Contexto e motivação

O dashboard tem 2,5 de 3 alavancas de perf ligadas (streaming + bundle ✅; data-fetching paralelizado ✅). A que falta é o **cache cross-request**, bloqueada porque ligar `cacheComponents: true` quebra o build: layouts/páginas leem sessão (`await getCurrentSession()`/`requireCurrentSession()`) no topo, sem `<Suspense>`, o que viola o modelo do Cache Components (Next 16).

Decisão de 2026-06-17 (registrada em `_NEXT-SESSION.md`): fazer Cache Components **faseado e conservador**, porque a superfície é pequena AGORA (≈20 rotas, 1 layout) e refatorar o layout auth-crítico só fica mais caro com o tempo. O prêmio de UX é first-paint por static shell (aplica a toda rota, independe de volume de dado).

**Nuance honesta (confirmada no brainstorming):** num admin auth-gated com sidebar filtrada por capability, o ganho do static shell é **real mas fino** — o conteúdo que importa é session-dependent e sempre streama. O prêmio grande está nas **Fases 2-3** (cachear dado de referência). **Esta Fase 1 é a fundação limpa que habilita isso**, com UX de carregamento progressiva decente de brinde.

## 2. Decisão e escopo (Fase 1 — SÓ a fundação)

- Ligar `cacheComponents: true` no `apps/web/next.config.ts`.
- **ZERO cache de dado** — nenhum `use cache` nesta fase. Todo dado segue lido no request (nas dynamic holes).
- Refatorar os pontos que travam o build pra deferir os reads dinâmicos abaixo de `<Suspense>`.
- **Gate de sucesso:** build verde + **auth 100% idêntica** (5 estados) + toda rota ainda dinâmica/fresca.
- **Fora de escopo:** cachear qualquer dado (Fases 2-3). Dado **operacional** (pedidos/estoque/KPIs) **nunca** será cacheado (correção + branch-scoped/per-user; `use cache` nem enxerga cookies).

### Decisões tomadas no brainstorming (não re-litigar)
1. **Escopo = só a Fase 1** (fundação), Fases 2-3 ficam como roadmap.
2. **Verificação de auth = smoke multi-role (5 estados) + teste de regressão automatizado.**
3. **Estrutura do refactor = abordagem A (componentizar / split limpo).** Alternativas `connection()` e Suspense-único-mínimo descartadas (a 1ª é cerimônia redundante aqui; a 2ª dá shell fino + flash de skeleton de tela cheia).
4. **Auth fica no RSC, sem middleware** (respeita ADR-0021, que removeu middleware de sessão por cold-load + freshness).

## 3. Raio de impacto (recon confirmado; o build é o oráculo final)

| Tocar | O quê |
|---|---|
| **1 refactor grande** | `apps/web/src/app/dashboard/layout.tsx` (abordagem A) |
| **5 deferrals pequenos** | `app/page.tsx` (`/`), `app/login/page.tsx`, `app/pending/page.tsx`, `app/suspended/page.tsx`, `app/esqueci-senha/page.tsx` — cada um defere o `await getCurrentSession()` do topo |
| **1 flag** | `cacheComponents: true` em `next.config.ts` |
| **Seguros (não tocar)** | root layout `app/layout.tsx` (sync, sem read), `AppHeader` (`"use client"`), `providers.tsx` (`"use client"`), `dashboard/dev-preview/layout.tsx` (sem read) |

> Procedimento: ligar o flag → `bun run build` → corrigir cada blocker que o build reportar. A tabela acima é o conjunto **esperado**; o build é a autoridade (pode revelar 1-2 a mais).

## 4. Arquitetura — refactor do dashboard layout (abordagem A)

Hoje (`dashboard/layout.tsx`): `await requireCurrentSession()` na primeira linha bloqueia o render de todas as ~19 rotas dashboard.

Depois:

```tsx
// layout.tsx — SEM await no topo → o frame prerenderiza
export default function DashboardLayout({ children }) {
  return (
    <SidebarProvider defaultOpen={/* ver §5: cookie sidebarOpen */}>
      <Suspense fallback={<SidebarSkeleton />}>
        <DashboardChrome />     {/* NOVO async: a dynamic hole */}
      </Suspense>
      <SidebarInset>
        <header className="… md:hidden">…</header>   {/* estático */}
        <div className="…">{children}</div>          {/* página streama o seu */}
      </SidebarInset>
    </SidebarProvider>
  );
}
```

Componentes novos:
- **`DashboardChrome`** (async RSC) — concentra TUDO session-dependent: `requireCurrentSession()`, o gate `pending`/`suspended` (`redirect()`), `getUserCapabilities`/`can`, o `countsPromise` (já não-aguardado), e renderiza `<AppSidebar …/>`. É a única "dynamic hole" do layout.
- **`SidebarSkeleton`** — fallback do `<Suspense>`: a estrutura visual da sidebar sem os items (que chegam com a sessão).

## 5. Data flow — o que prerenderiza vs o que streama

- **Estático (servido instantâneo):** `html`/`body` + fontes (root layout), frame do `SidebarProvider`/`SidebarInset`, header mobile, o slot onde `{children}` entra.
- **Streama (sob `<Suspense>`):** `DashboardChrome` (sessão → `AppSidebar` com avatar, nav filtrada por capability, badges de counts) + o conteúdo de cada página (cada page já tem seu `requireCapabilityOrRedirect` + data-fetching).
- **Redirect `pending`/`suspended`:** roda **dentro** do `DashboardChrome` (RSC dinâmico — `redirect()` funciona sob Suspense). **Sem middleware** (ADR-0021). Trade-off honesto: o frame estático pode aparecer ~1 frame antes do redirect resolver, **mas zero dado sensível** (sidebar + conteúdo são session-gated e ainda não resolveram); e cada página tem seu próprio guard (defesa em profundidade).
- **Cookie `sidebarOpen`** (hoje `await cookies()` no topo do layout = read dinâmico que impediria o frame de prerenderizar): mover a leitura pra **client-side** (o estado abrir/fechar da sidebar já é interativo/client). Tira o cookie do caminho do prerender; usa default sensato + hidrata sem flash. **Confirmar a mecânica exata na implementação** (o `SidebarProvider` do `@emach/ui` precisa aceitar isso).

## 6. Páginas auth/landing (os 5 deferrals)

Padrão idêntico nas 5: conteúdo **estático** (form de `AuthShell`/landing) + checagem-de-sessão-redirect **dinâmica** no topo (`await getCurrentSession()` → `redirect()` se logado/status). Fix por página: extrair a checagem num pequeno componente async sob `<Suspense>`, mantendo o conteúdo estático fora dele. Mecânico e de baixo risco. Ex. (`login/page.tsx`):

```tsx
export default function LoginPage() {
  return (
    <>
      <Suspense fallback={null}><LoginRedirectGate /></Suspense>
      <AuthShell><LoginForm /></AuthShell>   {/* estático */}
    </>
  );
}
// LoginRedirectGate (async): getCurrentSession → redirect se logado
```

## 7. Error handling / edge cases

- **Static shell não pode vazar read dinâmico:** garantir que nada no caminho estático leia cookie/sessão (o move do `sidebarOpen` faz parte). O build acusa se escapar.
- **`DashboardChrome` sem sessão:** `requireCurrentSession()` já redireciona pra `/login` — comportamento **preservado** (só deferido).
- **"Toda rota ainda fresca":** com ZERO `use cache`, nada de dado é cacheado → tudo lê no request. Verificação: uma mutação reflete imediatamente no reload.
- **Hydration:** shell estático + conteúdo streamado hidratam sem mismatch; o read client do `sidebarOpen` usa default + hidrata sem flash.
- **`dev-preview`** (layout próprio, sem sessão): confirmar que segue funcionando sob o flag.

## 8. Testes / verificação (o gate de sucesso)

- **Teste de regressão de auth (automatizado, novo):** sobre o `DashboardChrome`/gate, mockando a sessão por estado:

  | Estado | Esperado |
  |---|---|
  | super_admin / admin / user **active** | renderiza, sem redirect |
  | **pending** | `redirect("/pending")` |
  | **suspended** | `redirect("/suspended")` |
  | sem sessão | `redirect("/login")` |

  Mock de `next/navigation` (`redirect`) + módulo de sessão (`vi.mock`, padrão já usado no repo). Vive em `__tests__/` perto do layout.
- **Build verde:** `bun run build` com `cacheComponents:true` sem `HANGING_PROMISE_REJECTION` / "uncached data outside Suspense" — gate primário de "deferi tudo".
- **Smoke multi-role via `/dev-up`:** logar nos 5 estados, visitar rotas dashboard + as auth, confirmar redirects / sidebar-por-role / sem-tela-quebrada / dado-fresco.
- **`bun verify`** (check-types + lint + os 508 testes) + o teste novo seguem verdes.

## 9. Rollback

`cacheComponents` é flag de build-time → reverter = flag pra `false` (o split fica inócuo). Como vai por PR, **não-mergear já é o rollback**. Se a auth não ficar 100% no gate, **para na Fase 1 sem ter tocado em dado**.

## 10. Fora de escopo — Fases 2-3 (roadmap, NÃO construído agora)

- **Fase 2 (piloto):** `use cache` + `cacheTag("suppliers")` em `getActiveSuppliers` + `revalidateTag` em TODAS as mutations de supplier. Gate: warm read + invalidação provada.
- **Fase 3 (rollout seletivo):** só **referência global** — categorias → catálogo (tools) → filiais → banners. **PARA AÍ.** Gate por domínio: invalidação completa em todas as mutations. **Operacional fica dinâmico e fresco pra sempre.**
