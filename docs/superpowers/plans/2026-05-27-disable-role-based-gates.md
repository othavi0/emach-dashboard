# Desligar bloqueios role-based — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar `requireCapability*` e `getUserBranchScope` no-op (validam só sessão + status `active`), mantendo a forma do API e os 138 callsites intactos. Preservar matriz role-based em arquivo desacoplado pra reativação futura.

**Architecture:** No-op interno em 3 arquivos de gate (`permissions.ts`, `branch-scope.ts`, `session.ts`). Status gate (camada 1) permanece. Self-action guard e last-super-admin guard (novo, extraído de código já existente em `deleteUser`) ficam como guard-rails de integridade. Schema do DB não muda.

**Tech Stack:** TypeScript 5, Next.js 16, Drizzle ORM 0.45, Vitest, Bun, Better Auth (já configurado).

**Spec:** `docs/superpowers/specs/2026-05-27-disable-role-based-gates-design.md`

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/permissions.disabled.ts` | **criar** | Preserva matriz `ROLE_CAPS` original + `requireCapabilityWithContext` antiga pra reativação |
| `apps/web/src/lib/permissions.ts` | **reescrever** | `can()` no-op; `requireCapability*` valida sessão + active; `requireCapabilityWithContext` mantém self-action + last-super-admin guard |
| `apps/web/src/lib/branch-scope.ts` | **modificar** | `getUserBranchScope` sempre retorna `null` |
| `apps/web/src/lib/session.ts` | **modificar** | `requireRole` vira no-op (valida sessão + active) |
| `apps/web/__tests__/permissions.test.ts` | **reescrever** | Testar novo comportamento (no-op + ensureActive + guards) |
| `apps/web/__tests__/branch-scope.test.ts` | **modificar** | Refletir que scope é sempre `null` |
| `docs/adr/0012-disable-role-based-gates.md` | **criar** | ADR registrando decisão e plano de reativação |
| `CLAUDE.md` | **modificar** | Atualizar seção "Auth — invariantes P0" |
| `apps/web/CLAUDE.md` | **modificar** | Atualizar seção "Capabilities" |
| `packages/db/CLAUDE.md` | **modificar** | Adicionar item de gap apontando pro ADR |

**Não tocados:** os ~38 arquivos com callsites `requireCapability*`, layout do dashboard, sidebar, `lockOrderAndAuthorize`, schema do DB.

---

## Task 1: Preservar matriz antiga em `permissions.disabled.ts`

**Files:**
- Create: `apps/web/src/lib/permissions.disabled.ts`

- [ ] **Step 1: Copiar conteúdo atual de `permissions.ts` pro novo arquivo com header de preservação**

Criar `apps/web/src/lib/permissions.disabled.ts` com:

```ts
// @ts-nocheck
//
// PRESERVADO — gates role-based desligados em 2026-05-27 (ver docs/adr/0012-disable-role-based-gates.md).
// Este arquivo NÃO é importado em runtime. Para reativar:
//   1. Copiar este conteúdo de volta pra `permissions.ts` (sobrescrevendo o no-op).
//   2. Restaurar consulta em `branch-scope.ts`.
//   3. Restaurar checagem de ROLE_WEIGHT em `session.ts:requireRole`.
//   4. Auditar `user_branch` antes de religar (registros podem ter ficado dessincronizados).

import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import type { UserRole } from "@emach/db/schema/auth";
import { user as userTable } from "@emach/db/schema/auth";
import { userBranch } from "@emach/db/schema/inventory";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ROLE_WEIGHT, requireCurrentSession } from "@/lib/session";

// [resto do conteúdo idêntico ao `permissions.ts` atual — copiar bytes a bytes]
```

**Importante:** copiar o conteúdo bruto de `apps/web/src/lib/permissions.ts` (262 linhas), substituindo só o cabeçalho. Não traduzir, não simplificar.

- [ ] **Step 2: Verificar que TS não tenta compilar este arquivo como código vivo**

Run: `cd apps/web && bun check-types`
Expected: passa (o `@ts-nocheck` previne erros mesmo que imports fiquem temporariamente sem destino).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/permissions.disabled.ts
git commit -m "chore: preservar matriz role-based em permissions.disabled.ts"
```

---

## Task 2: Substituir testes de `can()` pelo novo comportamento (TDD red)

**Files:**
- Modify: `apps/web/__tests__/permissions.test.ts`

- [ ] **Step 1: Substituir o arquivo de testes pelo novo conjunto**

Sobrescrever `apps/web/__tests__/permissions.test.ts` com:

```ts
import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("can() — no-op pós ADR-0012", () => {
	it("retorna true para qualquer role válida + qualquer capability", () => {
		expect(can("super_admin", "tools.delete")).toBe(true);
		expect(can("admin", "users.delete")).toBe(true);
		expect(can("manager", "branches.manage")).toBe(true);
		expect(can("user", "orders.refund")).toBe(true);
		expect(can("user", "customers.export")).toBe(true);
	});

	it("retorna false para role null/undefined/string vazia", () => {
		expect(can(null, "tools.read")).toBe(false);
		expect(can(undefined, "tools.read")).toBe(false);
		expect(can("", "tools.read")).toBe(false);
	});

	it("retorna true para string arbitrária não vazia (no-op não inspeciona role)", () => {
		// Comportamento aceito do no-op: só rejeita falsy. Cobertura real é status gate.
		expect(can("hacker", "tools.read")).toBe(true);
	});
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

Run: `cd apps/web && bun test __tests__/permissions.test.ts`
Expected: FAIL — porque `can("user", "tools.delete")` ainda retorna `false` na implementação atual.

- [ ] **Step 3: Commit (red)**

```bash
git add apps/web/__tests__/permissions.test.ts
git commit -m "test: novos testes do can() no-op (red)"
```

---

## Task 3: Reescrever `permissions.ts` com no-op + helpers

**Files:**
- Modify: `apps/web/src/lib/permissions.ts`

- [ ] **Step 1: Sobrescrever `permissions.ts` com a nova implementação**

Substituir todo o conteúdo de `apps/web/src/lib/permissions.ts` por:

```ts
import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { and, eq, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireCurrentSession } from "@/lib/session";

// ⚠️ Gates role-based desligados em 2026-05-27 (ver docs/adr/0012-disable-role-based-gates.md).
// Matriz original preservada em `permissions.disabled.ts`. Não adicionar capabilities novas
// sem religar primeiro — o tipo ainda é checado para que callsites continuem corretos.

export type Capability =
	| "tools.read"
	| "tools.create"
	| "tools.update"
	| "tools.delete"
	| "categories.read"
	| "categories.manage"
	| "suppliers.read"
	| "suppliers.manage"
	| "branches.read"
	| "branches.manage"
	| "stock.read"
	| "stock.adjust"
	| "promotions.read"
	| "promotions.manage"
	| "orders.read"
	| "orders.update_status"
	| "orders.cancel"
	| "orders.refund"
	| "orders.add_note"
	| "orders.export"
	| "customers.read"
	| "customers.update_status"
	| "customers.export"
	| "customers.manage_sessions"
	| "customers.reset_password"
	| "site.read"
	| "site.update_banners"
	| "site.update_settings"
	| "site.publish_announcements"
	| "reviews.read"
	| "reviews.moderate"
	| "users.manage"
	| "users.approve"
	| "users.update_role"
	| "users.update_branches"
	| "users.suspend"
	| "users.reset_password"
	| "users.revoke_sessions"
	| "users.delete"
	| "audit.read"
	| "attributes.read"
	| "attributes.create"
	| "attributes.update"
	| "attributes.delete";

const SELF_RESTRICTED: readonly Capability[] = [
	"users.suspend",
	"users.delete",
	"users.update_role",
];

const LAST_SUPER_ADMIN_GUARDED: readonly Capability[] = [
	"users.suspend",
	"users.delete",
	"users.update_role",
];

export function can(role: string | null | undefined, _cap: Capability): boolean {
	return Boolean(role);
}

function ensureActive(session: DashboardSession): void {
	if (session.user.status !== "active") {
		throw new Error("Conta não ativa");
	}
}

async function assertNotLastActiveSuperAdmin(targetUserId: string): Promise<void> {
	const [target] = await db
		.select({ role: userTable.role, status: userTable.status })
		.from(userTable)
		.where(eq(userTable.id, targetUserId))
		.limit(1);

	if (!target || target.role !== "super_admin" || target.status !== "active") {
		return;
	}

	const [row] = await db
		.select({ value: sql<number>`count(*)::int` })
		.from(userTable)
		.where(
			and(
				eq(userTable.role, "super_admin"),
				eq(userTable.status, "active"),
				ne(userTable.id, targetUserId)
			)
		);
	const others = row?.value ?? 0;
	if (others < 1) {
		throw new Error("Necessário ao menos 1 super_admin ativo");
	}
}

export async function requireCapability(
	_cap: Capability
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	ensureActive(session);
	return session;
}

export async function requireCapabilityOrRedirect(
	_cap: Capability,
	redirectTo = "/dashboard"
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	try {
		ensureActive(session);
	} catch {
		redirect(redirectTo);
	}
	return session;
}

interface CapabilityContext {
	targetBranchIds?: string[];
	targetUserId?: string;
}

export async function requireCapabilityWithContext(
	cap: Capability,
	ctx: CapabilityContext = {}
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	ensureActive(session);

	if (
		ctx.targetUserId &&
		ctx.targetUserId === session.user.id &&
		SELF_RESTRICTED.includes(cap)
	) {
		throw new Error("Não é possível executar essa ação em si mesmo");
	}

	if (ctx.targetUserId && LAST_SUPER_ADMIN_GUARDED.includes(cap)) {
		await assertNotLastActiveSuperAdmin(ctx.targetUserId);
	}

	return session;
}

export async function requireCapabilityWithContextOrRedirect(
	cap: Capability,
	ctx: CapabilityContext = {},
	redirectTo = "/dashboard"
): Promise<DashboardSession> {
	try {
		return await requireCapabilityWithContext(cap, ctx);
	} catch {
		redirect(redirectTo);
	}
}
```

- [ ] **Step 2: Rodar `bun check-types` no app web**

Run: `cd apps/web && bun check-types`
Expected: PASS. Se falhar com erro em algum callsite, parar e reportar.

- [ ] **Step 3: Rodar testes de `can()`**

Run: `cd apps/web && bun test __tests__/permissions.test.ts`
Expected: PASS — todos os testes da Task 2 verdes.

- [ ] **Step 4: Commit (green)**

```bash
git add apps/web/src/lib/permissions.ts
git commit -m "feat: requireCapability* e can() viram no-op (ADR-0012)"
```

---

## Task 4: Adicionar testes para `assertNotLastActiveSuperAdmin` via `requireCapabilityWithContext`

**Files:**
- Modify: `apps/web/__tests__/permissions.test.ts`

- [ ] **Step 1: Adicionar suite de testes ao final do arquivo**

Acrescentar ao final de `apps/web/__tests__/permissions.test.ts`:

```ts
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
	redirect: vi.fn((to: string) => {
		throw new Error(`__redirect__:${to}`);
	}),
}));

vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
}));

vi.mock("@emach/db", () => {
	const limitable = {
		limit: vi.fn(() => Promise.resolve([])),
	};
	const wherable = {
		where: vi.fn(() => limitable),
	};
	const fromable = {
		from: vi.fn(() => wherable),
	};
	return {
		db: {
			select: vi.fn(() => fromable),
		},
	};
});

import { requireCapabilityWithContext } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { db } from "@emach/db";

const sessionActive = {
	user: { id: "actor-1", status: "active", role: "user" },
} as never;
const sessionSuspended = {
	user: { id: "actor-1", status: "suspended", role: "user" },
} as never;

function mockTargetLookup(target: { role: string; status: string } | null) {
	const limit = vi.fn(() => Promise.resolve(target ? [target] : []));
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}

function mockCountQuery(count: number) {
	const where = vi.fn(() => Promise.resolve([{ value: count }]));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}

describe("requireCapabilityWithContext — guards mantidos", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(
			sessionActive
		);
	});

	it("rejeita se status != active", async () => {
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(
			sessionSuspended
		);
		await expect(
			requireCapabilityWithContext("tools.delete", {})
		).rejects.toThrow("Conta não ativa");
	});

	it("self-action guard: usuário não pode se suspender", async () => {
		await expect(
			requireCapabilityWithContext("users.suspend", { targetUserId: "actor-1" })
		).rejects.toThrow("Não é possível executar essa ação em si mesmo");
	});

	it("self-action guard NÃO bloqueia caps fora de SELF_RESTRICTED", async () => {
		await expect(
			requireCapabilityWithContext("users.reset_password", {
				targetUserId: "actor-1",
			})
		).resolves.toBe(sessionActive);
	});

	it("last super_admin guard: rejeita se alvo é o último super_admin ativo", async () => {
		mockTargetLookup({ role: "super_admin", status: "active" });
		mockCountQuery(0);
		await expect(
			requireCapabilityWithContext("users.delete", { targetUserId: "other-1" })
		).rejects.toThrow("Necessário ao menos 1 super_admin ativo");
	});

	it("last super_admin guard: permite se há outros super_admin ativos", async () => {
		mockTargetLookup({ role: "super_admin", status: "active" });
		mockCountQuery(2);
		await expect(
			requireCapabilityWithContext("users.delete", { targetUserId: "other-1" })
		).resolves.toBe(sessionActive);
	});

	it("last super_admin guard: ignora alvo não-super_admin", async () => {
		mockTargetLookup({ role: "admin", status: "active" });
		await expect(
			requireCapabilityWithContext("users.delete", { targetUserId: "other-1" })
		).resolves.toBe(sessionActive);
	});
});
```

Acrescentar `beforeEach` no `import` de cima:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
```

(Se já houver `import { describe, expect, it } from "vitest"` no topo, substituir por essa linha unificada.)

- [ ] **Step 2: Rodar testes**

Run: `cd apps/web && bun test __tests__/permissions.test.ts`
Expected: PASS — todas as suites.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/permissions.test.ts
git commit -m "test: cobertura de ensureActive + self-action + last super_admin guard"
```

---

## Task 5: `branch-scope.ts` sempre retorna `null`

**Files:**
- Modify: `apps/web/src/lib/branch-scope.ts`
- Modify: `apps/web/__tests__/branch-scope.test.ts`

- [ ] **Step 1: Atualizar testes (TDD red)**

Sobrescrever `apps/web/__tests__/branch-scope.test.ts` com:

```ts
import { describe, expect, it } from "vitest";

import { getUserBranchScope, inScope } from "@/lib/branch-scope";

describe("inScope()", () => {
	it("retorna true quando scope é null (sempre, pós ADR-0012)", () => {
		expect(inScope(null, "any-id")).toBe(true);
	});

	it("retorna true quando id está no scope", () => {
		expect(inScope(["a", "b"], "a")).toBe(true);
	});

	it("retorna false quando id fora do scope", () => {
		expect(inScope(["a", "b"], "c")).toBe(false);
	});
});

describe("getUserBranchScope()", () => {
	it("retorna null para super_admin", async () => {
		const session = {
			user: { id: "u1", role: "super_admin" },
		} as never;
		const result = await getUserBranchScope(session);
		expect(result).toBeNull();
	});

	it("retorna null para qualquer outra role (no-op pós ADR-0012)", async () => {
		const session = {
			user: { id: "u2", role: "user" },
		} as never;
		const result = await getUserBranchScope(session);
		expect(result).toBeNull();
	});
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `cd apps/web && bun test __tests__/branch-scope.test.ts`
Expected: FAIL — o teste "retorna null para qualquer outra role" falha (atualmente consulta DB e retorna array).

- [ ] **Step 3: Reescrever `branch-scope.ts`**

Sobrescrever `apps/web/src/lib/branch-scope.ts` com:

```ts
import type { DashboardSession } from "@emach/auth/dashboard";
import { cache } from "react";

// ⚠️ Gates role-based desligados em 2026-05-27 (ver docs/adr/0012-disable-role-based-gates.md).
// Versão original (consulta a `user_branch`) preservada em `permissions.disabled.ts`.

export type BranchScope = string[] | null;

export const getUserBranchScope = cache(
	async (_session: DashboardSession): Promise<BranchScope> => null
);

export function inScope(scope: BranchScope, branchId: string): boolean {
	if (scope === null) {
		return true;
	}
	return scope.includes(branchId);
}
```

- [ ] **Step 4: Rodar testes — deve passar**

Run: `cd apps/web && bun test __tests__/branch-scope.test.ts`
Expected: PASS.

- [ ] **Step 5: Rodar check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS. (Se algum consumidor importava `userBranch` via barrel, verificar — mas remoção é só dentro de `branch-scope.ts`.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/branch-scope.ts apps/web/__tests__/branch-scope.test.ts
git commit -m "feat: getUserBranchScope sempre retorna null (ADR-0012)"
```

---

## Task 6: `requireRole` em `session.ts` vira no-op

**Files:**
- Modify: `apps/web/src/lib/session.ts`

- [ ] **Step 1: Substituir o corpo de `requireRole`**

No arquivo `apps/web/src/lib/session.ts`, substituir o bloco `export const requireRole = ...` por:

```ts
// ⚠️ Gates role-based desligados em 2026-05-27 (ver docs/adr/0012-disable-role-based-gates.md).
// Validação por ROLE_WEIGHT preservada em `permissions.disabled.ts`.
export const requireRole = async (
	_role: UserRole
): Promise<DashboardSession> => {
	const session = await requireCurrentSession();
	if (session.user.status !== "active") {
		throw new Error("Conta não ativa");
	}
	return session;
};
```

`ROLE_WEIGHT` e `UserRole` permanecem exportados (são usados por `<RoleBadge>`, formulários e tipos).

- [ ] **Step 2: Rodar check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS.

- [ ] **Step 3: Rodar suite completa de testes do web**

Run: `cd apps/web && bun test`
Expected: PASS. Se `users-approval-roles.test.ts` falhar, isso é esperado se ele depende da hierarquia removida — abrir e ajustar pra refletir o novo comportamento (substituir asserts de "rejeita" por "permite" onde aplicável). Anotar no commit.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/session.ts apps/web/__tests__/users-approval-roles.test.ts
git commit -m "feat: requireRole vira no-op (ADR-0012)"
```

---

## Task 7: Auditar `users-approval-roles.test.ts` e outros testes legados

**Files:**
- Modify: `apps/web/__tests__/users-approval-roles.test.ts` (se rodando vermelho)

- [ ] **Step 1: Rodar suite completa**

Run: `cd apps/web && bun test`
Expected: identificar qualquer suíte que dependa de role-based blocking.

- [ ] **Step 2: Para cada teste vermelho, decidir**

Regra de decisão:

- Teste verifica matriz `ROLE_CAPS` (rejeição por capability) → **deletar** o teste (cobertura foi pra `permissions.disabled.ts` que não é importado).
- Teste verifica branch scoping ativo → **deletar** ou inverter (agora deve permitir).
- Teste verifica hierarquia (não gerencia role ≥) → **deletar** ou inverter.
- Teste verifica self-action guard ou last-super-admin → **manter**.

Aplicar mudanças minimalistas — não reescrever o arquivo inteiro se 2 asserts precisam virar.

- [ ] **Step 3: Rodar suite até verde**

Run: `cd apps/web && bun test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/__tests__/
git commit -m "test: ajustar testes legados pra novo comportamento dos gates"
```

---

## Task 8: Refatorar guard inline em `deleteUser` para usar o novo caminho

**Files:**
- Modify: `apps/web/src/app/dashboard/users/actions.ts`

**Contexto:** `deleteUser` (linhas ~407–440) já tem um `if (target.role === "super_admin")` que checa "último super_admin ativo". Esse caminho agora está **duplicado** com o `assertNotLastActiveSuperAdmin` em `requireCapabilityWithContext`. Remover o duplicado pra evitar drift.

- [ ] **Step 1: Localizar o bloco redundante**

Abrir `apps/web/src/app/dashboard/users/actions.ts` e localizar entre `requireCapabilityWithContext("users.delete", ...)` (linha ~407) e a `db.transaction` da deleção (~442) o bloco que faz:

```ts
const [target] = await db
	.select({ role: userTable.role })
	.from(userTable)
	.where(eq(userTable.id, parsed.data.userId))
	.limit(1);

if (!target) {
	return { ok: false, error: "User não encontrado" };
}

if (target.role === "super_admin") {
	const [row] = await db
		.select({ value: sql<number>`count(*)::int` })
		.from(userTable)
		.where(
			and(eq(userTable.role, "super_admin"), eq(userTable.status, "active"))
		);
	const active = row?.value ?? 0;
	if (active <= 1) {
		return {
			ok: false,
			error: "Necessário ao menos 1 super_admin ativo",
		};
	}
}
```

- [ ] **Step 2: Substituir por captura de erro do guard**

`requireCapabilityWithContext("users.delete", { targetUserId })` agora lança `"Necessário ao menos 1 super_admin ativo"` quando aplicável. Envolver a chamada existente em try/catch e propagar como `ActionResult`:

```ts
let session: DashboardSession;
try {
	session = await requireCapabilityWithContext("users.delete", {
		targetUserId: parsed.data.userId,
	});
} catch (e) {
	const message = e instanceof Error ? e.message : "Forbidden";
	return { ok: false, error: message };
}
```

E **remover** o bloco do Step 1 inteiro. A checagem `if (!target)` também sai (o guard tolera target inexistente sem erro; a `db.transaction` posterior pode retornar contagem zero — adicionar verificação leve ali se ainda não houver).

- [ ] **Step 3: Verificar comportamento equivalente em `updateUserRole` e `suspendUser`**

Abrir as actions `updateUserRole` (`users.update_role`) e `suspendUser` (`users.suspend`) — não devem ter bloco duplicado de last-super-admin (não tinham antes). Confirmar com `bfs apps/web/src/app/dashboard/users/actions.ts -name '*' | xargs ugrep -n 'last super\|super_admin.*count\|count.*super_admin' || true`. Se a busca não retornar nada, OK.

- [ ] **Step 4: Rodar check-types + suite**

Run: `cd apps/web && bun check-types && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/actions.ts
git commit -m "refactor: deleteUser usa guard centralizado de last super_admin"
```

---

## Task 9: Smoke run-time

**Files:** nenhum (verificação manual)

- [ ] **Step 1: Iniciar dev server**

Run: `bun dev:web` (na raiz do repo)
Aguardar `Ready in Xs` em `localhost:3001`.

- [ ] **Step 2: Logar como usuário `role='user'` `status='active'`**

Bootstrap rápido via SQL se necessário:

```sql
UPDATE "user" SET role='user', status='active' WHERE email='<email-de-teste>';
```

Visitar `localhost:3001/dashboard`. Esperado: dashboard carrega, sidebar mostra **todos** os itens (Tools, Categories, Suppliers, Branches, Stock, Promotions, Orders, Customers, Site, Reviews, Users).

- [ ] **Step 3: Testar acesso liberado**

Percorrer:

| Rota | Ação | Esperado |
|---|---|---|
| `/dashboard/tools/new` | Criar uma tool | Funciona |
| `/dashboard/tools/<id>/edit` | Editar e deletar | Funciona |
| `/dashboard/orders/<id>` | Mudar status | Funciona |
| `/dashboard/customers` | Export CSV | Funciona |
| `/dashboard/users` | Listar usuários | Mostra todos |
| `/dashboard/branches/new` | Criar filial | Funciona |

Run para inspeção pós-clique de erros: usar MCP `next-devtools` se disponível — `nextjs_call <port> get_errors`.

- [ ] **Step 4: Testar guards mantidos**

- Tentar suspender a si mesmo via UI de usuários → erro "Não é possível executar essa ação em si mesmo".
- Tentar deletar / rebaixar / suspender o último `super_admin` `active` (via SQL ou setup, criar cenário) → erro "Necessário ao menos 1 super_admin ativo".
- Tentar logar com `status='suspended'` → redirect `/suspended`.
- Tentar logar com `status='pending'` → redirect `/pending`.

- [ ] **Step 5: Sem commit aqui (smoke é verificação)**

Se algo falhar, parar e reportar.

---

## Task 10: Criar ADR-0012

**Files:**
- Create: `docs/adr/0012-disable-role-based-gates.md`

- [ ] **Step 1: Criar o ADR**

Conteúdo de `docs/adr/0012-disable-role-based-gates.md`:

```markdown
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
2. Restaurar consulta original em `apps/web/src/lib/branch-scope.ts` (versão preservada em `permissions.disabled.ts`).
3. Restaurar checagem de `ROLE_WEIGHT` em `apps/web/src/lib/session.ts:requireRole`.
4. Decidir se mantém `ensureActive` e `assertNotLastActiveSuperAdmin` como defesa adicional ou remove.
5. Auditar `user_branch` antes de religar — repovoar registros desatualizados.
6. Remover item de gap em `packages/db/CLAUDE.md`.
7. Atualizar `CLAUDE.md` raiz desfazendo a nota de no-op.

## Não decidido

- Quando exatamente religar (depende do entry em produção).
- Se a matriz reativada será idêntica à preservada ou redesenhada com base no aprendizado do período sem gates.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0012-disable-role-based-gates.md
git commit -m "docs: ADR-0012 desligar gates role-based"
```

---

## Task 11: Atualizar `CLAUDE.md` raiz

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Localizar o bloco a substituir**

No `CLAUDE.md` raiz, localizar a linha (atualmente em `CLAUDE.md:22`):

```
Roles dashboard: `user.role` enum `super_admin/admin/manager/user`; `user.status` enum `pending/active/suspended`. Better Auth cria novo user com `role='user' + status='pending'`. Promoção bootstrap via SQL direto. Capabilities granulares em `apps/web/src/lib/permissions.ts`.
```

- [ ] **Step 2: Substituir por**

```
Roles dashboard: `user.role` enum `super_admin/admin/manager/user`; `user.status` enum `pending/active/suspended`. Better Auth cria novo user com `role='user' + status='pending'`. Promoção bootstrap via SQL direto.

**⚠️ Gates role-based desligados em 2026-05-27 (ADR-0012).** `requireCapability*`, `can()`, `requireRole` e `getUserBranchScope` em `apps/web/src/lib/` são no-op — validam só sessão + `status='active'`. Matriz original preservada em `apps/web/src/lib/permissions.disabled.ts`. Mantidos como guard-rails: status gate, self-action guard, last-super-admin guard. **Não adicionar capabilities novas sem religar** (passos em `docs/adr/0012-disable-role-based-gates.md`). Reativar antes de produção.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md raiz aponta pro ADR-0012"
```

---

## Task 12: Atualizar `apps/web/CLAUDE.md`

**Files:**
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Localizar o bloco "Capabilities (`src/lib/permissions.ts`)"**

Linhas ~12–24 do arquivo.

- [ ] **Step 2: Substituir o bloco inteiro por**

```markdown
## Capabilities (`src/lib/permissions.ts`)

**⚠️ Desligado em 2026-05-27 (ADR-0012).** Funções `requireCapability`, `requireCapabilityOrRedirect`, `requireCapabilityWithContext`, `requireCapabilityWithContextOrRedirect`, `can` são **no-op** — validam só sessão + `status='active'`. Matriz original preservada em `src/lib/permissions.disabled.ts` (não-importada).

**O padrão obrigatório em server actions continua sendo `await requireCapability(cap)` ou `requireCapabilityWithContext(cap, ctx)`** — assim, quando religar, todos os endpoints já estão cobertos sem varredura. **Nunca remover essas chamadas; novos endpoints precisam delas.**

Guard-rails mantidos dentro dos no-ops:

- `ensureActive(session)` — bloqueia `pending` / `suspended` (defesa-em-profundidade).
- Self-action guard em `users.suspend` / `users.delete` / `users.update_role`.
- Last super_admin guard — `assertNotLastActiveSuperAdmin` bloqueia rebaixar/suspender/deletar o último `super_admin` `active`.

`requireRole` em `src/lib/session.ts` também é no-op (mesma validação). `ROLE_WEIGHT` permanece (usado em `<RoleBadge>` e formulários).

Bootstrap do primeiro `super_admin` via SQL: `UPDATE "user" SET role='super_admin', status='active' WHERE email='...'`.

Reativar: ver `docs/adr/0012-disable-role-based-gates.md`.
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs: apps/web/CLAUDE.md descreve gates no-op"
```

---

## Task 13: Adicionar gap em `packages/db/CLAUDE.md`

**Files:**
- Modify: `packages/db/CLAUDE.md`

- [ ] **Step 1: Localizar a seção "⚠️ Gap conhecido"**

Procurar por `## ⚠️ Gap conhecido — anonimização LGPD` (linha ~70 aproximadamente).

- [ ] **Step 2: Adicionar entrada espelhada acima ou abaixo**

Substituir o cabeçalho `## ⚠️ Gap conhecido — anonimização LGPD` por:

```markdown
## ⚠️ Gaps conhecidos

### Anonimização LGPD

Não há script nem server action de anonimização de cliente ("direito ao esquecimento"). Só export existe (`client_export_log` + `dashboard/customers/export/`). **Implementar antes de produção.**

### Gates role-based desligados (ADR-0012)

`requireCapability*`, `can()`, `requireRole` e `getUserBranchScope` em `apps/web/src/lib/` são no-op desde 2026-05-27. Matriz original preservada em `apps/web/src/lib/permissions.disabled.ts`. **Religar antes de produção** — passos em `docs/adr/0012-disable-role-based-gates.md`.
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/CLAUDE.md
git commit -m "docs: registrar gap de gates desligados em db/CLAUDE.md"
```

---

## Task 14: Verificação final integrada

**Files:** nenhum (validação)

- [ ] **Step 1: Rodar tudo do zero**

Run (na raiz):

```bash
bun check-types
bun test
```

Expected: ambos PASS sem warnings.

- [ ] **Step 2: Visualizar o histórico de commits**

Run: `git log --oneline -15`
Expected: ver os 13 commits desta feature, na ordem das tasks.

- [ ] **Step 3: Diff sanity**

Run: `git diff main --stat`
Expected: ~10 arquivos modificados, ~3 criados, sem mudanças em arquivos fora do plano.

- [ ] **Step 4: Conferir que callsites continuam compilando**

Run: `cd apps/web && ugrep -c 'requireCapability' src/app/dashboard | wc -l`
Expected: número próximo de 38 (igual ao pré-mudança).

- [ ] **Step 5: Sem commit aqui**

Se tudo verde, terminar. Caso contrário, parar e reportar.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Liberar tudo exceto status | Task 3 (no-op), Task 5 (branch-scope), Task 6 (requireRole) |
| Self-action guard mantido | Task 3 (mantido no novo `requireCapabilityWithContext`), Task 4 (teste) |
| Last super_admin guard (novo) | Task 3 (helper), Task 4 (testes), Task 8 (refactor do duplicado) |
| Status gate mantido | Implícito — `layout.tsx` não é tocado; `ensureActive` reforça |
| Sidebar mostra tudo | Implícito — `can()` no-op propaga `canManageUsers=true` |
| `<RoleBadge>` mantido | Implícito — `ROLE_WEIGHT` em `session.ts` mantido |
| Audit log mantido | Implícito — nenhum arquivo de audit é tocado |
| `lockOrderAndAuthorize` mantido | Implícito — não tocado; lock SQL permanece, gate interno vira no-op |
| `permissions.disabled.ts` preservação | Task 1 |
| ADR-0012 | Task 10 |
| Docs (CLAUDE.md raiz / web / db) | Tasks 11, 12, 13 |
| Verificação | Tasks 9 (smoke), 14 (integrado) |

**Placeholder scan:** sem TBD/TODO. Code blocks completos em todos os steps de código. Comandos exatos em todos os steps de execução.

**Type consistency:**

- `LAST_SUPER_ADMIN_GUARDED` definido em Task 3, referenciado em Task 4 (testes) com mesmas capabilities.
- `assertNotLastActiveSuperAdmin(targetUserId: string)` — assinatura única, usada via `requireCapabilityWithContext`.
- `ensureActive(session)` — assinatura única.
- `getUserBranchScope` tipo `(_session: DashboardSession) => Promise<BranchScope>` consistente entre Task 5 e branch-scope.test.ts.

Nenhum gap identificado.
