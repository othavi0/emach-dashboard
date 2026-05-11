# Aprovação de usuários + vinculação por filial + branch default no DB

**Data:** 2026-05-11
**Status:** Aprovado (brainstorm)
**Escopo:** Dashboard `emach-dashboard` + ajuste cross-repo em `emach-ecommerce`

## Contexto

Hoje o dashboard cria todo signup com `role='user'` e dá acesso imediato — sem revisão. O env var `ECOMMERCE_DEFAULT_BRANCH_ID=br-curitiba` (configurado no `.env` do ecommerce e copiado no `.env` do dashboard) é a única ponte entre o app ecommerce e a filial que processa pedidos. Não há vinculação `user × filial` no schema.

O objetivo é:

1. Adicionar fluxo de aprovação manual de novos signups (estado `pending` → `active`).
2. Adicionar hierarquia `super_admin > admin > manager > user` com escopo por filial via M:N `user_branch`.
3. Construir UI completa de gestão de users (listagem com tabs por status, sheet lateral pra aprovar/editar/suspender/deletar).
4. Eliminar `ECOMMERCE_DEFAULT_BRANCH_ID` movendo a flag pra `branch.isDefault` no DB.

## Decisões tomadas no brainstorm

| Tópico | Decisão |
|---|---|
| Status enum | `pending | active | suspended` |
| Role topo | `super_admin` (adicionado ao enum existente) |
| Vinculação user × filial | Tabela M:N `user_branch` |
| Admin × filial | Admin restrito a filiais via `user_branch`; super_admin sem restrição |
| Aprovação | Pool global — qualquer admin+/super_admin vê pendentes e aprova |
| Filtragem auto | Queries de estoque/pedidos filtram por `user_branch` (super_admin ignora) |
| Listagem | Tabs `Pendentes / Ativos / Suspensos` |
| Form de aprovação | Sheet lateral (preserva contexto da tabela) |
| Tela pending | Minimal centralizada (ícone + título + parágrafo + botão sair) |
| Ações em user ativo | Editar role/filiais, Suspender, Reset senha, Deletar |
| Rejeição de pending | Hard delete (libera email) |
| Branch default ecommerce | Coluna `branch.isDefault` boolean + partial unique index |
| Sidebar | Grupo "Usuários" no final, após "Catálogo"; só visível pra admin+ |
| Capabilities exclusivas super_admin | `branches.manage`, `users.manage` de admins+, `audit.read` global |

## Arquitetura

### Schema delta

```sql
-- Enum role expandido
ALTER TYPE user_role ADD VALUE 'super_admin' BEFORE 'admin';
-- Ordem final: ['super_admin', 'admin', 'manager', 'user']

-- Status novo
CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended');

-- user.status
ALTER TABLE "user" ADD COLUMN status user_status NOT NULL DEFAULT 'pending';

-- branch.isDefault
ALTER TABLE branch ADD COLUMN is_default boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX branch_is_default_unique
  ON branch (is_default) WHERE is_default = true;

-- M:N user × branch
CREATE TABLE user_branch (
  user_id    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  branch_id  text NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, branch_id)
);
CREATE INDEX user_branch_user_idx   ON user_branch (user_id);
CREATE INDEX user_branch_branch_idx ON user_branch (branch_id);

-- order_note.author_id passa a permitir set null (pra delete de user)
ALTER TABLE order_note ALTER COLUMN author_id DROP NOT NULL;
-- + ajustar FK para ON DELETE SET NULL via Drizzle schema
```

Drizzle (`packages/db/src/schema/`):

- `auth.ts`: adicionar `userStatusEnum` + `user.status`.
- `inventory.ts`: adicionar `branch.isDefault` + `userBranch` (ou criar `user-branch.ts` se preferir isolamento).
- `orders.ts`: `orderNote.authorId` vira `.references(() => user.id, { onDelete: "set null" })` (nullable).
- `packages/db/src/schema/index.ts` (barrel): re-exportar `userStatusEnum`, `UserStatus`, `userBranch`.

**Data migration (executada na mesma transação):**

```sql
-- 1. Todos os usuários existentes ficam ativos (não pendentes)
UPDATE "user" SET status = 'active';

-- 2. Promover 1 admin atual para super_admin (executar manualmente, escolher o owner)
-- UPDATE "user" SET role = 'super_admin' WHERE email = '<owner>@emach.com.br';

-- 3. Marcar Curitiba (br-curitiba) como filial default
UPDATE branch SET is_default = true WHERE id = 'br-curitiba';

-- 4. Backfill user_branch para users existentes que não são super_admin
-- (executar via script seed após escolha; ver §Bootstrap)
```

### Auth flow

**Better Auth (`packages/auth/src/dashboard.ts`):**

```ts
user: {
  additionalFields: {
    role:   { type: "string", required: false, defaultValue: "user",    input: false },
    status: { type: "string", required: false, defaultValue: "pending", input: false },
  },
}
```

`input: false` impede que o client manipule `role`/`status` no payload de signup.

**Layout gate (`apps/web/src/app/dashboard/layout.tsx`):**

```ts
const session = await requireCurrentSession();
const status = session.user.status as UserStatus;
if (status === "pending")   redirect("/pending");
if (status === "suspended") redirect("/suspended");
// status === "active" segue
```

**Rotas top-level (fora `/dashboard`):**

- `apps/web/src/app/pending/page.tsx` — Server Component, exige session + status=`pending`. Caso contrário redireciona conforme estado.
- `apps/web/src/app/suspended/page.tsx` — idem para status=`suspended`.
- Ambas usam layout próprio (sem sidebar). Tela = variante A do brainstorm (minimal centralizada).

**Login page (`apps/web/src/app/login/page.tsx`):** ao ver session existente, redireciona pela mesma lógica do gate (`/pending` | `/suspended` | `/dashboard`).

### Capability matrix

Atualizar `apps/web/src/lib/permissions.ts`:

| Capability | super_admin | admin | manager | user |
|---|---|---|---|---|
| `users.approve` | ✓ | ✓ (target.role ≤ manager) | — | — |
| `users.update_role` | ✓ (target.role < super_admin) | ✓ (target.role ≤ manager) | — | — |
| `users.update_branches` | ✓ | ✓ (target.branches ⊆ actor.branches) | — | — |
| `users.suspend` | ✓ (≠ self) | ✓ (target.role ≤ manager, ≠ self) | — | — |
| `users.reset_password` | ✓ | ✓ (target.role ≤ manager) | — | — |
| `users.delete` | ✓ (≠ self, mantém ≥1 super_admin ativo) | — | — | — |
| `branches.set_default` | ✓ | — | — | — |
| `branches.manage` (CUD) | ✓ | — (read only) | — | — |
| `audit.read` global | ✓ | escopado a próprias filiais | — | — |

`requireCapability` ganha overload:

```ts
requireCapability(cap, { targetUserId?: string; targetBranchIds?: string[] })
```

Quando relevante, server action passa contexto. Implementação resolve `target` via DB e checa hierarquia.

**Helper `getUserBranchScope(session)` (`apps/web/src/lib/branch-scope.ts`):**

```ts
export async function getUserBranchScope(session: DashboardSession):
  Promise<string[] | null> {
  if (session.user.role === "super_admin") return null; // sem filtro
  const rows = await db.select({ branchId: userBranch.branchId })
    .from(userBranch).where(eq(userBranch.userId, session.user.id));
  return rows.map(r => r.branchId);
}
```

Cacheado via `React.cache` por request.

Queries em `apps/web/src/app/dashboard/stock/`, `orders/`, `stock/branches/` aplicam o filtro condicionalmente.

`/dashboard/branches` (listagem de filiais) e o combobox de seleção de filial **não** aplicam escopo — listagem mostra todas as filiais pra qualquer role autenticado (read), mas mutações continuam exclusivas de super_admin (`branches.manage` / `branches.set_default`). Razão: admin precisa enxergar nomes de outras filiais ao revisar pendings transferidos de outro admin, e o sistema fica auditável.

### Server actions (`apps/web/src/app/dashboard/users/actions.ts`)

Todas começam com `"use server"`, validam input via Zod, retornam `ActionResult<T>`, e fazem `revalidatePath("/dashboard/users")` no sucesso.

- `approveUser({ userId, role, branchIds })` — `requireCapability("users.approve", { targetUserId })`. Transação: `UPDATE user SET role=?, status='active'` + `INSERT INTO user_branch`. Rejeita se `branchIds.length === 0 && role !== 'super_admin'`. Admin não pode setar `role='super_admin'` nem `role='admin'` (validado pela capability `users.update_role` aplicada implicitamente sobre o `role` de destino). Admin não-super_admin só pode atribuir filiais ⊆ `actor.branches`.
- `rejectUser({ userId })` — `requireCapability("users.approve", { targetUserId })`. Hard delete (cascade session/account/user_branch). Bloqueia se `status !== 'pending'`.
- `updateUser({ userId, name?, role?, branchIds? })` — `requireCapability("users.update_role"|"users.update_branches"...)` conforme campos enviados. Transação aplica deltas.
- `suspendUser({ userId })` — `requireCapability("users.suspend", { targetUserId })`. `UPDATE user SET status='suspended'` + `DELETE FROM session WHERE user_id=?`. Rejeita self.
- `reactivateUser({ userId })` — `requireCapability("users.suspend", { targetUserId })` (mesma cap; reativar é o inverso). `UPDATE user SET status='active'`.
- `resetUserPassword({ userId })` — `requireCapability("users.reset_password", { targetUserId })`. Cria row em `verification` com token (TTL 1h) + `UPDATE account SET password=NULL WHERE user_id=?`. Retorna `{ token, expiresAt }` no `actionResult.data`. UI exibe modal pós-ação com botão "Copiar link de reset" (formato `${BETTER_AUTH_URL}/reset-password?token=<token>`); admin entrega manualmente até integração de email (fora de escopo).
- `deleteUser({ userId })` — `requireCapability("users.delete", { targetUserId })`. Bloqueia self. Bloqueia último super_admin ativo. Transação:
  1. `UPDATE stock_movement SET actor_type='system', actor_id=NULL WHERE actor_id=?`
  2. `UPDATE order_status_history SET actor_type='system', actor_user_id=NULL WHERE actor_user_id=?`
  3. `UPDATE order_note SET author_id=NULL WHERE author_id=?`
  4. `UPDATE promotion SET created_by=NULL, updated_by=NULL WHERE created_by=? OR updated_by=?`
  5. `DELETE FROM "user" WHERE id=?` (cascade limpa session/account/verification/user_branch)
- `setDefaultBranch({ branchId })` em `apps/web/src/app/dashboard/branches/actions.ts` — `requireCapability("branches.set_default")`. Transação: `UPDATE branch SET is_default=false WHERE is_default=true` + `UPDATE branch SET is_default=true WHERE id=?`.

### UI — telas e componentes

```
apps/web/src/app/
  pending/
    page.tsx                Server Component, layout próprio sem sidebar
    _components/
      pending-card.tsx      Client: card + botão "Sair" (chama authClient.signOut)
  suspended/
    page.tsx                idem, copy diferente
  dashboard/
    users/
      page.tsx              SC: requireCapability("users.approve"). Carrega 3 listas (pending/active/suspended) com counts. Renderiza <UsersTabs>.
      actions.ts            server actions (acima)
      schema.ts             Zod schemas: approveUserInput, updateUserInput, ...
      _components/
        users-tabs.tsx          Client. Tabs com counts. Renderiza tabela por aba.
        pending-table.tsx       Linhas com botão "Revisar" abrindo <ApprovalSheet>.
        active-table.tsx        Linhas com botão "Editar" abrindo <EditSheet>.
        suspended-table.tsx     Linhas com botão "Reativar" inline + "Editar".
        approval-sheet.tsx      Client. role select + branches multi-combobox + Aprovar/Rejeitar.
        edit-sheet.tsx          Client. campos editáveis + ações destrutivas (Suspender/Reset/Delete) com confirm dialogs.
        branches-combobox.tsx   Client. Multi-select de filiais. Filtrado se actor não-super_admin (só mostra suas filiais).
        role-select.tsx         Client. Filtra opções pelo role do actor.
        confirm-dialog.tsx      ou reutiliza primitive existente.
      clients/
        page.tsx              Placeholder simples: <div>Em construção. Em breve.</div>. requireCapability("users.approve").
```

### Sidebar — alteração

`apps/web/src/app/dashboard/_components/app-sidebar.tsx`:

- `NAV_GROUPS` ganha grupo no final:
  ```ts
  {
    label: "Usuários",
    items: [
      { label: "Dashboard", href: "/dashboard/users" },
      { label: "Clientes",  href: "/dashboard/users/clients", disabled: true },
    ],
  }
  ```
- `AppSidebar` recebe prop `pendingCount: number` do `DashboardLayout` (server-fetched: `SELECT count(*) FROM "user" WHERE status='pending'`).
- Badge ao lado de "Dashboard" quando `pendingCount > 0`.
- Grupo só renderiza se `can(role, "users.approve")`. Role vem de `authClient.useSession()`.
- "Clientes" fica `disabled` com tag "em breve" (mesmo padrão de "Banners"/"Configurações").
- Item "Filiais" no grupo Catálogo: continua visível pra admin+ como read-only; edição (incluindo flag `isDefault`) bloqueada na server action.

### Branch default — ecommerce side

**Schema sync (cópia manual em `emach-ecommerce/packages/db/src/schema/inventory.ts`):** adicionar `isDefault` em `branch`.

**Helper novo em `emach-ecommerce/apps/web/src/lib/default-branch.ts`:**

```ts
import { eq } from "drizzle-orm";
import { unstable_cache as cache } from "next/cache";
import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";

export const getDefaultBranchId = cache(
  async (): Promise<string> => {
    const [row] = await db
      .select({ id: branch.id })
      .from(branch)
      .where(eq(branch.isDefault, true))
      .limit(1);
    if (!row) throw new Error("Filial padrão não configurada no DB");
    return row.id;
  },
  ["default-branch"],
  { tags: ["default-branch"], revalidate: 3600 },
);
```

**`apps/web/src/app/checkout/_actions/create-order.ts:335`:**

```diff
- const branchId = env.ECOMMERCE_DEFAULT_BRANCH_ID;
+ const branchId = await getDefaultBranchId();
```

**Limpeza env:**

- `emach-ecommerce/packages/env/src/server.ts` — remover `ECOMMERCE_DEFAULT_BRANCH_ID`.
- `emach-ecommerce/apps/web/.env.example` e `.env` — remover linha.
- `emach-dashboard/apps/web/.env` — remover linha (placeholder não usado).

**Documentação:** atualizar `emach-dashboard/docs/integration/admin-ecommerce.md` com seção "Filial default do ecommerce":

> A filial que processa pedidos do storefront vive em `branch.isDefault = true` (partial unique index garante max 1). O dashboard (super_admin) altera via toggle em `/dashboard/branches/[id]/edit`. O ecommerce lê via `getDefaultBranchId()` cacheado por 1h. Mudanças propagam em até 1h (ou via redeploy).

### Migration sequencing (deploy)

Ordem rígida para evitar checkout quebrado:

1. **DB:** aplicar migration única (gera 5 alterações listadas em `Schema delta`). Inclui backfill de `is_default=true` em `br-curitiba`. Em prod: Drizzle migration versionada + revisão SQL antes de aplicar.
2. **Trigger sync** (se aplicável): nada novo aqui — sem triggers PL/pgSQL.
3. **Schema sync no ecommerce** (cópia manual de `branch.isDefault` no schema do repo ecommerce).
4. **Deploy dashboard** com UI + server actions novas. Verificar `/dashboard/users` + toggle `isDefault`.
5. **Deploy ecommerce** com helper `getDefaultBranchId()` lendo do DB. Checkout passa a ignorar env var.
6. **Cleanup env vars** em `.env` de ambos os repos + `packages/env/src/server.ts` do ecommerce.

Se ecommerce deployar antes da migration: checkout falha por `branch.isDefault` inexistente. Se deployar depois mas antes de `branch.isDefault=true` ser setado: helper joga erro "Filial padrão não configurada". Backfill na migration evita esse buraco.

### Bootstrap inicial (1ª aplicação)

Script `packages/db/scripts/bootstrap-super-admin.ts` (idempotente, dev-only):

```ts
// Promove 1 user a super_admin via email
await db.update(user).set({ role: "super_admin", status: "active" })
  .where(eq(user.email, args.email));
```

Em prod: SQL manual `UPDATE "user" SET role='super_admin', status='active' WHERE email='<owner>@emach.com.br'`.

Após isso, super_admin loga, aprova demais users existentes (a migration os marcou como `active`, mas para coerência com `user_branch` admin pode atribuir filiais retroativamente).

## Edge cases (cobertos pela implementação)

1. Signup email duplicado: Better Auth rejeita (unique constraint). `AuthCard` traduz mensagem.
2. Pending acessando `/login`: layout redireciona `/pending` (lógica do gate).
3. Suspended em aba aberta: server action `suspendUser` apaga sessions; próximo request → 401 → relogin → `/suspended`.
4. Admin editando a si mesmo: bloqueado em `users.suspend`/`users.delete` (`targetUserId !== session.user.id`).
5. Último super_admin tentando se demitir: `users.delete` valida `count(role='super_admin' AND status='active') > 1`.
6. Admin tentando promover acima de manager: capability rejeita.
7. Admin atribuindo filial fora do seu escopo: `users.update_branches` valida subset.
8. Aprovação sem filial pra role não-super_admin: Zod `branchIds.min(1)`.
9. Race de signup → redirect duplo (signup → /dashboard → /pending): aceitar; alternativa é checar status na resposta do `signUp.email` e redirecionar direto.
10. Anti-tampering: `additionalFields.input: false` em `role`/`status`.
11. Deletar branch que é default: server action de delete branch rejeita.
12. Deletar branch com user_branch: cascade em `user_branch` apaga vinculações. User não fica sem filial? Se admin/manager/user ficar com `user_branch` vazio após delete, status continua `active` mas queries de escopo retornam vazio → sem acesso prático. Solução: server action de delete branch primeiro avisa "N usuários estão vinculados a essa filial; reatribua antes" ou força reatribuição. Cobrir como follow-up — `branches.manage` é super_admin only e o aviso pode aparecer.

## Testing

- `apps/web/__tests__/permissions.test.ts`: novos cases para `users.approve`, `users.update_role` (hierarquia), `users.delete` (super_admin only), `branches.set_default`.
- `apps/web/__tests__/branch-scope.test.ts` (novo): cobre `getUserBranchScope` em 4 cenários (super_admin → null, admin com filiais, manager, user).
- Smoke manual antes de marcar pronto:
  - Signup novo → `/pending` mostra tela A.
  - Super_admin aprova com role=manager + 2 filiais → próximo login entra dashboard.
  - Admin tenta promover manager para admin → server action 403.
  - Suspender user com sessão ativa → próximo request redireciona `/suspended`.
  - Listagem stock só mostra filiais do user (testar com manager de 1 filial).
  - Toggle `isDefault` em outra branch → ecommerce checkout (após cache TTL ou redeploy) usa a nova.

## Out of scope

- Email de notificação ao aprovar/suspender/reset (helper externo necessário, fica pra Fase F).
- UI de "Clientes" (`/dashboard/users/clients`) — placeholder.
- M:N para roles (1 user pode ter múltiplos roles). Hoje 1 role por user.
- Audit log dedicado das ações de gestão de users (`user_action_log`) — usar logger central por agora; tabela formal pode vir junto com `audit.read`.
- Self-service de mudança de filial pelo próprio user — só admin altera.
- Override de capabilities por user (overrides individuais além do role).

## Critérios de aceite

- Signup novo não consegue navegar pra nenhuma rota `/dashboard/*` até ter `status='active'`.
- Admin de Curitiba consegue aprovar um pending mas só consegue atribuir Curitiba (não SP).
- Super_admin consegue marcar SP como default; após cache TTL, ecommerce processa pedidos contra SP.
- Deletar último super_admin retorna erro "Necessário ao menos 1 super_admin ativo".
- `ECOMMERCE_DEFAULT_BRANCH_ID` removido de ambos os repos e de toda doc.
- `bun check-types` e `bun fix` passam.
- `bun test apps/web` passa (com novos cases de permissions).
