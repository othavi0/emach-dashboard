# `/dashboard/users` — Completar Fluxo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as 13 lacunas mapeadas no grilling de 2026-05-26 sobre `/dashboard/users`: ações órfãs (suspend/reactivate/delete) sem UI, bug P0 de branch-scoping em link/unlink, aba Atividade limitada, audit que apaga em cascade, ApprovalSheet com roles hardcoded, branches editáveis em dois lugares, sessão não-revogada em role-change, falta de bulk-reject, paginação fake do feed e o quirk de `audit.read`.

**Architecture:** Implementação em 7 fases sequenciais. Fase 1 é fundação (schema, types, fix de bugs pequenos sem UI). Fase 2 enxuga o Edit Sheet. Fase 3 generaliza o ApprovalSheet. Fase 4 expõe ações órfãs via header (kebab) + Danger Zone na aba Perfil, usando AlertDialog do `@emach/ui`. Fase 5 reescreve a aba Atividade com sub-tabs "Feito por" / "Feito com". Fase 6 entrega bulk-reject. Fase 7 é smoke + docs. Todas as mutations destrutivas exigem reason min 10 chars, persistido em `metadata.reason`.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), React 19 (Compiler ativo), Drizzle ORM 0.45, Better Auth 1.6.11, Zod 4, Vitest, Biome/Ultracite, Tailwind 4, base-ui (DropdownMenu, AlertDialog, Checkbox).

---

## Convenções e referências cross-task

- **Rodar testes:** `bun --filter web test -- <pattern>`. Watch: `bun --filter web test -- --watch`.
- **Rodar check-types:** `bun check-types`. Falhas de TS aparecem por workspace.
- **Aplicar schema:** `bun db:sync` (push + triggers). NUNCA `bun db:push` puro.
- **Auto-formatter ativo via hook PostToolUse:** pode reordenar imports/campos. Se um `Edit` seguinte falhar por `old_string` não bater, **releia o arquivo** antes de tentar de novo (regra documentada na raiz `CLAUDE.md`).
- **Logger:** `apps/web/src/lib/logger.ts` — NUNCA `console.*`.
- **Padrão de server action:** `"use server"` + `requireCapabilityWithContext(cap, { targetUserId, targetBranchIds })` no topo + `safeParse` Zod + `try/catch` com `logger.error` + `revalidatePath`. Retorno `ActionResult<T>` em `apps/web/src/app/dashboard/users/actions.ts:34`.
- **Logging de auditoria:** após mutações de user, `logUserActivity({ actorUserId, action, targetType: "user", targetId, metadata })` em `apps/web/src/lib/activity.ts`.
- **Capabilities relevantes:** `users.approve`, `users.update_role`, `users.update_branches`, `users.suspend`, `users.delete`, `users.reset_password`, `users.revoke_sessions`. Matriz em `apps/web/src/lib/permissions.ts`.
- **AlertDialog do projeto:** `@emach/ui/components/alert-dialog` — wrapper base-ui. Importar `AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel`.
- **DropdownMenu do projeto:** `@emach/ui/components/dropdown-menu`. Importar `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator`.
- **Commit style:** Conventional Commits em PT, subject ≤ 50 chars.

## File Structure

### Arquivos a criar

| Path | Responsabilidade |
|---|---|
| `apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx` | AlertDialog reutilizável com textarea de `reason` (min 10 quando obrigatório). Usado por Suspend/Delete. |
| `apps/web/src/app/dashboard/users/[id]/_components/user-actions-menu.tsx` | Kebab no header: Suspender/Reativar (contextual por status). |
| `apps/web/src/app/dashboard/users/[id]/_components/danger-zone.tsx` | Card vermelho no rodapé da aba Perfil com "Excluir usuário". |
| `apps/web/src/app/dashboard/users/[id]/_components/activity-by-user-view.tsx` | View "Feito por" (extrai da `ActivityTab` atual). |
| `apps/web/src/app/dashboard/users/[id]/_components/activity-affecting-user-view.tsx` | View "Feito com" (nova). |
| `apps/web/src/app/dashboard/users/_components/bulk-pending-selection.tsx` | Wrapper client que gerencia multi-select + bulk-reject. |
| `apps/web/__tests__/users-schema.test.ts` | Testes de Zod para approve/update/reject/suspend/delete schemas com `reason`. |
| `apps/web/__tests__/users-approval-roles.test.ts` | Testes de helper `allowedApprovalRoles(actorRole)`. |
| `apps/web/src/app/dashboard/users/_lib/approval-roles.ts` | Helper puro: roles que um ator pode atribuir. |

### Arquivos a modificar

| Path | Mudança |
|---|---|
| `packages/db/src/schema/user-activity.ts` | `actorUserId` vira nullable + `onDelete: 'set null'`. |
| `apps/web/src/lib/activity.ts` | Cachear `actorName` em `metadata.actorName` no insert. |
| `apps/web/src/lib/permissions.ts` | Remover `"audit.read"` de `SUPER_ADMIN_EXCLUSIVE`. |
| `apps/web/__tests__/permissions.test.ts` | Caso novo: `admin` tem `audit.read`. |
| `apps/web/src/app/dashboard/users/actions.ts` | Fix scoping em link/unlink; reason em suspend/delete/reject; revogar sessões em role-change; `bulkRejectUsers`; cache `actorName` antes do delete. |
| `apps/web/src/app/dashboard/users/schema.ts` | `reason` em suspendSchema, deleteSchema; `bulkRejectSchema`. |
| `apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx` | Remover combobox de branches; manter nome + role. |
| `apps/web/src/app/dashboard/users/_components/approval-sheet.tsx` | `allowedRoles` calculado por capability do ator. |
| `apps/web/src/app/dashboard/users/[id]/page.tsx` | Renderizar `<UserActionsMenu>` no header e `<DangerZone>` no rodapé do tab Perfil. |
| `apps/web/src/app/dashboard/users/[id]/_components/user-identity.tsx` | Receber `actions` extras (kebab) ao lado de Editar. |
| `apps/web/src/app/dashboard/users/[id]/_components/activity-tab.tsx` | Substituir conteúdo por sub-tabs. |
| `apps/web/src/app/dashboard/users/[id]/_components/profile-tab.tsx` | Adicionar `<DangerZone>` no rodapé. |
| `apps/web/src/app/dashboard/users/data.ts` | Nova função `getUserAffectedActivity`; paginação real em `getRecentUserActivity` se necessário. |
| `apps/web/src/app/dashboard/users/_components/users-pending-card.tsx` | Multi-select e bulk-reject. |
| `apps/web/CLAUDE.md` | Substituir aviso "fix pendente" por estado pós-aplicado. |

---

## Fase 1 — Fundação (schema, types, fixes sem UI)

### Task 1: Schema — `user_activity_log.actor_user_id` vira nullable + `set null`

Implementa ADR-0011. Hoje `onDelete: 'cascade'` apaga histórico do user deletado.

**Files:**
- Modify: `packages/db/src/schema/user-activity.ts:10-12`

- [ ] **Step 1: Editar o schema**

Substituir:

```ts
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
```

Por:

```ts
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
```

- [ ] **Step 2: Aplicar no banco**

Run: `bun db:sync`

Expected: aviso `drizzle-kit` de mudança de constraint NOT NULL → NULL + alteração de FK; aceitar (TTY interativo). Sem perda de dados (cascade vira set null, NOT NULL → NULL é compatível).

Se rodar via subagent sem TTY, ver fallback em `packages/db/CLAUDE.md` ("Drop & recreate em dev").

- [ ] **Step 3: Atualizar tipos consumidores**

Run: `bun check-types`

Expected: erros em qualquer `.actorUserId` que assume `string` direto. Esperado pelo menos:
- `apps/web/src/app/dashboard/users/data.ts:281` — `getUserActivity` usa `eq(userActivityLog.actorUserId, userId)` — continua válido (eq aceita nullable).
- `apps/web/src/app/dashboard/users/actions.ts` em `fetchUserActivityFeedPage` / `getRecentUserActivity` — `actorUserId` na join continua válido.

Se `check-types` reclamar em ponto onde tratamos `actorName` como `string`, transformar em `string | null` no mapeamento.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/user-activity.ts
git commit -m "feat(db): actor_user_id nullable + set null (ADR-0011)"
```

### Task 2: `logUserActivity` cacheia `actorName` em metadata

Snapshot imutável pra audit sobreviver ao delete (ADR-0011).

**Files:**
- Modify: `apps/web/src/lib/activity.ts` (todo)

- [ ] **Step 1: Reescrever `activity.ts`**

```ts
import "server-only";

import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { userActivityLog } from "@emach/db/schema/user-activity";
import { eq } from "drizzle-orm";

import { logger } from "./logger";

export interface LogUserActivityInput {
	action: string;
	actorUserId: string;
	metadata?: Record<string, unknown>;
	targetId?: string;
	targetType?: string;
}

export async function logUserActivity(
	input: LogUserActivityInput
): Promise<void> {
	try {
		const [actor] = await db
			.select({ name: userTable.name })
			.from(userTable)
			.where(eq(userTable.id, input.actorUserId))
			.limit(1);

		const metadata = {
			...(input.metadata ?? {}),
			actorName: actor?.name ?? null,
		};

		await db.insert(userActivityLog).values({
			id: crypto.randomUUID(),
			actorUserId: input.actorUserId,
			action: input.action,
			targetType: input.targetType ?? null,
			targetId: input.targetId ?? null,
			metadata,
		});
	} catch (err) {
		logger.error("logUserActivity", err);
	}
}
```

- [ ] **Step 2: Verificar consumidores de `metadata`**

Run: `ugrep -rn "metadata\.actorName\|metadata\?\.actorName" apps/web/src`

Expected: nenhum hit hoje (campo novo). Documentar para si: feeds renderizam fallback `metadata.actorName ?? "—"` quando `actorUserId IS NULL`.

- [ ] **Step 3: Run check-types**

Run: `bun check-types`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/activity.ts
git commit -m "feat(activity): snapshot actorName em metadata"
```

### Task 3: Fix `audit.read` — admin herda

Remove de `SUPER_ADMIN_EXCLUSIVE`. Test-first.

**Files:**
- Modify: `apps/web/src/lib/permissions.ts:144-148`
- Modify: `apps/web/__tests__/permissions.test.ts`

- [ ] **Step 1: Adicionar teste que falha**

Em `apps/web/__tests__/permissions.test.ts`, adicionar dentro do `describe("super_admin caps", ...)` (linha ~82):

```ts
	it("admin herda audit.read", () => {
		expect(can("admin", "audit.read")).toBe(true);
	});
```

- [ ] **Step 2: Rodar teste pra confirmar FAIL**

Run: `bun --filter web test -- permissions.test.ts`

Expected: FAIL — `expected false to be true`.

- [ ] **Step 3: Aplicar fix**

Em `apps/web/src/lib/permissions.ts`, substituir:

```ts
const SUPER_ADMIN_EXCLUSIVE: readonly Capability[] = [
	"branches.manage",
	"users.delete",
	"audit.read", // global (admin tem escopado, mas a cap "audit.read" simples fica exclusiva)
];
```

Por:

```ts
const SUPER_ADMIN_EXCLUSIVE: readonly Capability[] = [
	"branches.manage",
	"users.delete",
];
```

- [ ] **Step 4: Rodar teste pra confirmar PASS**

Run: `bun --filter web test -- permissions.test.ts`

Expected: PASS em todos os casos. Verificar que outros testes (manager tem audit.read; super_admin tem) continuam passando.

- [ ] **Step 5: Atualizar CLAUDE.md**

Em `apps/web/CLAUDE.md`, substituir o parágrafo iniciando com `⚠️ **Bug confirmado, fix pendente:**` por:

```md
`audit.read` em `MANAGER_CAPS` e `ADMIN_CAPS` (admin herda via `ALL_CAPS - SUPER_ADMIN_EXCLUSIVE`). `super_admin` também tem (via `ALL_CAPS`).
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/permissions.ts apps/web/__tests__/permissions.test.ts apps/web/CLAUDE.md
git commit -m "fix(permissions): admin herda audit.read"
```

### Task 4: Fix scoping em `linkUserToBranch` / `unlinkUserFromBranch`

Bug P0 confirmado no grilling. Hoje `requireCapabilityWithContext("users.update_branches", {})` é chamado sem contexto — manager linka qualquer user a qualquer branch fora do escopo.

**Files:**
- Modify: `apps/web/src/app/dashboard/users/actions.ts:493-518` e `:596-625`

- [ ] **Step 1: Reescrever `linkUserToBranch`**

Substituir o corpo da função:

```ts
export async function linkUserToBranch(input: unknown): Promise<ActionResult> {
	const parsed = branchLinkSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const actor = await requireCapabilityWithContext("users.update_branches", {
		targetUserId: parsed.data.userId,
		targetBranchIds: [parsed.data.branchId],
	});

	await db
		.insert(userBranch)
		.values({
			userId: parsed.data.userId,
			branchId: parsed.data.branchId,
		})
		.onConflictDoNothing();

	await logUserActivity({
		actorUserId: actor.user.id,
		action: "user.branch_linked",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: { branchId: parsed.data.branchId },
	});
	revalidatePath(`/dashboard/users/${parsed.data.userId}`);
	return { ok: true, data: undefined };
}
```

Mudanças: validar Zod ANTES de checar capability; passar `targetUserId` + `targetBranchIds`; `actor` substitui o `requireCurrentSession` redundante.

- [ ] **Step 2: Reescrever `unlinkUserFromBranch`**

Substituir o corpo (manter o TODO removido):

```ts
export async function unlinkUserFromBranch(
	input: unknown
): Promise<ActionResult> {
	const parsed = branchLinkSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const actor = await requireCapabilityWithContext("users.update_branches", {
		targetUserId: parsed.data.userId,
		targetBranchIds: [parsed.data.branchId],
	});

	await db
		.delete(userBranch)
		.where(
			and(
				eq(userBranch.userId, parsed.data.userId),
				eq(userBranch.branchId, parsed.data.branchId)
			)
		);

	await logUserActivity({
		actorUserId: actor.user.id,
		action: "user.branch_unlinked",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: { branchId: parsed.data.branchId },
	});
	revalidatePath(`/dashboard/users/${parsed.data.userId}`);
	return { ok: true, data: undefined };
}
```

- [ ] **Step 3: Remover imports não usados**

Run: `bun check-types`

Expected: `requireCurrentSession` pode ter virado import órfão. Se sim, remover do bloco de imports topo de `actions.ts`. Após edit:

```bash
bun fix
```

Reaplica imports/ordenação.

- [ ] **Step 4: Smoke**

Run: `bun --filter web test`

Expected: PASS (sem novos testes ainda).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/actions.ts
git commit -m "fix(users): branch-scoping em link/unlink (P0)"
```

### Task 5: Schemas Zod — `reason` em suspend/delete; opcional em reject

**Files:**
- Modify: `apps/web/src/app/dashboard/users/schema.ts`
- Create: `apps/web/__tests__/users-schema.test.ts`

- [ ] **Step 1: Escrever testes que falham**

Criar `apps/web/__tests__/users-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	bulkRejectSchema,
	deleteUserSchema,
	rejectUserSchema,
	suspendUserSchema,
} from "@/app/dashboard/users/schema";

describe("suspendUserSchema", () => {
	it("exige reason com >= 10 chars", () => {
		const r = suspendUserSchema.safeParse({ userId: "u1", reason: "curto" });
		expect(r.success).toBe(false);
	});
	it("aceita reason válido", () => {
		const r = suspendUserSchema.safeParse({
			userId: "u1",
			reason: "Motivo suficientemente longo",
		});
		expect(r.success).toBe(true);
	});
	it("rejeita sem reason", () => {
		const r = suspendUserSchema.safeParse({ userId: "u1" });
		expect(r.success).toBe(false);
	});
});

describe("deleteUserSchema", () => {
	it("exige reason com >= 10 chars", () => {
		const r = deleteUserSchema.safeParse({ userId: "u1", reason: "x" });
		expect(r.success).toBe(false);
	});
	it("aceita reason válido", () => {
		const r = deleteUserSchema.safeParse({
			userId: "u1",
			reason: "Funcionário desligado em 26/05",
		});
		expect(r.success).toBe(true);
	});
});

describe("rejectUserSchema", () => {
	it("aceita sem reason", () => {
		const r = rejectUserSchema.safeParse({ userId: "u1" });
		expect(r.success).toBe(true);
	});
	it("aceita com reason curto (opcional)", () => {
		const r = rejectUserSchema.safeParse({ userId: "u1", reason: "spam" });
		expect(r.success).toBe(true);
	});
});

describe("bulkRejectSchema", () => {
	it("exige array não vazio de userIds", () => {
		const r = bulkRejectSchema.safeParse({ userIds: [] });
		expect(r.success).toBe(false);
	});
	it("aceita >=1 userId", () => {
		const r = bulkRejectSchema.safeParse({ userIds: ["u1", "u2"] });
		expect(r.success).toBe(true);
	});
});
```

- [ ] **Step 2: Confirmar FAIL**

Run: `bun --filter web test -- users-schema`

Expected: FAIL — schemas `suspendUserSchema`, `deleteUserSchema`, `rejectUserSchema`, `bulkRejectSchema` não existem.

- [ ] **Step 3: Adicionar schemas**

No fim de `apps/web/src/app/dashboard/users/schema.ts`, adicionar:

```ts
export const suspendUserSchema = z.object({
	userId: z.string().min(1),
	reason: z.string().min(10, "Motivo precisa de pelo menos 10 caracteres"),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const deleteUserSchema = z.object({
	userId: z.string().min(1),
	reason: z.string().min(10, "Motivo precisa de pelo menos 10 caracteres"),
});
export type DeleteUserInput = z.infer<typeof deleteUserSchema>;

export const rejectUserSchema = z.object({
	userId: z.string().min(1),
	reason: z.string().min(1).optional(),
});
export type RejectUserInput = z.infer<typeof rejectUserSchema>;

export const bulkRejectSchema = z.object({
	userIds: z.array(z.string().min(1)).min(1),
	reason: z.string().min(1).optional(),
});
export type BulkRejectInput = z.infer<typeof bulkRejectSchema>;
```

Manter `userIdSchema` existente (usada por `reactivateUser` e `triggerPasswordReset`).

- [ ] **Step 4: Confirmar PASS**

Run: `bun --filter web test -- users-schema`

Expected: PASS.

- [ ] **Step 5: Atualizar consumers em `actions.ts`**

Em `apps/web/src/app/dashboard/users/actions.ts`:

**5a.** Substituir `rejectUser` (linha ~94) — trocar import `userIdSchema` por `rejectUserSchema`, mudar parsing:

```ts
export async function rejectUser(input: unknown): Promise<ActionResult> {
	const parsed = rejectUserSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const session = await requireCapabilityWithContext("users.approve", {
		targetUserId: parsed.data.userId,
	});

	const [target] = await db
		.select({
			status: userTable.status,
			email: userTable.email,
			name: userTable.name,
		})
		.from(userTable)
		.where(eq(userTable.id, parsed.data.userId))
		.limit(1);

	if (!target) {
		return { ok: false, error: "User não encontrado" };
	}
	if (target.status !== "pending") {
		return { ok: false, error: "Só pendentes podem ser rejeitados" };
	}

	try {
		await db.delete(userTable).where(eq(userTable.id, parsed.data.userId));
	} catch (error) {
		logger.error("rejectUser falhou", error);
		return { ok: false, error: "Não foi possível rejeitar" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.rejected",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: {
			rejectedEmail: target.email,
			rejectedName: target.name,
			...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
		},
	});
	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}
```

(Nota: cacheamos `email` e `name` no metadata porque o user some — auditoria precisa do contexto pós-DELETE; ADR-0010 § "trilha em userActivityLog precisa cachear o email/nome do rejected".)

**5b.** Substituir `suspendUser` (linha ~247):

```ts
export async function suspendUser(input: unknown): Promise<ActionResult> {
	const parsed = suspendUserSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "validação",
		};
	}

	const session = await requireCapabilityWithContext("users.suspend", {
		targetUserId: parsed.data.userId,
	});

	try {
		await db.transaction(async (tx) => {
			await tx
				.update(userTable)
				.set({ status: "suspended" })
				.where(eq(userTable.id, parsed.data.userId));
			await tx
				.delete(sessionTable)
				.where(eq(sessionTable.userId, parsed.data.userId));
		});
	} catch (error) {
		logger.error("suspendUser falhou", error);
		return { ok: false, error: "Não foi possível suspender" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.suspended",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: { reason: parsed.data.reason },
	});
	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}
```

**5c.** Substituir `deleteUser` (linha ~361). A função fica longa porque mantém os anonimizers; só a entrada muda:

```ts
export async function deleteUser(input: unknown): Promise<ActionResult> {
	const parsed = deleteUserSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "validação",
		};
	}

	const session = await requireCapabilityWithContext("users.delete", {
		targetUserId: parsed.data.userId,
	});

	const [target] = await db
		.select({
			role: userTable.role,
			status: userTable.status,
			email: userTable.email,
			name: userTable.name,
		})
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

	try {
		await db.transaction(async (tx) => {
			await tx
				.update(stockMovement)
				.set({ actorType: "system", actorId: null })
				.where(eq(stockMovement.actorId, parsed.data.userId));
			await tx
				.update(orderStatusHistory)
				.set({ actorType: "system", actorUserId: null })
				.where(eq(orderStatusHistory.actorUserId, parsed.data.userId));
			await tx
				.update(orderNote)
				.set({ authorId: null })
				.where(eq(orderNote.authorId, parsed.data.userId));
			await tx
				.update(promotion)
				.set({ createdBy: null })
				.where(eq(promotion.createdBy, parsed.data.userId));
			await tx
				.update(promotion)
				.set({ updatedBy: null })
				.where(eq(promotion.updatedBy, parsed.data.userId));
			await tx.delete(userTable).where(eq(userTable.id, parsed.data.userId));
		});
	} catch (error) {
		logger.error("deleteUser falhou", error);
		return { ok: false, error: "Não foi possível deletar" };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.deleted",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: {
			deletedEmail: target.email,
			deletedName: target.name,
			reason: parsed.data.reason,
		},
	});
	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}
```

(Nota: a FK `userActivityLog.actorUserId` agora é `set null` (Task 1); não precisamos anonimizar manualmente esse log — vira null sozinho. O histórico de "deletado por" sobrevive via `metadata.actorName` cacheado em Task 2.)

**5d.** Remover do topo de `actions.ts` o import `userIdSchema` se não houver outro consumer; manter se `reactivateUser` ainda usa. Verificar com:

```bash
ugrep -n "userIdSchema" apps/web/src/app/dashboard/users
```

- [ ] **Step 6: Run check-types + tests**

Run: `bun check-types && bun --filter web test`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/users/schema.ts apps/web/src/app/dashboard/users/actions.ts apps/web/__tests__/users-schema.test.ts
git commit -m "feat(users): reason obrigatório em suspend/delete"
```

---

## Fase 2 — Edit Sheet e revogação de sessão

### Task 6: Remover branches do `UserEditSheet` (aba Filiais vira fonte única)

**Files:**
- Modify: `apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/page.tsx` (props passadas pro sheet)

- [ ] **Step 1: Reescrever `user-edit-sheet.tsx`**

```tsx
"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";

import { updateUser } from "../actions";
import { updateUserSchema } from "../schema";
import { allowedApprovalRoles } from "../_lib/approval-roles";
import { RoleSelect } from "./role-select";
import type { UserRow } from "./types";

interface Props {
	actorRole: UserRow["role"];
	user: {
		id: string;
		name: string;
		role: UserRow["role"];
	};
}

export function UserEditSheet({ user, actorRole }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const allowed = allowedApprovalRoles(actorRole);

	const [name, setName] = useState(user.name);
	const [role, setRole] = useState<UserRow["role"]>(user.role);
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setName(user.name);
			setRole(user.role);
			setIssues([]);
		}
	}, [open, user]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = updateUserSchema.safeParse({
			userId: user.id,
			name,
			role,
		});
		if (!parsed.success) {
			setIssues(
				zodIssuesToFormIssues(parsed.error, { name: "Nome", role: "Cargo" })
			);
			return;
		}
		startTransition(async () => {
			const res = await updateUser(parsed.data);
			if (res.ok) {
				toast.success("Usuário atualizado");
				close();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize nome e cargo. Filiais são geridas na aba Filiais."
			issues={issues}
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${user.name}`}
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="user-name">Nome</Label>
					<Input
						id="user-name"
						onChange={(e) => setName(e.target.value)}
						value={name}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Cargo</Label>
					<RoleSelect allowedRoles={allowed} onChange={setRole} value={role} />
				</div>
			</div>
		</EntityEditSheet>
	);
}
```

(Nota: `allowedApprovalRoles` é criado em Task 8. Por enquanto o import vai falhar — vamos resolver na ordem. Se executando Tasks fora de ordem, fazer Task 8 primeiro.)

- [ ] **Step 2: Atualizar `[id]/page.tsx` (remover prop `branches` do `UserEditSheet`, adicionar `actorRole`)**

Trocar:

```tsx
				<UserEditSheet
					branches={availableBranches}
					user={{
						id: user.id,
						name: user.name,
						role: user.role,
						branchIds: user.branchIds,
					}}
				/>
```

Por:

```tsx
				<UserEditSheet
					actorRole={actorSession.user.role as UserRow["role"]}
					user={{ id: user.id, name: user.name, role: user.role }}
				/>
```

E adicionar no topo do arquivo (após `requireCapabilityOrRedirect`):

```tsx
	const actorSession = await requireCapabilityOrRedirect("users.manage");
```

Substituindo o `await requireCapabilityOrRedirect("users.manage");` linha 24 (capturando o retorno). Importar `UserRow` se ainda não estiver:

```tsx
import type { UserRow } from "../_components/types";
```

- [ ] **Step 3: Atualizar `updateUser` em `actions.ts` — remover suporte a `branchIds`**

`updateUserSchema` em `schema.ts` ainda aceita `branchIds`. Manter pra não quebrar callers externos, mas internamente `updateUser` simplifica. Editar `updateUser` linha 140:

Substituir o bloco que checa `branchesChanged` e o `tx.delete(userBranch)` no fim. Versão limpa:

```ts
export async function updateUser(
	input: UpdateUserInput
): Promise<ActionResult> {
	const parsed = updateUserSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	let session = await requireCurrentSession();

	try {
		const [current] = await db
			.select({ role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, parsed.data.userId));
		if (!current) {
			return { ok: false, error: "Usuário não encontrado" };
		}

		const roleChanged =
			parsed.data.role !== undefined && parsed.data.role !== current.role;
		const nameChanged = parsed.data.name !== undefined;

		if (roleChanged) {
			session = await requireCapabilityWithContext("users.update_role", {
				targetUserId: parsed.data.userId,
			});
		}
		if (nameChanged) {
			session = await requireCapabilityWithContext("users.manage", {
				targetUserId: parsed.data.userId,
			});
		}

		await db.transaction(async (tx) => {
			const update: { name?: string; role?: UpdateUserInput["role"] } = {};
			if (parsed.data.name) {
				update.name = parsed.data.name;
			}
			if (parsed.data.role) {
				update.role = parsed.data.role;
			}
			if (Object.keys(update).length > 0) {
				await tx
					.update(userTable)
					.set(update)
					.where(eq(userTable.id, parsed.data.userId));
			}
			if (roleChanged) {
				await tx
					.delete(sessionTable)
					.where(eq(sessionTable.userId, parsed.data.userId));
			}
		});
	} catch (error) {
		logger.error("updateUser falhou", error);
		const message =
			error instanceof Error ? error.message : "Não foi possível atualizar";
		return { ok: false, error: message };
	}

	const changes: Record<string, unknown> = {};
	if (parsed.data.name !== undefined) {
		changes.name = parsed.data.name;
	}
	if (parsed.data.role !== undefined) {
		changes.role = parsed.data.role;
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.updated",
		targetType: "user",
		targetId: parsed.data.userId,
		metadata: { changes },
	});
	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}
```

(Branches removidas do path; revogação de sessão em role-change incluída — cumpre Task 7 também.)

- [ ] **Step 4: Atualizar `updateUserSchema` — remover `branchIds`**

Em `schema.ts`:

```ts
export const updateUserSchema = z.object({
	userId: z.string().min(1),
	name: z.string().min(2).max(100).optional(),
	role: z.enum(ROLES).optional(),
});
```

- [ ] **Step 5: Run check-types + tests**

Run: `bun check-types && bun --filter web test`

Expected: erro no `UserEditSheet` por `allowedApprovalRoles` não existir. Esperado — Task 8 cria.

- [ ] **Step 6: Commit parcial**

```bash
git add apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx apps/web/src/app/dashboard/users/[id]/page.tsx apps/web/src/app/dashboard/users/actions.ts apps/web/src/app/dashboard/users/schema.ts
git commit -m "refactor(users): edit sheet só name+role; revoga sessão em role-change"
```

### Task 7: (consolidada com Task 6 step 3) — verificação

Já entregue em Task 6. Verificar com smoke abaixo.

- [ ] **Step 1: Smoke conceitual — revisar diff**

Run: `git show HEAD --stat`

Expected: ver `actions.ts` modificado com a regra de `roleChanged → tx.delete(sessionTable)`.

---

## Fase 3 — ApprovalSheet por capability

### Task 8: Helper `allowedApprovalRoles` + integração no ApprovalSheet/EditSheet

**Files:**
- Create: `apps/web/src/app/dashboard/users/_lib/approval-roles.ts`
- Create: `apps/web/__tests__/users-approval-roles.test.ts`
- Modify: `apps/web/src/app/dashboard/users/_components/approval-sheet.tsx`
- Modify: `apps/web/src/app/dashboard/users/_components/user-card.tsx` (passa `actorRole`)
- Modify: `apps/web/src/app/dashboard/users/page.tsx` (props pro UsersCardGrid)
- Modify: `apps/web/src/app/dashboard/users/_components/users-card-grid.tsx` (encaminhar `actorRole`)

- [ ] **Step 1: Escrever teste que falha**

Criar `apps/web/__tests__/users-approval-roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { allowedApprovalRoles } from "@/app/dashboard/users/_lib/approval-roles";

describe("allowedApprovalRoles", () => {
	it("super_admin pode atribuir os 4 roles", () => {
		expect(allowedApprovalRoles("super_admin")).toEqual([
			"super_admin",
			"admin",
			"manager",
			"user",
		]);
	});

	it("admin pode atribuir admin/manager/user (não super_admin)", () => {
		expect(allowedApprovalRoles("admin")).toEqual(["admin", "manager", "user"]);
	});

	it("manager pode atribuir manager/user", () => {
		expect(allowedApprovalRoles("manager")).toEqual(["manager", "user"]);
	});

	it("user não pode atribuir nada", () => {
		expect(allowedApprovalRoles("user")).toEqual([]);
	});
});
```

- [ ] **Step 2: Confirmar FAIL**

Run: `bun --filter web test -- users-approval-roles`

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar helper**

Criar `apps/web/src/app/dashboard/users/_lib/approval-roles.ts`:

```ts
import type { UserRole } from "@emach/db/schema/auth";

const HIERARCHY: readonly UserRole[] = [
	"super_admin",
	"admin",
	"manager",
	"user",
];

/**
 * Roles que um ator pode atribuir a outro user.
 * Regra: pode atribuir o próprio role e abaixo; super_admin atribui qualquer um.
 */
export function allowedApprovalRoles(actorRole: UserRole): UserRole[] {
	if (actorRole === "super_admin") {
		return [...HIERARCHY];
	}
	const start = HIERARCHY.indexOf(actorRole);
	if (start === -1) {
		return [];
	}
	return HIERARCHY.slice(start);
}
```

- [ ] **Step 4: Confirmar PASS**

Run: `bun --filter web test -- users-approval-roles`

Expected: PASS.

- [ ] **Step 5: Atualizar `ApprovalSheet`**

Em `apps/web/src/app/dashboard/users/_components/approval-sheet.tsx`:

- Trocar a prop default `allowedRoles = ["manager", "user"]` por receber `actorRole` e calcular.

Substituir o bloco de Props + função:

```tsx
interface Props {
	actorRole: UserRow["role"];
	branches: BranchLite[];
	onClose: () => void;
	onResolved?: () => void;
	user: UserRow | null;
}

export function ApprovalSheet({
	user,
	branches,
	onClose,
	onResolved,
	actorRole,
}: Props) {
	const allowed = allowedApprovalRoles(actorRole);
	const [role, setRole] = useState<UserRow["role"]>(allowed.at(-1) ?? "user");
	const [branchIds, setBranchIds] = useState<string[]>([]);
```

E adicionar import:

```tsx
import { allowedApprovalRoles } from "../_lib/approval-roles";
```

Trocar uso de `allowedRoles` no JSX por `allowed`:

```tsx
								<RoleSelect
									allowedRoles={allowed}
									disabled={submitting}
									onChange={setRole}
									value={role}
								/>
```

E no `useEffect` que reseta:

```tsx
		useEffect(() => {
			if (user) {
				setRole(allowed.at(-1) ?? "user");
				setBranchIds([]);
			}
		}, [user, allowed]);
```

- [ ] **Step 6: Propagar `actorRole` pelas props**

Em `apps/web/src/app/dashboard/users/_components/user-card.tsx`:

Adicionar `actorRole` em `UserCardProps`:

```tsx
interface UserCardProps {
	actorRole: UserListRow["role"];
	branches: BranchLite[];
	onResolved?: (userId: string) => void;
	user: UserListRow;
}
```

Destructurar e passar:

```tsx
export function UserCard({ user, branches, onResolved, actorRole }: UserCardProps) {
	// ...
	<ApprovalSheet
		actorRole={actorRole}
		branches={branches}
		onClose={() => setApproving(false)}
		onResolved={onResolved ? () => onResolved(user.id) : undefined}
		user={approving ? user : null}
	/>
```

Em `apps/web/src/app/dashboard/users/_components/users-card-grid.tsx`:

Adicionar `actorRole` em props da `UsersCardGrid` e encaminhar pra cada `<UserCard>`:

```tsx
interface Props {
	actorRole: UserListRow["role"];
	branches: BranchLite[];
	filters: UserListFilters;
	initialCursor: string | null;
	initialItems: UserListRow[];
}

// ... dentro do JSX:
<UserCard
	actorRole={actorRole}
	branches={branches}
	key={user.id}
	onResolved={handleResolved}
	user={user}
/>
```

Em `apps/web/src/app/dashboard/users/page.tsx`:

Trocar `await requireCapabilityOrRedirect("users.manage");` por capturar:

```tsx
const actorSession = await requireCapabilityOrRedirect("users.manage");
```

E passar pro `UsersCardGrid`:

```tsx
<UsersCardGrid
	actorRole={actorSession.user.role as UserListRow["role"]}
	branches={branches}
	filters={filters}
	initialCursor={page.nextCursor}
	initialItems={page.items}
	key={JSON.stringify(filters)}
/>
```

Importar `UserListRow`:

```tsx
import type { UserListRow } from "./data";
```

- [ ] **Step 7: Run check-types + tests**

Run: `bun check-types && bun --filter web test`

Expected: PASS. UserEditSheet de Task 6 agora resolve `allowedApprovalRoles`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/users
git commit -m "feat(users): ApprovalSheet filtra roles por capability do ator"
```

---

## Fase 4 — Ações órfãs na UI

### Task 9: Componente reutilizável `DestructiveActionDialog`

**Files:**
- Create: `apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx`

- [ ] **Step 1: Criar componente**

```tsx
"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@emach/ui/components/alert-dialog";
import { Label } from "@emach/ui/components/label";
import { Textarea } from "@emach/ui/components/textarea";
import { useState } from "react";

interface Props {
	cancelLabel?: string;
	confirmLabel: string;
	description: string;
	destructive?: boolean;
	onCancel: () => void;
	onConfirm: (reason: string) => void | Promise<void>;
	open: boolean;
	reasonRequired?: boolean;
	submitting?: boolean;
	title: string;
}

const MIN_REASON_LENGTH = 10;

export function DestructiveActionDialog({
	open,
	title,
	description,
	confirmLabel,
	cancelLabel = "Cancelar",
	destructive = true,
	reasonRequired = true,
	submitting = false,
	onConfirm,
	onCancel,
}: Props) {
	const [reason, setReason] = useState("");
	const tooShort = reasonRequired && reason.trim().length < MIN_REASON_LENGTH;

	const handleConfirm = () => {
		if (tooShort) {
			return;
		}
		void onConfirm(reason.trim());
	};

	return (
		<AlertDialog
			onOpenChange={(o) => {
				if (!o) {
					setReason("");
					onCancel();
				}
			}}
			open={open}
		>
			<AlertDialogContent size="default">
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="destructive-reason">
						Motivo {reasonRequired ? "(obrigatório, mín. 10 caracteres)" : "(opcional)"}
					</Label>
					<Textarea
						id="destructive-reason"
						onChange={(e) => setReason(e.target.value)}
						placeholder="Explique brevemente o motivo desta ação"
						rows={3}
						value={reason}
					/>
					{reasonRequired && reason.length > 0 && tooShort ? (
						<p className="text-destructive text-xs">
							Mínimo {MIN_REASON_LENGTH} caracteres.
						</p>
					) : null}
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={submitting}>
						{cancelLabel}
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={submitting || tooShort}
						onClick={handleConfirm}
						variant={destructive ? "destructive" : "default"}
					>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
```

- [ ] **Step 2: Verificar build**

Run: `bun check-types`

Expected: PASS (componente isolado, só faz import de `@emach/ui` + React).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx
git commit -m "feat(users): dialog reutilizável com reason"
```

### Task 10: `UserActionsMenu` (kebab no header) + integração

Botão `⋮` ao lado do "Editar" no `UserIdentity`, com Suspender/Reativar contextual.

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/_components/user-actions-menu.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/user-identity.tsx` (aceitar prop `extraActions`)
- Modify: `apps/web/src/app/dashboard/users/[id]/page.tsx`

- [ ] **Step 1: Criar `user-actions-menu.tsx`**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import { MoreVertical, Pause, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { reactivateUser, suspendUser } from "../../actions";
import { DestructiveActionDialog } from "../../_components/destructive-action-dialog";

interface Props {
	user: { id: string; name: string; status: "active" | "pending" | "suspended" };
}

export function UserActionsMenu({ user }: Props) {
	const [dialogOpen, setDialogOpen] = useState<"suspend" | "reactivate" | null>(
		null
	);
	const [submitting, startTransition] = useTransition();

	const closeDialog = () => setDialogOpen(null);

	const onSuspend = (reason: string) => {
		startTransition(async () => {
			const res = await suspendUser({ userId: user.id, reason });
			if (res.ok) {
				toast.success("Usuário suspenso");
				closeDialog();
			} else {
				toast.error(res.error);
			}
		});
	};

	const onReactivate = (_reason: string) => {
		startTransition(async () => {
			const res = await reactivateUser({ userId: user.id });
			if (res.ok) {
				toast.success("Usuário reativado");
				closeDialog();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button aria-label="Mais ações" size="sm" variant="outline">
							<MoreVertical aria-hidden className="size-3.5" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end" side="bottom">
					{user.status === "active" ? (
						<DropdownMenuItem onClick={() => setDialogOpen("suspend")}>
							<Pause className="mr-2 size-3.5" />
							Suspender
						</DropdownMenuItem>
					) : null}
					{user.status === "suspended" ? (
						<DropdownMenuItem onClick={() => setDialogOpen("reactivate")}>
							<Play className="mr-2 size-3.5" />
							Reativar
						</DropdownMenuItem>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
			<DestructiveActionDialog
				confirmLabel="Suspender"
				description={`O usuário ${user.name} perderá acesso imediatamente e todas as sessões ativas serão revogadas.`}
				onCancel={closeDialog}
				onConfirm={onSuspend}
				open={dialogOpen === "suspend"}
				submitting={submitting}
				title="Suspender usuário"
			/>
			<DestructiveActionDialog
				confirmLabel="Reativar"
				description={`O usuário ${user.name} recuperará o acesso. Não precisa de motivo formal.`}
				destructive={false}
				onCancel={closeDialog}
				onConfirm={onReactivate}
				open={dialogOpen === "reactivate"}
				reasonRequired={false}
				submitting={submitting}
				title="Reativar usuário"
			/>
		</>
	);
}
```

- [ ] **Step 2: Modificar `user-identity.tsx` pra renderizar kebab ao lado de "Editar"**

Substituir o bloco `actions`:

```tsx
interface Props {
	user: UserDetail;
	extraActions?: React.ReactNode;
}

export function UserIdentity({ user, extraActions }: Props) {
	// ... (resto igual) ...
	return (
		<EntityIdentityHeader
			actions={
				<div className="flex items-center gap-2">
					<Button onClick={handleEdit} size="sm" variant="outline">
						<Pencil aria-hidden className="mr-1.5 size-3.5" />
						Editar
					</Button>
					{extraActions}
				</div>
			}
			// ... resto igual ...
		/>
	);
}
```

- [ ] **Step 3: Atualizar `[id]/page.tsx`**

Substituir `<UserIdentity user={user} />` por:

```tsx
<UserIdentity
	extraActions={
		<UserActionsMenu
			user={{ id: user.id, name: user.name, status: user.status }}
		/>
	}
	user={user}
/>
```

Adicionar import:

```tsx
import { UserActionsMenu } from "./_components/user-actions-menu";
```

- [ ] **Step 4: Run check-types + tests**

Run: `bun check-types && bun --filter web test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id] apps/web/src/app/dashboard/users/_components
git commit -m "feat(users): kebab menu com Suspender/Reativar no header"
```

### Task 11: Danger Zone na aba Perfil — "Excluir usuário"

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/_components/danger-zone.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/profile-tab.tsx`

- [ ] **Step 1: Criar `danger-zone.tsx`**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteUser } from "../../actions";
import { DestructiveActionDialog } from "../../_components/destructive-action-dialog";

interface Props {
	canDelete: boolean;
	user: { id: string; name: string };
}

export function DangerZone({ user, canDelete }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [submitting, startTransition] = useTransition();

	const onDelete = (reason: string) => {
		startTransition(async () => {
			const res = await deleteUser({ userId: user.id, reason });
			if (res.ok) {
				toast.success("Usuário excluído");
				router.push("/dashboard/users");
			} else {
				toast.error(res.error);
			}
		});
	};

	if (!canDelete) {
		return null;
	}

	return (
		<>
			<Card className="border-destructive/40">
				<CardHeader>
					<CardTitle className="text-base text-destructive">
						Zona de perigo
					</CardTitle>
					<CardDescription>
						Excluir é irreversível: o cadastro do usuário some. O histórico de
						ações dele permanece com identidade preservada via snapshot.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button onClick={() => setOpen(true)} variant="destructive">
						<Trash2 aria-hidden className="mr-1.5 size-3.5" />
						Excluir usuário
					</Button>
				</CardContent>
			</Card>
			<DestructiveActionDialog
				confirmLabel="Excluir definitivamente"
				description={`O usuário ${user.name} será removido. Você precisa explicar o motivo.`}
				onCancel={() => setOpen(false)}
				onConfirm={onDelete}
				open={open}
				submitting={submitting}
				title="Excluir usuário"
			/>
		</>
	);
}
```

- [ ] **Step 2: Modificar `profile-tab.tsx`**

Adicionar `canDelete` na prop + render do `DangerZone` no rodapé:

```tsx
import { DangerZone } from "./danger-zone";

interface Props {
	canDelete: boolean;
	user: UserDetail;
}

export function ProfileTab({ user, canDelete }: Props) {
	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Perfil</CardTitle>
				</CardHeader>
				<CardContent>
					{/* dl igual antes */}
				</CardContent>
			</Card>
			<DangerZone canDelete={canDelete} user={{ id: user.id, name: user.name }} />
		</div>
	);
}
```

- [ ] **Step 3: Atualizar `[id]/page.tsx`**

Calcular `canDelete` via `can`:

```tsx
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";

// ...
const actorSession = await requireCapabilityOrRedirect("users.manage");
const canDelete = can(actorSession.user.role, "users.delete");
```

E passar pro tab:

```tsx
{
	value: "profile",
	label: "Perfil",
	icon: <User aria-hidden className="size-3.5" />,
	content: <ProfileTab canDelete={canDelete} user={user} />,
},
```

- [ ] **Step 4: Run check-types + tests**

Run: `bun check-types && bun --filter web test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]
git commit -m "feat(users): danger zone com Excluir na aba Perfil"
```

---

## Fase 5 — Aba Atividade dual-view

### Task 12: Função `getUserAffectedActivity` no data layer

**Files:**
- Modify: `apps/web/src/app/dashboard/users/data.ts`

- [ ] **Step 1: Adicionar função no fim do arquivo**

Antes de `getRecentUserActivity` (linha ~316), adicionar:

```ts
/**
 * Atividade SOFRIDA pelo user (target). Filtra por targetType='user' + targetId.
 */
export async function getUserAffectedActivity(
	userId: string,
	cursor: string | null,
	limit = 25
): Promise<InfiniteResult<UserActivityRow & { actorName: string | null }>> {
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const rows = await db
		.select({
			id: userActivityLog.id,
			action: userActivityLog.action,
			createdAt: userActivityLog.createdAt,
			metadata: userActivityLog.metadata,
			targetId: userActivityLog.targetId,
			targetType: userActivityLog.targetType,
			actorName: userTable.name,
		})
		.from(userActivityLog)
		.leftJoin(userTable, eq(userTable.id, userActivityLog.actorUserId))
		.where(
			and(
				eq(userActivityLog.targetType, "user"),
				eq(userActivityLog.targetId, userId),
				decoded
					? lte(userActivityLog.createdAt, new Date(decoded.createdAt))
					: undefined
			)
		)
		.orderBy(desc(userActivityLog.createdAt))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;

	return {
		items: items.map((r) => ({
			action: r.action,
			actorName:
				r.actorName ??
				(r.metadata as Record<string, unknown> | null)?.actorName as string ??
				null,
			createdAt: r.createdAt,
			id: r.id,
			metadata: (r.metadata as Record<string, unknown> | null) ?? null,
			targetId: r.targetId,
			targetType: r.targetType,
		})),
		nextCursor,
	};
}
```

(Nota: `actorName` vem da join atual; fallback para `metadata.actorName` cacheado em Task 2 cobre o caso do user deletado.)

- [ ] **Step 2: Run check-types**

Run: `bun check-types`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/users/data.ts
git commit -m "feat(users): getUserAffectedActivity (audit do alvo)"
```

### Task 13: Server actions de paginação para as duas views

**Files:**
- Modify: `apps/web/src/app/dashboard/users/actions.ts`

- [ ] **Step 1: Adicionar duas actions de fetch**

Antes do `fetchUserActivityFeedPage` existente (linha ~543), adicionar:

```ts
export async function fetchUserActivityByUserPage(
	userId: string,
	cursor: string | null
): Promise<
	import("@/lib/infinite").InfiniteResult<import("./data").UserActivityRow>
> {
	await requireCapabilityWithContext("users.manage", { targetUserId: userId });
	const { getUserActivity } = await import("./data");
	return getUserActivity(userId, cursor);
}

export async function fetchUserActivityAffectingPage(
	userId: string,
	cursor: string | null
): Promise<
	import("@/lib/infinite").InfiniteResult<
		import("./data").UserActivityRow & { actorName: string | null }
	>
> {
	await requireCapabilityWithContext("users.manage", { targetUserId: userId });
	const { getUserAffectedActivity } = await import("./data");
	return getUserAffectedActivity(userId, cursor);
}
```

- [ ] **Step 2: Run check-types**

Run: `bun check-types`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/users/actions.ts
git commit -m "feat(users): actions paginadas das duas views de atividade"
```

### Task 14: Reescrever `ActivityTab` com sub-tabs

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/_components/activity-by-user-view.tsx`
- Create: `apps/web/src/app/dashboard/users/[id]/_components/activity-affecting-user-view.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/activity-tab.tsx`

- [ ] **Step 1: Criar `activity-by-user-view.tsx`**

```tsx
"use client";

import { EntityAuditLogTable } from "@/components/entity/entity-audit-log-table";
import { InfiniteList } from "@/components/infinite-list";

import type { UserActivityRow } from "../../data";
import { fetchUserActivityByUserPage } from "../../actions";

const ACTION_LABELS: Record<string, string> = {
	"user.approved": "Aprovou usuário",
	"user.rejected": "Rejeitou usuário",
	"user.updated": "Atualizou usuário",
	"user.suspended": "Suspendeu usuário",
	"user.reactivated": "Reativou usuário",
	"user.deleted": "Deletou usuário",
	"user.password_reset_triggered": "Enviou reset de senha",
	"user.session_revoked": "Revogou sessão",
	"user.all_sessions_revoked": "Revogou todas as sessões",
	"user.branch_linked": "Vinculou filial",
	"user.branch_unlinked": "Desvinculou filial",
	"tool.created": "Criou ferramenta",
	"tool.updated": "Atualizou ferramenta",
	"tool.deleted": "Deletou ferramenta",
};

interface Props {
	initial: UserActivityRow[];
	initialCursor: string | null;
	userId: string;
}

export function ActivityByUserView({ userId, initial, initialCursor }: Props) {
	return (
		<InfiniteList
			fetchPage={(cursor) => fetchUserActivityByUserPage(userId, cursor)}
			initialCursor={initialCursor}
			initialItems={initial}
			renderItems={(items) => (
				<EntityAuditLogTable
					actionLabels={ACTION_LABELS}
					emptyMessage="Sem ações registradas por este usuário"
					entries={items.map((it) => ({
						id: it.id,
						at: it.createdAt,
						action: it.action,
						actor: { id: userId, name: "Este usuário", type: "user" as const },
						target: it.targetId
							? { label: `${it.targetType ?? "—"} · ${it.targetId.slice(0, 8)}` }
							: undefined,
						before: null,
						after: it.metadata,
					}))}
				/>
			)}
		/>
	);
}
```

Se `InfiniteList` não existe com essa API, fallback: render direto sem paginação cliente (mantém o initial). Verificar:

```bash
ls apps/web/src/components/infinite-list*
```

Se não existir, simplificar para render direto da `EntityAuditLogTable` com `items=initial` e pular `InfiniteList`.

- [ ] **Step 2: Criar `activity-affecting-user-view.tsx`**

```tsx
"use client";

import { EntityAuditLogTable } from "@/components/entity/entity-audit-log-table";

import type { UserActivityRow } from "../../data";

const ACTION_LABELS: Record<string, string> = {
	"user.approved": "Foi aprovado",
	"user.rejected": "Foi rejeitado",
	"user.updated": "Foi atualizado",
	"user.suspended": "Foi suspenso",
	"user.reactivated": "Foi reativado",
	"user.deleted": "Foi excluído",
	"user.password_reset_triggered": "Recebeu reset de senha",
	"user.session_revoked": "Sessão revogada",
	"user.all_sessions_revoked": "Todas as sessões revogadas",
	"user.branch_linked": "Filial vinculada",
	"user.branch_unlinked": "Filial desvinculada",
};

interface Props {
	initial: (UserActivityRow & { actorName: string | null })[];
}

export function ActivityAffectingUserView({ initial }: Props) {
	return (
		<EntityAuditLogTable
			actionLabels={ACTION_LABELS}
			emptyMessage="Nenhuma alteração registrada neste usuário"
			entries={initial.map((it) => ({
				id: it.id,
				at: it.createdAt,
				action: it.action,
				actor: {
					id: "",
					name: it.actorName ?? "Usuário deletado",
					type: "user" as const,
				},
				target: undefined,
				before: null,
				after: it.metadata,
			}))}
		/>
	);
}
```

- [ ] **Step 3: Reescrever `activity-tab.tsx` com Tabs**

```tsx
import {
	Tabs,
	TabsList,
	TabsPanel,
	TabsTrigger,
} from "@emach/ui/components/tabs";

import { getUserActivity, getUserAffectedActivity } from "../../data";
import { ActivityAffectingUserView } from "./activity-affecting-user-view";
import { ActivityByUserView } from "./activity-by-user-view";

export async function ActivityTab({ userId }: { userId: string }) {
	const [byUser, affecting] = await Promise.all([
		getUserActivity(userId, null, 25),
		getUserAffectedActivity(userId, null, 25),
	]);

	return (
		<Tabs defaultValue="affecting">
			<TabsList>
				<TabsTrigger value="affecting">Feito com</TabsTrigger>
				<TabsTrigger value="by">Feito por</TabsTrigger>
			</TabsList>
			<TabsPanel value="affecting">
				<ActivityAffectingUserView initial={affecting.items} />
			</TabsPanel>
			<TabsPanel value="by">
				<ActivityByUserView
					initial={byUser.items}
					initialCursor={byUser.nextCursor}
					userId={userId}
				/>
			</TabsPanel>
		</Tabs>
	);
}
```

(Default = "Feito com" porque é o que faltava — auditoria do alvo.)

- [ ] **Step 4: Confirmar API de Tabs do projeto**

Run: `ugrep -n "TabsPanel\|Tabs.Content\|TabsContent" packages/ui/src/components/tabs.tsx | head -5`

Expected: identificar qual é o nome do componente de painel (`TabsContent` ou `TabsPanel`). Ajustar import e JSX no Step 3 conforme o real.

- [ ] **Step 5: Run check-types + tests**

Run: `bun check-types && bun --filter web test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/_components
git commit -m "feat(users): aba Atividade com sub-tabs Feito por/Feito com"
```

### Task 15: Paginação real em `fetchUserActivityFeedPage`

Hoje a função retorna `nextCursor: null` sempre (TODO em `actions.ts:553`). O feed da home da listagem não paginava.

**Files:**
- Modify: `apps/web/src/app/dashboard/users/data.ts` (nova função paginada para o feed global)
- Modify: `apps/web/src/app/dashboard/users/actions.ts` (`fetchUserActivityFeedPage`)

- [ ] **Step 1: Adicionar `getUserActivityFeedPaginated` em `data.ts`**

Antes de `getRecentUserActivity`:

```ts
export async function getUserActivityFeedPaginated(
	cursor: string | null,
	limit = 20
): Promise<
	InfiniteResult<{
		action: string;
		actorName: string | null;
		createdAt: Date;
		id: string;
		targetId: string | null;
	}>
> {
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const rows = await db
		.select({
			action: userActivityLog.action,
			actorName: userTable.name,
			createdAt: userActivityLog.createdAt,
			id: userActivityLog.id,
			targetId: userActivityLog.targetId,
		})
		.from(userActivityLog)
		.leftJoin(userTable, eq(userTable.id, userActivityLog.actorUserId))
		.where(
			and(
				ilike(userActivityLog.action, "user.%"),
				decoded
					? sql`(${userActivityLog.createdAt}, ${userActivityLog.id}) < (${decoded.createdAt}::timestamp, ${decoded.id})`
					: undefined
			)
		)
		.orderBy(desc(userActivityLog.createdAt), desc(userActivityLog.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;

	return { items, nextCursor };
}
```

- [ ] **Step 2: Substituir `fetchUserActivityFeedPage` em `actions.ts`**

Trocar a função inteira (linha ~543):

```ts
export async function fetchUserActivityFeedPage(
	cursor: string | null
): Promise<
	import("@/lib/infinite").InfiniteResult<
		import("@/components/activity-feed").ActivityEvent
	>
> {
	await requireCapabilityWithContext("users.manage", {});
	const { getUserActivityFeedPaginated } = await import("./data");
	const page = await getUserActivityFeedPaginated(cursor);
	return {
		items: page.items.map((a) => ({
			id: a.id,
			kind: "user" as const,
			primary: humanizeActivityAction(a.action, a.actorName ?? "—"),
			at: a.createdAt,
			href: a.targetId ? `/dashboard/users/${a.targetId}` : undefined,
		})),
		nextCursor: page.nextCursor,
	};
}
```

- [ ] **Step 3: Run check-types**

Run: `bun check-types`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/users/data.ts apps/web/src/app/dashboard/users/actions.ts
git commit -m "feat(users): paginação real no feed de atividade"
```

---

## Fase 6 — Bulk reject

### Task 16: Server action `bulkRejectUsers`

**Files:**
- Modify: `apps/web/src/app/dashboard/users/actions.ts`

- [ ] **Step 1: Adicionar action**

Após `rejectUser`:

```ts
export async function bulkRejectUsers(
	input: unknown
): Promise<ActionResult<{ rejected: number; skipped: number }>> {
	const parsed = bulkRejectSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const session = await requireCapability("users.approve");

	const targets = await db
		.select({
			id: userTable.id,
			email: userTable.email,
			name: userTable.name,
			status: userTable.status,
		})
		.from(userTable)
		.where(inArray(userTable.id, parsed.data.userIds));

	const validIds = targets
		.filter((t) => t.status === "pending")
		.map((t) => t.id);
	const skipped = parsed.data.userIds.length - validIds.length;

	if (validIds.length === 0) {
		return { ok: true, data: { rejected: 0, skipped } };
	}

	try {
		await db.delete(userTable).where(inArray(userTable.id, validIds));
	} catch (error) {
		logger.error("bulkRejectUsers falhou", error);
		return { ok: false, error: "Falha ao rejeitar em massa" };
	}

	await Promise.all(
		targets
			.filter((t) => validIds.includes(t.id))
			.map((t) =>
				logUserActivity({
					actorUserId: session.user.id,
					action: "user.rejected",
					targetType: "user",
					targetId: t.id,
					metadata: {
						rejectedEmail: t.email,
						rejectedName: t.name,
						bulk: true,
						...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
					},
				})
			)
	);

	revalidatePath(USERS_PATH);
	return { ok: true, data: { rejected: validIds.length, skipped } };
}
```

- [ ] **Step 2: Adicionar import `inArray` e `bulkRejectSchema`**

No topo de `actions.ts`, garantir que `inArray` está em `from "drizzle-orm"` e `bulkRejectSchema` no import de `./schema`.

- [ ] **Step 3: Run check-types + tests**

Run: `bun check-types && bun --filter web test`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/users/actions.ts
git commit -m "feat(users): bulkRejectUsers (rejeitar pendentes em massa)"
```

### Task 17: Multi-select no `UsersPendingCard`

**Files:**
- Create: `apps/web/src/app/dashboard/users/_components/bulk-pending-selection.tsx`
- Modify: `apps/web/src/app/dashboard/users/_components/users-pending-card.tsx`

- [ ] **Step 1: Criar wrapper de seleção**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Checkbox } from "@emach/ui/components/checkbox";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { PendingRow } from "@/components/pending-panel";

import { bulkRejectUsers } from "../actions";

interface Props {
	initial: PendingRow[];
}

export function BulkPendingSelection({ initial }: Props) {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [submitting, startTransition] = useTransition();

	const toggle = (id: string, on: boolean) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (on) {
				next.add(id);
			} else {
				next.delete(id);
			}
			return next;
		});
	};

	const allOn = selected.size === initial.length && initial.length > 0;
	const toggleAll = (on: boolean) => {
		setSelected(on ? new Set(initial.map((r) => r.id)) : new Set());
	};

	const onBulkReject = () => {
		const ids = Array.from(selected);
		if (ids.length === 0) {
			return;
		}
		startTransition(async () => {
			const res = await bulkRejectUsers({ userIds: ids });
			if (res.ok) {
				toast.success(
					`${res.data.rejected} rejeitado(s); ${res.data.skipped} ignorado(s)`
				);
				setSelected(new Set());
			} else {
				toast.error(res.error);
			}
		});
	};

	if (initial.length === 0) {
		return (
			<p className="px-3 py-6 text-center text-muted-foreground text-sm">
				Nenhum usuário aguardando aprovação.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2 px-2">
				<label className="flex items-center gap-2 text-xs">
					<Checkbox
						checked={allOn}
						onCheckedChange={(v) => toggleAll(Boolean(v))}
					/>
					Selecionar todos
				</label>
				<Button
					disabled={selected.size === 0 || submitting}
					onClick={onBulkReject}
					size="sm"
					variant="destructive"
				>
					<Trash2 aria-hidden className="mr-1.5 size-3.5" />
					Rejeitar selecionados ({selected.size})
				</Button>
			</div>
			<ul className="flex flex-col gap-1">
				{initial.map((r) => (
					<li
						className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
						key={r.id}
					>
						<Checkbox
							checked={selected.has(r.id)}
							onCheckedChange={(v) => toggle(r.id, Boolean(v))}
						/>
						<Link
							className="flex min-w-0 flex-1 flex-col"
							href={r.href}
						>
							<span className="truncate font-medium text-sm">{r.primary}</span>
							<span className="truncate text-muted-foreground text-xs">
								{r.secondary}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
```

- [ ] **Step 2: Substituir `users-pending-card.tsx`**

```tsx
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Badge } from "@emach/ui/components/badge";

import type { PendingRow } from "@/components/pending-panel";

import { BulkPendingSelection } from "./bulk-pending-selection";

interface Props {
	count: number;
	initial: PendingRow[];
	initialCursor: string | null;
}

export function UsersPendingCard({ initial, count }: Props) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<CardTitle className="text-base">Aprovações</CardTitle>
				<Badge variant={count > 0 ? "warning" : "default"}>{count}</Badge>
			</CardHeader>
			<CardContent>
				<BulkPendingSelection initial={initial} />
			</CardContent>
		</Card>
	);
}
```

(Trade-off explícito: trocamos o `PendingPanel` genérico por uma versão custom com bulk. Perdemos paginação infinita do panel — para essa iteração, aceitamos. Se a lista crescer, voltar e re-aplicar paginação dentro do `BulkPendingSelection`.)

- [ ] **Step 3: Run check-types + tests**

Run: `bun check-types && bun --filter web test`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/users/_components
git commit -m "feat(users): bulk-select e bulk-reject de pendentes"
```

---

## Fase 7 — Smoke e docs finais

### Task 18: Smoke run-time no dashboard

Type check e Vitest **não cobrem** SQL inválido em template strings e UI runtime. Documentado em `apps/web/CLAUDE.md` → "Smoke run-time".

**Files:** nenhum (sessão interativa)

- [ ] **Step 1: Subir dev server**

Run em background: `bun dev:web`

Aguardar `Ready in ...`. Porta default 3000.

- [ ] **Step 2: Smoke das rotas afetadas**

Para cada item abaixo, abrir a rota e validar:

1. **`/dashboard/users`**
	- Cards renderizam com chips de filial.
	- Filtros (status tab, role, branchId, search) reagem.
	- KPIs corretos.
	- Card "Aprovações" mostra checkboxes; selecionar 1+ + "Rejeitar selecionados" abre toast com contagem.
	- ActivityFeed paginado: scroll deve trazer próxima página (após Task 15).

2. **`/dashboard/users/[id]`** (escolher um active e um suspended)
	- Header tem **Editar** + kebab `⋮`. Para active: menu mostra Suspender. Para suspended: Reativar.
	- Suspender abre AlertDialog com textarea; "Suspender" desabilitado se reason < 10 chars; submit OK desloga o user e troca o StatusBadge.
	- Aba Perfil: rodapé tem card vermelho "Zona de perigo" se logado como super_admin; vazio se não.
	- Aba Filiais: link/unlink funciona; tentativa de unlink de filial fora do escopo do ator atual deve retornar erro (testar com ator manager).
	- Aba Atividade: duas sub-tabs. "Feito com" default; "Feito por" mostra ações do user.
	- Aba Segurança: Reset de senha + Forçar logout funcionam (smoke leve).

3. **Edit Sheet (`?edit=1`)**
	- Não mostra mais combobox de branches.
	- Trocar role + Salvar: deve fazer logout do alvo (verificar deletando sessão na aba Sessions depois).

- [ ] **Step 3: Console limpo**

Verificar no DevTools / `bun dev:web` stderr: nenhum `error` ou warning não previsto.

Run para puxar erros do Next: `mcp__next-devtools__nextjs_call` com `get_errors` se MCP disponível. Senão checar terminal manualmente.

- [ ] **Step 4: Parar server**

Encerrar com Ctrl+C ou `kill <pid>`.

### Task 19: Update final do `apps/web/CLAUDE.md`

**Files:**
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Substituir parágrafo do `audit.read`**

(Já feito em Task 3 step 5; confirmar que está como "admin herda" sem o "fix pendente".)

- [ ] **Step 2: Adicionar nota em "Convenções de UX em forms" sobre o `DestructiveActionDialog`**

Adicionar ao final da seção:

```md
- **Ações destrutivas com reason:** padrão é `DestructiveActionDialog` (`apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx`). Reason min 10 chars quando `reasonRequired=true` (suspend/delete); opcional em reject. Persistir em `metadata.reason` via `logUserActivity`.
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs: registra DestructiveActionDialog em CLAUDE.md"
```

### Task 20: Atualizar `apps/web/CLAUDE.md` e `packages/db/CLAUDE.md` sobre cascade

**Files:**
- Modify: `packages/db/CLAUDE.md`

- [ ] **Step 1: Adicionar nota em `packages/db/CLAUDE.md`**

Após a seção "Convenções de schema", adicionar:

```md
## Audit / atores deletáveis

Quando um user pode ser deletado e a tabela tem FK `actorUserId` pra `user`, preferir `onDelete: 'set null'` + cachear `actorName` no `metadata`. Padrão aplicado em `user_activity_log` (ver ADR-0011). Cascade só quando o registro **não tem valor sem o ator** (raro).
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/CLAUDE.md
git commit -m "docs(db): convenção set null + actorName cacheado"
```

---

## Self-review

**1. Spec coverage:**
- ✅ Convite/entrada de staff — não muda (ADR-0010).
- ✅ Suspender/Reativar UI — Task 10 (kebab).
- ✅ Excluir UI — Task 11 (Danger Zone).
- ✅ Aba Atividade dual — Tasks 12, 14.
- ✅ Cascade → set null + actorName — Tasks 1, 2.
- ✅ Reason em suspend/delete; opcional reject — Task 5.
- ✅ ApprovalSheet roles por capability — Task 8.
- ✅ Branches em 2 lugares — Tasks 6 (remove do sheet).
- ✅ rejectUser DELETE físico — preservado em Task 5 step 5a.
- ✅ Bulk reject — Tasks 16, 17.
- ✅ Audit.read fix — Task 3.
- ✅ Scoping link/unlink (P0) — Task 4.
- ✅ Sessão pós-role-change — Task 6 step 3 (consolidado).
- ✅ Paginação real do feed — Task 15.
- ✅ Card "branch sem staff" (gap menor de outra rota) — fora do escopo (`/dashboard/branches`).

**2. Placeholders:** nenhum "TBD" / "implementar depois". Onde apontei "se `InfiniteList` não tem essa API" (Task 14 step 1), dei comando de verificação imediato + fallback concreto.

**3. Type consistency:**
- `allowedApprovalRoles(actorRole: UserRole)` consistente entre `_lib/approval-roles.ts`, `user-edit-sheet.tsx`, `approval-sheet.tsx`.
- `DestructiveActionDialog` props (`open, title, description, confirmLabel, onConfirm, onCancel, submitting, reasonRequired`) consistentes nos 3 callers (suspend, reactivate, delete).
- `bulkRejectSchema.userIds` (array) → `bulkRejectUsers({ userIds })` → `BulkPendingSelection { userIds: ids }`.
- `UserActivityRow & { actorName: string | null }` consistente entre `getUserAffectedActivity` e `ActivityAffectingUserView`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-dashboard-users-completar-fluxo.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatcho um subagent fresh por task; review entre tasks; fast iteration.

**2. Inline Execution** — executo as tasks nesta sessão via `executing-plans`; batch com checkpoints.

Para esse plano (20 tasks, mix de schema/types/UI/testes), **Subagent-Driven** é a escolha natural: cada task é self-contained, output flooda o contexto e o review intermediário pega regressões cedo. Inline ficaria pesado.

Qual abordagem?
