# Handoff — retomar a próxima sessão (perf/qualidade do dashboard)

> Gerado 2026-06-17. Repo: dashboard (branch `main`). Para retomar: abra o repo e
> diga **"continue de @plans/_NEXT-SESSION.md"**.

## Estado atual

- **`main` = `4a7438f3`** (`perf(catalog): elimina queries seriais e lateral desnecessário #217`,
  feito pelo Othavio) — 1 commit à frente do Wave 2.
- Histórico perf: **#212 Wave 1** (streaming/bundle/lazy charts/KPIs paralelos/`cache()` dedup)
  → **#216 Wave 2** (motion→CSS, lazy editor deps, anexos sob demanda) → **#217** (catálogo:
  LATERAL condicional + `Promise.all`).
- Working tree limpo; só 1 worktree (principal). `plans/` untracked (13 planos + este).
- Branches: ~34 locais antigas — squash-merge impede auto-detectar stale vs WIP; **não** limpar
  em massa (oferecer análise guiada se pedirem).

## Mapa das alavancas de perf (diagnóstico original = 3 desligadas)

| Alavanca | Estado |
|---|---|
| Streaming | ✅ LIGADA (#212) |
| Bundle | ✅ LIGADA (#212+#216: recharts/motion/dnd-kit/image-compression lazy ou removidos) |
| Cache cross-request | ❌ **OFF** — bloqueada no refactor layout/providers (ver 006-B abaixo) |
| Data-fetching (bônus) | ✅ paralelizado (#212 KPIs + #217 catálogo) + `cache()` dedup |

**2,5 de 3 alavancas ligadas.** Sobra o cache cross-request (Cache Components).

## DECISÃO TOMADA (2026-06-17): fazer Cache Components, **faseado e conservador**

Discussão: usuário corrigiu meu viés de "ganho marginal" (eu ancorei em dados **mocados** —
12 pedidos seed). Objetivo dele = **melhor UX possível num admin que vai escalar**, custo/tempo
não é restrição. Conclusão:

- **Prêmio real = PPR / static shells** (first paint instantâneo do shell em toda rota), não o
  cache de dados. Aplica a toda rota, independe de volume.
- **Argumento decisivo:** a superfície é pequena AGORA (20 rotas, 1 layout). Refatorar o layout
  auth-crítico pra Suspense só fica mais caro com o tempo. Fazer enquanto a casa é pequena.
- **Ressalva crítica (admin ≠ storefront):** cachear dado **operacional** (pedidos, estoque,
  KPIs) é perigoso por **correção** — admin decide olhando o painel; stale = decisão errada. E
  o operacional é branch-scoped/por-usuário → `use cache` nem consegue (não enxerga cookies).
  → **Cachear SÓ referência global** (catálogo, categorias, fornecedores, banners). **Operacional
  fica dinâmico e fresco, sempre.** Cortar `orders-KPI` e `customers` da lista do rollout-notes.

### Plano faseado recomendado (cada fase verificável/reversível)

| Fase | O quê | Gate |
|---|---|---|
| **1 — Fundação (006-B)** | Refactor `apps/web/src/app/dashboard/layout.tsx` (deferir `await headers()`/`getCurrentSession` via `connection()` de `next/server` OU `<Suspense>`) + `apps/web/src/components/providers.tsx`. Ligar `cacheComponents:true`. **ZERO cache ainda.** | Build verde + **auth idêntica** (smoke multi-role) + toda rota ainda dinâmica/fresca |
| **2 — Piloto (006)** | Cachear `getActiveSuppliers` (`use cache` + `cacheTag("suppliers")`) + `revalidateTag` em TODAS as mutations de supplier | Warm read + invalidação provada |
| **3 — Rollout seletivo** | Só referência global: categorias → catálogo tools → filiais → banners. **PARA AÍ.** | Por domínio: invalidação completa em todas as mutations |

**A Fase 1 é o risco (auth) isolado e provado ANTES de cachear nada.** Se a auth não ficar 100%,
para na Fase 1 sem ter tocado em dado.

### Por que 006-A deu STOP (contexto técnico, já validado)

Ligar `cacheComponents:true` (006-A executou e parou): build quebra em 2 lugares —
1. `dashboard/layout.tsx:30` → `getCurrentSession()`/`await headers()` no topo sem Suspense →
   `HANGING_PROMISE_REJECTION` em **todas** as ~19 rotas dashboard.
2. `components/providers.tsx:5` (root) → "Uncached data outside `<Suspense>`" (rota `/convite`).

Remover os 21 `force-dynamic`/`runtime` foi limpo; a parede é o read de sessão nos layouts
compartilhados. Detalhe completo em `plans/006-A-remove-force-dynamic.md` + `006-rollout-notes.md`.

## Track paralelo: audit fresco (decidido C > D)

Perf nunca auditou **correctness/segurança/testes/tech-debt/deps/DX/docs/direção**. Ordem decidida:
**C antes de D** — rodar `improve` fresco primeiro (produz backlog priorizado; os itens pequenos
da D entram nele rankeados por leverage), executar depois. D são itens diferidos conhecidos:
lazy dos 6 step-components do wizard (`tool-sections.ts`), paginar `getBranchTeam` (sem LIMIT),
e o `providers.tsx` (independente do cache).

## PRÓXIMO PASSO sugerido (escolha do usuário)

1. **Escrever a 006-B faseada** (Fase 1 primeiro — refactor layout/providers) e aplicar com
   review + smoke multi-role via `/dev-here` + Monitor. ← caminho do "melhor UX".
2. **OU** rodar o `improve` fresco no `main` (escopo: `standard` completo, ou focado em
   `security`/`tests`/`correctness`/`next`) antes de mexer em mais código.

Skills centrais: `improve` (execute/reconcile), `next-cache-components` (sintaxe da flag),
`systematic-debugging` se a Fase 1 travar. Convenções/gates em `CLAUDE.md` raiz + `apps/web/CLAUDE.md`.
