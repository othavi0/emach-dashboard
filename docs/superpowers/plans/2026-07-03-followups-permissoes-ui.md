# Follow-ups de permissões de UI — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os follow-ups de acabamento da leva de permissões de UI (PR #289): hardening de teste do self-scope, cleanup de avatar antigo, label do self-view, unificação do gating `!isSelf`, e limpezas menores.

**Architecture:** Três tasks agrupadas por arquivo/overlap. Task 1 endurece `updateOwnProfile` (cleanup de avatar + teste do invariante self-scope). Task 2 limpa o sheet de auto-edição (`.catch` morto + enviar só o campo mudado). Task 3 faz o polish da página de detalhe (label "Editar meus dados" + unificação do `!isSelf`), tocando `page.tsx` e componentes irmãos de uma vez para evitar conflito.

**Tech Stack:** Next 16 / React 19 (Server Components + server actions), Drizzle, Better Auth, Zod, Vitest (env node, `@emach/db` mockado), Supabase Storage.

## Global Constraints

- Server action: `"use server"` no topo + guard como primeira instrução. Retorno `ActionResult`. `revalidatePath` após mutação. (`apps/web/CLAUDE.md`)
- `updateOwnProfile` é self-scoped: só toca `session.user.id`, só `name`/`image`, NUNCA `role`/`status`/`emailVerified` nem aceita `userId` de input. **Invariante a preservar.**
- Anti-patterns proibidos: `console.*` (usar `logger`), `: any`/`as any`/`@ts-*`, `key={index}`, `<img>` puro, `forwardRef`, `useMemo`/`useCallback` manuais.
- Cleanup de storage é **best-effort**: try/catch + `logger.error`, nunca quebra a action (padrão de `deleteToolImage`).
- Testes: `bun --cwd apps/web test <arquivo>` (vitest node). Mock de `@emach/db` por `vi.hoisted` + `vi.mock`; módulos `server-only` resolvidos por alias no `vitest.config.ts`.
- Verificação antes de PR: `bun verify` (check-types + check + test) + `bun --cwd apps/web run build`. Conventional Commits em PT, subject ≤50 chars.
- Smoke: dev server em `localhost:3008` (role `user` logado cobre o self-view; admin-gerencia-outro exige QA à parte).

---

### Task 1: `updateOwnProfile` — cleanup de avatar + teste de self-scope

**Files:**
- Modify: `apps/web/src/app/dashboard/users/actions.ts` (`updateOwnProfile`, ~L416-453)
- Test: `apps/web/src/app/dashboard/users/__tests__/update-own-profile.test.ts`

**Interfaces:**
- Consumes: `removeStorageObject`, `extractPublicUrlPath` de `@/lib/storage`; `USER_AVATARS_BUCKET` de `@/lib/supabase-server`; `db`, `user as userTable`, `eq`, `logger`, `logUserActivity`, `revalidatePath` (já importados em `actions.ts`).
- Produces: `updateOwnProfile` inalterado na assinatura (`(input: unknown) => Promise<ActionResult>`); passa a deletar o avatar antigo do bucket quando substituído.

- [ ] **Step 1: Reescrever o teste com os novos mocks + asserções (RED)**

Substituir `apps/web/src/app/dashboard/users/__tests__/update-own-profile.test.ts` por:

```ts
import { user as userTable } from "@emach/db/schema/auth";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ requireCurrentSession: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logUserActivity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@emach/auth/dashboard", () => ({
	authDashboard: { $context: Promise.resolve({}) },
}));

// Spia `eq` mantendo o comportamento real — permite assertar o self-scope
// (`.where(eq(userTable.id, session.user.id))`) sem reconstruir o SQL.
vi.mock("drizzle-orm", async (importOriginal) => {
	const actual = await importOriginal<typeof import("drizzle-orm")>();
	return { ...actual, eq: vi.fn(actual.eq) };
});

// Cleanup de avatar: `updateOwnProfile` lê o image atual e remove o antigo.
vi.mock("@/lib/storage", () => ({
	removeStorageObject: vi.fn(),
	extractPublicUrlPath: vi.fn((url: string) => url.split("/").pop() ?? null),
	uploadToPublicBucket: vi.fn(),
}));

const { setSpy, whereSpy } = vi.hoisted(() => {
	const whereSpy = vi.fn();
	return { setSpy: vi.fn().mockReturnValue({ where: whereSpy }), whereSpy };
});
// `db.select(...).from(...).where(...).limit(...)` → [{ image }]; `db.update(...).set(...).where(...)`.
const { currentImage } = vi.hoisted(() => ({ currentImage: { v: null as string | null } }));
vi.mock("@emach/db", () => ({
	db: {
		update: vi.fn().mockReturnValue({ set: setSpy }),
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ image: currentImage.v }]),
				}),
			}),
		}),
	},
}));

import { logUserActivity } from "@/lib/activity";
import { removeStorageObject } from "@/lib/storage";
import { requireCurrentSession } from "@/lib/session";
import { updateOwnProfile } from "../actions";

const session = (over = {}) => ({ user: { id: "u1", status: "active", ...over } });

describe("updateOwnProfile", () => {
	it("bloqueia conta não ativa", async () => {
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(
			session({ status: "suspended" }) as never
		);
		const r = await updateOwnProfile({ name: "Novo" });
		expect(r.ok).toBe(false);
	});

	it("atualiza só o próprio nome (self-scope) e audita", async () => {
		currentImage.v = null;
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(session() as never);
		const r = await updateOwnProfile({ name: "Novo Nome" });
		expect(r.ok).toBe(true);
		expect(setSpy).toHaveBeenCalledWith({ name: "Novo Nome" });
		// self-scope: o WHERE do UPDATE mira o próprio id.
		expect(eq).toHaveBeenCalledWith(userTable.id, "u1");
		expect(whereSpy).toHaveBeenCalled();
		// auditoria: log com actorUserId = self e action correta.
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				actorUserId: "u1",
				action: "user.self_updated",
				targetId: "u1",
			})
		);
		// sem troca de foto → nenhum cleanup de storage.
		expect(removeStorageObject).not.toHaveBeenCalled();
	});

	it("remove o avatar antigo quando a foto muda", async () => {
		currentImage.v = "https://x.supabase.co/storage/v1/object/public/user-avatars/old.png";
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(session() as never);
		const r = await updateOwnProfile({
			image: "https://x.supabase.co/storage/v1/object/public/user-avatars/new.png",
		});
		expect(r.ok).toBe(true);
		expect(removeStorageObject).toHaveBeenCalledWith("user-avatars", "old.png");
	});

	it("não remove nada quando a foto é a mesma", async () => {
		const same = "https://x.supabase.co/storage/v1/object/public/user-avatars/same.png";
		currentImage.v = same;
		vi.mocked(requireCurrentSession).mockResolvedValueOnce(session() as never);
		await updateOwnProfile({ image: same });
		expect(removeStorageObject).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test update-own-profile.test.ts`
Expected: FAIL — "remove o avatar antigo quando a foto muda" falha (`updateOwnProfile` ainda não lê o image atual nem chama `removeStorageObject`); pode falhar tb "não remove nada" se `db.select` não existir.

- [ ] **Step 3: Implementar o cleanup**

Em `apps/web/src/app/dashboard/users/actions.ts`, adicionar aos imports do topo:

```ts
import {
	extractPublicUrlPath,
	removeStorageObject,
} from "@/lib/storage";
import { USER_AVATARS_BUCKET } from "@/lib/supabase-server";
```

(Se `@/lib/storage` já for importado para `uploadToPublicBucket`, juntar os nomes no mesmo import.)

Substituir o corpo de `updateOwnProfile` (de `const update` até o `return`) por:

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

	// Lê o avatar atual ANTES do update para limpar o antigo do bucket depois.
	let previousImage: string | null = null;
	if (update.image !== undefined) {
		const [current] = await db
			.select({ image: userTable.image })
			.from(userTable)
			.where(eq(userTable.id, session.user.id))
			.limit(1);
		previousImage = current?.image ?? null;
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

	// Best-effort: remove o avatar antigo se foi substituído por um novo.
	if (
		update.image !== undefined &&
		previousImage &&
		previousImage !== update.image
	) {
		const path = extractPublicUrlPath(previousImage, USER_AVATARS_BUCKET);
		if (path) {
			try {
				await removeStorageObject(USER_AVATARS_BUCKET, path);
			} catch (error) {
				logger.error("updateOwnProfile: falha ao remover avatar antigo", error);
			}
		}
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

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test update-own-profile.test.ts`
Expected: PASS (4 testes).
Run: `bun --cwd apps/web check-types`
Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/actions.ts apps/web/src/app/dashboard/users/__tests__/update-own-profile.test.ts
git commit -m "feat: cleanup de avatar antigo + teste self-scope"
```

---

### Task 2: Self-edit sheet — limpar `.catch` morto + enviar só o campo mudado

**Files:**
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/user-self-edit-sheet.tsx`

**Interfaces:**
- Consumes: `updateOwnProfile` (Task 1, inalterado na assinatura — aceita `{ name?, image? }`).
- Produces: nenhuma interface nova; comportamento interno do submit refinado.

- [ ] **Step 1: `.catch` morto → `void` (#6)**

Em `user-self-edit-sheet.tsx`, o `onChange` do input de foto (linhas ~177-179) é:

```tsx
						onChange={(e) => {
							onPickAvatar(e).catch(() => undefined);
						}}
```

`onPickAvatar` já trata o próprio erro (`notify.error` no ramo `!res.ok`) e não relança. Trocar por:

```tsx
						onChange={(e) => {
							void onPickAvatar(e);
						}}
```

- [ ] **Step 2: Enviar só o campo mudado (#7)**

No `handleSubmit`, o bloco que chama `updateOwnProfile` (linhas ~110-121) monta `{ name, image }` sempre. Trocar por um payload que inclui só o que mudou:

```tsx
			if (profileChanged) {
				const payload: { name?: string; image?: string | null } = {};
				if (name !== initialName) {
					payload.name = parsed.data.name;
				}
				if (image !== initialImage) {
					payload.image = parsed.data.image;
				}
				const res = await updateOwnProfile(payload);
				if (res.ok) {
					notify.success("Dados atualizados");
				} else {
					ok = false;
					notify.error(res.error);
				}
			}
```

(`profileChanged = name !== initialName || image !== initialImage` já existe acima — inalterado. O `payload` sempre terá ≥1 chave quando `profileChanged` é true.)

- [ ] **Step 3: Verificar**

Run: `bun --cwd apps/web check-types`
Expected: limpo.
Run: `bun --cwd apps/web test`
Expected: 628+ verde (nada quebra).
Run: `bun check` (ou confiar no hook) — sem novo warning de floating-promise no `void onPickAvatar(e)`.

- [ ] **Step 4: Smoke**

Com o dev server em :3008, logado como `user`: abrir "Editar meus dados" (`?edit=1`), mudar SÓ o nome e salvar → toast "Dados atualizados", sem erro; reabrir e trocar SÓ a foto → preview atualiza e salva. (Confirma que enviar subconjunto funciona.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/_components/user-self-edit-sheet.tsx
git commit -m "refactor: sheet envia so o campo mudado + void"
```

---

### Task 3: Polish da página — label "Editar meus dados" + unificar `!isSelf`

**Files:**
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/edit-user-button.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/user-detail-actions.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/security-tab.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/page.tsx`

**Interfaces:**
- Consumes: `isSelf`, `canResetPassword`, `canRevokeSessions` já computados em `page.tsx`.
- Produces: `EditUserButton` aceita `label?: string`; `UserDetailActions` aceita `editLabel: string`; `SecurityTab` passa a receber `canResetPassword`/`canRevokeSessions` já pré-gated por `!isSelf`.

- [ ] **Step 1: `EditUserButton` aceita `label` (#3)**

Em `edit-user-button.tsx`, o botão tem o texto fixo "Editar Usuário". Adicionar prop `label` (default preserva o texto atual):

```tsx
export function EditUserButton({ label = "Editar Usuário" }: { label?: string }) {
	// ...resto inalterado (useRouter/usePathname/useSearchParams, handleEdit)...
	return (
		<Button onClick={handleEdit} size="sm" variant="outline">
			<Pencil aria-hidden className="mr-1.5 size-3.5" />
			{label}
		</Button>
	);
}
```

- [ ] **Step 2: `UserDetailActions` repassa `editLabel` (#3)**

Em `user-detail-actions.tsx`, estender a interface `Props` com `editLabel: string`, desestruturar, e passar ao `EditUserButton` na aba "profile":

```tsx
interface Props {
	canManageBranches: boolean;
	editLabel: string;
	linkedBranchIds: string[];
	userId: string;
}

export function UserDetailActions({
	userId,
	linkedBranchIds,
	canManageBranches,
	editLabel,
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
		return <EditUserButton label={editLabel} />;
	}
	return null;
}
```

- [ ] **Step 3: `SecurityTab` usa os caps já pré-gated (#5)**

Em `security-tab.tsx`, as duas condições hoje são `{!isSelf && canResetPassword && (...)}` (L121) e `{!isSelf && canRevokeSessions && (...)}` (L143). Como o `page.tsx` passará esses caps já multiplicados por `!isSelf` (Step 4), simplificar para:

```tsx
					{canResetPassword && (
```
e
```tsx
					{canRevokeSessions && (
```

`isSelf` permanece na `Props` e é usado só em `{isSelf && <ChangeMyPasswordCard />}` (L166, inalterado). NÃO remover `isSelf` da interface.

- [ ] **Step 4: `page.tsx` — computa label + pré-gate dos caps de segurança (#3 + #5)**

Em `page.tsx`, após `const isSelf = ...` (L54), adicionar:

```ts
	const editLabel = isSelf ? "Editar meus dados" : "Editar usuário";
```

No `<SecurityTab .../>` (L142-149), trocar `canResetPassword={canResetPassword}` e `canRevokeSessions={canRevokeSessions}` por:

```tsx
					canResetPassword={!isSelf && canResetPassword}
					canRevokeSessions={!isSelf && canRevokeSessions}
```

No `<UserDetailActions .../>` (L181-185), adicionar a prop `editLabel`:

```tsx
								<UserDetailActions
									canManageBranches={canManageBranches && !isSelf}
									editLabel={editLabel}
									linkedBranchIds={linkedBranches.map((b) => b.id)}
									userId={user.id}
								/>
```

- [ ] **Step 5: Verificar**

Run: `bun --cwd apps/web check-types`
Expected: limpo (todas as props preenchidas).
Run: `bun --cwd apps/web test`
Expected: 628+ verde.

- [ ] **Step 6: Smoke nos DOIS modos (#5 é o de maior risco)**

Dev server :3008. **Self-view** (logado como `user`, própria página): header "Editar meus dados"; aba Segurança SEM Reset/Forçar-logout, COM "Trocar minha senha". **Admin-gerencia-outro** (QA à parte, se disponível): header "Editar usuário"; aba Segurança COM Reset/Forçar-logout conforme capability. Se não houver sessão admin, registrar que o modo admin foi validado só por leitura do código (a lógica pré-gated colapsa para `cap` sozinho quando `isSelf=false`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/_components/edit-user-button.tsx apps/web/src/app/dashboard/users/[id]/_components/user-detail-actions.tsx apps/web/src/app/dashboard/users/[id]/_components/security-tab.tsx apps/web/src/app/dashboard/users/[id]/page.tsx
git commit -m "polish: label self-view + unifica gating !isSelf"
```

---

### Task 4: Gate final + nota de QA do e-mail (#1)

**Files:**
- (nenhum código — verificação + doc)

- [ ] **Step 1: `bun verify` + build**

Run: `bun verify`
Expected: check-types limpo + ultracite (só os 2 infos pré-existentes de `lazy-tab.tsx`/`entity-client-tabs.tsx`) + testes verdes.
Run: `bun --cwd apps/web run build`
Expected: build ok.

- [ ] **Step 2: Nota de QA do e-mail no PR (#1)**

O fluxo de troca de e-mail (double opt-in) segue SEM teste automatizado — decisão consciente (integração contra Better Auth é cara; unit das send-fns é raso). Registrar no corpo do PR (ou num comentário) que a validação é **QA manual**: trocar o próprio e-mail no sheet → confirmar recebimento do link no e-mail ATUAL (via Resend) → clicar → confirmar recebimento no e-mail NOVO → clicar → e-mail trocado. Sem alteração de código.

---

## Self-Review (cobertura do spec)

- **#2 (teste self-scope + log):** Task 1 Step 1 (asserção `eq(userTable.id,"u1")` + `logUserActivity`). ✓
- **#3 (label):** Task 3 Steps 1-2-4 (`EditUserButton.label` + `editLabel` em page/actions). ✓
- **#4 (cleanup no save):** Task 1 Step 3 (`removeStorageObject` best-effort pós-commit). ✓
- **#5 (unificar `!isSelf`):** Task 3 Steps 3-4 (pré-gate em page.tsx, SecurityTab simplificado). ✓
- **#6 (`.catch` morto):** Task 2 Step 1 (`void onPickAvatar`). ✓
- **#7 (só campo mudado):** Task 2 Step 2 (payload condicional). ✓
- **#1 (teste e-mail):** fora de escopo → Task 4 Step 2 (nota de QA manual). ✓
- **Invariante self-scope preservado:** Task 1 mantém `.where(eq(id, self))` + só `name`/`image`. ✓
- **Overlap de `page.tsx` (#3+#5):** resolvido juntando em Task 3. ✓
