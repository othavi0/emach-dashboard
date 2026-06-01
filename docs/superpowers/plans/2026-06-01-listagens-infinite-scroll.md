# Polish de Listagens + Infinite Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limpar a listagem de filiais (remover editar inline), trocar o rodapé "— fim da lista —" por carregamento fluido (skeleton/auto-scroll) em todas as ~12 listagens, paginar a tab Pedidos, e documentar o padrão de scroll infinito.

**Architecture:** O `InfiniteSentinel` compartilhado é reescrito uma vez e propaga a todas as listagens. `BATCH_SIZE` muda de 24→20 globalmente. A tab Pedidos ganha server action keyset-cursor (`fetchBranchOrdersPage`) + client component espelhando o padrão de `StockTab`/`BranchStockInfinite`, carregada lazy (só com `?tab=orders`). Equipe não pagina (só desacopla do `Promise.all`).

**Tech Stack:** Next 16 (RSC + Server Actions), React 19, Drizzle (keyset pagination via `paginate`/`encodeCursor`), Tailwind, `@emach/ui` (Skeleton), lucide-react (Loader2).

**Nota sobre testes:** A maior parte é UI/RSC — `bun check-types` **não** pega quebra de fronteira RSC/client nem SQL inválido em template string (ver `apps/web/CLAUDE.md`). A verificação primária é **smoke visual no browser** (dev server `:3001` já rodando). Há um teste de unidade para a lógica de cursor de Pedidos (Task 5), que é lógica pura.

---

### Task 1: BATCH_SIZE 24 → 20 (global)

**Files:**
- Modify: `apps/web/src/lib/infinite.ts:8`

- [ ] **Step 1: Alterar a constante**

```ts
export const BATCH_SIZE = 20;
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS (nenhum consumidor depende do valor literal).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/infinite.ts
git commit -m "chore: page size de listagens 24 -> 20"
```

---

### Task 2: Reescrever InfiniteSentinel (afeta as ~12 listagens)

**Files:**
- Modify: `apps/web/src/components/infinite-sentinel.tsx` (reescrita completa)

- [ ] **Step 1: Reescrever o componente**

Substituir todo o conteúdo de `apps/web/src/components/infinite-sentinel.tsx` por:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Loader2 } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";

interface InfiniteSentinelProps {
	error: string | null;
	hasMore: boolean;
	onLoadMore: () => void;
	pending: boolean;
	root?: RefObject<HTMLElement | null>;
	/** Placeholder opcional exibido durante o carregamento (ex: grid de skeleton cards). Default: spinner discreto. */
	skeleton?: ReactNode;
}

export function InfiniteSentinel({
	hasMore,
	pending,
	error,
	onLoadMore,
	root,
	skeleton,
}: InfiniteSentinelProps) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!hasMore || pending || error) {
			return;
		}
		const el = ref.current;
		if (!el) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					onLoadMore();
				}
			},
			{ root: root?.current ?? null, rootMargin: "200px" }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasMore, pending, error, onLoadMore, root]);

	if (error) {
		return (
			<div className="flex flex-col items-center gap-2 py-6">
				<p className="text-destructive text-xs">{error}</p>
				<Button onClick={onLoadMore} size="sm" variant="outline">
					Tentar de novo
				</Button>
			</div>
		);
	}

	if (!hasMore) {
		return null;
	}

	if (pending) {
		return (
			<div className="py-6">
				{skeleton ?? (
					<div className="flex items-center justify-center">
						<Loader2
							aria-label="Carregando mais itens"
							className="size-4 animate-spin text-muted-foreground"
						/>
					</div>
				)}
			</div>
		);
	}

	// Alvo do IntersectionObserver: dispara o auto-load ao entrar na viewport.
	return <div aria-hidden className="h-px w-full" ref={ref} />;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS. Nenhum caller existente precisa mudar (`skeleton` é opcional).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/infinite-sentinel.tsx
git commit -m "feat: sentinel sem 'fim da lista', loading com skeleton/spinner"
```

---

### Task 3: Remover botão Editar do card de filial

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-card.tsx`

- [ ] **Step 1: Remover o import não usado**

Linha 4 — remover `Pencil`:

```tsx
import { Boxes } from "lucide-react";
```

- [ ] **Step 2: Remover a variável `editHref` e o `<Link>` de editar**

Remover a linha `const editHref = ...` (linha 21) e o bloco `<Link>` de editar (linhas 75-84). O bloco `canManage` fica só com o botão de Estoque:

```tsx
				{canManage && (
					<div
						className="flex shrink-0 items-center gap-1"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<Link
							aria-label={`Ver estoque de ${branch.name}`}
							className={`${buttonVariants({
								size: "icon-sm",
								variant: "ghost",
							})} border border-border bg-muted`}
							href={stockHref}
						>
							<Boxes aria-hidden className="size-4" />
						</Link>
					</div>
				)}
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS (sem referências órfãs a `Pencil`/`editHref`).

- [ ] **Step 4: Smoke visual**

Abrir `http://localhost:3001/dashboard/branches` no browser. Confirmar: card sem lápis, botão de estoque presente com borda nítida sobre `bg-muted`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-card.tsx
git commit -m "feat: remover editar inline do card de filial"
```

---

### Task 4: Skeleton de card para branches (passar ao sentinel)

**Files:**
- Create: `apps/web/src/app/dashboard/branches/_components/branch-card-skeleton.tsx`
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-card-grid.tsx`

- [ ] **Step 1: Criar o skeleton**

`apps/web/src/app/dashboard/branches/_components/branch-card-skeleton.tsx`:

```tsx
import { Skeleton } from "@emach/ui/components/skeleton";

/** Placeholders no shape do BranchCard, exibidos durante o carregamento da próxima página. */
export function BranchCardGridSkeleton({ count = 4 }: { count?: number }) {
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{Array.from({ length: count }, (_, i) => i).map((i) => (
				<div
					className="overflow-hidden rounded-[10px] border border-border bg-card"
					key={i}
				>
					<div className="flex items-start gap-3 px-4 pt-4 pb-3">
						<Skeleton className="size-12 rounded-[10px]" />
						<div className="flex-1 space-y-2 pt-1">
							<Skeleton className="h-4 w-2/3" />
							<Skeleton className="h-3 w-1/2" />
						</div>
					</div>
					<div className="grid grid-cols-3 border-border border-t">
						{[0, 1, 2].map((c) => (
							<div
								className="flex flex-col items-center gap-1.5 py-3"
								key={c}
							>
								<Skeleton className="h-5 w-6" />
								<Skeleton className="h-2 w-10" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Passar o skeleton ao sentinel no grid**

Em `branch-card-grid.tsx`, importar e passar `skeleton`:

```tsx
import { BranchCardGridSkeleton } from "./branch-card-skeleton";
```

E no JSX do `<InfiniteSentinel>`:

```tsx
				<InfiniteSentinel
					error={error}
					hasMore={hasMore}
					onLoadMore={loadMore}
					pending={pending}
					skeleton={<BranchCardGridSkeleton />}
				/>
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 4: Smoke visual**

Em `/dashboard/branches` com muitas filiais (>20): scroll até o fim → skeleton cards aparecem brevemente antes da próxima página; nenhum "fim da lista" ao final.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-card-skeleton.tsx apps/web/src/app/dashboard/branches/_components/branch-card-grid.tsx
git commit -m "feat: skeleton de cards na listagem de filiais"
```

---

### Task 5: Server action de paginação de pedidos da filial

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts`
- Modify: `apps/web/src/app/dashboard/branches/data.ts` (manter `BranchOrderRow`)
- Test: `apps/web/src/app/dashboard/branches/_components/__tests__/branch-orders-cursor.test.ts`

A query usa o cursor `NewestCursor` existente (`sort: "newest"`, `createdAt` + `id`) — não precisa de tipo novo em `cursor.ts`.

- [ ] **Step 1: Escrever teste da lógica de cursor**

`apps/web/src/app/dashboard/branches/_components/__tests__/branch-orders-cursor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decodeCursorAs, encodeCursor } from "@/lib/cursor";

describe("branch orders cursor (newest)", () => {
	it("round-trips createdAt + id", () => {
		const iso = "2026-05-30T12:00:00.000Z";
		const raw = encodeCursor({
			v: 1,
			sort: "newest",
			createdAt: iso,
			id: "ord_123",
		});
		const decoded = decodeCursorAs(raw, "newest");
		expect(decoded.createdAt).toBe(iso);
		expect(decoded.id).toBe("ord_123");
	});

	it("rejeita cursor de outro sort", () => {
		const raw = encodeCursor({ v: 1, sort: "name", name: "x", id: "a" });
		expect(() => decodeCursorAs(raw, "newest")).toThrow();
	});
});
```

- [ ] **Step 2: Rodar o teste (deve passar — exercita API existente)**

Run: `cd apps/web && bun vitest run src/app/dashboard/branches/_components/__tests__/branch-orders-cursor.test.ts`
Expected: PASS (valida o contrato de cursor que a action vai usar).

- [ ] **Step 3: Adicionar a server action**

No fim de `apps/web/src/app/dashboard/branches/actions.ts` (já tem `"use server"`, `db`, `order`, `desc`, `sql`, `decodeCursor`, `encodeCursor`, `BATCH_SIZE`, `InfiniteResult`, `requireCapability` importados — adicionar o que faltar):

```ts
export async function fetchBranchOrdersPage({
	branchId,
	cursor,
}: {
	branchId: string;
	cursor: string | null;
}): Promise<InfiniteResult<BranchOrderRow>> {
	await requireCapability("orders.view");
	const decoded = cursor ? decodeCursor(cursor) : null;
	const conditions = [sql`${order.branchId} = ${branchId}`];
	if (decoded && decoded.sort === "newest") {
		conditions.push(
			sql`(${order.createdAt}, ${order.id}) < (${decoded.createdAt}::timestamp, ${decoded.id})`
		);
	}
	const rows = await db
		.select({
			id: order.id,
			number: order.number,
			status: order.status,
			totalAmount: order.totalAmount,
			createdAt: order.createdAt,
		})
		.from(order)
		.where(sql.join(conditions, sql` AND `))
		.orderBy(desc(order.createdAt), desc(order.id))
		.limit(BATCH_SIZE + 1);
	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
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

Importar `BranchOrderRow` do `./data` (já há `import type { BranchTableRow } from "./data"` — adicionar `BranchOrderRow`). Confirmar que `requireCapability` aceita `"orders.view"` (é no-op pós-ADR-0012, mas mantém o padrão; usar a mesma capability que `dashboard/orders` usa — verificar com `rg "requireCapability\\(\"orders" apps/web/src/app/dashboard/orders` e alinhar a string).

- [ ] **Step 4: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/actions.ts apps/web/src/app/dashboard/branches/_components/__tests__/branch-orders-cursor.test.ts
git commit -m "feat: server action de paginacao de pedidos da filial"
```

---

### Task 6: Tab Pedidos → client infinite + lazy na page

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/orders-tab.tsx` (extrair `OrderCard` + grid client)
- Create: `apps/web/src/app/dashboard/branches/[id]/_components/branch-orders-infinite.tsx`
- Modify: `apps/web/src/app/dashboard/branches/[id]/page.tsx`

- [ ] **Step 1: Exportar `OrderCard` de `orders-tab.tsx`**

Em `orders-tab.tsx`, trocar `function OrderCard(...)` por `export function OrderCard(...)` (mantém o componente onde está; só exporta).

- [ ] **Step 2: Criar o client component infinite**

`apps/web/src/app/dashboard/branches/[id]/_components/branch-orders-infinite.tsx`:

```tsx
"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchBranchOrdersPage } from "../../actions";
import type { BranchOrderRow } from "../../data";
import { OrderCard } from "./orders-tab";

interface Props {
	branchId: string;
	initial: BranchOrderRow[];
	initialCursor: string | null;
}

export function BranchOrdersInfinite({ branchId, initial, initialCursor }: Props) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchBranchOrdersPage({ branchId, cursor }),
	});

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((o) => (
					<OrderCard key={o.id} order={o} />
				))}
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
```

- [ ] **Step 3: Converter `OrdersTab` em async Server Component lazy**

Substituir a função `OrdersTab` em `orders-tab.tsx` por uma versão que busca a 1ª página e delega ao client (mantém o empty state atual):

```tsx
import { fetchBranchOrdersPage } from "../../actions";
import { BranchOrdersInfinite } from "./branch-orders-infinite";

export async function OrdersTab({ branchId }: { branchId: string }) {
	const first = await fetchBranchOrdersPage({ branchId, cursor: null });

	if (first.items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<PackageOpen
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">Sem pedidos</p>
				<p className="text-muted-foreground text-xs">
					Esta filial ainda não atendeu pedidos.
				</p>
			</div>
		);
	}

	return (
		<BranchOrdersInfinite
			branchId={branchId}
			initial={first.items}
			initialCursor={first.nextCursor}
		/>
	);
}
```

Remover o import não usado de `Link` e `BranchOrderRow` se não forem mais referenciados fora do `OrderCard` (manter os usados por `OrderCard`: `Link`, `ShoppingCart`, `OrderStatusBadge`, `OrderStatus`, `BranchOrderRow`, `DT`, `BRL`).

- [ ] **Step 4: Tornar a tab Pedidos lazy em `page.tsx`**

Em `branches/[id]/page.tsx`:
- Remover `getBranchRecentOrders` do `Promise.all` (linha 47) e do import (linha 9).
- Trocar o `content` da tab orders por carregamento condicional (espelha `StockTab`):

```tsx
		{
			value: "orders",
			label: "Pedidos",
			icon: <ShoppingCart aria-hidden className="size-3.5" />,
			content: sp.tab === "orders" ? <OrdersTab branchId={id} /> : null,
		},
```

- [ ] **Step 5: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 6: Smoke visual (fronteira RSC/client — check-types não pega)**

Abrir `http://localhost:3001/dashboard/branches/<id>?tab=orders`. Confirmar: cards de pedido renderizam, scroll carrega mais de 20 em 20, sem "fim da lista", sem erro no console. Verificar via `nextjs_call 3001 get_errors` se houver tela branca.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/branches/[id]/_components/orders-tab.tsx apps/web/src/app/dashboard/branches/[id]/_components/branch-orders-infinite.tsx apps/web/src/app/dashboard/branches/[id]/page.tsx
git commit -m "feat: tab pedidos da filial com infinite scroll lazy"
```

---

### Task 7: Tab Equipe — badge via KPI + lazy (sem paginar)

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/page.tsx`
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/team-tab.tsx`

- [ ] **Step 1: Badge da tab usa `kpis.teamSize`**

Em `page.tsx`, no badge da tab "team" (linhas 68-72), trocar `{team.length}` por `{kpis.teamSize}`.

- [ ] **Step 2: Carregar a equipe lazy dentro de `TeamTab`**

Remover `getBranchTeam(id)` do `Promise.all` (linha 46) e o import; tornar `TeamTab` async e mover o fetch pra dentro. `team-tab.tsx`:

```tsx
import { getBranchTeam } from "../../data";
import { TeamGrid } from "./team-grid";

export async function TeamTab({ branchId }: { branchId: string }) {
	const team = await getBranchTeam(branchId);
	return <TeamGrid branchId={branchId} members={team} />;
}
```

E em `page.tsx`, o content da tab team vira lazy:

```tsx
			content: sp.tab === "team" ? <TeamTab branchId={id} /> : null,
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS. Confirmar que `team`/`recentOrders` não são mais referenciados em `page.tsx` (remover do destructuring do `Promise.all`).

- [ ] **Step 4: Smoke visual**

`http://localhost:3001/dashboard/branches/<id>?tab=team`: equipe renderiza; badge na aba mostra a contagem correta vinda do KPI; "Visão geral" carrega sem disparar as queries de team/orders (uma melhoria silenciosa).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/[id]/page.tsx apps/web/src/app/dashboard/branches/[id]/_components/team-tab.tsx
git commit -m "refactor: tab equipe lazy, badge via KPI"
```

---

### Task 8: Documentação

**Files:**
- Modify: `apps/web/CLAUDE.md` (seção entity pattern)
- Modify: `DESIGN.md` (se houver seção de listagens; senão, adicionar subseção)

- [ ] **Step 1: Atualizar `apps/web/CLAUDE.md`**

Na seção "Entity detail / CRUD pattern", adicionar dois bullets:

```markdown
- **Cards de listagem não têm ação de editar inline.** Editar é sempre via detalhe da entidade (drawer `?edit=1`). Atalhos de navegação (ex: ver estoque) são permitidos como `<Link>` ícone `ghost` com `border border-border bg-muted`.
- **Scroll infinito (padrão do sistema):** toda listagem usa `useInfiniteList` + `<InfiniteSentinel>` (`apps/web/src/components/infinite-sentinel.tsx`). Page size global `BATCH_SIZE = 20` (`src/lib/infinite.ts`), keyset cursor (`src/lib/cursor.ts`), auto-load 200px antes do fim. O sentinel **não** exibe "fim da lista" (retorna `null` quando `!hasMore`); loading mostra `skeleton` (prop opcional) ou spinner discreto; botão "Tentar de novo" só em erro. Tabs internas de entidade que listam coleções (ex: Pedidos) seguem o mesmo padrão e carregam **lazy** (só quando `?tab=` corresponde).
```

- [ ] **Step 2: Atualizar `DESIGN.md`**

Run para localizar a seção: `rg -n "listagem|InfiniteSentinel|fim da lista|infinite" DESIGN.md`
Adicionar (ou ajustar) uma subseção curta de "Listagens / rodapé": sem "fim da lista", loading com skeleton, page size 20, auto-scroll. Reaproveitar o texto do bullet do CLAUDE.md.

- [ ] **Step 3: Commit**

```bash
git add apps/web/CLAUDE.md DESIGN.md
git commit -m "docs: padrao de scroll infinito e listagem sem editar inline"
```

---

### Task 9: Verificação final

- [ ] **Step 1: Tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 2: Lint/format**

Run: `bun fix` (ou `bun check` conforme o projeto).
Expected: sem erros.

- [ ] **Step 3: Smoke visual abrangente (browser)**

Conferir que o rework do sentinel não regrediu outras listagens:
- `/dashboard/tools` — scroll, loading, fim sem texto.
- `/dashboard/users` — idem.
- `/dashboard/branches` — card sem editar, skeleton.
- `/dashboard/branches/<id>?tab=orders` e `?tab=team` — paginação/lazy.

- [ ] **Step 4: `/code-review` no diff final**

Rodar `/code-review` sobre a branch e tratar findings.

---

## Self-Review (preenchido)

- **Spec coverage:** A→T3, B→T2, C→T4, D→T5+T6, E→T7, F→T8, page-size→T1, verificação→T9. Todas as seções cobertas.
- **Type consistency:** `fetchBranchOrdersPage({branchId, cursor})` e `BranchOrderRow` usados de forma idêntica em T5/T6. `InfiniteSentinel` ganha `skeleton?: ReactNode` opcional (T2), consumido em T4. `NewestCursor` reutilizado, sem tipo novo.
- **Placeholder scan:** sem TBD/TODO; código completo em cada step. Único ponto de verificação em runtime: a string exata de capability em T5 (instruída a alinhar com `dashboard/orders` via `rg`).
- **Risco RSC/client:** T6/T7 têm smoke visual explícito porque `check-types` não pega import de hook client em Server Component (ver `apps/web/CLAUDE.md`).
