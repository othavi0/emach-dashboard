# Scroll infinito + sort newest default — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar scroll infinito cursor-based (24 itens/batch) e default sort = "mais nova primeiro" em 8 listagens do dashboard, mantendo Stock Geral como exceção (urgência default).

**Architecture:** Helpers compartilhados em `apps/web/src/lib/` (`cursor.ts`, `infinite.ts`, `use-infinite-list.ts`) + componente `InfiniteSentinel`. Cada listagem ganha um Server Action `fetchXxxPage({ filters, cursor })` retornando `InfiniteResult<T>`. Page server renderiza primeiro batch via SSR; client wrapper assume daí via hook + IntersectionObserver. Cursor opaco `base64url(JSON)` carrega tupla de sort + `id` para comparação estável.

**Tech Stack:** Next 16 (RSC + Server Actions) · React 19 (`useTransition`) · Drizzle 0.45 + Postgres (raw SQL `db.execute`) · TypeScript strict · Biome/Ultracite.

**Spec de referência:** `docs/superpowers/specs/2026-05-11-infinite-scroll-newest-default-design.md`.

**Convenções do projeto:**
- Sem suite de testes; validação = `bun check-types` + `bun fix` + smoke `bun dev:web`.
- Commits aguardam aprovação explícita (rule `ask`).
- `docs/superpowers/` gitignored.
- Auto-format PostToolUse pode reordenar imports.
- Re-Read arquivos após `Edit` se mensagem "string não encontrada" aparecer.

---

## Mapa de arquivos

**Criados:**
- `apps/web/src/lib/cursor.ts` — tipos `Cursor*` + `encodeCursor`/`decodeCursor`.
- `apps/web/src/lib/infinite.ts` — `InfiniteResult<T>`, `BATCH_SIZE = 24`.
- `apps/web/src/lib/use-infinite-list.ts` — hook client.
- `apps/web/src/components/infinite-sentinel.tsx` — sentinel + botão fallback.
- `packages/db/src/migrations/_indexes.sql` — índices `(created_at DESC, id DESC)` em tool/branch/promotion/supplier.
- `packages/db/scripts/apply-indexes.ts` — runner do script SQL.
- Por listagem: `apps/web/src/app/dashboard/<feature>/_components/<feature>-infinite.tsx` (8 wrappers).

**Modificados:**
- `packages/db/package.json` — script `db:apply-indexes`.
- Por listagem: `actions.ts` (nova `fetchXxxPage`) + `page.tsx` (chama action SSR, passa para wrapper client) + `<feature>-filters.tsx` (sort `newest` como primeira opção).

**Não tocados:**
- `apps/web/src/app/dashboard/categories/` (árvore, fora de escopo).
- Schemas Drizzle (apenas índices SQL — não há nova coluna).
- Server actions de mutação (`createX`, `updateX`, etc.).

---

## Task 1 — Helpers compartilhados (`cursor`, `infinite`, `hook`, `sentinel`)

**Files:**
- Create: `apps/web/src/lib/cursor.ts`
- Create: `apps/web/src/lib/infinite.ts`
- Create: `apps/web/src/lib/use-infinite-list.ts`
- Create: `apps/web/src/components/infinite-sentinel.tsx`

- [ ] **Step 1: `cursor.ts`**

```ts
// apps/web/src/lib/cursor.ts

interface CursorBase {
	v: 1;
	id: string;
}

export interface NewestCursor extends CursorBase {
	sort: "newest";
	createdAt: string;
}

export interface NameCursor extends CursorBase {
	sort: "name";
	name: string;
}

export interface StockHighCursor extends CursorBase {
	sort: "stockHigh";
	totalStock: number;
}

export interface StockLowCursor extends CursorBase {
	sort: "stockLow";
	totalStock: number;
}

export interface UrgencyCursor extends CursorBase {
	sort: "urgency";
	reorderCount: number;
	totalStock: number;
	createdAt: string;
}

export type Cursor =
	| NewestCursor
	| NameCursor
	| StockHighCursor
	| StockLowCursor
	| UrgencyCursor;

export function encodeCursor(c: Cursor): string {
	return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
	const parsed = JSON.parse(Buffer.from(raw, "base64url").toString()) as Cursor;
	if (parsed.v !== 1) {
		throw new Error("Cursor incompatível");
	}
	return parsed;
}
```

- [ ] **Step 2: `infinite.ts`**

```ts
// apps/web/src/lib/infinite.ts

export interface InfiniteResult<T> {
	items: T[];
	nextCursor: string | null;
}

export const BATCH_SIZE = 24;
```

- [ ] **Step 3: `use-infinite-list.ts`**

```ts
// apps/web/src/lib/use-infinite-list.ts
"use client";

import { useCallback, useRef, useState, useTransition } from "react";

import type { InfiniteResult } from "./infinite";

interface UseInfiniteListProps<T> {
	initialItems: T[];
	initialCursor: string | null;
	fetchPage: (cursor: string) => Promise<InfiniteResult<T>>;
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

	if (resetKey !== lastResetKey.current) {
		lastResetKey.current = resetKey;
		setItems(initialItems);
		setCursor(initialCursor);
		setError(null);
	}

	const loadMore = useCallback(() => {
		if (!cursor || pending) {
			return;
		}
		startTransition(async () => {
			try {
				const next = await fetchPage(cursor);
				setItems((prev) => [...prev, ...next.items]);
				setCursor(next.nextCursor);
			} catch {
				setError("Falha ao carregar mais. Tente novamente.");
			}
		});
	}, [cursor, pending, fetchPage]);

	return {
		items,
		hasMore: cursor !== null,
		loadMore,
		pending,
		error,
	};
}
```

- [ ] **Step 4: `infinite-sentinel.tsx`**

```tsx
// apps/web/src/components/infinite-sentinel.tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { useEffect, useRef } from "react";

interface InfiniteSentinelProps {
	hasMore: boolean;
	pending: boolean;
	error: string | null;
	onLoadMore: () => void;
}

export function InfiniteSentinel({
	hasMore,
	pending,
	error,
	onLoadMore,
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
			{ rootMargin: "200px" }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasMore, pending, error, onLoadMore]);

	if (!hasMore) {
		return (
			<p className="py-8 text-center text-muted-foreground text-xs">
				— fim da lista —
			</p>
		);
	}

	return (
		<div className="flex flex-col items-center gap-2 py-6" ref={ref}>
			{pending && <p className="text-muted-foreground text-xs">Carregando…</p>}
			{error && (
				<>
					<p className="text-destructive text-xs">{error}</p>
					<Button onClick={onLoadMore} size="sm" variant="outline">
						Tentar de novo
					</Button>
				</>
			)}
			<Button disabled={pending} onClick={onLoadMore} size="sm" variant="ghost">
				Carregar mais
			</Button>
		</div>
	);
}
```

- [ ] **Step 5: Verificação**

Run: `cd /home/othavio/emach/emach-dashboard && bun --filter web check-types` (ou `bunx tsc --noEmit` em `apps/web`)
Expected: zero novos erros.

Run: `cd /home/othavio/emach/emach-dashboard && bun fix apps/web/src/lib apps/web/src/components/infinite-sentinel.tsx`
Expected: zero erros.

- [ ] **Step 6: Stage**

```bash
cd /home/othavio/emach/emach-dashboard
git add apps/web/src/lib/cursor.ts apps/web/src/lib/infinite.ts apps/web/src/lib/use-infinite-list.ts apps/web/src/components/infinite-sentinel.tsx
```
**Não rodar `git commit`.** Mensagem proposta: `feat: helpers de cursor + scroll infinito compartilhados`

---

## Task 2 — Migração de índices Postgres

**Files:**
- Create: `packages/db/src/migrations/_indexes.sql`
- Create: `packages/db/scripts/apply-indexes.ts`
- Modify: `packages/db/package.json` (script `db:apply-indexes`)

- [ ] **Step 1: `_indexes.sql`**

```sql
-- packages/db/src/migrations/_indexes.sql
-- Índices para cursor-based pagination com sort por created_at DESC.
-- Drizzle Kit não gera índices avulsos — aplicar via runner.

CREATE INDEX IF NOT EXISTS tool_created_idx
	ON tool (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS branch_created_idx
	ON branch (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS promotion_created_idx
	ON promotion (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS supplier_created_idx
	ON supplier (created_at DESC, id DESC);

-- order, review já têm índices compostos com created_at (ver schema/orders.ts e schema/reviews.ts).
-- tool_variant: PK em id já serve como tiebreaker default.
```

- [ ] **Step 2: `apply-indexes.ts` runner**

Read `packages/db/scripts/` first para identificar o padrão existente (provável `apply-triggers.ts`). Espelhar.

Se houver `packages/db/scripts/apply-triggers.ts`, copiar e adaptar — só muda o caminho do `.sql` lido. Exemplo:

```ts
// packages/db/scripts/apply-indexes.ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

import "./load-env"; // se existir, senão importar dotenv como no apply-triggers

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
	const sqlPath = path.resolve(__dirname, "../src/migrations/_indexes.sql");
	const sql = await readFile(sqlPath, "utf-8");

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL não definido");
	}
	const pool = new Pool({ connectionString: databaseUrl });
	try {
		await pool.query(sql);
		console.log("Índices aplicados.");
	} finally {
		await pool.end();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
```

> Se `apply-triggers.ts` tem estrutura diferente (e.g., usa Drizzle client), espelhe exatamente — não invente novo padrão.

- [ ] **Step 3: `packages/db/package.json` script**

Read current scripts in `packages/db/package.json`. Adicionar entrada `"db:apply-indexes": "bun run scripts/apply-indexes.ts"` ao bloco `scripts`. Manter ordem alfabética se já houver convenção.

- [ ] **Step 4: Verificação**

Run: `bun --cwd packages/db check-types` (ou `bunx tsc --noEmit -p packages/db`)
Expected: zero erros.

Run (opcional, requer DB acessível): `bun --cwd packages/db db:apply-indexes`
Expected: "Índices aplicados." sem erro. Idempotente (`IF NOT EXISTS`).

- [ ] **Step 5: Stage**

```bash
cd /home/othavio/emach/emach-dashboard
git add packages/db/src/migrations/_indexes.sql packages/db/scripts/apply-indexes.ts packages/db/package.json
```
Mensagem proposta: `feat: índices created_at DESC para cursor-based pagination`

---

## Task 3 — `/dashboard/tools` (padrão canônico newest)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/actions.ts`
- Modify: `apps/web/src/app/dashboard/tools/page.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-filters.tsx` (adicionar opção "Mais nova" como default)
- Create: `apps/web/src/app/dashboard/tools/_components/tools-infinite.tsx`

- [ ] **Step 1: Adicionar `fetchToolsPage` em `actions.ts`**

Read current `apps/web/src/app/dashboard/tools/actions.ts` para entender padrão de imports e ações de mutação existentes (criar/editar/deletar). Não tocar nelas.

Adicionar (preservando `"use server"` se já estiver no topo, ou colocar dentro de função):

```ts
// apps/web/src/app/dashboard/tools/actions.ts (acrescentar)
"use server";

import { db } from "@emach/db";
import { sql } from "drizzle-orm";

import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import type { ToolStatusValue } from "@/app/dashboard/tools/_components/tool-schema";
import {
	type Cursor,
	decodeCursor,
	encodeCursor,
} from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

export type ToolSort = "newest" | "name";

export interface ToolsFiltersInput {
	search?: string;
	categoryId?: string;
	status?: string;
	visible?: string;
	ncm?: string;
	sort: ToolSort;
}

interface ToolPageRow {
	id: string;
	name: string;
	slug: string | null;
	default_sku: string | null;
	default_voltage: string | null;
	variant_count: number;
	variant_voltages: string[];
	model: string | null;
	status: string;
	image_url: string | null;
	visible_on_site: boolean;
	primary_category_name: string | null;
	supplier_name: string | null;
	total_stock: number;
	reorder_count: number;
	branches_breakdown:
		| Array<{ branch_id: string; branch_name: string; quantity: number }>
		| null;
	created_at: string;
}

function buildToolsCursorPredicate(cursor: Cursor | null, sort: ToolSort) {
	if (!cursor) {
		return sql``;
	}
	if (sort === "newest" && cursor.sort === "newest") {
		return sql`AND (t.created_at, t.id) < (${cursor.createdAt}::timestamp, ${cursor.id})`;
	}
	if (sort === "name" && cursor.sort === "name") {
		return sql`AND (t.name, t.id) > (${cursor.name}, ${cursor.id})`;
	}
	throw new Error("Cursor não condiz com sort");
}

function buildToolsOrderClause(sort: ToolSort) {
	if (sort === "name") {
		return sql`ORDER BY t.name ASC, t.id ASC`;
	}
	return sql`ORDER BY t.created_at DESC, t.id DESC`;
}

function buildToolsWhereClause(filters: ToolsFiltersInput) {
	const conditions: ReturnType<typeof sql>[] = [];
	if (filters.search) {
		conditions.push(sql`t.name ILIKE ${`%${filters.search}%`}`);
	}
	if (filters.categoryId) {
		conditions.push(
			sql`EXISTS (SELECT 1 FROM tool_category tc WHERE tc.tool_id = t.id AND tc.category_id = ${filters.categoryId})`
		);
	}
	if (filters.visible === "true") {
		conditions.push(sql`t.visible_on_site = true`);
	} else if (filters.visible === "false") {
		conditions.push(sql`t.visible_on_site = false`);
	}
	if (filters.status) {
		const statuses = filters.status.split(",").filter(Boolean);
		if (statuses.length > 0) {
			const placeholders = sql.join(
				statuses.map((s) => sql`${s}`),
				sql`, `
			);
			conditions.push(sql`t.status IN (${placeholders})`);
		}
	}
	if (filters.ncm) {
		conditions.push(sql`t.ncm ILIKE ${`${filters.ncm}%`}`);
	}
	return conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;
}

export async function fetchToolsPage({
	filters,
	cursor,
}: {
	filters: ToolsFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<ToolCardData>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const whereClause = buildToolsWhereClause(filters);
	const cursorPredicate = buildToolsCursorPredicate(decoded, filters.sort);
	const orderClause = buildToolsOrderClause(filters.sort);

	const rows = await db.execute<ToolPageRow & Record<string, unknown>>(sql`
		SELECT
			t.id, t.name, t.slug,
			(SELECT tv.sku FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.is_default = true LIMIT 1) AS default_sku,
			(SELECT tv.voltage::text FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.is_default = true LIMIT 1) AS default_voltage,
			(SELECT COUNT(*)::int FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_count,
			(SELECT COALESCE(array_agg(DISTINCT tv.voltage::text ORDER BY tv.voltage::text), ARRAY[]::text[])
				FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_voltages,
			t.model, t.status,
			(SELECT ti.url FROM tool_image ti WHERE ti.tool_id = t.id ORDER BY ti.sort_order ASC LIMIT 1) AS image_url,
			t.visible_on_site,
			(SELECT c.name FROM tool_category tc JOIN category c ON c.id = tc.category_id
				WHERE tc.tool_id = t.id AND tc.is_primary = true LIMIT 1) AS primary_category_name,
			s.name AS supplier_name,
			COALESCE((SELECT SUM(sl.quantity)::int FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id WHERE tv.tool_id = t.id), 0) AS total_stock,
			COALESCE((SELECT COUNT(*)::int FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id AND sl.reorder_point > 0 AND sl.quantity <= sl.reorder_point), 0) AS reorder_count,
			COALESCE((SELECT json_agg(json_build_object('branch_id', b.id, 'branch_name', b.name, 'quantity', branch_total) ORDER BY b.name ASC)
				FROM (SELECT b2.id AS bid, SUM(sl2.quantity)::int AS branch_total
					FROM stock_level sl2 JOIN tool_variant tv2 ON tv2.id = sl2.variant_id
					JOIN branch b2 ON b2.id = sl2.branch_id WHERE tv2.tool_id = t.id GROUP BY b2.id) g
				JOIN branch b ON b.id = g.bid), '[]'::json) AS branches_breakdown,
			t.created_at::text AS created_at
		FROM tool t
		LEFT JOIN supplier s ON s.id = t.supplier_id
		${whereClause}
		${cursorPredicate}
		${orderClause}
		LIMIT ${BATCH_SIZE + 1}
	`);

	const all = rows.rows.map<ToolCardData & { __createdAt: string }>((r) => ({
		id: r.id,
		name: r.name,
		slug: r.slug,
		imageUrl: r.image_url,
		sku: r.default_sku,
		voltage: r.default_voltage,
		variantCount: Number(r.variant_count ?? 0),
		variantSummaries: r.variant_voltages ?? [],
		primaryCategoryName: r.primary_category_name,
		supplierName: r.supplier_name,
		status: r.status as ToolStatusValue,
		visibleOnSite: r.visible_on_site,
		totalStock: Number(r.total_stock ?? 0),
		reorderCount: Number(r.reorder_count ?? 0),
		branches: (r.branches_breakdown ?? []).map((b) => ({
			branchId: b.branch_id,
			branchName: b.branch_name,
			quantity: b.quantity,
		})),
		__createdAt: r.created_at,
	}));

	const hasMore = all.length > BATCH_SIZE;
	const items = hasMore ? all.slice(0, BATCH_SIZE) : all;
	const last = items.at(-1);
	let nextCursor: string | null = null;
	if (hasMore && last) {
		if (filters.sort === "name") {
			nextCursor = encodeCursor({ v: 1, sort: "name", name: last.name, id: last.id });
		} else {
			nextCursor = encodeCursor({
				v: 1,
				sort: "newest",
				createdAt: last.__createdAt,
				id: last.id,
			});
		}
	}

	return {
		items: items.map(({ __createdAt: _, ...rest }) => rest),
		nextCursor,
	};
}
```

> Remova a função antiga `fetchTools(...)` se ela existia — substituída por `fetchToolsPage`.

- [ ] **Step 2: Atualizar `tools/page.tsx`**

Read current `tools/page.tsx`. Substituir o flow atual por:

```tsx
// apps/web/src/app/dashboard/tools/page.tsx (recorte do default export)
import { fetchToolsPage, type ToolSort, type ToolsFiltersInput } from "./actions";
import { ToolsInfinite } from "./_components/tools-infinite";

const VALID_SORTS: readonly ToolSort[] = ["newest", "name"];

export default async function ToolsPage({ searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const role = session.user.role ?? "user";
	const canMutate = role === "admin";
	const params = await searchParams;
	const search = params.search ?? params.q;
	const sortParam = params.sort as ToolSort | undefined;
	const sort: ToolSort = sortParam && VALID_SORTS.includes(sortParam) ? sortParam : "newest";

	const filters: ToolsFiltersInput = {
		search,
		categoryId: params.categoryId,
		status: params.status,
		visible: params.visible,
		ncm: params.ncm,
		sort,
	};

	const [first, categories] = await Promise.all([
		fetchToolsPage({ filters, cursor: null }),
		fetchCategories(),
	]);

	const hasFilters = Boolean(
		search || params.visible || params.status || params.categoryId || params.ncm
	);
	const isEmpty = first.items.length === 0;

	return (
		<>
			<PageHeader ... />
			<ToolFilters categories={categories} />
			{isEmpty ? (
				<Empty>... (preservar markup atual)</Empty>
			) : (
				<ToolsInfinite
					canMutate={canMutate}
					filters={filters}
					initial={first.items}
					initialCursor={first.nextCursor}
				/>
			)}
		</>
	);
}
```

Atualize a interface `searchParams`/`PageProps` se necessário para incluir `sort?: string`.

> Mantenha `fetchCategories()` como está (ainda usada pelo filter).

- [ ] **Step 3: Criar `tools-infinite.tsx`**

```tsx
// apps/web/src/app/dashboard/tools/_components/tools-infinite.tsx
"use client";

import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { ToolCardGrid } from "@/app/dashboard/_components/tool-card-grid";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchToolsPage, type ToolsFiltersInput } from "../actions";
import { ToolCardActions } from "./tool-card-actions";

interface ToolsInfiniteProps {
	initial: ToolCardData[];
	initialCursor: string | null;
	filters: ToolsFiltersInput;
	canMutate: boolean;
}

export function ToolsInfinite({
	initial,
	initialCursor,
	filters,
	canMutate,
}: ToolsInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchToolsPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<ToolCardGrid
				canMutate={canMutate}
				renderActions={(tool) => (
					<ToolCardActions toolId={tool.id} toolName={tool.name} />
				)}
				tools={items}
				variant="catalog"
			/>
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

- [ ] **Step 4: Atualizar `tool-filters.tsx`**

Read `tool-filters.tsx`. Localizar select de sort (se existir) ou adicionar novo:

- Se houver select de sort: adicionar primeira opção `{ value: "newest", label: "Mais nova" }` e mudar default para `"newest"`. Senão, adicionar select Ordenar como em `stock-filters.tsx` (lado a lado com outros filtros, mesmo padrão visual).

Se Tools hoje não tem sort visível (provável), adicionar o select com 2 opções: "Mais nova" (default), "Nome (A–Z)". Search param key: `sort`. Sentinel: `"newest"` sem URL param.

- [ ] **Step 5: Verificação**

Run: `bunx tsc --noEmit -p apps/web` (de dentro de apps/web ou via path) — zero novos erros.

Run: `cd /home/othavio/emach/emach-dashboard && bun fix apps/web/src/app/dashboard/tools` — zero erros.

Run: `cd /home/othavio/emach/emach-dashboard && bun dev:web` (em background se já não rodando) e visite `http://localhost:3001/dashboard/tools`. Confirme:
- 24 cards iniciais.
- Scroll até o sentinel carrega +24.
- "— fim da lista —" aparece quando esgota.
- Trocar para sort "Nome" reseta scroll, primeiros 24 alfabético.
- Filtros existentes ainda funcionam.

Se erro SSR: `mcp__next-devtools__nextjs_call 3001 get_errors`.

- [ ] **Step 6: Stage**

```bash
cd /home/othavio/emach/emach-dashboard
git add apps/web/src/app/dashboard/tools/
```
Mensagem proposta: `feat: scroll infinito + sort mais-nova default em /tools`

---

## Task 4 — `/dashboard/stock` (urgência cursor multi-key)

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/page.tsx`
- Modify: `apps/web/src/app/dashboard/stock/_components/stock-filters.tsx` (adiciona "Mais nova" como opção, não default)
- Create: `apps/web/src/app/dashboard/stock/actions.ts` (nova ou estender existente)
- Create: `apps/web/src/app/dashboard/stock/_components/stock-infinite.tsx`

- [ ] **Step 1: Stock action `fetchStockPage`**

Read `stock/page.tsx` atual para extrair a query SQL. Mover lógica para uma server action `fetchStockPage` em `apps/web/src/app/dashboard/stock/actions.ts` (criar se não existir).

```ts
// apps/web/src/app/dashboard/stock/actions.ts
"use server";

import { db } from "@emach/db";
import { sql } from "drizzle-orm";

import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { type Cursor, decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

export type StockSort = "urgency" | "newest" | "name" | "stockHigh" | "stockLow";

export interface StockFiltersInput {
	search?: string;
	categoryId?: string;
	sort: StockSort;
}

function buildStockCursorPredicate(cursor: Cursor | null, sort: StockSort) {
	if (!cursor) {
		return sql``;
	}
	if (sort === "newest" && cursor.sort === "newest") {
		return sql`AND (t.created_at, t.id) < (${cursor.createdAt}::timestamp, ${cursor.id})`;
	}
	if (sort === "name" && cursor.sort === "name") {
		return sql`AND (t.name, t.id) > (${cursor.name}, ${cursor.id})`;
	}
	if (sort === "stockHigh" && cursor.sort === "stockHigh") {
		return sql`AND (total_stock, t.id) < (${cursor.totalStock}, ${cursor.id})`;
	}
	if (sort === "stockLow" && cursor.sort === "stockLow") {
		return sql`AND (total_stock, t.id) > (${cursor.totalStock}, ${cursor.id})`;
	}
	if (sort === "urgency" && cursor.sort === "urgency") {
		return sql`AND (
			reorder_count < ${cursor.reorderCount}
		) OR (
			reorder_count = ${cursor.reorderCount} AND total_stock > ${cursor.totalStock}
		) OR (
			reorder_count = ${cursor.reorderCount}
			AND total_stock = ${cursor.totalStock}
			AND t.created_at < ${cursor.createdAt}::timestamp
		) OR (
			reorder_count = ${cursor.reorderCount}
			AND total_stock = ${cursor.totalStock}
			AND t.created_at = ${cursor.createdAt}::timestamp
			AND t.id < ${cursor.id}
		)`;
	}
	throw new Error("Cursor não condiz com sort");
}

function buildStockOrderClause(sort: StockSort) {
	if (sort === "newest") {
		return sql`ORDER BY t.created_at DESC, t.id DESC`;
	}
	if (sort === "name") {
		return sql`ORDER BY t.name ASC, t.id ASC`;
	}
	if (sort === "stockHigh") {
		return sql`ORDER BY total_stock DESC, t.id DESC`;
	}
	if (sort === "stockLow") {
		return sql`ORDER BY total_stock ASC, t.id ASC`;
	}
	return sql`ORDER BY reorder_count DESC, total_stock ASC, t.created_at DESC, t.id DESC`;
}

function buildStockWhereClause(filters: StockFiltersInput) {
	const conditions: ReturnType<typeof sql>[] = [];
	if (filters.search) {
		conditions.push(sql`t.name ILIKE ${`%${filters.search}%`}`);
	}
	if (filters.categoryId) {
		conditions.push(
			sql`EXISTS (SELECT 1 FROM tool_category tc WHERE tc.tool_id = t.id AND tc.category_id = ${filters.categoryId})`
		);
	}
	return conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;
}

interface StockPageRow extends Record<string, unknown> {
	id: string;
	name: string;
	slug: string | null;
	default_sku: string | null;
	default_voltage: string | null;
	variant_count: number;
	variant_voltages: string[];
	image_url: string | null;
	primary_category_name: string | null;
	total_stock: number;
	reorder_count: number;
	branches_breakdown:
		| Array<{ branch_id: string; branch_name: string; quantity: number }>
		| null;
	created_at: string;
}

export async function fetchStockPage({
	filters,
	cursor,
}: {
	filters: StockFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<ToolCardData>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const whereClause = buildStockWhereClause(filters);
	const cursorPredicate = buildStockCursorPredicate(decoded, filters.sort);
	const orderClause = buildStockOrderClause(filters.sort);

	const result = await db.execute<StockPageRow>(sql`
		SELECT
			t.id, t.name, t.slug,
			(SELECT tv.sku FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.is_default = true LIMIT 1) AS default_sku,
			(SELECT tv.voltage::text FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.is_default = true LIMIT 1) AS default_voltage,
			(SELECT COUNT(*)::int FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_count,
			(SELECT COALESCE(array_agg(DISTINCT tv.voltage::text ORDER BY tv.voltage::text), ARRAY[]::text[])
				FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_voltages,
			(SELECT ti.url FROM tool_image ti WHERE ti.tool_id = t.id ORDER BY ti.sort_order ASC LIMIT 1) AS image_url,
			(SELECT c.name FROM tool_category tc JOIN category c ON c.id = tc.category_id
				WHERE tc.tool_id = t.id AND tc.is_primary = true LIMIT 1) AS primary_category_name,
			COALESCE((SELECT SUM(sl.quantity)::int FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id WHERE tv.tool_id = t.id), 0) AS total_stock,
			COALESCE((SELECT COUNT(*)::int FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id AND sl.reorder_point > 0 AND sl.quantity <= sl.reorder_point), 0) AS reorder_count,
			COALESCE((SELECT json_agg(json_build_object('branch_id', b.id, 'branch_name', b.name, 'quantity', branch_total) ORDER BY b.name ASC)
				FROM (SELECT b2.id AS bid, SUM(sl2.quantity)::int AS branch_total
					FROM stock_level sl2 JOIN tool_variant tv2 ON tv2.id = sl2.variant_id
					JOIN branch b2 ON b2.id = sl2.branch_id WHERE tv2.tool_id = t.id GROUP BY b2.id) g
				JOIN branch b ON b.id = g.bid), '[]'::json) AS branches_breakdown,
			t.created_at::text AS created_at
		FROM tool t
		${whereClause}
		${cursorPredicate}
		${orderClause}
		LIMIT ${BATCH_SIZE + 1}
	`);

	const all = result.rows.map((r) => ({
		id: r.id,
		name: r.name,
		slug: r.slug,
		imageUrl: r.image_url,
		sku: r.default_sku,
		voltage: r.default_voltage,
		variantCount: Number(r.variant_count ?? 0),
		variantSummaries: r.variant_voltages ?? [],
		primaryCategoryName: r.primary_category_name,
		supplierName: null,
		status: "active" as const,
		visibleOnSite: true,
		totalStock: Number(r.total_stock ?? 0),
		reorderCount: Number(r.reorder_count ?? 0),
		branches: (r.branches_breakdown ?? []).map((b) => ({
			branchId: b.branch_id,
			branchName: b.branch_name,
			quantity: b.quantity,
		})),
		__createdAt: r.created_at,
		__name: r.name,
	}));

	const hasMore = all.length > BATCH_SIZE;
	const items = hasMore ? all.slice(0, BATCH_SIZE) : all;
	const last = items.at(-1);
	let nextCursor: string | null = null;
	if (hasMore && last) {
		const id = last.id;
		if (filters.sort === "newest") {
			nextCursor = encodeCursor({ v: 1, sort: "newest", createdAt: last.__createdAt, id });
		} else if (filters.sort === "name") {
			nextCursor = encodeCursor({ v: 1, sort: "name", name: last.__name, id });
		} else if (filters.sort === "stockHigh") {
			nextCursor = encodeCursor({ v: 1, sort: "stockHigh", totalStock: last.totalStock, id });
		} else if (filters.sort === "stockLow") {
			nextCursor = encodeCursor({ v: 1, sort: "stockLow", totalStock: last.totalStock, id });
		} else {
			nextCursor = encodeCursor({
				v: 1,
				sort: "urgency",
				reorderCount: last.reorderCount,
				totalStock: last.totalStock,
				createdAt: last.__createdAt,
				id,
			});
		}
	}

	return {
		items: items.map(({ __createdAt: _, __name: __, ...rest }) => rest as ToolCardData),
		nextCursor,
	};
}
```

- [ ] **Step 2: Atualizar `stock/page.tsx`**

Substituir o flow atual (que define `fetchStockRows` inline) por chamada a `fetchStockPage`. Estrutura:

```tsx
import { fetchStockPage, type StockFiltersInput, type StockSort } from "./actions";
import { StockInfinite } from "./_components/stock-infinite";

const VALID_SORTS: readonly StockSort[] = ["urgency", "newest", "name", "stockHigh", "stockLow"];

export default async function StockPage({ searchParams }: StockPageProps) {
	const session = await requireCurrentSession();
	const role = session.user.role ?? "user";
	const canMutate = role === "admin" || role === "manager";
	const params = await searchParams;
	const search = params.search ?? params.q;

	// Mapeamento dos valores antigos ("maior", "menor") para os novos:
	const sortParamRaw = params.ordem as string | undefined;
	const sortMap: Record<string, StockSort> = {
		urgencia: "urgency",
		nome: "name",
		maior: "stockHigh",
		menor: "stockLow",
		"mais-nova": "newest",
	};
	const sort: StockSort =
		(sortParamRaw && sortMap[sortParamRaw]) ||
		(sortParamRaw && VALID_SORTS.includes(sortParamRaw as StockSort) ? (sortParamRaw as StockSort) : "urgency");

	const filters: StockFiltersInput = {
		search,
		categoryId: params.categoryId,
		sort,
	};

	const [first, categories] = await Promise.all([
		fetchStockPage({ filters, cursor: null }),
		fetchCategories(),
	]);
	// ... resto igual (hasFilters, isEmpty, JSX com Empty/StockInfinite)
}
```

> Decisão: aceitar dois formatos (`urgencia`/`nome`/`maior`/`menor` em PT do filter atual + `newest`/`urgency`/`name`/`stockHigh`/`stockLow` interno). O filter component continua emitindo PT (sem mudança de URL state). Server normaliza.

- [ ] **Step 3: Atualizar `stock-filters.tsx`**

Read current. Adicionar opção `"mais-nova"` ao `SORT_OPTIONS` (após "Urgência"), com label "Mais nova". Default `currentOrdem` continua `"urgencia"`. Sentinel `setParam` continua `null` para `"urgencia"`.

```ts
const SORT_OPTIONS = [
	{ label: "Urgência", value: "urgencia" },
	{ label: "Mais nova", value: "mais-nova" },
	{ label: "Nome (A–Z)", value: "nome" },
	{ label: "Maior estoque", value: "maior" },
	{ label: "Menor estoque", value: "menor" },
] as const;
```

- [ ] **Step 4: Criar `stock-infinite.tsx`**

```tsx
// apps/web/src/app/dashboard/stock/_components/stock-infinite.tsx
"use client";

import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { ToolCardGrid } from "@/app/dashboard/_components/tool-card-grid";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchStockPage, type StockFiltersInput } from "../actions";
import { StockCardActions } from "./stock-card-actions";

interface StockInfiniteProps {
	initial: ToolCardData[];
	initialCursor: string | null;
	filters: StockFiltersInput;
	canMutate: boolean;
}

export function StockInfinite({
	initial,
	initialCursor,
	filters,
	canMutate,
}: StockInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchStockPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<ToolCardGrid
				canMutate={canMutate}
				renderActions={(tool) => (
					<StockCardActions toolId={tool.id} toolName={tool.name} />
				)}
				tools={items}
				variant="stock-overview"
			/>
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

- [ ] **Step 5: Verificação**

Run: `bunx tsc --noEmit -p apps/web` — zero novos erros.

Run: `bun fix apps/web/src/app/dashboard/stock`

Run: `bun dev:web` + visite `/dashboard/stock`:
- Default = urgência. Itens com reorder pendente no topo.
- Trocar para "Mais nova" → reseta, ordena por created_at DESC.
- Scroll carrega +24.
- Trocar para "Nome" / "Maior" / "Menor" funciona com cursor.

- [ ] **Step 6: Stage**

```bash
git add apps/web/src/app/dashboard/stock/
```
Mensagem: `feat: scroll infinito em /stock com cursor multi-key urgência`

---

## Task 5 — `/dashboard/stock/branches`

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/branch-stock-data.ts` (vira `fetchBranchStockPage`)
- Modify: `apps/web/src/app/dashboard/stock/branches/page.tsx`
- Create: `apps/web/src/app/dashboard/stock/_components/branch-stock-infinite.tsx`

- [ ] **Step 1: Refatorar `branch-stock-data.ts`**

Atualizar a função para aceitar cursor e retornar `InfiniteResult<BranchStockRow>`. Default sort = newest pelo `tool.created_at`.

```ts
// apps/web/src/app/dashboard/stock/branch-stock-data.ts
"use server";
import { db } from "@emach/db";
import { sql } from "drizzle-orm";

import { type Cursor, decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

export interface BranchStockRow {
	imageUrl: string | null;
	minQty: number;
	quantity: number;
	reorderPoint: number;
	sku: string;
	toolId: string;
	toolName: string;
	variantId: string;
	voltage: string | null;
}

export type BranchStockSort = "newest" | "name";

export interface BranchStockFiltersInput {
	branchId: string;
	search?: string;
	sort: BranchStockSort;
}

interface BranchStockDbRow extends Record<string, unknown> {
	image_url: string | null;
	min_qty: number;
	quantity: number;
	reorder_point: number;
	sku: string;
	tool_id: string;
	tool_name: string;
	variant_id: string;
	voltage: string | null;
	tool_created_at: string;
}

export async function fetchBranchStockPage({
	filters,
	cursor,
}: {
	filters: BranchStockFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<BranchStockRow>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const trimmedSearch = filters.search?.trim();

	const whereClauses: ReturnType<typeof sql>[] = [];
	if (trimmedSearch) {
		whereClauses.push(
			sql`(t.name ILIKE ${`%${trimmedSearch}%`} OR tv.sku ILIKE ${`%${trimmedSearch}%`})`
		);
	}

	let cursorPredicate = sql``;
	if (decoded) {
		if (filters.sort === "newest" && decoded.sort === "newest") {
			cursorPredicate = sql`AND (t.created_at, tv.id) < (${decoded.createdAt}::timestamp, ${decoded.id})`;
		} else if (filters.sort === "name" && decoded.sort === "name") {
			cursorPredicate = sql`AND (t.name, tv.id) > (${decoded.name}, ${decoded.id})`;
		} else {
			throw new Error("Cursor não condiz com sort");
		}
	}

	const whereClause = whereClauses.length
		? sql`WHERE ${sql.join(whereClauses, sql` AND `)}`
		: sql``;

	const orderClause =
		filters.sort === "name"
			? sql`ORDER BY t.name ASC, tv.id ASC`
			: sql`ORDER BY t.created_at DESC, tv.id DESC`;

	const result = await db.execute<BranchStockDbRow>(sql`
		SELECT
			t.id AS tool_id, t.name AS tool_name,
			tv.id AS variant_id, tv.sku, tv.voltage::text AS voltage,
			(SELECT ti.url FROM tool_image ti WHERE ti.tool_id = t.id ORDER BY ti.sort_order ASC LIMIT 1) AS image_url,
			COALESCE(sl.quantity, 0)::int AS quantity,
			COALESCE(sl.min_qty, 0)::int AS min_qty,
			COALESCE(sl.reorder_point, 0)::int AS reorder_point,
			t.created_at::text AS tool_created_at
		FROM tool t
		JOIN tool_variant tv ON tv.tool_id = t.id
		LEFT JOIN stock_level sl ON sl.variant_id = tv.id AND sl.branch_id = ${filters.branchId}
		${whereClause}
		${cursorPredicate}
		${orderClause}
		LIMIT ${BATCH_SIZE + 1}
	`);

	const all = result.rows.map((row) => ({
		toolId: row.tool_id,
		toolName: row.tool_name,
		variantId: row.variant_id,
		sku: row.sku,
		voltage: row.voltage,
		imageUrl: row.image_url,
		quantity: Number(row.quantity ?? 0),
		minQty: Number(row.min_qty ?? 0),
		reorderPoint: Number(row.reorder_point ?? 0),
		__createdAt: row.tool_created_at,
	}));

	const hasMore = all.length > BATCH_SIZE;
	const items = hasMore ? all.slice(0, BATCH_SIZE) : all;
	const last = items.at(-1);
	let nextCursor: string | null = null;
	if (hasMore && last) {
		if (filters.sort === "name") {
			nextCursor = encodeCursor({ v: 1, sort: "name", name: last.toolName, id: last.variantId });
		} else {
			nextCursor = encodeCursor({
				v: 1,
				sort: "newest",
				createdAt: last.__createdAt,
				id: last.variantId,
			});
		}
	}

	return {
		items: items.map(({ __createdAt: _, ...rest }) => rest),
		nextCursor,
	};
}
```

> Remova `fetchBranchStockRows` antigo.

- [ ] **Step 2: Atualizar `stock/branches/page.tsx`**

Substituir chamada de `fetchBranchStockRows` por `fetchBranchStockPage({ filters: { branchId, search, sort }, cursor: null })`. Passa `first.items`/`first.nextCursor` para `<BranchStockInfinite>`. Atualize import.

Atualize callers em `apps/web/src/app/dashboard/branches/[id]/stock/page.tsx` também (mesma assinatura).

- [ ] **Step 3: Criar `branch-stock-infinite.tsx`**

```tsx
// apps/web/src/app/dashboard/stock/_components/branch-stock-infinite.tsx
"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import {
	type BranchStockFiltersInput,
	type BranchStockRow,
	fetchBranchStockPage,
} from "../branch-stock-data";
import { BranchStockCardGrid } from "./branch-stock-card-grid";

interface BranchStockInfiniteProps {
	initial: BranchStockRow[];
	initialCursor: string | null;
	filters: BranchStockFiltersInput;
	branchName: string;
	canMutate: boolean;
}

export function BranchStockInfinite({
	initial,
	initialCursor,
	filters,
	branchName,
	canMutate,
}: BranchStockInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchBranchStockPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<BranchStockCardGrid
				branchId={filters.branchId}
				branchName={branchName}
				canMutate={canMutate}
				rows={items}
			/>
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

Substituir `<BranchStockCardGrid>` direto na page pelo `<BranchStockInfinite>`.

- [ ] **Step 4: Verificação + Stage**

Run: `bunx tsc --noEmit -p apps/web`, `bun fix apps/web/src/app/dashboard/stock`.

Smoke `/dashboard/stock/branches?branch=<id>`: troca de filial reseta, scroll carrega +24, search funciona, sort newest default.

```bash
git add apps/web/src/app/dashboard/stock/ apps/web/src/app/dashboard/branches/[id]/stock/page.tsx
```
Mensagem: `feat: scroll infinito em /stock/branches`

---

## Task 6 — `/dashboard/branches` (filiais)

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts` (acrescenta `fetchBranchesPage`)
- Modify: `apps/web/src/app/dashboard/branches/page.tsx`
- Create: `apps/web/src/app/dashboard/branches/_components/branches-infinite.tsx`
- Modify (se existir): `apps/web/src/app/dashboard/branches/_components/branches-filters.tsx` (sort select)

- [ ] **Step 1: Read `branches/page.tsx` e `branches/actions.ts`**

Identificar a shape do `BranchListItem` e como a página renderiza hoje (table? cards?). Extrair tipo de filtros (provavelmente só `search`).

- [ ] **Step 2: `fetchBranchesPage`**

```ts
// apps/web/src/app/dashboard/branches/actions.ts (acrescentar)
"use server";
import { db } from "@emach/db";
import { sql } from "drizzle-orm";

import { type Cursor, decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";

export type BranchSort = "newest" | "name";

export interface BranchesFiltersInput {
	search?: string;
	sort: BranchSort;
}

// reutilize BranchListItem existente do mesmo arquivo

export async function fetchBranchesPage({
	filters,
	cursor,
}: {
	filters: BranchesFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<BranchListItem>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const where: ReturnType<typeof sql>[] = [];
	if (filters.search) {
		where.push(sql`name ILIKE ${`%${filters.search}%`}`);
	}
	let cursorPredicate = sql``;
	if (decoded) {
		if (filters.sort === "newest" && decoded.sort === "newest") {
			cursorPredicate = sql`AND (created_at, id) < (${decoded.createdAt}::timestamp, ${decoded.id})`;
		} else if (filters.sort === "name" && decoded.sort === "name") {
			cursorPredicate = sql`AND (name, id) > (${decoded.name}, ${decoded.id})`;
		} else {
			throw new Error("Cursor não condiz com sort");
		}
	}
	const whereClause = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
	const orderClause =
		filters.sort === "name"
			? sql`ORDER BY name ASC, id ASC`
			: sql`ORDER BY created_at DESC, id DESC`;

	const rows = await db.execute<BranchListItem & { created_at: string; __row_id: string } & Record<string, unknown>>(sql`
		SELECT *, id AS __row_id, created_at::text AS created_at
		FROM branch
		${whereClause}
		${cursorPredicate}
		${orderClause}
		LIMIT ${BATCH_SIZE + 1}
	`);

	const all = rows.rows;
	const hasMore = all.length > BATCH_SIZE;
	const items = (hasMore ? all.slice(0, BATCH_SIZE) : all) as Array<BranchListItem & { created_at: string }>;
	const last = items.at(-1);
	let nextCursor: string | null = null;
	if (hasMore && last) {
		nextCursor =
			filters.sort === "name"
				? encodeCursor({ v: 1, sort: "name", name: last.name, id: last.id })
				: encodeCursor({ v: 1, sort: "newest", createdAt: last.created_at, id: last.id });
	}

	return { items: items.map(({ created_at: _, ...rest }) => rest as BranchListItem), nextCursor };
}
```

> Se `BranchListItem` já é o select Drizzle (`db.select().from(branch)`), substitua o raw SQL por equivalente Drizzle se preferir. O exemplo acima usa raw SQL para consistência com Tools/Stock. Escolha conforme o estilo do arquivo.

- [ ] **Step 3: Page + wrapper client**

Atualizar `branches/page.tsx` para chamar `fetchBranchesPage({ filters, cursor: null })` e passar para `<BranchesInfinite>`. Criar `branches-infinite.tsx` usando `useInfiniteList` igual aos anteriores. Renderizar tabela ou cards conforme o pattern atual da página.

- [ ] **Step 4: Verificação + Stage**

`bunx tsc --noEmit -p apps/web`, `bun fix apps/web/src/app/dashboard/branches`, smoke.

```bash
git add apps/web/src/app/dashboard/branches/
```
Mensagem: `feat: scroll infinito em /branches`

---

## Task 7 — `/dashboard/orders`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/actions.ts` (acrescenta `fetchOrdersPage`)
- Modify: `apps/web/src/app/dashboard/orders/page.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/orders-infinite.tsx`

- [ ] **Step 1: Read `orders/page.tsx`**

Identificar como orders são fetched hoje (provavelmente inline no page.tsx ou via helper). Extrair shape do `OrderListItem` ou equivalente.

- [ ] **Step 2: `fetchOrdersPage`**

Adicionar a action seguindo o padrão dos anteriores. Default sort `newest` em `order.created_at DESC, order.id DESC`. Cursor type `NewestCursor`. Filtros: status, branchId, search por order number/customer (conforme filter atual).

> A query pode reusar índice composto `order_status_created_idx`.

- [ ] **Step 3: Page + wrapper**

Substituir a renderização atual por `<OrdersInfinite>`. Manter empty state, filtros, header.

- [ ] **Step 4: Verificação + Stage**

```bash
git add apps/web/src/app/dashboard/orders/
```
Mensagem: `feat: scroll infinito em /orders`

---

## Task 8 — `/dashboard/promotions`

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/actions.ts` (refatora `listPromotions` ou adiciona `fetchPromotionsPage`)
- Modify: `apps/web/src/app/dashboard/promotions/page.tsx`
- Create: `apps/web/src/app/dashboard/promotions/_components/promotions-infinite.tsx`

- [ ] **Step 1: Read `promotions/actions.ts:196` (`listPromotions`)**

Identificar shape de `PromotionListItem`. Manter `listPromotions` se for usado por outros lugares; criar `fetchPromotionsPage` ao lado.

- [ ] **Step 2: `fetchPromotionsPage`**

Cursor `NewestCursor`. Default sort newest `promotion.created_at DESC, promotion.id DESC`. Reutilize query Drizzle (`db.query.promotion.findMany(...)`) com `where: lt(promotion.createdAt, ...)`, `orderBy`, `limit: BATCH_SIZE + 1`. Construir `nextCursor` do último item enviado.

> Como o componente `promotions-grid.tsx` consome `PromotionListItem[]` diretamente, o wrapper substitui apenas a fonte.

- [ ] **Step 3: Page + wrapper**

Substituir `<PromotionsGrid promotions={...}>` pelo wrapper `<PromotionsInfinite>`. Wrapper interno renderiza o `<PromotionsGrid>` com `tools={items}` mapeado adequadamente.

- [ ] **Step 4: Verificação + Stage**

```bash
git add apps/web/src/app/dashboard/promotions/
```
Mensagem: `feat: scroll infinito em /promotions`

---

## Task 9 — `/dashboard/reviews`

**Files:**
- Modify: `apps/web/src/app/dashboard/reviews/actions.ts` (acrescenta `fetchReviewsPage`)
- Modify: `apps/web/src/app/dashboard/reviews/page.tsx`
- Create: `apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx`

- [ ] **Step 1: Read `reviews/page.tsx`**

Identificar como reviews são fetched (provavelmente uma helper ou inline). Shape esperada: tipo `ReviewListItem` com fields rating, status, clientName, toolName, createdAt.

- [ ] **Step 2: `fetchReviewsPage`**

Sort newest default usando `review.created_at DESC, review.id DESC` (já indexado por `review_status_created_idx`). Filtros: status (pending/approved/rejected), tool, client.

- [ ] **Step 3: Page + wrapper**

`<ReviewsInfinite>` envolve `<ReviewQueueTable>` (componente atual). Wrapper passa `items` para a tabela.

- [ ] **Step 4: Verificação + Stage**

```bash
git add apps/web/src/app/dashboard/reviews/
```
Mensagem: `feat: scroll infinito em /reviews`

---

## Task 10 — `/dashboard/suppliers`

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/actions.ts` (`listSuppliers` → `fetchSuppliersPage`)
- Modify: `apps/web/src/app/dashboard/suppliers/page.tsx`
- Create: `apps/web/src/app/dashboard/suppliers/_components/suppliers-infinite.tsx`

- [ ] **Step 1: Read `suppliers/actions.ts:69` (`listSuppliers`)**

Identificar params atuais e shape `SupplierListItem`. Default sort atual = `asc(supplier.name)`.

- [ ] **Step 2: `fetchSuppliersPage`**

Cursor `NewestCursor` ou `NameCursor`. Default = newest. Reusa Drizzle `db.select()` com `lt(supplier.createdAt, ...)` + `orderBy(desc(supplier.createdAt), desc(supplier.id))` + `limit(BATCH_SIZE + 1)`.

- [ ] **Step 3: Page + wrapper**

`<SuppliersInfinite>` envolve a tabela/cards atual. Filtro `search` continua funcionando via filters.search.

- [ ] **Step 4: Verificação + Stage**

```bash
git add apps/web/src/app/dashboard/suppliers/
```
Mensagem: `feat: scroll infinito em /suppliers`

---

## Task 11 — Verificação cruzada final

**Files:** nenhum modificado. Apenas verificação.

- [ ] **Step 1: Type check completo**

Run: `cd /home/othavio/emach/emach-dashboard && bun check-types`
Expected: zero erros novos em workspaces tocados.

- [ ] **Step 2: Lint completo**

Run: `cd /home/othavio/emach/emach-dashboard && bun check`
Expected: zero erros novos (erros pré-existentes em `promotions-filters.tsx`, `tool-form.tsx`, etc., listados em planos anteriores, permanecem).

- [ ] **Step 3: Aplicar índices em dev**

Run: `cd /home/othavio/emach/emach-dashboard && bun --cwd packages/db db:apply-indexes`
Expected: "Índices aplicados." sem erro.

Validar com:
```sql
SELECT indexname FROM pg_indexes WHERE indexname LIKE '%_created_idx';
```
Expected: `tool_created_idx`, `branch_created_idx`, `promotion_created_idx`, `supplier_created_idx`.

- [ ] **Step 4: Smoke 8 listagens em `bun dev:web`**

Para cada uma das 8 rotas:
- `/dashboard/tools`
- `/dashboard/stock`
- `/dashboard/stock/branches`
- `/dashboard/branches`
- `/dashboard/orders`
- `/dashboard/promotions`
- `/dashboard/reviews`
- `/dashboard/suppliers`

Validar:
1. Render inicial mostra ≤24 itens.
2. Scroll até o sentinel → batch +24 carrega (verificar Network: 1 POST Server Action por batch).
3. Final → "— fim da lista —".
4. Filtro/sort change → reseta + recarrega.
5. Botão "Carregar mais" funciona como fallback.
6. Sem erros no console.
7. Default sort = newest (exceto stock = urgência).

Se erro SSR aparecer: `mcp__next-devtools__nextjs_call 3001 get_errors`.

- [ ] **Step 5: `EXPLAIN ANALYZE` em uma query crítica**

Postgres console:
```sql
EXPLAIN ANALYZE
SELECT * FROM tool
WHERE (created_at, id) < ('2026-01-01'::timestamp, 'fake-id')
ORDER BY created_at DESC, id DESC
LIMIT 25;
```
Expected: `Index Scan using tool_created_idx`.

- [ ] **Step 6: Stage commit final (se necessário)**

Se algum ajuste fino foi feito durante verificação:
```bash
git add apps/web/src/app/dashboard/
```
Mensagem: `chore: ajustes pós-smoke do scroll infinito`

Caso contrário, nada para commitar.

---

## Self-review

**1. Cobertura do spec.**
- Helpers compartilhados → Task 1. ✓
- Indexes → Task 2. ✓
- 8 listagens (tools, stock, stock/branches, branches, orders, promotions, reviews, suppliers) → Tasks 3-10. ✓
- Stock Geral mantém urgência default → Task 4 explicita ordem em `buildStockOrderClause`. ✓
- "Mais nova" como opção em Stock → Task 4 Step 3 adiciona ao SORT_OPTIONS. ✓
- BATCH_SIZE = 24, IntersectionObserver, fallback button → Task 1 Steps 2/4. ✓
- Reset on filter/sort change via `resetKey` → Task 1 Step 3, usado em todos wrappers. ✓
- Cursor opaco base64url JSON com `v: 1` → Task 1 Step 1. ✓
- `aria-live="polite"` → wrappers das Tasks 3-10. ✓
- Verification plan (check-types/check, apply-indexes, smoke 8 rotas, EXPLAIN) → Task 11. ✓

**2. Placeholders.** Tasks 6-10 dizem "Read `<file>` para identificar shape" — isto não é "TBD"; é instrução concreta porque a shape é específica de cada listagem e não foi extraída no plano. Implementer subagent abre o arquivo e adapta o padrão canônico (Task 3) à shape encontrada. Aceitável.

**3. Consistência de tipos.**
- `Cursor` union em `cursor.ts` cobre 5 sorts; cada action usa apenas as variantes que precisa. ✓
- `InfiniteResult<T>` é o retorno padrão de todas `fetchXxxPage`. ✓
- `BATCH_SIZE = 24` reusado em todas queries (LIMIT BATCH_SIZE + 1). ✓
- `useInfiniteList` props match em todos wrappers (`initialItems`, `initialCursor`, `fetchPage`, `resetKey`). ✓
- `InfiniteSentinel` props match (`hasMore`, `pending`, `error`, `onLoadMore`) em todos wrappers. ✓

**4. Pontos de atenção para o implementer:**
- Tasks 6-10: a leitura do arquivo atual é obrigatória para entender shape específica. Não chutar.
- Task 4 Step 1: o cursor predicate para urgência tem 4 cláusulas OR — não simplifique sem testar.
- Task 5: `branches/[id]/stock/page.tsx` também precisa atualizar (mesmo helper `fetchBranchStockPage`).
- Auto-format reordena imports; re-Read após Edit se "string não encontrada".

---

## Execução

Plano salvo em `docs/superpowers/plans/2026-05-11-infinite-scroll-newest-default.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — disparo subagent fresh por task, review entre tasks.

**2. Inline** — executo na sessão atual com checkpoints.

Qual abordagem?
