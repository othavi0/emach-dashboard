# Refatoração do Detalhe de Usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar `/dashboard/users/[id]` ao padrão `entity detail` das filiais — header com ação contextual por aba, Visão geral com KPIs+cards, Filiais em cards com stats, Segurança refeita, Atividade em timeline e drawer de edição mais completo.

**Architecture:** Reescrita das abas e do header reaproveitando os componentes `entity/*` e os espelhos do fluxo de filiais (`branches/[id]`). Toda mutação sensível permanece nas server actions existentes (guard-rails P0). Apenas `updateUser` é estendida (avatar + e-mail verificado); demais actions são reusadas sem mudança. Um bucket de Storage novo (`user-avatars`) é criado para o upload de avatar.

**Tech Stack:** Next 16 (RSC), React 19, Drizzle, Better Auth, Supabase Storage, Tailwind, shadcn/ui (`@emach/ui`), Zod, sonner.

**Spec:** `docs/superpowers/specs/2026-06-02-user-detail-refactor-design.md`

**Convenções do projeto (ler antes de executar):**
- Subagent **lê cada arquivo antes de editar** (não herda state do parent). Rodar `bun check-types` **e** `bun check` (ultracite) antes de cada commit.
- Smoke visual obrigatório na porta **3006** (a **3007** é outra branch/worktree — não usar). Subir com `cd apps/web && bun next dev --port 3006` se não estiver no ar.
- `check-types` não pega hook client em Server Component nem SQL inválido em template string.
- IDs de usuário são alfanuméricos (Better Auth) → Zod `.string().min(1)`, nunca `.uuid()`.
- Não há infra de teste de componente React no repo (só `*.test.ts` de schema/cursor). TDD aplica-se a **schema e lógica pura**; componentes de UI são verificados por **smoke visual**.
- Usuário de teste para smoke: `tBFpJTKULRAVYTUFY1M6PoP65bDwdV4G` (Teste Pendente Smoke, 1 filial Ribeirão Preto).

**Commits:** Conventional Commits em PT, subject ≤50 chars.

---

## File Structure

**Novos:**
- `apps/web/src/app/dashboard/users/[id]/_components/user-branch-card.tsx` — card de filial vinculada (espelha `BranchCard`).
- `apps/web/src/app/dashboard/users/[id]/_components/user-branch-link-panel.tsx` — Popover+Command de vincular filial (espelha `TeamLinkPanel`).
- `apps/web/src/app/dashboard/users/[id]/_components/edit-user-button.tsx` — botão de header que abre o drawer (espelha `EditBranchButton`).
- `apps/web/src/app/dashboard/users/[id]/_components/access-status-card.tsx` — card Suspender/Reativar da Segurança.
- `apps/web/src/app/dashboard/users/_components/avatar-actions.ts` — upload/delete de avatar (espelha `tools/_components/image-actions.ts`).

**Modificados:**
- `apps/web/src/app/dashboard/users/[id]/page.tsx` — recebe `searchParams`, ação de header por aba, remove `UserActionsMenu`.
- `apps/web/src/app/dashboard/users/[id]/_components/user-identity.tsx` — vira "dumb", recebe `actions`.
- `apps/web/src/app/dashboard/users/[id]/_components/profile-tab.tsx` — Visão geral (KPIs + 2 cards), sem zona de perigo.
- `apps/web/src/app/dashboard/users/[id]/_components/branches-tab.tsx` — grid de `UserBranchCard` + empty state.
- `apps/web/src/app/dashboard/users/[id]/_components/security-tab.tsx` — 5 cards (status, e-mail, reset, sessões, zona de perigo).
- `apps/web/src/app/dashboard/users/[id]/_components/activity-affecting-user-view.tsx` + `activity-by-user-view.tsx` — timeline com ícones.
- `apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx` — avatar + nome + cargo + toggle e-mail verificado.
- `apps/web/src/app/dashboard/users/data.ts` — `getUserDetailKpis`, `getUserLinkedBranchesWithStats`, `provider` em `getUserDetail`.
- `apps/web/src/app/dashboard/users/actions.ts` — `updateUser` seta `image`/`emailVerified`.
- `apps/web/src/app/dashboard/users/schema.ts` — `updateUserSchema` + `image`/`emailVerified`.
- `apps/web/src/lib/supabase-server.ts` — constante `USER_AVATARS_BUCKET`.

**Removidos:**
- `apps/web/src/app/dashboard/users/[id]/_components/user-actions-menu.tsx`
- `apps/web/src/app/dashboard/users/[id]/_components/danger-zone.tsx` (conteúdo absorvido pela Segurança)

---

## Task 1: Bucket de avatar + helper de upload

**Files:**
- Modify: `apps/web/src/lib/supabase-server.ts` (adicionar constante)
- Create: `apps/web/src/app/dashboard/users/_components/avatar-actions.ts`
- Modify: `docs/storage-buckets.md` (documentar bucket)
- DB: criar bucket `user-avatars` (SQL via Supabase)

- [ ] **Step 1: Criar o bucket no Supabase**

Rodar via MCP Supabase (`execute_sql`, project `wrxohbzepoyscsacjzvd`) ou Dashboard:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-avatars', 'user-avatars', true, 2097152,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
```

Verificar: `SELECT id, public, file_size_limit FROM storage.buckets WHERE id='user-avatars';` → 1 linha, `public=true`.

- [ ] **Step 2: Adicionar a constante do bucket**

Em `apps/web/src/lib/supabase-server.ts`, ao lado de `TOOL_IMAGES_BUCKET`, adicionar:

```ts
export const USER_AVATARS_BUCKET = "user-avatars";
```

(Ler o arquivo antes para confirmar o nome exato da constante existente e o padrão de export.)

- [ ] **Step 3: Criar as server actions de avatar**

Criar `apps/web/src/app/dashboard/users/_components/avatar-actions.ts` (espelha `tools/_components/image-actions.ts`, trocando bucket e a action de auditoria):

```ts
"use server";

import { logUserActivity } from "@/lib/activity";
import { requireCurrentSession } from "@/lib/session";
import { requireCapabilityWithContext } from "@/lib/permissions";
import {
	extractPublicUrlPath,
	removeStorageObject,
	uploadToPublicBucket,
} from "@/lib/storage";
import { USER_AVATARS_BUCKET } from "@/lib/supabase-server";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadUserAvatar(
	formData: FormData
): Promise<{ url: string }> {
	const session = await requireCurrentSession();
	await requireCapabilityWithContext("users.manage", {});

	const { url } = await uploadToPublicBucket({
		bucket: USER_AVATARS_BUCKET,
		formData,
		maxSizeBytes: MAX_SIZE_BYTES,
		allowedTypes: ALLOWED_TYPES,
	});

	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.avatar_uploaded",
		targetType: "user",
		metadata: { url },
	});
	return { url };
}

export async function deleteUserAvatar(url: string): Promise<void> {
	const session = await requireCurrentSession();
	await requireCapabilityWithContext("users.manage", {});

	const path = extractPublicUrlPath(url, USER_AVATARS_BUCKET);
	if (!path) {
		return;
	}
	await removeStorageObject(USER_AVATARS_BUCKET, path);
	await logUserActivity({
		actorUserId: session.user.id,
		action: "user.avatar_deleted",
		targetType: "user",
		metadata: { path },
	});
}
```

- [ ] **Step 4: Documentar o bucket**

Adicionar seção `## user-avatars` em `docs/storage-buckets.md` (espelhar a seção `tool-images`: público, 2 MB, PNG/JPEG/WEBP; URL salva em `user.image`; upload server-side via `avatar-actions.ts`).

- [ ] **Step 5: Verificar tipos e commitar**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
git add apps/web/src/lib/supabase-server.ts apps/web/src/app/dashboard/users/_components/avatar-actions.ts docs/storage-buckets.md
git commit -m "feat: bucket e actions de avatar de usuario"
```

Expected: `check-types` e `check` sem erros.

---

## Task 2: Camada de dados — KPIs, filiais com stats, provider

**Files:**
- Modify: `apps/web/src/app/dashboard/users/data.ts`

- [ ] **Step 1: Adicionar `getUserDetailKpis`**

Em `data.ts`, após `getUserDetail`, adicionar (usar `sessionTable`, já importado de `@emach/db/schema/auth`):

```ts
export interface UserDetailKpis {
	activeSessions: number;
	createdAt: Date;
	lastLoginAt: Date | null;
	linkedBranches: number;
}

export async function getUserDetailKpis(
	userId: string
): Promise<UserDetailKpis> {
	const [branches] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(userBranch)
		.where(eq(userBranch.userId, userId));
	const [sessions] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(sessionTable)
		.where(
			and(
				eq(sessionTable.userId, userId),
				gt(sessionTable.expiresAt, new Date())
			)
		);
	const [u] = await db
		.select({ createdAt: userTable.createdAt, lastLoginAt: userTable.lastLoginAt })
		.from(userTable)
		.where(eq(userTable.id, userId));
	return {
		activeSessions: sessions?.n ?? 0,
		createdAt: u?.createdAt ?? new Date(0),
		lastLoginAt: u?.lastLoginAt ?? null,
		linkedBranches: branches?.n ?? 0,
	};
}
```

- [ ] **Step 2: Adicionar `getUserLinkedBranchesWithStats`**

Espelha os stats de `branches/data.ts` (`fetchBranchesPage`/`BranchTableRow`). **Ler `branches/data.ts` antes** para copiar as expressões de `teamCount`, `activeSkus`, `lowStock` exatamente (evita divergência de cálculo). Tipo e função:

```ts
export interface UserLinkedBranch {
	activeSkus: number;
	city: string | null;
	id: string;
	lowStock: number;
	name: string;
	neighborhood: string | null;
	state: string | null;
	street: string | null;
	streetNumber: string | null;
	status: "active" | "inactive";
	teamCount: number;
}

export async function getUserLinkedBranchesWithStats(
	userId: string
): Promise<UserLinkedBranch[]> {
	// SELECT das filiais onde branch.id IN (SELECT branch_id FROM user_branch WHERE user_id = userId)
	// com os MESMOS subselects de teamCount/activeSkus/lowStock usados em branches/data.ts,
	// ordenado por branch.name asc. Campos de endereço para formatBranchAddress.
}
```

> O corpo deve reusar a forma de query de `branches/data.ts`. Não inventar cálculo de `lowStock`/`activeSkus` — copiar o existente filtrando por filiais do usuário.

- [ ] **Step 3: Adicionar `provider` em `getUserDetail`**

`account` tem N linhas por user → **não** fazer join direto (multiplicaria o `groupBy`). Usar subquery escalar do primeiro provider:

```ts
// no .select() de getUserDetail, adicionar:
provider: sql<string | null>`(
	select a.provider_id from account a
	where a.user_id = ${userTable.id}
	order by a.created_at asc limit 1
)`,
```

E adicionar `provider: string | null` à interface `UserDetail`. (Confirmar nomes reais de colunas: `account.provider_id`, `account.user_id`, `account.created_at`.)

- [ ] **Step 4: Smoke da query (sem teste unitário — não há infra de DB no test runner)**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types
```

Validar a forma da query via MCP Supabase rodando o SQL equivalente para o user de teste e conferindo 1 filial / 0 sessões / provider `credential`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/data.ts
git commit -m "feat: queries de kpis e filiais com stats do usuario"
```

---

## Task 3: Schema + action `updateUser` (avatar + e-mail verificado)

**Files:**
- Modify: `apps/web/src/app/dashboard/users/schema.ts`
- Test: `apps/web/src/app/dashboard/users/_components/__tests__/update-user-schema.test.ts` (criar)
- Modify: `apps/web/src/app/dashboard/users/actions.ts`

- [ ] **Step 1: Escrever o teste do schema (falhando)**

Criar `apps/web/src/app/dashboard/users/_components/__tests__/update-user-schema.test.ts` (espelhar o estilo de `branches/_components/__tests__/branch-schema.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { updateUserSchema } from "../../schema";

describe("updateUserSchema", () => {
	it("aceita image e emailVerified opcionais", () => {
		const r = updateUserSchema.safeParse({
			userId: "abc",
			image: "https://x/y.png",
			emailVerified: true,
		});
		expect(r.success).toBe(true);
	});

	it("aceita image null para remover avatar", () => {
		const r = updateUserSchema.safeParse({ userId: "abc", image: null });
		expect(r.success).toBe(true);
	});

	it("rejeita image que não é URL nem null", () => {
		const r = updateUserSchema.safeParse({ userId: "abc", image: "not-a-url" });
		expect(r.success).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/web && bun vitest run src/app/dashboard/users/_components/__tests__/update-user-schema.test.ts`
Expected: FAIL (schema ainda não aceita `image`/`emailVerified`).

- [ ] **Step 3: Estender `updateUserSchema`**

Em `schema.ts`, substituir o objeto `updateUserSchema`:

```ts
export const updateUserSchema = z.object({
	userId: z.string().min(1),
	name: z.string().min(2).max(100).optional(),
	role: z.enum(ROLES).optional(),
	image: z.url().nullish(),
	emailVerified: z.boolean().optional(),
});
```

> `z.url().nullish()` aceita string-URL, `null` (remover avatar) e `undefined` (não mexer). Se a versão de Zod do projeto usar `z.string().url()`, ajustar para `z.string().url().nullish()` — conferir imports/uso de `z` no arquivo.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/web && bun vitest run src/app/dashboard/users/_components/__tests__/update-user-schema.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Estender a action `updateUser`**

Em `actions.ts`, dentro do `db.transaction` de `updateUser`, ampliar o objeto `update` e o log. O tipo `update` passa a incluir os campos novos; setar quando presentes (`!== undefined`; `image` pode ser `null`):

```ts
const update: {
	name?: string;
	role?: UpdateUserInput["role"];
	image?: string | null;
	emailVerified?: boolean;
} = {};
if (parsed.data.name) { update.name = parsed.data.name; }
if (parsed.data.role) { update.role = parsed.data.role; }
if (parsed.data.image !== undefined) { update.image = parsed.data.image; }
if (parsed.data.emailVerified !== undefined) {
	update.emailVerified = parsed.data.emailVerified;
}
```

E no `changes` (metadata do `user.updated`), registrar `image`/`emailVerified` quando `!== undefined`. A revogação de sessões permanece **apenas** quando `roleChanged` (não revogar por troca de avatar/verificação).

- [ ] **Step 6: Verificar e commitar**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
git add apps/web/src/app/dashboard/users/schema.ts apps/web/src/app/dashboard/users/actions.ts apps/web/src/app/dashboard/users/_components/__tests__/update-user-schema.test.ts
git commit -m "feat: updateUser aceita avatar e email verificado"
```

---

## Task 4: Header com ação contextual por aba

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/_components/edit-user-button.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/user-identity.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/page.tsx`

- [ ] **Step 1: Criar `EditUserButton`**

Espelha `branches/[id]/_components/edit-branch-button.tsx` — Client Component que seta `?edit=1`. Label "Editar Usuário", ícone `Pencil`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function EditUserButton() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const handleEdit = () => {
		const sp = new URLSearchParams(params);
		sp.set("edit", "1");
		router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
	};
	return (
		<Button onClick={handleEdit} size="sm" variant="outline">
			<Pencil aria-hidden className="mr-1.5 size-3.5" />
			Editar Usuário
		</Button>
	);
}
```

- [ ] **Step 2: Tornar `UserIdentity` "dumb"**

Reescrever `user-identity.tsx` no molde de `branch-identity.tsx`: remover `useRouter`/`handleEdit`/o botão fixo; passar a receber `actions?: ReactNode` e repassar ao `EntityIdentityHeader`. Mantém avatar/badges/subtitle. Pode deixar de ser `"use client"` (vira Server Component puro de apresentação):

```tsx
import type { ReactNode } from "react";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import { getInitials } from "@/lib/format/name";
import { RoleBadge } from "../../_components/role-badge";
import { StatusBadge } from "../../_components/status-badge";
import type { UserDetail } from "../../data";

export function UserIdentity({
	user,
	actions,
}: {
	user: UserDetail;
	actions?: ReactNode;
}) {
	return (
		<EntityIdentityHeader
			actions={actions}
			avatarFallback={getInitials(user.name)}
			avatarUrl={user.image}
			badges={
				<>
					<RoleBadge role={user.role} />
					<StatusBadge status={user.status} />
				</>
			}
			subtitle={user.email}
			title={user.name}
		/>
	);
}
```

> Usar `getInitials` de `@/lib/format/name` (já usado em `BranchCard`/`TeamMemberCard`) em vez do helper local atual — remove duplicação.

- [ ] **Step 3: Reescrever `page.tsx` — ação por aba**

`page.tsx` passa a receber `searchParams` e escolher a ação do header conforme `sp.tab` (espelha `branches/[id]/page.tsx`). Remove `UserActionsMenu`. KPIs e filiais com stats são carregados junto (para Visão geral / aba Filiais). Esqueleto:

```tsx
interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; tab?: string }>;
}

export default async function UserDetailPage({ params, searchParams }: PageProps) {
	const { id } = await params;
	const sp = await searchParams;
	const actorSession = await requireUserDetailAccessOrRedirect(id);
	const canDelete = can(actorSession.user.role, "users.delete");

	const [user, availableBranches, kpis, linkedBranches] = await Promise.all([
		getUserDetail(id),
		db.select({ id: branch.id, name: branch.name }).from(branch).orderBy(asc(branch.name)),
		getUserDetailKpis(id),
		getUserLinkedBranchesWithStats(id),
	]);
	if (!user) { notFound(); }

	const linkedIds = linkedBranches.map((b) => b.id);

	const tabs: EntityTab[] = [
		{ value: "profile", label: "Perfil", icon: <User aria-hidden className="size-3.5" />,
		  content: <ProfileTab user={user} kpis={kpis} linkedBranches={linkedBranches} /> },
		{ value: "branches", label: "Filiais", icon: <Briefcase aria-hidden className="size-3.5" />,
		  badge: <TabCountBadge n={linkedBranches.length} />,
		  content: <BranchesTab userId={user.id} linkedBranches={linkedBranches} /> },
		{ value: "activity", label: "Atividade", icon: <Activity aria-hidden className="size-3.5" />,
		  content: <ActivityTab userId={user.id} /> },
		{ value: "sessions", label: "Sessões", icon: <Monitor aria-hidden className="size-3.5" />,
		  content: <SessionsTab userId={user.id} /> },
		{ value: "security", label: "Segurança", icon: <Lock aria-hidden className="size-3.5" />,
		  content: <SecurityTab user={user} canDelete={canDelete} /> },
	];

	const headerAction =
		!sp.tab || sp.tab === "profile" ? <EditUserButton />
		: sp.tab === "branches" ? (
			<UserBranchLinkPanel
				userId={user.id}
				options={availableBranches.filter((b) => !linkedIds.includes(b.id))}
			/>
		) : null;

	return (
		<div className="flex flex-col gap-6 p-6">
			<UserIdentity actions={headerAction} user={user} />
			<EntityTabs defaultValue="profile" tabs={tabs} />
			<UserEditSheet
				actorRole={actorSession.user.role as UserRow["role"]}
				user={{ id: user.id, name: user.name, role: user.role, image: user.image, emailVerified: user.emailVerified }}
			/>
		</div>
	);
}
```

> Para o `badge` de contagem use o mesmo padrão `secondary rounded-md` do branch `page.tsx` (copiar o `<span>` inline de lá; não criar componente novo se não existir). `UserBranchLinkPanel` e props das tabs são definidos nas Tasks 5–8 — se executar fora de ordem, criar stubs que retornam `null` para destravar o `check-types`, substituídos nas tasks seguintes.

- [ ] **Step 4: Verificar e smoke**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
```

Smoke (porta 3006): abrir `/dashboard/users/<id>` → header mostra só "Editar Usuário"; `?tab=branches` → header mostra "Vincular filial"; demais abas → sem ação; o `⋮` sumiu.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/page.tsx apps/web/src/app/dashboard/users/[id]/_components/user-identity.tsx apps/web/src/app/dashboard/users/[id]/_components/edit-user-button.tsx
git commit -m "feat: header de usuario com acao por aba"
```

---

## Task 5: Visão geral (aba Perfil)

**Files:**
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/profile-tab.tsx`

- [ ] **Step 1: Reescrever `ProfileTab`**

Novo contrato: `ProfileTab({ user, kpis, linkedBranches })` (sem `canDelete` — zona de perigo saiu). Estrutura espelhando `branches/[id]/_components/overview-tab.tsx`:

1. `EntityKpisRow` com 4 itens:
   - `{ label: "Filiais", value: kpis.linkedBranches, icon: Briefcase }`
   - `{ label: "Sessões ativas", value: kpis.activeSessions, icon: Monitor }`
   - `{ label: "Último login", value: kpis.lastLoginAt ? formatRelative(kpis.lastLoginAt) : "Nunca", icon: LogIn }`
   - `{ label: "Cadastrado em", value: formatDate(kpis.createdAt), icon: CalendarDays }`
2. Grid `md:grid-cols-2`:
   - **Card "Identidade & acesso":** linhas (rótulo uppercase xs + valor) para E-mail (+ `Badge` "Verificado"/"Não verificado"), Cargo (`RoleBadge`), Status (`StatusBadge`), Provedor de login (`user.provider ?? "—"`). Footer **edge-to-edge** (copiar o bloco `-mx-4 -mb-4 grid grid-cols-2 border-t` do `overview-tab.tsx`): "Cadastrado em" | "Último login".
   - **Card "Vínculos & atividade":** filiais como chips (`linkedBranches.map` → `<span>` pill `bg-muted`); se vazio, texto italic "Sem filial vinculada". Abaixo, link `text-primary text-xs` "Ver atividade" → `?tab=activity` (usar `<Link href={...}>`).

Usar `formatRelative` de `@/lib/format/relative` e um `formatDate` local (`Intl.DateTimeFormat("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" })`, como em `overview-tab.tsx`). Componente é Server Component (sem hooks).

- [ ] **Step 2: Verificar e smoke**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
```

Smoke (3006): `/dashboard/users/<id>` (aba Perfil) → 4 KPIs corretos (Filiais 1, Sessões 0, Último login relativo, Cadastrado 25/05/2026) + 2 cards; sem zona de perigo.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/_components/profile-tab.tsx
git commit -m "feat: visao geral do usuario com kpis e cards"
```

---

## Task 6: Card de filial + aba Filiais

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/_components/user-branch-card.tsx`
- Create: `apps/web/src/app/dashboard/users/[id]/_components/user-branch-link-panel.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/branches-tab.tsx`

- [ ] **Step 1: Criar `UserBranchCard`**

Client Component espelhando `branches/_components/branch-card.tsx` (header avatar+nome+endereço; footer grid-3 Equipe/SKUs/Abaixo-mín com bordas) **mais** a ação Desvincular no rodapé via `AlertDialog` (espelha `TeamMemberCard`, com `stopPropagation`). Card clicável → `/dashboard/branches/${branch.id}`. Props: `{ userId: string; branch: UserLinkedBranch }`. Desvincular chama `unlinkUserFromBranch({ userId, branchId: branch.id })` + `router.refresh()` + toast. Endereço via `formatBranchAddress(branch)`; iniciais via `getInitials(branch.name)`.

> `lowStock > 0` → cor `text-amber-500` no número (copiar do `branch-card.tsx`). Abaixo-mín é o 3º stat.

- [ ] **Step 2: Criar `UserBranchLinkPanel`**

Client Component espelhando `branches/[id]/_components/team-link-panel.tsx`, porém **sem busca remota** — recebe `options: { id: string; name: string }[]` (já filtradas no `page.tsx`) e filtra localmente pelo texto digitado. Botão trigger "Vincular filial" (ícone `Plus`/`Building2`). On select → `linkUserToBranch({ userId, branchId })` + `router.refresh()` + toast + fecha popover. Props: `{ userId: string; options: { id: string; name: string }[] }`. Se `options` vazio, renderizar o botão `disabled` com tooltip "Todas as filiais já vinculadas" (ou simplesmente desabilitado).

- [ ] **Step 3: Reescrever `BranchesTab`**

Novo contrato: `BranchesTab({ userId, linkedBranches })` — **sem** lógica de vincular (foi pro header). Renderiza grid responsivo (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`) de `UserBranchCard`; se `linkedBranches.length === 0`, empty state (espelha `TeamGrid`: ícone `Building2`, "Sem filiais vinculadas", dica "Use 'Vincular filial' no topo."). Vira Server Component (sem estado).

- [ ] **Step 4: Verificar e smoke**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
```

Smoke (3006): `?tab=branches` → card de Ribeirão Preto com stats (Equipe/SKUs/Abaixo-mín), clicável; header "Vincular filial" abre popover com Campinas/São Paulo; vincular e desvincular funcionam (toast + refresh).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/_components/user-branch-card.tsx apps/web/src/app/dashboard/users/[id]/_components/user-branch-link-panel.tsx apps/web/src/app/dashboard/users/[id]/_components/branches-tab.tsx
git commit -m "feat: aba filiais do usuario com cards e stats"
```

---

## Task 7: Aba Segurança refeita

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/_components/access-status-card.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/security-tab.tsx`
- Delete: `apps/web/src/app/dashboard/users/[id]/_components/danger-zone.tsx`
- Delete: `apps/web/src/app/dashboard/users/[id]/_components/user-actions-menu.tsx`

- [ ] **Step 1: Criar `AccessStatusCard`**

Client Component que absorve o Suspender/Reativar do `user-actions-menu.tsx`. Card "Status de acesso" com `StatusBadge` + botão conforme status: `active` → "Suspender" (`variant="outline"`, abre `DestructiveActionDialog` com `reasonRequired` default → `suspendUser`); `suspended` → "Reativar" (`DestructiveActionDialog` `destructive={false}` `reasonRequired={false}` → `reactivateUser`); `pending` → texto "Aguardando aprovação" (sem ação). Props: `{ user: { id: string; name: string; status: "active" | "pending" | "suspended" } }`. Copiar a mecânica de dialog/`useTransition` de `user-actions-menu.tsx`.

- [ ] **Step 2: Reescrever `SecurityTab`**

Novo contrato: `SecurityTab({ user, canDelete })`. Cinco cards na ordem (botões com largura natural — **não** `w-full`):

1. `<AccessStatusCard user={{ id, name, status }} />`
2. **E-mail & verificação** — estado (`CheckCircle2`/`AlertCircle` + texto) **e** um toggle "Marcar como verificado/não verificado" que chama `updateUser({ userId, emailVerified: !user.emailVerified })` (via `useTransition` + toast). Reusa o estado visual do `security-tab.tsx` atual.
3. **Reset de senha** — botão "Enviar e-mail de reset" → `triggerPasswordReset` (manter do atual).
4. **Sessões** — botão "Forçar logout em tudo" → `forceLogoutAllSessions` (manter do atual).
5. **Zona de perigo** — `Card` `border-destructive/40`, absorve o conteúdo de `danger-zone.tsx`: botão "Excluir usuário" (`variant="destructive"`) + `DestructiveActionDialog` → `deleteUser` → `router.push("/dashboard/users")`. **Só renderiza se `canDelete`.**

`user` precisa de `{ id, name, email, emailVerified, status }` — ajustar a prop e o call em `page.tsx` (Task 4) se necessário.

- [ ] **Step 3: Remover componentes mortos**

```bash
git rm apps/web/src/app/dashboard/users/[id]/_components/danger-zone.tsx apps/web/src/app/dashboard/users/[id]/_components/user-actions-menu.tsx
```

Confirmar que não há mais imports de `DangerZone`/`UserActionsMenu` (`ugrep -r "DangerZone\|UserActionsMenu" apps/web/src`).

- [ ] **Step 4: Verificar e smoke**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
```

Smoke (3006): `?tab=security` → 5 cards; suspender pede motivo e revoga sessões; toggle de e-mail verificado alterna; excluir leva pra listagem (testar suspender/reativar em dado de teste; **não** excluir o user de smoke).

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/app/dashboard/users/[id]/_components/
git commit -m "refactor: aba seguranca do usuario refeita"
```

---

## Task 8: Drawer "Editar Usuário" ampliado

**Files:**
- Modify: `apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx`

- [ ] **Step 1: Ampliar `UserEditSheet`**

Prop `user` passa a incluir `image: string | null` e `emailVerified: boolean`. Adicionar ao formulário, acima de Nome:

- **Avatar:** preview (`Avatar` de `@emach/ui` com `getInitials` fallback) + input `type="file"` (accept `image/png,image/jpeg,image/webp`). Ao selecionar: `FormData` → `uploadUserAvatar(fd)` (de `../avatar-actions`) → guarda a `url` em state local `image`. Botão "Remover" zera `image` para `null`. Mostrar spinner durante upload.
- **Toggle "e-mail verificado":** `Switch` de `@emach/ui` ligado a state `emailVerified`.

No `handleSubmit`, incluir `image` e `emailVerified` no payload do `updateUserSchema.safeParse`. `useEffect` de reset (quando abre) também reseta `image`/`emailVerified` a partir de `user`. Atualizar `description` para "Atualize avatar, nome, cargo e verificação de e-mail. Filiais são geridas na aba Filiais."

> Verificar se `Switch` existe em `@emach/ui/components/switch`; se não, usar um checkbox estilizado ou o componente equivalente já usado no projeto (`ugrep -r "components/switch" apps`).

- [ ] **Step 2: Verificar e smoke**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
```

Smoke (3006): aba Perfil → "Editar Usuário" abre drawer com avatar (upload troca a imagem), nome, cargo e toggle de verificação; salvar reflete no header/Perfil.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx
git commit -m "feat: drawer de edicao com avatar e verificacao"
```

---

## Task 9: Atividade em timeline

**Files:**
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/activity-affecting-user-view.tsx`
- Modify: `apps/web/src/app/dashboard/users/[id]/_components/activity-by-user-view.tsx`

- [ ] **Step 1: Mapa de ícones por ação**

Extrair top-level (não dentro do componente) um `Record<string, LucideIcon>` cobrindo as chaves de `ACTION_LABELS` já existentes em `activity-affecting-user-view.tsx`:

```ts
const ACTION_ICONS: Record<string, LucideIcon> = {
	"user.approved": CheckCircle2,
	"user.rejected": XCircle,
	"user.updated": Pencil,
	"user.suspended": Pause,
	"user.reactivated": Play,
	"user.deleted": Trash2,
	"user.password_reset_triggered": KeyRound,
	"user.session_revoked": Monitor,
	"user.all_sessions_revoked": MonitorOff,
	"user.branch_linked": Building2,
	"user.branch_unlinked": Building2,
	"user.avatar_uploaded": ImageIcon,
	"user.avatar_deleted": ImageIcon,
};
const FALLBACK_ICON = Activity;
```

- [ ] **Step 2: Renderizar timeline**

Substituir o `EntityAuditLogTable` por uma lista vertical timeline: cada item = ícone (círculo `bg-muted`, ícone da ação), descrição (label humano + ator quando aplicável), timestamp relativo (`formatRelative`), e metadata expansível (`<details>` ou estado de toggle) quando houver `metadata`. Manter `InfiniteSentinel` + `useInfiniteList` exatamente como hoje. Aplicar nas duas views (a "by user" não tem `actorName` — mostrar só a ação). Empty state preservado.

> Não remover o `EntityAuditLogTable` do repo (pode ser usado por outras telas). Apenas deixar de usá-lo aqui.

- [ ] **Step 3: Verificar e smoke**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
```

Smoke (3006): `?tab=activity` → timeline com ícone na ação "Foi aprovado"; subtabs Feito com/Feito por; expandir metadata.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/users/[id]/_components/activity-affecting-user-view.tsx apps/web/src/app/dashboard/users/[id]/_components/activity-by-user-view.tsx
git commit -m "feat: atividade do usuario em timeline"
```

---

## Task 10: Smoke final completo + limpeza

**Files:** (verificação; sem novas mudanças além de ajustes pontuais)

- [ ] **Step 1: Grep por restos**

```bash
cd /home/othavio/Projects/emach/emach-dashboard
ugrep -r "UserActionsMenu\|DangerZone\|getInitials.*local" apps/web/src/app/dashboard/users || echo "limpo"
```

Expected: nenhuma referência aos componentes removidos.

- [ ] **Step 2: Lint + types final**

```bash
bun check-types && bun check
```

Expected: ambos sem erros.

- [ ] **Step 3: Smoke visual das 5 abas (porta 3006)**

Percorrer no browser (Brave "Notbook", porta **3006**): Perfil (KPIs+cards), Filiais (cards+vincular/desvincular), Atividade (timeline), Sessões (lista), Segurança (5 cards). Header: ação correta por aba, sem `⋮`. Drawer abre com avatar/nome/cargo/toggle. Confirmar nenhum erro no console (`nextjs_call 3006 get_errors` se necessário).

- [ ] **Step 4: Commit final (se houver ajustes de smoke)**

```bash
git add -A && git commit -m "chore: ajustes de smoke do detalhe de usuario"
```

---

## Self-Review (preenchido pelo autor do plano)

- **Cobertura do spec:** A→Task4; B→Task5; C→Task6; D→Task7; E→Task9; F→Task8; G→Tasks 1–3. Header/ação por aba (A) coberto. Bucket de avatar (gap descoberto na infra) coberto na Task 1.
- **Placeholders:** queries de stats (Task 2.2) e corpos de componentes-espelho referenciam o arquivo-fonte exato a copiar em vez de reescrever 100+ linhas — decisão consciente dado o forte padrão de referência; trechos críticos (SQL de provider/KPIs, schema, diff de action) estão completos.
- **Consistência de tipos:** `UserLinkedBranch` (Task 2) usado em Tasks 4/5/6; `UserDetailKpis` (Task 2) em Tasks 4/5; `updateUserSchema` com `image`/`emailVerified` (Task 3) consumido em Tasks 7/8. `UserDetail.provider` (Task 2) usado em Task 5. Prop `user` da Segurança ajustada em Tasks 4 e 7 — conferir alinhamento ao executar Task 7.
</content>
