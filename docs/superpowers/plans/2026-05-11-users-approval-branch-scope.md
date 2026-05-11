# Aprovação de usuários + escopo por filial + branch default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar fluxo de aprovação manual de signups, hierarquia `super_admin > admin > manager > user`, vinculação M:N user×filial com filtragem auto de queries, e substituir o env var `ECOMMERCE_DEFAULT_BRANCH_ID` por `branch.isDefault` no DB.

**Architecture:**
- Schema: adiciona `user.status`, role `super_admin`, tabela `user_branch`, `branch.isDefault`. Camada de capabilities reescrita com overload `targetUserId`/`targetBranchIds`.
- UI: rotas top-level `/pending` e `/suspended` sem chrome; `/dashboard/users` com tabs e sheet lateral; sidebar ganha grupo "Usuários" gated por `users.approve`.
- Cross-repo: dashboard expõe toggle `isDefault`; ecommerce lê via helper cacheado, env var removido.

**Tech Stack:** Bun 1.3, Turborepo 2.9, Next 16.2, React 19.2, Drizzle 0.45, Better Auth 1.5.5, Postgres (Supabase), shadcn/ui + Tailwind 4.1, Zod 4, Vitest 4.1.

**Spec de referência:** `docs/superpowers/specs/2026-05-11-users-approval-branch-scope-design.md`

**Convenções deste plano:**
- Toda alteração em arquivo `.ts`/`.tsx` é seguida de `bun fix` automático (PostToolUse hook) e `bun check-types --filter=<workspace>` no fim da task.
- Commits em PT, Conventional Commits, **sem** assinatura gpg forçada (`git commit -m "..."`).
- Quando uma task envolve nova rota Next, smoke run de `bun dev:web` no fim da fase correspondente.
- IDs: `crypto.randomUUID()` em todo INSERT no app (sem `nanoid`).

---

## Fase A — Schema + DB foundation

### Task A1: Adicionar `userStatusEnum` + coluna `user.status` no schema Drizzle

**Files:**
- Modify: `packages/db/src/schema/auth.ts`
- Modify: `packages/db/src/schema/index.ts` (barrel re-export)

- [ ] **Step 1: Editar `packages/db/src/schema/auth.ts` — adicionar enum + coluna**

Procurar o bloco `export const userRoleEnum = ...`. Logo abaixo, adicionar:

```ts
export const userStatusEnum = pgEnum("user_status", [
	"pending",
	"active",
	"suspended",
]);
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
```

Em `export const user = pgTable("user", { ... })`, depois da coluna `role`, antes de `createdAt`, adicionar:

```ts
status: userStatusEnum("status").notNull().default("pending"),
```

- [ ] **Step 2: Adicionar `super_admin` ao enum role**

Alterar a linha:

```ts
export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "user"]);
```

Para:

```ts
export const userRoleEnum = pgEnum("user_role", [
	"super_admin",
	"admin",
	"manager",
	"user",
]);
```

- [ ] **Step 3: Atualizar barrel `packages/db/src/schema/index.ts`**

Garantir que o re-export do módulo `auth` cobre os novos símbolos. O barrel re-exporta via `export * from "./auth"` — checar se existe e está atualizado. Se for re-export named, adicionar `userStatusEnum`, `UserStatus`.

- [ ] **Step 4: `bun check-types --filter=@emach/db` deve passar**

Run: `bun check-types --filter=@emach/db`
Expected: PASS (zero errors). Tipos derivados de `user.$inferSelect` agora incluem `status: UserStatus`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/auth.ts packages/db/src/schema/index.ts
git commit -m "feat(db): adicionar user.status enum e super_admin no role"
```

---

### Task A2: Adicionar `branch.isDefault` + tabela `user_branch`

**Files:**
- Modify: `packages/db/src/schema/inventory.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Editar `packages/db/src/schema/inventory.ts` — adicionar `isDefault` em `branch`**

No `pgTable("branch", { ... })` adicionar coluna depois de `address`:

```ts
isDefault: boolean("is_default").notNull().default(false),
```

Importar `boolean` de `drizzle-orm/pg-core` se ainda não está.

Adicionar `uniqueIndex` na tupla de table extras (depois da chave primária e índices existentes — não há `(table) => [...]` no `branch` hoje, então adicionar):

```ts
export const branch = pgTable(
	"branch",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		address: text("address"),
		isDefault: boolean("is_default").notNull().default(false),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("branch_is_default_unique")
			.on(table.isDefault)
			.where(sql`${table.isDefault} = true`),
	]
);
```

Adicionar imports faltantes: `boolean`, `uniqueIndex` de `drizzle-orm/pg-core`; `sql` já está.

- [ ] **Step 2: Adicionar tabela `user_branch` no mesmo arquivo**

No fim do `inventory.ts`, antes dos type exports:

```ts
import { user } from "./auth";

export const userBranch = pgTable(
	"user_branch",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		branchId: text("branch_id")
			.notNull()
			.references(() => branch.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.branchId] }),
		index("user_branch_user_idx").on(table.userId),
		index("user_branch_branch_idx").on(table.branchId),
	]
);

export const userBranchRelations = relations(userBranch, ({ one }) => ({
	user: one(user, {
		fields: [userBranch.userId],
		references: [user.id],
	}),
	branch: one(branch, {
		fields: [userBranch.branchId],
		references: [branch.id],
	}),
}));

export type UserBranch = typeof userBranch.$inferSelect;
export type NewUserBranch = typeof userBranch.$inferInsert;
```

- [ ] **Step 3: Garantir barrel exporta `userBranch`**

Em `packages/db/src/schema/index.ts`, se for `export * from "./inventory"` está coberto. Caso seja named re-export, adicionar `userBranch`, `userBranchRelations`, `UserBranch`, `NewUserBranch`.

- [ ] **Step 4: `bun check-types --filter=@emach/db`**

Run: `bun check-types --filter=@emach/db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/inventory.ts packages/db/src/schema/index.ts
git commit -m "feat(db): adicionar branch.is_default e tabela user_branch"
```

---

### Task A3: Permitir delete de user com `order_note` — tornar `authorId` nullable

**Files:**
- Modify: `packages/db/src/schema/orders.ts`

- [ ] **Step 1: Alterar FK de `orderNote.authorId`**

Procurar bloco:

```ts
authorId: text("author_id")
	.notNull()
	.references(() => user.id),
```

Substituir por:

```ts
authorId: text("author_id").references(() => user.id, {
	onDelete: "set null",
}),
```

(Remove `.notNull()`, adiciona onDelete.)

Verificar uso em queries que tratam `authorId` como obrigatório — em `apps/web/src/app/dashboard/orders/[id]/page.tsx` (renderização de notas) provavelmente trata como string. Após o schema change, o tipo vira `string | null`. Tratar com fallback `"Sistema"` quando null. Anotação para ajuste posterior (Task F8) — não exigir nesta task.

- [ ] **Step 2: `bun check-types --filter=@emach/db`**

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/orders.ts
git commit -m "feat(db): permitir order_note.author_id null para cascade de delete user"
```

---

### Task A4: Aplicar schema em DB (dev) + data migration manual

**Files:**
- (sem arquivos novos no repo)

- [ ] **Step 1: Rodar `bun db:push` em dev**

Run: `bun db:push`
Expected:
- Drizzle Kit detecta novas colunas, enum e tabela.
- Aceitar todas alterações (sem TTY ambiguity esperado).
- Output deve indicar: "Changes applied".

Se houver prompt ambíguo (rename detection), abortar e usar drop+recreate documentado em `packages/db/CLAUDE.md` (só em dev).

- [ ] **Step 2: Aplicar triggers existentes (idempotente)**

Run: `bun --cwd packages/db db:apply-triggers`
Expected: PASS. Garante triggers de categoria e idempotência de stock_movement.

- [ ] **Step 3: Data migration via psql**

Conectar ao DB com env `DATABASE_URL` resolvido:

```bash
psql "$DATABASE_URL" -c "UPDATE \"user\" SET status='active';"
psql "$DATABASE_URL" -c "UPDATE branch SET is_default=true WHERE id='br-curitiba';"
```

Se o user já tem 1 admin pessoal pra ser owner, executar também:

```bash
psql "$DATABASE_URL" -c "UPDATE \"user\" SET role='super_admin' WHERE email='<email-do-owner>';"
```

Substituir `<email-do-owner>` pelo email real (pedir confirmação ao operador antes).

- [ ] **Step 4: Verificar via `db:studio`**

Run: `bun db:studio`
Expected: tabela `user` mostra `status='active'` em todos rows; tabela `branch` mostra `is_default=true` em `br-curitiba` e false nos demais. Tabela `user_branch` existe (vazia).

- [ ] **Step 5: (sem commit — só DB)**

Schema change foi commitada em A1/A2/A3. Migration aplicada em dev é volátil.

---

### Task A5: Gerar migration SQL versionada (para staging/prod)

**Files:**
- Create: `packages/db/src/migrations/NNNN_users_approval_and_branch_scope.sql` (gerada por Drizzle Kit)

- [ ] **Step 1: Rodar `bun db:generate`**

Run: `bun db:generate`
Expected: novo arquivo em `packages/db/src/migrations/` (numeração sequencial).

- [ ] **Step 2: Revisar SQL gerado**

Abrir o arquivo gerado. Confirmar que contém:
- `ALTER TYPE user_role ADD VALUE 'super_admin' BEFORE 'admin';`
- `CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended');`
- `ALTER TABLE "user" ADD COLUMN status user_status NOT NULL DEFAULT 'pending';`
- `ALTER TABLE branch ADD COLUMN is_default boolean NOT NULL DEFAULT false;`
- `CREATE UNIQUE INDEX branch_is_default_unique ON branch (is_default) WHERE is_default = true;`
- `CREATE TABLE user_branch (...)` com FKs cascade + índices.
- `ALTER TABLE order_note ALTER COLUMN author_id DROP NOT NULL;` (e ON DELETE SET NULL).

Se algo faltar, ajustar manualmente no SQL gerado (Drizzle Kit pode não gerar partial unique index — adicionar à mão se preciso).

- [ ] **Step 3: Adicionar bloco de data migration ao SQL**

Ao FINAL do arquivo gerado, adicionar:

```sql
-- Data migration: users existentes ficam ativos (não pendentes)
UPDATE "user" SET status = 'active';

-- Filial Curitiba como default (ajustar id se diferente em prod)
UPDATE branch SET is_default = true WHERE id = 'br-curitiba';
```

NÃO incluir o `UPDATE role='super_admin'` no SQL — é manual em prod por ser dado-específico de cada deploy.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/migrations/
git commit -m "feat(db): migration aprovação users + branch default + user_branch"
```

---

## Fase B — Auth plumbing

### Task B1: Better Auth `additionalFields.status`

**Files:**
- Modify: `packages/auth/src/dashboard.ts`

- [ ] **Step 1: Adicionar `status` em `additionalFields`**

Em `packages/auth/src/dashboard.ts`, dentro de `user.additionalFields`:

```ts
user: {
	additionalFields: {
		role: {
			type: "string",
			required: false,
			defaultValue: "user",
			input: false,
		},
		status: {
			type: "string",
			required: false,
			defaultValue: "pending",
			input: false,
		},
	},
},
```

- [ ] **Step 2: `bun check-types --filter=@emach/auth`**

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/auth/src/dashboard.ts
git commit -m "feat(auth): adicionar campo status no Better Auth dashboard"
```

---

### Task B2: Adicionar tipo `UserStatus` em `session.ts` + helpers de status

**Files:**
- Modify: `apps/web/src/lib/session.ts`

- [ ] **Step 1: Reexportar `UserStatus` e adicionar helpers**

Em `apps/web/src/lib/session.ts`, depois de `export type UserRole = ...`, adicionar:

```ts
import type { UserStatus } from "@emach/db/schema/auth";
export type { UserStatus };

export function getUserStatus(session: DashboardSession): UserStatus {
	return (session.user.status ?? "pending") as UserStatus;
}
```

- [ ] **Step 2: `bun check-types --filter=web`**

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/session.ts
git commit -m "feat(web): expor UserStatus helper em session.ts"
```

---

### Task B3: Reescrever `apps/web/src/lib/permissions.ts` — novas capabilities + overload

**Files:**
- Modify: `apps/web/src/lib/permissions.ts`

- [ ] **Step 1: Atualizar union `Capability` com novas caps**

Localizar o type alias `Capability` e adicionar:

```ts
| "users.approve"
| "users.update_role"
| "users.update_branches"
| "users.suspend"
| "users.reset_password"
| "users.delete"
| "branches.set_default"
```

Manter `users.manage` existente como cap legada (usada em outros lugares — não remover sem inventariar).

- [ ] **Step 2: Atualizar `ALL_CAPS`, `MANAGER_CAPS`, `USER_CAPS` arrays**

Adicionar as 7 novas caps em `ALL_CAPS`. Manager/User não recebem nenhuma delas. Construir array `SUPER_ADMIN_EXCLUSIVE`:

```ts
const SUPER_ADMIN_EXCLUSIVE: readonly Capability[] = [
	"branches.manage",
	"branches.set_default",
	"users.delete",
	"audit.read", // global (admin tem escopado)
];
```

Atualizar `ALL_CAPS` para incluir as 7 novas. Atualizar `ROLE_CAPS`:

```ts
const ADMIN_CAPS: readonly Capability[] = ALL_CAPS.filter(
	(c) => !SUPER_ADMIN_EXCLUSIVE.includes(c)
);

const ROLE_CAPS: Record<UserRole, readonly Capability[]> = {
	super_admin: ALL_CAPS,
	admin: ADMIN_CAPS,
	manager: MANAGER_CAPS,
	user: USER_CAPS,
};
```

Atualizar `UserRole` em `session.ts` para incluir `"super_admin"`:

```ts
export type UserRole = "super_admin" | "admin" | "manager" | "user";

const ROLE_WEIGHT: Record<UserRole, number> = {
	super_admin: 4,
	admin: 3,
	manager: 2,
	user: 1,
};
```

(Fazer essa alteração agora em `apps/web/src/lib/session.ts` — ajustar Task B2 caso ainda não tenha sido feita.)

- [ ] **Step 3: Adicionar overload `requireCapability` com `targetUserId` / `targetBranchIds`**

No fim de `permissions.ts`:

```ts
import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { userBranch } from "@emach/db/schema/inventory";
import { eq } from "drizzle-orm";

interface CapabilityContext {
	targetUserId?: string;
	targetBranchIds?: string[];
}

export async function requireCapabilityWithContext(
	cap: Capability,
	ctx: CapabilityContext = {}
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	const role = (session.user.role ?? "user") as UserRole;
	if (!can(role, cap)) {
		throw new Error(`Forbidden: capability "${cap}" requerida`);
	}

	if (ctx.targetUserId) {
		if (ctx.targetUserId === session.user.id) {
			// Self-restrictive caps: suspend, delete, role change
			const selfRestricted: Capability[] = [
				"users.suspend",
				"users.delete",
				"users.update_role",
			];
			if (selfRestricted.includes(cap)) {
				throw new Error("Não é possível executar essa ação em si mesmo");
			}
		}

		const [target] = await db
			.select({ role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, ctx.targetUserId))
			.limit(1);

		if (!target) {
			throw new Error("Usuário alvo não encontrado");
		}

		const targetWeight = ROLE_WEIGHT[target.role as UserRole];
		const actorWeight = ROLE_WEIGHT[role];

		if (role !== "super_admin" && targetWeight >= actorWeight) {
			throw new Error("Não é possível gerenciar usuário com role igual ou superior");
		}
	}

	if (ctx.targetBranchIds && role !== "super_admin") {
		const ownBranches = await db
			.select({ branchId: userBranch.branchId })
			.from(userBranch)
			.where(eq(userBranch.userId, session.user.id));
		const ownSet = new Set(ownBranches.map((b) => b.branchId));
		for (const targetId of ctx.targetBranchIds) {
			if (!ownSet.has(targetId)) {
				throw new Error(`Filial fora do seu escopo: ${targetId}`);
			}
		}
	}

	return session;
}
```

`ROLE_WEIGHT` precisa estar acessível — exportar de `session.ts` ou redefinir em `permissions.ts`. Importar de `session.ts`:

```ts
import { ROLE_WEIGHT } from "./session";
```

E em `session.ts` exportar:

```ts
export const ROLE_WEIGHT: Record<UserRole, number> = { /* ... */ };
```

- [ ] **Step 4: `bun check-types --filter=web` + `bun check-types --filter=@emach/auth`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/permissions.ts apps/web/src/lib/session.ts
git commit -m "feat(web): expandir permissions com super_admin + caps de users e contexto"
```

---

### Task B4: Helper `getUserBranchScope`

**Files:**
- Create: `apps/web/src/lib/branch-scope.ts`

- [ ] **Step 1: Criar arquivo**

```ts
import { db } from "@emach/db";
import { userBranch } from "@emach/db/schema/inventory";
import { eq } from "drizzle-orm";
import { cache } from "react";

import type { DashboardSession } from "@emach/auth/dashboard";

export type BranchScope = string[] | null;

export const getUserBranchScope = cache(
	async (session: DashboardSession): Promise<BranchScope> => {
		if (session.user.role === "super_admin") {
			return null;
		}
		const rows = await db
			.select({ branchId: userBranch.branchId })
			.from(userBranch)
			.where(eq(userBranch.userId, session.user.id));
		return rows.map((r) => r.branchId);
	}
);

export function inScope(scope: BranchScope, branchId: string): boolean {
	if (scope === null) return true;
	return scope.includes(branchId);
}
```

- [ ] **Step 2: `bun check-types --filter=web`**

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/branch-scope.ts
git commit -m "feat(web): helper getUserBranchScope para filtrar queries por filial"
```

---

## Fase C — Branch isDefault (UI + action)

### Task C1: Server action `setDefaultBranch`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts`

- [ ] **Step 1: Adicionar import e action**

No topo, garantir import:

```ts
import { requireCapabilityWithContext } from "@/lib/permissions";
```

No fim do arquivo, antes do final, adicionar:

```ts
export async function setDefaultBranch(
	branchId: string
): Promise<ActionResult<{ id: string }>> {
	await requireCapabilityWithContext("branches.set_default");

	try {
		await db.transaction(async (tx) => {
			await tx
				.update(branch)
				.set({ isDefault: false })
				.where(eq(branch.isDefault, true));
			await tx
				.update(branch)
				.set({ isDefault: true })
				.where(eq(branch.id, branchId));
		});
	} catch (error) {
		return { ok: false, error: zodErrorMessage(error) };
	}

	revalidatePath(BRANCHES_PATH);
	revalidatePath(`${BRANCHES_PATH}/${branchId}/edit`);
	revalidateTag("default-branch");
	return { ok: true, data: { id: branchId } };
}
```

Adicionar import `revalidateTag` de `next/cache` no topo.

- [ ] **Step 2: Bloquear delete de filial default**

Em `deleteBranch`, antes do `db.delete`, adicionar:

```ts
const [target] = await db
	.select({ isDefault: branch.isDefault })
	.from(branch)
	.where(eq(branch.id, id))
	.limit(1);

if (target?.isDefault) {
	return {
		ok: false,
		error: "Marque outra filial como padrão antes de deletar esta",
	};
}
```

- [ ] **Step 3: `bun check-types --filter=web`**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/actions.ts
git commit -m "feat(web): action setDefaultBranch + bloqueio de delete de filial default"
```

---

### Task C2: Toggle isDefault em `branch-form.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-schema.ts` (adicionar `isDefault` opcional)
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form.tsx`

- [ ] **Step 1: Verificar role do user (gate) em page que renderiza form**

Em `apps/web/src/app/dashboard/branches/[id]/edit/page.tsx`, ler session + checar `can(role, "branches.set_default")` antes de passar prop:

```ts
import { can } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
// ...
const session = await getCurrentSession();
const canSetDefault = can(session?.user.role as UserRole, "branches.set_default");
```

Passar `canSetDefault` e `defaultValues.isDefault` pro `<BranchForm>`.

- [ ] **Step 2: Editar form**

Em `branch-form.tsx`, adicionar import:

```ts
import { Switch } from "@emach/ui/components/switch";
import { setDefaultBranch } from "../actions";
```

(Se `Switch` não existe em `@emach/ui`, adicionar via skill `shadcn` — `bunx shadcn@latest add switch`.)

Estender props:

```ts
interface BranchFormProps {
	branchId?: string;
	defaultValues: Partial<BranchFormValues> & { isDefault?: boolean };
	mode: "create" | "edit";
	canSetDefault: boolean;
}
```

No componente, adicionar state:

```ts
const [isDefault, setIsDefault] = useState(defaultValues.isDefault ?? false);
const [isToggling, startToggle] = useTransition();
```

Adicionar bloco no JSX (só em edit + canSetDefault):

```tsx
{mode === "edit" && canSetDefault && (
	<section className="flex flex-col gap-2 rounded-md border border-border bg-card p-6">
		<div className="flex items-center justify-between">
			<div>
				<h2 className="font-medium">Filial padrão do ecommerce</h2>
				<p className="text-muted-foreground text-sm">
					Pedidos do site são processados nesta filial.
				</p>
			</div>
			<Switch
				checked={isDefault}
				disabled={isToggling || isDefault}
				onCheckedChange={() => {
					if (!branchId || isDefault) return;
					startToggle(async () => {
						const result = await setDefaultBranch(branchId);
						if (result.ok) {
							setIsDefault(true);
							toast.success("Filial marcada como padrão");
							router.refresh();
						} else {
							toast.error(result.error);
						}
					});
				}}
			/>
		</div>
	</section>
)}
```

- [ ] **Step 3: Atualizar query do edit page para retornar `isDefault`**

`getBranch` já faz `select()` (todas colunas), então `isDefault` já vem. Verificar `defaultValues={{ ...branch, isDefault: branch.isDefault }}` no page.

- [ ] **Step 4: `bun check-types --filter=web` + smoke**

Run: `bun check-types --filter=web` → PASS.
Run: `bun dev:web`, abrir `/dashboard/branches/br-curitiba/edit` como super_admin → toggle `isDefault` visível e marcado. Mudar pra outra branch → toggle vira false na primeira, true na segunda no DB.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches
git commit -m "feat(web): toggle isDefault em edit de filial (super_admin only)"
```

---

### Task C3: Badge "Padrão ecommerce" na listagem de filiais

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/page.tsx` (ou _components da tabela, conforme estrutura atual)

- [ ] **Step 1: Localizar componente de row de branch**

Buscar em `apps/web/src/app/dashboard/branches/_components/` ou em `page.tsx` onde branches são renderizadas em tabela/cards.

- [ ] **Step 2: Adicionar badge condicional**

Onde o nome da filial é renderizado, adicionar ao lado:

```tsx
{branch.isDefault && (
	<Badge variant="default" className="ml-2 text-[10px]">Padrão ecommerce</Badge>
)}
```

Importar `Badge` de `@emach/ui/components/badge`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches
git commit -m "feat(web): badge 'Padrão ecommerce' na listagem de filiais"
```

---

## Fase D — Telas pending e suspended

### Task D1: Rota `/pending` com layout próprio

**Files:**
- Create: `apps/web/src/app/pending/layout.tsx`
- Create: `apps/web/src/app/pending/page.tsx`
- Create: `apps/web/src/app/pending/_components/status-card.tsx`

- [ ] **Step 1: Criar layout vazio (sem sidebar)**

`apps/web/src/app/pending/layout.tsx`:

```tsx
export default function PendingLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<main className="flex min-h-screen flex-1 items-center justify-center px-6 py-12">
			{children}
		</main>
	);
}
```

- [ ] **Step 2: Criar StatusCard componente reutilizável (usado em pending e suspended)**

`apps/web/src/app/pending/_components/status-card.tsx`:

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
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { authClient } from "@/lib/auth-client";

interface StatusCardProps {
	icon: string;
	title: string;
	description: string;
}

export function StatusCard({ icon, title, description }: StatusCardProps) {
	const router = useRouter();
	const [isSigningOut, startSignOut] = useTransition();

	function handleSignOut() {
		startSignOut(async () => {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						router.replace("/login");
						router.refresh();
					},
				},
			});
		});
	}

	return (
		<Card className="w-full max-w-md text-center">
			<CardHeader className="items-center gap-3">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning text-warning-foreground text-2xl">
					{icon}
				</div>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<Button
					disabled={isSigningOut}
					onClick={handleSignOut}
					variant="outline"
				>
					{isSigningOut ? "Saindo..." : "Sair"}
				</Button>
			</CardContent>
		</Card>
	);
}
```

(Se as classes `bg-warning`/`text-warning-foreground` não estão no tema, usar `bg-secondary text-secondary-foreground`. Conferir com `DESIGN.md` antes.)

- [ ] **Step 3: Page que valida status**

`apps/web/src/app/pending/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { getCurrentSession, getUserStatus } from "@/lib/session";
import { StatusCard } from "./_components/status-card";

export default async function PendingPage() {
	const session = await getCurrentSession();
	if (!session?.user) {
		redirect("/login");
	}
	const status = getUserStatus(session);
	if (status === "active") {
		redirect("/dashboard");
	}
	if (status === "suspended") {
		redirect("/suspended");
	}

	return (
		<StatusCard
			description="Um administrador vai revisar seu cadastro em breve. Você terá acesso após a aprovação."
			icon="⏳"
			title="Conta aguardando aprovação"
		/>
	);
}
```

- [ ] **Step 4: Smoke**

Run: `bun dev:web`. Criar user de teste via signup → ao bater `/dashboard` (após gate de Task E1) redireciona `/pending` e mostra card.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/pending
git commit -m "feat(web): rota /pending com StatusCard e gate de status"
```

---

### Task D2: Rota `/suspended` reutilizando `StatusCard`

**Files:**
- Create: `apps/web/src/app/suspended/layout.tsx`
- Create: `apps/web/src/app/suspended/page.tsx`

- [ ] **Step 1: Layout idêntico ao pending**

`apps/web/src/app/suspended/layout.tsx`:

```tsx
export default function SuspendedLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<main className="flex min-h-screen flex-1 items-center justify-center px-6 py-12">
			{children}
		</main>
	);
}
```

- [ ] **Step 2: Page**

`apps/web/src/app/suspended/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { StatusCard } from "@/app/pending/_components/status-card";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export default async function SuspendedPage() {
	const session = await getCurrentSession();
	if (!session?.user) {
		redirect("/login");
	}
	const status = getUserStatus(session);
	if (status === "active") {
		redirect("/dashboard");
	}
	if (status === "pending") {
		redirect("/pending");
	}

	return (
		<StatusCard
			description="Sua conta foi suspensa. Fale com seu administrador para mais informações."
			icon="🚫"
			title="Acesso suspenso"
		/>
	);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/suspended
git commit -m "feat(web): rota /suspended reutilizando StatusCard"
```

---

## Fase E — Layout gate + redirects de login

### Task E1: Gate em `dashboard/layout.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx`

- [ ] **Step 1: Adicionar checagem de status**

Substituir todo o arquivo por:

```tsx
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@emach/ui/components/sidebar";
import { redirect } from "next/navigation";

import { getUserStatus, requireCurrentSession } from "@/lib/session";
import { AppSidebar } from "./_components/app-sidebar";

export default async function DashboardLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const session = await requireCurrentSession();
	const status = getUserStatus(session);
	if (status === "pending") {
		redirect("/pending");
	}
	if (status === "suspended") {
		redirect("/suspended");
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
					<SidebarTrigger />
					<span className="font-serif text-base">emach</span>
				</header>
				<div className="flex w-full flex-col gap-6 px-6 py-6">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(web): gate de status no layout do dashboard"
```

---

### Task E2: Redirect de `/login` por status

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Atualizar redirect**

Substituir o arquivo por:

```tsx
import { redirect } from "next/navigation";

import AuthCard from "@/components/auth-card";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export default async function LoginPage() {
	const session = await getCurrentSession();

	if (session?.user) {
		const status = getUserStatus(session);
		if (status === "pending") redirect("/pending");
		if (status === "suspended") redirect("/suspended");
		redirect("/dashboard");
	}

	return (
		<main className="flex flex-1 items-center justify-center px-6 py-12">
			<AuthCard />
		</main>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/login/page.tsx
git commit -m "feat(web): redirecionar login por status do user"
```

---

## Fase F — Página /dashboard/users

### Task F1: Zod schemas

**Files:**
- Create: `apps/web/src/app/dashboard/users/schema.ts`

- [ ] **Step 1: Criar schemas**

```ts
import { z } from "zod";

const ROLES = ["super_admin", "admin", "manager", "user"] as const;

export const approveUserSchema = z
	.object({
		userId: z.string().min(1),
		role: z.enum(ROLES),
		branchIds: z.array(z.string().min(1)),
	})
	.refine(
		(data) => data.role === "super_admin" || data.branchIds.length >= 1,
		{
			message: "Selecione ao menos 1 filial",
			path: ["branchIds"],
		}
	);

export type ApproveUserInput = z.infer<typeof approveUserSchema>;

export const updateUserSchema = z.object({
	userId: z.string().min(1),
	name: z.string().min(2).max(100).optional(),
	role: z.enum(ROLES).optional(),
	branchIds: z.array(z.string().min(1)).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdSchema = z.object({ userId: z.string().min(1) });
export type UserIdInput = z.infer<typeof userIdSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/dashboard/users/schema.ts
git commit -m "feat(web): zod schemas para users actions"
```

---

### Task F2: Server actions — approve, reject, update, suspend, reactivate

**Files:**
- Create: `apps/web/src/app/dashboard/users/actions.ts`

- [ ] **Step 1: Criar arquivo com actions**

```ts
"use server";

import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { userBranch } from "@emach/db/schema/inventory";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireCapabilityWithContext } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
	type ApproveUserInput,
	type UpdateUserInput,
	approveUserSchema,
	updateUserSchema,
	userIdSchema,
} from "./schema";
import { authDashboard } from "@emach/auth/dashboard";

const USERS_PATH = "/dashboard/users";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

export async function approveUser(
	input: ApproveUserInput
): Promise<ActionResult> {
	const parsed = approveUserSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "validação" };
	}

	await requireCapabilityWithContext("users.approve", {
		targetUserId: parsed.data.userId,
		targetBranchIds: parsed.data.branchIds,
	});

	if (parsed.data.role !== "user" && parsed.data.role !== "manager") {
		await requireCapabilityWithContext("users.update_role", {
			targetUserId: parsed.data.userId,
		});
	}

	try {
		await db.transaction(async (tx) => {
			await tx
				.update(userTable)
				.set({ role: parsed.data.role, status: "active" })
				.where(eq(userTable.id, parsed.data.userId));
			if (parsed.data.branchIds.length > 0) {
				await tx
					.delete(userBranch)
					.where(eq(userBranch.userId, parsed.data.userId));
				await tx.insert(userBranch).values(
					parsed.data.branchIds.map((branchId) => ({
						userId: parsed.data.userId,
						branchId,
					}))
				);
			}
		});
	} catch (error) {
		logger.error({ err: error }, "approveUser falhou");
		return { ok: false, error: "Não foi possível aprovar" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function rejectUser(input: { userId: string }): Promise<ActionResult> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "validação" };

	await requireCapabilityWithContext("users.approve", {
		targetUserId: parsed.data.userId,
	});

	const [target] = await db
		.select({ status: userTable.status })
		.from(userTable)
		.where(eq(userTable.id, parsed.data.userId))
		.limit(1);

	if (!target) return { ok: false, error: "User não encontrado" };
	if (target.status !== "pending") {
		return { ok: false, error: "Só pendentes podem ser rejeitados" };
	}

	try {
		await db.delete(userTable).where(eq(userTable.id, parsed.data.userId));
	} catch (error) {
		logger.error({ err: error }, "rejectUser falhou");
		return { ok: false, error: "Não foi possível rejeitar" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function updateUser(input: UpdateUserInput): Promise<ActionResult> {
	const parsed = updateUserSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "validação" };

	if (parsed.data.role) {
		await requireCapabilityWithContext("users.update_role", {
			targetUserId: parsed.data.userId,
		});
	}
	if (parsed.data.branchIds) {
		await requireCapabilityWithContext("users.update_branches", {
			targetUserId: parsed.data.userId,
			targetBranchIds: parsed.data.branchIds,
		});
	}
	if (parsed.data.name) {
		await requireCapabilityWithContext("users.update_role", {
			targetUserId: parsed.data.userId,
		});
	}

	try {
		await db.transaction(async (tx) => {
			const update: Partial<typeof userTable.$inferInsert> = {};
			if (parsed.data.name) update.name = parsed.data.name;
			if (parsed.data.role) update.role = parsed.data.role;
			if (Object.keys(update).length > 0) {
				await tx
					.update(userTable)
					.set(update)
					.where(eq(userTable.id, parsed.data.userId));
			}
			if (parsed.data.branchIds) {
				await tx
					.delete(userBranch)
					.where(eq(userBranch.userId, parsed.data.userId));
				if (parsed.data.branchIds.length > 0) {
					await tx.insert(userBranch).values(
						parsed.data.branchIds.map((branchId) => ({
							userId: parsed.data.userId,
							branchId,
						}))
					);
				}
			}
		});
	} catch (error) {
		logger.error({ err: error }, "updateUser falhou");
		return { ok: false, error: "Não foi possível atualizar" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function suspendUser(input: { userId: string }): Promise<ActionResult> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "validação" };

	await requireCapabilityWithContext("users.suspend", {
		targetUserId: parsed.data.userId,
	});

	try {
		await db.transaction(async (tx) => {
			await tx
				.update(userTable)
				.set({ status: "suspended" })
				.where(eq(userTable.id, parsed.data.userId));
			await authDashboard.api.revokeUserSessions({
				body: { userId: parsed.data.userId },
			});
		});
	} catch (error) {
		logger.error({ err: error }, "suspendUser falhou");
		return { ok: false, error: "Não foi possível suspender" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}

export async function reactivateUser(input: { userId: string }): Promise<ActionResult> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "validação" };

	await requireCapabilityWithContext("users.suspend", {
		targetUserId: parsed.data.userId,
	});

	try {
		await db
			.update(userTable)
			.set({ status: "active" })
			.where(eq(userTable.id, parsed.data.userId));
	} catch (error) {
		logger.error({ err: error }, "reactivateUser falhou");
		return { ok: false, error: "Não foi possível reativar" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}
```

Notas:
- `authDashboard.api.revokeUserSessions` é API do Better Auth. Verificar nome exato no Better Auth 1.5.5 — alternativa: `await db.delete(session).where(eq(session.userId, userId))` direto. Documentar fallback se nome não existir.

- [ ] **Step 2: Validar nome da API Better Auth**

Run: `npx ctx7@latest library "Better Auth" "como revogar todas as sessões de um user via server"` → `npx ctx7@latest docs <id> "revoke user sessions"`. Se o nome correto for diferente, ajustar.

Fallback se API não existe:

```ts
import { session as sessionTable } from "@emach/db/schema/auth";
await tx.delete(sessionTable).where(eq(sessionTable.userId, parsed.data.userId));
```

- [ ] **Step 3: `bun check-types --filter=web`**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/users/actions.ts
git commit -m "feat(web): actions approve/reject/update/suspend/reactivate users"
```

---

### Task F3: Actions adicionais — `resetUserPassword` + `deleteUser`

**Files:**
- Modify: `apps/web/src/app/dashboard/users/actions.ts`

- [ ] **Step 1: Adicionar reset password**

No fim do arquivo:

```ts
export async function resetUserPassword(input: { userId: string }): Promise<
	ActionResult<{ token: string; expiresAt: Date }>
> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "validação" };

	await requireCapabilityWithContext("users.reset_password", {
		targetUserId: parsed.data.userId,
	});

	const { account, verification } = await import("@emach/db/schema/auth");
	const token = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

	try {
		await db.transaction(async (tx) => {
			await tx.insert(verification).values({
				id: crypto.randomUUID(),
				identifier: parsed.data.userId,
				value: token,
				expiresAt,
			});
			await tx
				.update(account)
				.set({ password: null })
				.where(eq(account.userId, parsed.data.userId));
		});
	} catch (error) {
		logger.error({ err: error }, "resetUserPassword falhou");
		return { ok: false, error: "Não foi possível gerar reset" };
	}

	return { ok: true, data: { token, expiresAt } };
}
```

- [ ] **Step 2: Adicionar delete com cleanup de actor refs**

```ts
export async function deleteUser(input: { userId: string }): Promise<ActionResult> {
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "validação" };

	await requireCapabilityWithContext("users.delete", {
		targetUserId: parsed.data.userId,
	});

	const { count } = await import("drizzle-orm");
	const { and, sql } = await import("drizzle-orm");

	const [target] = await db
		.select({ role: userTable.role, status: userTable.status })
		.from(userTable)
		.where(eq(userTable.id, parsed.data.userId))
		.limit(1);

	if (!target) return { ok: false, error: "User não encontrado" };

	if (target.role === "super_admin") {
		const [{ value: activeSuperAdmins }] = await db
			.select({ value: sql<number>`count(*)::int` })
			.from(userTable)
			.where(
				and(
					eq(userTable.role, "super_admin"),
					eq(userTable.status, "active")
				)
			);
		if (activeSuperAdmins <= 1) {
			return {
				ok: false,
				error: "Necessário ao menos 1 super_admin ativo",
			};
		}
	}

	const { stockMovement } = await import("@emach/db/schema/stock-movements");
	const { orderStatusHistory, orderNote } = await import("@emach/db/schema/orders");
	const { promotion } = await import("@emach/db/schema/promotions");

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
		logger.error({ err: error }, "deleteUser falhou");
		return { ok: false, error: "Não foi possível deletar" };
	}

	revalidatePath(USERS_PATH);
	return { ok: true, data: undefined };
}
```

Mover os dynamic imports pro topo do arquivo (preferir estáticos):

```ts
import { account, session as sessionTable, verification } from "@emach/db/schema/auth";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { orderStatusHistory, orderNote } from "@emach/db/schema/orders";
import { promotion } from "@emach/db/schema/promotions";
import { and, eq, sql } from "drizzle-orm";
```

E refatorar `resetUserPassword`/`deleteUser` para usar os imports estáticos.

- [ ] **Step 3: `bun check-types --filter=web`**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/users/actions.ts
git commit -m "feat(web): actions resetUserPassword e deleteUser com cleanup de actor refs"
```

---

### Task F4: Page `/dashboard/users` (Server Component)

**Files:**
- Create: `apps/web/src/app/dashboard/users/page.tsx`

- [ ] **Step 1: Carregar listas + branches**

```tsx
import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { branch, userBranch } from "@emach/db/schema/inventory";
import { asc, eq, sql } from "drizzle-orm";

import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { UsersTabs } from "./_components/users-tabs";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
	await requireCapabilityOrRedirect("users.approve");

	const usersWithBranches = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			email: userTable.email,
			role: userTable.role,
			status: userTable.status,
			createdAt: userTable.createdAt,
			branchIds: sql<string[]>`coalesce(
				array_agg(${userBranch.branchId}) filter (where ${userBranch.branchId} is not null),
				'{}'
			)`,
		})
		.from(userTable)
		.leftJoin(userBranch, eq(userBranch.userId, userTable.id))
		.groupBy(userTable.id)
		.orderBy(asc(userTable.createdAt));

	const branches = await db
		.select({ id: branch.id, name: branch.name })
		.from(branch)
		.orderBy(asc(branch.name));

	return (
		<div className="flex flex-col gap-6">
			<header>
				<h1 className="font-medium text-2xl">Usuários do dashboard</h1>
				<p className="text-muted-foreground text-sm">
					Aprovar pendentes, gerenciar permissões e vinculação por filial.
				</p>
			</header>
			<UsersTabs branches={branches} users={usersWithBranches} />
		</div>
	);
}
```

- [ ] **Step 2: `bun check-types --filter=web`**

Expected: PASS (pode falhar até `UsersTabs` ser criado em F5; aceitar e prosseguir).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/users/page.tsx
git commit -m "feat(web): página /dashboard/users com listagem agregada"
```

---

### Task F5: `UsersTabs` + tabelas por status

**Files:**
- Create: `apps/web/src/app/dashboard/users/_components/users-tabs.tsx`
- Create: `apps/web/src/app/dashboard/users/_components/pending-table.tsx`
- Create: `apps/web/src/app/dashboard/users/_components/active-table.tsx`
- Create: `apps/web/src/app/dashboard/users/_components/suspended-table.tsx`
- Create: `apps/web/src/app/dashboard/users/_components/types.ts`

- [ ] **Step 1: Types compartilhados**

`types.ts`:

```ts
export interface UserRow {
	id: string;
	name: string;
	email: string;
	role: "super_admin" | "admin" | "manager" | "user";
	status: "pending" | "active" | "suspended";
	createdAt: Date;
	branchIds: string[];
}

export interface BranchLite {
	id: string;
	name: string;
}
```

- [ ] **Step 2: `UsersTabs`**

```tsx
"use client";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { useState } from "react";

import { ActiveTable } from "./active-table";
import { PendingTable } from "./pending-table";
import { SuspendedTable } from "./suspended-table";
import type { BranchLite, UserRow } from "./types";

interface Props {
	users: UserRow[];
	branches: BranchLite[];
}

export function UsersTabs({ users, branches }: Props) {
	const pending = users.filter((u) => u.status === "pending");
	const active = users.filter((u) => u.status === "active");
	const suspended = users.filter((u) => u.status === "suspended");

	return (
		<Tabs defaultValue="pending">
			<TabsList>
				<TabsTrigger value="pending">
					Pendentes
					{pending.length > 0 && (
						<span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-primary-foreground text-xs">
							{pending.length}
						</span>
					)}
				</TabsTrigger>
				<TabsTrigger value="active">Ativos · {active.length}</TabsTrigger>
				<TabsTrigger value="suspended">Suspensos · {suspended.length}</TabsTrigger>
			</TabsList>
			<TabsContent value="pending">
				<PendingTable users={pending} branches={branches} />
			</TabsContent>
			<TabsContent value="active">
				<ActiveTable users={active} branches={branches} />
			</TabsContent>
			<TabsContent value="suspended">
				<SuspendedTable users={suspended} branches={branches} />
			</TabsContent>
		</Tabs>
	);
}
```

- [ ] **Step 3: `PendingTable`**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { useState } from "react";

import { ApprovalSheet } from "./approval-sheet";
import type { BranchLite, UserRow } from "./types";

interface Props {
	users: UserRow[];
	branches: BranchLite[];
}

export function PendingTable({ users, branches }: Props) {
	const [selected, setSelected] = useState<UserRow | null>(null);

	if (users.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Nenhum pendente no momento.
			</p>
		);
	}

	return (
		<>
			<table className="w-full text-sm">
				<thead className="text-muted-foreground text-xs uppercase">
					<tr>
						<th className="py-2 text-left">Nome</th>
						<th className="text-left">Email</th>
						<th className="text-left">Solicitado</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{users.map((u) => (
						<tr key={u.id} className="border-border border-t">
							<td className="py-2">{u.name}</td>
							<td>{u.email}</td>
							<td>{u.createdAt.toLocaleDateString("pt-BR")}</td>
							<td className="text-right">
								<Button
									onClick={() => setSelected(u)}
									size="sm"
									variant="ghost"
								>
									Revisar →
								</Button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<ApprovalSheet
				branches={branches}
				onClose={() => setSelected(null)}
				user={selected}
			/>
		</>
	);
}
```

- [ ] **Step 4: `ActiveTable` similar com botão "Editar"**

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { useState } from "react";

import { EditSheet } from "./edit-sheet";
import type { BranchLite, UserRow } from "./types";

const ROLE_BADGE: Record<UserRow["role"], "default" | "info" | "secondary"> = {
	super_admin: "default",
	admin: "default",
	manager: "info",
	user: "secondary",
};

interface Props {
	users: UserRow[];
	branches: BranchLite[];
}

export function ActiveTable({ users, branches }: Props) {
	const [selected, setSelected] = useState<UserRow | null>(null);
	const branchById = new Map(branches.map((b) => [b.id, b.name]));

	if (users.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Nenhum user ativo.
			</p>
		);
	}

	return (
		<>
			<table className="w-full text-sm">
				<thead className="text-muted-foreground text-xs uppercase">
					<tr>
						<th className="py-2 text-left">Nome</th>
						<th className="text-left">Email</th>
						<th className="text-left">Role</th>
						<th className="text-left">Filiais</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{users.map((u) => (
						<tr key={u.id} className="border-border border-t">
							<td className="py-2">{u.name}</td>
							<td>{u.email}</td>
							<td>
								<Badge variant={ROLE_BADGE[u.role]}>{u.role}</Badge>
							</td>
							<td className="text-xs">
								{u.branchIds.length > 0
									? u.branchIds.map((id) => branchById.get(id) ?? id).join(", ")
									: "—"}
							</td>
							<td className="text-right">
								<Button
									onClick={() => setSelected(u)}
									size="sm"
									variant="ghost"
								>
									Editar →
								</Button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<EditSheet
				branches={branches}
				onClose={() => setSelected(null)}
				user={selected}
			/>
		</>
	);
}
```

- [ ] **Step 5: `SuspendedTable` com botão "Reativar" inline + "Editar"**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { reactivateUser } from "../actions";
import { EditSheet } from "./edit-sheet";
import type { BranchLite, UserRow } from "./types";

interface Props {
	users: UserRow[];
	branches: BranchLite[];
}

export function SuspendedTable({ users, branches }: Props) {
	const [selected, setSelected] = useState<UserRow | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [, startTransition] = useTransition();

	function handleReactivate(userId: string) {
		setPendingId(userId);
		startTransition(async () => {
			const result = await reactivateUser({ userId });
			setPendingId(null);
			if (result.ok) toast.success("Usuário reativado");
			else toast.error(result.error);
		});
	}

	if (users.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Nenhum user suspenso.
			</p>
		);
	}

	return (
		<>
			<table className="w-full text-sm">
				<thead className="text-muted-foreground text-xs uppercase">
					<tr>
						<th className="py-2 text-left">Nome</th>
						<th className="text-left">Email</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{users.map((u) => (
						<tr key={u.id} className="border-border border-t">
							<td className="py-2">{u.name}</td>
							<td>{u.email}</td>
							<td className="flex justify-end gap-2 py-2">
								<Button
									disabled={pendingId === u.id}
									onClick={() => handleReactivate(u.id)}
									size="sm"
									variant="outline"
								>
									Reativar
								</Button>
								<Button
									onClick={() => setSelected(u)}
									size="sm"
									variant="ghost"
								>
									Editar →
								</Button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<EditSheet
				branches={branches}
				onClose={() => setSelected(null)}
				user={selected}
			/>
		</>
	);
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/users/_components
git commit -m "feat(web): tabs e tabelas pending/active/suspended em /dashboard/users"
```

---

### Task F6: `ApprovalSheet` + `BranchesCombobox` + `RoleSelect`

**Files:**
- Create: `apps/web/src/app/dashboard/users/_components/branches-combobox.tsx`
- Create: `apps/web/src/app/dashboard/users/_components/role-select.tsx`
- Create: `apps/web/src/app/dashboard/users/_components/approval-sheet.tsx`

- [ ] **Step 1: `BranchesCombobox`**

Multi-select de filiais. Implementar com `Popover` + `Command` de shadcn (se já instalados) ou usar `Checkbox` em lista simples se não.

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { Checkbox } from "@emach/ui/components/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";

import type { BranchLite } from "./types";

interface Props {
	branches: BranchLite[];
	value: string[];
	onChange: (next: string[]) => void;
	disabled?: boolean;
}

export function BranchesCombobox({
	branches,
	value,
	onChange,
	disabled,
}: Props) {
	function toggle(id: string) {
		if (value.includes(id)) {
			onChange(value.filter((v) => v !== id));
		} else {
			onChange([...value, id]);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-2">
				{value.length === 0 && (
					<span className="text-muted-foreground text-xs">Nenhuma filial</span>
				)}
				{value.map((id) => {
					const b = branches.find((br) => br.id === id);
					return (
						<Badge key={id} variant="default">
							{b?.name ?? id}
						</Badge>
					);
				})}
			</div>
			<Popover>
				<PopoverTrigger asChild>
					<Button disabled={disabled} size="sm" variant="outline">
						+ Filial
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-64 p-2">
					<div className="flex flex-col gap-1">
						{branches.map((b) => (
							<label
								className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-accent"
								key={b.id}
							>
								<Checkbox
									checked={value.includes(b.id)}
									onCheckedChange={() => toggle(b.id)}
								/>
								<span className="text-sm">{b.name}</span>
							</label>
						))}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
```

- [ ] **Step 2: `RoleSelect`**

```tsx
"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";

const ROLE_LABELS = {
	super_admin: "Super Admin",
	admin: "Admin",
	manager: "Manager",
	user: "User",
} as const;

type Role = keyof typeof ROLE_LABELS;

interface Props {
	value: Role;
	onChange: (next: Role) => void;
	disabled?: boolean;
	allowedRoles: Role[];
}

export function RoleSelect({ value, onChange, disabled, allowedRoles }: Props) {
	return (
		<Select disabled={disabled} onValueChange={(v) => onChange(v as Role)} value={value}>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{allowedRoles.map((r) => (
					<SelectItem key={r} value={r}>
						{ROLE_LABELS[r]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
```

- [ ] **Step 3: `ApprovalSheet`**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Label } from "@emach/ui/components/label";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { approveUser, rejectUser } from "../actions";
import { BranchesCombobox } from "./branches-combobox";
import { RoleSelect } from "./role-select";
import type { BranchLite, UserRow } from "./types";

interface Props {
	user: UserRow | null;
	branches: BranchLite[];
	onClose: () => void;
	allowedRoles?: ("super_admin" | "admin" | "manager" | "user")[];
}

export function ApprovalSheet({
	user,
	branches,
	onClose,
	allowedRoles = ["manager", "user"],
}: Props) {
	const [role, setRole] = useState<UserRow["role"]>("user");
	const [branchIds, setBranchIds] = useState<string[]>([]);
	const [, startTransition] = useTransition();
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (user) {
			setRole("user");
			setBranchIds([]);
		}
	}, [user]);

	function handleApprove() {
		if (!user) return;
		setSubmitting(true);
		startTransition(async () => {
			const result = await approveUser({ userId: user.id, role, branchIds });
			setSubmitting(false);
			if (result.ok) {
				toast.success("Usuário aprovado");
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleReject() {
		if (!user) return;
		setSubmitting(true);
		startTransition(async () => {
			const result = await rejectUser({ userId: user.id });
			setSubmitting(false);
			if (result.ok) {
				toast.success("Solicitação rejeitada");
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<Sheet onOpenChange={(open) => !open && onClose()} open={!!user}>
			<SheetContent className="flex flex-col gap-4">
				<SheetHeader>
					<SheetTitle>{user ? `Aprovar ${user.name}` : ""}</SheetTitle>
				</SheetHeader>
				{user && (
					<>
						<div className="flex flex-col gap-1">
							<Label className="text-xs uppercase">Email</Label>
							<span className="text-sm">{user.email}</span>
						</div>
						<div className="flex flex-col gap-2">
							<Label>Role</Label>
							<RoleSelect
								allowedRoles={allowedRoles}
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
						<div className="mt-auto flex gap-2">
							<Button disabled={submitting} onClick={handleApprove}>
								Aprovar
							</Button>
							<Button
								disabled={submitting}
								onClick={handleReject}
								variant="destructive"
							>
								Rejeitar
							</Button>
							<SheetClose asChild>
								<Button disabled={submitting} variant="ghost">
									Cancelar
								</Button>
							</SheetClose>
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
```

- [ ] **Step 4: `bun check-types --filter=web`**

Expected: PASS. Se algum primitive de UI (Sheet/Popover/Checkbox/Select) não existe em `@emach/ui`, instalar via skill `shadcn` (`bunx shadcn@latest add sheet popover checkbox select`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/_components
git commit -m "feat(web): ApprovalSheet + BranchesCombobox + RoleSelect"
```

---

### Task F7: `EditSheet` com ações destrutivas

**Files:**
- Create: `apps/web/src/app/dashboard/users/_components/edit-sheet.tsx`

- [ ] **Step 1: Implementar**

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
	AlertDialogTrigger,
} from "@emach/ui/components/alert-dialog";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
	deleteUser,
	resetUserPassword,
	suspendUser,
	updateUser,
} from "../actions";
import { BranchesCombobox } from "./branches-combobox";
import { RoleSelect } from "./role-select";
import type { BranchLite, UserRow } from "./types";

interface Props {
	user: UserRow | null;
	branches: BranchLite[];
	onClose: () => void;
	allowedRoles?: UserRow["role"][];
}

export function EditSheet({
	user,
	branches,
	onClose,
	allowedRoles = ["admin", "manager", "user"],
}: Props) {
	const [name, setName] = useState("");
	const [role, setRole] = useState<UserRow["role"]>("user");
	const [branchIds, setBranchIds] = useState<string[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [, startTransition] = useTransition();
	const [resetToken, setResetToken] = useState<string | null>(null);

	useEffect(() => {
		if (user) {
			setName(user.name);
			setRole(user.role);
			setBranchIds(user.branchIds);
		}
	}, [user]);

	function handleSave() {
		if (!user) return;
		setSubmitting(true);
		startTransition(async () => {
			const result = await updateUser({
				userId: user.id,
				name: name !== user.name ? name : undefined,
				role: role !== user.role ? role : undefined,
				branchIds,
			});
			setSubmitting(false);
			if (result.ok) {
				toast.success("Alterações salvas");
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleSuspend() {
		if (!user) return;
		setSubmitting(true);
		startTransition(async () => {
			const result = await suspendUser({ userId: user.id });
			setSubmitting(false);
			if (result.ok) {
				toast.success("Usuário suspenso");
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleReset() {
		if (!user) return;
		setSubmitting(true);
		startTransition(async () => {
			const result = await resetUserPassword({ userId: user.id });
			setSubmitting(false);
			if (result.ok) {
				setResetToken(result.data.token);
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleDelete() {
		if (!user) return;
		setSubmitting(true);
		startTransition(async () => {
			const result = await deleteUser({ userId: user.id });
			setSubmitting(false);
			if (result.ok) {
				toast.success("Usuário deletado");
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	function copyResetLink() {
		if (!resetToken) return;
		const link = `${window.location.origin}/reset-password?token=${resetToken}`;
		navigator.clipboard.writeText(link);
		toast.success("Link copiado");
	}

	return (
		<Sheet onOpenChange={(open) => !open && onClose()} open={!!user}>
			<SheetContent className="flex flex-col gap-4 overflow-y-auto">
				<SheetHeader>
					<SheetTitle>{user ? `Editar ${user.name}` : ""}</SheetTitle>
				</SheetHeader>
				{user && (
					<>
						<div className="flex flex-col gap-2">
							<Label>Nome</Label>
							<Input
								disabled={submitting}
								onChange={(e) => setName(e.target.value)}
								value={name}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>Role</Label>
							<RoleSelect
								allowedRoles={allowedRoles}
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

						<Button disabled={submitting} onClick={handleSave}>
							Salvar alterações
						</Button>

						<hr className="border-border" />
						<span className="text-muted-foreground text-xs uppercase">Ações</span>

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button disabled={submitting} variant="outline">
									Suspender acesso
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Suspender {user.name}?</AlertDialogTitle>
									<AlertDialogDescription>
										Sessões ativas serão encerradas. Reversível.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancelar</AlertDialogCancel>
									<AlertDialogAction onClick={handleSuspend}>
										Suspender
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<Button
							disabled={submitting}
							onClick={handleReset}
							variant="outline"
						>
							Forçar reset de senha
						</Button>

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button disabled={submitting} variant="destructive">
									Deletar permanentemente
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Deletar {user.name}?</AlertDialogTitle>
									<AlertDialogDescription>
										Operação irreversível. Auditoria mantida via actor=system.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancelar</AlertDialogCancel>
									<AlertDialogAction onClick={handleDelete}>
										Deletar
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<SheetClose asChild>
							<Button disabled={submitting} variant="ghost">
								Fechar
							</Button>
						</SheetClose>

						{resetToken && (
							<div className="rounded-md border border-warning bg-warning/10 p-3">
								<p className="font-medium text-sm">Token de reset gerado</p>
								<p className="break-all font-mono text-xs">{resetToken}</p>
								<Button
									className="mt-2"
									onClick={copyResetLink}
									size="sm"
									variant="outline"
								>
									Copiar link
								</Button>
							</div>
						)}
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
```

- [ ] **Step 2: `bun check-types --filter=web`**

Expected: PASS. Instalar primitives faltantes via skill `shadcn` se necessário (`alert-dialog`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/users/_components/edit-sheet.tsx
git commit -m "feat(web): EditSheet com suspender/reset/delete + alert-dialogs"
```

---

### Task F8: Placeholder `/dashboard/users/clients`

**Files:**
- Create: `apps/web/src/app/dashboard/users/clients/page.tsx`

- [ ] **Step 1: Página placeholder**

```tsx
import { requireCapabilityOrRedirect } from "@/lib/permissions";

export default async function ClientsPlaceholderPage() {
	await requireCapabilityOrRedirect("users.approve");

	return (
		<div className="flex flex-col gap-4">
			<header>
				<h1 className="font-medium text-2xl">Clientes</h1>
				<p className="text-muted-foreground text-sm">Em construção. Em breve.</p>
			</header>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/dashboard/users/clients
git commit -m "feat(web): placeholder /dashboard/users/clients"
```

---

## Fase G — Sidebar com grupo Usuários

### Task G1: Atualizar `app-sidebar.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/app-sidebar.tsx`
- Modify: `apps/web/src/app/dashboard/layout.tsx` (passar `pendingCount`)

- [ ] **Step 1: Fetch de `pendingCount` no layout**

Em `apps/web/src/app/dashboard/layout.tsx`, após gate de status:

```tsx
import { count } from "drizzle-orm";
import { user as userTable } from "@emach/db/schema/auth";
import { db } from "@emach/db";
import { can } from "@/lib/permissions";

// ...

const role = session.user.role as UserRole;
let pendingCount = 0;
if (can(role, "users.approve")) {
	const [{ value }] = await db
		.select({ value: count() })
		.from(userTable)
		.where(eq(userTable.status, "pending"));
	pendingCount = Number(value ?? 0);
}

return (
	<SidebarProvider>
		<AppSidebar pendingCount={pendingCount} canManageUsers={can(role, "users.approve")} />
		{/* ... */}
	</SidebarProvider>
);
```

Imports adicionais: `count`, `eq` de `drizzle-orm`; `UserRole` de `@/lib/session`.

- [ ] **Step 2: Atualizar `AppSidebar` props + render**

Adicionar props:

```tsx
interface AppSidebarProps {
	pendingCount: number;
	canManageUsers: boolean;
}
```

Adicionar grupo "Usuários" no fim de `NAV_GROUPS` (após Catálogo):

```ts
{
	label: "Usuários",
	items: [
		{ label: "Dashboard", href: "/dashboard/users" as Route },
		{
			label: "Clientes",
			href: "/dashboard/users/clients" as Route,
			disabled: true,
		},
	],
},
```

No render do grupo, antes de renderizar grupo "Usuários", aplicar gate `if (group.label === "Usuários" && !canManageUsers) return null;`.

Adicionar badge `pendingCount` ao item "Dashboard" do grupo Usuários:

```tsx
<SidebarMenuButton
	isActive={isActive(pathname, item)}
	render={
		<Link href={item.href}>
			{item.label}
			{item.href === "/dashboard/users" && pendingCount > 0 && (
				<span className="ml-2 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
					{pendingCount}
				</span>
			)}
		</Link>
	}
/>
```

- [ ] **Step 3: `bun check-types --filter=web`**

Expected: PASS.

- [ ] **Step 4: Smoke**

Run: `bun dev:web`. Login como super_admin → grupo "Usuários" visível, badge mostra count se há pendentes. Login como manager/user → grupo escondido.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/app-sidebar.tsx apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(web): sidebar com grupo Usuários gated por capability + badge pending"
```

---

## Fase H — Branch scope aplicado a queries

### Task H1: Filtrar `dashboard/stock` por user_branch

**Files:**
- Modify: arquivo de queries em `apps/web/src/app/dashboard/stock/` (localizar com Grep)

- [ ] **Step 1: Localizar queries de stock**

Run: `rg "from\s*\(\s*stockLevel" apps/web/src/app/dashboard/stock` (ou via tool Grep).

- [ ] **Step 2: Aplicar scope**

Em cada query principal (listagem por filial, listagem por ferramenta) adicionar:

```ts
import { getUserBranchScope } from "@/lib/branch-scope";
import { inArray } from "drizzle-orm";

const session = await requireCurrentSession();
const scope = await getUserBranchScope(session);

// ...query base...
const conditions = [/* condições existentes */];
if (scope !== null) {
	if (scope.length === 0) {
		return { items: [], nextCursor: null }; // user sem filiais → vazio
	}
	conditions.push(inArray(stockLevel.branchId, scope));
}
```

Ajustar conforme assinatura de cada função (cursor pagination, etc).

- [ ] **Step 3: Smoke**

Run: `bun dev:web`, criar user `manager` com filial Curitiba apenas → /dashboard/stock só mostra rows daquela filial. Super_admin vê tudo.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/stock
git commit -m "feat(web): filtrar /dashboard/stock por user_branch"
```

---

### Task H2: Filtrar `dashboard/stock/branches`

**Files:**
- Modify: arquivos em `apps/web/src/app/dashboard/stock/branches/`

- [ ] **Step 1: Aplicar mesmo padrão**

Localizar query principal. Adicionar filtro scope. Para visualização "por filial", se scope.length === 1, opcionalmente skipar UI de seleção e abrir direto a única filial.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/dashboard/stock/branches
git commit -m "feat(web): filtrar visão por filial conforme user_branch"
```

---

### Task H3: Filtrar `dashboard/orders` por filial do pedido

**Files:**
- Modify: arquivos em `apps/web/src/app/dashboard/orders/`

- [ ] **Step 1: Localizar query**

Run: `rg "from\s*\(\s*order\b" apps/web/src/app/dashboard/orders`.

- [ ] **Step 2: Aplicar scope**

`order.branchId` existe (FK opcional para `branch`, índice `order_branch_id_idx`). Adicionar:

```ts
import { getUserBranchScope } from "@/lib/branch-scope";
import { requireCurrentSession } from "@/lib/session";
import { inArray, isNull, or } from "drizzle-orm";

const session = await requireCurrentSession();
const scope = await getUserBranchScope(session);

if (scope !== null) {
	if (scope.length === 0) return { items: [], nextCursor: null };
	// orders com branchId null (legados) ficam invisíveis pra non-super_admin
	conditions.push(inArray(order.branchId, scope));
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders
git commit -m "feat(web): filtrar /dashboard/orders por user_branch"
```

---

## Fase I — Testes

### Task I1: Tests de permissions atualizados

**Files:**
- Modify: `apps/web/__tests__/permissions.test.ts`

- [ ] **Step 1: Adicionar cases para super_admin + caps novas**

Adicionar no fim do arquivo:

```ts
describe("super_admin caps", () => {
	it("super_admin tem todas as capabilities", () => {
		const caps: Capability[] = [
			"branches.manage",
			"branches.set_default",
			"users.approve",
			"users.delete",
			"users.update_role",
			"users.update_branches",
			"users.suspend",
			"users.reset_password",
		];
		for (const cap of caps) {
			expect(can("super_admin", cap)).toBe(true);
		}
	});

	it("admin NÃO tem users.delete nem branches.set_default", () => {
		expect(can("admin", "users.delete")).toBe(false);
		expect(can("admin", "branches.set_default")).toBe(false);
		expect(can("admin", "branches.manage")).toBe(false);
	});

	it("admin tem users.approve, users.suspend, users.update_role", () => {
		expect(can("admin", "users.approve")).toBe(true);
		expect(can("admin", "users.suspend")).toBe(true);
		expect(can("admin", "users.update_role")).toBe(true);
	});

	it("manager NÃO tem caps de users", () => {
		expect(can("manager", "users.approve")).toBe(false);
		expect(can("manager", "users.suspend")).toBe(false);
	});

	it("user NÃO tem caps de users", () => {
		expect(can("user", "users.approve")).toBe(false);
	});
});
```

- [ ] **Step 2: Run**

Run: `bun --cwd apps/web test`
Expected: PASS (todos os testes, incluindo legados).

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/permissions.test.ts
git commit -m "test(web): cobertura de super_admin + caps novas em permissions"
```

---

### Task I2: Tests de `getUserBranchScope`

**Files:**
- Create: `apps/web/__tests__/branch-scope.test.ts`

- [ ] **Step 1: Criar arquivo**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@emach/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve([])),
			})),
		})),
	},
}));

import { getUserBranchScope, inScope } from "@/lib/branch-scope";

describe("inScope()", () => {
	it("retorna true quando scope é null (super_admin)", () => {
		expect(inScope(null, "any-id")).toBe(true);
	});

	it("retorna true quando id está no scope", () => {
		expect(inScope(["a", "b"], "a")).toBe(true);
	});

	it("retorna false quando id fora do scope", () => {
		expect(inScope(["a", "b"], "c")).toBe(false);
	});

	it("retorna false quando scope vazio", () => {
		expect(inScope([], "a")).toBe(false);
	});
});

describe("getUserBranchScope()", () => {
	it("retorna null para super_admin sem consultar DB", async () => {
		const session = {
			user: { id: "u1", role: "super_admin" },
		} as never;
		const result = await getUserBranchScope(session);
		expect(result).toBeNull();
	});
});
```

`tsconfig` precisa resolver alias `@/lib/branch-scope`. Se vitest não pega aliases por default, configurar via `vitest.config.ts` ou `vite-tsconfig-paths`. Adicionar config se necessário.

- [ ] **Step 2: Run**

Run: `bun --cwd apps/web test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/branch-scope.test.ts
git commit -m "test(web): cobertura de getUserBranchScope e inScope"
```

---

## Fase J — Ecommerce sync + cleanup env

### Task J1: Sync schema em `emach-ecommerce`

**Files:**
- Modify: `~/emach/emach-ecommerce/packages/db/src/schema/inventory.ts`
- Modify: `~/emach/emach-ecommerce/packages/db/src/schema/index.ts` (se barrel)
- Eventualmente: `~/emach/emach-ecommerce/packages/db/src/schema/auth.ts` (sync user.status + user_role)

- [ ] **Step 1: Copiar `inventory.ts` byte-a-byte do dashboard**

Run:
```bash
cp /home/othavio/emach/emach-dashboard/packages/db/src/schema/inventory.ts \
   /home/othavio/emach/emach-ecommerce/packages/db/src/schema/inventory.ts
```

- [ ] **Step 2: Copiar `auth.ts` byte-a-byte**

```bash
cp /home/othavio/emach/emach-dashboard/packages/db/src/schema/auth.ts \
   /home/othavio/emach/emach-ecommerce/packages/db/src/schema/auth.ts
```

- [ ] **Step 3: Copiar `orders.ts` (mudança em order_note.author_id)**

```bash
cp /home/othavio/emach/emach-dashboard/packages/db/src/schema/orders.ts \
   /home/othavio/emach/emach-ecommerce/packages/db/src/schema/orders.ts
```

- [ ] **Step 4: `bun --cwd /home/othavio/emach/emach-ecommerce check-types --filter=@emach/db`**

Expected: PASS.

- [ ] **Step 5: Commit no ecommerce**

```bash
cd /home/othavio/emach/emach-ecommerce
git add packages/db/src/schema/
git commit -m "chore(db): sync schema do dashboard (isDefault, user_branch, status, super_admin)"
```

(Confirmar com o user antes de commitar — repo separado.)

---

### Task J2: Helper `getDefaultBranchId` no ecommerce

**Files:**
- Create: `~/emach/emach-ecommerce/apps/web/src/lib/default-branch.ts`

- [ ] **Step 1: Criar helper**

```ts
import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { eq } from "drizzle-orm";
import { unstable_cache as cache } from "next/cache";

export const getDefaultBranchId = cache(
	async (): Promise<string> => {
		const [row] = await db
			.select({ id: branch.id })
			.from(branch)
			.where(eq(branch.isDefault, true))
			.limit(1);
		if (!row) {
			throw new Error("Filial padrão não configurada no DB");
		}
		return row.id;
	},
	["default-branch"],
	{ tags: ["default-branch"], revalidate: 3600 }
);
```

- [ ] **Step 2: Commit no ecommerce**

```bash
cd /home/othavio/emach/emach-ecommerce
git add apps/web/src/lib/default-branch.ts
git commit -m "feat(web): helper getDefaultBranchId lendo branch.isDefault"
```

---

### Task J3: Substituir env var no checkout do ecommerce

**Files:**
- Modify: `~/emach/emach-ecommerce/apps/web/src/app/checkout/_actions/create-order.ts`
- Modify: `~/emach/emach-ecommerce/packages/env/src/server.ts`
- Modify: `~/emach/emach-ecommerce/apps/web/.env`
- Modify: `~/emach/emach-ecommerce/apps/web/.env.example`

- [ ] **Step 1: Atualizar `create-order.ts:335`**

Substituir:

```ts
const branchId = env.ECOMMERCE_DEFAULT_BRANCH_ID;
```

Por:

```ts
const branchId = await getDefaultBranchId();
```

Adicionar import:

```ts
import { getDefaultBranchId } from "@/lib/default-branch";
```

Remover import de `env.ECOMMERCE_DEFAULT_BRANCH_ID` se não há outros usos. `rg "env\.ECOMMERCE_DEFAULT_BRANCH_ID" apps/web` para confirmar.

- [ ] **Step 2: Remover do `packages/env/src/server.ts`**

Apagar linha:

```ts
ECOMMERCE_DEFAULT_BRANCH_ID: z.string().min(1),
```

- [ ] **Step 3: Remover do `.env` e `.env.example`**

Apagar linha `ECOMMERCE_DEFAULT_BRANCH_ID=...` de ambos.

- [ ] **Step 4: `bun check-types` no ecommerce**

Run: `cd /home/othavio/emach/emach-ecommerce && bun check-types`
Expected: PASS.

- [ ] **Step 5: Smoke checkout**

Run: `cd /home/othavio/emach/emach-ecommerce && bun dev`. Adicionar produto ao carrinho, fazer checkout completo, confirmar que pedido foi criado e tem `branchId='br-curitiba'`.

- [ ] **Step 6: Commit no ecommerce**

```bash
cd /home/othavio/emach/emach-ecommerce
git add apps/web/src/app/checkout/_actions/create-order.ts packages/env/src/server.ts apps/web/.env apps/web/.env.example
git commit -m "feat(web): substituir ECOMMERCE_DEFAULT_BRANCH_ID por branch.isDefault no DB"
```

---

### Task J4: Limpar env do dashboard + atualizar doc

**Files:**
- Modify: `~/emach/emach-dashboard/apps/web/.env`
- Modify: `~/emach/emach-dashboard/docs/integration/admin-ecommerce.md`

- [ ] **Step 1: Remover `ECOMMERCE_DEFAULT_BRANCH_ID` do `.env` do dashboard**

Apagar linha `ECOMMERCE_DEFAULT_BRANCH_ID=br-curitiba`.

- [ ] **Step 2: Atualizar doc**

Em `docs/integration/admin-ecommerce.md`, adicionar seção (se já existe seção sobre env, atualizar):

```markdown
## Filial default do ecommerce

A filial que processa pedidos do storefront vive em `branch.isDefault = true` no DB
(partial unique index garante max 1 default ativa). Mudança via dashboard em
`/dashboard/branches/[id]/edit` por super_admin (toggle "Filial padrão do ecommerce").

O ecommerce lê via helper `getDefaultBranchId()` (`apps/web/src/lib/default-branch.ts`)
cacheado por 1h. Trocar a default no dashboard chama `revalidateTag("default-branch")`
localmente; o ecommerce só vê a mudança após o TTL (até 1h) ou redeploy.

Histórico: substituiu o env var `ECOMMERCE_DEFAULT_BRANCH_ID` em 2026-05.
```

- [ ] **Step 3: Commit no dashboard**

```bash
cd /home/othavio/emach/emach-dashboard
git add apps/web/.env docs/integration/admin-ecommerce.md
git commit -m "docs: limpar env var ECOMMERCE_DEFAULT_BRANCH_ID + atualizar integração"
```

---

## Fase K — Verificação final

### Task K1: Verificação end-to-end manual + smoke

**Files:** (sem alterações)

- [ ] **Step 1: `bun check-types` no monorepo**

Run: `bun check-types`
Expected: PASS em todos os workspaces.

- [ ] **Step 2: `bun --cwd apps/web test`**

Expected: PASS (legados + novos).

- [ ] **Step 3: `bun fix`**

Expected: zero changes (já rodou no PostToolUse).

- [ ] **Step 4: Smoke completo**

Cenários a executar manualmente em `bun dev:web`:

| Cenário | Esperado |
|---|---|
| Signup novo → `/pending` | Card "Aguardando aprovação" + botão Sair |
| Login com user `pending` em /login | Redirect a `/pending` |
| Super_admin abre `/dashboard/users` → aba Pendentes | Vê pendente |
| Aprovar pendente como role=user + 1 filial | Pendente some, aparece em Ativos com badge "user" + filial |
| User aprovado faz login | Acessa `/dashboard` normalmente |
| Admin (1 filial) tenta atribuir filial fora do escopo | Erro toast "Filial fora do seu escopo" |
| Admin tenta promover manager a admin | Erro toast (capability) |
| Suspender user → próxima request da aba aberta | Redirect `/suspended` |
| Reativar user | Status volta active |
| Reset senha → mostra token + botão copiar | Token visível |
| Deletar user com movimentos de stock | Stock movements ficam com actor=system |
| Tentar deletar último super_admin | Erro toast |
| Toggle `isDefault` em outra filial | Listagem mostra novo badge |
| Tentar deletar filial default | Erro toast |
| Ecommerce checkout após troca de default | Após TTL/restart usa nova filial |

- [ ] **Step 5: Sem commit final — tudo já está commitado por task.**

---

## Notas para implementação

1. **Ordem rígida entre repos:** Tasks A1-A5 + B1-G1 no dashboard. **Migration aplicada em prod ANTES** de qualquer deploy do ecommerce (Task J3). Sequência:
   - Dev: A1→A5 (schema), B1→G1 (app), J1 (ecommerce sync), J2→J3 (ecommerce helper+checkout), J4 (cleanup env).
   - Prod: migration SQL → deploy dashboard → deploy ecommerce → cleanup `.env` em servidores.

2. **Bootstrap super_admin:** após primeiro deploy em prod, executar manualmente:
   ```sql
   UPDATE "user" SET role='super_admin', status='active' WHERE email='<owner>';
   ```

3. **Better Auth signup redirect race:** se UX ficar ruim (signup → /dashboard → /pending faz flash), ajustar `AuthCard.tsx` para chamar `getCurrentSession` após `signUp.email` e redirecionar diretamente conforme status.

4. **`bun fix` PostToolUse:** o hook auto-formata após cada Write/Edit. Se um Edit subsequente falhar com "string não encontrada", re-ler o arquivo e refazer.

5. **shadcn primitives faltantes:** Tasks F5/F6/F7 podem precisar de `sheet`, `popover`, `checkbox`, `select`, `alert-dialog`, `tabs`, `switch`. Antes de cada task, conferir `packages/ui/src/components/` e instalar via skill `shadcn` se faltar.

6. **Drizzle Kit partial unique index:** se `db:push`/`db:generate` não gerar `WHERE is_default = true`, adicionar manualmente ao SQL versionado em Task A5. Em dev pode aplicar via `psql` direto:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS branch_is_default_unique
   ON branch (is_default) WHERE is_default = true;
   ```

---

## Critérios de aceite (cópia da spec)

- Signup novo bloqueado fora de `/dashboard/*` até `status='active'`.
- Admin de filial X só atribui filial X em aprovações.
- Super_admin marca filial Y como default; após TTL, ecommerce usa Y.
- Último super_admin não pode ser deletado.
- `ECOMMERCE_DEFAULT_BRANCH_ID` removido de ambos os repos e da doc.
- `bun check-types` + `bun test apps/web` + `bun fix` passam.
