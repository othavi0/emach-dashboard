# ADR 0012 — Desligar bloqueios role-based mantendo roles como rótulo

**Data:** 2026-05-27
**Status:** Aceito
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

## Plano de reativação

1. Copiar `apps/web/src/lib/permissions.disabled.ts` de volta pra `permissions.ts` (sobrescrever).
2. Restaurar consulta original em `apps/web/src/lib/branch-scope.ts` (recuperável via `git log -p -- apps/web/src/lib/branch-scope.ts`).
3. Restaurar checagem de `ROLE_WEIGHT` em `apps/web/src/lib/session.ts:requireRole` (recuperável via `git log -p`).
4. Decidir se mantém `ensureActive` e `assertNotLastActiveSuperAdmin` como defesa adicional ou remove.
5. Auditar `user_branch` antes de religar — repovoar registros desatualizados.
6. Remover item de gap em `packages/db/CLAUDE.md`.
7. Atualizar `CLAUDE.md` raiz desfazendo a nota de no-op.
8. **Unificar checks de `canMutate` hardcoded com `can()`.** Duas listagens não usam `can()` e sim comparação direta de `role`: `apps/web/src/app/dashboard/promotions/page.tsx` e `apps/web/src/app/dashboard/suppliers/page.tsx`. Como `can()` está no-op, esses checks continuam restringindo por role enquanto o resto do dashboard libera pra todo `active` — comportamento divergente. Converter ambos para `can(role, "promotions.manage")` / `can(role, "suppliers.manage")` na reativação, garantindo que a matriz volte de forma consistente. **Contexto:** descoberto em 2026-05-28 via bug — `promotions` omitia `super_admin` no check hardcoded (`role === "admin" || role === "manager"`), escondendo as ações dos cards do role mais alto; corrigido pontualmente adicionando `super_admin`, mas a raiz (hardcode em vez de `can()`) permanece.

## Não decidido

- Quando exatamente religar (depende do entry em produção).
- Se a matriz reativada será idêntica à preservada ou redesenhada com base no aprendizado do período sem gates.
