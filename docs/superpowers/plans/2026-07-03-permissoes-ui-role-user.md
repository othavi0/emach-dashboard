# Permissões de UI do role `user` + escopo de filial — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o vazamento de UI para o role `user` (Filiais na sidebar + controles administrativos na própria página) e corrigir o P0 de leitura de filial fora de escopo, mantendo o servidor fail-closed.

**Architecture:** Três frentes independentes, ordenadas por risco. (A) escopo de filial nas leituras do detalhe via `requireCapabilityWithContext` + guard de página; (B) `branches.read` vira admin-only + gate no menu; (C) a shell `/dashboard/users/[id]` ganha modo self-service — no auto-acesso os controles administrativos somem e surge edição dos próprios dados básicos + troca de senha. (D) troca de e-mail self-service (fase de maior risco, isolada).

**Tech Stack:** Next 16 / React 19 (Server Components + server actions), Drizzle, Better Auth (`@emach/auth/dashboard`), Zod, Vitest (env node, `@emach/db` mockado), Biome/ultracite.

## Global Constraints

- Server action: `"use server"` no topo + guard (`requireCapability*` ou `requireCurrentSession`) como primeira instrução. Retorno `ActionResult<T>` = `{ ok: true; data } | { ok: false; error }`. Validação Zod `safeParse`. `revalidatePath`/`revalidateTag` após mutação. (`apps/web/CLAUDE.md`)
- Proibido: `console.*` (usar `logger` de `@/lib/logger`), `: any`/`as any`/`@ts-*`, `key={index}`, `<img>` puro, `forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo).
- Capabilities: registry em `apps/web/src/lib/capabilities.ts`. Atalhos: `S=["super_admin"]`, `SA=["super_admin","admin"]`, `SAU=["super_admin","admin","user"]`.
- `requireCapabilityWithContext(cap, { targetBranchIds })` valida `targetBranchIds ⊆ escopo` (lança fora de escopo); `super_admin` passa sempre.
- Verificação: `bun check-types` NÃO pega lint nem hook client em Server Component nem SQL inválido. Antes de commit rodar `bun verify` (check-types + check + test). Smoke no browser (server já rodando em :3008) após mexer em página/tab.
- Testes: `bun --cwd apps/web test`. Guard tests mockam `@/lib/permissions`. Padrão em `apps/web/src/app/dashboard/stock/__tests__/guards.test.ts`.
- Commits: Conventional Commits em PT, subject ≤50 chars.

---

## Fase A — P0: escopo de filial nas leituras do detalhe

Fecha a espiada entre filiais (Pedidos/Atividade/Overview de qualquer filial via URL). É a correção mais urgente.

### Task A1: escopo em `fetchBranchOrdersPage`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts:164-171`
- Test: `apps/web/src/app/dashboard/branches/__tests__/guards.test.ts`

**Interfaces:**
- Consumes: `requireCapabilityWithContext(cap, { targetBranchIds })` de `@/lib/permissions`.
- Produces: `fetchBranchOrdersPage` passa a rejeitar filial fora de escopo.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `apps/web/src/app/dashboard/branches/__tests__/guards.test.ts`:

```ts
import { requireCapabilityWithContext } from "@/lib/permissions";
import { fetchBranchOrdersPage } from "../actions";

describe("fetchBranchOrdersPage — branch-scope guard", () => {
	it("rejeita quando a filial está fora do escopo", async () => {
		vi.mocked(requireCapabilityWithContext).mockRejectedValueOnce(
			new Error("Filial fora do seu escopo: b-outra")
		);
		await expect(
			fetchBranchOrdersPage({ branchId: "b-outra", cursor: null })
		).rejects.toThrow("fora do seu escopo");
	});

	it("chama requireCapabilityWithContext com orders.read + targetBranchIds", async () => {
		vi.mocked(requireCapabilityWithContext).mockRejectedValueOnce(
			new Error("scope")
		);
		await expect(
			fetchBranchOrdersPage({ branchId: "b1", cursor: null })
		).rejects.toThrow();
		expect(vi.mocked(requireCapabilityWithContext)).toHaveBeenCalledWith(
			"orders.read",
			{ targetBranchIds: ["b1"] }
		);
	});
});
```

Adicionar `requireCapabilityWithContext: vi.fn()` ao mock de `@/lib/permissions` no topo do arquivo (hoje só tem `requireCapability`, `requireCurrentSession`, `can`):

```ts
vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCapabilityWithContext: vi.fn(),
	requireCurrentSession: vi.fn(),
	can: vi.fn(),
}));
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test guards.test.ts`
Expected: FAIL — `fetchBranchOrdersPage` ainda chama `requireCapability`, não `requireCapabilityWithContext`.

- [ ] **Step 3: Implementar**

Em `apps/web/src/app/dashboard/branches/actions.ts`, no `import { requireCapability } from "@/lib/permissions";` (linha 14) trocar por:

```ts
import { requireCapability, requireCapabilityWithContext } from "@/lib/permissions";
```

Na função `fetchBranchOrdersPage` (linha 164), trocar a linha 171:

```ts
	await requireCapability("orders.read");
```
por:
```ts
	await requireCapabilityWithContext("orders.read", { targetBranchIds: [branchId] });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test guards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/actions.ts apps/web/src/app/dashboard/branches/__tests__/guards.test.ts
git commit -m "fix: escopo de filial em fetchBranchOrdersPage"
```

### Task A2: escopo nos wrappers de Atividade

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts:29-36` (`fetchBranchActivityPage` wrapper)
- Modify: `apps/web/src/app/dashboard/branches/[id]/_lib/tab-actions.ts:32-39` (`fetchBranchActivityToolsAction`)
- Test: `apps/web/src/app/dashboard/branches/__tests__/guards.test.ts`

**Interfaces:**
- Consumes: `requireCapabilityWithContext` (já importado na Task A1 em actions.ts; já importado em tab-actions.ts linha 11).
- Produces: os dois wrappers rejeitam filial fora de escopo.

- [ ] **Step 1: Ajustar o teste existente + adicionar tools**

Em `guards.test.ts`, o bloco atual `describe("fetchBranchActivityPage — guard", ...)` (linhas 58-68) testa `requireCapability` — reescrever para o novo guard:

```ts
describe("fetchBranchActivityPage — branch-scope guard", () => {
	it("rejeita filial fora de escopo via requireCapabilityWithContext", async () => {
		vi.mocked(requireCapabilityWithContext).mockRejectedValueOnce(
			new Error("Filial fora do seu escopo: b1")
		);
		await expect(
			fetchBranchActivityPage(
				{ branchId: "b1", kinds: ["stock"], period: "7d" },
				null
			)
		).rejects.toThrow("fora do seu escopo");
		expect(vi.mocked(requireCapabilityWithContext)).toHaveBeenCalledWith(
			"branches.read",
			{ targetBranchIds: ["b1"] }
		);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test guards.test.ts`
Expected: FAIL — wrapper ainda usa `requireCapability`.

- [ ] **Step 3: Implementar**

Em `apps/web/src/app/dashboard/branches/actions.ts`, no wrapper `fetchBranchActivityPage` (linha 29), trocar a linha 34:

```ts
	await requireCapability("branches.read");
```
por:
```ts
	await requireCapabilityWithContext("branches.read", {
		targetBranchIds: [filters.branchId],
	});
```

Em `apps/web/src/app/dashboard/branches/[id]/_lib/tab-actions.ts`, no `fetchBranchActivityToolsAction` (linha 32), trocar a linha 37:

```ts
	await requireCapability("branches.read");
```
por:
```ts
	await requireCapabilityWithContext("branches.read", {
		targetBranchIds: [branchId],
	});
```

(`requireCapability` continua importado em tab-actions.ts para `fetchBranchTeamAction`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test guards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/actions.ts apps/web/src/app/dashboard/branches/[id]/_lib/tab-actions.ts apps/web/src/app/dashboard/branches/__tests__/guards.test.ts
git commit -m "fix: escopo de filial nos wrappers de atividade"
```

### Task A3: guard de escopo na página de detalhe

Defesa-em-profundidade: fecha overview/KPIs (`getBranchDetail`/`getBranchDetailKpis` não têm scope) e qualquer aba de uma vez.

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/page.tsx:40-57`

**Interfaces:**
- Consumes: `getUserBranchScope`, `inScope` de `@/lib/branch-scope`; `notFound` (já importado).

- [ ] **Step 1: Implementar o guard**

Em `apps/web/src/app/dashboard/branches/[id]/page.tsx`, adicionar aos imports:

```ts
import { getUserBranchScope, inScope } from "@/lib/branch-scope";
```

Em `BranchDetailPageContent`, logo após `const { id } = await params;` (linha 47) e antes de buscar `detail`/`kpis`, inserir:

```ts
	// P0: branches.read é admin-only, mas admin é filial-scoped — bloquear leitura
	// de filial fora do escopo (404 não revela existência). super_admin passa.
	const scope = await getUserBranchScope(session);
	if (!inScope(scope, id)) {
		notFound();
	}
```

- [ ] **Step 2: check-types**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 3: Smoke no browser**

Com o servidor em :3008, logado como `admin` escopado à Filial A, abrir `/dashboard/branches/{id-de-outra-filial}`.
Expected: 404 (not found), não o detalhe. Abrir a própria filial: carrega normal.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/[id]/page.tsx
git commit -m "fix: guard de escopo no detalhe de filial"
```

---

## Fase B — Filiais vira admin-only

### Task B1: `branches.read` SAU → SA

**Files:**
- Modify: `apps/web/src/lib/capabilities.ts:154-160`
- Test: `apps/web/__tests__/capabilities.test.ts`

**Interfaces:**
- Produces: `roleDefaultCapabilities("user")` deixa de conter `branches.read`; `admin`/`super_admin` mantêm.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `apps/web/__tests__/capabilities.test.ts` (dentro do describe existente ou um novo):

```ts
import { roleDefaultCapabilities } from "@/lib/capabilities";

describe("branches.read — admin-only", () => {
	it("user NÃO tem branches.read", () => {
		expect(roleDefaultCapabilities("user").has("branches.read")).toBe(false);
	});
	it("admin e super_admin têm branches.read", () => {
		expect(roleDefaultCapabilities("admin").has("branches.read")).toBe(true);
		expect(roleDefaultCapabilities("super_admin").has("branches.read")).toBe(
			true
		);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test capabilities.test.ts`
Expected: FAIL — hoje `branches.read` é `SAU` (user tem).

- [ ] **Step 3: Implementar**

Em `apps/web/src/lib/capabilities.ts`, no `"branches.read"` (linha 154-160), trocar `defaultRoles: SAU,` por `defaultRoles: SA,`:

```ts
	"branches.read": {
		group: "Filiais",
		resource: "Filiais",
		action: "Ver",
		description: "Visualizar filiais",
		defaultRoles: SA,
	},
```

- [ ] **Step 4: Rodar suite + ver passar**

Run: `bun --cwd apps/web test capabilities.test.ts`
Expected: PASS.
Run: `bun --cwd apps/web test`
Expected: verde. Se algum teste assumia `branches.read=SAU` (ex: `permissions-view.test.ts`, `permissions.test.ts`), ajustar a expectativa para admin-only e re-rodar.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/capabilities.ts apps/web/__tests__/capabilities.test.ts
git commit -m "feat: branches.read vira admin-only"
```

### Task B2: gate do item "Filiais" na sidebar

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/nav-config.ts:129-133`
- Test: `apps/web/src/app/dashboard/_components/__tests__/nav-config.test.ts`

**Interfaces:**
- Consumes: `Capability` type (já importado no nav-config).
- Produces: item "Filiais" com `capability: "branches.read"` → filtrado pelo `app-sidebar` para quem não tem a cap.

- [ ] **Step 1: Escrever o teste que falha**

Em `apps/web/src/app/dashboard/_components/__tests__/nav-config.test.ts`, adicionar:

```ts
import { NAV_GROUPS } from "../nav-config";

it("item Filiais exige branches.read", () => {
	const filiais = NAV_GROUPS.flatMap((g) => g.items).find(
		(i) => i.label === "Filiais"
	);
	expect(filiais?.capability).toBe("branches.read");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test nav-config.test.ts`
Expected: FAIL — `capability` é `undefined`.

- [ ] **Step 3: Implementar**

Em `apps/web/src/app/dashboard/_components/nav-config.ts`, no item "Filiais" (linha 129-133), adicionar `capability`:

```ts
				{
					label: "Filiais",
					href: "/dashboard/branches" as Route,
					icon: Building2,
					capability: "branches.read",
				},
```

- [ ] **Step 4: Rodar + smoke**

Run: `bun --cwd apps/web test nav-config.test.ts`
Expected: PASS.
Smoke (:3008): logado como `user`, a sidebar NÃO mostra "Filiais" (o grupo "Configuração" some inteiro, pois Frete/Configurações já eram gated). Como `admin`: "Filiais" aparece.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-config.ts apps/web/src/app/dashboard/_components/__tests__/nav-config.test.ts
git commit -m "fix: gate do item Filiais na sidebar"
```

---

## Fase C — Shell de usuário honesta + minha conta (nome + senha)

No self-view (`viewer === alvo`), os controles administrativos somem e surgem edição do próprio nome e troca de senha. O caminho admin-gerencia-outro fica intacto.

### Task C1: action `updateOwnProfile` (nome)

**Files:**
- Modify: `apps/web/src/app/dashboard/users/schema.ts` (append)
- Modify: `apps/web/src/app/dashboard/users/actions.ts` (append)
- Test: `apps/web/src/app/dashboard/users/__tests__/update-own-profile.test.ts` (create)

**Interfaces:**
- Consumes: `requireCurrentSession` de `@/lib/session`; `logUserActivity`; `db`, `user as userTable`.
- Produces: `updateOwnProfile(input: { name?: string }): Promise<ActionResult>` — atualiza só `name` do próprio `session.user.id`; `updateOwnProfileSchema`.

- [ ] **Step 1: Schema**

Em `apps/web/src/app/dashboard/users/schema.ts`, adicionar:

```ts
export const updateOwnProfileSchema = z.object({
	name: z.string().min(2, "Informe seu nome").max(100).optional(),
});
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/users/__tests__/update-own-profile.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ requireCurrentSession: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logUserActivity: vi.fn() }));

const setName = vi.fn().mockReturnValue({ where: vi.fn() });
vi.mock("@emach/db", () => ({
	db: { update: vi.fn().mockReturnValue({ set: setName }) },
}));

import { requireCurrentSession } from "@/lib/session";
import { updateOwnProfile } from "../actions";

const session = (over = {}) => ({
	user: { id: "u1", status: "active", ...over },
});

describe("updateOwnProfile", () => {
	it("bloqueia conta não ativa", async () => {
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(
			session({ status: "suspended" }) as never
		);
		const r = await updateOwnProfile({ name: "Novo" });
		expect(r.ok).toBe(false);
	});

	it("atualiza só o próprio nome", async () => {
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(session() as never);
		const r = await updateOwnProfile({ name: "Novo Nome" });
		expect(r.ok).toBe(true);
		expect(setName).toHaveBeenCalledWith({ name: "Novo Nome" });
	});
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun --cwd apps/web test update-own-profile.test.ts`
Expected: FAIL — `updateOwnProfile` não existe.

- [ ] **Step 4: Implementar a action**

Em `apps/web/src/app/dashboard/users/actions.ts`, adicionar (o arquivo já importa `db`, `userTable`, `logUserActivity`, `requireCurrentSession`, `revalidatePath`, `eq`, `ActionResult`; adicionar `updateOwnProfileSchema` ao import de `./schema`):

```ts
export async function updateOwnProfile(input: unknown): Promise<ActionResult> {
	const session = await requireCurrentSession();
	if (session.user.status !== "active") {
		return { ok: false, error: "Conta não ativa" };
	}
	const parsed = updateOwnProfileSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}
	if (parsed.data.name === undefined) {
		return { ok: true, data: undefined };
	}
	try {
		await db
			.update(userTable)
			.set({ name: parsed.data.name })
			.where(eq(userTable.id, session.user.id));
	} catch (error) {
		logger.error("updateOwnProfile falhou", error);
		return { ok: false, error: "Não foi possível atualizar" };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.self_updated",
		targetType: "user",
		targetId: session.user.id,
		metadata: { changes: { name: parsed.data.name } },
	});
	revalidatePath(`${USERS_PATH}/${session.user.id}`);
	return { ok: true, data: undefined };
}
```

- [ ] **Step 5: Rodar, verificar, commit**

Run: `bun --cwd apps/web test update-own-profile.test.ts`
Expected: PASS.
Run: `bun --cwd apps/web check-types`
Expected: sem erros.

```bash
git add apps/web/src/app/dashboard/users/schema.ts apps/web/src/app/dashboard/users/actions.ts apps/web/src/app/dashboard/users/__tests__/update-own-profile.test.ts
git commit -m "feat: action updateOwnProfile (nome próprio)"
```

### Task C2: sheet de auto-edição do nome

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/_components/user-self-edit-sheet.tsx`

**Interfaces:**
- Consumes: `EntityEditSheet`, `LabeledField`, `Input`, `useFormErrors`, `notify`, `updateOwnProfile`, `updateOwnProfileSchema`.
- Produces: `<UserSelfEditSheet name={string} />` — abre com `?edit=1`, submete `updateOwnProfile`.

- [ ] **Step 1: Criar o componente** (espelha `user-edit-sheet.tsx`, sem cargo/verificação)

```tsx
"use client";

import { Input } from "@emach/ui/components/input";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { LabeledField } from "@/components/labeled-field";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { updateOwnProfile } from "../../actions";
import { updateOwnProfileSchema } from "../../schema";

export function UserSelfEditSheet({ name: initialName }: { name: string }) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [name, setName] = useState(initialName);
	const { errors, reportValidationError, clearErrors } = useFormErrors();
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setName(initialName);
			clearErrors();
		}
	}, [open, initialName, clearErrors]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = updateOwnProfileSchema.safeParse({ name });
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const res = await updateOwnProfile(parsed.data);
			if (res.ok) {
				notify.success("Dados atualizados");
				close();
				router.refresh();
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize seus dados básicos."
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title="Editar meus dados"
		>
			<div className="flex flex-col gap-4">
				<LabeledField error={errors.name} id="self-name" label="Nome">
					{(field) => (
						<Input
							{...field}
							onChange={(e) => setName(e.target.value)}
							value={name}
						/>
					)}
				</LabeledField>
			</div>
		</EntityEditSheet>
	);
}
```

- [ ] **Step 2: check-types**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/_components/user-self-edit-sheet.tsx
git commit -m "feat: sheet de auto-edição de dados básicos"
```

### Task C3: gate dos controles de filial no self-view

**Files:**
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/user-detail-actions.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/branches-tab.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/user-branch-card.tsx`

**Interfaces:**
- Consumes (de C5, page.tsx): props `canManageBranches: boolean`, `isSelf: boolean`.
- Produces: `UserDetailActions`, `BranchesTab`, `UserBranchCard` passam a aceitar `canManageBranches`; `UserDetailActions` aceita `isSelf`; controles de vincular/desvincular só quando `canManageBranches` (e edição vira self quando `isSelf`).

- [ ] **Step 1: `UserDetailActions` — self vs admin**

Substituir `apps/web/src/app/dashboard/users/[id]/_components/user-detail-actions.tsx` por:

```tsx
"use client";

import { useActiveTab } from "@/components/entity/entity-client-tabs";
import { EditUserButton } from "./edit-user-button";
import { UserBranchLinkPanel } from "./user-branch-link-panel";

interface Props {
	canManageBranches: boolean;
	isSelf: boolean;
	linkedBranchIds: string[];
	userId: string;
}

export function UserDetailActions({
	userId,
	linkedBranchIds,
	canManageBranches,
	isSelf,
}: Props) {
	const tab = useActiveTab();

	if (tab === "branches") {
		if (!canManageBranches) {
			return null;
		}
		return (
			<UserBranchLinkPanel linkedBranchIds={linkedBranchIds} userId={userId} />
		);
	}
	if (tab === "profile") {
		return <EditUserButton />;
	}
	return null;
}
```

> Nota: o botão de editar em `profile` continua `EditUserButton` aqui; a troca self vs admin é decidida em `page.tsx` (Task C5), que renderiza `UserSelfEditSheet` (self) ou `UserEditSheet` (admin) e passa o botão certo. `EditUserButton` só seta `?edit=1`, servindo aos dois sheets.

- [ ] **Step 2: `BranchesTab` propaga `canUnlink`**

Em `branches-tab.tsx`, trocar a interface e o `map`:

```tsx
interface Props {
	canUnlink: boolean;
	linkedBranches: UserLinkedBranch[];
	userId: string;
}

export function BranchesTab({ userId, linkedBranches, canUnlink }: Props) {
```

e no empty-state, ajustar o texto quando `!canUnlink` (leitura):

```tsx
				<p className="text-muted-foreground text-xs">
					{canUnlink
						? 'Use "Vincular filial" no topo para adicionar.'
						: "Nenhuma filial vinculada a esta conta."}
				</p>
```

e no `map`:

```tsx
				<UserBranchCard
					branch={b}
					canUnlink={canUnlink}
					key={b.id}
					userId={userId}
				/>
```

- [ ] **Step 3: `UserBranchCard` esconde "Desvincular"**

Em `user-branch-card.tsx`, adicionar `canUnlink` à interface e condicionar o footer:

```tsx
interface Props {
	branch: UserLinkedBranch;
	canUnlink: boolean;
	userId: string;
}

export function UserBranchCard({ userId, branch, canUnlink }: Props) {
```

Envolver o `footer={...}` do `BranchStatsCard` para render condicional — passar `undefined` quando `!canUnlink`:

```tsx
		<BranchStatsCard
			address={formatBranchAddress(branch)}
			footer={
				canUnlink ? (
					<div className="flex justify-end border-border border-t px-4 py-2">
						{/* ...AlertDialog "Desvincular" existente, inalterado... */}
					</div>
				) : undefined
			}
```

(mover o bloco `<div className="flex justify-end...">...</AlertDialog></div>` existente para dentro do ternário.)

- [ ] **Step 4: check-types**

Run: `bun --cwd apps/web check-types`
Expected: erros nos calls que ainda não passam as novas props (esperado — resolvidos na Task C5). Se quiser isolar, seguir para C5 antes de commitar.

- [ ] **Step 5: Commit (junto com C5)**

Este task compõe com C5 (page.tsx é quem passa as props). Commitar após C5 para manter o build verde.

### Task C4: gate da aba Segurança + trocar minha senha

**Files:**
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/security-tab.tsx`
- Create: `apps/web/src/app/dashboard/users/[id]/_components/change-my-password-card.tsx`

**Interfaces:**
- Consumes: `authClient.changePassword` de `@/lib/auth-client`; props `isSelf`, `canResetPassword`, `canRevokeSessions` (de C5).
- Produces: `SecurityTab` aceita `isSelf`, `canResetPassword`, `canRevokeSessions`; esconde reset/force-logout salvo `!isSelf && cap`; renderiza `<ChangeMyPasswordCard />` quando `isSelf`.

- [ ] **Step 1: `ChangeMyPasswordCard`**

Criar `change-my-password-card.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import { KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { LabeledField } from "@/components/labeled-field";
import { authClient } from "@/lib/auth-client";
import { notify } from "@/lib/notify";

export function ChangeMyPasswordCard() {
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [pending, start] = useTransition();

	const submit = () =>
		start(async () => {
			if (next.length < 8) {
				notify.error("Nova senha: mínimo 8 caracteres");
				return;
			}
			const res = await authClient.changePassword({
				currentPassword: current,
				newPassword: next,
				revokeOtherSessions: true,
			});
			if (res.error) {
				notify.error("Não foi possível trocar a senha");
				return;
			}
			notify.success("Senha alterada");
			setCurrent("");
			setNext("");
		});

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<CardTitle className="text-base">Trocar minha senha</CardTitle>
				<Button disabled={pending} onClick={submit} size="sm" variant="outline">
					<KeyRound className="size-3.5" />
					Salvar
				</Button>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<LabeledField id="cur-pass" label="Senha atual">
					{(field) => (
						<Input
							{...field}
							onChange={(e) => setCurrent(e.target.value)}
							type="password"
							value={current}
						/>
					)}
				</LabeledField>
				<LabeledField id="new-pass" label="Nova senha">
					{(field) => (
						<Input
							{...field}
							onChange={(e) => setNext(e.target.value)}
							type="password"
							value={next}
						/>
					)}
				</LabeledField>
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Gate no `SecurityTab`**

Em `security-tab.tsx`, estender a interface e condicionar:

```tsx
interface Props {
	canDelete: boolean;
	canResetPassword: boolean;
	canRevokeSessions: boolean;
	isSelf: boolean;
	user: { /* ...igual... */ };
}
```

No corpo, importar `ChangeMyPasswordCard`. Quando `isSelf`, renderizar `<ChangeMyPasswordCard />` no lugar dos cards "Reset de senha" e "Sessões". Envolver o card "Reset de senha" em `{!isSelf && canResetPassword && ( ... )}` e o card "Sessões" (Forçar logout) em `{!isSelf && canRevokeSessions && ( ... )}`. Adicionar, logo após o grid, quando `isSelf`:

```tsx
			{isSelf && <ChangeMyPasswordCard />}
```

(O card "Zona de perigo" com Excluir já é gated por `canDelete` e não muda; para `isSelf`, `canDelete` será `false` na prática — deletar a si mesmo é `SELF_RESTRICTED`.)

- [ ] **Step 3: check-types**

Run: `bun --cwd apps/web check-types`
Expected: erros nos callers sem as novas props (resolvidos em C5).

- [ ] **Step 4: Commit (junto com C5)**

Compor com C5.

### Task C5: `page.tsx` computa e propaga `isSelf`/caps + escolhe o sheet

**Files:**
- Modify: `apps/web/src/app/dashboard/users/[id]/page.tsx`

**Interfaces:**
- Consumes: `can` (já importado); componentes das tasks C2/C3/C4.
- Produces: build verde — todas as props novas preenchidas.

- [ ] **Step 1: Computar flags**

Em `UserDetailPageContent`, após `const canDelete = ...` (linha 53), adicionar:

```ts
	const isSelf = actorSession.user.id === id;
	const [canManageBranches, canResetPassword, canRevokeSessions] =
		await Promise.all([
			can(actorSession, "users.update_branches"),
			can(actorSession, "users.reset_password"),
			can(actorSession, "users.revoke_sessions"),
		]);
```

- [ ] **Step 2: Passar props às tabs**

- Tab "branches" (linha 101): `content: <BranchesTab canUnlink={canManageBranches && !isSelf} linkedBranches={linkedBranches} userId={user.id} />`
- Tab "security" (linha 121): `content: <SecurityTab canDelete={canDelete} canResetPassword={canResetPassword} canRevokeSessions={canRevokeSessions} isSelf={isSelf} user={user} />`
- `UserDetailActions` no header (linha 152): adicionar `canManageBranches={canManageBranches && !isSelf}` e `isSelf={isSelf}`.

- [ ] **Step 3: Escolher o sheet (self vs admin)**

Importar `UserSelfEditSheet`. Trocar o rodapé que hoje sempre renderiza `<UserEditSheet .../>` (linhas 163-172) por:

```tsx
				{isSelf ? (
					<UserSelfEditSheet name={user.name} />
				) : (
					<UserEditSheet
						actorRole={actorSession.user.role as UserRow["role"]}
						user={{
							id: user.id,
							name: user.name,
							role: user.role,
							emailVerified: user.emailVerified,
						}}
					/>
				)}
```

- [ ] **Step 4: Verificar build + testes**

Run: `bun --cwd apps/web check-types`
Expected: sem erros (todas as props preenchidas).
Run: `bun --cwd apps/web test`
Expected: verde.

- [ ] **Step 5: Smoke multi-role no browser (:3008)**

- Como `user`, abrir a própria página (avatar → "Perfil"): aba Filiais SEM "Vincular"/"Desvincular"; aba Segurança SEM reset/force-logout, COM "Trocar minha senha"; header "Perfil" abre "Editar meus dados" (só nome); editar nome funciona; trocar senha funciona.
- Como `admin` abrindo OUTRO usuário: tudo administrativo continua (Vincular/Desvincular, Editar usuário admin, reset/force-logout conforme cap).

- [ ] **Step 6: Commit (C3+C4+C5 juntos)**

```bash
git add apps/web/src/app/dashboard/users/[id]/page.tsx apps/web/src/app/dashboard/users/[id]/_components/user-detail-actions.tsx apps/web/src/app/dashboard/users/[id]/_components/branches-tab.tsx apps/web/src/app/dashboard/users/[id]/_components/user-branch-card.tsx apps/web/src/app/dashboard/users/[id]/_components/security-tab.tsx apps/web/src/app/dashboard/users/[id]/_components/change-my-password-card.tsx
git commit -m "feat: self-view honesto na pagina de usuario"
```

### Task C6: upload de avatar (foto)

Estende C1/C2 para os "dados básicos" incluírem a foto. Bucket público novo `user-avatars` + action self-scoped.

**Files:**
- Infra: bucket `user-avatars` (Supabase — Dashboard ou SQL)
- Modify: `apps/web/src/lib/supabase-server.ts:12-14`
- Modify: `apps/web/src/app/dashboard/users/schema.ts` (estende `updateOwnProfileSchema`)
- Modify: `apps/web/src/app/dashboard/users/actions.ts` (estende `updateOwnProfile` + add `uploadOwnAvatar`)
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/user-self-edit-sheet.tsx`
- Modify: `docs/storage-buckets.md`

**Interfaces:**
- Consumes: `uploadToPublicBucket` de `@/lib/storage`; `USER_AVATARS_BUCKET`; `requireCurrentSession`.
- Produces: `uploadOwnAvatar(formData): Promise<{ ok: true; url } | { ok: false; error }>`; `updateOwnProfile` passa a persistir `image`.

- [ ] **Step 1: Criar o bucket `user-avatars` (infra) + documentar**

Criar bucket público no Supabase (Dashboard → Storage → New bucket: `user-avatars`, Public ON, limit 5MB, MIME `image/png,image/jpeg,image/webp`), ou via SQL:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-avatars','user-avatars',true,5242880,
  ARRAY['image/png','image/jpeg','image/webp']);
```

Adicionar uma seção `## user-avatars` em `docs/storage-buckets.md` espelhando `## tool-images` (público, upload server-side via `supabaseAdmin`, validação 2MB, path `<userId>/<uuid>.<ext>`, URL salva em `user.image`).

- [ ] **Step 2: Constante do bucket**

Em `apps/web/src/lib/supabase-server.ts`, após linha 14:

```ts
export const USER_AVATARS_BUCKET = "user-avatars";
```

- [ ] **Step 3: Estender schema + action para `image`**

Em `schema.ts`, trocar `updateOwnProfileSchema` (da Task C1) por:

```ts
export const updateOwnProfileSchema = z.object({
	name: z.string().min(2, "Informe seu nome").max(100).optional(),
	image: z.string().url().nullable().optional(),
});
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
```

Em `actions.ts`, no corpo de `updateOwnProfile` (Task C1), trocar o bloco que monta e aplica o update por:

```ts
	const update: { name?: string; image?: string | null } = {};
	if (parsed.data.name !== undefined) {
		update.name = parsed.data.name;
	}
	if (parsed.data.image !== undefined) {
		update.image = parsed.data.image;
	}
	if (Object.keys(update).length === 0) {
		return { ok: true, data: undefined };
	}
	try {
		await db
			.update(userTable)
			.set(update)
			.where(eq(userTable.id, session.user.id));
	} catch (error) {
		logger.error("updateOwnProfile falhou", error);
		return { ok: false, error: "Não foi possível atualizar" };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.self_updated",
		targetType: "user",
		targetId: session.user.id,
		metadata: { changes: update },
	});
	revalidatePath(`${USERS_PATH}/${session.user.id}`);
	return { ok: true, data: undefined };
```

O teste `update-own-profile.test.ts` (C1) segue válido: com só `name`, `set` é chamado com `{ name: "Novo Nome" }`.

- [ ] **Step 4: Action `uploadOwnAvatar`**

Em `actions.ts`, adicionar ao import de `@/lib/storage` (criar se não houver) `uploadToPublicBucket`, e `USER_AVATARS_BUCKET` de `@/lib/supabase-server`. No topo do módulo, consts:

```ts
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
```

Action:

```ts
export async function uploadOwnAvatar(
	formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
	const session = await requireCurrentSession();
	if (session.user.status !== "active") {
		return { ok: false, error: "Conta não ativa" };
	}
	try {
		const { url } = await uploadToPublicBucket({
			bucket: USER_AVATARS_BUCKET,
			prefix: session.user.id,
			formData,
			maxSizeBytes: AVATAR_MAX_BYTES,
			allowedTypes: AVATAR_TYPES,
		});
		return { ok: true, url };
	} catch (error) {
		logger.error("uploadOwnAvatar falhou", error);
		return { ok: false, error: "Não foi possível enviar a imagem" };
	}
}
```

- [ ] **Step 5: Avatar no `UserSelfEditSheet`**

Estender `UserSelfEditSheet` (Task C2) para receber `image: string | null`. Estado `const [image, setImage] = useState(initialImage)`. Adicionar um input `type="file"` (accept `image/png,image/jpeg,image/webp`) que ao mudar chama `uploadOwnAvatar(formData)` e, no sucesso, `setImage(res.url)` + preview via `next/image` (ou `<Avatar>` de `@emach/ui`). No `handleSubmit`, incluir `image` no `safeParse`: `updateOwnProfileSchema.safeParse({ name, image })`. Passar `image={user.image}` no call em `page.tsx` (ramo `isSelf`).

Código do handler de upload:

```tsx
	const [uploading, setUploading] = useState(false);
	const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}
		setUploading(true);
		const fd = new FormData();
		fd.set("file", file);
		const res = await uploadOwnAvatar(fd);
		setUploading(false);
		if (res.ok) {
			setImage(res.url);
		} else {
			notify.error(res.error);
		}
	};
```

(importar `uploadOwnAvatar` de `../../actions`.)

- [ ] **Step 6: Verificar + commit**

Run: `bun --cwd apps/web test update-own-profile.test.ts` → PASS.
Run: `bun --cwd apps/web check-types` → sem erros.
Smoke (:3008): como `user`, "Editar meus dados" → trocar foto (upload + preview) e salvar → avatar atualiza no header.

```bash
git add apps/web/src/lib/supabase-server.ts apps/web/src/app/dashboard/users/schema.ts apps/web/src/app/dashboard/users/actions.ts apps/web/src/app/dashboard/users/[id]/_components/user-self-edit-sheet.tsx apps/web/src/app/dashboard/users/[id]/page.tsx docs/storage-buckets.md
git commit -m "feat: upload de avatar self-service"
```

### Task C7: verificação da fase

- [ ] **Step 1: `bun verify`**

Run: `bun verify`
Expected: check-types + check (ultracite) + test verdes. Corrigir lint (ex: nested-ternary no rodapé — se acusar, extrair para variável) e re-rodar.

- [ ] **Step 2: `bun run build` (gate de "use server")**

Run: `bun --cwd apps/web run build`
Expected: build ok. (Mexemos em `actions.ts` — garantir que nada não-async foi re-exportado de arquivo `"use server"`.)

---

## Fase D — Troca de e-mail self-service (maior risco, isolada)

> ⚠️ Toca o pacote de auth compartilhado (`@emach/auth/dashboard`) — invariantes P0 (raiz `CLAUDE.md`). Entregar só após A–C revisadas. Se o setup pesar, esta fase pode ficar como sub-entrega/issue separada sem bloquear o resto.

### Task D1: habilitar `changeEmail` no Better Auth do dashboard

**Files:**
- Modify: `packages/auth/src/dashboard.ts:39-54`
- Ref para o template: `@emach/email` (mesmo pacote de `sendPasswordResetEmail`/`sendInviteEmail`)

**Interfaces:**
- Produces: `authClient.changeEmail({ newEmail, callbackURL })` passa a existir; verificação enviada ao **novo** e-mail antes de aplicar.

- [ ] **Step 1: Criar o template de verificação de troca**

Em `@emach/email` (espelhar a assinatura de `sendPasswordResetEmail` em `packages/email/src/send.ts`), adicionar `sendChangeEmailVerification({ to, url })`. Ler o arquivo de `send.ts` e replicar o padrão (template + provider). Expected: função exportada análoga.

- [ ] **Step 2: Ligar no config**

Em `packages/auth/src/dashboard.ts`, estender o bloco `user` (linha 39):

```ts
	user: {
		changeEmail: {
			enabled: true,
			sendChangeEmailVerification: async ({ newEmail, url }) => {
				await sendChangeEmailVerification({ to: newEmail, url });
			},
		},
		additionalFields: {
			/* ...role e status inalterados... */
		},
	},
```

Adicionar `sendChangeEmailVerification` ao import de `@emach/email/send` no topo.

- [ ] **Step 3: check-types + build do pacote**

Run: `bun --cwd packages/auth check-types` (ou `bun check-types` na raiz).
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add packages/auth/src/dashboard.ts packages/email/src
git commit -m "feat: habilita troca de e-mail no auth do dashboard"
```

### Task D2: UI de troca de e-mail no self-edit

**Files:**
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/user-self-edit-sheet.tsx`

**Interfaces:**
- Consumes: `authClient.changeEmail`.
- Produces: campo "E-mail" no sheet self; ao mudar, dispara `changeEmail` e avisa que um link de confirmação foi enviado ao novo endereço.

- [ ] **Step 1: Adicionar campo e-mail + submissão**

Estender `UserSelfEditSheet` recebendo `email: string`. Adicionar `LabeledField` "E-mail" (`type="email"`). No `handleSubmit`, se o e-mail mudou, chamar:

```ts
			const res = await authClient.changeEmail({
				newEmail: email,
				callbackURL: "/dashboard",
			});
			if (res.error) {
				notify.error("Não foi possível iniciar a troca de e-mail");
				return;
			}
			notify.success("Enviamos um link de confirmação ao novo e-mail");
```

(Nome continua via `updateOwnProfile`; e-mail via `changeEmail` — duas chamadas, cada uma com seu feedback.)

- [ ] **Step 2: Passar `email` em `page.tsx`**

Em `page.tsx`, no ramo `isSelf`: `<UserSelfEditSheet email={user.email} name={user.name} />`.

- [ ] **Step 3: check-types + smoke**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.
Smoke: como `user`, mudar o próprio e-mail no sheet → toast de confirmação; checar recebimento do link no novo endereço (em dev, conferir log do provider de e-mail).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/_components/user-self-edit-sheet.tsx apps/web/src/app/dashboard/users/[id]/page.tsx
git commit -m "feat: troca de e-mail self-service"
```

### Task D3: verificação final da fase D

- [ ] **Step 1: `bun verify` + build**

Run: `bun verify && bun --cwd apps/web run build`
Expected: verdes.

- [ ] **Step 2: Smoke de invariante de auth**

Confirmar que dashboard e ecommerce seguem isolados (nenhum import cruzado novo); a troca de e-mail atua só na instância dashboard. Conferir que o `.env` do dashboard tem a URL de callback correta.

---

## Self-Review (cobertura do spec)

- **Fix 1 (Filiais admin-only):** Tasks B1 (cap SAU→SA) + B2 (nav gate). ✓
- **Fix 2 (shell honesta + minha conta):** C1 (action nome), C2 (sheet self), C3 (gate filiais), C4 (gate segurança + trocar senha), C5 (page wiring + escolha de sheet), C6 (upload de avatar), C7 (verify/build). E-mail em D1–D2. ✓
- **Fix 3 (P0 escopo):** A1 (orders), A2 (activity wrappers), A3 (guard de página). ✓
- **Regra do usuário "esconder, não desabilitar":** C3/C4 removem (não desabilitam) os controles. ✓
- **Ordem por risco:** A (P0) → B → C → D (e-mail). ✓
- **Dados básicos (nome + foto + e-mail):** nome (C1/C2), foto (C6), senha (C4), e-mail (D1–D2). ✓ Foto depende do bucket `user-avatars` (infra manual no Supabase — Task C6 Step 1).
