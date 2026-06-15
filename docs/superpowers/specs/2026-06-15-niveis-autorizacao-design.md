# Design — Religação de gates: 3 níveis de autorização + escopo de filial

**Data:** 2026-06-15
**Branch:** `niveis-auth`
**Status:** Aprovado (brainstorming) — pendente grill-with-docs + plano
**Relaciona:** substitui ADR-0012 (gates desligados); estende a matriz preservada em `apps/web/src/lib/permissions.disabled.ts`

## Problema

Desde o ADR-0012 (2026-05-27) os gates role-based estão no-op: qualquer usuário `status='active'` tem poder total e o filtro de filial sumiu. Antes de produção precisamos religar com um modelo de **3 níveis** (não os 4 originais) e com semântica de filial diferente da original — onde `admin` também é filial-scoped, não global.

## Decisões de produto (fechadas no brainstorming)

| Decisão | Resultado |
| --- | --- |
| Níveis | 3: `super_admin`, `admin` (absorve `manager`), `user` |
| Catálogo p/ `user` | Só leitura |
| `admin` gerencia usuários | Sim, mas só os de `role=user` que compartilham filial |
| Exclusivo de `super_admin` | Criar/editar filiais; deletar usuário; config do site; **deletar** itens de catálogo |
| Escopo de filial | N:N via `user_branch` (admin/user podem ter várias filiais) |
| Pedido sem filial (`branch_id IS NULL`) | Visível para `super_admin` **e** `admin`; não para `user` |
| Usuário sem vínculo de filial | Fail-closed: vê nada até ser vinculado |
| `assignBranch` (mover pedido) | `admin` só move entre as filiais dele |

## Abordagem (escolhida: A)

Dois eixos **ortogonais** de autorização, reativando o que o ADR-0012 desenhou:

1. **Capability** (`requireCapability`) — responde *"pode esse TIPO de ação?"* (depende de role).
2. **Escopo de filial** (`getUserBranchScope`) — responde *"sobre dados de QUAL filial?"* (depende de `user_branch`).

Reaproveita os 138 callsites de `requireCapability*` intactos e o scaffolding de filtro já existente em pedidos. Rejeitadas: B (política unificada — rewrite dos 138 callsites, sem ganho) e C (RLS no Postgres — banco compartilhado com a loja ecommerce, ADR-0004 isola via schema, não via RLS).

## 1. Modelo de roles

- Enum Postgres mantém os 4 valores (`super_admin/admin/manager/user`) para evitar migration de tipo; só 3 em uso.
- Migração de dado: `UPDATE "user" SET role='admin' WHERE role='manager'`.
- `ROLE_WEIGHT` mantém 4 chaves (`super_admin=4, admin=3, manager=2, user=1`); `manager` continua no enum mas aliasa `admin` em `ROLE_CAPS`. `requireRole` e o guard de hierarquia de `requireCapabilityWithContext` usam esse peso.

## 2. Camada de capability

Estrutura espelha a original: `ADMIN_CAPS = ALL_CAPS − SUPER_ADMIN_EXCLUSIVE`.

```ts
SUPER_ADMIN_EXCLUSIVE = [
  "branches.manage",
  "users.delete",
  "site.update_banners", "site.update_settings", "site.publish_announcements",
  "tools.delete", "categories.delete", "promotions.delete", "attributes.delete",
]
```

`USER_CAPS` (operacional, branch-scoped em orders/stock):
```ts
USER_CAPS = [
  // leituras
  "tools.read","categories.read","suppliers.read","branches.read","stock.read",
  "promotions.read","orders.read","customers.read","site.read","reviews.read","attributes.read",
  // ações operacionais
  "stock.adjust","orders.update_status","orders.add_note",
]
```

`super_admin` = `ALL_CAPS`.

### Split de capabilities (novo)

Hoje `categories.manage` e `promotions.manage` cobrem create+update+**delete** no mesmo cap. Para "admin edita mas não deleta":

- Adicionar `categories.delete` e `promotions.delete` ao tipo `Capability` e ao `ALL_CAPS`.
- Repontar `deleteCategory` → `categories.delete`; `deletePromotion` → `promotions.delete`.
- `tools.delete` e `attributes.delete` já são separados (sem mudança).
- Fornecedor não tem delete físico (só `archive`/`restore`, reversível) → `admin` mantém `suppliers.manage` inteiro.

## 3. Camada de escopo de filial (ortogonal)

`getUserBranchScope(session)` deixa de retornar `null` e passa a devolver:

```ts
type BranchScope =
  | { kind: "all" }                                              // super_admin
  | { kind: "scoped"; branchIds: string[]; includeUnassigned: boolean }
//   admin → includeUnassigned: true ; user → false
```

- Consulta `user_branch` por `session.user.id`. **Fail-closed:** lista vazia → `branchIds: []`.
- **Pedidos** (já scaffolded em `orders/data.ts` e `pending-data.ts`): filtro
  `branch_id IN (scope.branchIds) OR (branch_id IS NULL AND scope.includeUnassigned)`.
  (`super_admin` → sem filtro.)
- **Estoque** (sem scaffolding): construir o mesmo filtro nas listagens (sem `includeUnassigned` — estoque sempre tem filial) + validar `branchId ∈ scope` nas mutações. **Agregado "Estoque geral" é scoped na exibição**: cards de Tool e aba de estoque do Fornecedor somam só as filiais do staff (super_admin vê o total cross-filial). Atinge `suppliers/[id]` (aba estoque), `tools/[id]` (card de estoque) e qualquer view que agregue `stock_level`.
- **Catálogo / clientes / reviews / site**: globais → **só caps, sem filtro de filial**.

## 4. Pontos de enforcement

- **Server actions**: `requireCapability(cap)` para tipo de ação; `requireCapabilityWithContext(cap, { targetBranchIds })` onde há filial. Restaurar o check `targetBranchIds ⊆ scope` (existe no `.disabled`) — cobre `assignBranch` e mutações de estoque.
- **Data-fetchers**: aplicam `BranchScope` no WHERE.
- **Gestão de usuários por admin** (novo guard): admin só enxerga/gerencia usuário que **compartilha ≥1 filial** e tem `role=user`; o guard de role-weight já barra mexer em `admin`/`super_admin`. `inviteUser` restringe `targetBranchIds ⊆ scope` e role atribuível a `user`.
- **Invariante "todo staff operacional pertence a ≥1 filial"** (novo): `inviteUser` exige `targetBranchIds` não-vazio quando `role ∈ {admin, user}` (super_admin sem filial). **Last-branch guard**: `unlinkUserFromBranch` bloqueia remover a última filial de um admin/user (análogo ao last-super-admin guard). Consequência: não existe "usuário na triagem" — só `super_admin` é sem-filial.

## 5. UI

- Restaurar gating derivado de `can()` (botões deletar/editar e itens de sidebar somem conforme role).
- Normalizar inconsistências achadas na auditoria:
  - `suppliers/page.tsx` L24-25: `role === ...` → `can(role, "suppliers.manage")`.
  - `tools/_components/image-actions.ts`: `requireRole("admin")` → `requireCapability("tools.update")` (upload) e `requireCapability("tools.delete")` (delete).
  - **Manter** `allowedApprovalRoles` (`users/_lib/approval-roles.ts`) — hierarquia de convite, UX intencional.

## 6. Guard-rails mantidos

Status gate (`pending`/`suspended`), self-action guard, last-super-admin guard — preservados dentro/junto dos gates reativados. **Novo:** last-branch guard (admin/user nunca fica sem filial).

## 7. Migração de dados (ordem importa)

1. `manager → admin` (UPDATE).
2. **Povoar `user_branch`** para todos os admin/user ativos ANTES de religar — invariante "≥1 filial" + fail-closed: quem não tiver vínculo fica cego. Verificar: `SELECT id,email FROM "user" WHERE role IN ('admin','user') AND status='active' AND id NOT IN (SELECT user_id FROM user_branch)` deve retornar **zero linhas** antes de religar.
3. Bootstrap: `super_admin` não precisa de vínculo (`kind: "all"`).
4. Religar os gates (código) só depois de 1-3 validados.

## 8. Testes + docs

- Unit: matriz `can()` (3 roles × ALL_CAPS), `getUserBranchScope` (all/scoped/vazio), filtro de não-atribuídos.
- Integração/smoke: admin vê só filiais dele + caixa de não-atribuídos; user não vê catálogo-write nem outras filiais; super_admin vê tudo.
- Docs: **novo ADR** substituindo o 0012; atualizar `CONTEXT.md` (glossário: escopo de filial, caixa de entrada/pedido não-atribuído), e remover notas de no-op em `CLAUDE.md` raiz + `apps/web/CLAUDE.md` + gap em `packages/db/CLAUDE.md`.

## Arquivos impactados (mapa)

| Arquivo | Mudança |
| --- | --- |
| `apps/web/src/lib/permissions.ts` | Restaurar matriz (de `.disabled`) com 3 roles + exclusivos novos + split de caps + check de `targetBranchIds ⊆ scope` |
| `apps/web/src/lib/branch-scope.ts` | `getUserBranchScope` real (BranchScope) |
| `apps/web/src/lib/session.ts` | `requireRole` checa `ROLE_WEIGHT`; colapsar pesos |
| `apps/web/src/app/dashboard/orders/data.ts`, `pending-data.ts` | filtro com `includeUnassigned` |
| `apps/web/src/app/dashboard/stock/**` (data + actions) | construir filtro + validação de filial |
| `apps/web/src/app/dashboard/categories/actions.ts`, `promotions/actions.ts` | repontar delete p/ novo cap |
| `apps/web/src/app/dashboard/tools/_components/image-actions.ts` | `requireRole` → `requireCapability` |
| `apps/web/src/app/dashboard/suppliers/page.tsx` | `role ===` → `can()` |
| `apps/web/src/app/dashboard/users/actions.ts` | guard de escopo de filial p/ admin |
| `apps/web/src/app/dashboard/_components/nav-config.ts` / sidebar | gating real |
| `apps/web/__tests__/permissions.test.ts` (+ novos) | matriz + scope |
| `docs/adr/00NN-*.md`, `CONTEXT.md`, `CLAUDE.md`, `apps/web/CLAUDE.md`, `packages/db/CLAUDE.md` | docs |

## Riscos / pontos de atenção

- **Fail-closed + `user_branch` despovoado** = todos cegos no religamento. Mitigação: passo 7.2 obrigatório, com verificação.
- **Banco compartilhado**: nenhuma mudança de schema afeta a loja ecommerce; `user_branch`/`branch` são do domínio admin. Confirmar no grill.
- **Cap coarse além de categories/promotions**: validar no grill se algum outro `.manage` precisa split.
- **`acceptInvite`** segue sem sessão (token público) — fora do escopo de gates, ok.
- **Mudança de role preserva o invariante**: `updateUser` que rebaixa `super_admin → admin/user` exige garantir ≥1 filial (atribuir no mesmo fluxo ou bloquear). Promover `user → super_admin` torna filiais irrelevantes (escopo `all`), vínculos podem permanecer inertes.
- **Exports são branch-scoped onde o dado é**: `orders.export` exporta só pedidos no escopo do staff; `customers.export` é global (Clientes não têm filial). Confirmar no plano por export.

## Não decidido (levar pro plano)

- Se o povoamento de `user_branch` é script único ou parte de uma tela de admin.
- Granularidade dos testes de integração (mock de DB vs. ambiente real).

(ADR registrado: **ADR-0016**, substitui o 0012.)
