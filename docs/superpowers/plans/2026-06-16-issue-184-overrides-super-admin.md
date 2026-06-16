# Blindar overrides de capability sobre super_admin (issue #184) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que overrides de capability degradem um `super_admin`, eliminando o lock-out de `permissions.manage` (issue #184) por defesa em 3 camadas.

**Architecture:** Opção A do design — overrides passam a valer só para `admin`/`user`. (1) `getUserCapabilities` ignora overrides quando o role é super_admin (defesa de fundo + dados legados); (2) `setUserCapability` rejeita `grant`/`revoke` sobre alvo super_admin, mantendo `inherit`; (3) a aba "Permissões" mostra estado explicativo para alvo super_admin.

**Tech Stack:** Next 16 / React 19 (RSC), Drizzle ORM, vitest (`environment: node`, mock de `@emach/db` via `vi.mock`).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-06-16-issue-184-overrides-super-admin-design.md`.
- Testes rodam com `bun --cwd apps/web test`; arquivos em `apps/web/__tests__/`.
- Antes de cada commit: `bun --cwd apps/web check-types` **e** `bun check` (ultracite/biome) limpos.
- Anti-patterns banidos (raiz `CLAUDE.md`): sem `: any`/`as any`/`@ts-ignore`; sem `console.*` (usar `logger`); IDs estáveis em `.map`.
- Mensagem de erro de override sobre super_admin (copiar verbatim): `"Super admin tem acesso total — permissões não são ajustáveis"`.
- `getUserCapabilities` é `cache()` do React: nos testes, usar **id de usuário único por teste** para garantir cache miss (padrão já presente em `permissions.test.ts`).
- Implementador: **Read cada arquivo antes de Edit** (não herda state do parent).

---

### Task 1: Camada 1 — `getUserCapabilities` ignora overrides para super_admin

**Files:**
- Modify: `apps/web/src/lib/permissions.ts:54-77` (corpo de `getUserCapabilities`)
- Test: `apps/web/__tests__/permissions.test.ts` (adicionar ao `describe("getUserCapabilities …")`, após a linha 302)

**Interfaces:**
- Consumes: `roleDefaultCapabilities(role)` de `@/lib/capabilities` (já importado) — retorna `Set<Capability>` mutável.
- Produces: `getUserCapabilities(session): Promise<ReadonlySet<Capability>>` — comportamento inalterado para `admin`/`user`; para `super_admin` retorna o default do role sem tocar o banco.

- [ ] **Step 1: Write the failing test**

Adicionar ao final do bloco `describe("getUserCapabilities — conjunto efetivo …")` em `apps/web/__tests__/permissions.test.ts` (depois da linha 302, antes do `});` que fecha o describe):

```ts
	it("super_admin ignora overrides: cap permanece mesmo com revoke gravado", async () => {
		const s = {
			user: { id: "ovr-sa-1", role: "super_admin", status: "active" },
		} as never;
		mockOverrides([{ capability: "permissions.manage", effect: "revoke" }]);
		const caps = await getUserCapabilities(s);
		expect(caps.has("permissions.manage")).toBe(true);
		// Não busca overrides para super_admin (early-return antes do db.select).
		expect(db.select).not.toHaveBeenCalled();
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test permissions.test.ts -t "super_admin ignora overrides"`
Expected: FAIL — `db.select` foi chamado (override `revoke` ainda aplicado removeria `permissions.manage`, e a query de overrides roda).

- [ ] **Step 3: Write minimal implementation**

Em `apps/web/src/lib/permissions.ts`, no corpo de `getUserCapabilities` (linha 54-77), inserir o early-return logo após obter `role` e `caps`:

```ts
export const getUserCapabilities = cache(
	async (session: DashboardSession): Promise<ReadonlySet<Capability>> => {
		const role = (session.user.role ?? "user") as UserRole;
		const caps = roleDefaultCapabilities(role);
		// super_admin é irrestrito por construção: overrides não se aplicam (grant
		// é redundante, revoke seria vetor de lock-out — issue #184 / ADR-0017).
		// Early-return também poupa a query de overrides por request.
		if (role === "super_admin") {
			return caps;
		}
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun --cwd apps/web test permissions.test.ts`
Expected: PASS — novo teste verde; os testes existentes de `getUserCapabilities` (admin com grant/revoke/sem override) continuam verdes.

- [ ] **Step 5: Type-check, lint e commit**

```bash
bun --cwd apps/web check-types
bun check
git add apps/web/src/lib/permissions.ts apps/web/__tests__/permissions.test.ts
git commit -m "fix: getUserCapabilities ignora overrides para super_admin (issue #184)"
```

Expected: ambos os comandos sem erro.

---

### Task 2: Camada 2 — `setUserCapability` rejeita grant/revoke sobre alvo super_admin

**Files:**
- Modify: `apps/web/src/app/dashboard/users/[id]/permissions/actions.ts` (import de `user` + guard novo)
- Test: `apps/web/__tests__/set-user-capability.test.ts` (helper novo + atualizar testes existentes + testes novos)

**Interfaces:**
- Consumes: `user` table de `@emach/db/schema/auth`; `eq` de `drizzle-orm` (já importado); `setUserCapability` (assinatura inalterada).
- Produces: `setUserCapability` agora faz **3** `db.select` no caminho feliz, nesta ordem: (1) role do alvo, (2) branches do alvo, (3) override existente.

- [ ] **Step 1: Adicionar o import de `user` na action**

Em `apps/web/src/app/dashboard/users/[id]/permissions/actions.ts`, adicionar o import (junto aos outros de schema, após a linha 4 `import { userBranch } …`):

```ts
import { user as userTable } from "@emach/db/schema/auth";
```

- [ ] **Step 2: Inserir o guard no início do `try`**

Em `setUserCapability`, dentro do `try` (linha 43), **antes** da query de branches (linha 45 `const targetBranches = …`), inserir:

```ts
		// Camada 2 (issue #184): super_admin é irrestrito — override grant/revoke
		// sobre ele é semanticamente inválido e abre lock-out. `inherit` (limpeza
		// de override) permanece permitido: é idempotente e nunca cria lock-out.
		const [targetUser] = await db
			.select({ role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, targetUserId))
			.limit(1);
		if (targetUser?.role === "super_admin" && state !== "inherit") {
			return {
				ok: false,
				error: "Super admin tem acesso total — permissões não são ajustáveis",
			};
		}
```

- [ ] **Step 3: Adicionar o helper `mockTargetRole` no teste**

Em `apps/web/__tests__/set-user-capability.test.ts`, adicionar o helper logo após `mockTargetBranches` (linha 33):

```ts
// 1º db.select da action: role do alvo (guard super_admin da issue #184).
function mockTargetRole(role: string | null) {
	const limit = vi.fn(() => Promise.resolve(role ? [{ role }] : []));
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}
```

- [ ] **Step 4: Atualizar os testes existentes (a query de role é agora o 1º select)**

Em cada teste do `describe("setUserCapability — teto e validações")` que chama `mockTargetBranches(...)`, inserir `mockTargetRole("user");` **imediatamente antes** da chamada a `mockTargetBranches`. Alvos desses testes são não-super_admin, então `"user"` não dispara o guard. São estes (linhas aproximadas do arquivo atual):

- `"anti-escalada: ator não pode conceder cap que ele não tem"` (antes do `mockTargetBranches(["b1"])`, ~linha 64)
- `"alvo sem filial: admin (não super_admin) é barrado (fail-closed)"` (~linha 77 — usar `mockTargetRole("user")` antes de `mockTargetBranches([])`)
- `"grant válido: ator tem a cap e alvo no escopo → insere + audita"` (~linha 91)
- `"inherit: remove a linha de override"` (~linha 115)
- `"revoke válido: insere effect=revoke e audita permission.revoked"` (~linha 135)
- `"erro de banco: retorna ok:false genérico (não vaza)"` (~linha 158)
- `"revoke: ator SEM a cap, alvo gerenciável → sucesso …"` (~linha 182)
- `"inherit: ator SEM a cap, alvo gerenciável → sucesso (delete) …"` (~linha 206)
- `"revoke: guards continuam barrando — requireCapabilityWithContext lança …"` (~linha 227)

O teste `"rejeita capability fora do registry"` (~linha 51) **não** muda: retorna antes do `try` (a action checa `isCapability` antes de qualquer query).

Exemplo do padrão aplicado (teste de grant válido):

```ts
	it("grant válido: ator tem a cap e alvo no escopo → insere + audita", async () => {
		(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Set(["tools.create"])
		);
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		mockExistingOverride(null);
		// … resto inalterado
	});
```

- [ ] **Step 5: Adicionar os testes novos do guard**

Adicionar ao final do `describe("setUserCapability — teto e validações")` (antes do `});` que o fecha, ~linha 237). Definir primeiro um ator super_admin reutilizável logo após `actorAdmin` (linha 25):

```ts
const actorSuperAdmin = {
	user: { id: "actor-sa", role: "super_admin", status: "active" },
} as never;
```

Testes novos:

```ts
	it("alvo super_admin: revoke de permissions.manage é rejeitado (lock-out #184)", async () => {
		mockTargetRole("super_admin");
		const r = await setUserCapability({
			targetUserId: "sa-target",
			capability: "permissions.manage",
			state: "revoke",
		});
		expect(r.ok).toBe(false);
		expect(db.insert).not.toHaveBeenCalled();
		expect(db.delete).not.toHaveBeenCalled();
	});

	it("alvo super_admin: revoke de cap arbitrária também é rejeitado (classe geral)", async () => {
		mockTargetRole("super_admin");
		const r = await setUserCapability({
			targetUserId: "sa-target",
			capability: "branches.manage",
			state: "revoke",
		});
		expect(r.ok).toBe(false);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("alvo super_admin: inherit é permitido (limpeza idempotente)", async () => {
		(
			requireCapabilityWithContext as ReturnType<typeof vi.fn>
		).mockResolvedValue(actorSuperAdmin);
		mockTargetRole("super_admin");
		mockTargetBranches([]);
		mockExistingOverride("revoke");
		const where = vi.fn(() => Promise.resolve());
		(db.delete as ReturnType<typeof vi.fn>).mockReturnValue({ where });
		const r = await setUserCapability({
			targetUserId: "sa-target",
			capability: "permissions.manage",
			state: "inherit",
		});
		expect(r.ok).toBe(true);
		expect(db.delete).toHaveBeenCalled();
	});
```

- [ ] **Step 6: Run tests**

Run: `bun --cwd apps/web test set-user-capability.test.ts`
Expected: PASS — testes existentes (atualizados) + 3 novos verdes.

- [ ] **Step 7: Type-check, lint e commit**

```bash
bun --cwd apps/web check-types
bun check
git add apps/web/src/app/dashboard/users/[id]/permissions/actions.ts apps/web/__tests__/set-user-capability.test.ts
git commit -m "fix: setUserCapability rejeita override grant/revoke sobre super_admin (issue #184)"
```

---

### Task 3: Camada 3 — aba "Permissões" mostra estado explicativo para alvo super_admin

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/_components/super-admin-permissions-notice.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/page.tsx:79-106` (ramo de `permissionsTabContent`)

**Interfaces:**
- Consumes: nada de tasks anteriores (mudança de UI independente).
- Produces: componente `SuperAdminPermissionsNotice` (Server Component, sem props).

- [ ] **Step 1: Criar o componente da nota**

Criar `apps/web/src/app/dashboard/users/[id]/_components/super-admin-permissions-notice.tsx`:

```tsx
import { ShieldCheck } from "lucide-react";

export function SuperAdminPermissionsNotice() {
	return (
		<div className="flex flex-col items-center gap-3 rounded-lg border border-border border-dashed px-6 py-10 text-center">
			<ShieldCheck aria-hidden className="size-6 text-muted-foreground" />
			<p className="font-medium text-sm">Acesso total irrestrito</p>
			<p className="max-w-sm text-muted-foreground text-xs">
				Super admin recebe todas as permissões pelo nível de acesso. Overrides
				não se aplicam — não há nada para ajustar aqui.
			</p>
		</div>
	);
}
```

- [ ] **Step 2: Ligar o ramo no `page.tsx`**

Em `apps/web/src/app/dashboard/users/[id]/page.tsx`, importar o componente (junto aos imports de `./_components/…`, perto da linha 34):

```ts
import { SuperAdminPermissionsNotice } from "./_components/super-admin-permissions-notice";
```

Trocar o bloco de `permissionsTabContent` (linhas 92-106) por:

```tsx
	let permissionsTabContent: ReactNode = null;
	if (targetManageable && onPermissionsTab) {
		if (user.role === "super_admin") {
			// Camada 3 (issue #184): overrides não se aplicam a super_admin — sem grid.
			permissionsTabContent = <SuperAdminPermissionsNotice />;
		} else {
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
	}
```

- [ ] **Step 3: Type-check e lint**

Run:
```bash
bun --cwd apps/web check-types
bun check
```
Expected: sem erro. (`check-types` não pega regressão visual — Step 4.)

- [ ] **Step 4: Smoke visual (obrigatório para mudança de UI)**

Pré-requisito: dois usuários `super_admin` `active` no banco dev. Se só houver um, promover um segundo temporariamente:
`UPDATE "user" SET role='super_admin', status='active' WHERE email='<segundo>';`

Passos:
1. `bun dev:web`
2. Logar como super_admin A.
3. Abrir `/dashboard/users/<id-do-super_admin-B>?tab=permissoes`.
4. Confirmar: a aba "Permissões" aparece e mostra a **nota** "Acesso total irrestrito" — **sem** grid tri-state, sem toggles.
5. Conferência negativa: abrir a aba "Permissões" de um usuário `admin`/`user` → o grid tri-state continua renderizando normal.

Stack trace rápido se algo quebrar: `nextjs_call <port> get_errors` (MCP `next-devtools`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/_components/super-admin-permissions-notice.tsx apps/web/src/app/dashboard/users/[id]/page.tsx
git commit -m "fix: aba de permissões mostra estado explicativo para alvo super_admin (issue #184)"
```

---

### Task 4: Documentação (adendo ADR-0017) + nota de cleanup

**Files:**
- Modify: `docs/adr/0017-permissoes-por-usuario.md` (nova seção antes de `## Consequences`)

**Interfaces:**
- Consumes: nada. Produces: registro da invariante.

- [ ] **Step 1: Adicionar a seção de invariante ao ADR-0017**

Em `docs/adr/0017-permissoes-por-usuario.md`, inserir antes de `## Consequences` (linha 83):

```markdown
### Invariante: overrides não se aplicam a super_admin (issue #184)

`super_admin` é funcionalmente irrestrito por role. Um override `grant` sobre ele é
redundante; um `revoke` o degrada abaixo do teto do role e, no caso de
`permissions.manage`, abre um lock-out só recuperável via SQL (dois super_admins se
revogando mutuamente — nenhum é "o último", então `assertNotLastActiveSuperAdmin` não
dispara). Decisão (Opção A): overrides valem **apenas para `admin`/`user`**. Defesa em
3 camadas: (1) `getUserCapabilities` ignora overrides quando `role === super_admin`;
(2) `setUserCapability` rejeita `grant`/`revoke` sobre alvo super_admin (mantém
`inherit` para limpeza); (3) a aba "Permissões" mostra estado explicativo para alvo
super_admin. Alternativas B (guard "≥1 super_admin com a cap"), C (`permissions.manage`
em `LAST_SUPER_ADMIN_GUARDED`) e D (caps `defaultRoles: S` não-revogáveis) cobririam só
o lock-out de uma cap, não a classe inteira. Design completo:
`docs/superpowers/specs/2026-06-16-issue-184-overrides-super-admin-design.md`.

**Cleanup de dados legados (opcional, idempotente):** como a Camada 1 já neutraliza
overrides legados sobre super_admins, é só higiene —
`DELETE FROM user_capability_override WHERE user_id IN (SELECT id FROM "user" WHERE role = 'super_admin');`
(push-only, ADR-0006 — script SQL pontual, não migration versionada).
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0017-permissoes-por-usuario.md
git commit -m "docs: adendo ADR-0017 — overrides não se aplicam a super_admin (issue #184)"
```

---

## Verificação final (após todas as tasks)

- [ ] `bun --cwd apps/web test` — suíte inteira verde.
- [ ] `bun --cwd apps/web check-types` — sem erro.
- [ ] `bun check` — sem erro.
- [ ] Smoke visual da Task 3 confirmado.
- [ ] Reverter promoção temporária de super_admin do smoke, se aplicável.
