# Fix `useInfiniteList` refetch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `useInfiniteList` refaz a primeira página quando `resetKey` muda, com cancellation pra evitar race em trocas rápidas — corrige filtros silenciosamente quebrados em 14 telas (sintoma reportado: aba Atividade em `/dashboard/tools/[id]`).

**Architecture:** Substituir o bloco render-phase `if (resetKey !== ...)` por um `useEffect` que limpa state e dispara `fetchPage(null)`. Cancellation via `refetchSeq` ref. Assinatura `fetchPage` passa a aceitar `cursor: string | null`. UI da aba Atividade ganha guard `!pending` no empty state pra não piscar “Sem movimentações” durante refetch.

**Tech Stack:** React 19 + `useTransition` + `useEffect` + cursor pagination (`@/lib/cursor`, `@/lib/infinite`).

**Spec:** `docs/superpowers/specs/2026-05-26-use-infinite-list-refetch.md`

**Testes:** o repo não tem testes unitários de hook — verificação é `bun check-types` + smoke runtime no dev server (porta 3001) seguindo CLAUDE.md (`Smoke run-time`).

---

## Task 1: Refator `useInfiniteList` — refetch + cancellation

**Files:**
- Modify: `apps/web/src/lib/use-infinite-list.ts` (rewrite completo)

- [ ] **Step 1: Substituir conteúdo do arquivo**

Substituir tudo em `apps/web/src/lib/use-infinite-list.ts` por:

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

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: 0 erros. Se algum consumer reclamar de incompatibilidade `string | null`, ir pra Task 2/3.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/use-infinite-list.ts
git commit -m "fix: useInfiniteList refetch em mudança de resetKey"
```

---

## Task 2: Atualizar tipo em `pending-panel.tsx` e `activity-feed.tsx`

**Files:**
- Modify: `apps/web/src/components/pending-panel.tsx` (1 linha)
- Modify: `apps/web/src/components/activity-feed.tsx` (1 linha)

- [ ] **Step 1: Atualizar `pending-panel.tsx`**

Encontrar a linha (próximo à linha 15 conforme grep do brainstorming):

```ts
fetchPage: (cursor: string) => Promise<InfiniteResult<PendingRow>>;
```

Substituir por:

```ts
fetchPage: (cursor: string | null) => Promise<InfiniteResult<PendingRow>>;
```

- [ ] **Step 2: Atualizar `activity-feed.tsx`**

Encontrar a linha:

```ts
fetchPage: (cursor: string) => Promise<InfiniteResult<ActivityEvent>>;
```

Substituir por:

```ts
fetchPage: (cursor: string | null) => Promise<InfiniteResult<ActivityEvent>>;
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/pending-panel.tsx apps/web/src/components/activity-feed.tsx
git commit -m "fix: tipo fetchPage aceita cursor null em consumers locais"
```

---

## Task 3: Empty state guard em `activity-tab-client.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-client.tsx:86-123`

- [ ] **Step 1: Substituir bloco de renderização condicional**

Adicionar `Spinner` ao import existente de `@emach/ui/components/spinner` (já está importado). Substituir o trecho atual (linhas 86-123):

```tsx
				{items.length === 0 ? (
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
				) : (
					<>
						<ActivityTimeline rows={items} />
						{hasMore && (
							<Button
								className="self-center"
								disabled={pending}
								onClick={loadMore}
								size="sm"
								variant="outline"
							>
								{pending ? (
									<>
										<Spinner /> Carregando…
									</>
								) : (
									"Carregar mais"
								)}
							</Button>
						)}
						{error && (
							<p className="text-center text-destructive text-sm">{error}</p>
						)}
					</>
				)}
```

por:

```tsx
				{items.length === 0 && pending ? (
					<div className="flex items-center justify-center rounded-md border border-border py-12">
						<Spinner />
					</div>
				) : items.length === 0 ? (
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
				) : (
					<>
						<ActivityTimeline rows={items} />
						{hasMore && (
							<Button
								className="self-center"
								disabled={pending}
								onClick={loadMore}
								size="sm"
								variant="outline"
							>
								{pending ? (
									<>
										<Spinner /> Carregando…
									</>
								) : (
									"Carregar mais"
								)}
							</Button>
						)}
						{error && (
							<p className="text-center text-destructive text-sm">{error}</p>
						)}
					</>
				)}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/tools/\[id\]/_components/activity-tab-client.tsx
git commit -m "fix: spinner no empty state da aba Atividade durante refetch"
```

---

## Task 4: Smoke runtime — aba Atividade

**Files:** nenhum (verificação visual).

**Pré-requisito:** `bun dev:web` já está rodando em porta 3001 (Monitor armado em `/tmp/emach-next-3001.log`). Se não estiver, subir:

```bash
bun dev:web > /tmp/emach-next-3001.log 2>&1 &
```

- [ ] **Step 1: Confirmar server respondendo**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/`
Expected: `307` (redirect pro login — normal).

- [ ] **Step 2: Verificar aba Atividade**

Navegar (via browser logado): `http://localhost:3001/dashboard/tools/<algum-id>?tab=atividade`

Esperado em cada interação:
- Default load: período "30d" selecionado, lista renderizada.
- Click em "Hoje" → lista limpa, spinner aparece, novos dados (ou empty state real) renderizam em < 1s.
- Click em "7d" → idem.
- Trocar filial via Select → idem.
- Toggle de chip "Entrada" → idem.
- Trocar período 3× em sequência rápida (Hoje → 7d → 30d em ~500ms): lista final corresponde a "30d", não a estado intermediário.
- "Carregar mais" funciona após mudar filtros: cursor é o da primeira página dos filtros atuais.
- Filtros sem matches: empty state "Sem movimentações pra esses filtros" + "Limpar filtros".

- [ ] **Step 3: Verificar log do dev server**

Run: `tail -n 30 /tmp/emach-next-3001.log | grep -E -i "error|warn|fail"`
Expected: nada novo após as interações (warnings históricos podem aparecer; o que importa é não emergir nada novo relacionado a `useInfiniteList` ou `activity-tab`).

---

## Task 5: Smoke regressão em outras telas com `resetKey`

**Files:** nenhum (verificação visual).

- [ ] **Step 1: Customers**

Navegar: `http://localhost:3001/dashboard/customers`
Aplicar filtro (busca por texto, role): lista deve refetch (não ficar parada nos initialItems).

- [ ] **Step 2: Orders**

Navegar: `http://localhost:3001/dashboard/orders`
Aplicar filtro de status / filial: refetch.

- [ ] **Step 3: Stock / Branch stock**

Navegar: `http://localhost:3001/dashboard/stock` e uma branch específica.
Aplicar filtros: refetch.

- [ ] **Step 4: Tools / Branches / Users / Suppliers**

Para cada: aplicar filtros disponíveis, confirmar refetch.

- [ ] **Step 5: Não-regressão em consumers sem `resetKey`**

Visitar uma página com `activity-feed` (ex: home dashboard ou customer detail) e uma com `pending-panel`. Confirmar que "Carregar mais" continua funcionando normal (sem refetch indesejado, sem erro).

- [ ] **Step 6: Final check**

Run: `tail -n 50 /tmp/emach-next-3001.log | grep -E -i "error|warn|fail"`
Expected: sem erros novos.

---

## Próximos passos

Após Task 5 passar, branch está pronto pra:
- PR único cobrindo os 3 commits de fix + esse plano/spec já commitados.
- `superpowers:finishing-a-development-branch` pra ritual de close-out (merge/PR decision).
