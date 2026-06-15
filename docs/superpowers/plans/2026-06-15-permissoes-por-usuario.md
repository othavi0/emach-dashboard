# Permissões por usuário (registry + overrides) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar overrides de capability por usuário (grant/revoke) sobre o sistema role-based existente (ADR-0016), com um registry declarativo extensível e uma UI de gestão, sem mudar branch-scoping.

**Architecture:** O catálogo de capabilities vira um **registry em código** (`capabilities.ts`); os **overrides por usuário** vivem numa tabela enxuta (`user_capability_override`); a resolução do conjunto efetivo (`role defaults ± overrides`) é **cacheada por-request** com `React.cache()` (mesmo padrão do `getUserBranchScope`). `requireCapability*` e `can()` passam a enforçar o conjunto efetivo. Branch-scoping e os guards (status, self, last-super-admin, hierarquia, last-branch) ficam **idênticos**.

**Tech Stack:** Next 16 / React 19 (Server Components, server actions), Drizzle 0.45 + Postgres (push-only, ADR-0006), Better Auth 1.6.11 (dashboard), Vitest (node env), Tailwind + base-ui / shadcn.

**Decisões travadas (do brainstorming + perguntas ao usuário 2026-06-15):**
- Gating de UI migra para o conjunto **efetivo** (`await can(session, cap)`) em todos os ~22 callsites — admin com cap revogada **não vê** o botão. (pitfall #1 do spec.)
- UI = **aba "Permissões"** no detalhe `users/[id]` (EntityTabs), lazy por `?tab=permissoes`.
- Cross-request cache (`cacheTag`) = **YAGNI** no v1; só request-cache (`React.cache`).
- `permissions.disabled.ts` é snapshot histórico auto-contido (define seu próprio `Capability`) — **não tocar**.

**Spec de referência:** `docs/superpowers/specs/2026-06-15-permissoes-por-usuario-design.md` (ler a seção "Pitfalls" antes de começar).

---

## File Structure

| Arquivo | Responsabilidade | Ação |
| --- | --- | --- |
| `apps/web/src/lib/capabilities.ts` | Registry declarativo de capabilities (metadata + `defaultRoles`); deriva `Capability` type; helpers puros (`isCapability`, `roleDefaultCapabilities`). **Sem import de db/server-only** (importável em client p/ labels). | Criar |
| `apps/web/src/lib/permissions.ts` | `can` (efetivo, async), `roleHasCapability` (puro, sync), `getUserCapabilities` (cacheado), `requireCapability*`, guards. | Modificar |
| `packages/db/src/schema/user-capability-override.ts` | Tabela `user_capability_override`. | Criar |
| `packages/db/src/schema/index.ts` | Barrel — exportar a tabela nova. | Modificar |
| `apps/web/src/app/dashboard/users/[id]/permissions/actions.ts` | Server action `setUserCapability` (toggle + teto + auditoria). | Criar |
| `apps/web/src/app/dashboard/users/[id]/_components/permissions-tab.tsx` | Grid client de gestão (tri-state por capability). | Criar |
| `apps/web/src/app/dashboard/users/[id]/permissions/data.ts` | Fetch server-side do estado da aba (efetivo do alvo, overrides, teto do ator). | Criar |
| `apps/web/src/app/dashboard/users/[id]/page.tsx` | Injetar aba "Permissões" (gated). | Modificar |
| `apps/web/__tests__/permissions.test.ts` | Matriz via `roleHasCapability`; testes de resolução efetiva. | Modificar |
| `apps/web/__tests__/capabilities.test.ts` | Regressão: defaults derivados == matriz legada. | Criar |
| `apps/web/__tests__/set-user-capability.test.ts` | Teto/anti-escalada/hierarquia da action. | Criar |
| `docs/adr/0017-permissoes-por-usuario.md` | ADR referenciando 0016. | Criar |
| `apps/web/CLAUDE.md` / `packages/db/CLAUDE.md` | Notas curtas do novo sistema. | Modificar |

Os ~22 callsites de UI que migram para `await can(session, cap)` estão enumerados na **Task 3**.

---

## Task 1: Capability Registry + role defaults derivados (sem mudança de comportamento)

**Files:**
- Create: `apps/web/src/lib/capabilities.ts`
- Modify: `apps/web/src/lib/permissions.ts:13-155`
- Create: `apps/web/__tests__/capabilities.test.ts`
- Modify: `apps/web/__tests__/permissions.test.ts:30-79`

Objetivo: extrair o catálogo para um registry e derivar `ROLE_CAPS` dele, **provando por teste** que os defaults derivados são idênticos aos hardcoded de hoje. `can(role, cap)` continua **síncrono** nesta task (zero mudança de comportamento/assinatura).

- [ ] **Step 1: Escrever o teste de regressão (defaults derivados == matriz legada)**

Cria `apps/web/__tests__/capabilities.test.ts`. As listas esperadas são cópia exata das listas hardcoded atuais de `permissions.ts` (ALL/USER/SUPER_ADMIN_EXCLUSIVE).

```ts
import { describe, expect, it } from "vitest";
import {
	CAPABILITIES,
	isCapability,
	roleDefaultCapabilities,
} from "@/lib/capabilities";

// Cópia literal das listas legadas (snapshot da matriz ADR-0016 antes do refactor).
const LEGACY_USER: readonly string[] = [
	"tools.read", "categories.read", "suppliers.read", "branches.read",
	"stock.read", "promotions.read", "orders.read", "customers.read",
	"site.read", "reviews.read", "attributes.read",
	"stock.adjust", "orders.update_status", "orders.add_note",
];
const LEGACY_SUPER_EXCLUSIVE: readonly string[] = [
	"branches.manage", "users.delete", "site.update_banners",
	"site.update_settings", "site.publish_announcements", "tools.delete",
	"categories.delete", "promotions.delete", "attributes.delete",
];

describe("registry de capabilities", () => {
	it("toda key tem metadata completa", () => {
		for (const [key, meta] of Object.entries(CAPABILITIES)) {
			expect(meta.group, key).toBeTruthy();
			expect(meta.resource, key).toBeTruthy();
			expect(meta.action, key).toBeTruthy();
			expect(meta.description, key).toBeTruthy();
			expect(meta.defaultRoles.length, key).toBeGreaterThan(0);
		}
	});

	it("super_admin recebe TODAS as capabilities por default", () => {
		const superCaps = roleDefaultCapabilities("super_admin");
		expect(superCaps.size).toBe(Object.keys(CAPABILITIES).length);
	});

	it("user default == LEGACY_USER (mais nada)", () => {
		const userCaps = roleDefaultCapabilities("user");
		expect([...userCaps].sort()).toEqual([...LEGACY_USER].sort());
	});

	it("admin default == tudo menos os exclusivos de super_admin", () => {
		const adminCaps = roleDefaultCapabilities("admin");
		for (const c of LEGACY_SUPER_EXCLUSIVE) {
			expect(adminCaps.has(c as never), `admin não deve ter ${c}`).toBe(false);
		}
		// admin tem todo o resto
		for (const key of Object.keys(CAPABILITIES)) {
			if (!LEGACY_SUPER_EXCLUSIVE.includes(key)) {
				expect(adminCaps.has(key as never), `admin deve ter ${key}`).toBe(true);
			}
		}
	});

	it("manager é alias de admin", () => {
		expect([...roleDefaultCapabilities("manager")].sort()).toEqual(
			[...roleDefaultCapabilities("admin")].sort()
		);
	});

	it("isCapability discrimina keys válidas", () => {
		expect(isCapability("tools.read")).toBe(true);
		expect(isCapability("inexistente.foo")).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar o teste — deve falhar (módulo não existe)**

Run: `bun --cwd apps/web test capabilities`
Expected: FAIL — `Cannot find module '@/lib/capabilities'`.

- [ ] **Step 3: Criar o registry `apps/web/src/lib/capabilities.ts`**

`defaultRoles` por cap segue a matriz atual: reads + 3 ops = `[super_admin, admin, user]`; exclusivos = `[super_admin]`; resto = `[super_admin, admin]`. Inclui já `permissions.manage` (usada na Task 4) como `[super_admin, admin]`.

```ts
import type { UserRole } from "@/lib/session";

export interface CapabilityMeta {
	/** Agrupamento de nível 1 na UI (ex: "Catálogo"). */
	group: string;
	/** Recurso dentro do grupo (ex: "Ferramentas"). */
	resource: string;
	/** Verbo da ação (ex: "Deletar"). */
	action: string;
	/** Descrição curta para tooltip/linha. */
	description: string;
	/** Roles que recebem a capability por padrão (sem overrides). */
	defaultRoles: readonly UserRole[];
}

const S: readonly UserRole[] = ["super_admin"];
const SA: readonly UserRole[] = ["super_admin", "admin"];
const SAU: readonly UserRole[] = ["super_admin", "admin", "user"];

// Registry declarativo. Feature/seção nova = 1 entrada aqui → aparece na UI
// automaticamente e nasce deny-by-default (só quem `defaultRoles`/override conceder).
export const CAPABILITIES = {
	// ── Catálogo ──────────────────────────────────────────────
	"tools.read": { group: "Catálogo", resource: "Ferramentas", action: "Ver", description: "Visualizar ferramentas", defaultRoles: SAU },
	"tools.create": { group: "Catálogo", resource: "Ferramentas", action: "Criar", description: "Criar ferramenta", defaultRoles: SA },
	"tools.update": { group: "Catálogo", resource: "Ferramentas", action: "Editar", description: "Editar ferramenta", defaultRoles: SA },
	"tools.delete": { group: "Catálogo", resource: "Ferramentas", action: "Deletar", description: "Excluir ferramenta", defaultRoles: S },
	"categories.read": { group: "Catálogo", resource: "Categorias", action: "Ver", description: "Visualizar categorias", defaultRoles: SAU },
	"categories.manage": { group: "Catálogo", resource: "Categorias", action: "Gerenciar", description: "Criar/editar categorias e atributos", defaultRoles: SA },
	"categories.delete": { group: "Catálogo", resource: "Categorias", action: "Deletar", description: "Excluir categoria", defaultRoles: S },
	"attributes.read": { group: "Catálogo", resource: "Atributos", action: "Ver", description: "Visualizar atributos", defaultRoles: SAU },
	"attributes.create": { group: "Catálogo", resource: "Atributos", action: "Criar", description: "Criar atributo", defaultRoles: SA },
	"attributes.update": { group: "Catálogo", resource: "Atributos", action: "Editar", description: "Editar atributo", defaultRoles: SA },
	"attributes.delete": { group: "Catálogo", resource: "Atributos", action: "Deletar", description: "Excluir atributo", defaultRoles: S },
	"suppliers.read": { group: "Catálogo", resource: "Fornecedores", action: "Ver", description: "Visualizar fornecedores", defaultRoles: SAU },
	"suppliers.manage": { group: "Catálogo", resource: "Fornecedores", action: "Gerenciar", description: "Criar/editar fornecedores", defaultRoles: SA },
	"promotions.read": { group: "Catálogo", resource: "Promoções", action: "Ver", description: "Visualizar promoções", defaultRoles: SAU },
	"promotions.manage": { group: "Catálogo", resource: "Promoções", action: "Gerenciar", description: "Criar/editar promoções", defaultRoles: SA },
	"promotions.delete": { group: "Catálogo", resource: "Promoções", action: "Deletar", description: "Excluir promoção", defaultRoles: S },
	// ── Inventário (branch-scoped) ────────────────────────────
	"stock.read": { group: "Inventário", resource: "Estoque", action: "Ver", description: "Visualizar estoque", defaultRoles: SAU },
	"stock.adjust": { group: "Inventário", resource: "Estoque", action: "Ajustar", description: "Movimentar/ajustar estoque", defaultRoles: SAU },
	// ── Filiais ───────────────────────────────────────────────
	"branches.read": { group: "Filiais", resource: "Filiais", action: "Ver", description: "Visualizar filiais", defaultRoles: SAU },
	"branches.manage": { group: "Filiais", resource: "Filiais", action: "Gerenciar", description: "Criar/editar filiais e vínculos", defaultRoles: S },
	// ── Vendas (branch-scoped) ────────────────────────────────
	"orders.read": { group: "Vendas", resource: "Pedidos", action: "Ver", description: "Visualizar pedidos", defaultRoles: SAU },
	"orders.update_status": { group: "Vendas", resource: "Pedidos", action: "Atualizar status", description: "Avançar status do pedido", defaultRoles: SAU },
	"orders.add_note": { group: "Vendas", resource: "Pedidos", action: "Anotar", description: "Adicionar nota ao pedido", defaultRoles: SAU },
	"orders.cancel": { group: "Vendas", resource: "Pedidos", action: "Cancelar", description: "Cancelar pedido", defaultRoles: SA },
	"orders.refund": { group: "Vendas", resource: "Pedidos", action: "Estornar", description: "Estornar pedido", defaultRoles: SA },
	"orders.export": { group: "Vendas", resource: "Pedidos", action: "Exportar", description: "Exportar pedidos", defaultRoles: SA },
	// ── Clientes ──────────────────────────────────────────────
	"customers.read": { group: "Clientes", resource: "Clientes", action: "Ver", description: "Visualizar clientes", defaultRoles: SAU },
	"customers.update_status": { group: "Clientes", resource: "Clientes", action: "Editar status", description: "Alterar status do cliente", defaultRoles: SA },
	"customers.export": { group: "Clientes", resource: "Clientes", action: "Exportar", description: "Exportar clientes", defaultRoles: SA },
	"customers.manage_sessions": { group: "Clientes", resource: "Clientes", action: "Sessões", description: "Gerenciar sessões do cliente", defaultRoles: SA },
	"customers.reset_password": { group: "Clientes", resource: "Clientes", action: "Resetar senha", description: "Resetar senha do cliente", defaultRoles: SA },
	"reviews.read": { group: "Clientes", resource: "Avaliações", action: "Ver", description: "Visualizar avaliações", defaultRoles: SAU },
	"reviews.moderate": { group: "Clientes", resource: "Avaliações", action: "Moderar", description: "Aprovar/remover avaliações", defaultRoles: SA },
	// ── Site ──────────────────────────────────────────────────
	"site.read": { group: "Site", resource: "Site", action: "Ver", description: "Visualizar configurações do site", defaultRoles: SAU },
	"site.update_banners": { group: "Site", resource: "Site", action: "Banners", description: "Editar banners da home", defaultRoles: S },
	"site.update_settings": { group: "Site", resource: "Site", action: "Configurações", description: "Editar configurações do site", defaultRoles: S },
	"site.publish_announcements": { group: "Site", resource: "Site", action: "Anúncios", description: "Publicar anúncios", defaultRoles: S },
	// ── Usuários ──────────────────────────────────────────────
	"users.manage": { group: "Usuários", resource: "Usuários", action: "Gerenciar", description: "Acessar gestão de usuários", defaultRoles: SA },
	"users.approve": { group: "Usuários", resource: "Usuários", action: "Aprovar", description: "Aprovar convite/usuário pendente", defaultRoles: SA },
	"users.update_role": { group: "Usuários", resource: "Usuários", action: "Alterar role", description: "Mudar o nível do usuário", defaultRoles: SA },
	"users.update_branches": { group: "Usuários", resource: "Usuários", action: "Vincular filial", description: "Editar filiais do usuário", defaultRoles: SA },
	"users.suspend": { group: "Usuários", resource: "Usuários", action: "Suspender", description: "Suspender/reativar usuário", defaultRoles: SA },
	"users.reset_password": { group: "Usuários", resource: "Usuários", action: "Resetar senha", description: "Resetar senha do usuário", defaultRoles: SA },
	"users.revoke_sessions": { group: "Usuários", resource: "Usuários", action: "Revogar sessões", description: "Encerrar sessões do usuário", defaultRoles: SA },
	"users.delete": { group: "Usuários", resource: "Usuários", action: "Deletar", description: "Excluir usuário", defaultRoles: S },
	"permissions.manage": { group: "Usuários", resource: "Permissões", action: "Gerenciar", description: "Conceder/revogar capabilities de outros usuários", defaultRoles: SA },
	"audit.read": { group: "Usuários", resource: "Auditoria", action: "Ver", description: "Ler log de auditoria", defaultRoles: SA },
} as const satisfies Record<string, CapabilityMeta>;

export type Capability = keyof typeof CAPABILITIES;

export function isCapability(value: string): value is Capability {
	return value in CAPABILITIES;
}

// manager é alias de admin (ADR-0016). Mantido aqui pra centralizar a normalização.
function normalizeRole(role: UserRole): UserRole {
	return role === "manager" ? "admin" : role;
}

export function roleDefaultCapabilities(role: UserRole): Set<Capability> {
	const normalized = normalizeRole(role);
	const result = new Set<Capability>();
	for (const [key, meta] of Object.entries(CAPABILITIES) as [
		Capability,
		CapabilityMeta,
	][]) {
		if (meta.defaultRoles.includes(normalized)) {
			result.add(key);
		}
	}
	return result;
}

// Conveniência para listar todas as keys uma vez (UI).
export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];
```

- [ ] **Step 4: Rodar o teste — deve passar**

Run: `bun --cwd apps/web test capabilities`
Expected: PASS (todos os casos, inclusive os de paridade com a matriz legada).

- [ ] **Step 5: Refatorar `permissions.ts` para derivar do registry (sync `can` intacto)**

Em `apps/web/src/lib/permissions.ts`: remover o union `Capability` (linhas 13-59), as listas `ALL_CAPS`/`USER_CAPS`/`SUPER_ADMIN_EXCLUSIVE`/`ADMIN_CAPS` (61-141) e o objeto `ROLE_CAPS` (143-148). Importar `Capability` + helpers do registry e derivar `ROLE_CAPS`. **Manter `can(role, cap)` síncrono** e o restante do arquivo inalterado.

Substituir as linhas 13-155 por:

```ts
import {
	type Capability,
	roleDefaultCapabilities,
} from "@/lib/capabilities";

export type { Capability };

// Matriz de defaults derivada do registry (sem hardcode paralelo).
const ROLE_CAPS: Record<UserRole, ReadonlySet<Capability>> = {
	super_admin: roleDefaultCapabilities("super_admin"),
	admin: roleDefaultCapabilities("admin"),
	manager: roleDefaultCapabilities("manager"),
	user: roleDefaultCapabilities("user"),
};

// Checagem PURA de role-default (sync). Não considera overrides — usar `can`
// (async) para o conjunto efetivo. Mantida para display de "padrão do role" e testes.
export function roleHasCapability(
	role: string | null | undefined,
	cap: Capability
): boolean {
	if (!(role && role in ROLE_CAPS)) {
		return false;
	}
	return ROLE_CAPS[role as UserRole].has(cap);
}

// Alias mantido nesta task para não quebrar callsites de UI; vira async na Task 3.
export function can(role: string | null | undefined, cap: Capability): boolean {
	return roleHasCapability(role, cap);
}
```

Manter as importações já existentes do topo (`DashboardSession`, `db`, `userTable`, drizzle, `redirect`, `ROLE_WEIGHT`/`requireCurrentSession`/`UserRole`, `getUserBranchScope`/`inScope`). Os usos internos de `can(session.user.role, ...)` (linhas 213, 224, 241) continuam válidos.

- [ ] **Step 6: Atualizar a matriz em `permissions.test.ts` para `roleHasCapability`**

A matriz testa **role-default puro** → trocar `can(role, cap)` por `roleHasCapability(role, cap)` no bloco `describe("matriz de capability (3 níveis)")` (linhas 30-79). O import (linha 22-25) passa a incluir `roleHasCapability`. Os demais `describe` (guards) não mudam nesta task.

Exemplo da troca (aplicar em todas as asserções do bloco da matriz):

```ts
import {
	can,
	requireCapabilityWithContext,
	requireUserDetailAccessOrRedirect,
	roleHasCapability,
} from "@/lib/permissions";
// ...
expect(roleHasCapability("super_admin", cap)).toBe(true);
expect(roleHasCapability("admin", "tools.create")).toBe(true);
expect(roleHasCapability("admin", "tools.delete")).toBe(false);
// ... etc (todas as linhas 33-78 do bloco da matriz)
expect(roleHasCapability(null, "orders.read")).toBe(false);
expect(roleHasCapability("intruso", "orders.read" as never)).toBe(false);
```

- [ ] **Step 7: Rodar a suíte inteira de permissions + types**

Run: `bun --cwd apps/web test permissions capabilities`
Expected: PASS (matriz + guards + registry).
Run: `bun --cwd apps/web run check-types` (ou `bun check-types` na raiz)
Expected: 0 erros.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/capabilities.ts apps/web/src/lib/permissions.ts apps/web/__tests__/capabilities.test.ts apps/web/__tests__/permissions.test.ts
git commit -m "refactor(auth): extrair capabilities para registry declarativo (defaults derivados)"
```

---

## Task 2: Tabela de overrides + resolução efetiva cacheada (enforcement server-side)

**Files:**
- Create: `packages/db/src/schema/user-capability-override.ts`
- Modify: `packages/db/src/schema/index.ts:19`
- Modify: `apps/web/src/lib/permissions.ts` (adicionar `getUserCapabilities` + religar guards)
- Modify: `apps/web/__tests__/permissions.test.ts` (testes de resolução efetiva)

Objetivo: criar a tabela, resolver o conjunto efetivo (`role defaults ± overrides`) uma vez por request, e fazer `requireCapability*` enforçar esse conjunto. **`can(role,cap)` sync continua existindo** (UI inalterada até a Task 3) — tudo compila e funciona; tabela vazia = comportamento idêntico ao role puro.

- [ ] **Step 1: Criar o schema `user-capability-override.ts`**

```ts
import { relations } from "drizzle-orm";
import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const userCapabilityOverride = pgTable(
	"user_capability_override",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// String livre (não enum DB): o registry em código é a fonte de verdade e
		// valida. Evita churn de enum no push-only quando caps mudam.
		capability: text("capability").notNull(),
		effect: text("effect", { enum: ["grant", "revoke"] }).notNull(),
		// Ator que aplicou. set null se o ator for deletado (padrão audit ADR-0011).
		grantedBy: text("granted_by").references(() => user.id, {
			onDelete: "set null",
		}),
		grantedAt: timestamp("granted_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.capability] }),
		index("user_capability_override_user_idx").on(table.userId),
	]
);

export const userCapabilityOverrideRelations = relations(
	userCapabilityOverride,
	({ one }) => ({
		user: one(user, {
			fields: [userCapabilityOverride.userId],
			references: [user.id],
		}),
	})
);

export type UserCapabilityOverride = typeof userCapabilityOverride.$inferSelect;
export type NewUserCapabilityOverride =
	typeof userCapabilityOverride.$inferInsert;
```

- [ ] **Step 2: Exportar no barrel**

Em `packages/db/src/schema/index.ts`, adicionar a linha (manter ordem alfabética — entre `tools` e `user-activity`... na verdade após `user-activity` por nome; inserir mantendo o estilo do arquivo):

```ts
export * from "./user-activity";
export * from "./user-capability-override";
```

- [ ] **Step 3: Aplicar no banco (push-only, ADR-0006)**

Run (interativo, precisa TTY — `drizzle-kit push`): `bun db:sync`
Expected: cria `user_capability_override` + índice. Confirmar:
Run: `psql "$DATABASE_URL" -c "\d user_capability_override"` (ou via MCP supabase `list_tables`)
Expected: colunas `user_id, capability, effect, granted_by, granted_at`, PK `(user_id, capability)`.

> Se rodar de subagent/sem TTY: criar a tabela via SQL direto (mesmo DDL) e depois `bun db:push` vê schema≡banco (no-op). Ver `packages/db/CLAUDE.md` "Drop & recreate".

- [ ] **Step 4: Escrever testes da resolução efetiva (falham primeiro)**

Adicionar em `apps/web/__tests__/permissions.test.ts` um novo bloco. Mock do `db.select` para a query de overrides usa o mesmo estilo dos helpers já existentes no arquivo (`mockTargetLookup`). Adicionar um helper de mock de overrides:

```ts
import { getUserCapabilities } from "@/lib/permissions";

function mockOverrides(rows: { capability: string; effect: string }[]) {
	const where = vi.fn(() => Promise.resolve(rows));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}

describe("getUserCapabilities — conjunto efetivo (role defaults ± overrides)", () => {
	beforeEach(() => vi.clearAllMocks());

	it("sem overrides = role default puro", async () => {
		mockOverrides([]);
		const caps = await getUserCapabilities(sessionAdmin);
		expect(caps.has("tools.create")).toBe(true); // admin default
		expect(caps.has("tools.delete")).toBe(false); // exclusivo super
	});

	it("grant adiciona capability acima do role", async () => {
		mockOverrides([{ capability: "tools.delete", effect: "grant" }]);
		const caps = await getUserCapabilities(sessionAdmin);
		expect(caps.has("tools.delete")).toBe(true);
	});

	it("revoke remove capability do role", async () => {
		mockOverrides([{ capability: "tools.create", effect: "revoke" }]);
		const caps = await getUserCapabilities(sessionAdmin);
		expect(caps.has("tools.create")).toBe(false);
	});

	it("ignora override de cap fora do registry (fail-closed)", async () => {
		mockOverrides([{ capability: "legado.removido", effect: "grant" }]);
		const caps = await getUserCapabilities(sessionAdmin);
		expect(caps.has("legado.removido" as never)).toBe(false);
	});
});
```

> Nota sobre `React.cache`: ele memoiza por **identidade do argumento** dentro de um request. Em teste cada `sessionAdmin` é o mesmo objeto literal, então a 2ª chamada no mesmo teste poderia devolver o mock anterior. Por isso cada `it` usa um `mockOverrides` próprio e chama `getUserCapabilities` **uma vez**. Se precisar de duas resoluções num teste, usar objetos de sessão distintos.

- [ ] **Step 5: Rodar — deve falhar (`getUserCapabilities` não existe)**

Run: `bun --cwd apps/web test permissions`
Expected: FAIL — `getUserCapabilities is not a function` / import inválido.

- [ ] **Step 6: Implementar `getUserCapabilities` + religar guards em `permissions.ts`**

Adicionar imports no topo:
```ts
import { userCapabilityOverride } from "@emach/db/schema/user-capability-override";
import { cache } from "react";
import {
	type Capability,
	isCapability,
	roleDefaultCapabilities,
} from "@/lib/capabilities";
```
(consolidar com o import de `@/lib/capabilities` já adicionado na Task 1 — uma linha só com `Capability, isCapability, roleDefaultCapabilities`.)

Adicionar a resolução cacheada (mesmo padrão de `getUserBranchScope`):
```ts
// Conjunto efetivo de capabilities, resolvido UMA vez por request (React.cache
// keya por identidade da session). base do role ± overrides do usuário.
export const getUserCapabilities = cache(
	async (session: DashboardSession): Promise<Set<Capability>> => {
		const role = (session.user.role ?? "user") as UserRole;
		const caps = roleDefaultCapabilities(role);
		const overrides = await db
			.select({
				capability: userCapabilityOverride.capability,
				effect: userCapabilityOverride.effect,
			})
			.from(userCapabilityOverride)
			.where(eq(userCapabilityOverride.userId, session.user.id));
		for (const o of overrides) {
			if (!isCapability(o.capability)) {
				continue; // cap removida do registry → ignora (fail-closed)
			}
			if (o.effect === "grant") {
				caps.add(o.capability);
			} else {
				caps.delete(o.capability);
			}
		}
		return caps;
	}
);
```

Religar os gates server-side para o conjunto efetivo. Em `requireCapability` (linha ~213), `requireCapabilityOrRedirect` (~224), `requireUserDetailAccessOrRedirect` (~241) e `requireCapabilityWithContext` (~302), trocar `can(session.user.role, cap)` por `(await getUserCapabilities(session)).has(cap)`:

```ts
// requireCapability
if (!(await getUserCapabilities(session)).has(cap)) {
	throw new Error(`Forbidden: capability "${cap}" requerida`);
}
// requireCapabilityOrRedirect
if (!(await getUserCapabilities(session)).has(cap)) {
	redirect(redirectTo);
}
// requireUserDetailAccessOrRedirect (a checagem de "users.manage")
if (!(await getUserCapabilities(session)).has("users.manage")) {
	redirect(redirectTo);
}
// requireCapabilityWithContext
if (!(await getUserCapabilities(session)).has(cap)) {
	throw new Error(`Forbidden: capability "${cap}" requerida`);
}
```

**Não** mudar os guards (`ensureActive`, `assertNotLastActiveSuperAdmin`, `assertManageableTarget`, `assertBranchScope`) nem o branch-scope. O `can(role, cap)` sync continua exportado (UI usa até a Task 3).

- [ ] **Step 7: Rodar testes + types**

Run: `bun --cwd apps/web test permissions`
Expected: PASS (matriz + guards + resolução efetiva). Os testes de guard existentes que mockam `db.select` para target/count continuam válidos porque, quando há `targetUserId`, a 1ª chamada de `db.select` agora é a de overrides — **atenção:** religar os guards faz `requireCapabilityWithContext` chamar `getUserCapabilities` (1 `db.select` de overrides) **antes** dos guards. Ajustar os testes de guard para mockar `mockOverrides([])` como **primeira** resposta antes de `mockTargetLookup`/`mockCountQuery`.

> Atualizar cada teste do bloco `requireCapabilityWithContext — guards mantidos` que usa `db.select`: inserir `mockOverrides([])` como o primeiro mock encadeado (a query de capabilities roda antes dos lookups de guard). Ex:
> ```ts
> it("last super_admin guard: rejeita se alvo é o último super_admin ativo", async () => {
> 	mockOverrides([]);            // resolução de capabilities (super_admin tem users.delete)
> 	mockTargetLookup({ role: "super_admin", status: "active" });
> 	mockCountQuery(0);
> 	// ...
> });
> ```
> Aplicar o mesmo `mockOverrides([])` inicial nos testes de hierarquia e "ignora alvo não-super_admin". Os testes que rejeitam por status/capability antes de qualquer `db.select` (rejeita se status != active; gate de capability) **não** precisam — mas o gate de capability agora resolve via overrides: adicionar `mockOverrides([])` nesse teste também (`sessionActive` role user, sem override → não tem orders.refund).

Run: `bun check-types`
Expected: 0 erros.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/user-capability-override.ts packages/db/src/schema/index.ts apps/web/src/lib/permissions.ts apps/web/__tests__/permissions.test.ts
git commit -m "feat(auth): tabela de overrides + resolução efetiva de capabilities cacheada"
```

---

## Task 3: Migrar gating de UI para o conjunto efetivo (`can` vira async)

**Files (modify):** os 11 arquivos abaixo (22 callsites). `permissions.ts` (flip de `can` sync→async).

Objetivo: `can` passa a ser **async + session-based** (efetivo). Os ~22 callsites de UI migram de `can(role, cap)` → `await can(session, cap)`. Como todos estão em Server Components (verificado), `await` é seguro.

- [ ] **Step 1: Flip de `can` para async em `permissions.ts`**

Remover a função `can` síncrona (alias) adicionada na Task 1 e substituir por:

```ts
// Conjunto EFETIVO (role default ± overrides). Use em Server Components para
// gating de UI. Para o default puro do role (sync), use roleHasCapability.
export async function can(
	session: DashboardSession,
	cap: Capability
): Promise<boolean> {
	return (await getUserCapabilities(session)).has(cap);
}
```

`roleHasCapability` (sync) permanece exportado para display/testes. Nenhum uso interno de `can` resta em `permissions.ts` (os guards já usam `getUserCapabilities` direto desde a Task 2).

- [ ] **Step 2: Migrar os callsites de UI (mecânico, mesma forma)**

Para **cada** arquivo abaixo: `Read` o arquivo, localizar o callsite, confirmar que a `session` está em escopo (em todos está: vem de `requireCapabilityOrRedirect`/`requireCapabilityWithContextOrRedirect`/`requireCurrentSession` no topo do componente), e trocar `can(<role-expr>, "<cap>")` por `await can(session, "<cap>")`. Onde o componente usa uma variável `role = session.user.role`, manter `role` para outros usos mas trocar a chamada de `can`. Onde o `await` cai em JSX inline, extrair para `const` antes do `return`.

Lista autoritativa (regenerar com `grep -rn '\bcan(' apps/web/src --include=*.ts --include=*.tsx | grep -v permissions` se as linhas tiverem drifted):

| Arquivo | Callsite atual | Vira |
| --- | --- | --- |
| `branches/[id]/_components/stock-tab.tsx:57` | `can(session.user.role, "stock.adjust")` | `await can(session, "stock.adjust")` |
| `branches/page.tsx:21` | `can(session.user.role, "branches.manage")` | `await can(session, "branches.manage")` |
| `categories/[id]/edit/page.tsx:146` | `can(role, "attributes.create")` | `await can(session, "attributes.create")` |
| `categories/[id]/edit/page.tsx:148` | `can(role, "attributes.update")` | `await can(session, "attributes.update")` |
| `categories/[id]/page.tsx:44` | `can(role, "categories.manage")` | `await can(session, "categories.manage")` |
| `categories/page.tsx:24` | `can(role, "categories.manage")` | `await can(session, "categories.manage")` |
| `customers/[id]/page.tsx:80` | `can(role, "customers.update_status")` | `await can(session, "customers.update_status")` |
| `customers/[id]/page.tsx:81` | `can(role, "customers.reset_password")` | `await can(session, "customers.reset_password")` |
| `customers/[id]/page.tsx:82` | `can(role, "reviews.moderate")` | `await can(session, "reviews.moderate")` |
| `customers/[id]/page.tsx:83` | `can(role, "customers.manage_sessions")` | `await can(session, "customers.manage_sessions")` |
| `customers/page.tsx:40` | `can(role, "customers.export")` | `await can(session, "customers.export")` |
| `orders/[id]/page.tsx:108` | `can(role, "orders.add_note")` | `await can(session, "orders.add_note")` |
| `orders/[id]/page.tsx:110` | `can(role, "orders.refund")` | `await can(session, "orders.refund")` |
| `orders/[id]/page.tsx:111` | `can(role, "orders.update_status")` | `await can(session, "orders.update_status")` |
| `promotions/page.tsx:101` | `can(session.user.role, "promotions.manage")` | `await can(session, "promotions.manage")` |
| `reviews/[id]/page.tsx:49` | `can(role, "reviews.moderate")` (JSX inline) | extrair `const canModerate = await can(session, "reviews.moderate")` antes do return; usar `{canModerate && ...}` |
| `suppliers/[id]/page.tsx:32` | `can(session.user.role, "suppliers.manage")` | `await can(session, "suppliers.manage")` |
| `suppliers/page.tsx:23` | `can(session.user.role, "suppliers.manage")` | `await can(session, "suppliers.manage")` |
| `tools/[id]/page.tsx:32` | `can(role, "tools.update")` | `await can(session, "tools.update")` |
| `tools/page.tsx:61` | `can(session.user.role as UserRole \| null, "tools.create")` | `await can(session, "tools.create")` (remover o cast) |
| `layout.tsx:31` | `can(role, "users.approve")` | `await can(session, "users.approve")` |
| `layout.tsx:32` | `can(role, "site.update_settings")` | `await can(session, "site.update_settings")` |

> Para cada arquivo, confirmar o nome da variável de sessão (`session` na maioria; alguns podem usar outro nome — usar o que estiver em escopo). Se um `orders/[id]/page.tsx` passa três `can` para um componente filho, resolver os três em `const` antes do JSX e passar os booleans. Como o componente já é `async` (Server Component), `await` no corpo é válido.

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: 0 erros. Se algum arquivo acusar "can expects 2 args of types (DashboardSession, Capability)" num lugar não migrado → migrar.

- [ ] **Step 4: Verificar lint (ultracite)**

Run: `bun check`
Expected: limpo. Atenção a `noFloatingPromises`/`require-await` — os componentes já eram `async`. Se algum virar "await em expressão" reclamado, extrair para `const`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app apps/web/src/lib/permissions.ts
git commit -m "refactor(auth): gating de UI usa capabilities efetivas (can async)"
```

---

## Task 4: Action de toggle + teto + auditoria

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/permissions/actions.ts`
- Create: `apps/web/__tests__/set-user-capability.test.ts`

Objetivo: server action `setUserCapability` que aplica grant/revoke/inherit com **teto** (ator só togla caps que ele mesmo tem; hierarquia; branch-scope do alvo) e **auditoria**.

- [ ] **Step 1: Escrever os testes da action (teto/anti-escalada) — falham primeiro**

`apps/web/__tests__/set-user-capability.test.ts`. Mockar `requireCapabilityWithContext` (já testado isoladamente), `getUserCapabilities` (caps do ator), `db` (lookup de branches do alvo, upsert/delete), `logUserActivity`, `revalidatePath`.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logUserActivity: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
	requireCapabilityWithContext: vi.fn(),
	getUserCapabilities: vi.fn(),
}));
vi.mock("@emach/db", () => ({ db: { select: vi.fn(), insert: vi.fn(), delete: vi.fn() } }));

import { db } from "@emach/db";
import { logUserActivity } from "@/lib/activity";
import { getUserCapabilities, requireCapabilityWithContext } from "@/lib/permissions";
import { setUserCapability } from "@/app/dashboard/users/[id]/permissions/actions";

const actorAdmin = { user: { id: "actor-admin", role: "admin", status: "active" } } as never;

function mockTargetBranches(ids: string[]) {
	const where = vi.fn(() => Promise.resolve(ids.map((branchId) => ({ branchId }))));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}

beforeEach(() => {
	vi.clearAllMocks();
	(requireCapabilityWithContext as ReturnType<typeof vi.fn>).mockResolvedValue(actorAdmin);
});

describe("setUserCapability — teto e validações", () => {
	it("rejeita capability fora do registry", async () => {
		const r = await setUserCapability({ targetUserId: "u1", capability: "foo.bar", state: "grant" });
		expect(r.ok).toBe(false);
	});

	it("anti-escalada: ator não pode conceder cap que ele não tem", async () => {
		(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(["tools.create"]));
		mockTargetBranches(["b1"]);
		const r = await setUserCapability({ targetUserId: "u1", capability: "tools.delete", state: "grant" });
		expect(r.ok).toBe(false);
	});

	it("grant válido: ator tem a cap e alvo no escopo → insere + audita", async () => {
		(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(["tools.create"]));
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });
		const r = await setUserCapability({ targetUserId: "u1", capability: "tools.create", state: "grant" });
		expect(r.ok).toBe(true);
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({ action: "permission.granted", targetId: "u1" })
		);
	});

	it("inherit: remove a linha de override", async () => {
		(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(["tools.create"]));
		mockTargetBranches(["b1"]);
		const where = vi.fn(() => Promise.resolve());
		(db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where });
		const r = await setUserCapability({ targetUserId: "u1", capability: "tools.create", state: "inherit" });
		expect(r.ok).toBe(true);
		expect(db.delete).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Rodar — deve falhar (action não existe)**

Run: `bun --cwd apps/web test set-user-capability`
Expected: FAIL — `Cannot find module '.../permissions/actions'`.

- [ ] **Step 3: Implementar a action**

`apps/web/src/app/dashboard/users/[id]/permissions/actions.ts`:

```ts
"use server";

import { db } from "@emach/db";
import { userBranch } from "@emach/db/schema/inventory";
import { userCapabilityOverride } from "@emach/db/schema/user-capability-override";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logUserActivity } from "@/lib/activity";
import { isCapability } from "@/lib/capabilities";
import { logger } from "@/lib/logger";
import {
	getUserCapabilities,
	requireCapabilityWithContext,
} from "@/lib/permissions";

export type ActionResult<T = undefined> =
	| { ok: true; data?: T }
	| { ok: false; error: string };

const inputSchema = z.object({
	targetUserId: z.string().min(1),
	capability: z.string().min(1),
	state: z.enum(["grant", "revoke", "inherit"]),
});

export async function setUserCapability(
	raw: z.infer<typeof inputSchema>
): Promise<ActionResult> {
	const parsed = inputSchema.safeParse(raw);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}
	const { targetUserId, capability, state } = parsed.data;

	if (!isCapability(capability)) {
		return { ok: false, error: "Capability desconhecida" };
	}

	try {
		// Filiais do alvo entram no teto de branch-scope (admin só age na própria filial).
		const targetBranches = await db
			.select({ branchId: userBranch.branchId })
			.from(userBranch)
			.where(eq(userBranch.userId, targetUserId));
		const targetBranchIds = targetBranches.map((b) => b.branchId);

		// Capability check (permissions.manage) + ensureActive + hierarquia
		// (admin não gerencia admin/super) + branch-scope do alvo. Lança se barrar.
		const actorSession = await requireCapabilityWithContext("permissions.manage", {
			targetUserId,
			targetBranchIds,
		});

		// Anti-escalada: ator só togla capabilities que ele próprio possui (efetivo).
		const actorCaps = await getUserCapabilities(actorSession);
		if (!actorCaps.has(capability)) {
			return {
				ok: false,
				error: "Você não pode gerenciar uma permissão que não possui",
			};
		}

		if (state === "inherit") {
			await db
				.delete(userCapabilityOverride)
				.where(
					and(
						eq(userCapabilityOverride.userId, targetUserId),
						eq(userCapabilityOverride.capability, capability)
					)
				);
		} else {
			await db
				.insert(userCapabilityOverride)
				.values({
					userId: targetUserId,
					capability,
					effect: state,
					grantedBy: actorSession.user.id,
				})
				.onConflictDoUpdate({
					target: [
						userCapabilityOverride.userId,
						userCapabilityOverride.capability,
					],
					set: { effect: state, grantedBy: actorSession.user.id },
				});
		}

		const action =
			state === "grant"
				? "permission.granted"
				: state === "revoke"
					? "permission.revoked"
					: "permission.reset";
		await logUserActivity({
			action,
			actorUserId: actorSession.user.id,
			targetType: "user",
			targetId: targetUserId,
			metadata: { capability, effect: state },
		});

		revalidatePath(`/dashboard/users/${targetUserId}`);
		return { ok: true };
	} catch (err) {
		logger.error("setUserCapability", err);
		return { ok: false, error: "Não foi possível alterar a permissão" };
	}
}
```

> Nota: o ternário aninhado em `action` pode disparar `noNestedTernary` no ultracite. Se disparar, extrair para um pequeno mapa `const AUDIT_ACTION = { grant: "permission.granted", revoke: "permission.revoked", inherit: "permission.reset" } as const;` e usar `AUDIT_ACTION[state]`.

- [ ] **Step 4: Rodar testes + types + lint**

Run: `bun --cwd apps/web test set-user-capability`
Expected: PASS.
Run: `bun check-types && bun check`
Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/permissions/actions.ts apps/web/__tests__/set-user-capability.test.ts
git commit -m "feat(auth): action setUserCapability com teto, anti-escalada e auditoria"
```

---

## Task 5: Aba "Permissões" no detalhe do usuário (UI)

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/permissions/data.ts`
- Create: `apps/web/src/app/dashboard/users/[id]/_components/permissions-tab.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/page.tsx`

Objetivo: aba com grid agrupado por `group`/`resource`, tri-state (Herdar/Conceder/Revogar) por capability, mostrando o default do role e o efeito atual. O ator só togla caps que possui (teto renderizado **e** validado no servidor).

- [ ] **Step 1: Fetch server-side do estado da aba**

`apps/web/src/app/dashboard/users/[id]/permissions/data.ts`:

```ts
import "server-only";

import { db } from "@emach/db";
import { userCapabilityOverride } from "@emach/db/schema/user-capability-override";
import { eq } from "drizzle-orm";
import type { Capability } from "@/lib/capabilities";

export type OverrideState = "inherit" | "grant" | "revoke";

export async function getUserOverrides(
	userId: string
): Promise<Map<Capability, OverrideState>> {
	const rows = await db
		.select({
			capability: userCapabilityOverride.capability,
			effect: userCapabilityOverride.effect,
		})
		.from(userCapabilityOverride)
		.where(eq(userCapabilityOverride.userId, userId));
	const map = new Map<Capability, OverrideState>();
	for (const r of rows) {
		map.set(r.capability as Capability, r.effect as OverrideState);
	}
	return map;
}
```

- [ ] **Step 2: Componente client `permissions-tab.tsx`**

Recebe do server: `targetUserId`, `targetRole`, `overrides` (Map serializado como array de tuplas), `roleDefaults` (array de caps que o role do alvo tem por padrão), `manageableCaps` (array de caps que o ator pode togglar). Importa `CAPABILITIES` do registry (puro, ok em client) para labels/agrupamento. Tri-state por linha; chama `setUserCapability`.

```tsx
"use client";

import { useTransition } from "react";
import { CAPABILITIES, type Capability } from "@/lib/capabilities";
import { setUserCapability } from "../permissions/actions";
import type { OverrideState } from "../permissions/data";
import { notify } from "@/lib/notify"; // usar o helper de toast do projeto (confirmar caminho real)

interface Props {
	targetUserId: string;
	overrides: [Capability, OverrideState][];
	roleDefaults: Capability[];
	manageableCaps: Capability[];
}

interface Row {
	cap: Capability;
	resource: string;
	action: string;
	description: string;
	defaultOn: boolean;
	state: OverrideState;
	editable: boolean;
}

export function PermissionsTab({
	targetUserId,
	overrides,
	roleDefaults,
	manageableCaps,
}: Props) {
	const [pending, startTransition] = useTransition();
	const overrideMap = new Map(overrides);
	const defaultSet = new Set(roleDefaults);
	const editableSet = new Set(manageableCaps);

	// Agrupar por group → resource preservando a ordem do registry.
	const groups = new Map<string, Row[]>();
	for (const [cap, meta] of Object.entries(CAPABILITIES) as [
		Capability,
		(typeof CAPABILITIES)[Capability],
	][]) {
		const row: Row = {
			cap,
			resource: meta.resource,
			action: meta.action,
			description: meta.description,
			defaultOn: defaultSet.has(cap),
			state: overrideMap.get(cap) ?? "inherit",
			editable: editableSet.has(cap),
		};
		const list = groups.get(meta.group) ?? [];
		list.push(row);
		groups.set(meta.group, list);
	}

	function apply(cap: Capability, state: OverrideState) {
		startTransition(async () => {
			const res = await setUserCapability({ targetUserId, capability: cap, state });
			if (res.ok) {
				notify.success("Permissão atualizada");
			} else {
				notify.error(res.error);
			}
		});
	}

	return (
		<div className="flex flex-col gap-6">
			{[...groups.entries()].map(([group, rows]) => (
				<section className="rounded-lg border border-border" key={group}>
					<h3 className="border-b border-border px-4 py-2.5 font-medium text-sm">
						{group}
					</h3>
					<ul className="divide-y divide-border">
						{rows.map((row) => (
							<li
								className="flex items-center justify-between gap-4 px-4 py-2.5"
								key={row.cap}
							>
								<div className="min-w-0">
									<p className="font-medium text-sm">
										{row.resource} · {row.action}
									</p>
									<p className="text-muted-foreground text-xs">
										{row.description}
										{" — "}
										padrão do nível:{" "}
										<span className="tabular-nums">
											{row.defaultOn ? "permitido" : "negado"}
										</span>
									</p>
								</div>
								<TriState
									defaultOn={row.defaultOn}
									disabled={!row.editable || pending}
									onChange={(s) => apply(row.cap, s)}
									value={row.state}
								/>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}

function TriState({
	value,
	defaultOn,
	disabled,
	onChange,
}: {
	value: OverrideState;
	defaultOn: boolean;
	disabled: boolean;
	onChange: (s: OverrideState) => void;
}) {
	const options: { key: OverrideState; label: string }[] = [
		{ key: "inherit", label: `Herdar (${defaultOn ? "sim" : "não"})` },
		{ key: "grant", label: "Conceder" },
		{ key: "revoke", label: "Revogar" },
	];
	return (
		<div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border">
			{options.map((opt) => (
				<button
					className={
						value === opt.key
							? "bg-primary px-2.5 py-1 text-primary-foreground text-xs"
							: "px-2.5 py-1 text-muted-foreground text-xs hover:bg-muted disabled:opacity-50"
					}
					disabled={disabled}
					key={opt.key}
					onClick={() => onChange(opt.key)}
					type="button"
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}
```

> **Confirmar caminhos reais ao implementar:** o helper de toast (`notify`) — checar como outros forms do projeto notificam (ex: `useFormErrors`/`notify` em `users/_components`). Ajustar import. O segmented control acima é funcional e on-system; polir visual via `impeccable` é opcional (não bloqueia).

- [ ] **Step 3: Injetar a aba na page (gated + teto)**

Em `apps/web/src/app/dashboard/users/[id]/page.tsx`:
- importar `can`, `getUserCapabilities` de `@/lib/permissions`, `roleDefaultCapabilities`/`ALL_CAPABILITIES`/`type Capability` de `@/lib/capabilities`, `getUserOverrides` de `./permissions/data`, `PermissionsTab`, e o ícone `ShieldCheck` de lucide.
- após obter `actorSession` e `user`, computar (só quando a aba é a ativa, para lazy):

```ts
const onPermissionsTab = sp.tab === "permissoes";
const canManagePermissions = await can(actorSession, "permissions.manage");
// Teto de hierarquia: admin só gerencia role=user; super_admin gerencia todos.
const actorRole = (actorSession.user.role ?? "user") as UserRole;
const targetManageable =
	actorRole === "super_admin" ||
	(canManagePermissions && user.role === "user");

let permissionsTabContent: ReactNode = null;
if (targetManageable && onPermissionsTab) {
	const [overrides, actorCaps] = await Promise.all([
		getUserOverrides(user.id),
		getUserCapabilities(actorSession),
	]);
	permissionsTabContent = (
		<PermissionsTab
			manageableCaps={[...actorCaps]}
			overrides={[...overrides.entries()]}
			roleDefaults={[...roleDefaultCapabilities(user.role as UserRole)]}
			targetUserId={user.id}
		/>
	);
}
```

- adicionar a aba ao array `tabs` **apenas** se `targetManageable` (condicional no `.push` ou spread):

```ts
if (targetManageable) {
	tabs.push({
		value: "permissoes",
		label: "Permissões",
		icon: <ShieldCheck aria-hidden className="size-3.5" />,
		content: permissionsTabContent,
	});
}
```

> `user.role`/`actorSession.user.role` já são usados no arquivo (linha 126 faz cast `as UserRow["role"]`). Importar `UserRole` de `@/lib/session` se ainda não estiver. Garantir que `ReactNode` já está importado (está, linha 6).

- [ ] **Step 4: Aplicar schema e smoke visual**

Run: `bun check-types && bun check`
Expected: limpo (atenção a `key={index}` — usar `row.cap`/`group` como key, já feito).

Smoke (server em :3001 conforme handoff):
```bash
cd apps/web && bun run dev   # porta 3001
```
- Como super_admin: abrir `/dashboard/users/<id-de-um-user>?tab=permissoes` → grid aparece, togglar uma cap (ex: conceder `tools.create` a um user) → toast ok; recarregar → estado persiste.
- Verificar fail-closed: abrir o detalhe de um **admin** logado como **admin** → aba "Permissões" **não** aparece (hierarquia). Logado como super_admin → aparece.
- Conferir no banco: `SELECT * FROM user_capability_override;` reflete os toggles.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]
git commit -m "feat(auth): aba de permissões por usuário (grid de overrides)"
```

---

## Task 6: ADR, docs e verificação final (smoke multi-role)

**Files:**
- Create: `docs/adr/0017-permissoes-por-usuario.md`
- Modify: `apps/web/CLAUDE.md` (seção Capabilities), `packages/db/CLAUDE.md` (gap/schema)

- [ ] **Step 1: Escrever o ADR**

`docs/adr/0017-permissoes-por-usuario.md` (seguir o formato dos ADRs existentes — checar `0016`). Conteúdo mínimo: contexto (limitação role-based pura do 0016), decisão (registry + overrides grant/revoke por usuário, resolução efetiva cacheada, teto do admin, deny-by-default), consequências (extensibilidade por 1 entrada no registry; branch-scope inalterado; tabela vazia = comportamento idêntico), alternativas rejeitadas (plugin access-control do Better Auth). Referenciar ADR-0016.

- [ ] **Step 2: Atualizar CLAUDE.md (mistakes-only, curto)**

Em `apps/web/CLAUDE.md` seção "Capabilities": acrescentar que o catálogo agora vive em `src/lib/capabilities.ts` (registry; feature nova = 1 entrada); `can(session, cap)` é **async/efetivo** (role ± overrides), `roleHasCapability(role, cap)` é o default puro sync; overrides em `user_capability_override` resolvidos por `getUserCapabilities` (request-cache). Em `packages/db/CLAUDE.md`: registrar a tabela nova na seção de schema.

- [ ] **Step 3: Verificação completa antes do PR**

Run: `bun check-types`
Expected: 0 erros.
Run: `bun check`
Expected: limpo.
Run: `bun --cwd apps/web test`
Expected: suíte verde (incluindo `capabilities`, `permissions`, `set-user-capability`).

- [ ] **Step 4: Smoke multi-role com dados reais (OBRIGATÓRIO — pitfall #1)**

Replicar o padrão do PR #175 (handoff): criar test users logáveis via script throwaway (internalAdapter), logar via `agent-browser` (`cookies clear` → re-login para trocar de usuário; re-snapshot antes de cada interação). Cenários:
1. **super_admin** concede `tools.delete` a um `user` → logar como esse user → o botão de deletar ferramenta **aparece** (gating efetivo) e a action funciona.
2. **super_admin** revoga `tools.create` de um `admin` → logar como esse admin → botão "Nova ferramenta" **some** e a server action retorna Forbidden se forçada.
3. **admin** tenta gerenciar permissões de outro **admin** → aba não aparece / action barra (hierarquia).
4. **admin** concede a um `user` da própria filial uma cap que o admin tem → ok; tenta conceder `tools.delete` (que o admin não tem) → barrado (anti-escalada).
5. Tabela vazia (usuário sem overrides) → comportamento idêntico ao role puro.

**Limpar** test users + scripts + parar o server no fim.

- [ ] **Step 5: Commit + fechar a branch**

```bash
git add docs/adr/0017-permissoes-por-usuario.md apps/web/CLAUDE.md packages/db/CLAUDE.md
git commit -m "docs: ADR-0017 permissões por usuário + notas de convenção"
```

Depois: `/code-review` no diff, então `superpowers:finishing-a-development-branch` para abrir o PR (base `main`).

---

## Self-Review (cobertura do spec)

| Requisito do spec | Task |
| --- | --- |
| Registry declarativo (§1) | Task 1 |
| Roles = templates derivados (§2) | Task 1 (`ROLE_CAPS` derivado) |
| Tabela `user_capability_override` (§3) | Task 2 |
| Resolução cacheada `getUserCapabilities`/`can` (§4) | Task 2 (+ flip async Task 3) |
| UI de gestão (§5) | Task 5 |
| `permissions.manage` + teto (§6) | Task 1 (cap) + Task 4 (teto/anti-escalada) |
| Extensibilidade / deny-by-default (§7) | Task 1 (registry) + Task 4 (`isCapability` fail-closed) |
| Auditoria (§8) | Task 4 (`logUserActivity`) |
| Rollout aditivo (§9) | Ordem das tasks (cada passo verificável; tabela vazia = no-op) |
| Pitfall #1 (cobrir todo callsite + UI é ponto de vazamento) | Task 3 (todos os callsites) + Task 4 (teto no servidor) + Task 6 (smoke) |
| Pitfall #2 (cache com userId na chave) | Task 2 (`React.cache` keya por session; sem cross-request) |
| Pitfall #3 (código morto) | Task 3 (lista autoritativa via grep) + Task 5 (smoke do que a página usa) |
| Pitfall #4 (`bun check` ≠ check-types) | `bun check` em Tasks 3/4/5/6 |
| Pitfall #5 (`db.execute` raw) | N/A — usamos query builder (sem `db.execute` raw nesta feature) |
| Pitfall #6 (fail-closed exige dado) | Task 2 (tabela vazia = role puro) + smoke #5 |
