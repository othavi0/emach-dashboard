# Fix stale view após approval/rejection em `/dashboard/users`

> Item #5 do follow-up out-of-scope da PR #66 (unificação tools×stock).

**Goal:** Card de usuário pendente deve sumir imediatamente da lista após aprovar ou rejeitar, sem precisar de reload. Hoje `useInfiniteList` mantém items em state client-side e ignora `revalidatePath` server-side.

**Arquitetura:** `useInfiniteList` ganha `removeItem(predicate)` (extensível pra qualquer consumidor). Callback `onResolved(userId)` propagado Grid → Card → Sheet. Mudança coesa, M, 4 arquivos.

**Tech stack:** Next 16 RSC + React 19 + server actions + `useInfiniteList` hook custom.

---

## Diagnóstico

**Fluxo atual:**
1. `approveUser` / `rejectUser` server actions → `revalidatePath(USERS_PATH)` ✓
2. `ApprovalSheet.handleApprove/Reject` → toast + `onClose()`
3. **Stale state:** `useInfiniteList` guarda `items` em `useState` local. `resetKey = JSON.stringify(filters)` não muda → sem re-init. Mesmo se `router.refresh()` fosse chamado, o hook ignoraria novos `initialItems` props.

**Mesmo bug class afeta:** `BranchStockInfinite`, `OrdersInfinite`, `BranchCardGrid`, `ToolsInfinite`, `CustomersInfinite`, `SuppliersTable`, `StockInfinite`, `ActivityFeed`, `PendingPanel` (9 consumidores). Fix neste PR cobre **só users**; outros podem adotar `removeItem` depois.

---

## Decisões trancadas

1. **API do hook:** `removeItem(predicate: (item: T) => boolean) => void`. Predicate retorna `true` pros items que devem sumir.
2. **Callback unificado:** `onResolved(userId: string)` — cobre approve E reject (ambos removem da lista). Mais conciso que callbacks separadas.
3. **Prop drilling:** Grid → Card → Sheet via props (3 níveis, OK). Sem context/store.
4. **Optional:** `onResolved` é opcional no Sheet (compat com consumidores futuros sem hook removeItem).
5. **Sem `router.refresh()`:** `revalidatePath` server-side basta pra next-navigation. Remove local cobre UX imediato.

---

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/lib/use-infinite-list.ts` | Modify | + `removeItem(predicate)` no return |
| `apps/web/src/app/dashboard/users/_components/users-card-grid.tsx` | Modify | Hook devolve `removeItem` → `handleResolved` → passa pro card |
| `apps/web/src/app/dashboard/users/_components/user-card.tsx` | Modify | + prop `onResolved?: (userId: string) => void` → passa pro sheet |
| `apps/web/src/app/dashboard/users/_components/approval-sheet.tsx` | Modify | + prop `onResolved?: () => void` → chama no sucesso de approve E reject |

---

## Detalhes técnicos

### Hook (`use-infinite-list.ts`)

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

### Grid (`users-card-grid.tsx`)

```typescript
const { items, hasMore, loadMore, pending, error, removeItem } = useInfiniteList({...});

const handleResolved = useCallback(
	(userId: string) => {
		removeItem((u) => u.id === userId);
	},
	[removeItem]
);

return (
	<div>
		{items.map((u) => (
			<UserCard
				branches={branches}
				key={u.id}
				onResolved={handleResolved}
				user={u}
			/>
		))}
	</div>
);
```

### Card (`user-card.tsx`)

```typescript
interface UserCardProps {
	branches: BranchLite[];
	onResolved?: (userId: string) => void;
	user: UserListRow;
}

// no render:
<ApprovalSheet
	branches={branches}
	onClose={() => setApproving(false)}
	onResolved={onResolved ? () => onResolved(user.id) : undefined}
	user={approving ? user : null}
/>
```

### Sheet (`approval-sheet.tsx`)

```typescript
interface Props {
	// ... existing
	onResolved?: () => void;
}

function handleApprove() {
	// ... existing
	if (result.ok) {
		toast.success("Usuário aprovado");
		onResolved?.();
		onClose();
	}
}

function handleReject() {
	// ... existing
	if (result.ok) {
		toast.success("Solicitação rejeitada");
		onResolved?.();
		onClose();
	}
}
```

---

## Riscos & mitigações

1. **Sub-bug filter=undefined ("Todos"):** approve remove o card que deveria reaparecer como "active". Probabilidade baixa (operador vai pra "Pendentes" pra aprovar). **Aceitar como known minor.**
2. **Outros consumidores ignorarão removeItem:** OK — adoção opcional, não regressão.
3. **Type T genérico em removeItem:** garantir TS infere corretamente do `useInfiniteList<T>`.
4. **`onResolved` opcional não causa silent failure:** quando consumidor esquece de passar, card permanece visível (bug atual). Aceitável — é o comportamento de hoje.

---

## Test Plan

- [ ] `bun check-types` 0 erros.
- [ ] `/dashboard/users?status=pending`:
  - [ ] Approve um pendente → toast verde → card some imediatamente.
  - [ ] Reject um pendente → toast verde → card some imediatamente.
  - [ ] Approve sem filial (validação falha) → toast erro → card permanece.
  - [ ] Refresh → server state consistente (user não está mais lá).
- [ ] `/dashboard/users?status=` (Todos):
  - [ ] Approve pendente → card some (known minor).
  - [ ] Trocar filtro pra "Ativos" → user aprovado aparece.
- [ ] Outros grids (`/dashboard/branches`, `/dashboard/orders`) inalterados.

---

## Próximos passos

Spec aprovada → plano simples (5 tasks: hook, grid, card, sheet, smoke). Implementação inline (4 arquivos, mudanças focadas). PR único.
