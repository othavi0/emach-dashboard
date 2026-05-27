# Desligar bloqueios role-based mantendo roles como rótulo

**Data:** 2026-05-27
**Status:** Aprovado pra implementação
**ADR associado:** `docs/adr/0012-disable-role-based-gates.md` (criar como parte desta spec)

## Contexto

O dashboard tem 4 camadas de gate ativas hoje:

1. **Status** (`pending` / `active` / `suspended`) — `apps/web/src/app/dashboard/layout.tsx:22-27` redireciona quem não está `active` para `/pending` ou `/suspended`.
2. **Capability gate** — `requireCapability` / `requireCapabilityOrRedirect` em 138 callsites distribuídos em ~38 arquivos. Matriz `ROLE_CAPS` em `apps/web/src/lib/permissions.ts:153` mapeia 4 roles (`super_admin`, `admin`, `manager`, `user`) para 45 capabilities granulares.
3. **Context gate** — `requireCapabilityWithContext` adiciona (a) branch scoping (non-`super_admin` só age sobre filiais em `user_branch`), (b) hierarquia (não gerencia role ≥ a sua), (c) self-restriction (não suspender/deletar/mudar a própria role).
4. **Role-as-data** — `getUserBranchScope` (filtro de queries), `lockOrderAndAuthorize` (orders), `<RoleBadge>`, sidebar (`canManageUsers` esconde menu).

A decisão é **desligar temporariamente** as camadas 2, 3 (parcial) e 4 (parcial), mantendo a camada 1 e mantendo `role` como rótulo/display. Não há mudança no schema do DB.

## Decisão

### Escopo

- **Liberar tudo** exceto status. Todo usuário `active` passa por todas as capabilities, vê todas as filiais e pode gerenciar qualquer usuário.
- **Manter:**
  - Status gate (`pending` / `suspended` continuam barrados).
  - Self-action guard (usuário não pode se suspender / deletar / mudar a própria role).
  - Last-super-admin guard (novo — não permite rebaixar / suspender / deletar o último `super_admin` `active`).
  - Sidebar mostra todos os itens pra todo `active` (propaga via `can()` no-op).
  - `<RoleBadge>` continua diferenciando visualmente.
  - Audit log de todas as mutações (`user_activity_log`, `stock_movement`, `order_status_history`, `client_audit_log`).
  - `SELECT FOR UPDATE` em `lockOrderAndAuthorize` (proteção de concorrência, não role-based).

### Estratégia: no-op nas funções-gate

As 138 chamadas a `requireCapability*` permanecem **intactas**. O comportamento muda dentro das funções. Reativar = restaurar 3 arquivos.

### Diff por arquivo

#### `apps/web/src/lib/permissions.ts`

- `can(role, _cap)` retorna `true` se `role` é truthy.
- `requireCapability(_cap)` valida sessão + chama `ensureActive(session)` e retorna sessão.
- `requireCapabilityOrRedirect(_cap, redirectTo)` mesma coisa; em erro, `redirect(redirectTo)`.
- `requireCapabilityWithContext(cap, ctx)`:
  - Valida sessão + `ensureActive`.
  - Mantém self-action guard (`ctx.targetUserId === session.user.id && SELF_RESTRICTED.includes(cap)`).
  - Mantém last-super-admin guard quando `cap` ∈ `LAST_SUPER_ADMIN_GUARDED` (`users.delete`, `users.update_role`, `users.suspend`).
  - **Remove** branch scoping e hierarquia.
- `requireCapabilityWithContextOrRedirect(cap, ctx, redirectTo)` mantém wrapper try/catch → redirect.
- Helpers novos:
  - `ensureActive(session)`: lança `Error("Conta não ativa")` se `status !== "active"`. Defesa-em-profundidade contra rotas que escapem do layout.
  - `assertNotLastActiveSuperAdmin(userId)`: query `SELECT count(*) FROM "user" WHERE role='super_admin' AND status='active'`. Se o alvo é `super_admin` `active` e a contagem é 1, lança.
- Constantes preservadas (`ALL_CAPS`, `USER_CAPS`, `MANAGER_CAPS`, `SUPER_ADMIN_EXCLUSIVE`, `ADMIN_CAPS`, `ROLE_CAPS`) movidas para `apps/web/src/lib/permissions.disabled.ts` com header `// @ts-nocheck` e nota apontando para o ADR.

#### `apps/web/src/lib/branch-scope.ts`

`getUserBranchScope` sempre retorna `null` (todas as filiais). `inScope` continua existindo e sempre retorna `true`. Bloco antigo da consulta a `userBranch` preservado em comentário curto referenciando o ADR.

#### `apps/web/src/lib/session.ts`

`requireRole(_role)` valida sessão + `ensureActive` e retorna. `ROLE_WEIGHT` permanece (usado por `<RoleBadge>`, validação de formulário e tipos).

#### `apps/web/src/app/dashboard/users/actions.ts`

Auditar `deleteUser`, `updateUserRole`, `suspendUser`, `reactivateUser` para garantir que `targetUserId` é passado a `requireCapabilityWithContext`. O guard last-super-admin é acionado automaticamente via o helper. Sem alteração de assinatura pública das actions.

#### Arquivos não tocados (gates propagam via no-op)

- `apps/web/src/app/dashboard/layout.tsx` — status gate intacto. Badge de pendentes aparece pra todos.
- `apps/web/src/app/dashboard/_components/app-sidebar.tsx` — recebe `canManageUsers=true` automaticamente.
- `apps/web/src/app/dashboard/orders/actions.ts` (`lockOrderAndAuthorize`) — lock SQL permanece; capability check vira no-op.
- Todos os ~38 arquivos com callsites a `requireCapability*`.

#### Docs

- `CLAUDE.md` raiz, seção "Auth — invariantes P0": atualizar parágrafo de roles para apontar pro ADR-0012 e explicar que `requireCapability*` virou no-op.
- `apps/web/CLAUDE.md`, seção "Capabilities": esclarecer que o padrão obrigatório em server actions continua sendo `requireCapability*` (mesmo no-op), pra que reativar não exija varredura.
- `docs/adr/0012-disable-role-based-gates.md`: ADR novo. Contexto, decisão, consequências, plano de reativação.
- `packages/db/CLAUDE.md`, seção "Gap conhecido": adicionar item espelhado ao "anonimização LGPD" — "**Gates role-based desligados (ADR-0012)** — religar antes de produção."

### Schema

**Sem mudanças.** Enums `user_role` e `user_status` permanecem. Tabela `user_branch` permanece (continua sendo gravada pela UI de gestão de usuários).

## Plano de reativação futura

1. Restaurar `apps/web/src/lib/permissions.ts` da cópia em `permissions.disabled.ts` (renomeando).
2. Restaurar consulta original em `apps/web/src/lib/branch-scope.ts`.
3. Restaurar checagem de `ROLE_WEIGHT` em `requireRole` (`session.ts`).
4. Decidir se mantém `ensureActive` e `assertNotLastActiveSuperAdmin` como defesa adicional ou remove.
5. Auditar `user_branch` — repovoar registros que ficaram desatualizados durante o período sem gates antes de religar (senão non-`super_admin` fica trancado fora das filiais).
6. Remover item de gap no `packages/db/CLAUDE.md`.
7. Atualizar `CLAUDE.md` raiz desfazendo a nota de no-op.

## Riscos & Mitigações

| Risco | Mitigação |
|---|---|
| Usuário `active` executa ação destrutiva em prod sem proteção role-based | Audit log existente (`user_activity_log`, `stock_movement`, `order_status_history`, `client_audit_log`). Defesa pós-incidente, não preventiva. Recomendação: não religar produção com gates desligados. |
| App ecomerce escrevendo via DB compartilhada vê comportamento alterado | Ecomerce não consome `role` nem `requireCapability`. Sem impacto. |
| `user_branch` ficar dessincronizado | UI de atribuição de filial (`updateUserBranches`) continua funcionando — só o gate de leitura é removido. |
| Esquecimento de religar antes de produção | ADR-0012 + nota em `CLAUDE.md` raiz + item de gap em `packages/db/CLAUDE.md`. |
| `ensureActive` quebrar fluxo de aprovação | Auditar `apps/web/src/app/dashboard/users/actions.ts:approveUser` — chamada pelo aprovador (`active`), não pelo alvo `pending`. Sem impacto esperado. |
| Algum callsite chamando `can()` em UI esperando `false` | Revisão durante implementação: buscar `can(` em componentes e validar que `true` em todos os casos produz UI coerente (mostrar item em vez de esconder). |

## Verificação pós-implementação

- `bun check-types` passa.
- `bun dev:web` e visitar as rotas principais com um usuário `role='user'` `status='active'`: deve acessar `tools` (criar/editar/deletar), `orders` (mudar status, cancelar, refund, exportar), `customers` (export, manage_sessions), `site` (banners, settings), `reviews` (moderate), `users` (todas as ações exceto em si mesmo e exceto deletar último super_admin).
- Tentar deletar / rebaixar / suspender o último `super_admin` `active`: deve falhar com mensagem clara.
- Tentar suspender / deletar / mudar role de si mesmo: deve falhar.
- Login como `pending` ou `suspended`: redirect mantido.
- Sidebar mostra todos os itens (Usuários, Filiais, etc) pra qualquer `active`.
