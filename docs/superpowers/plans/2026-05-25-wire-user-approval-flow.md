# Wire User Approval Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Checkboxes (`- [ ]`) for tracking.

**Goal:** Conectar o `ApprovalSheet` órfão à UI de `/dashboard/users`. Operador deve conseguir aprovar/rejeitar usuários pendentes diretamente da listagem (`?status=pending`) sem precisar entrar no detalhe nem chamar a action manualmente.

**Architecture:** O sheet (`apps/web/src/app/dashboard/users/_components/approval-sheet.tsx`) já implementa fluxo completo (role + filiais + approve/reject + toasts). Falta o gatilho. Vamos:
1. Passar `branches` da page → `UsersCardGrid` → `UserCard`.
2. Em `UserCard`, quando `status === "pending"`, renderizar botão inline "Aprovar" no rodapé.
3. Estado do sheet vive no próprio `UserCard` (escopo de uma linha — não precisa lift up).
4. Click no botão abre sheet, **com `stopPropagation`** pra não disparar a navegação que o card faz no click do wrapper.

**Tech Stack:** Next.js 16 App Router, React 19 client components, server actions já existentes (`approveUser`, `rejectUser`).

**Diagnóstico** (verificado em código):

| Peça | Estado |
|---|---|
| Server action `approveUser` | ✅ existe em `users/actions.ts` |
| Server action `rejectUser` | ✅ existe em `users/actions.ts` |
| Zod schema `approveUserSchema` | ✅ existe em `users/schema.ts` |
| `ApprovalSheet` component | ✅ existe, completo |
| Capability `users.approve` | ✅ existe; gate de visibilidade do grupo "Internos" na sidebar foi corrigido em commit `656c036` (este branch) |
| Trigger pra abrir o sheet | ❌ **AUSENTE** — sheet nunca importado em nenhum lugar |

Out of scope: aprovação no detalhe do usuário (`/dashboard/users/[id]`) e na PendingPanel da home do users (componente Link-based). Limitar a Slice ao gatilho no `UserCard` resolve o caso de uso reportado (`?status=pending`).

---

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/users/_components/user-card.tsx` | **Modificar** | Aceita `branches: BranchLite[]` opcional; quando `user.status === "pending"`, renderiza botão "Aprovar"; controla state do sheet localmente; renderiza `<ApprovalSheet>` |
| `apps/web/src/app/dashboard/users/_components/users-card-grid.tsx` | **Modificar** | Aceita `branches: BranchLite[]`; passa pra cada `UserCard` |
| `apps/web/src/app/dashboard/users/page.tsx` | **Modificar** | Passa `branches` (já fetchadas) pra `<UsersCardGrid>` |

**Não muda:**
- `approval-sheet.tsx` — fica como está; só ganha um caller.
- Actions (`approveUser`, `rejectUser`) — funcionais, já chamadas pelo sheet.
- `UsersPendingCard` / `PendingPanel` — fora de escopo.
- Detalhe do usuário — fora de escopo.

---

## Task 1: Wire `branches` no `UserCard` + botão Aprovar + sheet

**Files:**
- Modify: `apps/web/src/app/dashboard/users/_components/user-card.tsx`

### Contexto

O card atualmente é um `div role="button"` que navega pra `/dashboard/users/[id]` no click. Vamos:
- Aceitar `branches` (lista do dashboard inteiro, já fetchada em `page.tsx`).
- Renderizar um botão "Aprovar" inline no rodapé do card SE `status === "pending"`.
- Manter o click no card → navegação (não mexer nesse comportamento).
- O botão usa `e.stopPropagation()` pra não disparar a navegação.
- State do sheet (qual user está em aprovação) vive no `UserCard` (um por linha).

### Steps

- [ ] **Step 1: Adicionar imports no topo do arquivo**

```typescript
import { useState } from "react";
import { Button } from "@emach/ui/components/button";

import { ApprovalSheet } from "./approval-sheet";
import type { BranchLite, UserRow } from "./types";
```

(`useRouter` já é importado.) Manter ordem que o formatter espera.

- [ ] **Step 2: Estender a interface `UserCardProps`**

Substituir:

```typescript
interface UserCardProps {
	user: UserListRow;
}
```

Por:

```typescript
interface UserCardProps {
	branches: BranchLite[];
	user: UserListRow;
}
```

E desestruturar `branches` na assinatura:

```tsx
export function UserCard({ user, branches }: UserCardProps) {
```

- [ ] **Step 3: Adicionar state local pro sheet**

Logo após `const router = useRouter();`:

```typescript
const [approving, setApproving] = useState(false);
```

- [ ] **Step 4: Adicionar botão "Aprovar" no footer quando pending**

Substituir o footer existente:

```tsx
{/* Footer */}
<div className="border-border border-t pt-3">
	<span className="text-muted-foreground text-xs">
		{user.lastLoginAt
			? `Login ${formatRelative(user.lastLoginAt)}`
			: "Nunca logou"}
	</span>
</div>
```

Por:

```tsx
{/* Footer */}
<div className="flex items-center justify-between gap-2 border-border border-t pt-3">
	<span className="text-muted-foreground text-xs">
		{user.lastLoginAt
			? `Login ${formatRelative(user.lastLoginAt)}`
			: "Nunca logou"}
	</span>
	{user.status === "pending" && (
		<Button
			onClick={(e) => {
				e.stopPropagation();
				setApproving(true);
			}}
			size="sm"
			variant="default"
		>
			Aprovar
		</Button>
	)}
</div>
```

- [ ] **Step 5: Adicionar `<ApprovalSheet>` ao retorno**

Como `ApprovalSheet` usa um `<Sheet>` controlado por `open={!!user}` (passa null pra fechar), envolvemos o markup atual num fragment e adicionamos o sheet ao lado.

Substituir o `return (` do componente. O wrapper externo precisa virar fragment:

```tsx
return (
	<>
		<div
			className="group flex cursor-pointer flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => router.push(`/dashboard/users/${user.id}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/dashboard/users/${user.id}`);
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* ... conteúdo do card inalterado ... */}
		</div>
		<ApprovalSheet
			branches={branches}
			onClose={() => setApproving(false)}
			user={approving ? user : null}
		/>
	</>
);
```

**Tipos confirmados (verificado em `types.ts` e `data.ts`):** `UserListRow` é superset de `UserRow` — tem `branchIds`, `createdAt`, `email`, `id`, `name`, `role`, `status` (igual a `UserRow`) MAIS `branchNames`, `image`, `lastLoginAt`. Por structural typing, passar `user: UserListRow` onde `UserRow` é esperado funciona — TS aceita o subset.

- [ ] **Step 6: `bun check-types`**

Run: `bun check-types`
Expected: erro só em `users-card-grid.tsx` sobre `branches` faltando como prop. Esperado — Task 2 resolve.

- [ ] **Step 7: NÃO COMMITAR** — commit acontece em Task 2 junto com a propagação de `branches`.

---

## Task 2: Propagar `branches` por `UsersCardGrid` e `page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/users/_components/users-card-grid.tsx`
- Modify: `apps/web/src/app/dashboard/users/page.tsx`

### Steps

- [ ] **Step 1: Estender `UsersCardGrid` pra aceitar `branches`**

Em `users-card-grid.tsx`, adicionar import:

```typescript
import type { BranchLite } from "./types";
```

Substituir a interface `Props`:

```typescript
interface Props {
	branches: BranchLite[];
	filters: UserListFilters;
	initialCursor: string | null;
	initialItems: UserListRow[];
}
```

Desestruturar `branches` na assinatura da função:

```tsx
export function UsersCardGrid({
	initialItems,
	initialCursor,
	filters,
	branches,
}: Props) {
```

Passar `branches` pra cada `<UserCard>`:

```tsx
{items.map((user) => (
	<UserCard branches={branches} key={user.id} user={user} />
))}
```

- [ ] **Step 2: Passar `branches` em `page.tsx`**

Em `apps/web/src/app/dashboard/users/page.tsx`, localizar o `<UsersCardGrid>` no fim do return e adicionar a prop:

```tsx
<UsersCardGrid
	branches={branches}
	filters={filters}
	initialCursor={page.nextCursor}
	initialItems={page.items}
	key={JSON.stringify(filters)}
/>
```

A variável `branches` já existe — vem do `Promise.all` na linha ~69.

**Atenção:** o tipo de `branches` no `page.tsx` vem de uma query Drizzle `{ id: string; name: string }`. O tipo `BranchLite` em `types.ts` precisa ser compatível. Se houver mismatch (`BranchLite` exige campos extras), reportar — provavelmente é shape idêntico e funciona direto.

- [ ] **Step 3: `bun check-types`**

Run: `bun check-types`
Expected: 0 erros.

- [ ] **Step 4: Commit (Tasks 1 + 2 juntas)**

```bash
git add apps/web/src/app/dashboard/users/_components/user-card.tsx \
        apps/web/src/app/dashboard/users/_components/users-card-grid.tsx \
        apps/web/src/app/dashboard/users/page.tsx
git commit -m "fix(users): conecta ApprovalSheet ao botão Aprovar do card pendente"
```

---

## Task 3: Smoke test

**Files:** (nenhum)

### Steps

- [ ] **Step 1: `bun dev:web`** se ainda não estiver rodando.

- [ ] **Step 2: Login como super_admin (ou admin com `users.approve`)** e abrir `/dashboard/users?status=pending`.

Verificar:
- ✅ Cards pendentes mostram badge "Pendente" (laranja).
- ✅ Footer do card pendente exibe botão "Aprovar" à direita do "Login há X".
- ✅ Cards de outros status (active, suspended) **não** mostram o botão.

- [ ] **Step 3: Click no botão "Aprovar"**

Verificar:
- ✅ Sheet abre com nome do user no título "Aprovar Carlos Silva".
- ✅ Email preenchido.
- ✅ Selects de Role (default "user") e Filiais visíveis.
- ✅ Botões "Aprovar", "Rejeitar", "Cancelar".
- ✅ Click no card NÃO navegou pra detail (stopPropagation funcionou).

- [ ] **Step 4: Aprovar um usuário**

- Selecionar role `user` (ou `manager`), selecionar pelo menos uma filial.
- Click "Aprovar".

Verificar:
- ✅ Toast "Usuário aprovado".
- ✅ Sheet fecha.
- ✅ Card sai da lista (revalidate cobre).
- ✅ KPI "Pendentes" decrementa.
- ✅ Badge "N a repor" da sidebar **não muda** (não-relacionado).

- [ ] **Step 5: Rejeitar um usuário**

- Click "Aprovar" em outro card pendente.
- Click "Rejeitar" no sheet.

Verificar:
- ✅ Toast "Solicitação rejeitada".
- ✅ Card sai da lista (rejected → suspended via action).

- [ ] **Step 6: Reportar tudo OK**

---

## Definition of done

- ✅ Botão "Aprovar" inline aparece em cards pendentes (e só neles).
- ✅ Click no botão abre `ApprovalSheet` sem navegar.
- ✅ Aprovação muda status do user (verificado: card sai da lista pendente).
- ✅ Rejeição idem.
- ✅ Toasts funcionam.
- ✅ `bun check-types` 0 erros.

## Riscos / pontos de atenção

1. **Performance** — `ApprovalSheet` agora é instanciado **por card pendente**. Em 100 pending users isso vira 100 sheets no DOM (todos fechados). Aceitável pelo design (Radix Sheet controlado por `open={!!user}` — render mínimo quando fechado), mas se a lista crescer muito, considerar lift up pra `UsersCardGrid` com um sheet só e state `approvingUserId`. Fora de escopo nesta slice.
