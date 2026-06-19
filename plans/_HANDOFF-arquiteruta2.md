# Handoff — branch `arquiteruta2` (auditoria de arquitetura)

> **Para retomar numa sessão nova, cole:** **"continue de @plans/_HANDOFF-arquiteruta2.md"**
>
> Gerado 2026-06-19. Substitui `_NEXT-SESSION.md` como ponto de retomada (o track 006-B/Cache Components dele segue válido — ver "Próximos passos").

## TL;DR (1 frase)

Os 14 planos da auditoria de arquitetura estão **executados, revisados e integrados** na `arquiteruta2` (gate verde, smoke limpo) e abertos no **PR #228 → main**; o que falta são **decisões suas** (mergear, coordenar sync ecommerce, purge de PII) e **1 track de perf/UX ainda OFF (Cache Components / PPR)**.

## Estado atual

- **Branch `arquiteruta2`**, 45 commits à frente de `main`. PR aberto: **#228** (`othavioquiliao/emach-dashboard`), CI roda no PR.
- Gate integrado **verde**: `bun check-types` + `bun check` (694 files) + `bun --cwd apps/web test` (507) + `bun --cwd packages/db test` (15) + `bun run --cwd apps/web build`.
- Working tree limpo. Worktrees e branches `advisor/*` de execução já limpos.
- Smoke visual feito (`/dev-up` :3001, autenticado): zero erros runtime; app-code 263-658ms/rota, tabs 269-342ms (dev — totais inflados por compile do Turbopack; prod ≈ app-code + ~150ms).

## Decisões tomadas (não re-litigar)

1. **Padrão 3-camadas (ADR-0019)** é o alvo: `data.ts` (`server-only`, reads+tipos) + `_lib` (puro) + `actions.ts` (`"use server"`, mutations + thin wrappers com guard). Foi completado no dashboard inteiro.
2. **Guard `<recurso>.read`** mora no caller quando o read está em `data.ts` (ADR-0018) — as páginas Server Component chamam `requireCapability`. (Regressão pega e corrigida no 041.)
3. **Merge na `arquiteruta2`** autorizado pelo usuário; merges feitos com `--no-ff`. Conflito 041×038 resolvido com `--theirs` (a versão do 041 já incorporava o `actionErrorMessage` do 038).
4. **044 (split catalog.ts)** fica na superfície de sync ADR-0009 — ao chegar na main, o sync CI propaga pro ecommerce e os imports lá quebram até migrarem (decisão consciente, documentada).
5. **040 (RESET-PLAN.md)** resolvido por **tombstone** (PII fora da working tree); purge de histórico = decisão à parte (não feito).
6. **dev ≠ prod** para velocidade: medir TTFB real no deploy; Early Hints engana.

## O que foi feito — 14 planos (038–051), em 3 ondas

Detalhe/evidência por plano em `plans/README.md`. Processo: cada plano executado por subagente em worktree isolado → revisão tech-lead (re-rodar done-criteria + ler diff, não confiar no report) → merge + gate integrado.

**Onda A — segurança + baratos:** 038 vazamento de SQL no toast (`actionErrorMessage`) · 039 `requireCapability("orders.read")` nas 5 read actions · 040 scrub PII do RESET-PLAN · 043 `server-only` nos data.ts faltantes · 050 drift de docs (ADRs 0018-0021, trigger db/CLAUDE.md) + money-boundary · 051 dead code.

**Onda B — splits:** 041 categories → data.ts + guard · 042 stock reads → data + `branch-stock-data.ts`→server-only · 044 catalog.ts (1166 LOC) → 4 contextos + dedup promo.

**Onda C — dependentes:** 045 paginação → `paginate()` (~9 sites) · 046 dedup 4 helpers (`coerceDates`→`@emach/db/utils`) · 047 `getCategoryAncestors` N→1 (`WITH RECURSIVE`) + `cache()` · 048 batch N+1 `getActivePromotions` (1+2N→1+1+N) · 049 decompor componentes (`branch-stock-edit-sheet` 616→287 LOC).

**3 achados que só a review tech-lead pegou** (gates automáticos passavam): regressão de `categories.read` (041), bug latente de boundary (042), type-error de teste sob `noUncheckedIndexedAccess` (047).

## Próximos passos (prós/cons)

### A. Mergear o PR #228 → main
- **Prós:** consolida toda a fundação de arquitetura; destrava tudo que depende dela; CI valida.
- **Cons/risco:** dispara o **sync CI pro ecommerce** (044) → imports `@emach/db/queries/catalog` quebram lá até migrarem pros novos paths (`/tools`, `/categories`, `/promotions`, `/reviews`). **Pré-requisito:** ter o PR de migração no ecommerce pronto pra ir junto.
- **UX/perf:** impacto interno (dedup, CTE N→1, batch N+1 — ganhos reais mas em rotas específicas: detalhe de categoria e home do storefront).

### B. Cache Components / PPR (track 006-B — AINDA OFF) ⭐ maior alavanca de perf+UX
- **Contexto:** decisão tomada na sessão de 2026-06-17 (ver `_NEXT-SESSION.md`): fazer **faseado e conservador**. Bloqueado no refactor de `dashboard/layout.tsx` + `providers.tsx` (leitura de sessão no topo sem Suspense → `cacheComponents:true` quebra o build).
- **Prós:** **PPR/static shells = first paint instantâneo em TODA rota** — o maior ganho de UX percebida, independente de volume de dados. Cachear só **referência global** (catálogo/categorias/fornecedores/banners); operacional fica fresco.
- **Cons/risco:** refatorar o layout auth-crítico pra Suspense; cachear dado operacional é perigoso por correção (NÃO cachear pedidos/estoque/KPIs).
- **Por que agora ficou MAIS fácil:** a normalização `server-only` (043) + os splits data-layer desta branch limparam exatamente os boundaries que o 006-B precisa tocar.

### C. Itens deferidos por design (backlog, baixo impacto UX)
- Paginação de `movements-data.ts` (NOTE do 045 — `encodeMovementCursor` incompatível com `paginate()`).
- Wrapper tipado para `db.execute` (~84 sites — plano "O" do audit; tech-debt, sem bug atual).

### D. Pequenos não-verificados visualmente (baixo risco; smoke cobriu os de alto risco)
- aba Atividade de tool (042 `fetchToolActivityPage`), listas promoções/clientes/fornecedores, sheet de edição de estoque (049). Storefront (044/048) só dá smoke no repo ecommerce.

## Minha recomendação (perf + UX em mente)

1. **Mergear #228** assim que o PR de migração de imports do ecommerce estiver pronto (coordenar os dois) — é a fundação e os ganhos de perf do 047/048 dependem de estar na main.
2. **Em seguida, atacar o 006-B (Cache Components / PPR) faseado** — é a **maior alavanca de perf+UX que sobra** (first paint instantâneo em toda rota), e a casa está mais limpa pra isso agora. Fase 1 = só refatorar layout/providers + ligar a flag (zero cache ainda, prova a auth); Fase 2 = piloto `getActiveSuppliers`; Fase 3 = rollout só de referência global.
3. **Deixar C e D como backlog** — tech-debt de baixo impacto na UX; não competem com o 006-B.

## Ponteiros

- `plans/README.md` — índice dos 14 planos (+ os 37 anteriores) com status/evidência.
- `plans/_NEXT-SESSION.md` — contexto detalhado do track 006-B (Cache Components).
- PR **#228** — diff + caveats no corpo.
- ADRs relevantes: 0018 (reads enforçam capability), 0019 (3-camadas), 0009 (sync ecommerce), 0020/0021 (cookieCache add+remove).
