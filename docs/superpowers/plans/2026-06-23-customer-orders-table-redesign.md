# Redesenho da tabela de Pedidos do cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tabela de Pedidos do detalhe de cliente (`?tab=pedidos`) para a Direção A1 — tabela enriquecida, linha clicável, ação inline, dados distribuídos pela largura toda, com scroll infinito no lugar da paginação numerada.

**Architecture:** A aba passa a um Server Component fino (`customer-orders-table.tsx`) que busca a 1ª página keyset (`listCustomerOrders`) e delega a renderização a um novo Client Component (`customer-orders-infinite.tsx`) com `useInfiniteList` + `InfiniteSentinel`, chamando a server action guardada `fetchCustomerOrdersPage`. A query é enriquecida com filial (`branch.name`) e preview do primeiro item (`order_item.name`, denormalizado).

**Tech Stack:** Next 16 / React 19 (Server + Client Components), Drizzle (`db.execute` SQL raw), keyset cursor (`@/lib/cursor` + `@/lib/infinite`), Tailwind v4, vitest (node env).

## Global Constraints

- Server actions: `"use server"` no topo + `await requireCapability("customers.read")` no início; retorno tipado.
- `data.ts` é `import "server-only"` — reads + tipos; não é endpoint (guardado pelo caller).
- Datas de exibição **sempre** via `@/lib/format/datetime` (fuso fixo `America/Sao_Paulo`); nunca `toLocale*`/`Intl.DateTimeFormat` cru em componente.
- Proibido: `console.*` (usar `logger`), `: any`/`as any`/`@ts-ignore`, `key={index}`, `<img>` puro, `useMemo`/`useCallback` manuais (React Compiler ativo), `forwardRef`, barrel files.
- Cliente **nunca** importa função de módulo `server-only`/`@emach/db` (arrasta driver pg → build quebra). Client chama server action; tipos via `import type`.
- Gate antes de PR: `bun verify` (`check-types && check && test`) **e** `bun run build` (obrigatório por mexer em `"use server"`) **e** smoke visual em `/dashboard/customers/{id}?tab=pedidos`.
- `crypto.randomUUID()` para IDs no caller (não aplicável aqui — sem inserts).
- Commits: Conventional Commits em PT, subject ≤50 chars.

---

### Task 1: Extrair e estender `formatRelative` para `datetime.ts`

Move o helper de data relativa hoje preso em `order-card.tsx` para o módulo compartilhado e estende para meses/anos (a tabela mostra histórico antigo). `order-card.tsx` passa a consumir o compartilhado.

**Files:**
- Modify: `apps/web/src/lib/format/datetime.ts` (adicionar `formatRelative`)
- Modify: `apps/web/src/app/dashboard/orders/_components/order-card.tsx:10-40` (remover local, importar)
- Test: `apps/web/src/lib/format/datetime.test.ts` (criar)

**Interfaces:**
- Produces: `formatRelative(date: Date): string` exportado de `@/lib/format/datetime`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/lib/format/datetime.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { formatRelative } from "./datetime";

const NOW = new Date("2026-06-23T12:00:00.000Z").getTime();

function ago(ms: number) {
	return new Date(NOW - ms);
}
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelative", () => {
	afterEach(() => vi.useRealTimers());

	function withNow(fn: () => void) {
		vi.spyOn(Date, "now").mockReturnValue(NOW);
		fn();
	}

	it("usa minutos abaixo de 1h", () => {
		withNow(() => expect(formatRelative(ago(5 * MIN))).toMatch(/min/));
	});
	it("usa horas abaixo de 24h", () => {
		withNow(() => expect(formatRelative(ago(3 * HOUR))).toMatch(/h|hora/));
	});
	it("usa dias abaixo de 30d", () => {
		withNow(() => expect(formatRelative(ago(5 * DAY))).toMatch(/dia/));
	});
	it("usa meses entre 30d e 12 meses", () => {
		withNow(() => expect(formatRelative(ago(70 * DAY))).toMatch(/m[eê]s/));
	});
	it("usa anos acima de 12 meses", () => {
		withNow(() => expect(formatRelative(ago(400 * DAY))).toMatch(/ano/));
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test datetime`
Expected: FAIL com "formatRelative is not a function" (ainda não exportado).

- [ ] **Step 3: Implementar `formatRelative` em `datetime.ts`**

Adicionar ao fim de `apps/web/src/lib/format/datetime.ts` (antes/depois das demais exports; o `RelativeTimeFormat` não usa fuso — é diff, sem risco de hydration por TZ):

```ts
/**
 * Data relativa ("há 5 min", "há 2 meses", "ano passado"). Deriva de `Date.now()`,
 * arredondada em min/h/dia/mês/ano — estável entre SSR e cliente exceto na virada
 * exata de um limite (mesmo trade-off já aceito antes em order-card). Para o valor
 * exato, pareie com `title={formatDateTime(date)}`.
 */
const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});
export const formatRelative = (date: Date): string => {
	const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000);
	if (Math.abs(diffMinutes) < 60) {
		return RELATIVE.format(diffMinutes, "minute");
	}
	const diffHours = Math.round(diffMinutes / 60);
	if (Math.abs(diffHours) < 24) {
		return RELATIVE.format(diffHours, "hour");
	}
	const diffDays = Math.round(diffHours / 24);
	if (Math.abs(diffDays) < 30) {
		return RELATIVE.format(diffDays, "day");
	}
	const diffMonths = Math.round(diffDays / 30);
	if (Math.abs(diffMonths) < 12) {
		return RELATIVE.format(diffMonths, "month");
	}
	return RELATIVE.format(Math.round(diffMonths / 12), "year");
};
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test datetime`
Expected: PASS (5 testes).

- [ ] **Step 5: Substituir o helper local em `order-card.tsx`**

Em `apps/web/src/app/dashboard/orders/_components/order-card.tsx`: remover o `RELATIVE_FORMATTER` (linhas ~16-19) e a função `formatRelativeDate` (linhas ~25-40); adicionar `formatRelative` ao import existente de `@/lib/format/datetime` (que já importa `formatDateTime`); trocar a chamada `formatRelativeDate(item.createdAt)` por `formatRelative(item.createdAt)`.

- [ ] **Step 6: Verificar tipos e rodar o teste**

Run: `bun --cwd apps/web exec tsc --noEmit -p . && bun --cwd apps/web test datetime`
Expected: sem erros de tipo; testes PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/format/datetime.ts apps/web/src/lib/format/datetime.test.ts apps/web/src/app/dashboard/orders/_components/order-card.tsx
git commit -m "refactor: extrair formatRelative compartilhado"
```

---

### Task 2: `listCustomerOrders` (keyset) + query enriquecida em `data.ts`

Adiciona o fetch keyset com filial e preview de item, e os campos novos em `CustomerOrderRow`. **Mantém** `getCustomerOrders` por ora (removido na Task 5) para nada quebrar no meio.

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/data.ts` (tipo `CustomerOrderRow`; nova fn `listCustomerOrders`)
- Test: `apps/web/src/app/dashboard/customers/data.orders.test.ts` (criar)

**Interfaces:**
- Consumes: `decodeCursor`, `BATCH_SIZE`, `InfiniteResult`, `paginate` (já importados no topo de `data.ts`); `toDate` de `@emach/db/utils`; `NewestCursor` (shape inline).
- Produces:
  - `CustomerOrderRow` agora inclui `branchName: string | null` e `firstItemName: string | null`.
  - `listCustomerOrders(input: { clientId: string; cursor: string | null }): Promise<InfiniteResult<CustomerOrderRow>>`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/customers/data.orders.test.ts`. Mocka só `db.execute` (mantém `@emach/db/utils` e schemas reais; env já é provida pelo `.env`/CI):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@emach/db", () => ({ db: { execute } }));

import { listCustomerOrders } from "./data";

function row(i: number) {
	return {
		id: `ord_${i}`,
		number: `EM-2026-00${i}`,
		status: "delivered",
		total_amount: "929.60",
		created_at: new Date(`2026-05-${10 + i}T12:00:00Z`),
		items_count: 3,
		first_item_name: "Furadeira 750W",
		branch_name: i % 2 === 0 ? "Matriz" : null,
	};
}

describe("listCustomerOrders", () => {
	beforeEach(() => execute.mockReset());

	it("mapeia campos enriquecidos e tipa total como número", async () => {
		execute.mockResolvedValue({ rows: [row(1)] });
		const res = await listCustomerOrders({ clientId: "c1", cursor: null });
		expect(res.items[0]).toMatchObject({
			number: "EM-2026-001",
			totalAmount: 929.6,
			itemsCount: 3,
			firstItemName: "Furadeira 750W",
			branchName: null,
		});
		expect(res.nextCursor).toBeNull();
	});

	it("emite nextCursor quando há mais que BATCH_SIZE linhas", async () => {
		const rows = Array.from({ length: 21 }, (_, i) => row(i + 1));
		execute.mockResolvedValue({ rows });
		const res = await listCustomerOrders({ clientId: "c1", cursor: null });
		expect(res.items).toHaveLength(20);
		expect(res.nextCursor).not.toBeNull();
	});
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun --cwd apps/web test data.orders`
Expected: FAIL com "listCustomerOrders is not a function".

- [ ] **Step 3: Estender `CustomerOrderRow`**

Em `apps/web/src/app/dashboard/customers/data.ts`, no `interface CustomerOrderRow` (linha ~73), adicionar os dois campos:

```ts
export interface CustomerOrderRow {
	branchName: string | null;
	createdAt: Date;
	firstItemName: string | null;
	id: string;
	itemsCount: number;
	number: string;
	status: OrderStatus;
	totalAmount: number;
}
```

- [ ] **Step 4: Implementar `listCustomerOrders`**

Adicionar em `data.ts` (perto de `getCustomerOrders`). Espelha o padrão keyset de `listCustomers` (predicado `(created_at, id) <`, `LIMIT BATCH_SIZE + 1`, `paginate` + `makeCursor` newest):

```ts
export async function listCustomerOrders(input: {
	clientId: string;
	cursor: string | null;
}): Promise<InfiniteResult<CustomerOrderRow>> {
	const decoded = input.cursor ? decodeCursor(input.cursor) : null;
	const keyset =
		decoded?.sort === "newest"
			? sql`AND (o.created_at, o.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
			: sql``;

	const rows = await db.execute<{
		branch_name: string | null;
		created_at: Date;
		first_item_name: string | null;
		id: string;
		items_count: number;
		number: string;
		status: OrderStatus;
		total_amount: string;
	}>(sql`
		SELECT
			o.id, o.number, o.status, o.total_amount, o.created_at,
			(SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id = o.id) AS items_count,
			(SELECT oi.name FROM order_item oi WHERE oi.order_id = o.id ORDER BY oi.id LIMIT 1) AS first_item_name,
			b.name AS branch_name
		FROM "order" o
		LEFT JOIN branch b ON b.id = o.branch_id
		WHERE o.client_id = ${input.clientId} ${keyset}
		ORDER BY o.created_at DESC, o.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);

	return paginate(
		rows.rows,
		(r) => ({
			id: r.id,
			number: r.number,
			status: r.status,
			totalAmount: Number(r.total_amount),
			createdAt: toDate(r.created_at),
			itemsCount: Number(r.items_count),
			firstItemName: r.first_item_name,
			branchName: r.branch_name,
		}),
		(last) => ({
			v: 1,
			sort: "newest" as const,
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `bun --cwd apps/web test data.orders`
Expected: PASS (2 testes).

- [ ] **Step 6: Verificar tipos**

Run: `bun --cwd apps/web exec tsc --noEmit -p .`
Expected: sem erros. (Nota: `getCustomerOrders` ainda existe e seu mapeamento agora carece de `branchName`/`firstItemName` — adicionar `branchName: null, firstItemName: null` ao objeto que ele monta para satisfazer o tipo, já que será removido na Task 5.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/customers/data.ts apps/web/src/app/dashboard/customers/data.orders.test.ts
git commit -m "feat: listCustomerOrders keyset com filial e item"
```

---

### Task 3: Server action `fetchCustomerOrdersPage`

Endpoint guardado que o Client Component chama no scroll. Espelha `fetchCustomersPage` (mesmo arquivo).

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/actions.ts` (nova action)
- Test: `apps/web/src/app/dashboard/customers/actions.orders.test.ts` (criar)

**Interfaces:**
- Consumes: `listCustomerOrders` (Task 2); `requireCapability` de `@/lib/permissions`.
- Produces: `fetchCustomerOrdersPage(input: { clientId: string; cursor: string | null }): Promise<InfiniteResult<CustomerOrderRow>>`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/customers/actions.orders.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCapability = vi.fn();
const listCustomerOrders = vi.fn();
vi.mock("@/lib/permissions", () => ({ requireCapability }));
vi.mock("./data", () => ({ listCustomerOrders }));

import { fetchCustomerOrdersPage } from "./actions";

describe("fetchCustomerOrdersPage", () => {
	beforeEach(() => {
		requireCapability.mockReset().mockResolvedValue(undefined);
		listCustomerOrders.mockReset().mockResolvedValue({ items: [], nextCursor: null });
	});

	it("exige customers.read e delega a listCustomerOrders", async () => {
		const out = await fetchCustomerOrdersPage({ clientId: "c1", cursor: null });
		expect(requireCapability).toHaveBeenCalledWith("customers.read");
		expect(listCustomerOrders).toHaveBeenCalledWith({ clientId: "c1", cursor: null });
		expect(out).toEqual({ items: [], nextCursor: null });
	});
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun --cwd apps/web test actions.orders`
Expected: FAIL com "fetchCustomerOrdersPage is not a function".

- [ ] **Step 3: Implementar a action**

Em `apps/web/src/app/dashboard/customers/actions.ts`, adicionar (o arquivo já é `"use server"` e já importa `requireCapability` + reads de `./data`; confirmar/incluir o import de `listCustomerOrders` e do tipo `InfiniteResult`):

```ts
export async function fetchCustomerOrdersPage(input: {
	clientId: string;
	cursor: string | null;
}): Promise<InfiniteResult<CustomerOrderRow>> {
	await requireCapability("customers.read");
	return listCustomerOrders({ clientId: input.clientId, cursor: input.cursor });
}
```

Garantir os imports no topo do `actions.ts`:
- `import type { InfiniteResult } from "@/lib/infinite";`
- `import { listCustomerOrders, type CustomerOrderRow } from "./data";` (ajustar à forma de import já existente do arquivo).

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun --cwd apps/web test actions.orders`
Expected: PASS.

- [ ] **Step 5: Verificar tipos**

Run: `bun --cwd apps/web exec tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/customers/actions.ts apps/web/src/app/dashboard/customers/actions.orders.test.ts
git commit -m "feat: action fetchCustomerOrdersPage guardada"
```

---

### Task 4: Client Component `customer-orders-infinite.tsx` (tabela A1)

A tabela renderizada (Direção A1). Sem harness de teste de componente no repo → verificação por typecheck + build + smoke visual (regra do projeto).

**Files:**
- Create: `apps/web/src/app/dashboard/customers/_components/customer-orders-infinite.tsx`

**Interfaces:**
- Consumes: `useInfiniteList` (`@/lib/use-infinite-list`) retornando `{ items, hasMore, loadMore, pending, error }`; `InfiniteSentinel` (`@/components/infinite-sentinel`, props `{ hasMore, pending, error, onLoadMore }`); `fetchCustomerOrdersPage` (Task 3); `formatRelative` + `formatDateTime` (Task 1); `OrderStatusBadge` (`../../orders/_components/order-status-badge`, canônico status-visual — fonte única); `import type { CustomerOrderRow }` de `../data`.
- Produces: `CustomerOrdersInfinite({ clientId, initialItems, initialCursor })`.

- [ ] **Step 1: Criar o componente**

Criar `apps/web/src/app/dashboard/customers/_components/customer-orders-infinite.tsx`:

```tsx
"use client";

import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableActionsCell,
	TableActionsHead,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { EyeIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchCustomerOrdersPage } from "../actions";
import type { CustomerOrderRow } from "../data";
import { OrderStatusBadge } from "../../orders/_components/order-status-badge";

const CURRENCY = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

function itemsPreview(order: CustomerOrderRow): string {
	if (!order.firstItemName) {
		return "";
	}
	const extra = order.itemsCount > 1 ? ` +${order.itemsCount - 1}` : "";
	return `${order.firstItemName}${extra}`;
}

interface CustomerOrdersInfiniteProps {
	clientId: string;
	initialCursor: string | null;
	initialItems: CustomerOrderRow[];
}

export function CustomerOrdersInfinite({
	clientId,
	initialItems,
	initialCursor,
}: CustomerOrdersInfiniteProps) {
	const router = useRouter();
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems,
		initialCursor,
		fetchPage: (cursor) => fetchCustomerOrdersPage({ clientId, cursor }),
	});

	return (
		<div className="flex flex-col gap-4">
			<Table className="table-fixed">
				<colgroup>
					<col className="w-[16%]" />
					<col className="w-[12%]" />
					<col className="w-[27%]" />
					<col className="w-[16%]" />
					<col className="w-[15%]" />
					<col className="w-[11%]" />
					<col className="w-16" />
				</colgroup>
				<TableHeader>
					<TableRow>
						<TableHead>Pedido</TableHead>
						<TableHead>Data</TableHead>
						<TableHead>Itens</TableHead>
						<TableHead>Filial</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="text-right">Total</TableHead>
						<TableActionsHead>Ação</TableActionsHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((order) => {
						const href = `/dashboard/orders/${order.id}`;
						const preview = itemsPreview(order);
						return (
							<TableRow
								className="cursor-pointer transition-colors hover:bg-primary/[0.06]"
								key={order.id}
								onClick={() => router.push(href)}
							>
								<TableCell className="truncate font-medium font-mono text-sm">
									{order.number}
								</TableCell>
								<TableCell
									className="truncate text-muted-foreground text-sm"
									title={formatDateTime(order.createdAt)}
								>
									<span suppressHydrationWarning>
										{formatRelative(order.createdAt)}
									</span>
								</TableCell>
								<TableCell className="truncate text-sm">
									<span className="font-medium">{order.itemsCount}</span>
									{preview ? (
										<span className="text-muted-foreground"> · {preview}</span>
									) : null}
								</TableCell>
								<TableCell className="truncate text-muted-foreground text-sm">
									{order.branchName ?? "—"}
								</TableCell>
								<TableCell>
									<OrderStatusBadge status={order.status} />
								</TableCell>
								<TableCell className="text-right font-medium font-mono text-primary text-sm">
									{CURRENCY.format(order.totalAmount)}
								</TableCell>
								<TableActionsCell>
									<Link
										aria-label={`Abrir pedido ${order.number}`}
										className={buttonVariants({
											size: "icon-sm",
											variant: "outline",
										})}
										href={href}
										onClick={(e) => e.stopPropagation()}
									>
										<EyeIcon aria-hidden className="size-3.5" />
									</Link>
								</TableActionsCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
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

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web exec tsc --noEmit -p .`
Expected: sem erros. Se `<Table>` não aceitar `className`, aplicar `table-fixed` via wrapper ou conferir a API em `packages/ui/src/components/table.tsx` e ajustar (sem `as any`).

- [ ] **Step 3: Lint**

Run: `bun --cwd apps/web exec ultracite check src/app/dashboard/customers/_components/customer-orders-infinite.tsx`
Expected: sem violações (atenção a `key` estável — usa `order.id` ✓ — e a `useMemo`/`useCallback` proibidos — nenhum ✓).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-orders-infinite.tsx
git commit -m "feat: tabela de pedidos infinita (A1)"
```

---

### Task 5: Shell server + fiação na página + remoção do caminho antigo

`customer-orders-table.tsx` vira shell server (1ª página + `<Empty>`), a página solta o `?page` e usa o fetch novo para `recentOrders`, e o código de paginação morre. Fecha com o gate completo + smoke.

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-orders-table.tsx` (reescrever como shell server)
- Modify: `apps/web/src/app/dashboard/customers/[id]/page.tsx` (fetch da aba + `recentOrders`; remover `parsePage`/`?page`)
- Modify: `apps/web/src/app/dashboard/customers/data.ts` (remover `getCustomerOrders`, `CustomerOrdersResult`, `CUSTOMER_ORDERS_PAGE_SIZE`)

**Interfaces:**
- Consumes: `listCustomerOrders` (Task 2), `CustomerOrdersInfinite` (Task 4).
- Produces: `CustomerOrdersTable({ clientId }: { clientId: string })` — Server Component async.

- [ ] **Step 1: Reescrever `customer-orders-table.tsx` como shell server**

Substituir todo o conteúdo de `apps/web/src/app/dashboard/customers/_components/customer-orders-table.tsx` por:

```tsx
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Empty, EmptyHeader, EmptyTitle } from "@emach/ui/components/empty";

import { listCustomerOrders } from "../data";
import { CustomerOrdersInfinite } from "./customer-orders-infinite";

export async function CustomerOrdersTable({ clientId }: { clientId: string }) {
	const { items, nextCursor } = await listCustomerOrders({
		clientId,
		cursor: null,
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Pedidos</CardTitle>
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>Nenhum pedido encontrado</EmptyTitle>
						</EmptyHeader>
					</Empty>
				) : (
					<CustomerOrdersInfinite
						clientId={clientId}
						initialCursor={nextCursor}
						initialItems={items}
					/>
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Fiar a página `[id]/page.tsx`**

Em `apps/web/src/app/dashboard/customers/[id]/page.tsx`:

1. No `Promise.all` (linha ~295): trocar a entrada de `recentOrders` para o fetch novo e **remover** a entrada `ordersResult`:
   - `onOverview ? getCustomerOrders(id, 1) : null,` → `onOverview ? listCustomerOrders({ clientId: id, cursor: null }) : null,`
   - apagar a linha `currentTab === "pedidos" ? getCustomerOrders(id, page) : null,` e o `ordersResult` do destructuring.
2. Em `recentOrders?.items.slice(0, 3)` — continua válido (o retorno tem `.items`).
3. No `buildTabs`/`TabData`: remover `ordersResult` (campo da interface, do destructuring e do objeto passado), e a aba pedidos passa a `content: currentTab === "pedidos" ? <CustomerOrdersTable clientId={customer.id} /> : null` (sem prop `result`, sem checar `ordersResult`).
4. Remover `function parsePage`, a `const page = parsePage(...)` e o import de `getCustomerOrders` (trocar por `listCustomerOrders`).
5. Ajustar o tipo de `recentOrders` em `TabData` para `InfiniteResult<CustomerOrderRow> | null` (importar os tipos de `../data`).

- [ ] **Step 3: Remover o caminho antigo em `data.ts`**

Em `apps/web/src/app/dashboard/customers/data.ts`: apagar `getCustomerOrders`, a `interface CustomerOrdersResult` e a const `CUSTOMER_ORDERS_PAGE_SIZE`. Rodar busca para garantir que não há outros consumidores:

Run: `rg -n 'getCustomerOrders|CustomerOrdersResult|CUSTOMER_ORDERS_PAGE_SIZE' apps/web/src`
Expected: nenhum resultado (todos migrados).

- [ ] **Step 4: Typecheck + lint + testes**

Run: `bun --cwd apps/web exec tsc --noEmit -p . && bun check && bun --cwd apps/web test`
Expected: sem erros de tipo, sem violações de lint, suíte verde.

- [ ] **Step 5: Build (gate obrigatório por `"use server"`)**

Run: `bun run build`
Expected: build OK (sem "Only async functions are allowed to be exported in a 'use server' file").

- [ ] **Step 6: Smoke visual obrigatório**

Run: `bun dev:web` e visitar:
- `/dashboard/customers/{id}?tab=pedidos` com cliente de **≥1 pedido** → conferir: 7 colunas preenchendo a largura sem vão; data relativa (tooltip com data/hora exata); coluna Itens com preview "N · Produto +X"; Filial ("—" quando nula); total em coral; badge de status; botão `Eye` inline; hover + clique na linha abre o pedido; scroll infinito carrega mais (se houver >20 pedidos) sem rodapé "fim da lista".
- mesmo cliente com **0 pedidos** → `<Empty>` "Nenhum pedido encontrado".
- visão geral (`?tab=perfil`) → os 3 pedidos recentes continuam aparecendo.

Stack trace rápido se quebrar: `nextjs_call <port> get_errors` (MCP `next-devtools`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-orders-table.tsx apps/web/src/app/dashboard/customers/[id]/page.tsx apps/web/src/app/dashboard/customers/data.ts
git commit -m "feat: aba pedidos com scroll infinito (A1)"
```

---

## Self-Review

**1. Spec coverage:**
- §3 visual A1 (7 colunas, linha-link, ação inline, total coral, data relativa, preview, distribuição) → Task 4. ✓
- §4.1 dados (filial + preview + keyset) → Task 2. ✓
- §4.2 action guardada → Task 3. ✓
- §4.3 shell server + client infinite → Tasks 5 + 4. ✓
- §4.4 página (drop `?page`, recentOrders) → Task 5. ✓
- §4.5 `formatRelative` compartilhado → Task 1. ✓
- §6 edge cases (vazio, filial nula, item único, nome longo/truncate, status desconhecido, hydration) → Tasks 4/5 (suppressHydrationWarning, `?? "—"`, `truncate`, fallback `secondary`, `<Empty>`). ✓
- §7 testes (unit data + format) → Tasks 1/2/3; smoke → Task 5. ✓

**2. Placeholder scan:** sem TBD/TODO; todo passo de código mostra o código. ✓

**3. Type consistency:** `listCustomerOrders({ clientId, cursor })` e `fetchCustomerOrdersPage({ clientId, cursor })` consistentes entre Tasks 2/3/4/5; `CustomerOrderRow` com `branchName`/`firstItemName` definidos na Task 2 e consumidos na 4; `InfiniteResult<CustomerOrderRow>` em 2/3/5. ✓

**Risco conhecido a validar na execução:** se `<Table>` (`packages/ui`) não repassar `className`/aceitar `<colgroup>` como filho direto, ajustar para um wrapper com `table-fixed` ou estilizar via classes utilitárias nas `<col>` — conferir `packages/ui/src/components/table.tsx` antes (Task 4, Step 2).
