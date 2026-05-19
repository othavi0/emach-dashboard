# Hardening da Camada de Dados de Lazy Loading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair a lógica pura de paginação cursor-based para `lib/` (DRY + testável), e organizar as funções dos cards de lazy loading em um `pending-data.ts` por rota.

**Architecture:** Um helper puro `paginate()` em `lib/infinite.ts` encapsula o padrão `hasMore`/`slice`/`encodeCursor` repetido em 8 funções. Um helper `decodeCursorAs()` em `lib/cursor.ts` consolida decode + validação do discriminante `sort`. As funções `fetch*Page`/`fetch*Activity*` saem dos `actions.ts`/`data.ts` para um `pending-data.ts` dedicado por rota; `actions.ts` vira wrapper fino `"use server"`. Refactor sem mudança de comportamento.

**Tech Stack:** Next 16 / React 19, Drizzle (`db.execute` raw SQL), Vitest (`environment: node`, sem DB), Biome/Ultracite.

**Verificação:** o projeto valida com `bun check-types` + `biome` + `bun --cwd apps/web test`. As Tasks 1–2 são TDD puro (helper + teste). Tasks 3–5 são refactor mecânico verificado por `check-types` (as funções movidas são código já correto e smokado). Task 6 faz a verificação final.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `apps/web/src/lib/infinite.ts` | `BATCH_SIZE`, `InfiniteResult`, e o novo `paginate()` | Modificar |
| `apps/web/src/lib/cursor.ts` | União `Cursor`, encode/decode, e o novo `decodeCursorAs()` | Modificar |
| `apps/web/__tests__/infinite.test.ts` | Testes de `paginate()` | Criar |
| `apps/web/__tests__/cursor.test.ts` | Testes de `encodeCursor`/`decodeCursor`/`decodeCursorAs` | Criar |
| `apps/web/src/app/dashboard/pending-data.ts` | Funções dos cards do dashboard (plain, sem `"use server"`) | Criar |
| `apps/web/src/app/dashboard/actions.ts` | Wrappers `"use server"` que re-exportam de `pending-data.ts` | Reescrever |
| `apps/web/src/app/dashboard/orders/pending-data.ts` | Funções dos cards de pedidos | Criar |
| `apps/web/src/app/dashboard/orders/data.ts` | Remover as 2 funções movidas + imports órfãos | Modificar |
| `apps/web/src/app/dashboard/orders/actions.ts` | Ajustar import dos impls para `./pending-data` | Modificar |
| `apps/web/src/app/dashboard/customers/pending-data.ts` | Funções dos cards de clientes | Criar |
| `apps/web/src/app/dashboard/customers/data.ts` | Remover as 2 funções + consts movidas + imports órfãos | Modificar |
| `apps/web/src/app/dashboard/customers/actions.ts` | Ajustar import dos impls para `./pending-data` | Modificar |

> Os `page.tsx` das 3 rotas **não** mudam: importam as funções via `actions.ts` (wrappers), cujos nomes exportados continuam idênticos.

---

## Task 1: Helper `paginate()` em `lib/infinite.ts`

**Files:**
- Modify: `apps/web/src/lib/infinite.ts`
- Test: `apps/web/__tests__/infinite.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/__tests__/infinite.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { decodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, paginate } from "@/lib/infinite";

interface Raw {
	n: number;
}

const makeRows = (count: number): Raw[] =>
	Array.from({ length: count }, (_, i) => ({ n: i }));

const mapRow = (r: Raw) => ({ value: r.n * 10 });

const makeCursor = (last: Raw) =>
	({
		v: 1,
		sort: "newest",
		createdAt: `t${last.n}`,
		id: `id${last.n}`,
	}) as const;

describe("paginate", () => {
	it("retorna todos os itens e nextCursor null quando há menos que BATCH_SIZE linhas", () => {
		const spy = vi.fn(makeCursor);
		const result = paginate(makeRows(BATCH_SIZE - 1), mapRow, spy);
		expect(result.items).toHaveLength(BATCH_SIZE - 1);
		expect(result.nextCursor).toBeNull();
		expect(spy).not.toHaveBeenCalled();
	});

	it("retorna nextCursor null quando há exatamente BATCH_SIZE linhas", () => {
		const spy = vi.fn(makeCursor);
		const result = paginate(makeRows(BATCH_SIZE), mapRow, spy);
		expect(result.items).toHaveLength(BATCH_SIZE);
		expect(result.nextCursor).toBeNull();
		expect(spy).not.toHaveBeenCalled();
	});

	it("corta em BATCH_SIZE e emite cursor da linha de índice BATCH_SIZE-1 quando há mais", () => {
		const spy = vi.fn(makeCursor);
		const result = paginate(makeRows(BATCH_SIZE + 1), mapRow, spy);
		expect(result.items).toHaveLength(BATCH_SIZE);
		expect(result.nextCursor).not.toBeNull();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith({ n: BATCH_SIZE - 1 });
		const decoded = decodeCursor(result.nextCursor as string);
		expect(decoded).toMatchObject({
			sort: "newest",
			id: `id${BATCH_SIZE - 1}`,
			createdAt: `t${BATCH_SIZE - 1}`,
		});
	});

	it("aplica mapRow a cada item retornado", () => {
		const result = paginate(makeRows(3), mapRow, makeCursor);
		expect(result.items).toEqual([
			{ value: 0 },
			{ value: 10 },
			{ value: 20 },
		]);
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test infinite`
Expected: FAIL — `paginate` não existe em `@/lib/infinite`.

- [ ] **Step 3: Implementar `paginate`**

Substituir o conteúdo INTEIRO de `apps/web/src/lib/infinite.ts` por:

```ts
import { type Cursor, encodeCursor } from "./cursor";

export interface InfiniteResult<T> {
	items: T[];
	nextCursor: string | null;
}

export const BATCH_SIZE = 24;

/**
 * Paginação keyset: recebe `BATCH_SIZE + 1` linhas raw de uma query,
 * mapeia para itens de UI e emite o cursor da última linha da página.
 * `makeCursor` só é chamado quando há mais páginas, recebendo a última
 * linha RAW (índice `BATCH_SIZE - 1`).
 */
export function paginate<TRaw, TItem>(
	rawRows: TRaw[],
	mapRow: (row: TRaw) => TItem,
	makeCursor: (lastRaw: TRaw) => Cursor
): InfiniteResult<TItem> {
	const hasMore = rawRows.length > BATCH_SIZE;
	const pageRows = hasMore ? rawRows.slice(0, BATCH_SIZE) : rawRows;
	const items = pageRows.map(mapRow);
	const lastRaw = pageRows.at(-1);
	const nextCursor =
		hasMore && lastRaw ? encodeCursor(makeCursor(lastRaw)) : null;
	return { items, nextCursor };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test infinite`
Expected: PASS — 4 testes.

- [ ] **Step 5: Verificar tipos**

Run: `bun check-types`
Expected: PASS (roda todos os workspaces — pode levar minutos).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/infinite.ts apps/web/__tests__/infinite.test.ts
git commit -m "feat: helper puro paginate() para cursor pagination"
```

---

## Task 2: Helper `decodeCursorAs()` em `lib/cursor.ts`

**Files:**
- Modify: `apps/web/src/lib/cursor.ts`
- Test: `apps/web/__tests__/cursor.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/__tests__/cursor.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	type Cursor,
	decodeCursor,
	decodeCursorAs,
	encodeCursor,
} from "@/lib/cursor";

describe("cursor encode/decode", () => {
	it("faz roundtrip de um cursor newest", () => {
		const c: Cursor = {
			v: 1,
			sort: "newest",
			createdAt: "2026-05-18T00:00:00.000Z",
			id: "abc",
		};
		expect(decodeCursor(encodeCursor(c))).toEqual(c);
	});

	it("faz roundtrip de um cursor pendingStock", () => {
		const c: Cursor = {
			v: 1,
			sort: "pendingStock",
			quantity: 3,
			id: "variant:branch",
		};
		expect(decodeCursor(encodeCursor(c))).toEqual(c);
	});

	it("lança em cursor com versão incompatível", () => {
		const raw = Buffer.from(
			JSON.stringify({ v: 2, sort: "newest", createdAt: "x", id: "y" })
		).toString("base64url");
		expect(() => decodeCursor(raw)).toThrow("Cursor incompatível");
	});
});

describe("decodeCursorAs", () => {
	it("retorna o cursor estreitado quando o sort bate", () => {
		const raw = encodeCursor({
			v: 1,
			sort: "newest",
			createdAt: "2026-05-18T00:00:00.000Z",
			id: "abc",
		});
		const c = decodeCursorAs(raw, "newest");
		expect(c.createdAt).toBe("2026-05-18T00:00:00.000Z");
		expect(c.id).toBe("abc");
	});

	it("lança quando o sort diverge", () => {
		const raw = encodeCursor({
			v: 1,
			sort: "pendingStock",
			quantity: 1,
			id: "x",
		});
		expect(() => decodeCursorAs(raw, "newest")).toThrow(
			"Cursor incompatível: esperado newest"
		);
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test cursor`
Expected: FAIL — `decodeCursorAs` não existe.

- [ ] **Step 3: Implementar `decodeCursorAs`**

Em `apps/web/src/lib/cursor.ts`, ao FIM do arquivo (após a função `decodeCursor`), adicionar:

```ts
/**
 * Decodifica um cursor e valida seu discriminante `sort`, estreitando o tipo.
 * Lança se o `sort` do cursor não for o esperado.
 */
export function decodeCursorAs<S extends Cursor["sort"]>(
	raw: string,
	sort: S
): Extract<Cursor, { sort: S }> {
	const parsed = decodeCursor(raw);
	if (parsed.sort !== sort) {
		throw new Error(`Cursor incompatível: esperado ${sort}`);
	}
	return parsed as Extract<Cursor, { sort: S }>;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test cursor`
Expected: PASS — 5 testes.

- [ ] **Step 5: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/cursor.ts apps/web/__tests__/cursor.test.ts
git commit -m "feat: helper decodeCursorAs() valida discriminante de cursor"
```

---

## Task 3: `dashboard/pending-data.ts` + wrapper `actions.ts`

**Files:**
- Create: `apps/web/src/app/dashboard/pending-data.ts`
- Modify (reescrever): `apps/web/src/app/dashboard/actions.ts`

- [ ] **Step 1: Criar `apps/web/src/app/dashboard/pending-data.ts`** com este conteúdo:

```ts
import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";

import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import { decodeCursorAs } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";

export interface DashboardCounts {
	orders: number;
	reviews: number;
	stock: number;
}

export async function fetchPendingStock(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCurrentSession();
	const decoded = cursor ? decodeCursorAs(cursor, "pendingStock") : null;
	const keyset = decoded
		? sql`AND (sl.quantity, sl.variant_id || ':' || sl.branch_id) > (${decoded.quantity}, ${decoded.id})`
		: sql``;
	const result = await db.execute<{
		branch_id: string;
		branch_name: string;
		quantity: number;
		sku: string | null;
		tool_name: string;
		variant_id: string;
	}>(sql`
		SELECT sl.variant_id, sl.branch_id, sl.quantity,
			tv.sku, t.name AS tool_name, b.name AS branch_name
		FROM stock_level sl
		JOIN tool_variant tv ON tv.id = sl.variant_id
		JOIN tool t ON t.id = tv.tool_id
		JOIN branch b ON b.id = sl.branch_id
		WHERE (sl.quantity = 0 OR (sl.reorder_point > 0 AND sl.quantity <= sl.reorder_point))
		${keyset}
		ORDER BY sl.quantity ASC, sl.variant_id || ':' || sl.branch_id ASC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		result.rows,
		(r): PendingRow => ({
			id: `${r.variant_id}:${r.branch_id}`,
			href: "/dashboard/stock",
			primary: r.sku ?? r.tool_name,
			secondary: `${r.tool_name} · ${r.branch_name}`,
			badge:
				r.quantity === 0
					? { label: "Sem estoque", role: "destructive" }
					: { label: "Repor", role: "warning" },
		}),
		(last) => ({
			v: 1,
			sort: "pendingStock",
			quantity: last.quantity,
			id: `${last.variant_id}:${last.branch_id}`,
		})
	);
}

export async function fetchPendingOrders(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCurrentSession();
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const keyset = decoded
		? sql`AND (o.created_at, o.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
		: sql``;
	const result = await db.execute<{
		client_name: string;
		created_at: Date;
		id: string;
		number: string;
		status: string;
	}>(sql`
		SELECT o.id, o.number, o.status, o.created_at, c.name AS client_name
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		WHERE o.status IN ('paid', 'preparing', 'shipped')
		${keyset}
		ORDER BY o.created_at DESC, o.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	const badgeFor = (status: string): NonNullable<PendingRow["badge"]> => {
		if (status === "paid") {
			return { label: "Pago", role: "warning" };
		}
		if (status === "preparing") {
			return { label: "Preparando", role: "info" };
		}
		return { label: "Enviado", role: "info" };
	};
	return paginate(
		result.rows,
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/orders/${r.id}`,
			primary: `#${r.number} · ${r.client_name}`,
			badge: badgeFor(r.status),
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}

export async function fetchPendingReviews(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCurrentSession();
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const keyset = decoded
		? sql`AND (r.created_at, r.id) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
		: sql``;
	const result = await db.execute<{
		created_at: Date;
		id: string;
		rating: number;
		tool_name: string | null;
	}>(sql`
		SELECT r.id, r.rating, r.created_at, t.name AS tool_name
		FROM review r
		LEFT JOIN tool t ON t.id = r.tool_id
		WHERE r.status = 'pending'
		${keyset}
		ORDER BY r.created_at DESC, r.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		result.rows,
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/reviews/${r.id}`,
			primary: `Review ${r.rating}★`,
			secondary: r.tool_name ?? "ferramenta",
			badge: { label: "Moderar", role: "warning" },
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}

export async function fetchDashboardActivity(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	await requireCurrentSession();
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const keyset = (col: string, idExpr: string) =>
		decoded
			? sql`WHERE (${sql.raw(col)}, ${sql.raw(idExpr)}) < (${decoded.createdAt}::timestamptz, ${decoded.id})`
			: sql``;
	const result = await db.execute<{
		created_at: Date;
		href: string | null;
		id: string;
		kind: "order" | "review" | "stock";
		primary: string;
		secondary: string | null;
	}>(sql`
		(
			SELECT 'stock-' || sm.id AS id, 'stock'::text AS kind, sm.created_at,
				CASE WHEN sm.delta > 0 THEN '+' || sm.delta || ' un. ' || COALESCE(tv.sku, 'variante')
					ELSE sm.delta || ' un. ' || COALESCE(tv.sku, 'variante') END AS primary,
				COALESCE(b.name, '—') AS secondary, NULL::text AS href
			FROM stock_movement sm
			LEFT JOIN tool_variant tv ON tv.id = sm.variant_id
			LEFT JOIN branch b ON b.id = sm.branch_id
			${keyset("sm.created_at", "'stock-' || sm.id")}
			ORDER BY sm.created_at DESC, 'stock-' || sm.id DESC LIMIT ${BATCH_SIZE + 1}
		)
		UNION ALL
		(
			SELECT 'order-' || osh.id AS id, 'order'::text AS kind, osh.created_at,
				'#' || o.number || ' → ' || osh.to_status::text AS primary,
				NULL::text AS secondary, '/dashboard/orders/' || o.id AS href
			FROM order_status_history osh
			JOIN "order" o ON o.id = osh.order_id
			${keyset("osh.created_at", "'order-' || osh.id")}
			ORDER BY osh.created_at DESC, 'order-' || osh.id DESC LIMIT ${BATCH_SIZE + 1}
		)
		UNION ALL
		(
			SELECT 'review-' || r.id AS id, 'review'::text AS kind, r.created_at,
				'Review ' || r.rating || '★ · ' || COALESCE(t.name, 'ferramenta') AS primary,
				r.status::text AS secondary, '/dashboard/reviews/' || r.id AS href
			FROM review r
			LEFT JOIN tool t ON t.id = r.tool_id
			${keyset("r.created_at", "'review-' || r.id")}
			ORDER BY r.created_at DESC, 'review-' || r.id DESC LIMIT ${BATCH_SIZE + 1}
		)
		ORDER BY created_at DESC, id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		result.rows,
		(r): ActivityEvent => ({
			id: r.id,
			kind: r.kind,
			at: toDate(r.created_at),
			primary: r.primary,
			secondary: r.secondary ?? undefined,
			href: r.href ?? undefined,
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}

export async function fetchDashboardCounts(): Promise<DashboardCounts> {
	await requireCurrentSession();
	const result = await db.execute<DashboardCounts>(sql`
		SELECT
			(SELECT COUNT(*)::int FROM stock_level
				WHERE quantity = 0 OR (reorder_point > 0 AND quantity <= reorder_point)) AS stock,
			(SELECT COUNT(*)::int FROM "order" WHERE status IN ('paid', 'preparing', 'shipped')) AS orders,
			(SELECT COUNT(*)::int FROM review WHERE status = 'pending') AS reviews
	`);
	const row = result.rows[0];
	if (!row) {
		throw new Error("fetchDashboardCounts: query retornou 0 linhas");
	}
	return row;
}
```

- [ ] **Step 2: Reescrever `apps/web/src/app/dashboard/actions.ts`** com este conteúdo:

```ts
"use server";

import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import type { InfiniteResult } from "@/lib/infinite";
import {
	type DashboardCounts,
	fetchDashboardActivity as fetchDashboardActivityImpl,
	fetchDashboardCounts as fetchDashboardCountsImpl,
	fetchPendingOrders as fetchPendingOrdersImpl,
	fetchPendingReviews as fetchPendingReviewsImpl,
	fetchPendingStock as fetchPendingStockImpl,
} from "./pending-data";

export async function fetchPendingStock(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	return await fetchPendingStockImpl(cursor);
}

export async function fetchPendingOrders(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	return await fetchPendingOrdersImpl(cursor);
}

export async function fetchPendingReviews(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	return await fetchPendingReviewsImpl(cursor);
}

export async function fetchDashboardActivity(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	return await fetchDashboardActivityImpl(cursor);
}

export async function fetchDashboardCounts(): Promise<DashboardCounts> {
	return await fetchDashboardCountsImpl();
}
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS. `dashboard/page.tsx` importa de `./actions` e os 5 nomes continuam exportados — não muda.

- [ ] **Step 4: Lint dos arquivos tocados**

Run: `bunx biome check apps/web/src/app/dashboard/pending-data.ts apps/web/src/app/dashboard/actions.ts`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/pending-data.ts apps/web/src/app/dashboard/actions.ts
git commit -m "refactor: dashboard cards em pending-data.ts com helpers"
```

---

## Task 4: `orders/pending-data.ts` + limpeza de `data.ts`/`actions.ts`

**Files:**
- Create: `apps/web/src/app/dashboard/orders/pending-data.ts`
- Modify: `apps/web/src/app/dashboard/orders/data.ts`
- Modify: `apps/web/src/app/dashboard/orders/actions.ts`

- [ ] **Step 1: Criar `apps/web/src/app/dashboard/orders/pending-data.ts`** com este conteúdo:

```ts
import { db } from "@emach/db";
import type { OrderStatus } from "@emach/db/schema/orders";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";

import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import { getUserBranchScope } from "@/lib/branch-scope";
import { decodeCursorAs } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";
import { ORDER_STATUS_LABELS } from "./status-meta";

const PENDING_ORDER_BADGE: Record<string, NonNullable<PendingRow["badge"]>> = {
	pending_payment: { label: "Aguardando pgto", role: "warning" },
	paid: { label: "Pago", role: "warning" },
	preparing: { label: "Preparando", role: "info" },
	shipped: { label: "Enviado", role: "info" },
};

export async function fetchPendingOrdersPage({
	statuses,
	cursor,
}: {
	statuses: OrderStatus[];
	cursor: string | null;
}): Promise<InfiniteResult<PendingRow>> {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);
	if (scope !== null && scope.length === 0) {
		return { items: [], nextCursor: null };
	}
	const conditions = [
		sql`o.status IN (${sql.join(
			statuses.map((s) => sql`${s}`),
			sql`, `
		)})`,
	];
	if (scope !== null) {
		conditions.push(
			sql`o.branch_id IN (${sql.join(
				scope.map((id) => sql`${id}`),
				sql`, `
			)})`
		);
	}
	if (cursor) {
		const c = decodeCursorAs(cursor, "newest");
		conditions.push(
			sql`(o.created_at, o.id) < (${c.createdAt}::timestamptz, ${c.id})`
		);
	}
	const rows = await db.execute<{
		client_name: string;
		created_at: Date;
		id: string;
		number: string;
		status: OrderStatus;
	}>(sql`
		SELECT o.id, o.number, o.status, o.created_at, c.name AS client_name
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		WHERE ${sql.join(conditions, sql` AND `)}
		ORDER BY o.created_at DESC, o.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		rows.rows,
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/orders/${r.id}`,
			primary: `#${r.number} · ${r.client_name}`,
			badge: PENDING_ORDER_BADGE[r.status] ?? {
				label: r.status,
				role: "info",
			},
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}

export async function fetchOrderActivityPage(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	await requireCurrentSession();
	const conditions = [sql`TRUE`];
	if (cursor) {
		const c = decodeCursorAs(cursor, "newest");
		conditions.push(
			sql`(osh.created_at, osh.id) < (${c.createdAt}::timestamptz, ${c.id})`
		);
	}
	const rows = await db.execute<{
		created_at: Date;
		id: string;
		order_id: string;
		order_number: string;
		to_status: OrderStatus;
	}>(sql`
		SELECT osh.id, osh.order_id, o.number AS order_number,
			osh.to_status, osh.created_at
		FROM order_status_history osh
		JOIN "order" o ON o.id = osh.order_id
		WHERE ${sql.join(conditions, sql` AND `)}
		ORDER BY osh.created_at DESC, osh.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		rows.rows,
		(r): ActivityEvent => ({
			id: r.id,
			kind: "order" as const,
			at: toDate(r.created_at),
			primary: `#${r.order_number} → ${ORDER_STATUS_LABELS[r.to_status]}`,
			href: `/dashboard/orders/${r.order_id}`,
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}
```

- [ ] **Step 2: Remover as funções movidas de `apps/web/src/app/dashboard/orders/data.ts`**

Apagar de `data.ts`: a const `PENDING_ORDER_BADGE` e as funções `fetchPendingOrdersPage` e `fetchOrderActivityPage` (foram movidas para `pending-data.ts`).

Depois, remover do bloco de imports do topo de `data.ts` o que ficou órfão: `import type { ActivityEvent } from "@/components/activity-feed";`, `import type { PendingRow } from "@/components/pending-panel";`, e `ORDER_STATUS_LABELS` do import de `./status-meta` (deixar só `ORDER_TABS`: `import { ORDER_TABS } from "./status-meta";`).

> Manter `decodeCursor`/`encodeCursor`/`BATCH_SIZE`/`getUserBranchScope`/`toDate`/`OrderStatus` — continuam usados por `fetchOrdersPage` e outras funções que ficam em `data.ts`. Não remover por engano. Após editar, o Step 4 (`check-types`) confirma se sobrou import órfão ou se algo necessário foi removido.

- [ ] **Step 3: Ajustar o import em `apps/web/src/app/dashboard/orders/actions.ts`**

Hoje `actions.ts` importa `fetchPendingOrdersPage as fetchPendingOrdersPageImpl` e `fetchOrderActivityPage as fetchOrderActivityPageImpl` de `./data`. Mover esses dois para um import de `./pending-data`:

```ts
import {
	fetchOrderActivityPage as fetchOrderActivityPageImpl,
	fetchPendingOrdersPage as fetchPendingOrdersPageImpl,
} from "./pending-data";
```

E remover `fetchOrderActivityPage`/`fetchPendingOrdersPage` da lista de imports de `./data` (manter `fetchOrdersPage as fetchOrdersPageImpl`, `type OrderListItem`, `type OrdersPageFiltersInput` — esses continuam vindo de `./data`). Os wrappers `export async function fetchPendingOrdersPage`/`fetchOrderActivityPage` em `actions.ts` não mudam.

- [ ] **Step 4: Verificar tipos**

Run: `bun check-types`
Expected: PASS. `orders/page.tsx` importa `fetchPendingOrdersPage`/`fetchOrderActivityPage` de `./actions` (wrappers) — inalterado.

- [ ] **Step 5: Lint dos arquivos tocados**

Run: `bunx biome check apps/web/src/app/dashboard/orders/pending-data.ts apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/orders/actions.ts`
Expected: sem erros (em especial, sem import órfão em `data.ts`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/orders/pending-data.ts apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/orders/actions.ts
git commit -m "refactor: orders cards em pending-data.ts com helpers"
```

---

## Task 5: `customers/pending-data.ts` + limpeza de `data.ts`/`actions.ts`

**Files:**
- Create: `apps/web/src/app/dashboard/customers/pending-data.ts`
- Modify: `apps/web/src/app/dashboard/customers/data.ts`
- Modify: `apps/web/src/app/dashboard/customers/actions.ts`

- [ ] **Step 1: Criar `apps/web/src/app/dashboard/customers/pending-data.ts`** com este conteúdo:

```ts
import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";

import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import { decodeCursorAs } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import type { RecentClientActivityKind } from "./data";

export type CustomerPendingKind =
	| "blocked"
	| "inactive_open_order"
	| "no_doc"
	| "unverified_new";

const CUSTOMER_PENDING_PREDICATE: Record<
	CustomerPendingKind,
	ReturnType<typeof sql>
> = {
	blocked: sql`c.status = 'blocked'`,
	no_doc: sql`c.document IS NULL`,
	inactive_open_order: sql`c.status = 'inactive' AND EXISTS (SELECT 1 FROM "order" o WHERE o.client_id = c.id AND o.status IN ('pending_payment', 'preparing', 'shipped'))`,
	unverified_new: sql`c.email_verified = false AND c.created_at > now() - INTERVAL '14 days'`,
};

const CUSTOMER_PENDING_BADGE: Record<
	CustomerPendingKind,
	NonNullable<PendingRow["badge"]>
> = {
	blocked: { label: "Bloqueado", role: "warning" },
	no_doc: { label: "Sem documento", role: "warning" },
	inactive_open_order: { label: "Pedido aberto", role: "info" },
	unverified_new: { label: "Sem verificação", role: "info" },
};

export const CUSTOMER_ACTIVITY_LABELS: Record<
	RecentClientActivityKind,
	string
> = {
	new_client: "Novo cadastro",
	login: "Login",
	first_order: "1ª compra",
};

export async function fetchPendingCustomersPage({
	kind,
	cursor,
}: {
	cursor: string | null;
	kind: CustomerPendingKind;
}): Promise<InfiniteResult<PendingRow>> {
	const conditions = [CUSTOMER_PENDING_PREDICATE[kind]];
	if (cursor) {
		const c = decodeCursorAs(cursor, "newest");
		conditions.push(
			sql`(c.created_at, c.id) < (${c.createdAt}::timestamptz, ${c.id})`
		);
	}
	const rows = await db.execute<{
		created_at: Date;
		document: string | null;
		email: string;
		id: string;
		name: string;
	}>(sql`
		SELECT c.id, c.name, c.email, c.document, c.created_at
		FROM client c
		WHERE ${sql.join(conditions, sql` AND `)}
		ORDER BY c.created_at DESC, c.id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		rows.rows,
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/customers/${r.id}`,
			primary: r.name,
			secondary: r.email,
			badge: CUSTOMER_PENDING_BADGE[kind],
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.created_at).toISOString(),
			id: last.id,
		})
	);
}

export async function fetchCustomerActivityPage(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	const decoded = cursor ? decodeCursorAs(cursor, "newest") : null;
	const cursorCreatedAt = decoded?.createdAt ?? null;

	const newClientsFilter = cursorCreatedAt
		? sql`AND c.created_at < ${cursorCreatedAt}::timestamptz`
		: sql``;
	const recentLoginsFilter = cursorCreatedAt
		? sql`HAVING MAX(created_at) < ${cursorCreatedAt}::timestamptz`
		: sql``;
	const firstOrdersFilter = cursorCreatedAt
		? sql`AND o.created_at < ${cursorCreatedAt}::timestamptz`
		: sql``;

	const result = await db.execute<{
		at: string;
		client_id: string;
		client_name: string;
		id: string;
		kind: RecentClientActivityKind;
	}>(sql`
		WITH new_clients AS (
			SELECT
				'new_client-' || c.id AS id,
				'new_client'::text AS kind,
				c.created_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM client c
			WHERE true ${newClientsFilter}
			ORDER BY c.created_at DESC
			LIMIT ${BATCH_SIZE + 1}
		),
		recent_logins AS (
			SELECT
				'login-' || cs.id AS id,
				'login'::text AS kind,
				max_session.last_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM (
				SELECT user_id, MAX(created_at) AS last_at
				FROM client_session
				GROUP BY user_id
				${recentLoginsFilter}
				ORDER BY last_at DESC
				LIMIT ${BATCH_SIZE + 1}
			) max_session
			JOIN client c ON c.id = max_session.user_id
			JOIN client_session cs ON cs.user_id = c.id AND cs.created_at = max_session.last_at
		),
		first_orders AS (
			SELECT
				'first_order-' || o.id AS id,
				'first_order'::text AS kind,
				o.created_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM "order" o
			JOIN client c ON c.id = o.client_id
			WHERE o.created_at = (
				SELECT MIN(o2.created_at) FROM "order" o2 WHERE o2.client_id = o.client_id
			)
			AND o.created_at > now() - INTERVAL '7 days'
			${firstOrdersFilter}
			ORDER BY o.created_at DESC
			LIMIT ${BATCH_SIZE + 1}
		)
		SELECT * FROM new_clients
		UNION ALL SELECT * FROM recent_logins
		UNION ALL SELECT * FROM first_orders
		ORDER BY at DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	return paginate(
		result.rows,
		(r): ActivityEvent => ({
			id: r.id,
			kind: "customer" as const,
			at: toDate(r.at),
			primary: `${CUSTOMER_ACTIVITY_LABELS[r.kind]} · ${r.client_name}`,
			href: `/dashboard/customers/${r.client_id}`,
		}),
		(last) => ({
			v: 1,
			sort: "newest",
			createdAt: toDate(last.at).toISOString(),
			id: last.id,
		})
	);
}
```

> Nota: o keyset da atividade de customers é timestamp-only por design — a CTE `recent_logins` filtra via `HAVING MAX(created_at) < cursor`, sem componente de `id` (UNION de 3 fontes sem id de DB comum). O campo `id` do cursor (`makeCursor` acima) é carregado mas não usado em SQL. Comportamento idêntico ao código atual; mantido de propósito (ver spec, item descartado do escopo).

- [ ] **Step 2: Remover as funções/consts movidas de `apps/web/src/app/dashboard/customers/data.ts`**

Apagar de `data.ts`: o type `CustomerPendingKind`, as consts `CUSTOMER_PENDING_PREDICATE`, `CUSTOMER_PENDING_BADGE`, `CUSTOMER_ACTIVITY_LABELS`, e as funções `fetchPendingCustomersPage` e `fetchCustomerActivityPage`.

Depois, remover do bloco de imports do topo de `data.ts` o que ficou órfão: `import type { ActivityEvent } from "@/components/activity-feed";` e `import type { PendingRow } from "@/components/pending-panel";`.

> Manter `decodeCursor`/`encodeCursor`/`BATCH_SIZE`/`InfiniteResult`/`toDate` — continuam usados por `listCustomers` e outras funções. Manter o type `RecentClientActivityKind` e a função `getRecentCustomerActivity` (não movidos; `getRecentCustomerActivity` segue exportado para quem o use). O Step 4 (`check-types`) + Step 5 (`biome`) confirmam que não sobrou import órfão.

- [ ] **Step 3: Ajustar o import em `apps/web/src/app/dashboard/customers/actions.ts`**

Hoje `actions.ts` importa `fetchPendingCustomersPage`/`fetchCustomerActivityPage` (com alias `Impl`) e o type `CustomerPendingKind` de `./data`. Mover esses para um import de `./pending-data`:

```ts
import {
	type CustomerPendingKind,
	fetchCustomerActivityPage as fetchCustomerActivityPageImpl,
	fetchPendingCustomersPage as fetchPendingCustomersPageImpl,
} from "./pending-data";
```

Remover esses três nomes do import de `./data` (manter `CustomerListItem`/`listCustomers` e o que mais já vinha de `./data`). Os wrappers `export async function fetchPendingCustomersPage`/`fetchCustomerActivityPage` em `actions.ts` (com `requireCapability("customers.read")`) não mudam.

- [ ] **Step 4: Verificar tipos**

Run: `bun check-types`
Expected: PASS. `customers/page.tsx` importa de `./actions` (wrappers) e de `./data` (`getCustomerPendingCounts`, `listCustomers`) — inalterado.

- [ ] **Step 5: Lint dos arquivos tocados**

Run: `bunx biome check apps/web/src/app/dashboard/customers/pending-data.ts apps/web/src/app/dashboard/customers/data.ts apps/web/src/app/dashboard/customers/actions.ts`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/customers/pending-data.ts apps/web/src/app/dashboard/customers/data.ts apps/web/src/app/dashboard/customers/actions.ts
git commit -m "refactor: customers cards em pending-data.ts com helpers"
```

---

## Task 6: Verificação final

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte de testes completa**

Run: `bun --cwd apps/web test`
Expected: PASS — incluindo os 2 novos arquivos (`infinite.test.ts`, `cursor.test.ts`) e os pré-existentes (`branch-scope`, `order-transitions`, `permissions`).

- [ ] **Step 2: Type-check do projeto inteiro**

Run: `bun check-types`
Expected: PASS, sem erros.

- [ ] **Step 3: Lint do escopo**

Run: `bunx biome check apps/web/src/lib/infinite.ts apps/web/src/lib/cursor.ts apps/web/src/app/dashboard/pending-data.ts apps/web/src/app/dashboard/orders/pending-data.ts apps/web/src/app/dashboard/customers/pending-data.ts apps/web/src/app/dashboard/actions.ts apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/orders/actions.ts apps/web/src/app/dashboard/customers/data.ts apps/web/src/app/dashboard/customers/actions.ts`
Expected: sem erros.

- [ ] **Step 4: Smoke (opcional, se houver dev server autenticado)**

Como é refactor sem mudança de comportamento e os testes + `check-types` cobrem a lógica, o smoke é confirmatório. Se `bun dev:web` estiver acessível e autenticado, visitar `/dashboard`, `/dashboard/orders`, `/dashboard/customers` e confirmar que os cards carregam e paginam. Caso contrário, registrar que o smoke foi pulado (sem sessão autenticada disponível).

- [ ] **Step 5: Commit (se Step 1–3 exigiram algum ajuste)**

```bash
git add -A
git commit -m "fix: ajustes da verificacao final do hardening de lazy loading"
```

---

## Self-Review (preenchido pelo autor do plano)

**Spec coverage:**
- Parte A — `paginate()`: Task 1. `decodeCursorAs()`: Task 2. ✓
- Parte B — `pending-data.ts` nas 3 rotas + `actions.ts` wrapper: Tasks 3, 4, 5. ✓
- Parte C — testes `infinite.test.ts` + `cursor.test.ts`: Tasks 1 e 2 (TDD inline). ✓
- Verificação (check-types + biome + test + smoke): Task 6 + steps por task. ✓

**Placeholder scan:** sem "TBD"/"TODO". Todo bloco de código é conteúdo final. As instruções de "remover imports órfãos" nas Tasks 4/5 são deliberadamente verificadas por `check-types`+`biome` nos steps seguintes (não é placeholder — é uma limpeza cuja correção é validável).

**Type consistency:** `paginate<TRaw,TItem>(rawRows, mapRow, makeCursor)` definido na Task 1, usado nas Tasks 3–5 com a mesma assinatura. `decodeCursorAs(raw, sort)` definido na Task 2, usado nas Tasks 3–5. `DashboardCounts` definido em `dashboard/pending-data.ts` (Task 3) e importado pelo `actions.ts` da mesma task. `PendingRow`/`ActivityEvent`/`Cursor` são os tipos canônicos já existentes. `RecentClientActivityKind` permanece em `customers/data.ts` e é importado por `customers/pending-data.ts`.

**Comportamento:** as queries SQL e os mapeamentos são copiados verbatim do código atual (já smokado); a única diferença é a substituição do bloco manual de paginação por `paginate()` e do decode-inline por `decodeCursorAs()` — equivalentes. Sem mudança de comportamento.
