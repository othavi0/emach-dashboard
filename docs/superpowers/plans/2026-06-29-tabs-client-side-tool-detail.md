# Tabs client-side no detalhe da ferramenta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a navegação entre tabs do detalhe da ferramenta 100% client-side — trocar de tab não toca o servidor (zero re-auth, zero re-busca do `detail`).

**Architecture:** A página (Server Component) roda uma vez na entrada (auth + `getToolDetail`). Tabs eager (visão-geral/variantes/estoque) são renderizadas de `detail` e passadas como `ReactNode` para um shell client que troca via Base UI + `history.replaceState` (sem `router.replace`). Tabs lazy (atividade/avaliações) montam um loader client na 1ª ativação, que busca via `"use server"` action. A ação do header lê a tab ativa de um React Context próprio do shell.

**Tech Stack:** Next 16 App Router, React 19 (React Compiler ativo), Base UI Tabs (`@emach/ui/components/tabs`), vitest (node env), `"use server"` actions.

## Global Constraints

- React Compiler ativo — **NÃO** usar `useMemo`/`useCallback`/`React.forwardRef` manuais.
- Anti-patterns banidos: `console.*` (usar `logger`), `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`, `key={index}`, `<img>` puro, barrel files.
- `"use server"`: só async functions podem ser exportadas; **nunca** re-exportar tipo/const de arquivo `"use server"` (quebra `bun run build`, não pego por `check-types`/lint).
- Client Component **nunca** importa fn de módulo `server-only`/`@emach/db`; dados lazy vêm via `"use server"` action; tipos via `import type`.
- `@/...` → `apps/web/src/...`.
- Gates de verificação: `bun check-types` + `bun check` (ultracite) + `bun --cwd apps/web test` (= `bun verify`) **e** `bun run build` (gate do `"use server"`). UI verificada por smoke no browser (Resource Timing) — a vitest é node-env, sem RTL/jsdom.
- Capabilities exatas: `stock.read` (atividade), `reviews.read` (avaliações), `tools.update`/`tools.delete` (ações de tool).
- Todos os comandos rodam da RAIZ do monorepo: `/home/othavio/Projects/emach/emach-dashboard-3/emach-dashboard`.

## File Structure

- **Create** `apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.ts` — helper puro `buildTabHref` (lógica do `?tab=`).
- **Create** `apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.test.ts` — teste vitest do helper.
- **Create** `apps/web/src/app/dashboard/tools/[id]/_lib/tab-actions.ts` — `"use server"`: `fetchToolActivityInitAction`, `fetchToolReviewsAction`, `fetchActiveSuppliersAction`.
- **Create** `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-tabs.tsx` — shell client + `TabActiveContext`/`useActiveTab`.
- **Create** `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-loader.tsx` — loader client da atividade.
- **Create** `apps/web/src/app/dashboard/tools/[id]/_components/reviews-tab-loader.tsx` — loader client das avaliações.
- **Modify** `apps/web/src/app/dashboard/tools/[id]/_components/tool-reviews-section.tsx` — tornar client-renderável.
- **Modify** `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx` — vira client, lê `useActiveTab`.
- **Modify** `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx` — suppliers buscados na abertura da sheet.
- **Modify** `apps/web/src/app/dashboard/tools/[id]/page.tsx` — montar eager de `detail`, passar ao shell, `initialTab` do `?tab`.

**Intacto:** `EntityTabs` compartilhado (`@/components/entity/entity-tabs`) e as outras 8 páginas de detalhe; `OverviewTab`/`VariantsTab`/`EstoqueTab` (core); `ActivityTabClient`.

---

### Task 1: Helper puro `buildTabHref` (TDD)

Extrai a lógica de URL da troca de tab (hoje inline em `EntityTabs.handleChange`) para uma função pura testável.

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.ts`
- Test: `apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.test.ts`

**Interfaces:**
- Produces: `buildTabHref(pathname: string, params: URLSearchParams, tab: string, defaultValue: string, paramName?: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.test.ts
import { describe, expect, it } from "vitest";
import { buildTabHref } from "./tab-url";

describe("buildTabHref", () => {
	it("remove o param ao voltar para a tab default", () => {
		const params = new URLSearchParams("tab=estoque");
		expect(
			buildTabHref("/dashboard/tools/1", params, "visao-geral", "visao-geral")
		).toBe("/dashboard/tools/1");
	});

	it("seta o param para tab não-default", () => {
		const params = new URLSearchParams();
		expect(
			buildTabHref("/dashboard/tools/1", params, "estoque", "visao-geral")
		).toBe("/dashboard/tools/1?tab=estoque");
	});

	it("descarta o param variant ao trocar de tab", () => {
		const params = new URLSearchParams("tab=variantes&variant=v1");
		expect(
			buildTabHref("/dashboard/tools/1", params, "estoque", "visao-geral")
		).toBe("/dashboard/tools/1?tab=estoque");
	});

	it("preserva outros params", () => {
		const params = new URLSearchParams("q=abc");
		expect(
			buildTabHref("/dashboard/tools/1", params, "estoque", "visao-geral")
		).toBe("/dashboard/tools/1?q=abc&tab=estoque");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test tab-url`
Expected: FAIL — `buildTabHref` is not defined / cannot find module `./tab-url`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.ts
export function buildTabHref(
	pathname: string,
	params: URLSearchParams,
	tab: string,
	defaultValue: string,
	paramName = "tab"
): string {
	const sp = new URLSearchParams(params);
	sp.delete("variant");
	if (tab === defaultValue) {
		sp.delete(paramName);
	} else {
		sp.set(paramName, tab);
	}
	const qs = sp.toString();
	return qs ? `${pathname}?${qs}` : pathname;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test tab-url`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.ts" "apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.test.ts"
git commit -m "feat(tools): helper buildTabHref para URL de tab"
```

---

### Task 2: `"use server"` actions para dados lazy

Wrappers `"use server"` com guard, espelhando o padrão de `fetchToolActivityPageAction` (`stock/actions.ts:361`).

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_lib/tab-actions.ts`

**Interfaces:**
- Consumes: `fetchToolActivityPage` + `ToolActivityRow` (`@/app/dashboard/stock/tool-activity-data`), `getActiveBranches` + `ActiveBranchOption` (`@/app/dashboard/branches/data`), `getToolReviewsSummary` + `ToolReviewSummary` (`./reviews-data`), `getActiveSuppliers` + `ActiveSupplierOption` (`@/lib/suppliers`), `requireCapability` (`@/lib/permissions`), `InfiniteResult` (`@/lib/infinite`).
- Produces:
  - `fetchToolActivityInitAction(toolId: string): Promise<{ items: ToolActivityRow[]; nextCursor: string | null; branches: ActiveBranchOption[] }>`
  - `fetchToolReviewsAction(toolId: string): Promise<ToolReviewSummary>`
  - `fetchActiveSuppliersAction(): Promise<ActiveSupplierOption[]>`

- [ ] **Step 1: Write the action file**

```ts
// apps/web/src/app/dashboard/tools/[id]/_lib/tab-actions.ts
"use server";

import { getActiveBranches } from "@/app/dashboard/branches/data";
import {
	fetchToolActivityPage,
	type ToolActivityRow,
} from "@/app/dashboard/stock/tool-activity-data";
import type { InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import { getActiveSuppliers } from "@/lib/suppliers";
import type { ActiveBranchOption } from "@/app/dashboard/branches/data";
import type { ActiveSupplierOption } from "@/lib/suppliers";
import { getToolReviewsSummary } from "./reviews-data";
import type { ToolReviewSummary } from "./reviews-data";

// Espelha os defaults do ActivityTab original (activity-tab.tsx).
const DEFAULT_REASONS = [
	"entrada_compra",
	"saida_venda",
	"ajuste_inventario",
	"perda",
	"outro",
];

export async function fetchToolActivityInitAction(toolId: string): Promise<{
	items: ToolActivityRow[];
	nextCursor: string | null;
	branches: ActiveBranchOption[];
}> {
	// Mesmo guard de fetchToolActivityPageAction (stock/actions.ts) no caminho sem branchId.
	await requireCapability("stock.read");
	const [first, branches]: [InfiniteResult<ToolActivityRow>, ActiveBranchOption[]] =
		await Promise.all([
			fetchToolActivityPage(
				{ toolId, period: "30d", reasons: DEFAULT_REASONS },
				null
			),
			getActiveBranches(),
		]);
	return { items: first.items, nextCursor: first.nextCursor, branches };
}

export async function fetchToolReviewsAction(
	toolId: string
): Promise<ToolReviewSummary> {
	await requireCapability("reviews.read");
	return await getToolReviewsSummary(toolId);
}

export async function fetchActiveSuppliersAction(): Promise<
	ActiveSupplierOption[]
> {
	await requireCapability("stock.read");
	return await getActiveSuppliers();
}
```

- [ ] **Step 2: Verify types + build gate**

Run: `bun --cwd apps/web check-types`
Expected: PASS. Se `ActiveSupplierOption`/`InfiniteResult` não baterem, abra os módulos de origem e ajuste o `import type`.

Run: `bun run build`
Expected: PASS — confirma que o arquivo `"use server"` exporta só async functions.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_lib/tab-actions.ts"
git commit -m "feat(tools): use server actions para dados lazy das tabs"
```

---

### Task 3: Shell client `ToolDetailTabs` + `TabActiveContext`

O shell controla a tab ativa, faz o sync de URL via `history.replaceState`, e expõe a tab ativa via Context para o header.

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-tabs.tsx`

**Interfaces:**
- Consumes: `buildTabHref` (`../_lib/tab-url`), `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (`@emach/ui/components/tabs`).
- Produces:
  - `useActiveTab(): string`
  - `interface ToolDetailTab { value: string; label: ReactNode; icon?: ReactNode; badge?: ReactNode; content: ReactNode; lazy?: boolean }`
  - `ToolDetailTabs(props: { defaultValue: string; initialTab: string; header: ReactNode; tabs: ToolDetailTab[] }): JSX.Element`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-tabs.tsx
"use client";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { usePathname, useSearchParams } from "next/navigation";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { buildTabHref } from "../_lib/tab-url";

const TabActiveContext = createContext<string>("");

export function useActiveTab(): string {
	return useContext(TabActiveContext);
}

export interface ToolDetailTab {
	badge?: ReactNode;
	content: ReactNode;
	icon?: ReactNode;
	label: ReactNode;
	lazy?: boolean;
	value: string;
}

interface Props {
	defaultValue: string;
	header: ReactNode;
	initialTab: string;
	tabs: ToolDetailTab[];
}

export function ToolDetailTabs({
	defaultValue,
	header,
	initialTab,
	tabs,
}: Props) {
	const pathname = usePathname();
	const params = useSearchParams();
	const [active, setActive] = useState(initialTab);
	// Tabs lazy só montam após a 1ª ativação; depois ficam montadas (cache).
	const [activated, setActivated] = useState<Set<string>>(
		() => new Set([initialTab])
	);

	const activate = (next: string) => {
		setActivated((prev) => {
			if (prev.has(next)) {
				return prev;
			}
			const updated = new Set(prev);
			updated.add(next);
			return updated;
		});
	};

	const handleChange = (next: string) => {
		setActive(next);
		activate(next);
		// history.replaceState NÃO dispara RSC (diferente de router.replace).
		const href = buildTabHref(
			pathname,
			new URLSearchParams(params),
			next,
			defaultValue
		);
		window.history.replaceState(null, "", href);
	};

	// Voltar/avançar do browser: sincroniza a tab ativa pela URL.
	useEffect(() => {
		const onPop = () => {
			const tab =
				new URLSearchParams(window.location.search).get("tab") ?? defaultValue;
			setActive(tab);
			activate(tab);
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, [defaultValue]);

	return (
		<TabActiveContext.Provider value={active}>
			<div className="flex flex-col gap-4">
				{header}
				<Tabs className="w-full" onValueChange={handleChange} value={active}>
					<TabsList className="w-full justify-start" scrollable>
						{tabs.map((tab) => (
							<TabsTrigger
								className="flex items-center gap-1.5"
								key={tab.value}
								value={tab.value}
							>
								{tab.icon}
								{tab.label}
								{tab.badge}
							</TabsTrigger>
						))}
					</TabsList>
					{tabs.map((tab) => (
						<TabsContent
							className="mt-4"
							key={tab.value}
							keepMounted
							value={tab.value}
						>
							{tab.lazy && !activated.has(tab.value) ? null : tab.content}
						</TabsContent>
					))}
				</Tabs>
			</div>
		</TabActiveContext.Provider>
	);
}
```

- [ ] **Step 2: Verify types**

Run: `bun --cwd apps/web check-types`
Expected: PASS. (`keepMounted` é prop válida do `TabsContent` → Base UI `Tabs.Panel`. Se o tipo reclamar, confirme em `packages/ui/src/components/tabs.tsx` que `TabsContent` repassa `...props` para `TabsPrimitive.Panel`.)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-tabs.tsx"
git commit -m "feat(tools): shell client ToolDetailTabs com sync de URL via history"
```

---

### Task 4: Loaders lazy (atividade + avaliações)

Componentes client que buscam os dados na 1ª montagem via as actions da Task 2.

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/tool-reviews-section.tsx`
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/reviews-tab-loader.tsx`
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-loader.tsx`

**Interfaces:**
- Consumes: `fetchToolActivityInitAction`/`fetchToolReviewsAction` (`../_lib/tab-actions`), `ActivityTabClient` (`./activity-tab-client`), `ToolReviewsSection` (`./tool-reviews-section`).
- Produces: `ActivityTabLoader({ toolId }): JSX.Element`, `ReviewsTabLoader({ toolId }): JSX.Element`.

- [ ] **Step 1: Tornar `ToolReviewsSection` client-renderável**

Abra `tool-reviews-section.tsx`. Se ele **não** importa nada de `server-only`/`@emach/db` (só renderiza `summary`/`toolId` — presentational), adicione `"use client";` como primeira linha. Se importar algo server-only, mova esse uso para o caller e mantenha o componente presentational.

Run: `rtk proxy grep -nE "server-only|@emach/db" "apps/web/src/app/dashboard/tools/[id]/_components/tool-reviews-section.tsx"`
Expected: nenhuma linha (presentational) → adicionar `"use client";` no topo é seguro.

- [ ] **Step 2: Criar `ReviewsTabLoader`**

```tsx
// apps/web/src/app/dashboard/tools/[id]/_components/reviews-tab-loader.tsx
"use client";

import { useEffect, useState } from "react";
import type { ToolReviewSummary } from "../_lib/reviews-data";
import { fetchToolReviewsAction } from "../_lib/tab-actions";
import { ToolReviewsSection } from "./tool-reviews-section";

export function ReviewsTabLoader({ toolId }: { toolId: string }) {
	const [summary, setSummary] = useState<ToolReviewSummary | null>(null);

	useEffect(() => {
		let active = true;
		fetchToolReviewsAction(toolId).then((data) => {
			if (active) {
				setSummary(data);
			}
		});
		return () => {
			active = false;
		};
	}, [toolId]);

	if (!summary) {
		return (
			<div className="h-32 animate-pulse rounded-md bg-muted" aria-busy="true" />
		);
	}
	return <ToolReviewsSection summary={summary} toolId={toolId} />;
}
```

- [ ] **Step 3: Criar `ActivityTabLoader`**

```tsx
// apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-loader.tsx
"use client";

import { useEffect, useState } from "react";
import type { ToolActivityRow } from "@/app/dashboard/stock/tool-activity-data";
import type { ActiveBranchOption } from "@/app/dashboard/branches/data";
import { fetchToolActivityInitAction } from "../_lib/tab-actions";
import { ActivityTabClient } from "./activity-tab-client";

interface InitData {
	branches: ActiveBranchOption[];
	items: ToolActivityRow[];
	nextCursor: string | null;
}

export function ActivityTabLoader({ toolId }: { toolId: string }) {
	const [data, setData] = useState<InitData | null>(null);

	useEffect(() => {
		let active = true;
		fetchToolActivityInitAction(toolId).then((result) => {
			if (active) {
				setData(result);
			}
		});
		return () => {
			active = false;
		};
	}, [toolId]);

	if (!data) {
		return (
			<div className="h-32 animate-pulse rounded-md bg-muted" aria-busy="true" />
		);
	}
	return (
		<ActivityTabClient
			branches={data.branches}
			initialCursor={data.nextCursor}
			initialItems={data.items}
			toolId={toolId}
		/>
	);
}
```

- [ ] **Step 4: Verify types + build**

Run: `bun --cwd apps/web check-types`
Expected: PASS.

Run: `bun run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_components/tool-reviews-section.tsx" "apps/web/src/app/dashboard/tools/[id]/_components/reviews-tab-loader.tsx" "apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-loader.tsx"
git commit -m "feat(tools): loaders lazy client para atividade e avaliacoes"
```

---

### Task 5: `ToolDetailActions` → client (lê tab ativa do Context)

A ação do header passa a reagir à tab ativa no cliente em vez de receber `tab` do servidor.

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx`

**Interfaces:**
- Consumes: `useActiveTab` (`./tool-detail-tabs`).
- Produces: `ToolDetailActions({ canMutate, toolId }): JSX.Element | null` (remove a prop `tab`).

- [ ] **Step 1: Reescrever o componente**

```tsx
// apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx
"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useActiveTab } from "./tool-detail-tabs";

interface ToolDetailActionsProps {
	canMutate: boolean;
	toolId: string;
}

/**
 * Ação contextual do header. "Editar ferramenta" aparece só na Visão geral
 * (edição é form grande → página `/edit`). A tab ativa vem do contexto client
 * do ToolDetailTabs (sem re-render do servidor ao trocar de tab).
 */
export function ToolDetailActions({
	toolId,
	canMutate,
}: ToolDetailActionsProps) {
	const tab = useActiveTab();
	if (!(canMutate && tab === "visao-geral")) {
		return null;
	}
	return (
		<Link
			className={buttonVariants({ size: "sm", variant: "default" })}
			href={`/dashboard/tools/${toolId}/edit`}
		>
			<Pencil aria-hidden className="mr-1.5 size-3.5" />
			Editar ferramenta
		</Link>
	);
}
```

- [ ] **Step 2: Sem verificação/commit isolados**

Tasks 5–7 mudam props acopladas (header → página → estoque) e **só compilam juntas**. Não rode `check-types` esperando verde aqui, nem commite. Siga direto para as Tasks 6 e 7; o verde e o **commit único** acontecem no fim da Task 7. (Para subagent-driven: despachar Tasks 5–7 como **uma unidade**.)

---

### Task 6: Religar `page.tsx` ao shell client

A página renderiza as tabs eager de `detail` (uma vez), passa os loaders lazy, e delega a troca ao shell. Remove o switching server-side por `?tab=`.

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/page.tsx`

**Interfaces:**
- Consumes: `ToolDetailTabs` + `ToolDetailTab` (`./_components/tool-detail-tabs`), `ActivityTabLoader` (`./_components/activity-tab-loader`), `ReviewsTabLoader` (`./_components/reviews-tab-loader`).

- [ ] **Step 1: Reescrever o corpo de `ToolDetailPageContent`**

Substitua o conteúdo de `apps/web/src/app/dashboard/tools/[id]/page.tsx` (mantendo `metadata`, `PageProps`, `ToolDetailPage`) pelo seguinte `ToolDetailPageContent`. As tabs eager (visão-geral/variantes/estoque) renderizam **sempre** de `detail`; atividade/avaliações são loaders lazy. Remove `getToolReviewsSummary`/`getActiveSuppliers` do caminho da página (vão para as actions/sheet).

```tsx
async function ToolDetailPageContent({ params, searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const [{ id }, { tab, variant }] = await Promise.all([params, searchParams]);
	const [canMutate, canDelete, detail] = await Promise.all([
		can(session, "tools.update"),
		can(session, "tools.delete"),
		getToolDetail(id),
	]);

	if (!detail) {
		notFound();
	}

	const defaultValue = "visao-geral";
	// ?variant= define a tab inicial (Variantes) só quando nenhuma ?tab= explícita foi dada.
	const initialTab = tab ?? (variant ? "variantes" : defaultValue);

	const alertCount =
		detail.stockSummary.criticalCount + detail.stockSummary.reorderCount;

	const tabs: ToolDetailTab[] = [
		{
			value: "visao-geral",
			label: "Visão geral",
			icon: <Info aria-hidden className="size-3.5" />,
			content: (
				<OverviewTab
					attributes={detail.attributes}
					categories={detail.categories}
					images={detail.images}
					stockSummary={detail.stockSummary}
					tool={detail.tool}
				/>
			),
		},
		{
			value: "variantes",
			label: "Variantes & preços",
			icon: <Tag aria-hidden className="size-3.5" />,
			content: (
				<VariantsTab
					canDelete={canDelete}
					canMutate={canMutate}
					highlightVariantId={variant}
					orderedVariantIds={detail.orderedVariantIds}
					toolId={detail.tool.id}
					toolName={detail.tool.name}
					variants={detail.variants}
				/>
			),
		},
		{
			value: "estoque",
			label: "Estoque",
			icon: <Boxes aria-hidden className="size-3.5" />,
			badge:
				alertCount > 0 ? (
					<span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
						{alertCount}
					</span>
				) : undefined,
			content: (
				<EstoqueTab
					canMutate={canMutate}
					stockRows={detail.stockRows}
					toolId={detail.tool.id}
					toolImageUrl={detail.images[0]?.url ?? null}
					toolName={detail.tool.name}
					variants={detail.variants}
				/>
			),
		},
		{
			value: "atividade",
			label: "Atividade",
			icon: <Activity aria-hidden className="size-3.5" />,
			lazy: true,
			content: <ActivityTabLoader toolId={detail.tool.id} />,
		},
		{
			value: "avaliacoes",
			label: "Avaliações",
			icon: <Star aria-hidden className="size-3.5" />,
			lazy: true,
			content: <ReviewsTabLoader toolId={detail.tool.id} />,
		},
	];

	return (
		<ToolDetailTabs
			defaultValue={defaultValue}
			header={
				<ToolDetailHeader
					actions={
						<ToolDetailActions canMutate={canMutate} toolId={detail.tool.id} />
					}
					detail={detail}
				/>
			}
			initialTab={initialTab}
			tabs={tabs}
		/>
	);
}
```

- [ ] **Step 2: Ajustar imports do topo de `page.tsx`**

Remova os imports não mais usados (`EntityTabs`, `EntityTab`, `getToolReviewsSummary`, `getActiveSuppliers`, `ToolReviewsSection`) e adicione os novos. O bloco de imports deve conter:

```tsx
import { Activity, Boxes, Info, Star, Tag } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { ActivityTabLoader } from "./_components/activity-tab-loader";
import { EstoqueTab } from "./_components/estoque-tab";
import { OverviewTab } from "./_components/overview-tab";
import { ReviewsTabLoader } from "./_components/reviews-tab-loader";
import { ToolDetailActions } from "./_components/tool-detail-actions";
import { ToolDetailHeader } from "./_components/tool-detail-header";
import {
	ToolDetailTabs,
	type ToolDetailTab,
} from "./_components/tool-detail-tabs";
import { VariantsTab } from "./_components/variants-tab";
import { getToolDetail } from "./_lib/tool-detail-data";
```

(O `EstoqueTab` perde a prop `suppliers` aqui — a Task 7 ajusta o componente. Se a Task 7 ainda não rodou, `check-types` acusará a prop faltante; rode a Task 7 em seguida.)

- [ ] **Step 3: Verify types + build**

Run: `bun --cwd apps/web check-types`
Expected: PASS após a Task 7 (a prop `suppliers` do `EstoqueTab`). Se rodar antes da Task 7, o único erro deve ser `suppliers` faltando no `EstoqueTab` — siga para a Task 7.

Run: `bun run build`
Expected: PASS (após Task 7).

- [ ] **Step 4: Sem commit isolado** — segue para a Task 7 (o commit único do bloco 5–7 é no fim da Task 7).

---

### Task 7: Suppliers buscados na abertura da sheet (estoque)

No modelo eager, `EstoqueTab` renderiza em toda carga da página; tirar `suppliers` do SSR evita 1 query por load. Buscar via action quando a sheet abre.

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx`

**Interfaces:**
- Consumes: `fetchActiveSuppliersAction` (`../_lib/tab-actions`).

- [ ] **Step 1: Remover a prop `suppliers` e buscar sob demanda**

Abra `estoque-tab.tsx`. Faça:
1. Remova `suppliers: ActiveSupplierOption[]` da interface `EstoqueTabProps` e do parâmetro.
2. Adicione estado e busca quando há linha selecionada (sheet aberta):

```tsx
// no topo do componente, junto aos outros hooks:
const [suppliers, setSuppliers] = useState<ActiveSupplierOption[]>([]);

useEffect(() => {
	if (!selected) {
		return;
	}
	let active = true;
	fetchActiveSuppliersAction().then((data) => {
		if (active) {
			setSuppliers(data);
		}
	});
	return () => {
		active = false;
	};
}, [selected]);
```

3. Garanta os imports: `import { useEffect, useState } from "react";` (mantenha os já existentes), `import { fetchActiveSuppliersAction } from "../_lib/tab-actions";`, e mantenha `import type { ActiveSupplierOption } from "@/lib/suppliers";`.
4. O JSX que passa `suppliers={suppliers}` para `<BranchStockEditSheet>` permanece — agora lê o estado (vazio até a sheet abrir e a busca resolver).

> Observação: `selected` é o estado que controla a abertura da sheet (`ToolStockRow | null`). Se o nome real divergir, use o estado que vira não-nulo ao abrir a sheet (confirme lendo o componente).

- [ ] **Step 2: Verify types + build + suite**

Run: `bun --cwd apps/web check-types`
Expected: PASS (agora `page.tsx` e `estoque-tab.tsx` batem — sem `suppliers` como prop).

Run: `bun run build`
Expected: PASS.

Run: `bun --cwd apps/web test`
Expected: PASS (suíte verde; nenhuma referência ao contrato antigo).

- [ ] **Step 3: Commit único do bloco de integração (Tasks 5–7)**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/page.tsx" "apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx" "apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx"
git commit -m "feat(tools): religa detalhe ao shell client de tabs"
```

---

### Task 8: Verificação integrada (browser smoke + gates)

Prova o ganho (0 requests ao trocar tab) e a ausência de regressões. Requer o dev server na 3008 (já rodando) ou `next build && next start` para o teste fiel de cache.

**Files:** nenhuma mudança de código (só verificação).

- [ ] **Step 1: Gates completos**

Run: `bun verify` (= `bun check-types && bun check && bun --cwd apps/web test`)
Expected: PASS nos três.

Run: `bun run build`
Expected: PASS.

- [ ] **Step 2: Smoke no browser (Resource Timing)**

Abra `/dashboard/tools/<id>` no browser logado. No console (ou via Resource Timing), com `performance.clearResourceTimings()` entre cliques:
- Trocar entre **Visão geral / Variantes / Estoque** → **0 requests** `_rsc` (sem servidor). ✅ critério principal.
- Abrir **Atividade** (1ª vez) → 1 chamada de server action (a `fetchToolActivityInitAction`); reabrir → 0 (cacheada no loader montado).
- Abrir **Avaliações** (1ª vez) → 1 chamada; reabrir → 0.
- Abrir a sheet de ajuste no **Estoque** → 1 chamada `fetchActiveSuppliersAction`; o select de fornecedor popula.

- [ ] **Step 3: Smoke funcional**

- Ação do header: "Editar ferramenta" aparece **só** na Visão geral, some nas outras tabs (reativo no cliente).
- Deep-link: abrir `/dashboard/tools/<id>?tab=estoque` e `?tab=atividade` → tab certa ativa (atividade mostra skeleton breve e carrega).
- Voltar/avançar do browser entre tabs → a tab ativa acompanha a URL (popstate).
- Ajustar estoque (entrada) → persiste e revalida; o ledger/atividade reflete.

- [ ] **Step 4: Sem commit** (só verificação). Se algo falhar, voltar à task correspondente.

---

## Notas de execução

- **Tasks 5–7 são uma unidade atômica:** mudam props acopladas (header → página → estoque) e só compilam juntas. Implementar as três e fazer **um único commit** no fim da Task 7; não gatear verde entre elas. Para subagent-driven, despachar 5–7 como uma única task.
- **`"use server"` build gate:** rodar `bun run build` (não só `check-types`) após Tasks 2, 4, 6, 7.
- Implementer: **Read cada arquivo antes de Edit** (`cat`/`sed`/`head` NÃO contam p/ o harness); se Edit falhar com `string not found`, re-Read antes de re-tentar — nunca editar de memória; rodar `check-types` antes de cada commit.
