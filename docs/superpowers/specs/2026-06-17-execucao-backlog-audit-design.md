# Estratégia de execução — backlog do audit fresco (planos 012-037)

> Spec de execução, não de feature. Gerado 2026-06-17 via brainstorming, contra
> `main`/`79379ef5`, branch de trabalho `chore/improve-audit-2026-06`. Os planos
> de implementação já existem em `plans/012-037`; este doc define **como** executá-los
> com pouca margem de erro, em paralelo, sem perder qualidade.

## Contexto

A skill `improve` rodou em escopo completo e produziu 26 planos self-contained
(`plans/012-037`), cada um cold-reviewed. Decisão do usuário (2026-06-17):
**commitar tudo e começar a executar em paralelo**, acelerando sem perder qualidade.
Performance já foi auditada/planejada antes (`plans/001-011`) e está fora deste ciclo.

## O risco central do "paralelo": colisão de arquivos

Vários planos tocam os **mesmos arquivos**. Rodar implementers concorrentes na
mesma árvore — ou mergear dois worktrees que editaram o mesmo arquivo — corrompe
trabalho / gera conflito. Hubs de colisão mapeados dos `Scope` dos planos:

| Arquivo | Planos |
|---|---|
| `apps/web/src/app/dashboard/tools/actions.ts` | 016, 026, 028 |
| `apps/web/src/app/dashboard/users/actions.ts` | 021, 022, 033 |
| `package.json` (raiz) | 017, 031, 032 |
| `apps/web/src/app/dashboard/suppliers/actions.ts` | 012, 016 |
| `apps/web/src/app/dashboard/stock/actions.ts` | 012, 016 |
| `apps/web/src/app/dashboard/site/banners/actions.ts` | 016, 020 |
| `apps/web/next.config.ts` | 019 (comentário), 027 (headers) |
| `CLAUDE.md` (raiz) | 019, 032 |
| `bun.lock` · `.github/workflows/ci.yml` | 031/032 · 017/031 |
| `apps/web/src/lib/cpf-cnpj.ts` | 023 (teste), 025 (refactor) |

## Abordagem escolhida: ondas paralelas conflict-aware

Rejeitadas: sequencial-1-a-1 (lento) e paralelo-total (merge-hell). Escolhida:

- **1 worktree isolado por plano** (regra firme: nunca implementers paralelos na
  mesma árvore). Executor = subagent `general-purpose` (Sonnet), commit no próprio
  worktree, **não** atualiza `plans/README.md` (o reviewer mantém o índice),
  **não** faz push/PR.
- **Ondas:** dentro de cada onda só entram planos com **arquivos disjuntos**. Entre
  ondas, o advisor revisa + faz merge dos que passam em `chore/improve-audit-2026-06`,
  então a onda seguinte parte do estado já atualizado (sem colisão).
- **Worktree fresco não tem `node_modules`:** executor roda `bun install` antes de
  verificar; tooling que resolve de `dist/` pode exigir 1 build — não é desvio.
- **Plano vem do path commitado:** como os planos serão commitados antes da Onda 1,
  cada executor lê seu `plans/NNN-*.md` no próprio worktree (não inline).

### Ondas

| Onda | Planos (paralelos, disjuntos) | Observação |
|---|---|---|
| **1** | 013, 014, 015, 016, 017, 018, 019, 023, 024, 029, 030 | inclui hub 016 (errorMessage) cedo + testes/docs/CI |
| **2** | 012, 020, 025, 026, 021, 027, 031 | partem de 016/017/019/023 já mergeados |
| **3** | 022, 028, 032 | partem de 021/026/031 já mergeados |
| **4** | 033 | parte de 022 mergeado (`users/actions.ts`) |

Direction (034-037) **não executa** — são spikes de design que dependem de decisão
de produto. Ficam como docs no backlog até aprovação da direção.

## Gates de qualidade (por plano)

1. Executor roda `bun check-types` + `bun check` + `bun --cwd apps/web test` no
   worktree antes de reportar `COMPLETE`.
2. **Advisor (tech-lead) revisa cada diff** contra o `Scope` do plano: re-roda done
   criteria no worktree, confere `git diff --stat` (qualquer arquivo fora do escopo
   = reprova), lê o diff inteiro contra "Why this matters", audita os testes novos
   (teste que não asserta nada reprova).
3. **012/013 (auth P0) ganham smoke multi-role** via `/dev-here` antes do merge —
   `check-types` não pega quebra de invariante de autorização.
4. Veredicto APPROVE/REVISE (≤2 rounds)/BLOCK. Merge só dos APPROVE, em
   `chore/improve-audit-2026-06` (local, reversível). **Nunca push/PR sem o usuário pedir.**

## Critério de sucesso

- ~22 planos de código executados em 4 ondas, cada diff revisado, auth com smoke,
  zero conflito de arquivo entre executores concorrentes.
- Suíte verde (`bun --cwd apps/web test`), `check-types` e `check` verdes na branch
  após cada onda.
- Direction (034-037) preservado como backlog aguardando decisão de produto.

## Log de problemas e aprendizados (vivo — atualizar durante a execução)

> Pedido explícito do usuário: documentar problemas encontrados para melhorias
> futuras. Cada entrada: plano, o que aconteceu, como foi resolvido, o que mudar
> no processo/plano da próxima vez.

### Onda 1 (planos 014, 015, 016, 018, 019 — todos APPROVE, integrados em `225eefca`)

1. **Worktree é cortado da BASE (`79379ef5`), não do tip da branch.** O git não permite dois
   worktrees na mesma branch, e `chore/improve-audit-2026-06` está checked-out na árvore
   principal — então `isolation: worktree` corta da base. Consequência: os planos commitados
   (em `913b95f8`) **não ficam no working dir** do worktree (só no history compartilhado). Os
   executores contornaram (`git show branch:plano`, ou `git merge` do tip). **Fix p/ próximas
   ondas:** instruir o executor a `git merge chore/improve-audit-2026-06` no worktree ANTES de
   editar — assim enxerga os planos E o trabalho já mergeado das ondas anteriores (pré-requisito
   do modelo de ondas: Onda N+1 precisa ver os merges da Onda N).
2. **`bun check` rodou em 0 arquivos nos worktrees → gate de lint VACUOUS.** Os 5 executores
   reportaram "check exit 0", mas a saída era "Checked 0 files". O lint real (`organizeImports`
   no 016; `noThenProperty` + format no 015) só apareceu no **gate integrado** rodado no main
   tree pós-cherry-pick. **Conclusão firme:** o gate de lint confiável é o integrado (`bun check`
   no main tree após cada onda) — o "check exit 0" do executor não é confiável. Mantido como
   etapa obrigatória de review.
3. **vitest — `vi.clearAllMocks()` NÃO limpa a fila de `mockReturnValueOnce`** (só
   `vi.resetAllMocks()`). Um `mockReturnValueOnce` não-consumido (ex: early-return de
   super_admin) vaza pro próximo `describe` e quebra a ordem da fila. Em describes que dependem
   de ordem precisa de fila de mocks, usar `resetAllMocks`. (Descoberto pelo executor do 014.)
4. **`noThenProperty` em mock de Drizzle é esperado.** O query builder do Drizzle é thenable;
   um mock fiel precisa de `then` → `// biome-ignore lint/suspicious/noThenProperty: <motivo>`
   justificado é o padrão (não reescrever o mock). Aplicado no 015.

### Onda 1 (sub-lote 2: planos 013, 017, 023, 024, 029, 030)

5. **Os 2 fixes de processo funcionaram.** (a) PASSO 0 `git merge chore/improve-audit-2026-06`:
   todos os 6 worktrees fizeram fast-forward ao tip e enxergaram planos + sub-lote 1. (b) Lint
   por-arquivo: instruir `bunx ultracite check <arquivos>` quando `bun check` der "0 files" fez
   os executores **pegarem e corrigirem os próprios lints antes de reportar** (024:
   organizeImports+useAwait; 030: noEmptyBlock+useTopLevelRegex; 013: useAwait; 029: tudo). O
   gate integrado no main confirmou: zero residual de lint no sub-lote 2 (vs. 2 issues no
   sub-lote 1). **Conclusão: lint do executor é confiável SE explícito por-arquivo; o gate
   integrado continua obrigatório como backstop.**
6. **013 (auth P0) verificado por leitura do diff:** adota `lockOrderAndAuthorize` canônico
   dentro da tx (fecha hijack cross-branch + not-found + actorUserId). É o mesmo mecanismo já
   provado em runtime por outras 6 mutations. **Smoke multi-role ao vivo = gate pré-prod** (não
   bloqueia merge na branch de trabalho; consistente com o checklist do CLAUDE.md).
7. **029 (refactor UI):** shell 986→616 linhas. **Alvo ≤450 não atingido** (MovementsCard/Row +
   helpers internos permanecem), MAS o objetivo primário — remover o `biome-ignore
   noExcessiveCognitiveComplexity` — foi alcançado. Code review: extração idiomática
   (`LabeledField`/`useFormErrors`/`useTransition`/`notify`), todos `"use client"`, submit
   corretamente fiado. **Smoke visual ao vivo dos 3 modos (entrada/baixa/ajuste) = recomendado
   pré-merge-to-main** (CLAUDE.md exige smoke após mudança de componente; check-types não pega
   regressão de render/interação).
8. **030: requestId threading deferido** (scope guard respeitado — 62 call-sites intactos).
   Caminho futuro documentado: `AsyncLocalStorage` em `middleware.ts` lido dentro do logger, sem
   tocar a API pública.

### Onda 2 (planos 012, 020, 021, 025, 026, 027, 031)

9. **A review manual pegou um BUG REAL no 012 — o achado mais importante da execução.** O
   refactor de `fetchDashboardActivity` (filtrar segmentos do feed por capability) tornou as
   sub-queries condicionais, **introduzindo o caso de 1 bloco** (usuário com só uma das 3 caps
   stock/orders/reviews). Sem wrap em derived table, `(SELECT...ORDER BY...) ORDER BY...` →
   Postgres "multiple ORDER BY clauses not allowed" em runtime. `check-types` E os testes NÃO
   pegaram (não exercitam o SQL de 1-bloco — exatamente a classe de bug que o
   `packages/db/CLAUDE.md` diz só aparecer em smoke). Fix do integrador: `SELECT * FROM
   (${union}) AS feed` (commit `a59bbf19`). **Lição dupla: (a) todo refactor que torna um UNION
   condicional precisa do wrap derived-table; (b) foi a leitura manual do diff que pegou — nenhum
   gate automático pegaria. A review cuidadosa de planos auth/SQL-críticos vale o custo.** Smoke
   do feed com usuário de 1-cap = pré-prod.
10. **Um plano podia estar errado: 020 corrigido pelo executor via doc oficial.** O finding
   BUG-04 assumia que o 2º arg de `revalidateTag` era removível. No Next 16 ele é OBRIGATÓRIO e a
   forma de 1-arg está deprecada. O executor investigou o type def, escolheu `"max"`, e eu
   confirmei na doc oficial (context7: `"max"` = profile recomendado, stale-while-revalidate).
   Desvio documentado e correto. **Lição: finding de auditoria pode carregar premissa de versão
   errada — executor que investiga a API real vale mais que executor que segue o plano cegamente.**
11. **`SendMessage` indisponível → REVISE virou fix-forward do integrador.** Não há tool pra
   resumir um executor já despachado. Para o bug do 012, em vez de re-despachar, corrigi forward
   no main (fix preciso e documentado no CLAUDE.md). Alternativa p/ bugs maiores: despachar um
   Agent novo apontando pro worktree existente.
12. **Overlap não previsto no mapa: 012 ∩ 025 em `suppliers/actions.ts`** (012 = guards nas
   funções; 025 = linha de import do `normalizeCnpj`). git auto-merge resolveu (regiões
   distintas). **Lição: o mapa de colisão por-arquivo deve considerar que um plano de "guards
   amplos" toca muitos arquivos que outros planos também tocam por motivos diferentes.**
