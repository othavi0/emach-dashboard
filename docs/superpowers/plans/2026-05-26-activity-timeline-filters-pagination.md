# Activity timeline filters + pagination — Implementation Plan

> Spec: `docs/superpowers/specs/2026-05-26-activity-timeline-filters-pagination.md`. Execução inline, PR único.

**Goal:** Substituir `limit=100` por cursor pagination + filtros (período, filial, motivo) na tab Atividade.

**Architecture:** 5 arquivos (1 modify actions + 1 refactor server tab + 3 create client comps). Filtros = state local; cursor = base64(createdAt, id).

**Tech Stack:** Next 16 RSC + React 19 + `useInfiniteList` + cursor (`@/lib/cursor`) + Drizzle.

---

## Task 1: Server action + types

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/actions.ts`

- [ ] **Step 1:** Verificar imports — precisamos de `gte`, `lt`, `inArray`, `or` em drizzle-orm. Adicionar se faltar.

- [ ] **Step 2:** Adicionar tipos + função no fim do arquivo (após `getToolActivity`):

```typescript
export type PeriodPreset = "today" | "7d" | "30d" | "90d" | "all";

export interface ToolActivityFilters {
	branchId?: string;
	period: PeriodPreset;
	reasons?: string[];
	toolId: string;
}

function computePeriodCutoff(period: PeriodPreset): Date | null {
	if (period === "all") return null;
	const now = new Date();
	if (period === "today") {
		return new Date(now.getFullYear(), now.getMonth(), now.getDate());
	}
	const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
	return new Date(now.getTime() - days * 86_400_000);
}

interface ActivityCursor {
	createdAt: string;
	id: string;
}

export async function fetchToolActivityPage(
	filters: ToolActivityFilters,
	cursor: string | null
): Promise<InfiniteResult<ToolActivityRow>> {
	await requireCapability("stock.read");

	const limit = BATCH_SIZE;
	const conditions = [eq(toolVariant.toolId, filters.toolId)];

	if (filters.branchId) {
		conditions.push(eq(stockMovement.branchId, filters.branchId));
	}
	if (filters.reasons && filters.reasons.length > 0) {
		conditions.push(inArray(stockMovement.reason, filters.reasons));
	}

	const cutoff = computePeriodCutoff(filters.period);
	if (cutoff) {
		conditions.push(gte(stockMovement.createdAt, cutoff));
	}

	if (cursor) {
		const c = decodeCursor(cursor) as ActivityCursor;
		const cursorClause = or(
			lt(stockMovement.createdAt, new Date(c.createdAt)),
			and(
				eq(stockMovement.createdAt, new Date(c.createdAt)),
				lt(stockMovement.id, c.id)
			)
		);
		if (cursorClause) conditions.push(cursorClause);
	}

	const rows = await db
		.select({
			id: stockMovement.id,
			createdAt: stockMovement.createdAt,
			branchId: stockMovement.branchId,
			branchName: branch.name,
			previousQty: stockMovement.previousQty,
			newQty: stockMovement.newQty,
			delta: stockMovement.delta,
			reason: stockMovement.reason,
			reasonNote: stockMovement.reasonNote,
			actorId: stockMovement.actorId,
			actorName: user.name,
			variantSku: toolVariant.sku,
			variantVoltage: toolVariant.voltage,
		})
		.from(stockMovement)
		.innerJoin(toolVariant, eq(toolVariant.id, stockMovement.variantId))
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.where(and(...conditions))
		.orderBy(desc(stockMovement.createdAt), desc(stockMovement.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;

	return { items, nextCursor };
}
```

- [ ] **Step 3:** Verificar se `decodeCursor`/`encodeCursor` aceitam objetos genéricos (já usado em outros lugares — confirmar tipos).

- [ ] **Step 4:** `bun check-types` → 0 erros.

---

## Task 2: ActivityTimeline component

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/activity-timeline.tsx`

- [ ] **Step 1:** Mover lógica de render do `activity-tab.tsx` atual:

```tsx
import { ArrowDown, ArrowUp, Pencil, X } from "lucide-react";

import type { ToolActivityRow } from "@/app/dashboard/stock/actions";

const REASON_LABEL: Record<string, string> = {
	entrada_compra: "entrada compra",
	saida_venda: "saída venda",
	ajuste_inventario: "ajuste inventário",
	perda: "perda",
	outro: "outro",
};

function reasonIcon(reason: string | null) {
	switch (reason) {
		case "entrada_compra":
			return { Icon: ArrowUp, color: "text-success", bg: "bg-success/15" };
		case "saida_venda":
			return {
				Icon: ArrowDown,
				color: "text-destructive",
				bg: "bg-destructive/15",
			};
		case "perda":
			return { Icon: X, color: "text-destructive", bg: "bg-destructive/15" };
		case "ajuste_inventario":
			return { Icon: Pencil, color: "text-warning", bg: "bg-warning/15" };
		default:
			return { Icon: Pencil, color: "text-muted-foreground", bg: "bg-muted" };
	}
}

function groupByDay(
	rows: ToolActivityRow[]
): Array<{ items: ToolActivityRow[]; label: string }> {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	const groups = new Map<string, ToolActivityRow[]>();
	const order: string[] = [];

	for (const r of rows) {
		const d = new Date(r.createdAt);
		let label: string;
		if (d >= today) {
			label = "Hoje";
		} else if (d >= yesterday) {
			label = "Ontem";
		} else {
			label = d.toLocaleDateString("pt-BR", {
				day: "2-digit",
				month: "short",
				year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
			});
		}

		if (!groups.has(label)) {
			groups.set(label, []);
			order.push(label);
		}
		groups.get(label)?.push(r);
	}

	return order.map((label) => ({ label, items: groups.get(label) ?? [] }));
}

function formatTime(date: Date): string {
	return new Date(date).toLocaleTimeString("pt-BR", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

interface Props {
	rows: ToolActivityRow[];
}

export function ActivityTimeline({ rows }: Props) {
	const groups = groupByDay(rows);

	return (
		<div className="rounded-md border border-border">
			{groups.map((g) => (
				<div key={g.label}>
					<div className="border-border border-b bg-muted/40 px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						{g.label}
					</div>
					<ul className="divide-y divide-border">
						{g.items.map((r) => {
							const { Icon, color, bg } = reasonIcon(r.reason);
							const reasonLabel =
								REASON_LABEL[r.reason ?? ""] ?? r.reason ?? "—";
							return (
								<li
									className="flex items-start gap-3 px-4 py-3 text-sm"
									key={r.id}
								>
									<span
										className={`mt-0.5 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full ${bg}`}
									>
										<Icon className={`size-3.5 ${color}`} />
									</span>
									<div className="flex min-w-0 flex-1 flex-col">
										<div>
											<span className={color}>
												{r.delta > 0 ? `+${r.delta}` : r.delta}
											</span>
											<span className="ml-1">· {reasonLabel}</span>
											<span className="text-muted-foreground"> · </span>
											<span className="font-medium">
												{r.branchName ?? "—"}
											</span>
											<span className="text-muted-foreground"> · </span>
											<span className="font-mono text-xs">{r.variantSku}</span>
											{r.variantVoltage && (
												<span className="text-muted-foreground text-xs">
													{" "}
													({r.variantVoltage})
												</span>
											)}
										</div>
										{(r.reasonNote || r.actorName) && (
											<div className="text-muted-foreground text-xs">
												{r.reasonNote && <>"{r.reasonNote}" · </>}
												{r.actorName ? `por ${r.actorName}` : "Sistema"}
											</div>
										)}
									</div>
									<span className="flex-shrink-0 text-muted-foreground text-xs">
										{formatTime(r.createdAt)}
									</span>
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</div>
	);
}
```

- [ ] **Step 2:** `bun check-types` → 0 erros.

---

## Task 3: ActivityFilters component

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/activity-filters.tsx`

- [ ] **Step 1:**

```tsx
"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { cn } from "@emach/ui/lib/utils";
import { CheckIcon } from "lucide-react";

import type { PeriodPreset } from "@/app/dashboard/stock/actions";

const PERIOD_OPTIONS: Array<{ label: string; value: PeriodPreset }> = [
	{ value: "today", label: "Hoje" },
	{ value: "7d", label: "7 dias" },
	{ value: "30d", label: "30 dias" },
	{ value: "90d", label: "90 dias" },
	{ value: "all", label: "Tudo" },
];

const REASON_OPTIONS: Array<{ label: string; value: string }> = [
	{ value: "entrada_compra", label: "Entrada" },
	{ value: "saida_venda", label: "Saída" },
	{ value: "ajuste_inventario", label: "Ajuste" },
	{ value: "perda", label: "Perda" },
	{ value: "outro", label: "Outro" },
];

interface Props {
	branchId: string | undefined;
	branches: Array<{ id: string; name: string }>;
	onBranchChange: (id: string | undefined) => void;
	onPeriodChange: (period: PeriodPreset) => void;
	onReasonToggle: (reason: string) => void;
	period: PeriodPreset;
	reasons: string[];
}

export function ActivityFilters({
	branches,
	branchId,
	onBranchChange,
	onPeriodChange,
	onReasonToggle,
	period,
	reasons,
}: Props) {
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
			<div className="inline-flex rounded-md border border-border bg-background p-0.5">
				{PERIOD_OPTIONS.map((p) => (
					<button
						className={cn(
							"rounded px-2 py-1 text-xs transition",
							period === p.value
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-muted"
						)}
						key={p.value}
						onClick={() => onPeriodChange(p.value)}
						type="button"
					>
						{p.label}
					</button>
				))}
			</div>

			<Select
				onValueChange={(v) => onBranchChange(v === "_all_" ? undefined : v)}
				value={branchId ?? "_all_"}
			>
				<SelectTrigger className="w-[160px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="_all_">Todas filiais</SelectItem>
					{branches.map((b) => (
						<SelectItem key={b.id} value={b.id}>
							{b.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<div className="flex flex-wrap gap-1.5">
				{REASON_OPTIONS.map((r) => {
					const active = reasons.includes(r.value);
					return (
						<button
							className={cn(
								"inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs transition",
								active
									? "border-primary bg-primary/10 text-primary"
									: "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
							)}
							key={r.value}
							onClick={() => onReasonToggle(r.value)}
							type="button"
						>
							{active && <CheckIcon className="mr-1 size-3" />}
							{r.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
```

- [ ] **Step 2:** `bun check-types` → 0 erros.

---

## Task 4: ActivityTabClient

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-client.tsx`

- [ ] **Step 1:**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useMemo, useState } from "react";

import {
	fetchToolActivityPage,
	type PeriodPreset,
	type ToolActivityFilters,
	type ToolActivityRow,
} from "@/app/dashboard/stock/actions";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { ActivityFilters } from "./activity-filters";
import { ActivityTimeline } from "./activity-timeline";

const ALL_REASONS = [
	"entrada_compra",
	"saida_venda",
	"ajuste_inventario",
	"perda",
	"outro",
] as const;

interface Props {
	branches: Array<{ id: string; name: string }>;
	initialCursor: string | null;
	initialItems: ToolActivityRow[];
	toolId: string;
}

export function ActivityTabClient({
	branches,
	initialCursor,
	initialItems,
	toolId,
}: Props) {
	const [period, setPeriod] = useState<PeriodPreset>("30d");
	const [branchId, setBranchId] = useState<string | undefined>();
	const [reasons, setReasons] = useState<string[]>([...ALL_REASONS]);

	const filters = useMemo<ToolActivityFilters>(
		() => ({ toolId, branchId, period, reasons }),
		[toolId, branchId, period, reasons]
	);

	const resetKey = JSON.stringify(filters);

	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems,
		initialCursor,
		fetchPage: (cursor) => fetchToolActivityPage(filters, cursor),
		resetKey,
	});

	const isFiltered =
		period !== "30d" || !!branchId || reasons.length !== ALL_REASONS.length;

	function toggleReason(reason: string) {
		setReasons((prev) =>
			prev.includes(reason)
				? prev.filter((r) => r !== reason)
				: [...prev, reason]
		);
	}

	function resetFilters() {
		setPeriod("30d");
		setBranchId(undefined);
		setReasons([...ALL_REASONS]);
	}

	return (
		<div className="flex flex-col gap-4">
			<ActivityFilters
				branchId={branchId}
				branches={branches}
				onBranchChange={setBranchId}
				onPeriodChange={setPeriod}
				onReasonToggle={toggleReason}
				period={period}
				reasons={reasons}
			/>

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
		</div>
	);
}
```

- [ ] **Step 2:** `bun check-types` → 0 erros.

---

## Task 5: Refactor ActivityTab (server)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab.tsx`

- [ ] **Step 1:** Substituir o conteúdo todo:

```tsx
import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { asc, eq } from "drizzle-orm";

import { fetchToolActivityPage } from "@/app/dashboard/stock/actions";

import { ActivityTabClient } from "./activity-tab-client";

const DEFAULT_REASONS = [
	"entrada_compra",
	"saida_venda",
	"ajuste_inventario",
	"perda",
	"outro",
];

async function fetchActiveBranches() {
	return db
		.select({ id: branch.id, name: branch.name })
		.from(branch)
		.where(eq(branch.status, "active"))
		.orderBy(asc(branch.name));
}

interface ActivityTabProps {
	toolId: string;
}

export async function ActivityTab({ toolId }: ActivityTabProps) {
	const [first, branches] = await Promise.all([
		fetchToolActivityPage(
			{ toolId, period: "30d", reasons: DEFAULT_REASONS },
			null
		),
		fetchActiveBranches(),
	]);

	return (
		<ActivityTabClient
			branches={branches}
			initialCursor={first.nextCursor}
			initialItems={first.items}
			toolId={toolId}
		/>
	);
}
```

- [ ] **Step 2:** `bun check-types` → 0 erros.

---

## Task 6: Smoke + commit + PR

- [ ] **Step 1:** Smoke `/dashboard/tools/[id]?tab=atividade`:
  - [ ] Default: "30 dias" highlighted, todas filiais, todos motivos.
  - [ ] Initial load mostra primeiros 20 movimentos (se houver).
  - [ ] Click "Carregar mais" → próxima página, sem dups.
  - [ ] Click "Hoje" → reseta lista, só hoje.
  - [ ] Trocar filial → reseta.
  - [ ] Deselecionar "Entrada" → filtra (sem entradas).
  - [ ] Deselecionar todos chips → empty state filtered.
  - [ ] "Limpar filtros" → volta ao default.
- [ ] **Step 2:** Verificar que rotas com `?tab=` outras (visao-geral, variantes, estoque, avaliacoes) continuam funcionando.

- [ ] **Step 3:** Commit + push + PR:

```bash
git add apps/web/src/ docs/superpowers/
git commit -m "feat(tools): paginação + filtros (período/filial/motivo) na timeline"
git push -u origin feat/activity-timeline-filters-pagination
gh pr create --title "feat(tools): filtros + paginação real na timeline" --body-file <body>
```

---

## Riscos

1. **`decodeCursor`/`encodeCursor` tipos genéricos:** se forem `<T extends string>` (não obj), refatorar pra `JSON.stringify`/`parse` antes do encode. Confirmar lendo o helper.
2. **Date cutoff timezone:** local TZ. Off-by-one perto meia-noite. Aceito.
3. **`reasons=[]` query:** se operador deselecionar tudo, `inArray([])` retorna 0 rows. Empty state cobre. (NÃO transformar `[]` em "todos" — confuso.)
4. **`getToolActivity` legacy:** mantém. Não breaking.
