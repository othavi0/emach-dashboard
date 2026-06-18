# ADR 0018 — Read server actions enforçam capability (não só mutations)

**Data:** 2026-06-17
**Status:** Aceito — estende o ADR-0016 (gates de 3 níveis + branch-scope)
**Relaciona:** ADR-0016 (capability matrix), ADR-0014 (RLS deny-all / sem PostGREST).

## Contexto

A auditoria de 2026-06 encontrou ~15 **read server actions** exportadas de arquivos
`"use server"` **sem nenhum guard** de identidade/capability: `branches/actions.ts`
(`listBranches`, `fetchBranchesPage`, `getBranch`, `fetchBranchesTablePage`,
`fetchBranchActivityPage`), `suppliers/actions.ts` (`fetchSuppliersPage`,
`fetchSuppliersTablePage`), `stock/actions.ts` (`getStockMovements`, `getToolActivity`),
`categories/actions.ts` (7 reads), e `fetchDashboardActivity` (`pending-data.ts`) que usava só
`requireCurrentSession()` sem capability nem branch-scope.

O hábito era guardar **mutations** e tratar reads como "inofensivos". Mas no Next, **toda
função exportada de um `"use server"` é um endpoint POST chamável** por qualquer sessão (e o
`"use server"` não restringe o chamador). Logo, reads desprotegidas vazavam dados operacionais +
PII (CNPJ/email/endereço/movimentos de estoque) furando a matriz do ADR-0016 — qualquer `user`
(ou sessão sem a capability via override do ADR-0017) lia tudo. Não há rede de RLS porque o
PostgREST é deny-all (ADR-0014); o gate é a aplicação.

## Decisão

**Toda server action exportada de um `actions.ts` enforça capability — read OU write.** Reads
recebem `requireCapability("<recurso>.read")` (`branches.read`/`suppliers.read`/`stock.read`/
`categories.read`/`orders.read`/`reviews.read`) como **primeira instrução**. Feeds multi-fonte
(ex: `fetchDashboardActivity`) filtram cada segmento por `can(session, cap)` e são **fail-closed**
(sem nenhuma cap → vazio), espelhando `fetchDashboardCounts`.

**Fronteira:** funções em `data.ts` / `*-data.ts` começam com `import "server-only"` — **não são
endpoints** (não chamáveis direto; só importadas por Server Components/actions já guardados). Não
recebem guard próprio; o caller é responsável. Manter a separação: lógica de leitura reutilizável
vive em `data.ts` (server-only); o wrapper-endpoint em `actions.ts` (`"use server"`) carrega o guard.

## Considered options

- **A (escolhida)** — guard explícito em cada read action de `actions.ts` + filtro por-segmento
  no feed. Custo baixo (mecânico), fecha o gap sem mexer na arquitetura; consistente com o padrão
  já obrigatório para mutations.
- **B** — mover todas as reads para `data.ts` (server-only) e expor só via Server Components.
  Maior refactor; quebra consumidores Client que chamam as actions diretamente (scroll infinito).
- **C** — middleware/wrapper que injeta o guard. Mais mágico, esconde o gate do callsite (contra a
  legibilidade que o ADR-0016 buscou ao deixar o `requireCapability` visível em cada action).

## Consequências

- Novos `fetch*`/`list*`/`get*` em `actions.ts` **devem** começar com `requireCapability`. Code
  review e o playbook em `apps/web/CLAUDE.md` (seção Capabilities) cobram isso.
- Um `user` sem a `.read` de um domínio deixa de ver aquele domínio — comportamento desejado
  (fail-closed), pode reduzir itens em feeds agregados.
- Verificação pré-prod: smoke multi-role + smoke do feed de atividade com usuário de 1 capability
  (o caminho de 1-bloco do UNION, que exige o wrap em derived table — ver `packages/db/CLAUDE.md`).
