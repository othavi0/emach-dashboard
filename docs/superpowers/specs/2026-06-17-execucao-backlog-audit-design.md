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

- _(vazio no início — preencher conforme a execução: STOP conditions, drift,
  desvios documentados, planos que precisaram de REVISE/BLOCK, surpresas de
  worktree/build, falsos-positivos de escopo, etc.)_
