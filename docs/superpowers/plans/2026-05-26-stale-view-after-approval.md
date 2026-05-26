# Stale view after approval/rejection — Implementation Plan

> Spec: `docs/superpowers/specs/2026-05-26-stale-view-after-approval.md`. Execução inline, PR único.

**Goal:** `useInfiniteList` ganha `removeItem(predicate)`. Approval flow propaga callback `onResolved(userId)` Grid → Card → Sheet. Card aprovado/rejeitado some imediatamente.

**Architecture:** mudança coesa M, 4 arquivos. Hook genérico extensível pra outros consumidores futuros.

**Tech Stack:** Next 16 + React 19 + `useInfiniteList` custom hook.

---

## Task 1: Hook ganha `removeItem`

**Files:**
- Modify: `apps/web/src/lib/use-infinite-list.ts`

- [ ] **Step 1:** Adicionar `removeItem` no hook:

```typescript
const removeItem = useCallback((predicate: (item: T) => boolean) => {
	setItems((prev) => prev.filter((item) => !predicate(item)));
}, []);

return {
	items,
	hasMore: cursor !== null,
	loadMore,
	pending,
	error,
	removeItem,
};
```

- [ ] **Step 2:** `bun check-types` → 0 erros.

---

## Task 2: ApprovalSheet expõe `onResolved`

**Files:**
- Modify: `apps/web/src/app/dashboard/users/_components/approval-sheet.tsx`

- [ ] **Step 1:** Adicionar prop:

```typescript
interface Props {
	allowedRoles?: UserRow["role"][];
	branches: BranchLite[];
	onClose: () => void;
	onResolved?: () => void;
	user: UserRow | null;
}
```

- [ ] **Step 2:** Desestruturar:

```typescript
export function ApprovalSheet({
	user,
	branches,
	onClose,
	onResolved,
	allowedRoles = ["manager", "user"],
}: Props) {
```

- [ ] **Step 3:** Chamar `onResolved?.()` no sucesso de `handleApprove`:

```typescript
if (result.ok) {
	toast.success("Usuário aprovado");
	onResolved?.();
	onClose();
} else {
	toast.error(result.error);
}
```

- [ ] **Step 4:** Idem em `handleReject`:

```typescript
if (result.ok) {
	toast.success("Solicitação rejeitada");
	onResolved?.();
	onClose();
} else {
	toast.error(result.error);
}
```

- [ ] **Step 5:** `bun check-types` → 0 erros.

---

## Task 3: UserCard propaga `onResolved`

**Files:**
- Modify: `apps/web/src/app/dashboard/users/_components/user-card.tsx`

- [ ] **Step 1:** Adicionar prop:

```typescript
interface UserCardProps {
	branches: BranchLite[];
	onResolved?: (userId: string) => void;
	user: UserListRow;
}
```

- [ ] **Step 2:** Desestruturar:

```typescript
export function UserCard({ user, branches, onResolved }: UserCardProps) {
```

- [ ] **Step 3:** Passar pro sheet (bindando userId):

```tsx
<ApprovalSheet
	branches={branches}
	onClose={() => setApproving(false)}
	onResolved={onResolved ? () => onResolved(user.id) : undefined}
	user={approving ? user : null}
/>
```

- [ ] **Step 4:** `bun check-types` → 0 erros.

---

## Task 4: UsersCardGrid usa `removeItem`

**Files:**
- Modify: `apps/web/src/app/dashboard/users/_components/users-card-grid.tsx`

- [ ] **Step 1:** Adicionar `useCallback` ao import:

```typescript
import { useCallback } from "react";
```

- [ ] **Step 2:** Pegar `removeItem` do hook:

```typescript
const { items, hasMore, loadMore, pending, error, removeItem } = useInfiniteList({
	initialItems,
	initialCursor,
	fetchPage: (cursor) => fetchMoreUsersAction(filters, cursor),
	resetKey,
});

const handleResolved = useCallback(
	(userId: string) => {
		removeItem((u) => u.id === userId);
	},
	[removeItem]
);
```

- [ ] **Step 3:** Passar `onResolved={handleResolved}` pro `UserCard`:

```tsx
{items.map((user) => (
	<UserCard
		branches={branches}
		key={user.id}
		onResolved={handleResolved}
		user={user}
	/>
))}
```

- [ ] **Step 4:** `bun check-types` → 0 erros.

---

## Task 5: Smoke + commit + PR

- [ ] **Step 1:** Smoke `/dashboard/users?status=pending`:
  - [ ] Approve um pendente → toast verde → card some.
  - [ ] Reject um pendente → toast verde → card some.
  - [ ] Refresh → server state consistente.

- [ ] **Step 2:** Smoke `/dashboard/users?status=`:
  - [ ] Approve → card some (known minor).
  - [ ] Trocar pra "Ativos" → user aparece corretamente.

- [ ] **Step 3:** Commit + push + PR:

```bash
git add apps/web/src/ docs/superpowers/
git commit -m "fix(users): card pendente some imediatamente após approve/reject"
git push -u origin feat/fix-stale-view-after-approve
gh pr create --title "fix(users): stale view após approve/reject" --body-file <body>
```

---

## Riscos

1. **Sub-bug filter=undefined** — documentado, aceito.
2. **Hook API mudança** — backward compatible (return type cresce, mas TS infere). Outros consumidores não quebram.
