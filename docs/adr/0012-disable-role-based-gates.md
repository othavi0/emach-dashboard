# ADR 0012 — Desligar bloqueios role-based mantendo roles como rótulo

**Data:** 2026-05-27
**Status:** **Superseded por [ADR-0016](0016-religacao-gates-3-niveis-filial.md) (2026-06-15).** Os gates foram religados — não em 4 níveis restaurados, mas em 3 níveis com escopo de filial. O texto abaixo fica como registro histórico do período sem gates; o "Plano de reativação" foi cumprido (com redesenho) pelo ADR-0016.
**Substitui:** parcialmente o regime de capabilities introduzido em `apps/web/src/lib/permissions.ts`.

## Contexto

O dashboard mantém 4 camadas de gate (status, capability, context com branch/hierarquia, role-as-data). A camada de capability gera fricção em iterações de desenvolvimento e em testes manuais — toda nova feature exige decidir a matriz, sincronizar entre sidebar/server actions/queries e revalidar testes. A decisão é simplificar agora; gates voltam quando o produto entrar em produção e tivermos clareza dos perfis reais de operação.

## Decisão

Tornar `requireCapability`, `requireCapabilityOrRedirect`, `requireCapabilityWithContext`, `requireCapabilityWithContextOrRedirect`, `can` e `getUserBranchScope` no-op. As funções continuam validando sessão + `status === "active"` mas não inspecionam role/capability.

Guard-rails mantidos:

- Status gate (`pending` / `suspended` redirecionam) — `apps/web/src/app/dashboard/layout.tsx`.
- Self-action guard — usuário não pode `users.suspend`/`users.delete`/`users.update_role` em si mesmo.
- Last-super-admin guard — não permite rebaixar/suspender/deletar o último `super_admin` `active`.
- `SELECT FOR UPDATE` em `lockOrderAndAuthorize` (concorrência, não role-based).
- Audit log de todas as mutações.

`role` e `status` permanecem como enums no Postgres. `<RoleBadge>` continua diferenciando visualmente. `user_branch` continua sendo gravada via UI de gestão de usuários (preservar dados pra reativação).

## Consequências

**Positivas:**

- Iteração de feature deixa de exigir decisão de capability matrix.
- Sidebar mostra todos os itens pra todo `active` — UX consistente em dev.
- 138 callsites a `requireCapability*` permanecem intactos; reativar = restaurar 3 arquivos.

**Negativas:**

- Qualquer usuário `active` pode executar ação destrutiva. Defesa-em-profundidade fica só com audit log (pós-incidente).
- Filtro de filial em orders/stock desaparece — todos veem tudo.
- Não religar antes de produção é risco material — registrar como gap em `packages/db/CLAUDE.md`.

## Plano de reativação (cumprido pelo ADR-0016)

O plano original previa restaurar a matriz preservada quase tal qual ("reativar = restaurar 3 arquivos"). Na prática o ADR-0016 **redesenhou** a autorização em vez de restaurar: 3 níveis (não 4), `admin` filial-scoped, `getUserBranchScope` reconstruído. Os passos abaixo ficam como registro do que se imaginava na época:

1. Copiar `apps/web/src/lib/permissions.disabled.ts` de volta pra `permissions.ts` (sobrescrever).
2. Restaurar consulta original em `apps/web/src/lib/branch-scope.ts` (recuperável via `git log -p -- apps/web/src/lib/branch-scope.ts`).
3. Restaurar checagem de `ROLE_WEIGHT` em `apps/web/src/lib/session.ts:requireRole` (recuperável via `git log -p`).
4. Decidir se mantém `ensureActive` e `assertNotLastActiveSuperAdmin` como defesa adicional ou remove.
5. Auditar `user_branch` antes de religar — repovoar registros desatualizados.
6. Remover item de gap em `packages/db/CLAUDE.md`.
7. Atualizar `CLAUDE.md` raiz desfazendo a nota de no-op.

## Resolvido pelo ADR-0016

As duas perguntas deixadas em aberto foram respondidas no religamento:

- **Quando religar:** antes da produção, junto com convite-only (ADR-0013) e o povoamento de `user_branch`.
- **Matriz idêntica ou redesenhada:** **redesenhada** — 3 níveis com filial, não a matriz de 4 níveis preservada.
