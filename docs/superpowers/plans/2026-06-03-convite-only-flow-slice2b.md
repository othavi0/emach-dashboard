# Fluxo Convite-Only (Slice 2B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o fluxo self-cadastro → pending → aprovação por **convite-only**: admin convida (email + role + filiais) → usuário recebe email tokenizado → define nome + senha → loga.

**Architecture:** O convite cria o usuário já como `status='pending'` ("convidado") via `authDashboard.$context.internalAdapter.createUser` (sem credential). Um token de convite próprio (colunas em `user`, 7d, single-use) viaja no email. O aceite cria a credential (`internalAdapter.createAccount` + `password.hash`), ativa o user e loga via `signInEmail`. Reset de senha (Slice 2A) já está funcional e fica intacto. Verificação de email permanece removida.

**Tech Stack:** Next 16 (RSC + server actions), React 19, Better Auth 1.6.11 (`$context`/internalAdapter — validado em runtime), Drizzle/Supabase (push-only), `@emach/email` (Resend + React Email), Zod, sonner.

**Pré-validado nesta sessão (não repetir):**
- `await authDashboard.$context` resolve; `internalAdapter.createUser/createAccount/deleteUser` e `password.hash` funcionam fora de endpoint context (probe standalone OK na 1.6.11; regressão do issue #6315 corrigida).
- MCP Resend autenticado; domínio `emachferramentas.com.br` verificado, sending enabled.

**Decisão de armazenamento do token:** colunas `inviteToken` + `inviteTokenExpiresAt` em `user` (não `verification`) — o convidado já É um user `pending`; facilita listar/expirar convites e exibir status. Token = `crypto.randomBytes(32).toString("base64url")` (256 bits), single-use, 7 dias.

**Capabilities:** `requireCapabilityWithContext` é no-op (ADR-0012) mas o padrão é obrigatório. Capabilities novas usadas: `users.invite` (convidar/reenviar/revogar). O aceite (`acceptInvite`) é **público** (sem sessão) — autentica pelo token, não por capability.

---

## File Structure

**Schema / dados:**
- Modify `packages/db/src/schema/auth.ts` — 2 colunas em `user`.
- Modify `apps/web/src/app/dashboard/users/schema.ts` — Zod: add invite, remove approve/reject/bulkReject.
- Modify `apps/web/src/app/dashboard/users/data.ts` — `getInviteByToken`; repurpose `fetchPendingUsersPage` (já serve, sem mudança).

**Email (`@emach/email`):**
- Create `packages/email/src/templates/invite.tsx` — `InviteEmail`.
- Modify `packages/email/src/send.tsx` — `sendInviteEmail`.

**Server actions:**
- Modify `apps/web/src/app/dashboard/users/actions.ts` — add `inviteUser`/`resendInvite`/`revokeInvite`/`acceptInvite`; remove `approveUser`/`rejectUser`/`bulkRejectUsers`.

**UI:**
- Create `apps/web/src/app/convite/page.tsx` — rota de aceite.
- Create `apps/web/src/components/auth/invite-accept-form.tsx`.
- Create `apps/web/src/app/dashboard/users/_components/invite-dialog.tsx` — ação primária.
- Create `apps/web/src/app/dashboard/users/_components/invite-pending-list.tsx` — substitui `bulk-pending-selection.tsx`.
- Modify `apps/web/src/app/dashboard/users/page.tsx` — botão "Convidar usuário"; tab "Pendentes"→"Convidados".
- Modify `apps/web/src/app/dashboard/users/_components/users-pending-card.tsx` — "Convites pendentes".
- Modify `apps/web/src/app/dashboard/users/_components/user-card.tsx` — remove ApprovalSheet + botão "Aprovar"; label "Convidado".
- Delete `apps/web/src/app/dashboard/users/_components/approval-sheet.tsx`.
- Delete `apps/web/src/app/dashboard/users/_components/bulk-pending-selection.tsx`.

---

## Task 1: Schema — colunas de convite em `user`

**Files:**
- Modify: `packages/db/src/schema/auth.ts:26-40`

- [ ] **Step 1: Adicionar colunas ao `user`**

Em `packages/db/src/schema/auth.ts`, dentro de `pgTable("user", {...})`, após `lastLoginAt`:

```ts
	lastLoginAt: timestamp("last_login_at"),
	inviteToken: text("invite_token").unique(),
	inviteTokenExpiresAt: timestamp("invite_token_expires_at"),
```

(Colunas nullable — push não-destrutivo, sem prompt TTY.)

- [ ] **Step 2: Aplicar no banco**

Run: `bun db:sync`
Expected: drizzle-kit reporta as 2 colunas novas + índice unique `user_invite_token_unique`, "Changes applied". Sem prompt de rename (são colunas novas).

- [ ] **Step 3: check-types do pacote db**

Run: `cd packages/db && bun check-types`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/auth.ts
git commit -m "feat(db): colunas de convite (inviteToken, inviteTokenExpiresAt) em user"
```

---

## Task 2: Zod schemas de convite

**Files:**
- Modify: `apps/web/src/app/dashboard/users/schema.ts`
- Test: `apps/web/src/app/dashboard/users/__tests__/invite-schema.test.ts` (criar)

- [ ] **Step 1: Escrever o teste falho**

Create `apps/web/src/app/dashboard/users/__tests__/invite-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { acceptInviteSchema, inviteUserSchema } from "../schema";

describe("inviteUserSchema", () => {
	it("aceita email + role + branchIds", () => {
		const r = inviteUserSchema.safeParse({
			email: "Novo@Emach.com.BR",
			role: "manager",
			branchIds: ["b1"],
		});
		expect(r.success).toBe(true);
		// normaliza email pra minúsculo
		if (r.success) {
			expect(r.data.email).toBe("novo@emach.com.br");
		}
	});

	it("exige >=1 filial salvo para super_admin", () => {
		expect(
			inviteUserSchema.safeParse({ email: "a@b.com", role: "manager", branchIds: [] })
				.success
		).toBe(false);
		expect(
			inviteUserSchema.safeParse({ email: "a@b.com", role: "super_admin", branchIds: [] })
				.success
		).toBe(true);
	});

	it("rejeita email inválido", () => {
		expect(
			inviteUserSchema.safeParse({ email: "nao-email", role: "user", branchIds: ["b1"] })
				.success
		).toBe(false);
	});
});

describe("acceptInviteSchema", () => {
	it("aceita token + nome + senha >=8", () => {
		const r = acceptInviteSchema.safeParse({
			token: "tok",
			name: "Fulano",
			password: "12345678",
		});
		expect(r.success).toBe(true);
	});

	it("rejeita senha curta e nome curto", () => {
		expect(
			acceptInviteSchema.safeParse({ token: "t", name: "Fulano", password: "123" }).success
		).toBe(false);
		expect(
			acceptInviteSchema.safeParse({ token: "t", name: "F", password: "12345678" }).success
		).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && bunx vitest run src/app/dashboard/users/__tests__/invite-schema.test.ts`
Expected: FAIL — `inviteUserSchema`/`acceptInviteSchema` não exportados.

- [ ] **Step 3: Implementar os schemas**

Em `apps/web/src/app/dashboard/users/schema.ts`:

1. **Remover** (não usados após esta slice): `approveUserSchema` + `ApproveUserInput`, `rejectUserSchema` + `RejectUserInput`, `bulkRejectSchema` + `BulkRejectInput`.

2. **Adicionar** após `const ROLES = [...] as const;`:

```ts
export const inviteUserSchema = z
	.object({
		email: z
			.string()
			.email("Email inválido")
			.transform((v) => v.trim().toLowerCase()),
		role: z.enum(ROLES),
		branchIds: z.array(z.string().min(1)),
	})
	.refine((d) => d.role === "super_admin" || d.branchIds.length >= 1, {
		message: "Selecione ao menos 1 filial",
		path: ["branchIds"],
	});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const inviteIdSchema = z.object({ userId: z.string().min(1) });
export type InviteIdInput = z.infer<typeof inviteIdSchema>;

export const acceptInviteSchema = z.object({
	token: z.string().min(1),
	name: z.string().min(2, "Informe seu nome").max(100),
	password: z.string().min(8, "Mínimo 8 caracteres").max(128),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && bunx vitest run src/app/dashboard/users/__tests__/invite-schema.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/schema.ts apps/web/src/app/dashboard/users/__tests__/invite-schema.test.ts
git commit -m "feat(users): schemas zod de convite (invite/accept) + remove approve/reject"
```

> Nota: o passo acima quebra temporariamente os imports de `approveUser`/`rejectUser`/`bulkRejectUsers` em `actions.ts` e nos componentes — resolvido nas Tasks 5, 9, 10. Se rodar `check-types` agora vai acusar; é esperado até a Task 10.

---

## Task 3: Template `InviteEmail`

**Files:**
- Create: `packages/email/src/templates/invite.tsx`
- Test: `packages/email/src/templates/__tests__/invite.test.tsx` (criar)

- [ ] **Step 1: Escrever o teste falho**

Create `packages/email/src/templates/__tests__/invite.test.tsx`:

```tsx
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { InviteEmail } from "../invite";

describe("InviteEmail", () => {
	it("renderiza HTML com o link de aceite e o convidante", async () => {
		const html = await render(
			<InviteEmail acceptUrl="https://x/convite?token=abc" inviterName="Maria" />
		);
		expect(html).toContain("https://x/convite?token=abc");
		expect(html).toContain("Maria");
		expect(html).toContain("Criar acesso");
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd packages/email && bunx vitest run src/templates/__tests__/invite.test.tsx`
Expected: FAIL — módulo `../invite` não existe.
(Se `vitest` não estiver configurado no pacote, rodar da raiz: `bunx vitest run packages/email/src/templates/__tests__/invite.test.tsx`.)

- [ ] **Step 3: Implementar o template** (espelha `password-reset.tsx`)

Create `packages/email/src/templates/invite.tsx`:

```tsx
import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Html,
	Preview,
	pixelBasedPreset,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

interface InviteEmailProps {
	acceptUrl: string;
	inviterName: string;
}

export function InviteEmail({ acceptUrl, inviterName }: InviteEmailProps) {
	return (
		<Html lang="pt-BR">
			<Tailwind
				config={{
					presets: [pixelBasedPreset],
					theme: { extend: { colors: { coral: "#cc785c" } } },
				}}
			>
				<Head />
				<Body className="bg-gray-100 font-sans">
					<Preview>Você foi convidado para o painel E-mach</Preview>
					<Container className="mx-auto max-w-xl p-6">
						<Section className="rounded-lg border border-gray-200 border-solid bg-white p-8">
							<Text className="m-0 font-bold text-coral text-sm tracking-widest">
								E-MACH
							</Text>
							<Heading className="mt-4 mb-2 font-normal text-2xl text-gray-900">
								Você foi convidado
							</Heading>
							<Text className="text-base text-gray-700">
								{inviterName} convidou você para o painel de gestão da E-mach.
								Clique abaixo para criar seu acesso definindo nome e senha. O
								convite expira em 7 dias.
							</Text>
							<Button
								className="my-4 box-border block rounded-md bg-coral px-5 py-3 text-center font-medium text-white no-underline"
								href={acceptUrl}
							>
								Criar acesso
							</Button>
							<Text className="text-gray-500 text-sm">
								Se você não esperava este convite, ignore este email.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

InviteEmail.PreviewProps = {
	acceptUrl: "https://exemplo.com/convite?token=abc123",
	inviterName: "Maria Souza",
} satisfies InviteEmailProps;

export default InviteEmail;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd packages/email && bunx vitest run src/templates/__tests__/invite.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/email/src/templates/invite.tsx packages/email/src/templates/__tests__/invite.test.tsx
git commit -m "feat(email): template InviteEmail (React Email)"
```

---

## Task 4: `sendInviteEmail`

**Files:**
- Modify: `packages/email/src/send.tsx`

- [ ] **Step 1: Adicionar a função de envio**

Em `packages/email/src/send.tsx`, adicionar o import e a função (mantendo `sendPasswordResetEmail` intacta):

```tsx
import { env } from "@emach/env/server";

import { resend } from "./client";
import { InviteEmail } from "./templates/invite";
import { PasswordResetEmail } from "./templates/password-reset";

export async function sendPasswordResetEmail({
	to,
	url,
}: {
	to: string;
	url: string;
}): Promise<void> {
	await resend.emails.send({
		from: env.EMAIL_FROM,
		to,
		subject: "Redefinir sua senha — E-mach",
		react: <PasswordResetEmail url={url} />,
	});
}

export async function sendInviteEmail({
	to,
	inviterName,
	acceptUrl,
}: {
	to: string;
	inviterName: string;
	acceptUrl: string;
}): Promise<void> {
	await resend.emails.send({
		from: env.EMAIL_FROM,
		to,
		subject: "Convite para o painel E-mach",
		react: <InviteEmail acceptUrl={acceptUrl} inviterName={inviterName} />,
	});
}
```

- [ ] **Step 2: check-types do pacote email**

Run: `cd packages/email && bun check-types`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add packages/email/src/send.tsx
git commit -m "feat(email): sendInviteEmail"
```

---

## Task 5: Server actions de convite (`inviteUser`, `resendInvite`, `revokeInvite`)

**Files:**
- Modify: `apps/web/src/app/dashboard/users/actions.ts`

- [ ] **Step 1: Ajustar imports**

No topo de `actions.ts`:
- Adicionar `import { sendInviteEmail } from "@emach/email/send";`
- Adicionar `import { env } from "@emach/env/server";`
- Adicionar `import { randomBytes } from "node:crypto";`
- No import de `./schema`, **remover** `ApproveUserInput`, `approveUserSchema`, `bulkRejectSchema`, `rejectUserSchema`; **adicionar** `acceptInviteSchema`, `inviteIdSchema`, `inviteUserSchema`, type `InviteUserInput`.
- Adicionar `import { allowedApprovalRoles } from "./_lib/approval-roles";`

- [ ] **Step 2: Remover `approveUser`, `rejectUser`, `bulkRejectUsers`**

Deletar as três funções inteiras (`approveUser` linhas ~43-97, `rejectUser` ~99-146, `bulkRejectUsers` ~148-205). Manter `updateUser`, `suspendUser`, etc.

- [ ] **Step 3: Adicionar um helper de criação de convite + as actions**

Adicionar após `ActionResult` (ou no fim do arquivo):

```ts
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function makeInviteToken(): { token: string; expiresAt: Date } {
	return {
		token: randomBytes(32).toString("base64url"),
		expiresAt: new Date(Date.now() + INVITE_TTL_MS),
	};
}

export async function inviteUser(
	input: InviteUserInput
): Promise<ActionResult> {
	const parsed = inviteUserSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "validação",
		};
	}

	const session = await requireCapabilityWithContext("users.invite", {
		targetBranchIds: parsed.data.branchIds,
	});

	if (!allowedApprovalRoles(session.user.role).includes(parsed.data.role)) {
		return { ok: false, error: "Você não pode atribuir esse cargo" };
	}

	const { email, role, branchIds } = parsed.data;

	const [existing] = await db
		.select({ id: userTable.id, status: userTable.status })
		.from(userTable)
		.where(eq(userTable.email, email))
		.limit(1);

	if (existing && existing.status !== "pending") {
		return { ok: false, error: "Já existe uma conta com esse email" };
	}

	const { token, expiresAt } = makeInviteToken();

	try {
		let userId: string;
		if (existing) {
			// Convite aberto pro mesmo email → regenera (reenvio implícito).
			userId = existing.id;
			await db
				.update(userTable)
				.set({ role, inviteToken: token, inviteTokenExpiresAt: expiresAt })
				.where(eq(userTable.id, userId));
		} else {
			const ctx = await authDashboard.$context;
			const created = await ctx.internalAdapter.createUser({
				email,
				name: "",
				emailVerified: true,
			});
			userId = created.id;
			await db
				.update(userTable)
				.set({ role, inviteToken: token, inviteTokenExpiresAt: expiresAt })
				.where(eq(userTable.id, userId));
		}

		// Revincula filiais (idempotente).
		await db.delete(userBranch).where(eq(userBranch.userId, userId));
		if (branchIds.length > 0) {
			await db
				.insert(userBranch)
				.values(branchIds.map((branchId) => ({ userId, branchId })));
		}

		await sendInviteEmail({
			to: email,
			inviterName: session.user.name,
			acceptUrl: `${env.BETTER_AUTH_URL}/convite?token=${token}`,
		});

		await logUserActivity({
			actorUserId: session.user.id,
			action: "user.invited",
			targetType: "user",
			targetId: userId,
			metadata: { email, role, branchIds, resend: Boolean(existing) },
		});
	} catch (error) {
		logger.error("inviteUser falhou", error);
		return { ok: false, error: "Não foi possível enviar o convite" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function resendInvite(input: unknown): Promise<ActionResult> {
	const parsed = inviteIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const session = await requireCapabilityWithContext("users.invite", {
		targetUserId: parsed.data.userId,
	});

	const [target] = await db
		.select({
			email: userTable.email,
			status: userTable.status,
		})
		.from(userTable)
		.where(eq(userTable.id, parsed.data.userId))
		.limit(1);

	if (!target || target.status !== "pending") {
		return { ok: false, error: "Convite não encontrado" };
	}

	const { token, expiresAt } = makeInviteToken();

	try {
		await db
			.update(userTable)
			.set({ inviteToken: token, inviteTokenExpiresAt: expiresAt })
			.where(eq(userTable.id, parsed.data.userId));

		await sendInviteEmail({
			to: target.email,
			inviterName: session.user.name,
			acceptUrl: `${env.BETTER_AUTH_URL}/convite?token=${token}`,
		});

		await logUserActivity({
			actorUserId: session.user.id,
			action: "user.invite_resent",
			targetType: "user",
			targetId: parsed.data.userId,
			metadata: { email: target.email },
		});
	} catch (error) {
		logger.error("resendInvite falhou", error);
		return { ok: false, error: "Não foi possível reenviar o convite" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function revokeInvite(input: unknown): Promise<ActionResult> {
	const parsed = inviteIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}

	const session = await requireCapabilityWithContext("users.invite", {
		targetUserId: parsed.data.userId,
	});

	const [target] = await db
		.select({ email: userTable.email, status: userTable.status })
		.from(userTable)
		.where(eq(userTable.id, parsed.data.userId))
		.limit(1);

	if (!target || target.status !== "pending") {
		return { ok: false, error: "Só convites pendentes podem ser revogados" };
	}

	try {
		await db.delete(userTable).where(eq(userTable.id, parsed.data.userId));
		await logUserActivity({
			actorUserId: session.user.id,
			action: "user.invite_revoked",
			targetType: "user",
			targetId: parsed.data.userId,
			metadata: { email: target.email },
		});
	} catch (error) {
		logger.error("revokeInvite falhou", error);
		return { ok: false, error: "Não foi possível revogar o convite" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}
```

- [ ] **Step 4: Atualizar `humanizeActivityAction` e `formatActivityAction`**

Em `actions.ts` (`humanizeActivityAction`) **e** em `page.tsx` (`formatActivityAction`), trocar os cases de aprovação por convite. Substituir os cases `"user.approved"` e `"user.rejected"` por:

```ts
		case "user.invited":
			return `${actorName} convidou usuário`;
		case "user.invite_resent":
			return `${actorName} reenviou convite`;
		case "user.invite_revoked":
			return `${actorName} revogou convite`;
		case "user.invite_accepted":
			return `${actorName} aceitou convite`;
```

(Aplicar nas duas funções — são cópias.)

- [ ] **Step 5: Verificação parcial**

Run: `cd apps/web && bun check-types 2>&1 | grep -E "actions.ts|inviteUser|resendInvite|revokeInvite" || echo "sem erros nas actions de convite"`
Expected: sem erros referentes às novas actions (ainda podem existir erros em componentes que importam `approveUser`/`bulkRejectUsers` — resolvidos nas Tasks 9-10).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/users/actions.ts apps/web/src/app/dashboard/users/page.tsx
git commit -m "feat(users): inviteUser/resendInvite/revokeInvite via internalAdapter"
```

---

## Task 6: `getInviteByToken` (validação do token)

**Files:**
- Modify: `apps/web/src/app/dashboard/users/data.ts`

- [ ] **Step 1: Adicionar a função de leitura**

No fim de `data.ts` (usa `db`, `userTable`/`user`, `eq`, `and` já importados — confirmar imports no topo; `gt` de drizzle pode faltar, adicionar):

```ts
export interface InviteByToken {
	userId: string;
	email: string;
}

export async function getInviteByToken(
	token: string
): Promise<InviteByToken | null> {
	const [row] = await db
		.select({
			userId: userTable.id,
			email: userTable.email,
			status: userTable.status,
			expiresAt: userTable.inviteTokenExpiresAt,
		})
		.from(userTable)
		.where(eq(userTable.inviteToken, token))
		.limit(1);

	if (!row || row.status !== "pending") {
		return null;
	}
	if (!row.expiresAt || row.expiresAt.getTime() < Date.now()) {
		return null;
	}
	return { userId: row.userId, email: row.email };
}
```

(Verificar que `userTable` é o alias usado em `data.ts` — é `user as userTable` no import; se o arquivo importa como `user`, ajustar.)

- [ ] **Step 2: check-types**

Run: `cd apps/web && bun check-types 2>&1 | grep "data.ts" || echo "data.ts ok"`
Expected: `data.ts ok`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/users/data.ts
git commit -m "feat(users): getInviteByToken (valida token de convite)"
```

---

## Task 7: `acceptInvite` (server action pública)

**Files:**
- Modify: `apps/web/src/app/dashboard/users/actions.ts`

- [ ] **Step 1: Adicionar imports necessários**

No topo de `actions.ts`:
- `import { headers } from "next/headers";`
- garantir `acceptInviteSchema` no import de `./schema` (feito na Task 5).
- `import { getInviteByToken } from "./data";` **ou** usar `await import("./data")` (padrão já usado para `fetchUsersPage`). Preferir import dinâmico pra manter consistência com o resto do arquivo:

- [ ] **Step 2: Implementar `acceptInvite`**

Adicionar ao `actions.ts`:

```ts
export async function acceptInvite(input: unknown): Promise<ActionResult> {
	const parsed = acceptInviteSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "validação",
		};
	}

	const { getInviteByToken } = await import("./data");
	const invite = await getInviteByToken(parsed.data.token);
	if (!invite) {
		return { ok: false, error: "Convite inválido ou expirado" };
	}

	try {
		const ctx = await authDashboard.$context;
		await ctx.internalAdapter.createAccount({
			accountId: invite.userId,
			providerId: "credential",
			userId: invite.userId,
			password: await ctx.password.hash(parsed.data.password),
		});

		await db
			.update(userTable)
			.set({
				name: parsed.data.name,
				status: "active",
				inviteToken: null,
				inviteTokenExpiresAt: null,
			})
			.where(eq(userTable.id, invite.userId));

		await authDashboard.api.signInEmail({
			body: { email: invite.email, password: parsed.data.password },
			headers: await headers(),
		});

		await logUserActivity({
			actorUserId: invite.userId,
			action: "user.invite_accepted",
			targetType: "user",
			targetId: invite.userId,
		});
	} catch (error) {
		logger.error("acceptInvite falhou", error);
		return { ok: false, error: "Não foi possível concluir o cadastro" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}
```

> `signInEmail` dentro de server action seta o cookie via `nextCookies()` (último plugin no `dashboard.ts`). O client navega pra `/dashboard` no sucesso. `disableSignUp: true` não afeta `signInEmail` (validado no spec §5).

- [ ] **Step 3: check-types**

Run: `cd apps/web && bun check-types 2>&1 | grep -E "acceptInvite|actions.ts" || echo "acceptInvite ok"`
Expected: sem erros na `acceptInvite`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/users/actions.ts
git commit -m "feat(users): acceptInvite (cria credential + ativa + signInEmail)"
```

---

## Task 8: Rota `/convite` + `InviteAcceptForm`

**Files:**
- Create: `apps/web/src/components/auth/invite-accept-form.tsx`
- Create: `apps/web/src/app/convite/page.tsx`

- [ ] **Step 1: `InviteAcceptForm` (client)** — espelha `reset-password-form.tsx`

Create `apps/web/src/components/auth/invite-accept-form.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { acceptInvite } from "@/app/dashboard/users/actions";

export function InviteAcceptForm({
	token,
	email,
}: {
	token: string;
	email: string;
}) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		const formData = new FormData(event.currentTarget);
		const name = String(formData.get("name") ?? "").trim();
		const password = String(formData.get("password") ?? "");
		const confirm = String(formData.get("confirm") ?? "");

		if (password !== confirm) {
			setErrorMessage("As senhas não coincidem.");
			return;
		}

		setIsSubmitting(true);
		const result = await acceptInvite({ token, name, password });
		if (result.ok) {
			router.replace("/dashboard");
			router.refresh();
		} else {
			setErrorMessage(result.error);
			setIsSubmitting(false);
		}
	};

	return (
		<div>
			<h1 className="font-medium font-serif text-3xl tracking-tight">
				Criar acesso
			</h1>
			<p className="mt-1 text-muted-foreground text-sm">
				Defina seu nome e senha para entrar no painel.
			</p>

			<form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
				{errorMessage ? (
					<p
						className="rounded-md border border-destructive/55 bg-destructive/12 px-3 py-2 text-destructive text-sm"
						role="alert"
					>
						{errorMessage}
					</p>
				) : null}

				<div className="flex flex-col gap-2">
					<Label htmlFor="email">Email</Label>
					<Input
						defaultValue={email}
						disabled
						id="email"
						name="email"
						type="email"
					/>
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="name">Nome</Label>
					<Input
						autoComplete="name"
						id="name"
						minLength={2}
						name="name"
						placeholder="Seu nome completo"
						required
					/>
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="password">Senha</Label>
					<div className="relative">
						<Input
							autoComplete="new-password"
							className="pr-10"
							id="password"
							minLength={8}
							name="password"
							placeholder="Mínimo 8 caracteres"
							required
							type={showPassword ? "text" : "password"}
						/>
						<Button
							aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
							className="absolute top-1/2 right-1 -translate-y-1/2"
							onClick={() => setShowPassword((v) => !v)}
							size="icon-sm"
							type="button"
							variant="ghost"
						>
							{showPassword ? (
								<EyeOff aria-hidden className="size-4" />
							) : (
								<Eye aria-hidden className="size-4" />
							)}
						</Button>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="confirm">Confirmar senha</Label>
					<Input
						autoComplete="new-password"
						id="confirm"
						minLength={8}
						name="confirm"
						placeholder="Repita a senha"
						required
						type={showPassword ? "text" : "password"}
					/>
				</div>

				<Button disabled={isSubmitting} type="submit">
					{isSubmitting ? "Criando acesso..." : "Criar acesso e entrar"}
				</Button>
			</form>
		</div>
	);
}
```

- [ ] **Step 2: Rota `/convite`** — espelha `redefinir-senha/page.tsx`

Create `apps/web/src/app/convite/page.tsx`:

```tsx
import { getInviteByToken } from "@/app/dashboard/users/data";
import { AuthShell } from "@/components/auth/auth-shell";
import { InviteAcceptForm } from "@/components/auth/invite-accept-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;
	const invite = token ? await getInviteByToken(token) : null;

	return (
		<AuthShell>
			{invite ? (
				<InviteAcceptForm email={invite.email} token={token as string} />
			) : (
				<div>
					<h1 className="font-medium font-serif text-3xl tracking-tight">
						Convite inválido
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						Este convite não é válido ou expirou. Peça para um administrador
						enviar um novo.
					</p>
				</div>
			)}
		</AuthShell>
	);
}
```

- [ ] **Step 3: Confirmar `/convite` na lista de rotas de auth do header**

Verificar `apps/web/src/components/app-header.tsx`: `/convite` já está em `AUTH_ROUTES` (handoff confirma). Se não estiver, adicionar.

Run: `rg -n "convite" apps/web/src/components/app-header.tsx`
Expected: `/convite` presente em `AUTH_ROUTES`.

- [ ] **Step 4: check-types**

Run: `cd apps/web && bun check-types 2>&1 | grep -E "convite|invite-accept" || echo "rota convite ok"`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/convite apps/web/src/components/auth/invite-accept-form.tsx
git commit -m "feat(auth): rota /convite + InviteAcceptForm"
```

---

## Task 9: `InviteDialog` (ação primária da página de usuários)

**Files:**
- Create: `apps/web/src/app/dashboard/users/_components/invite-dialog.tsx`
- Modify: `apps/web/src/app/dashboard/users/page.tsx`

- [ ] **Step 1: `InviteDialog` (client)** — reusa `RoleSelect` + `BranchesCombobox`

Create `apps/web/src/app/dashboard/users/_components/invite-dialog.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@emach/ui/components/dialog";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { allowedApprovalRoles } from "../_lib/approval-roles";
import { inviteUser } from "../actions";
import { BranchesCombobox } from "./branches-combobox";
import { RoleSelect } from "./role-select";
import type { BranchLite, UserRow } from "./types";

interface Props {
	actorRole: UserRow["role"];
	branches: BranchLite[];
}

export function InviteDialog({ actorRole, branches }: Props) {
	const router = useRouter();
	const allowed = allowedApprovalRoles(actorRole);
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<UserRow["role"]>(allowed.at(-1) ?? "user");
	const [branchIds, setBranchIds] = useState<string[]>([]);
	const [submitting, startTransition] = useTransition();

	function reset() {
		setEmail("");
		setRole(allowed.at(-1) ?? "user");
		setBranchIds([]);
	}

	function handleSubmit() {
		startTransition(async () => {
			const result = await inviteUser({ email, role, branchIds });
			if (result.ok) {
				toast.success("Convite enviado");
				reset();
				setOpen(false);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<Dialog
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					reset();
				}
			}}
			open={open}
		>
			<DialogTrigger
				render={
					<Button size="sm">
						<UserPlus aria-hidden className="mr-1.5 size-4" />
						Convidar usuário
					</Button>
				}
			/>
			<DialogContent className="flex flex-col gap-4">
				<DialogHeader>
					<DialogTitle>Convidar usuário</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Label htmlFor="invite-email">Email</Label>
					<Input
						id="invite-email"
						onChange={(e) => setEmail(e.target.value)}
						placeholder="pessoa@emach.com.br"
						type="email"
						value={email}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label>Cargo</Label>
					<RoleSelect
						allowedRoles={allowed}
						disabled={submitting}
						onChange={setRole}
						value={role}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label>Filiais</Label>
					<BranchesCombobox
						branches={branches}
						disabled={submitting || role === "super_admin"}
						onChange={setBranchIds}
						value={branchIds}
					/>
				</div>
				<DialogFooter>
					<DialogClose
						disabled={submitting}
						render={<Button variant="ghost">Cancelar</Button>}
					/>
					<Button disabled={submitting || !email} onClick={handleSubmit}>
						{submitting ? "Enviando..." : "Enviar convite"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

> Confirmar que `@emach/ui/components/dialog` exporta `Dialog/DialogContent/DialogTrigger/DialogHeader/DialogTitle/DialogFooter/DialogClose`. Se a API diferir (ex: sem `DialogFooter`), ajustar pro que o pacote expõe — checar `rg "export" packages/ui/src/components/dialog.tsx`.

- [ ] **Step 2: Adicionar o botão ao `PageHeader` em `page.tsx`**

Em `apps/web/src/app/dashboard/users/page.tsx`:
- `import { InviteDialog } from "./_components/invite-dialog";`
- O `PageHeader` aceita `actions`? Verificar: `rg -n "actions" apps/web/src/components/page-header.tsx`. Se aceitar, passar `actions={<InviteDialog actorRole={...} branches={branches} />}`. Se não, renderizar o `InviteDialog` num wrapper flex ao lado do `PageHeader`:

```tsx
			<div className="flex items-start justify-between gap-3">
				<PageHeader
					description="Equipe interna do Emach — convites, cargos e filiais."
					title="Usuários"
				/>
				<InviteDialog
					actorRole={actorSession.user.role as UserListRow["role"]}
					branches={branches}
				/>
			</div>
```

- [ ] **Step 3: check-types**

Run: `cd apps/web && bun check-types 2>&1 | grep -E "invite-dialog|page.tsx" || echo "invite-dialog ok"`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/users/_components/invite-dialog.tsx apps/web/src/app/dashboard/users/page.tsx
git commit -m "feat(users): InviteDialog como ação primária da página"
```

---

## Task 10: Remoções + relabel (pending → convidado)

**Files:**
- Create: `apps/web/src/app/dashboard/users/_components/invite-pending-list.tsx`
- Delete: `apps/web/src/app/dashboard/users/_components/bulk-pending-selection.tsx`
- Delete: `apps/web/src/app/dashboard/users/_components/approval-sheet.tsx`
- Modify: `apps/web/src/app/dashboard/users/_components/users-pending-card.tsx`
- Modify: `apps/web/src/app/dashboard/users/_components/user-card.tsx`
- Modify: `apps/web/src/app/dashboard/users/page.tsx`

- [ ] **Step 1: `invite-pending-list.tsx`** (substitui `bulk-pending-selection`, com resend/revoke)

Create `apps/web/src/app/dashboard/users/_components/invite-pending-list.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import type { PendingRow } from "@/components/pending-panel";

import { resendInvite, revokeInvite } from "../actions";

interface Props {
	initial: PendingRow[];
}

export function InvitePendingList({ initial }: Props) {
	const router = useRouter();
	const [submitting, startTransition] = useTransition();

	function handleResend(id: string) {
		startTransition(async () => {
			const res = await resendInvite({ userId: id });
			if (res.ok) {
				toast.success("Convite reenviado");
			} else {
				toast.error(res.error);
			}
		});
	}

	function handleRevoke(id: string) {
		startTransition(async () => {
			const res = await revokeInvite({ userId: id });
			if (res.ok) {
				toast.success("Convite revogado");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	}

	if (initial.length === 0) {
		return (
			<p className="px-3 py-6 text-center text-muted-foreground text-sm">
				Nenhum convite pendente.
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-1">
			{initial.map((r) => (
				<li
					className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
					key={r.id}
				>
					<Link className="flex min-w-0 flex-1 flex-col" href={r.href}>
						<span className="truncate font-medium text-sm">{r.primary}</span>
						<span className="truncate text-muted-foreground text-xs">
							{r.secondary}
						</span>
					</Link>
					<Button
						aria-label="Reenviar convite"
						disabled={submitting}
						onClick={() => handleResend(r.id)}
						size="icon-sm"
						variant="ghost"
					>
						<RotateCw aria-hidden className="size-3.5" />
					</Button>
					<Button
						aria-label="Revogar convite"
						disabled={submitting}
						onClick={() => handleRevoke(r.id)}
						size="icon-sm"
						variant="ghost"
					>
						<Trash2 aria-hidden className="size-3.5" />
					</Button>
				</li>
			))}
		</ul>
	);
}
```

> Confirmar que `Button` aceita `size="icon-sm"` (usado em `reset-password-form.tsx` — sim).

- [ ] **Step 2: Atualizar `users-pending-card.tsx`**

Substituir o uso de `BulkPendingSelection` por `InvitePendingList` e o título:

```tsx
import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";

import type { PendingRow } from "@/components/pending-panel";

import { InvitePendingList } from "./invite-pending-list";

interface Props {
	count: number;
	initial: PendingRow[];
	initialCursor: string | null;
}

export function UsersPendingCard({ initial, count }: Props) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<CardTitle className="text-base">Convites pendentes</CardTitle>
				<Badge variant={count > 0 ? "warning" : "default"}>{count}</Badge>
			</CardHeader>
			<CardContent>
				<InvitePendingList initial={initial} />
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 3: Atualizar `user-card.tsx`** — remover ApprovalSheet + botão "Aprovar"; relabel

- Remover `import { ApprovalSheet } from "./approval-sheet";` e `import { useState } from "react";` (se não usado em mais nada — `approving` sai).
- Remover o state `approving` e o `<ApprovalSheet ... />` no fim.
- Remover o bloco `{user.status === "pending" && (<Button ...>Aprovar</Button>)}` no footer.
- Trocar `STATUS_LABEL.pending` de `"Pendente"` para `"Convidado"`.
- O card vira só um `<div>` com navegação (sem o fragment `<>...</>` envolvendo o ApprovalSheet). Manter o `useRouter`.
- Se `actorRole`/`branches`/`onResolved` ficarem sem uso, remover das props **somente se** nenhum caller passar — checar `users-card-grid.tsx`. Se o grid passa, manter as props (aceitar não-uso causaria lint `noUnusedVariables`); melhor: remover as props não usadas **e** atualizar `users-card-grid.tsx` para não passá-las. Verificar com `rg -n "UserCard" apps/web/src`.

- [ ] **Step 4: Atualizar `page.tsx`** — tab "Pendentes" → "Convidados"

Trocar o texto da `TabsTrigger` de `value="pending"`:

```tsx
					Convidados
					<TabsCountBadge value={kpis.pending} />
```

- [ ] **Step 5: Deletar arquivos órfãos**

```bash
rm apps/web/src/app/dashboard/users/_components/approval-sheet.tsx
rm apps/web/src/app/dashboard/users/_components/bulk-pending-selection.tsx
```

- [ ] **Step 6: Caçar referências órfãs**

Run: `rg -n "ApprovalSheet|BulkPendingSelection|approveUser|rejectUser|bulkRejectUsers" apps/web/src`
Expected: **zero** ocorrências. Se houver (ex: testes em `_components/__tests__`), corrigir/remover.

- [ ] **Step 7: check-types + ultracite + testes**

Run:
```bash
cd apps/web && bun check-types
bunx ultracite check src/app/dashboard/users src/app/convite src/components/auth/invite-accept-form.tsx
bunx vitest run src/app/dashboard/users/__tests__
```
Expected: check-types limpo; ultracite limpo (salvo warnings que o código canônico também tem — ex: `role="button"` em card clicável); testes passam.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web/src/app/dashboard/users apps/web/src/app/dashboard/users/_components
git commit -m "refactor(users): convite substitui aprovação (pending→convidado); remove ApprovalSheet/bulkReject"
```

---

## Task 11: Verificação end-to-end (smoke ao vivo)

**Files:** nenhum (verificação).

- [ ] **Step 1: Render dos emails (sanidade)**

Run: `cd packages/email && bunx vitest run`
Expected: testes de `invite` e (se houver) `password-reset` passam.

- [ ] **Step 2: check-types de todos os pacotes tocados**

Run:
```bash
cd packages/db && bun check-types
cd ../email && bun check-types
cd ../../apps/web && bun check-types
```
Expected: tudo limpo.

- [ ] **Step 3: Smoke do convite no browser (porta 3001)**

Pré: dev server na 3001 (já rodando; log `/home/othavio/dev-3001.log`). Logar como super_admin (o **usuário** loga; nunca inserir credenciais por ele).

1. `/dashboard/users` → "Convidar usuário" → email de teste (`othavioquiliao+convite@gmail.com`) + role `manager` + 1 filial → "Enviar convite".
2. Toast "Convite enviado"; o convidado aparece em "Convites pendentes" e na tab "Convidados".
3. Confirmar entrega via MCP Resend: `list-emails`/`get-email` → `last_event=delivered`, subject "Convite para o painel E-mach".
4. Abrir o link `/convite?token=...` (numa aba anônima/deslogada — atenção ao autofill do Brave, ver [[reference_emach_dev_auth_smoke]]): form "Criar acesso" com email read-only.
5. Preencher nome + senha → "Criar acesso e entrar" → redireciona pra `/dashboard` **logado**.
6. Em `/dashboard/users`, o usuário agora está em "Ativos" com o role/filiais do convite.

- [ ] **Step 4: Smoke de reenviar/revogar**

1. Convidar outro email de teste → em "Convites pendentes", clicar reenviar (toast + novo email entregue) e revogar (some da lista).

- [ ] **Step 5: Erros via console/network se algo quebrar**

Se o aceite falhar, ler erros server-side: `nextjs_call 3001 get_errors` (MCP next-devtools) e console do browser (`read_console_messages onlyErrors`). Atenção ao risco residual: `signInEmail` contra credential criada via `internalAdapter` — se o login não pegar, inspecionar a row em `account` (provider `credential`, `password` preenchido).

- [ ] **Step 6: Limpar usuários de teste**

Via `/dashboard/users` → deletar os usuários de teste criados (action `deleteUser` existente), ou SQL direto se necessário.

- [ ] **Step 7: Commit final / branch**

Nada a commitar se tudo passou nos commits anteriores. Invocar `superpowers:finishing-a-development-branch` para decidir merge do PR #112 (já grande: login + email + reset + convite).

---

## Self-Review

**Spec coverage:**
- §3.1 convidar → Tasks 2, 5, 9. ✅
- §3.2 aceitar → Tasks 6, 7, 8. ✅
- §3.3 reset → já feito (Slice 2A), intacto. ✅
- §4 email (`sendInviteEmail`, `InviteEmail`) → Tasks 3, 4. ✅
- §5 mecanismo (`$context`/internalAdapter/signInEmail/disableSignUp) → validado em runtime + Tasks 5, 7. ✅
- §6 remoções (ApprovalSheet, approveUser, rejectUser, bulkRejectUsers, pending→convidado) → Task 10. ✅
- Token próprio 7d single-use desacoplado do reset → Task 1 (colunas) + Task 5 (geração) + Task 6 (validação). ✅
- Reenvio + revogação → Task 5 + Task 10 (UI). ✅

**Placeholder scan:** sem TBD/TODO; todo passo de código tem o código. Pontos com "verificar/confirmar" (API do `Dialog`, props de `UserCard`, `PageHeader.actions`, alias `userTable` em `data.ts`) são checagens de integração legítimas — cada uma tem comando `rg` para resolver, não placeholder.

**Type consistency:** `inviteUser(input: InviteUserInput)`, `acceptInvite(input: unknown)` + `acceptInviteSchema`, `getInviteByToken(token): InviteByToken | null`, `InvitePendingList({initial: PendingRow[]})`, `InviteDialog({actorRole, branches})`. Nomes de action batem entre actions.ts e os componentes (`inviteUser`/`resendInvite`/`revokeInvite`/`acceptInvite`). Activity actions (`user.invited`/`user.invite_resent`/`user.invite_revoked`/`user.invite_accepted`) consistentes entre `actions.ts` e `page.tsx`.
