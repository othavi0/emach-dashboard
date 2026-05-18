# Cards Pendências + Atividade — Lazy Loading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o par de cards Pendências + Atividade em `/dashboard` e `/dashboard/orders` em painéis com altura limitada, scroll interno e lazy loading cursor-based; Pendências deixa de ser contador e vira painel com abas listando itens reais.

**Architecture:** Reusar a infra de lazy loading existente (`useInfiniteList` + `InfiniteSentinel` + cursores base64). `InfiniteSentinel` ganha prop `root` para observar scroll interno ao card. Pendências vira `PendingPanel` (client, com abas/segment control — uma lista rolável e lazy-loaded por aba). `ActivityFeed` passa de Server Component estático para client component sobre `useInfiniteList`. Novas server actions cursor-paginadas alimentam as listas.

**Tech Stack:** Next 16 / React 19, Drizzle (`db.execute` raw SQL), `@emach/ui` (tabs, scroll-area, badge, card), Biome/Ultracite.

**Verificação:** o projeto não tem harness de teste para componentes nem para queries de DB (só `permissions.test.ts`). Conforme `apps/web/CLAUDE.md`, a validação é `bun check-types` + `bun fix` + smoke em `bun dev:web`. Cada task verifica com `bun check-types`; a Task 9 faz o smoke run-time completo. `tsc` não detecta SQL inválido — o smoke é obrigatório.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/components/infinite-sentinel.tsx` | (modificar) sentinela do IntersectionObserver — ganha prop `root` opcional |
| `apps/web/src/lib/cursor.ts` | (modificar) união de cursores — ganha `PendingStockCursor` |
| `apps/web/src/components/pending-panel.tsx` | (criar — substitui `pending-list.tsx`) painel de pendências com abas, tipos `PendingRow`/`PendingRole` |
| `apps/web/src/components/pending-list.tsx` | (deletar) substituído por `pending-panel.tsx` |
| `apps/web/src/components/activity-feed.tsx` | (reescrever) client component sobre `useInfiniteList` |
| `apps/web/src/app/dashboard/actions.ts` | (criar) server actions cursor-paginadas do dashboard |
| `apps/web/src/app/dashboard/page.tsx` | (modificar) wiring do `PendingPanel` + `ActivityFeed` |
| `apps/web/src/app/dashboard/orders/data.ts` | (modificar) `fetchPendingOrdersPage` + `fetchOrderActivityPage` |
| `apps/web/src/app/dashboard/orders/actions.ts` | (modificar) re-export das novas funções como server actions |
| `apps/web/src/app/dashboard/orders/page.tsx` | (modificar) wiring do `PendingPanel` + `ActivityFeed` |

---

## Task 1: `InfiniteSentinel` aceita `root` para scroll interno

**Files:**
- Modify: `apps/web/src/components/infinite-sentinel.tsx`

- [ ] **Step 1: Adicionar prop `root` e passá-la ao IntersectionObserver**

Substituir o conteúdo inteiro de `apps/web/src/components/infinite-sentinel.tsx` por:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { type RefObject, useEffect, useRef } from "react";

interface InfiniteSentinelProps {
	error: string | null;
	hasMore: boolean;
	onLoadMore: () => void;
	pending: boolean;
	root?: RefObject<HTMLElement | null>;
}

export function InfiniteSentinel({
	hasMore,
	pending,
	error,
	onLoadMore,
	root,
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

A tabela de pedidos (`OrdersInfinite`) não passa `root` → `root?.current ?? null` mantém o comportamento atual (root = viewport).

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS (sem erros novos).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/infinite-sentinel.tsx
git commit -m "feat: InfiniteSentinel aceita root para scroll interno"
```

---

## Task 2: Cursor de paginação para lista de estoque pendente

**Files:**
- Modify: `apps/web/src/lib/cursor.ts`

- [ ] **Step 1: Adicionar `PendingStockCursor` à união**

Em `apps/web/src/lib/cursor.ts`, após a interface `NameAscCursor` (linha 46), adicionar:

```ts
export interface PendingStockCursor extends CursorBase {
	quantity: number;
	sort: "pendingStock";
}
```

`id` (herdado de `CursorBase`) carrega a chave composta `${variantId}:${branchId}`.

- [ ] **Step 2: Incluir na união `Cursor`**

Alterar a união `Cursor` (linha 48) para incluir `| PendingStockCursor`:

```ts
export type Cursor =
	| NewestCursor
	| NameCursor
	| StockHighCursor
	| StockLowCursor
	| UrgencyCursor
	| LtvCursor
	| LastOrderCursor
	| NameAscCursor
	| PendingStockCursor;
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/cursor.ts
git commit -m "feat: adiciona PendingStockCursor à união de cursores"
```

---

## Task 3: `PendingPanel` — painel de pendências com abas

**Files:**
- Create: `apps/web/src/components/pending-panel.tsx`

Este componente é usado pelas Tasks 6 e 8. Define os tipos `PendingRole`, `PendingRow` e `PendingTab`.

- [ ] **Step 1: Criar `apps/web/src/components/pending-panel.tsx`**

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { Card, CardContent, CardHeader } from "@emach/ui/components/card";
import { ToggleGroup, ToggleGroupItem } from "@emach/ui/components/toggle-group";
import Link from "next/link";
import { useRef, useState } from "react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import type { InfiniteResult } from "@/lib/infinite";
import { useInfiniteList } from "@/lib/use-infinite-list";

export type PendingRole =
	| "default"
	| "destructive"
	| "info"
	| "secondary"
	| "success"
	| "warning";

export interface PendingRow {
	badge?: { label: string; role: PendingRole };
	href: string;
	id: string;
	primary: string;
	secondary?: string;
}

export interface PendingTab {
	count: number;
	fetchPage: (cursor: string) => Promise<InfiniteResult<PendingRow>>;
	id: string;
	initial: PendingRow[];
	initialCursor: string | null;
	label: string;
	role?: PendingRole;
}

interface PendingPanelProps {
	emptyMessage?: string;
	tabs: PendingTab[];
	title?: string;
}

const BADGE_COLORS: Record<PendingRole, string> = {
	default: "text-foreground",
	destructive: "text-destructive",
	info: "text-info",
	secondary: "text-muted-foreground",
	success: "text-success",
	warning: "text-warning",
};

function PendingTabList({ tab }: { tab: PendingTab }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: tab.initial,
		initialCursor: tab.initialCursor,
		fetchPage: tab.fetchPage,
	});

	if (items.length === 0) {
		return (
			<p className="px-2 py-8 text-muted-foreground text-sm">
				Nada pendente nesse grupo.
			</p>
		);
	}

	return (
		<div
			className="min-h-72 max-h-[28rem] overflow-y-auto"
			ref={scrollRef}
			aria-live="polite"
		>
			<ul className="flex flex-col">
				{items.map((row) => (
					<li key={row.id}>
						<Link
							className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
							href={row.href}
						>
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-foreground">{row.primary}</span>
								{row.secondary && (
									<span className="truncate text-muted-foreground text-xs">
										{row.secondary}
									</span>
								)}
							</div>
							{row.badge && (
								<span
									className={`shrink-0 font-mono text-xs ${BADGE_COLORS[row.badge.role]}`}
								>
									{row.badge.label}
								</span>
							)}
						</Link>
					</li>
				))}
			</ul>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
				root={scrollRef}
			/>
		</div>
	);
}

export function PendingPanel({
	tabs,
	title = "Pendências",
	emptyMessage = "Nada pendente. Bom trabalho.",
}: PendingPanelProps) {
	const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
	const total = tabs.reduce((s, t) => s + t.count, 0);
	const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

	return (
		<Card>
			<CardHeader className="flex flex-col gap-3 pb-3">
				<div className="flex flex-row items-baseline justify-between gap-3">
					<span className="font-semibold text-sm uppercase tracking-wider">
						{title}
					</span>
					<span className="font-mono text-muted-foreground text-xs tabular-nums">
						{total} {total === 1 ? "item" : "itens"}
					</span>
				</div>
				<ToggleGroup
					className="flex-wrap justify-start"
					onValueChange={(v) => v && setActiveId(v)}
					type="single"
					value={activeId}
				>
					{tabs.map((tab) => (
						<ToggleGroupItem key={tab.id} value={tab.id}>
							{tab.label}
							<Badge
								className={`ml-1.5 ${BADGE_COLORS[tab.role ?? "default"]}`}
								variant="outline"
							>
								{tab.count}
							</Badge>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</CardHeader>
			<CardContent className="flex flex-col">
				{total === 0 || !activeTab ? (
					<p className="px-2 py-8 text-muted-foreground text-sm">
						{emptyMessage}
					</p>
				) : (
					<PendingTabList key={activeTab.id} tab={activeTab} />
				)}
			</CardContent>
		</Card>
	);
}
```

Notas:
- `key={activeTab.id}` força remount do `PendingTabList` ao trocar de aba → `useInfiniteList` reinicia limpo (sem precisar de `resetKey`).
- O `scrollRef` é o container rolável; passado ao `InfiniteSentinel` como `root` para o IntersectionObserver disparar dentro do card.

- [ ] **Step 2: Confirmar a API real dos componentes `toggle-group` e `badge`**

Run: `sed -n '1,40p' packages/ui/src/components/toggle-group.tsx && echo "---" && sed -n '1,40p' packages/ui/src/components/badge.tsx`
Expected: confirmar nomes de export (`ToggleGroup`, `ToggleGroupItem`, `Badge`) e props (`type`, `value`, `onValueChange`, `variant`).
Se a API divergir (ex.: export default, ou `Tabs` em vez de `ToggleGroup`), ajustar o import e o JSX do Step 1 para a API real antes de prosseguir.

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/pending-panel.tsx
git commit -m "feat: PendingPanel com abas e lista lazy-loaded"
```

---

## Task 4: Reescrever `ActivityFeed` como client component lazy-loaded

**Files:**
- Modify: `apps/web/src/components/activity-feed.tsx`

- [ ] **Step 1: Substituir o conteúdo inteiro de `apps/web/src/components/activity-feed.tsx`**

```tsx
"use client";

import { Card, CardContent, CardHeader } from "@emach/ui/components/card";
import {
	BoxIcon,
	type LucideIcon,
	PackageIcon,
	StarIcon,
	UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import type { InfiniteResult } from "@/lib/infinite";
import { useInfiniteList } from "@/lib/use-infinite-list";

export type ActivityKind = "order" | "review" | "stock" | "customer";

export interface ActivityEvent {
	at: Date;
	href?: string;
	id: string;
	kind: ActivityKind;
	primary: string;
	secondary?: string;
}

interface ActivityFeedProps {
	emptyMessage?: string;
	fetchPage: (cursor: string) => Promise<InfiniteResult<ActivityEvent>>;
	initialCursor: string | null;
	initialEvents: ActivityEvent[];
	title?: string;
}

const KIND_META: Record<ActivityKind, { color: string; icon: LucideIcon }> = {
	stock: { icon: BoxIcon, color: "text-info" },
	order: { icon: PackageIcon, color: "text-warning" },
	review: { icon: StarIcon, color: "text-success" },
	customer: { icon: UserIcon, color: "text-primary" },
};

const TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	hour: "2-digit",
	minute: "2-digit",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
});

function formatWhen(date: Date): string {
	const now = Date.now();
	const isToday = new Date(now).toDateString() === date.toDateString();
	if (isToday) {
		return TIME_FORMATTER.format(date);
	}
	return DATE_FORMATTER.format(date);
}

export function ActivityFeed({
	initialEvents,
	initialCursor,
	fetchPage,
	title = "Atividade",
	emptyMessage = "Sem atividade recente.",
}: ActivityFeedProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initialEvents,
		initialCursor,
		fetchPage,
	});

	return (
		<Card>
			<CardHeader className="flex flex-row items-baseline justify-between gap-3 pb-3">
				<span className="font-semibold text-sm uppercase tracking-wider">
					{title}
				</span>
				<span className="font-mono text-muted-foreground text-xs tabular-nums">
					{items.length} evento{items.length === 1 ? "" : "s"}
				</span>
			</CardHeader>
			<CardContent className="flex flex-col">
				{items.length === 0 ? (
					<p className="text-muted-foreground text-sm">{emptyMessage}</p>
				) : (
					<div
						aria-live="polite"
						className="min-h-72 max-h-[28rem] overflow-y-auto"
						ref={scrollRef}
					>
						<ul className="flex flex-col">
							{items.map((event) => {
								const meta = KIND_META[event.kind];
								const Icon = meta.icon;
								const rowClassName =
									"-mx-2 flex items-start gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted";
								const inner = (
									<>
										<span className="w-12 shrink-0 pt-0.5 text-right font-mono text-muted-foreground text-xs tabular-nums">
											{formatWhen(event.at)}
										</span>
										<Icon
											aria-hidden="true"
											className={`mt-0.5 size-3.5 shrink-0 ${meta.color}`}
										/>
										<div className="flex min-w-0 flex-col">
											<span className="truncate text-foreground">
												{event.primary}
											</span>
											{event.secondary && (
												<span className="truncate text-muted-foreground text-xs">
													{event.secondary}
												</span>
											)}
										</div>
									</>
								);
								return (
									<li key={event.id}>
										{event.href ? (
											<Link className={rowClassName} href={event.href}>
												{inner}
											</Link>
										) : (
											<div className={rowClassName}>{inner}</div>
										)}
									</li>
								);
							})}
						</ul>
						<InfiniteSentinel
							error={error}
							hasMore={hasMore}
							onLoadMore={loadMore}
							pending={pending}
							root={scrollRef}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: FAIL — `apps/web/src/app/dashboard/page.tsx` e `orders/page.tsx` ainda passam a prop antiga `events`. Esperado; corrigido nas Tasks 6 e 8.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/activity-feed.tsx
git commit -m "feat: ActivityFeed vira client component lazy-loaded"
```

---

## Task 5: Server actions de pendências e atividade do dashboard

**Files:**
- Create: `apps/web/src/app/dashboard/actions.ts`

- [ ] **Step 1: Criar `apps/web/src/app/dashboard/actions.ts`**

```ts
"use server";

import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";

import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import { type Cursor, decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCurrentSession } from "@/lib/session";

function newestCursor(raw: string): { createdAt: string; id: string } {
	const c = decodeCursor(raw);
	if (c.sort !== "newest") {
		throw new Error("Cursor incompatível: esperado newest");
	}
	return { createdAt: c.createdAt, id: c.id };
}

export async function fetchPendingStock(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCurrentSession();
	let decoded: { quantity: number; id: string } | null = null;
	if (cursor) {
		const c: Cursor = decodeCursor(cursor);
		if (c.sort !== "pendingStock") {
			throw new Error("Cursor incompatível: esperado pendingStock");
		}
		decoded = { quantity: c.quantity, id: c.id };
	}
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
	const rows = result.rows.map(
		(r): PendingRow => ({
			id: `${r.variant_id}:${r.branch_id}`,
			href: "/dashboard/stock",
			primary: r.sku ?? r.tool_name,
			secondary: `${r.tool_name} · ${r.branch_name}`,
			badge:
				r.quantity === 0
					? { label: "Sem estoque", role: "destructive" }
					: { label: "Repor", role: "warning" },
		})
	);
	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const last = items.at(-1);
	const lastRaw = hasMore ? result.rows[BATCH_SIZE - 1] : undefined;
	const nextCursor =
		hasMore && last && lastRaw
			? encodeCursor({
					v: 1,
					sort: "pendingStock",
					quantity: lastRaw.quantity,
					id: last.id,
				})
			: null;
	return { items, nextCursor };
}

export async function fetchPendingOrders(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCurrentSession();
	const decoded = cursor ? newestCursor(cursor) : null;
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
	const rows = result.rows.map(
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/orders/${r.id}`,
			primary: `#${r.number} · ${r.client_name}`,
			badge: badgeFor(r.status),
		})
	);
	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const lastRaw = hasMore ? result.rows[BATCH_SIZE - 1] : undefined;
	const nextCursor =
		hasMore && lastRaw
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: toDate(lastRaw.created_at).toISOString(),
					id: lastRaw.id,
				})
			: null;
	return { items, nextCursor };
}

export async function fetchPendingReviews(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCurrentSession();
	const decoded = cursor ? newestCursor(cursor) : null;
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
	const rows = result.rows.map(
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/reviews/${r.id}`,
			primary: `Review ${r.rating}★`,
			secondary: r.tool_name ?? "ferramenta",
			badge: { label: "Moderar", role: "warning" },
		})
	);
	const hasMore = rows.length > BATCH_SIZE;
	const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;
	const lastRaw = hasMore ? result.rows[BATCH_SIZE - 1] : undefined;
	const nextCursor =
		hasMore && lastRaw
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: toDate(lastRaw.created_at).toISOString(),
					id: lastRaw.id,
				})
			: null;
	return { items, nextCursor };
}

export async function fetchDashboardActivity(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	await requireCurrentSession();
	const decoded = cursor ? newestCursor(cursor) : null;
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
			ORDER BY sm.created_at DESC LIMIT ${BATCH_SIZE + 1}
		)
		UNION ALL
		(
			SELECT 'order-' || osh.id AS id, 'order'::text AS kind, osh.created_at,
				'#' || o.number || ' → ' || osh.to_status::text AS primary,
				NULL::text AS secondary, '/dashboard/orders/' || o.id AS href
			FROM order_status_history osh
			JOIN "order" o ON o.id = osh.order_id
			${keyset("osh.created_at", "'order-' || osh.id")}
			ORDER BY osh.created_at DESC LIMIT ${BATCH_SIZE + 1}
		)
		UNION ALL
		(
			SELECT 'review-' || r.id AS id, 'review'::text AS kind, r.created_at,
				'Review ' || r.rating || '★ · ' || COALESCE(t.name, 'ferramenta') AS primary,
				r.status::text AS secondary, '/dashboard/reviews/' || r.id AS href
			FROM review r
			LEFT JOIN tool t ON t.id = r.tool_id
			${keyset("r.created_at", "'review-' || r.id")}
			ORDER BY r.created_at DESC LIMIT ${BATCH_SIZE + 1}
		)
		ORDER BY created_at DESC, id DESC
		LIMIT ${BATCH_SIZE + 1}
	`);
	const mapped = result.rows.map(
		(r): ActivityEvent => ({
			id: r.id,
			kind: r.kind,
			at: toDate(r.created_at),
			primary: r.primary,
			secondary: r.secondary ?? undefined,
			href: r.href ?? undefined,
		})
	);
	const hasMore = mapped.length > BATCH_SIZE;
	const items = hasMore ? mapped.slice(0, BATCH_SIZE) : mapped;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.at.toISOString(),
					id: last.id,
				})
			: null;
	return { items, nextCursor };
}

export async function fetchDashboardCounts(): Promise<{
	stock: number;
	orders: number;
	reviews: number;
}> {
	await requireCurrentSession();
	const result = await db.execute<{
		stock: number;
		orders: number;
		reviews: number;
	}>(sql`
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

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS para `actions.ts` (a falha pendente de `page.tsx`/`orders/page.tsx` da Task 4 continua até as Tasks 6/8).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/actions.ts
git commit -m "feat: server actions de pendencias e atividade do dashboard"
```

---

## Task 6: Wiring de `/dashboard/page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Delete: `apps/web/src/components/pending-list.tsx`

- [ ] **Step 1: Substituir o conteúdo de `apps/web/src/app/dashboard/page.tsx`**

```tsx
import { buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import Link from "next/link";

import { ActivityFeed } from "@/components/activity-feed";
import { PendingPanel, type PendingTab } from "@/components/pending-panel";
import { requireCurrentSession } from "@/lib/session";
import {
	fetchDashboardActivity,
	fetchDashboardCounts,
	fetchPendingOrders,
	fetchPendingReviews,
	fetchPendingStock,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
	const session = await requireCurrentSession();
	const [counts, stock, orders, reviews, activity] = await Promise.all([
		fetchDashboardCounts(),
		fetchPendingStock(null),
		fetchPendingOrders(null),
		fetchPendingReviews(null),
		fetchDashboardActivity(null),
	]);

	const tabs: PendingTab[] = [
		{
			id: "stock",
			label: "Estoque",
			count: counts.stock,
			role: "warning",
			initial: stock.items,
			initialCursor: stock.nextCursor,
			fetchPage: fetchPendingStock,
		},
		{
			id: "orders",
			label: "Pedidos",
			count: counts.orders,
			role: "info",
			initial: orders.items,
			initialCursor: orders.nextCursor,
			fetchPage: fetchPendingOrders,
		},
		{
			id: "reviews",
			label: "Moderação",
			count: counts.reviews,
			role: "warning",
			initial: reviews.items,
			initialCursor: reviews.nextCursor,
			fetchPage: fetchPendingReviews,
		},
	];

	return (
		<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
			<section className="flex flex-col gap-2">
				<p className="text-muted-foreground text-sm">Painel</p>
				<h1 className="font-medium text-2xl tracking-tight">
					Olá, {session.user.name?.split(" ")[0] ?? "admin"}
				</h1>
				<p className="max-w-3xl text-muted-foreground text-sm">
					Visão operacional. Esquerda: o que precisa ação. Direita: o que
					aconteceu.
				</p>
			</section>

			<section className="grid gap-4 lg:grid-cols-2">
				<PendingPanel tabs={tabs} />
				<ActivityFeed
					fetchPage={fetchDashboardActivity}
					initialCursor={activity.nextCursor}
					initialEvents={activity.items}
				/>
			</section>

			<section>
				<Card>
					<CardHeader>
						<CardTitle>Atalhos operacionais</CardTitle>
						<CardDescription>
							Entradas rápidas para as telas mais usadas no dia a dia.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
							{QUICK_ACTIONS.map((action) => (
								<Link
									className={`${buttonVariants({
										variant: action.variant,
									})} h-10 w-full justify-start`}
									href={action.href}
									key={action.href}
								>
									{action.label}
								</Link>
							))}
						</div>
					</CardContent>
				</Card>
			</section>
		</main>
	);
}

const QUICK_ACTIONS = [
	{ href: "/dashboard/tools", label: "Abrir ferramentas", variant: "secondary" },
	{ href: "/dashboard/stock", label: "Estoque geral", variant: "secondary" },
	{
		href: "/dashboard/stock/branches",
		label: "Estoque por filiais",
		variant: "secondary",
	},
	{ href: "/dashboard/branches", label: "Filiais", variant: "ghost" },
	{ href: "/dashboard/suppliers", label: "Fornecedores", variant: "ghost" },
	{ href: "/dashboard/categories", label: "Categorias", variant: "ghost" },
] as const;
```

- [ ] **Step 2: Deletar `pending-list.tsx`**

Run: `grep -rn "pending-list" apps/web/src`
Expected: nenhuma referência além da própria `pending-list.tsx`. Se houver outra, atualizar para `pending-panel` antes de deletar.

Run: `git rm apps/web/src/components/pending-list.tsx`

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS para o dashboard (`orders/page.tsx` ainda falha até a Task 8).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx
git commit -m "feat: dashboard usa PendingPanel e ActivityFeed lazy-loaded"
```

---

## Task 7: Funções cursor-paginadas em `orders/data.ts` + actions

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/data.ts`
- Modify: `apps/web/src/app/dashboard/orders/actions.ts`

- [ ] **Step 1: Adicionar `fetchPendingOrdersPage` e `fetchOrderActivityPage` ao fim de `apps/web/src/app/dashboard/orders/data.ts`**

```ts
import type { PendingRow } from "@/components/pending-panel";
import type { ActivityEvent } from "@/components/activity-feed";

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
		const c = decodeCursor(cursor);
		if (c.sort !== "newest") {
			throw new Error("Cursor incompatível: esperado newest");
		}
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
	const mapped = rows.rows.map(
		(r): PendingRow => ({
			id: r.id,
			href: `/dashboard/orders/${r.id}`,
			primary: `#${r.number} · ${r.client_name}`,
			badge: PENDING_ORDER_BADGE[r.status] ?? {
				label: r.status,
				role: "info",
			},
		})
	);
	const hasMore = mapped.length > BATCH_SIZE;
	const items = hasMore ? mapped.slice(0, BATCH_SIZE) : mapped;
	const lastRaw = hasMore ? rows.rows[BATCH_SIZE - 1] : undefined;
	const nextCursor =
		hasMore && lastRaw
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: toDate(lastRaw.created_at).toISOString(),
					id: lastRaw.id,
				})
			: null;
	return { items, nextCursor };
}

export async function fetchOrderActivityPage(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	await requireCurrentSession();
	const conditions = [sql`TRUE`];
	if (cursor) {
		const c = decodeCursor(cursor);
		if (c.sort !== "newest") {
			throw new Error("Cursor incompatível: esperado newest");
		}
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
	const mapped = rows.rows.map(
		(r): ActivityEvent => ({
			id: r.id,
			kind: "order" as const,
			at: toDate(r.created_at),
			primary: `#${r.order_number} → ${ORDER_STATUS_LABELS[r.to_status]}`,
			href: `/dashboard/orders/${r.order_id}`,
		})
	);
	const hasMore = mapped.length > BATCH_SIZE;
	const items = hasMore ? mapped.slice(0, BATCH_SIZE) : mapped;
	const lastRaw = hasMore ? rows.rows[BATCH_SIZE - 1] : undefined;
	const nextCursor =
		hasMore && lastRaw
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: toDate(lastRaw.created_at).toISOString(),
					id: lastRaw.id,
				})
			: null;
	return { items, nextCursor };
}
```

Nota: `data.ts` hoje importa de `./status-meta` apenas `ORDER_TABS`. Adicionar `ORDER_STATUS_LABELS` a esse import: `import { ORDER_STATUS_LABELS, ORDER_TABS } from "./status-meta";`.

- [ ] **Step 2: Re-exportar como server actions em `apps/web/src/app/dashboard/orders/actions.ts`**

No bloco de imports de `./data` (linhas ~23-27), acrescentar `fetchPendingOrdersPage` e `fetchOrderActivityPage`:

```ts
import {
	fetchOrdersPage as fetchOrdersPageImpl,
	fetchOrderActivityPage as fetchOrderActivityPageImpl,
	fetchPendingOrdersPage as fetchPendingOrdersPageImpl,
	type OrderListItem,
	type OrdersPageFiltersInput,
} from "./data";
```

Adicionar os imports de tipo no topo do arquivo (junto aos demais):

```ts
import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import type { OrderStatus } from "@emach/db/schema/orders";
```

> Conferir: `OrderStatus` já é importado em `actions.ts` (sim — linha 7, do `@emach/db/schema/orders`). Não duplicar; usar o import existente.

Após a função `fetchOrdersPage` (linha ~53), adicionar:

```ts
export async function fetchPendingOrdersPage(args: {
	statuses: OrderStatus[];
	cursor: string | null;
}): Promise<InfiniteResult<PendingRow>> {
	return fetchPendingOrdersPageImpl(args);
}

export async function fetchOrderActivityPage(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	return fetchOrderActivityPageImpl(cursor);
}
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS para `orders/data.ts` e `orders/actions.ts` (`orders/page.tsx` ainda falha até a Task 8).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/orders/actions.ts
git commit -m "feat: paginacao cursor de pendencias e atividade de pedidos"
```

---

## Task 8: Wiring de `/dashboard/orders/page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/page.tsx`

- [ ] **Step 1: Atualizar imports**

No topo de `apps/web/src/app/dashboard/orders/page.tsx`:
- Remover `import { type ActivityEvent, ActivityFeed } from "@/components/activity-feed";` → trocar por `import { ActivityFeed } from "@/components/activity-feed";`
- Remover `import { type PendingGroup, PendingList } from "@/components/pending-list";` → trocar por `import { PendingPanel, type PendingTab } from "@/components/pending-panel";`
- No import de `./data`, remover `getRecentOrderActivity` da lista (não é mais usado).
- No import de `./_components/...` adicionar nada novo.
- Adicionar: `import { fetchOrderActivityPage, fetchPendingOrdersPage } from "./actions";`
- `ORDER_STATUS_LABELS` deixa de ser usado na page → remover do import `./status-meta` (manter o resto se houver).

- [ ] **Step 2: Substituir o `Promise.all`, os `pendingGroups`/`activityEvents` e a `<section>` dos cards**

Trocar o bloco `const [branches, counts, kpis, recentActivity, result] = await Promise.all([...])` por (remove `getRecentOrderActivity`):

```tsx
	const [branches, counts, kpis, pendingAwaiting, pendingFlow, activity, result] =
		await Promise.all([
			listOrderBranches(),
			getOrdersTabCounts(),
			getOrderKpis(),
			fetchPendingOrdersPage({
				statuses: ["paid", "pending_payment"],
				cursor: null,
			}),
			fetchPendingOrdersPage({
				statuses: ["preparing", "shipped"],
				cursor: null,
			}),
			fetchOrderActivityPage(null),
			fetchOrdersPage({ filters: pageFilters, cursor: null }),
		]);
```

> `fetchOrdersPage` aqui é o import já existente de `./data` (a page importa de `./data`). Manter.

Remover o bloco `const pendingGroups: PendingGroup[] = [...]` inteiro e o bloco `const activityEvents: ActivityEvent[] = recentActivity.map(...)` inteiro. No lugar, adicionar:

```tsx
	const awaitingCount = (counts.paid ?? 0) + (counts.pending_payment ?? 0);
	const flowCount = (counts.preparing ?? 0) + (counts.shipped ?? 0);

	const pendingTabs: PendingTab[] = [
		{
			id: "awaiting",
			label: "Aguardando ação",
			count: awaitingCount,
			role: "warning",
			initial: pendingAwaiting.items,
			initialCursor: pendingAwaiting.nextCursor,
			fetchPage: (cursor) =>
				fetchPendingOrdersPage({
					statuses: ["paid", "pending_payment"],
					cursor,
				}),
		},
		{
			id: "flow",
			label: "Em fluxo",
			count: flowCount,
			role: "info",
			initial: pendingFlow.items,
			initialCursor: pendingFlow.nextCursor,
			fetchPage: (cursor) =>
				fetchPendingOrdersPage({
					statuses: ["preparing", "shipped"],
					cursor,
				}),
		},
	];
```

Substituir a `<section className="grid gap-3 lg:grid-cols-2">...</section>` por:

```tsx
			<section className="grid gap-3 lg:grid-cols-2">
				<PendingPanel
					emptyMessage="Nenhum pedido aguardando ação."
					tabs={pendingTabs}
					title="Pendências de pedidos"
				/>
				<ActivityFeed
					emptyMessage="Sem mudanças de status recentes."
					fetchPage={fetchOrderActivityPage}
					initialCursor={activity.nextCursor}
					initialEvents={activity.items}
					title="Histórico recente"
				/>
			</section>
```

> O `fetchPage` das abas é um closure (não server action direta) — mas chama uma server action (`fetchPendingOrdersPage` de `./actions`). Isso é válido: o closure roda no client e invoca a server action com os args. O mesmo padrão de `OrdersInfinite` (`fetchOrdersPage({ filters, cursor })`).

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS — sem erros pendentes em todo o projeto.

- [ ] **Step 4: Rodar o formatter**

Run: `bun fix`
Expected: sem erros de lint; arquivos reformatados se necessário.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/page.tsx
git commit -m "feat: pagina de pedidos usa PendingPanel e ActivityFeed lazy-loaded"
```

---

## Task 9: Smoke run-time e verificação final

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir o dev server**

Run: `bun dev:web` (porta 3001).

- [ ] **Step 2: Smoke `/dashboard`**

Visitar `http://localhost:3001/dashboard`. Verificar:
- Card Pendências mostra 3 abas (Estoque, Pedidos, Moderação) com badges de contagem.
- Trocar de aba carrega a lista respectiva sem flash.
- Card tem altura limitada (`min-h-72 max-h-[28rem]`); com itens suficientes aparece scroll interno.
- Rolar até o fim dispara o lazy loading (carrega mais; ao esgotar mostra "— fim da lista —").
- Card Atividade tem o mesmo comportamento de altura/scroll/lazy loading.
- Abas sem itens mostram "Nada pendente nesse grupo."

- [ ] **Step 3: Smoke `/dashboard/orders`**

Visitar `http://localhost:3001/dashboard/orders`. Verificar:
- Card "Pendências de pedidos" com abas "Aguardando ação" e "Em fluxo", contagens corretas.
- Scroll interno + lazy loading funcionam.
- Card "Histórico recente" com altura limitada, scroll interno e lazy loading.
- A tabela de pedidos abaixo continua funcionando normalmente (não foi tocada).

- [ ] **Step 4: Capturar erros de SSR**

Se algo quebrar, usar o MCP `next-devtools`: `nextjs_call 3001 get_errors` para o stack trace. Erros comuns esperados: SQL inválido (coluna inexistente), API divergente de `toggle-group`/`badge`. Corrigir na task de origem.

- [ ] **Step 5: Verificação final**

Run: `bun check-types && bun fix`
Expected: PASS, sem erros.

- [ ] **Step 6: Commit (se o smoke exigiu ajustes)**

```bash
git add -A
git commit -m "fix: ajustes do smoke dos cards de pendencias e atividade"
```

---

## Self-Review (preenchido pelo autor do plano)

**Spec coverage:**
- Pendências → painel com abas + listas reais: Tasks 3, 6, 8. ✓
- 3 grupos de `/dashboard` viram listas: Task 5 (`fetchPendingStock/Orders/Reviews`) + Task 6. ✓
- ActivityFeed com altura/scroll/lazy loading: Task 4 + wiring 6/8. ✓
- `InfiniteSentinel` com `root`: Task 1. ✓
- Camada de dados cursor-based dashboard: Task 5. ✓
- Camada de dados orders (reuso branch-scoped + activity): Task 7. ✓
- Carga inicial paralela: Tasks 6 e 8 (`Promise.all`). ✓
- Estados vazios: Task 3 (`PendingTabList`) + Task 4 (`ActivityFeed`). ✓
- Heights compartilhados: `min-h-72 max-h-[28rem]` em Tasks 3 e 4. ✓

**Decisão divergente do spec a confirmar na execução:** o spec sugeria reusar `fetchOrdersPage` para a aba de pedidos. Como as abas de `/dashboard/orders` combinam 2 status cada e `resolveTab`/`ORDER_TABS` só expõem status únicos (exceto `pending_payment` que já agrupa `payment_failed`), o plano cria `fetchPendingOrdersPage({ statuses })` dedicada — ainda branch-scoped via `getUserBranchScope`, cumprindo o requisito de segurança. As pendências de `/dashboard` (não-orders) NÃO são branch-scoped, para manter coerência com os contadores atuais (`fetchPendingCounts` nunca foi escopado).

**Placeholders:** nenhum "TBD"/"TODO"/código inválido remanescente — todo bloco de código é o conteúdo final a escrever.

**Type consistency:** `PendingRow`, `PendingTab`, `PendingRole` definidos na Task 3 e usados consistentemente nas Tasks 5–8. `ActivityEvent` mantém a assinatura original (Task 4) e é produzido por `fetchDashboardActivity` (Task 5) e `fetchOrderActivityPage` (Task 7). Cursor `newest` reusado; `pendingStock` adicionado na Task 2 e consumido só em `fetchPendingStock`.
