# Religação de Gates: 3 níveis + escopo de filial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Cada subagente DEVE:** ler cada arquivo com Read **antes** de Edit (não herda state do parent); rodar `bun check-types` antes de cada commit; em mudança de UI/SSR, smoke visual na rota (check-types não pega hook client em Server Component nem SQL inválido em template).

**Goal:** Religar a autorização do dashboard com 3 níveis (`super_admin`/`admin`/`user`) e escopo de filial em dois planos (visibilidade + ação), substituindo o regime no-op do ADR-0012.

**Architecture:** Dois eixos ortogonais — Capability (`requireCapability`, "que tipo de ação") e Branch-scope (`getUserBranchScope`, "qual filial"). Reaproveita os 138 callsites intactos e o scaffolding de filtro de Pedidos. Fail-closed; invariante "todo admin/user tem ≥1 filial".

**Tech Stack:** Next 16 / React 19, Drizzle ORM (Postgres), Better Auth (instância dashboard), Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-06-15-niveis-autorizacao-design.md` · **ADR:** `docs/adr/0016-religacao-gates-3-niveis-filial.md`

---

## File Structure

| Arquivo | Responsabilidade | Ação |
| --- | --- | --- |
| `apps/web/src/lib/branch-scope.ts` | Tipo `BranchScope` + `getUserBranchScope` real + helpers de filtro | Reescrever |
| `apps/web/src/lib/permissions.ts` | Matriz de capability religada (3 roles) + guard de `targetBranchIds ⊆ scope` | Reescrever (base: `.disabled`) |
| `apps/web/src/lib/session.ts` | `requireRole` checa `ROLE_WEIGHT`; aliasar `manager`→admin | Modificar |
| `apps/web/src/app/dashboard/orders/data.ts`, `pending-data.ts` | Consumir novo `BranchScope` + Pedido na triagem | Modificar |
| `apps/web/src/app/dashboard/stock/**` (data + actions) | Construir branch-scope + agregado scoped | Modificar |
| `apps/web/src/app/dashboard/categories/actions.ts`, `promotions/actions.ts` | Repontar delete p/ cap novo | Modificar |
| `apps/web/src/app/dashboard/tools/_components/image-actions.ts` | `requireRole` → `requireCapability` | Modificar |
| `apps/web/src/app/dashboard/suppliers/page.tsx` | `role ===` → `can()` | Modificar |
| `apps/web/src/app/dashboard/users/actions.ts` | Convite ≥1 filial, share-branch visibility, last-branch guard | Modificar |
| `apps/web/src/app/dashboard/_components/nav-config.ts` + sidebar | Gating real por `can()` | Modificar |
| `apps/web/__tests__/permissions.test.ts`, `branch-scope.test.ts` | Testes de matriz + scope | Criar/estender |
| `scripts/` (novo) | Migração `manager→admin` + povoar `user_branch` | Criar |
| `CLAUDE.md`, `apps/web/CLAUDE.md`, `packages/db/CLAUDE.md` | Remover notas de no-op | Modificar |

**Ordem de deploy crítica:** Tasks 1-10 (código) podem mergear primeiro, mas a **Task 11 (migração de dados)** precisa rodar **antes** do código ir pra produção — fail-closed cega quem não tiver filial. Em dev, rodar Task 11 logo após Task 7.

---

## Task 1: Tipo BranchScope + getUserBranchScope real + helpers

**Files:**
- Modify: `apps/web/src/lib/branch-scope.ts` (reescrever)
- Test: `apps/web/__tests__/branch-scope.test.ts` (criar)

- [ ] **Step 1: Escrever o teste falhando**

```ts
// apps/web/__tests__/branch-scope.test.ts
import { describe, expect, it } from "vitest";
import { inScope, isBlindScope, type BranchScope } from "@/lib/branch-scope";

const all: BranchScope = { kind: "all" };
const sp: BranchScope = { kind: "scoped", branchIds: ["b-sp"], includeUnassigned: true };
const userSp: BranchScope = { kind: "scoped", branchIds: ["b-sp"], includeUnassigned: false };
const blind: BranchScope = { kind: "scoped", branchIds: [], includeUnassigned: false };

describe("inScope", () => {
  it("all → sempre true", () => expect(inScope(all, "qualquer")).toBe(true));
  it("scoped → só filiais da lista", () => {
    expect(inScope(sp, "b-sp")).toBe(true);
    expect(inScope(sp, "b-rj")).toBe(false);
  });
});

describe("isBlindScope", () => {
  it("user sem filial → cego", () => expect(isBlindScope(blind)).toBe(true));
  it("admin sem filial mas com triagem → não cego", () =>
    expect(isBlindScope({ kind: "scoped", branchIds: [], includeUnassigned: true })).toBe(false));
  it("all → nunca cego", () => expect(isBlindScope(all)).toBe(false));
  it("user com filial → não cego", () => expect(isBlindScope(userSp)).toBe(false));
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun --cwd apps/web test branch-scope`
Expected: FAIL (`isBlindScope`/novo tipo não existem).

- [ ] **Step 3: Reescrever `branch-scope.ts`**

```ts
import { authDashboard } from "@emach/auth/dashboard"; // só p/ tipos abaixo se necessário
import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import { userBranch } from "@emach/db/schema/inventory";
import { eq, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import type { UserRole } from "@/lib/session";

export type BranchScope =
  | { kind: "all" }
  | { kind: "scoped"; branchIds: string[]; includeUnassigned: boolean };

// super_admin → all; admin/manager → scoped + vê Pedido na triagem; user → scoped sem triagem.
export const getUserBranchScope = cache(
  async (session: DashboardSession): Promise<BranchScope> => {
    const role = (session.user.role ?? "user") as UserRole;
    if (role === "super_admin") {
      return { kind: "all" };
    }
    const rows = await db
      .select({ branchId: userBranch.branchId })
      .from(userBranch)
      .where(eq(userBranch.userId, session.user.id));
    return {
      kind: "scoped",
      branchIds: rows.map((r) => r.branchId),
      includeUnassigned: role === "admin" || role === "manager",
    };
  }
);

export function inScope(scope: BranchScope, branchId: string): boolean {
  return scope.kind === "all" || scope.branchIds.includes(branchId);
}

// "Cego" = não enxerga nada: scoped, sem filiais e sem triagem.
export function isBlindScope(scope: BranchScope): boolean {
  return (
    scope.kind === "scoped" &&
    scope.branchIds.length === 0 &&
    !scope.includeUnassigned
  );
}

// Condição SQL para listagens de Pedidos (alias `o`). Trata Pedido na triagem (branch_id NULL).
// undefined = sem filtro (super_admin). `sql\`false\`` = cego (nada).
export function orderBranchCondition(scope: BranchScope): SQL | undefined {
  if (scope.kind === "all") {
    return undefined;
  }
  const parts: SQL[] = [];
  if (scope.branchIds.length > 0) {
    parts.push(
      sql`o.branch_id IN (${sql.join(scope.branchIds.map((id) => sql`${id}`), sql`, `)})`
    );
  }
  if (scope.includeUnassigned) {
    parts.push(sql`o.branch_id IS NULL`);
  }
  if (parts.length === 0) {
    return sql`false`;
  }
  return sql`(${sql.join(parts, sql` OR `)})`;
}
```

(Remova o import não usado de `authDashboard` se o lint reclamar — manter só `type DashboardSession`.)

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bun --cwd apps/web test branch-scope`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/branch-scope.ts apps/web/__tests__/branch-scope.test.ts
git commit -m "feat(auth): BranchScope com triagem + getUserBranchScope real"
```

---

## Task 2: Matriz de capability religada (3 roles)

**Files:**
- Modify: `apps/web/src/lib/permissions.ts`
- Reference: `apps/web/src/lib/permissions.disabled.ts` (matriz original)
- Test: `apps/web/__tests__/permissions.test.ts` (estender)

> Lê `permissions.disabled.ts` inteiro antes de começar — a base de `ALL_CAPS`, `requireCapability*` e `can` vem dele. **Não** restaurar tal qual: 3 roles, novos exclusivos, split de caps (Task 3 adiciona `categories.delete`/`promotions.delete` ao tipo — coordene a ordem: faça a Task 3 antes ou inclua os 2 caps já aqui).

- [ ] **Step 1: Escrever o teste da matriz**

```ts
// apps/web/__tests__/permissions.test.ts (adicionar/substituir bloco da matriz)
import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("matriz de capability (3 níveis)", () => {
  it("super_admin pode tudo, inclusive exclusivos", () => {
    for (const cap of ["branches.manage", "users.delete", "tools.delete", "site.update_settings"] as const) {
      expect(can("super_admin", cap)).toBe(true);
    }
  });

  it("admin edita catálogo mas NÃO deleta", () => {
    expect(can("admin", "tools.create")).toBe(true);
    expect(can("admin", "tools.update")).toBe(true);
    expect(can("admin", "tools.delete")).toBe(false);
    expect(can("admin", "categories.delete")).toBe(false);
    expect(can("admin", "promotions.delete")).toBe(false);
  });

  it("admin NÃO acessa exclusivos de super_admin", () => {
    for (const cap of ["branches.manage", "users.delete", "site.update_settings", "site.update_banners"] as const) {
      expect(can("admin", cap)).toBe(false);
    }
  });

  it("admin gerencia usuários (não-delete) e modera", () => {
    expect(can("admin", "users.approve")).toBe(true);
    expect(can("admin", "users.suspend")).toBe(true);
    expect(can("admin", "reviews.moderate")).toBe(true);
    expect(can("admin", "orders.refund")).toBe(true);
  });

  it("user é operacional: lê tudo, ajusta estoque, atualiza status — nada destrutivo", () => {
    expect(can("user", "orders.read")).toBe(true);
    expect(can("user", "stock.adjust")).toBe(true);
    expect(can("user", "orders.update_status")).toBe(true);
    expect(can("user", "tools.create")).toBe(false);
    expect(can("user", "orders.cancel")).toBe(false);
    expect(can("user", "reviews.moderate")).toBe(false);
  });

  it("manager é alias de admin", () => {
    expect(can("manager", "tools.create")).toBe(true);
    expect(can("manager", "tools.delete")).toBe(false);
  });

  it("role nula/desconhecida → nega", () => {
    expect(can(null, "orders.read")).toBe(false);
    expect(can("intruso", "orders.read" as never)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test permissions`
Expected: FAIL (`can` é no-op `Boolean(role)`).

- [ ] **Step 3: Reescrever a matriz em `permissions.ts`**

Adicionar ao tipo `Capability` os dois caps novos (`"categories.delete"`, `"promotions.delete"`) e ao `ALL_CAPS`. Substituir o `can` no-op e adicionar `ROLE_CAPS`:

```ts
const ALL_CAPS: readonly Capability[] = [/* ...todos, incluindo categories.delete, promotions.delete... */];

const USER_CAPS: readonly Capability[] = [
  "tools.read", "categories.read", "suppliers.read", "branches.read", "stock.read",
  "promotions.read", "orders.read", "customers.read", "site.read", "reviews.read", "attributes.read",
  "stock.adjust", "orders.update_status", "orders.add_note",
];

const SUPER_ADMIN_EXCLUSIVE: readonly Capability[] = [
  "branches.manage", "users.delete",
  "site.update_banners", "site.update_settings", "site.publish_announcements",
  "tools.delete", "categories.delete", "promotions.delete", "attributes.delete",
];

const ADMIN_CAPS: readonly Capability[] = ALL_CAPS.filter(
  (c) => !SUPER_ADMIN_EXCLUSIVE.includes(c)
);

const ROLE_CAPS: Record<UserRole, readonly Capability[]> = {
  super_admin: ALL_CAPS,
  admin: ADMIN_CAPS,
  manager: ADMIN_CAPS, // aposentado: alias de admin
  user: USER_CAPS,
};

export function can(role: string | null | undefined, cap: Capability): boolean {
  if (!(role && role in ROLE_CAPS)) {
    return false;
  }
  return ROLE_CAPS[role as UserRole].includes(cap);
}
```

Restaurar o enforcement real em `requireCapability` (volta a checar `can`) e em `requireCapabilityWithContext` o bloco `targetBranchIds ⊆ scope` da versão `.disabled` (usando `getUserBranchScope` quando `role !== "super_admin"`). **Manter** os guard-rails atuais (`ensureActive`, `SELF_RESTRICTED`, `assertNotLastActiveSuperAdmin`).

```ts
export async function requireCapability(cap: Capability): Promise<DashboardSession> {
  const session = await requireCurrentSession();
  ensureActive(session);
  if (!can(session.user.role, cap)) {
    throw new Error(`Forbidden: capability "${cap}" requerida`);
  }
  return session;
}
```

No `requireCapabilityWithContext`, após os guards de self/last-super-admin, adicionar:

```ts
if (ctx.targetBranchIds && session.user.role !== "super_admin") {
  const scope = await getUserBranchScope(session);
  for (const targetId of ctx.targetBranchIds) {
    if (!inScope(scope, targetId)) {
      throw new Error(`Filial fora do seu escopo: ${targetId}`);
    }
  }
}
```

(Importar `getUserBranchScope`, `inScope` de `@/lib/branch-scope`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test permissions`
Expected: PASS.

- [ ] **Step 5: check-types + commit**

```bash
bun check-types
git add apps/web/src/lib/permissions.ts apps/web/__tests__/permissions.test.ts
git commit -m "feat(auth): religar matriz de capability com 3 níveis e exclusivos de super_admin"
```

---

## Task 3: Repontar deletes do catálogo para os caps novos

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/actions.ts` (`deleteCategory`)
- Modify: `apps/web/src/app/dashboard/promotions/actions.ts` (`deletePromotion`)

> `categories.delete` e `promotions.delete` já entraram no tipo na Task 2. Aqui só troca a chamada.

- [ ] **Step 1: Repontar `deleteCategory`**

Em `categories/actions.ts`, na função `deleteCategory`, trocar:
`await requireCapability("categories.manage");` → `await requireCapability("categories.delete");`

- [ ] **Step 2: Repontar `deletePromotion`**

Em `promotions/actions.ts`, na função `deletePromotion`, trocar:
`await requireCapability("promotions.manage");` → `await requireCapability("promotions.delete");`

- [ ] **Step 3: check-types + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/categories/actions.ts apps/web/src/app/dashboard/promotions/actions.ts
git commit -m "feat(auth): separar capability de delete de categoria/promoção"
```

---

## Task 4: requireRole checa ROLE_WEIGHT

**Files:**
- Modify: `apps/web/src/lib/session.ts`

- [ ] **Step 1: Restaurar checagem em `requireRole`**

`ROLE_WEIGHT` já existe (4 chaves). `manager` permanece com peso 2 (alias de admin). Substituir o corpo no-op de `requireRole`:

```ts
export const requireRole = async (role: UserRole): Promise<DashboardSession> => {
  const session = await requireCurrentSession();
  if (session.user.status !== "active") {
    throw new Error("Conta não ativa");
  }
  const actual = (session.user.role ?? "user") as UserRole;
  if (ROLE_WEIGHT[actual] < ROLE_WEIGHT[role]) {
    throw new Error(`Forbidden: role "${role}" requerida`);
  }
  return session;
};
```

- [ ] **Step 2: check-types + commit**

```bash
bun check-types
git add apps/web/src/lib/session.ts
git commit -m "feat(auth): requireRole volta a checar ROLE_WEIGHT"
```

---

## Task 5: Pedidos — filtro com Pedido na triagem

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (`listOrderBranches`, `fetchOrdersPage`, e o 3º uso ~L389)
- Modify: `apps/web/src/app/dashboard/orders/pending-data.ts` (~L33)

> Os consumidores usam a forma antiga (`scope === null` / `scope.length === 0` / `branch_id IN`). Migrar para `orderBranchCondition` / `isBlindScope`. **Read os dois arquivos inteiros antes de editar.**

- [ ] **Step 1: Migrar `fetchOrdersPage`**

Substituir o bloco de early-return + construção do `branch_id IN`:

```ts
const scope = await getUserBranchScope(session);
if (isBlindScope(scope)) {
  return { items: [], nextCursor: null };
}
// ...
const branchCond = orderBranchCondition(scope);
if (branchCond) {
  conditions.push(branchCond);
}
```

Remover o `if (scope !== null && scope.length === 0)` e o bloco `if (scope !== null) { ...placeholders... }` antigos. Importar `isBlindScope`, `orderBranchCondition` de `@/lib/branch-scope`.

- [ ] **Step 2: Migrar `listOrderBranches`**

A lista de filiais do seletor deve refletir o escopo (super_admin → todas; scoped → só as suas; cego → vazio):

```ts
const scope = await getUserBranchScope(session);
if (scope.kind === "all") {
  return query; // todas
}
if (scope.branchIds.length === 0) {
  return [];
}
return db.select({ ... }).from(branch)
  .where(inArray(branch.id, scope.branchIds))
  .orderBy(asc(branch.name));
```

- [ ] **Step 3: Migrar o 3º uso (~L389) e `pending-data.ts`**

Aplicar o mesmo padrão (`isBlindScope` guard + `orderBranchCondition`) onde `getUserBranchScope` é consumido. Em `pending-data.ts`, o contador de pendências deve usar a mesma condição (admin conta triagem; user não).

- [ ] **Step 4: Smoke**

Run: `bun dev:web`, logar como user de uma filial → ver só pedidos dela; como admin → ver os da filial + Pedidos na triagem; como super_admin → todos. Stack trace: `nextjs_call <port> get_errors`.

- [ ] **Step 5: check-types + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/orders/pending-data.ts
git commit -m "feat(orders): branch-scope de visibilidade com Pedido na triagem"
```

---

## Task 6: Estoque — construir branch-scope + agregado scoped

**Files:**
- Modify: data-fetchers de estoque (`apps/web/src/app/dashboard/stock/**/*-data.ts` / `data.ts`)
- Modify: actions de estoque (`stock/actions.ts` e `stock/movements/actions.ts`) — validar `branchId ∈ scope`
- Modify: agregado "Estoque geral" em `suppliers/[id]` (aba estoque) e `tools/[id]` (card de estoque)

> Estoque não tem scaffolding. **Read cada arquivo antes de editar.** Estoque sempre tem filial → sem `includeUnassigned` (use `inScope`/lista de `branchIds`, nunca o ramo de triagem).

- [ ] **Step 1: Filtrar listagens de Stock Level por escopo**

Nas queries que listam `stock_level` por filial, adicionar `WHERE branch_id IN (scope.branchIds)` quando `scope.kind === "scoped"` (e early-return vazio quando `branchIds` vazio). super_admin (`kind: "all"`) → sem filtro.

- [ ] **Step 2: Validar filial nas mutações**

Em `recordStockEntry`, `recordStockWriteOff`, `adjustStock`, `updateStockThresholds`: trocar `requireCapability("stock.adjust")` por `requireCapabilityWithContext("stock.adjust", { targetBranchIds: [branchId] })` — o guard de scope (Task 2) rejeita filial fora do escopo.

- [ ] **Step 3: Tornar "Estoque geral" scoped na exibição**

No SELECT que soma `stock_level.quantity` para o agregado (cards de Tool + aba do Fornecedor), adicionar o mesmo `WHERE branch_id IN (scope.branchIds)` quando scoped. super_admin vê o total cross-filial. Resultado: o número exibido = soma só das filiais do staff.

- [ ] **Step 4: Smoke**

`bun dev:web`: user de SP vê só estoque de SP; o "Estoque geral" de uma Tool com estoque em 2 filiais mostra só a parcela de SP; mutar estoque de outra filial via action → erro "Filial fora do seu escopo".

- [ ] **Step 5: check-types + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/stock apps/web/src/app/dashboard/suppliers apps/web/src/app/dashboard/tools
git commit -m "feat(stock): branch-scope de estoque, mutações e agregado de exibição"
```

---

## Task 7: Gestão de usuários por admin

**Files:**
- Modify: `apps/web/src/app/dashboard/users/actions.ts` (`inviteUser`, `unlinkUserFromBranch`)
- Modify: data-fetcher da lista de usuários (`users/*-data.ts` / `data.ts`)
- Modify: `apps/web/src/app/dashboard/users/schema.ts` (validação do convite)

> **Read os arquivos antes de editar.**

- [ ] **Step 1: Convite exige ≥1 filial para admin/user**

No `inviteUserSchema` (`users/schema.ts`), adicionar `superRefine`: se `role !== "super_admin"`, então `branchIds.length >= 1` (erro no campo `branchIds`). super_admin pode vazio.

- [ ] **Step 2: `inviteUser` valida escopo do convite**

Já usa `requireCapabilityWithContext("users.approve", { targetBranchIds })` — o guard de scope (Task 2) garante `targetBranchIds ⊆ escopo do admin`. Garantir que a action passa `targetBranchIds` do payload. Adicionar guard: admin só pode convidar `role === "user"` (super_admin convida qualquer). (A UI já limita via `allowedApprovalRoles`; reforçar no servidor.)

- [ ] **Step 3: Last-branch guard em `unlinkUserFromBranch`**

Antes de deletar o vínculo, contar os vínculos do alvo; se o alvo tem `role IN ('admin','user')` e ficaria com 0 filiais, lançar `throw new Error("Usuário precisa de ao menos 1 filial")`.

```ts
const remaining = await db.select({ n: sql<number>`count(*)::int` })
  .from(userBranch).where(and(eq(userBranch.userId, targetUserId), ne(userBranch.branchId, branchId)));
const [target] = await db.select({ role: userTable.role }).from(userTable).where(eq(userTable.id, targetUserId)).limit(1);
if (target && target.role !== "super_admin" && (remaining[0]?.n ?? 0) < 1) {
  throw new Error("Usuário precisa de ao menos 1 filial");
}
```

- [ ] **Step 4: Lista de usuários filtrada por filial compartilhada (para admin)**

No data-fetcher da lista de usuários: se `scope.kind === "scoped"`, retornar só usuários que têm ≥1 vínculo em `user_branch` cuja `branch_id ∈ scope.branchIds` **e** `role = 'user'`. super_admin vê todos.

```sql
-- esboço da condição
u.role = 'user' AND EXISTS (
  SELECT 1 FROM user_branch ub
  WHERE ub.user_id = u.id AND ub.branch_id IN (:scopeBranchIds)
)
```

- [ ] **Step 5: Smoke**

`bun dev:web`: admin de SP vê só users role=user de SP; convidar sem filial → erro de validação; desvincular a última filial de um user → erro; admin não vê outros admins.

- [ ] **Step 6: check-types + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/users
git commit -m "feat(users): admin gerencia user da própria filial, convite exige filial, last-branch guard"
```

---

## Task 8: image-actions usa requireCapability

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/image-actions.ts`

- [ ] **Step 1: Trocar `requireRole` por `requireCapability`**

`uploadToolImage`: `await requireRole("admin")` → `await requireCapability("tools.update")`.
`deleteToolImage`: `await requireRole("admin")` → `await requireCapability("tools.delete")`.
Remover o import de `requireRole` se ficar órfão; importar `requireCapability` de `@/lib/permissions`.

- [ ] **Step 2: check-types + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/image-actions.ts
git commit -m "fix(auth): imagens de tool usam requireCapability (não requireRole)"
```

---

## Task 9: suppliers/page usa can()

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/page.tsx:24-25`

- [ ] **Step 1: Trocar comparação direta por `can()`**

Substituir `role === "admin" || role === "super_admin" || role === "manager"` por `can(role, "suppliers.manage")`. Importar `can` de `@/lib/permissions`.

- [ ] **Step 2: check-types + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/suppliers/page.tsx
git commit -m "refactor(auth): suppliers usa can() em vez de comparação de role"
```

---

## Task 10: Gating de UI por can()

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/nav-config.ts` + sidebar (`app-sidebar.tsx`)
- Modify: componentes de botão deletar/editar que hoje recebem flag no-op

> O `can()` agora retorna o valor real, então os flags derivados (`canDelete`, `canMutate`, `canManageUsers`...) já filtram automaticamente nos pontos que computam via `can()`. Esta task confirma e ajusta os pontos onde o gating sumiu.

- [ ] **Step 1: Sidebar — itens por capability**

Confirmar que o grupo "Administração/Usuários" só aparece para `can(role, "users.approve")` (já existe) — agora real. Adicionar gating onde fizer sentido (ex.: item Configurações só `can(role, "site.update_settings")` → só super_admin). Mapear cada item de `nav-config.ts` a uma capability e filtrar.

- [ ] **Step 2: Botões deletar do catálogo — só super_admin**

Onde `canDelete` controla botão de deletar de tool/categoria/promoção, garantir que deriva de `can(role, "tools.delete")` / `"categories.delete"` / `"promotions.delete"` (não de `"...manage"`/`"...update"`). Assim admin vê editar mas não deletar.

- [ ] **Step 3: Smoke visual (todas as roles)**

`bun dev:web`: como user → sem botões de criar/editar catálogo, sem grupo Usuários, sem Configurações; como admin → edita catálogo mas sem botão Deletar, sem Filiais/Configurações; como super_admin → tudo.

- [ ] **Step 4: `bun check` + commit**

```bash
bun check
git add apps/web/src/app/dashboard/_components apps/web/src/app/dashboard
git commit -m "feat(ui): gating de sidebar e botões destrutivos por capability real"
```

---

## Task 11: Migração de dados (rodar ANTES do go-live)

**Files:**
- Create: `scripts/migrate-roles-and-branches.ts` (ou SQL avulso)

> Ordem crítica: rodar após Task 7 e **antes** de o código escopado ir pra produção.

- [ ] **Step 1: `manager → admin`**

```sql
UPDATE "user" SET role = 'admin' WHERE role = 'manager';
```

- [ ] **Step 2: Povoar `user_branch` para todo admin/user ativo**

Baseline: vincular o responsável de cada filial. Operadores adicionais via UI (`linkUserToBranch`) ou INSERT explícito. Template:

```sql
-- baseline: responsável da filial vira vínculo
INSERT INTO user_branch (user_id, branch_id)
SELECT b.responsible_user_id, b.id
FROM branch b
WHERE b.responsible_user_id IS NOT NULL
ON CONFLICT (user_id, branch_id) DO NOTHING;
```

> O mapeamento completo de operadores↔filial precisa ser confirmado com o negócio (não há fonte canônica no schema além de `responsibleUserId`). Vincular os demais antes do Step 3.

- [ ] **Step 3: Verificar zero órfãos**

```sql
SELECT id, email, role FROM "user"
WHERE role IN ('admin','user') AND status = 'active'
  AND id NOT IN (SELECT user_id FROM user_branch);
```

Expected: **0 linhas**. Se houver, vincular antes de prosseguir — senão ficam cegos (fail-closed).

- [ ] **Step 4: Commit do script**

```bash
git add scripts/migrate-roles-and-branches.ts
git commit -m "chore(auth): script de migração manager→admin e povoamento de user_branch"
```

---

## Task 12: Atualizar docs (remover notas de no-op)

**Files:**
- Modify: `CLAUDE.md` (raiz — bloco "Gates role-based desligados")
- Modify: `apps/web/CLAUDE.md` (seção Capabilities)
- Modify: `packages/db/CLAUDE.md` (remover item de gap do ADR-0012)

- [ ] **Step 1: Substituir as notas de no-op**

Trocar os blocos "⚠️ Desligado em 2026-05-27 (ADR-0012)" por nota apontando o regime ativo (ADR-0016): gates religados, 3 níveis, branch-scope em dois planos. Remover o gap de "religar antes de produção" em `packages/db/CLAUDE.md`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md apps/web/CLAUDE.md packages/db/CLAUDE.md
git commit -m "docs: atualizar CLAUDE.md para o regime de gates religados (ADR-0016)"
```

---

## Self-Review (cobertura do spec)

- ✅ Modelo 3 níveis + manager alias → Task 2, 4, 11
- ✅ Exclusivos de super_admin + split de caps → Task 2, 3
- ✅ BranchScope + getUserBranchScope + fail-closed → Task 1
- ✅ Pedido na triagem (admin vê, user não) → Task 1, 5
- ✅ Estoque scoped + agregado → Task 6
- ✅ Invariante ≥1 filial + last-branch guard → Task 7
- ✅ Inconsistências (requireRole, role===) → Task 8, 9
- ✅ UI gating → Task 10
- ✅ Migração de dados + verificação → Task 11
- ✅ Docs (ADR/CONTEXT já feitos; CLAUDE.md) → Task 12

**Riscos de execução:** Tasks 5/6/7 mexem em SSR — `check-types` não pega SQL inválido nem hook client em Server Component; smoke visual obrigatório. Task 6 tem o maior delta (sem scaffolding prévio).
