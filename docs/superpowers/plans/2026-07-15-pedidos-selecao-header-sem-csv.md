# Pedidos — seleção no header e remoção do export CSV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o export CSV de Pedidos por completo (2 botões + rota + capability), enxugar a barra de ações em massa (sem "Limpar", nas 3 telas) e mover o controle de seleção pro slot de ação do header da página de Pedidos.

**Architecture:** A página server (`page.tsx`) continua dona de fetch/guards e passa a renderizar um único client component `OrdersView` (evolução de `OrdersInfinite`) que possui o estado de lista+seleção e renderiza o `PageHeader` com o `SelectionToolbar` no slot de ação; os pedaços server (painel de filtros, resumo de produto) entram como `ReactNode` via slots. `BulkActionBar` (compartilhada com Clientes e Avaliações) perde o botão "Limpar".

**Tech Stack:** Next 16 (App Router), React 19 (React Compiler ativo), ultracite/biome, vitest (node).

**Spec:** `docs/superpowers/specs/2026-07-15-pedidos-selecao-header-sem-csv-design.md`

## Global Constraints

- CWD é a RAIZ do monorepo — nunca `cd apps/web`; comandos `bun` da raiz, paths absolutos.
- Commits em Conventional Commits **em PT**, subject ≤50 chars, **zero atribuição de AI** (sem "Generated with", sem "Co-Authored-By: Claude").
- Hook PostToolUse roda `bun fix` após Write/Edit — pode reformatar o arquivo; se um Edit subsequente falhar com `string not found`, **re-Read antes de re-tentar**. lefthook roda `bun fix` + `git add -u` no commit.
- Anti-patterns banidos: `console.*` (usar `logger`), `: any`/`as any`/`@ts-ignore`, `key={index}`, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler), `try`/`finally` em componente (bailout do compiler).
- `bun check-types --force` (cache limpo) + `bun check` antes de cada commit. `check-types` NÃO pega regras de lint nem import de hook client em Server Component — por isso o smoke visual da Task 4 é obrigatório.
- Nada de `db:push`/seed/truncate — este trabalho não toca banco.
- Dev server da sessão já roda na porta **3006** (log `/tmp/dev-up-3006.log`, tab do browser já aberta). Não subir outro.

---

### Task 1: Remover o export CSV de Pedidos

**Files:**
- Delete: `apps/web/src/app/dashboard/orders/export/route.ts` (diretório `export/` inteiro)
- Delete: `apps/web/src/app/dashboard/orders/_components/export-csv-link.tsx`
- Modify: `apps/web/src/app/dashboard/orders/page.tsx` (imports + `canExport` + action do header)
- Modify: `apps/web/src/app/dashboard/orders/_components/orders-infinite.tsx:141-147` (ação CSV da barra)
- Modify: `apps/web/src/lib/capabilities.ts:204-210` (entrada `orders.export`)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `orders-infinite.tsx` com `BulkActionBar` recebendo `actions` condicional (array vazio quando nenhum pago selecionado) — a Task 3 reaproveita esse trecho.

**Contexto pro implementador:**
- `normalizeDateParam`/`buildOrdersListConditions`/`resolveTab` de `_lib/orders-where.ts` são usados por `data.ts` — **NÃO remover** (só a rota de export morre).
- Overrides órfãos de `orders.export` em `user_capability_override` são ignorados por `isCapability` (`permissions.ts:71`) — remover do catálogo é seguro, sem migração.

- [ ] **Step 1: Commitar a spec (aprovada no brainstorming, ainda não commitada)**

```bash
git add docs/superpowers/specs/2026-07-15-pedidos-selecao-header-sem-csv-design.md docs/superpowers/plans/2026-07-15-pedidos-selecao-header-sem-csv.md
git commit -m "docs: spec e plano da limpeza de pedidos"
```

- [ ] **Step 2: Deletar a rota de export e o link do header**

```bash
rm -rf /home/othavio/Projects/emach/emach-dashboard/apps/web/src/app/dashboard/orders/export
rm /home/othavio/Projects/emach/emach-dashboard/apps/web/src/app/dashboard/orders/_components/export-csv-link.tsx
```

- [ ] **Step 3: Limpar `page.tsx`**

Em `apps/web/src/app/dashboard/orders/page.tsx`:

Remover o import (linha 13):

```tsx
import { ExportCsvLink } from "./_components/export-csv-link";
```

Trocar o import de permissions (linha 12) — `can` fica sem uso:

```tsx
// antes
import { can, requireCapability } from "@/lib/permissions";
// depois
import { requireCapability } from "@/lib/permissions";
```

Remover a linha 67:

```tsx
const canExport = await can(session, "orders.export");
```

Com isso `session` fica sem uso — trocar a linha 66 para:

```tsx
await requireCapability("orders.read");
```

Trocar o `PageHeader` (linhas 135-143) para ficar sem `action`:

```tsx
<PageHeader
	description="Listagem operacional com busca por número e cliente, filtros por data e filial e atalhos para fulfillment."
	title="Pedidos"
/>
```

- [ ] **Step 4: Remover a ação "Exportar CSV" da barra em `orders-infinite.tsx`**

Trocar o bloco `<BulkActionBar …/>` (linhas 128-151) por:

```tsx
{sel.count > 0 && (
	<BulkActionBar
		actions={
			selectedPaidIds.length > 0
				? [
						{
							label: bulkPending
								? "Enviando…"
								: `Enviar para separação (${selectedPaidIds.length})`,
							run: runBulkSeparation,
						},
					]
				: []
		}
		onClear={sel.clear}
		selectedIds={sel.selectedIds}
	/>
)}
```

- [ ] **Step 5: Remover `orders.export` do catálogo de capabilities**

Em `apps/web/src/lib/capabilities.ts`, remover o bloco (linhas 204-210):

```ts
	"orders.export": {
		group: "Vendas",
		resource: "Pedidos",
		action: "Exportar",
		description: "Exportar pedidos",
		defaultRoles: SA,
	},
```

(`customers.export` fica — fora de escopo.)

- [ ] **Step 6: Verificar**

```bash
bun check-types --force && bun check
rg -n "orders.export|ExportCsvLink|orders/export" /home/othavio/Projects/emach/emach-dashboard/apps/web/src
```

Expected: check-types e check PASS; o `rg` só pode retornar `permissions.disabled.ts` (snapshot histórico com `@ts-nocheck`, não-importado — não mexer).

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src
git commit -m "refactor: remove export CSV de pedidos"
```

---

### Task 2: BulkActionBar sem "Limpar" (compartilhada, 3 telas)

**Files:**
- Modify: `apps/web/src/components/bulk/bulk-action-bar.tsx`
- Modify: `apps/web/src/app/dashboard/orders/_components/orders-infinite.tsx` (remover prop `onClear`)
- Modify: `apps/web/src/app/dashboard/customers/_components/customers-infinite.tsx:77-88` (idem)
- Modify: `apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx:100-110` (idem)

**Interfaces:**
- Consumes: `orders-infinite.tsx` no estado pós-Task 1 (ação CSV já removida).
- Produces: `BulkActionBar` com props `{ actions: BulkAction[]; selectedIds: string[] }` (sem `onClear`) — contrato que a Task 3 usa.

- [ ] **Step 1: Remover o botão e a prop do componente**

`apps/web/src/components/bulk/bulk-action-bar.tsx` — conteúdo completo novo:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import type { ReactNode } from "react";

export interface BulkAction {
	icon?: ReactNode;
	label: string;
	run: (ids: string[]) => void;
	variant?: "default" | "destructive" | "outline" | "secondary";
}

interface BulkActionBarProps {
	actions: BulkAction[];
	selectedIds: string[];
}

/**
 * Barra flutuante de ações em massa. Surge quando há ≥1 selecionado. As ações são
 * plugadas por listagem; cada uma recebe os IDs selecionados. Desmarcar/sair do
 * modo fica no SelectionToolbar — a barra não duplica esses controles.
 */
export function BulkActionBar({ actions, selectedIds }: BulkActionBarProps) {
	const count = selectedIds.length;
	return (
		<div className="sticky bottom-4 z-40 mt-4 flex items-center gap-4 rounded-xl border border-primary/60 bg-card px-4 py-3 shadow-lg">
			<span className="font-semibold text-foreground text-sm tabular-nums">
				{count} selecionado{count === 1 ? "" : "s"}
			</span>
			<div className="ml-auto flex items-center gap-2">
				{actions.map((action) => (
					<Button
						key={action.label}
						onClick={() => action.run(selectedIds)}
						size="sm"
						variant={action.variant ?? "secondary"}
					>
						{action.icon}
						{action.label}
					</Button>
				))}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Remover `onClear={sel.clear}` dos 3 consumidores**

Nos três arquivos, deletar a linha `onClear={sel.clear}` da chamada `<BulkActionBar …/>`:

`orders-infinite.tsx` (dentro do bloco escrito na Task 1 Step 4), `customers-infinite.tsx` (linha ~86) e `reviews-infinite.tsx` (linha ~107). Nenhuma outra mudança nesses arquivos — Clientes mantém a ação "Exportar CSV" dela; Avaliações mantém Aprovar/Rejeitar/Spam.

- [ ] **Step 3: Verificar**

```bash
bun check-types --force && bun check
rg -n "onClear" /home/othavio/Projects/emach/emach-dashboard/apps/web/src
```

Expected: PASS; `rg` sem resultados.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/bulk/bulk-action-bar.tsx apps/web/src/app/dashboard/orders/_components/orders-infinite.tsx apps/web/src/app/dashboard/customers/_components/customers-infinite.tsx apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx
git commit -m "refactor: remove Limpar da BulkActionBar"
```

---

### Task 3: `OrdersView` — seleção no header, slots e Empty interno

**Files:**
- Create: `apps/web/src/app/dashboard/orders/_components/orders-view.tsx`
- Delete: `apps/web/src/app/dashboard/orders/_components/orders-infinite.tsx` (substituído)
- Modify: `apps/web/src/app/dashboard/orders/page.tsx` (reescrita do render)

**Interfaces:**
- Consumes: `BulkActionBar` pós-Task 2 (`{ actions, selectedIds }`); `SelectionToolbar` inalterado (`{ active, allLoadedSelected, loadedCount, onCancel, onEnter, onToggleAll }`); `PageHeader` (`{ action?, description?, title }`, JSX puro — client-safe); `OrderCardGrid` (`{ highlightToolId?, items, selection?, tabKey }`).
- Produces: `OrdersView` com props `{ filters: OrdersPageFiltersInput; filtersSlot: ReactNode; hasFilters: boolean; highlightToolId?: string | null; initial: OrderListItem[]; initialCursor: string | null; summarySlot: ReactNode; tabKey: string }`.

**Contexto pro implementador:**
- `PageHeader` (`src/components/page-header.tsx`) não tem dado server-only — importá-lo num client component mantém SSR normal.
- O `SelectionToolbar` só renderiza no header quando `items.length > 0` (com lista vazia o botão "Selecionar" não faz sentido; preserva o comportamento atual, em que a página trocava a lista inteira pelo `<Empty>`).
- Não introduzir `try`/`finally` (React Compiler baila) — manter o fluxo do `runBulkSeparation` como está.

- [ ] **Step 1: Criar `orders-view.tsx`**

Conteúdo completo:

```tsx
"use client";

import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { PageHeader } from "@/components/page-header";
import { notify } from "@/lib/notify";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { bulkStartSeparation, fetchOrdersPage } from "../actions";
import type { OrderListItem, OrdersPageFiltersInput } from "../data";
import { OrderCardGrid } from "./order-card-grid";

interface OrdersViewProps {
	filters: OrdersPageFiltersInput;
	/** Painel de filtros (Server Component), renderizado entre o header e o grid. */
	filtersSlot: ReactNode;
	hasFilters: boolean;
	highlightToolId?: string | null;
	initial: OrderListItem[];
	initialCursor: string | null;
	/** Resumo do filtro de produto (Server Component), quando ativo. */
	summarySlot: ReactNode;
	tabKey: string;
}

function pluralSuffix(count: number): string {
	return count === 1 ? "" : "s";
}

/**
 * Extraído do callback de `runBulkSeparation` para ficar sob o teto de
 * complexidade cognitiva do ultracite (o inline original somava 23 > 20
 * pelas ramificações + ternários no template).
 */
function buildBulkSeparationToast(
	moved: number,
	skipped: { number: string; reason: string }[]
): { kind: "success" | "warning"; message: string } {
	if (skipped.length === 0) {
		return {
			kind: "success",
			message: `${moved} pedido${pluralSuffix(moved)} enviado${pluralSuffix(moved)} para separação`,
		};
	}
	const detail = skipped.map((s) => `${s.number} (${s.reason})`).join(", ");
	return {
		kind: "warning",
		message: `${moved} enviado${pluralSuffix(moved)} para separação · ${skipped.length} pulado${pluralSuffix(skipped.length)}: ${detail}`,
	};
}

/**
 * Casca client da página de Pedidos: possui o estado de lista+seleção e por
 * isso renderiza o PageHeader ele mesmo — o SelectionToolbar vive no slot de
 * ação do header. Os pedaços server (filtros, resumo) entram via slots.
 */
export function OrdersView({
	filters,
	filtersSlot,
	hasFilters,
	highlightToolId,
	initial,
	initialCursor,
	summarySlot,
	tabKey,
}: OrdersViewProps) {
	const router = useRouter();
	// Bump força o useInfiniteList a re-sincronizar com o initial revalidado
	// após uma mutação em massa (router.refresh não reseta client state).
	const [refreshTick, setRefreshTick] = useState(0);
	const resetKey = `${JSON.stringify(filters)}:${refreshTick}`;
	const [bulkPending, startBulk] = useTransition();
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchOrdersPage({ filters, cursor }),
		resetKey,
	});
	const sel = useBulkSelection({
		items,
		getId: (o) => o.id,
		resetKey,
	});

	const paidById = new Map(items.map((o) => [o.id, o.status === "paid"]));
	const selectedPaidIds = sel.selectedIds.filter((id) => paidById.get(id));

	const runBulkSeparation = () => {
		startBulk(async () => {
			const result = await bulkStartSeparation({ orderIds: selectedPaidIds });
			// Refresh SEMPRE: cada pedido é uma transação própria, então um lote que
			// retorna {ok:false} pode ter movido parte deles antes de abortar — sem
			// isso, a lista seguiria mostrando "Pago" para pedido já em separação.
			setRefreshTick((t) => t + 1);
			router.refresh();
			if (!result.ok) {
				notify.error(result.error);
				return;
			}
			const { kind, message } = buildBulkSeparationToast(
				result.data.moved,
				result.data.skipped
			);
			notify[kind](message);
			sel.exit();
		});
	};

	return (
		<>
			<PageHeader
				action={
					items.length > 0 ? (
						<SelectionToolbar
							active={sel.active}
							allLoadedSelected={sel.allLoadedSelected}
							loadedCount={items.length}
							onCancel={sel.exit}
							onEnter={sel.enter}
							onToggleAll={
								sel.allLoadedSelected ? sel.clear : sel.selectAllLoaded
							}
						/>
					) : undefined
				}
				description="Listagem operacional com busca por número e cliente, filtros por data e filial e atalhos para fulfillment."
				title="Pedidos"
			/>

			{filtersSlot}
			{summarySlot}

			{items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhum pedido encontrado</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Ajuste os filtros para ampliar a busca."
								: "Nenhum pedido nesta etapa. Use a aba “Todos” para ver o histórico completo."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters && (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/orders"
							>
								Limpar filtros
							</Link>
						)}
					</EmptyContent>
				</Empty>
			) : (
				<div aria-live="polite">
					<OrderCardGrid
						highlightToolId={highlightToolId}
						items={items}
						selection={{
							active: sel.active,
							isSelected: sel.isSelected,
							onToggle: sel.toggle,
						}}
						tabKey={tabKey}
					/>
					<InfiniteSentinel
						error={error}
						hasMore={hasMore}
						onLoadMore={loadMore}
						pending={pending}
					/>
					{sel.count > 0 && (
						<BulkActionBar
							actions={
								selectedPaidIds.length > 0
									? [
											{
												label: bulkPending
													? "Enviando…"
													: `Enviar para separação (${selectedPaidIds.length})`,
												run: runBulkSeparation,
											},
										]
									: []
							}
							selectedIds={sel.selectedIds}
						/>
					)}
				</div>
			)}
		</>
	);
}
```

- [ ] **Step 2: Reescrever o render de `page.tsx`**

Conteúdo completo novo de `apps/web/src/app/dashboard/orders/page.tsx`:

```tsx
import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { LateOrdersToast } from "./_components/late-orders-toast";
import { OrderFiltersPanel } from "./_components/order-list-filters";
import { OrdersView } from "./_components/orders-view";
import { ProductFilterSummary } from "./_components/product-filter-summary";
import {
	fetchOrdersPage,
	fetchOrdersProductSummary,
	getOrdersTabCounts,
	getToolName,
	listOrderBranches,
	listOrderCarrierOptions,
	listOrderToolOptions,
	type OrderListFilters,
	type OrdersPageFiltersInput,
} from "./data";
import { ordersListFiltersSchema } from "./schema";
import { canonicalOrderTabKey, DEFAULT_ORDER_TAB } from "./status-meta";

export const metadata: Metadata = {
	title: "Pedidos",
};

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// URL atual sem `productId` — destino do "limpar filtro" do resumo de produto.
function buildClearProductHref(
	raw: Record<string, string | string[] | undefined>
): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(raw)) {
		if (key === "productId" || value === undefined) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const v of value) {
				params.append(key, v);
			}
		} else {
			params.set(key, value);
		}
	}
	const qs = params.toString();
	return `/dashboard/orders${qs ? `?${qs}` : ""}`;
}

export default function OrdersPage({ searchParams }: PageProps) {
	return <OrdersPageContent searchParams={searchParams} />;
}

async function OrdersPageContent({ searchParams }: PageProps) {
	await requireCapability("orders.read");
	const raw = await searchParams;
	const parsed = ordersListFiltersSchema.safeParse(raw);
	const data = parsed.success ? parsed.data : ordersListFiltersSchema.parse({});

	// Sem ?tab na URL → abre na fila de entrada ("Pago"), não em todos.
	// Canonicaliza o alias legado (to_prepare→paid) antes de tudo, senão o
	// hasFilters trata o alias como filtro ativo e acende "Limpar filtros".
	const activeTab = canonicalOrderTabKey(data.tab) ?? DEFAULT_ORDER_TAB;

	const filters: OrderListFilters = {
		tab: activeTab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		carrier: data.carrier,
		toolId: data.productId,
		// Só faz sentido dentro da aba Atrasados; fora dela não propaga.
		lateStatus: activeTab === "late" ? data.lateStatus : undefined,
	};

	const pageFilters: OrdersPageFiltersInput = {
		tab: activeTab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		carrier: data.carrier,
		toolId: data.productId,
		// Só faz sentido dentro da aba Atrasados; fora dela não propaga.
		lateStatus: activeTab === "late" ? data.lateStatus : undefined,
	};

	const [
		branches,
		counts,
		result,
		carrierOptions,
		toolOptions,
		productSummary,
		productName,
	] = await Promise.all([
		listOrderBranches(),
		getOrdersTabCounts(),
		fetchOrdersPage({ filters: pageFilters, cursor: null }),
		listOrderCarrierOptions(),
		listOrderToolOptions(),
		fetchOrdersProductSummary({ filters: pageFilters }),
		data.productId ? getToolName(data.productId) : Promise.resolve(null),
	]);

	const clearProductHref = buildClearProductHref(raw);

	// O tab default ("Pago") não conta como filtro ativo — só desvios dele.
	const hasFilters = Boolean(
		filters.q ||
			filters.from ||
			filters.to ||
			filters.branchId ||
			data.carrier ||
			data.productId ||
			activeTab !== DEFAULT_ORDER_TAB
	);

	return (
		<>
			<LateOrdersToast count={counts.late ?? 0} />
			<OrdersView
				filters={pageFilters}
				filtersSlot={
					<OrderFiltersPanel
						branches={branches}
						carrierOptions={carrierOptions}
						counts={counts}
						filters={filters}
						toolOptions={toolOptions}
					/>
				}
				hasFilters={hasFilters}
				highlightToolId={data.productId ?? null}
				initial={result.items}
				initialCursor={result.nextCursor}
				summarySlot={
					productSummary && productName ? (
						<ProductFilterSummary
							clearHref={clearProductHref}
							name={productName}
							orders={productSummary.orders}
							units={productSummary.units}
						/>
					) : null
				}
				tabKey={activeTab}
			/>
		</>
	);
}
```

Nota: `page.tsx` deixa de importar `buttonVariants`, `Empty*`, `Link` e `PageHeader` (foram pro `OrdersView`). O `fetchOrdersPage` do `page.tsx` vem de `./data` (server); o do `OrdersView` vem de `../actions` (wrapper `"use server"` chamável de client) — **são imports diferentes de propósito**, manter cada um como está.

- [ ] **Step 3: Deletar o componente antigo**

```bash
rm /home/othavio/Projects/emach/emach-dashboard/apps/web/src/app/dashboard/orders/_components/orders-infinite.tsx
```

- [ ] **Step 4: Verificar**

```bash
bun check-types --force && bun check && bun --cwd /home/othavio/Projects/emach/emach-dashboard/apps/web test
rg -n "OrdersInfinite|orders-infinite" /home/othavio/Projects/emach/emach-dashboard/apps/web/src
```

Expected: os três PASS (suíte estava verde com 694 testes); `rg` sem resultados.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/app/dashboard/orders
git commit -m "refactor: move seleção pro header de pedidos"
```

---

### Task 4: Verificação integrada (smoke visual nas 3 telas)

**Files:** nenhum (só verificação).

**Interfaces:**
- Consumes: tudo das Tasks 1-3.
- Produces: evidência (screenshots + checks) de que as 3 provas de "pronto" foram cumpridas.

**Contexto:** o dev server da sessão já roda na porta 3006 com tab do browser aberta. Se o executor não tiver acesso ao browser da sessão, reportar o que não conseguiu verificar em vez de declarar concluído.

- [ ] **Step 1: Gate funcional completo**

```bash
bun verify
```

Expected: check-types + check + testes, todos PASS.

- [ ] **Step 2: Rota de export morta**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3006/dashboard/orders/export
```

Expected: `404`.

- [ ] **Step 3: Smoke visual — Pedidos** (`http://localhost:3006/dashboard/orders`)

1. Header: sem "Exportar CSV"; botão "Selecionar" no slot de ação (topo direito).
2. Acima do grid: **nenhum** controle solto (a linha `mb-3 flex justify-end` morreu).
3. Clicar "Selecionar" → header mostra "Selecionar todos (N)" + "Cancelar".
4. Marcar 1 pedido pago → barra inferior mostra apenas `1 selecionado · Enviar para separação (1)` (sem CSV, sem "Limpar").
5. Marcar um pedido não-pago em outra aba (ex.: Enviados) → barra mostra só a contagem, sem botões (comportamento documentado na spec §3).
6. "Selecionar todos" → "Desmarcar todos" desmarca; "Cancelar" sai do modo.
7. Executar "Enviar para separação" com 1 pedido de teste → toast de sucesso e card some da aba "Pago"; se a aba esvaziar, o `<Empty>` aparece na hora.
8. Console do browser sem erros novos (`read_console_messages` com `onlyErrors: true`).
9. Screenshot lado a lado antes/depois (o "antes" já foi capturado no brainstorming: ss_0408zd9o2).

- [ ] **Step 4: Smoke visual — Clientes** (`http://localhost:3006/dashboard/customers`)

Selecionar 1+ cliente → barra inferior: `N selecionado(s) · Exportar CSV` (CSV **presente**, "Limpar" ausente). "Cancelar"/"Desmarcar todos" no toolbar acima do grid seguem funcionando.

- [ ] **Step 5: Smoke visual — Avaliações** (`http://localhost:3006/dashboard/reviews`)

Selecionar 1+ avaliação → barra inferior: `N selecionado(s) · [Aprovar] [Rejeitar] [Spam]` ("Limpar" ausente). Toolbar acima do grid segue funcionando.

- [ ] **Step 6: UI de permissões sem a linha órfã** (`http://localhost:3006/dashboard/users/<qualquer-id>` → aba Permissões)

A linha "Pedidos · Exportar" sumiu do grid; "Clientes · Exportar" continua.
