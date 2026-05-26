# Fix: `useInfiniteList` não refetch quando `resetKey` muda

> Follow-up direto de [[2026-05-26-activity-timeline-filters-pagination]] — item #10 das decisões trancadas (“mudança de filter dispara fetch fresh”) **não funciona na prática**: o hook só reseta items pra `initialItems` (cacheados do SSR), sem chamar `fetchPage` com os filtros novos. Sintoma reportado: na aba Atividade de `/dashboard/tools/[id]`, trocar período não muda a lista.

**Goal:** Quando `resetKey` muda, refazer a primeira página com os filtros atuais, com cancellation pra evitar race condition em trocas rápidas.

**Tech stack:** React 19 + `useTransition` + `useEffect` + cursor pagination (`@/lib/cursor`, `@/lib/infinite`).

---

## Decisões trancadas

1. **Refetch automático** ao mudar `resetKey`. Sem flag opt-out — o consumer que passa `resetKey` já está sinalizando que quer re-sincronização.
2. **UX durante refetch:** lista limpa (`setItems([])`) + `pending=true`. Empty state com spinner em vez do "Sem registros".
3. **Cursor null no refetch:** assinatura passa a `fetchPage: (cursor: string | null)`. Todas as 12 actions consumidoras já aceitam `string | null`.
4. **Cancellation por sequence ref** (`refetchSeq.current++`). Request stale é descartado no `then`. Sem `AbortController` — overkill pra server actions Next que não suportam abort cleanly via fetch.
5. **`useEffect` em vez de render-phase `if`:** o bloco atual (linhas 28-34) roda durante render e chama `setState` — funciona porque React 19 tolera, mas é pattern anti-React. Mover pra effect normaliza.
6. **Não dispara no mount inicial:** `lastResetKey` inicializado com `resetKey` no `useRef(resetKey)` cobre — efeito só dispara quando muda.
7. **`initialItems` continua sendo o estado inicial** (SSR). Após primeira mudança de `resetKey`, `initialItems` deixa de ter papel — o hook gerencia tudo via `fetchPage(null)`.
8. **Sem retry / sem backoff:** falha mostra `error: "Falha ao recarregar."` e botão "Carregar mais" some (sem cursor). User pode trocar filtro pra tentar de novo.

---

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/lib/use-infinite-list.ts` | Refactor | Render-phase `if` → `useEffect` com refetch + cancellation. Assinatura `fetchPage` aceita `string \| null`. |
| `apps/web/src/components/pending-panel.tsx` | Modify | Tipo local `fetchPage: (cursor: string \| null) => ...` |
| `apps/web/src/components/activity-feed.tsx` | Modify | Mesma coisa |
| `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-client.tsx` | Modify | Empty state com guard `!pending` pra não piscar "Sem movimentações" durante refetch |

12 consumers restantes (`customers-infinite`, `orders-infinite`, `branch-stock-infinite`, `stock-infinite`, `tools-infinite`, `branch-card-grid`, `users-card-grid`, `suppliers-table`, mais variantes pending) usam `fetchPage: (cursor) => action({ filters, cursor })` com inferência — TypeScript propaga novo `string | null` sem mudança no call site.

---

## Detalhes técnicos

### Hook refatorado

```typescript
"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { InfiniteResult } from "./infinite";

interface UseInfiniteListProps<T> {
	fetchPage: (cursor: string | null) => Promise<InfiniteResult<T>>;
	initialCursor: string | null;
	initialItems: T[];
	resetKey?: string;
}

export function useInfiniteList<T>({
	initialItems,
	initialCursor,
	fetchPage,
	resetKey,
}: UseInfiniteListProps<T>) {
	const [items, setItems] = useState(initialItems);
	const [cursor, setCursor] = useState(initialCursor);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const lastResetKey = useRef(resetKey);
	const inflightRef = useRef(false);
	const cursorRef = useRef(initialCursor);
	const refetchSeq = useRef(0);

	useEffect(() => {
		if (resetKey === lastResetKey.current) {
			return;
		}
		lastResetKey.current = resetKey;
		const mySeq = ++refetchSeq.current;
		setItems([]);
		setCursor(null);
		cursorRef.current = null;
		setError(null);
		inflightRef.current = true;
		startTransition(async () => {
			try {
				const next = await fetchPage(null);
				if (mySeq !== refetchSeq.current) {
					return;
				}
				setItems(next.items);
				cursorRef.current = next.nextCursor;
				setCursor(next.nextCursor);
			} catch {
				if (mySeq === refetchSeq.current) {
					setError("Falha ao recarregar.");
				}
			} finally {
				if (mySeq === refetchSeq.current) {
					inflightRef.current = false;
				}
			}
		});
	}, [resetKey, fetchPage]);

	const removeItem = useCallback((predicate: (item: T) => boolean) => {
		setItems((prev) => prev.filter((item) => !predicate(item)));
	}, []);

	const loadMore = useCallback(() => {
		if (!cursorRef.current || inflightRef.current) {
			return;
		}
		const currentCursor = cursorRef.current;
		inflightRef.current = true;
		startTransition(async () => {
			try {
				const next = await fetchPage(currentCursor);
				setItems((prev) => [...prev, ...next.items]);
				cursorRef.current = next.nextCursor;
				setCursor(next.nextCursor);
			} catch {
				setError("Falha ao carregar mais. Tente novamente.");
			} finally {
				inflightRef.current = false;
			}
		});
	}, [fetchPage]);

	return {
		items,
		hasMore: cursor !== null,
		loadMore,
		pending,
		error,
		removeItem,
	};
}
```

### Empty state no `activity-tab-client.tsx`

Trecho atual mostra "Sem movimentações pra esses filtros" assim que `items.length === 0`, o que pisca durante o refetch (entre `setItems([])` e o resultado chegar). Guard simples:

```tsx
{items.length === 0 && !pending ? (
	<div className="flex flex-col items-center gap-2 rounded-md border border-border py-12 text-center">
		<p className="text-muted-foreground text-sm">
			{isFiltered
				? "Sem movimentações pra esses filtros."
				: "Sem movimentações registradas."}
		</p>
		{isFiltered && (
			<Button onClick={resetFilters} size="sm" variant="ghost">
				Limpar filtros
			</Button>
		)}
	</div>
) : items.length === 0 && pending ? (
	<div className="flex items-center justify-center py-12">
		<Spinner />
	</div>
) : (
	<>
		<ActivityTimeline rows={items} />
		{/* ... resto igual ... */}
	</>
)}
```

Outros consumers podem adotar o mesmo guard incrementalmente — não bloqueia esta PR.

### Tipos consumers

`pending-panel.tsx`:
```ts
fetchPage: (cursor: string | null) => Promise<InfiniteResult<PendingRow>>;
```

`activity-feed.tsx`:
```ts
fetchPage: (cursor: string | null) => Promise<InfiniteResult<ActivityEvent>>;
```

Nenhum dos dois passa `resetKey`, então mudança é puramente de tipo — comportamento runtime idêntico.

---

## Riscos & mitigações

1. **Refetch dispara em mount se `fetchPage` muda a cada render.** `useRef(resetKey)` inicializa com o valor atual, então `resetKey === lastResetKey.current` na primeira execução do efeito → early return. Confirmado pelo padrão. Mas se um consumer não passa `resetKey` e o efeito tem `fetchPage` na deplist, ele roda — mas o early return (`undefined === undefined`) garante no-op. OK.

2. **`fetchPage` na deplist pode disparar refetch fora de mudança de `resetKey`.** Cenário: consumer rerender por outro motivo, recria `fetchPage` inline. Mas o guard `resetKey === lastResetKey.current` bloqueia. Só dispara quando `resetKey` realmente muda. OK.

3. **Race em trocas rápidas (Hoje → 7d → 30d em 200ms):** `refetchSeq` garante que só o último mySeq sobrevive. Requests anteriores fazem `setItems(next.items)` se forem mais lentos? Não — o guard `if (mySeq !== refetchSeq.current) return;` antes do `setItems` descarta.

4. **`pending` fica `true` se o refetch estoura excessão silenciosa.** O `finally` zera `inflightRef`, mas `pending` vem de `useTransition` — automaticamente vira `false` quando transição completa (mesmo em throw). Verificado: React 19 garante.

5. **Outros consumers que passam `resetKey` mas estavam "funcionando" por sorte.** Inspeção rápida: `customers-infinite`, `orders-infinite`, `tools-infinite`, `stock-infinite`, `branch-stock-infinite`, `branch-card-grid`, `users-card-grid`, `suppliers-table` — todos passam `resetKey = JSON.stringify(filters)`. Filtros nunca aplicaram corretamente lá também. Esta PR habilita comportamento esperado em todos.

6. **Filtros que precisam de paginação consistente:** primeira página vem de cursor null. Páginas seguintes via `loadMore` usam `cursorRef.current` que foi atualizado no refetch. Ordem preservada. OK.

---

## Test Plan

- [ ] `bun check-types` 0 erros (especialmente os 2 consumers que tipam fetchPage local).
- [ ] `/dashboard/tools/[id]?tab=atividade`:
  - [ ] Trocar período "30d" → "Hoje": lista limpa, spinner, novos dados aparecem.
  - [ ] Trocar filial: idem.
  - [ ] Toggle de razão: idem.
  - [ ] Trocar período rapidamente 3× em sequência: lista final corresponde ao último período (não a um intermediário).
  - [ ] "Carregar mais" funciona após trocar filtros (cursor é da primeira página dos novos filtros, não dos antigos).
  - [ ] Empty state real: filtros sem matches → mostra "Sem movimentações pra esses filtros" + "Limpar filtros" (não spinner).
- [ ] Smoke regressão em telas que passam `resetKey`:
  - [ ] `/dashboard/customers` — busca por texto / role
  - [ ] `/dashboard/orders` — filtros status / branch
  - [ ] `/dashboard/stock` — filtros
  - [ ] `/dashboard/tools` — filtros
  - [ ] `/dashboard/branches`, `/dashboard/users`, `/dashboard/suppliers`
- [ ] Smoke não-regressão em telas que **não** passam `resetKey`:
  - [ ] Activity feed home / customer detail (`activity-feed.tsx`)
  - [ ] Pending panel home (`pending-panel.tsx`)

---

## Próximos passos

Spec aprovada → plano inline (1 sessão, 4 arquivos pequenos, sem subagent-driven) → PR único.
