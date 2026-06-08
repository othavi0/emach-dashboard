# Listagem de clientes em cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a tabela de `/dashboard/customers` por cards no padrão das filiais e enxugar a barra de filtros.

**Architecture:** Reaproveita o padrão `branch-card` + `useInfiniteList` + `InfiniteSentinel` já existentes. Cria `customer-card.tsx`, troca o render em `customers-infinite.tsx`, deleta `customer-table.tsx`, e remove 4 controles de `customer-filters.tsx`. Schema/query/export ficam intactos (remoção só na UI).

**Tech Stack:** Next 16, React 19, Tailwind v4 (tokens em `DESIGN.md`), componentes `@emach/ui` (shadcn/base-ui).

**Nota sobre testes:** O projeto não cobre componentes presentacionais com unit tests — o loop de verificação é `bun check-types` + smoke visual no browser. A 3001 está ocupada por outra branch; subir o dev em **`--port 3002`**.

**Spec:** `docs/superpowers/specs/2026-06-01-customers-listing-cards-design.md`

---

### Task 1: Enxugar a barra de filtros

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-filters.tsx`

Remover LTV mín/máx e Cadastro de/até; manter Buscar · Status · Tipo · Ordenar.

- [ ] **Step 1: Remover os hooks e imports não usados**

Em `customer-filters.tsx`, remover os imports `DatePicker` e `formatDateParam, parseDateParam`:

```tsx
// REMOVER estas duas linhas de import:
import { DatePicker } from "@emach/ui/components/date-picker";
import { formatDateParam, parseDateParam } from "@/lib/date-params";
```

Remover os dois hooks de LTV (logo após o `const [q, setQ] = ...`):

```tsx
// REMOVER:
const [ltvMin, setLtvMin] = useDebouncedParam({ basePath: BASE, key: "ltvMin" });
const [ltvMax, setLtvMax] = useDebouncedParam({ basePath: BASE, key: "ltvMax" });
```

- [ ] **Step 2: Encolher a lista `TRACKED`**

Substituir o array `TRACKED` por:

```tsx
const TRACKED = [
	"q",
	"status",
	"clientType",
	"sort",
	"missingDoc",
	"openOrderInactive",
	"unverifiedNew",
] as const;
```

- [ ] **Step 3: Remover os 4 blocos de filtro do JSX**

No `return (...)`, **deletar** estes quatro `<div>` (Cadastro de, Cadastro até, LTV mín, LTV máx) — são os blocos com `htmlFor="customers-created-from"`, `customers-created-to`, `customers-ltv-min`, `customers-ltv-max`. Após a remoção, a ordem dentro de `<FiltersBar>` fica: Buscar (`flex-1`) → Status → Tipo → Ordenar. Nenhum outro ajuste de largura é necessário — a busca cresce sozinha por ser `flex-1`.

- [ ] **Step 4: Type-check**

Run: `cd /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard && bun check-types`
Expected: PASS (sem erros de `ltvMin`/`DatePicker`/`parseDateParam` não usados).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-filters.tsx
git commit -m "refactor: enxugar filtros da listagem de clientes"
```

---

### Task 2: Criar o `customer-card.tsx`

**Files:**
- Create: `apps/web/src/app/dashboard/customers/_components/customer-card.tsx`

- [ ] **Step 1: Escrever o componente completo**

```tsx
"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getInitials } from "@/lib/format/name";
import type { CustomerListItem } from "../data";

const NUMBER_FORMATTER = new Intl.NumberFormat("pt-BR");
const SINCE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	month: "short",
	year: "numeric",
});
const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});
const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatRelativeDate(value: Date) {
	const diffMs = value.getTime() - Date.now();
	const diffDays = Math.round(diffMs / 86_400_000);

	if (Math.abs(diffDays) < 1) {
		const diffHours = Math.round(diffMs / 3_600_000);
		if (Math.abs(diffHours) < 1) {
			const diffMinutes = Math.round(diffMs / 60_000);
			return RELATIVE_FORMATTER.format(diffMinutes, "minute");
		}
		return RELATIVE_FORMATTER.format(diffHours, "hour");
	}
	return RELATIVE_FORMATTER.format(diffDays, "day");
}

const CLIENT_STATUS_CONFIG: Record<
	string,
	{ label: string; variant: "secondary" | "destructive" | "success" }
> = {
	active: { label: "Ativo", variant: "success" },
	inactive: { label: "Inativo", variant: "secondary" },
	blocked: { label: "Bloqueado", variant: "destructive" },
};

const CLIENT_TYPE_CONFIG: Record<
	string,
	{ label: string; variant: "info" | "warning" }
> = {
	b2c: { label: "B2C", variant: "info" },
	b2b: { label: "B2B", variant: "warning" },
};

interface CustomerCardProps {
	customer: CustomerListItem;
}

export function CustomerCard({ customer }: CustomerCardProps) {
	const router = useRouter();
	const detailHref = `/dashboard/customers/${customer.id}`;
	const editHref = `/dashboard/customers/${customer.id}?edit=1`;
	const statusConfig = CLIENT_STATUS_CONFIG[customer.status];
	const typeConfig = customer.clientType
		? CLIENT_TYPE_CONFIG[customer.clientType]
		: null;

	return (
		<div
			aria-label={`Ver cliente ${customer.name}`}
			className={`group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${customer.status === "blocked" ? "opacity-70" : ""}`}
			onClick={() => router.push(detailHref)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(detailHref);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<Avatar className="size-12 flex-shrink-0 rounded-[10px]">
					{customer.image && (
						<AvatarImage alt={customer.name} src={customer.image} />
					)}
					<AvatarFallback className="rounded-[10px] bg-muted font-bold text-[17px]">
						{getInitials(customer.name)}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-[15px] text-foreground leading-tight">
						{customer.name}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{customer.email}
					</p>
				</div>
				<div
					className="flex shrink-0 items-center gap-1"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<Link
						aria-label={`Editar cliente ${customer.name}`}
						className={`${buttonVariants({ size: "icon-sm", variant: "ghost" })} border border-border bg-muted`}
						href={editHref}
					>
						<Pencil aria-hidden className="size-4" />
					</Link>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
				{statusConfig && (
					<Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
				)}
				{typeConfig && (
					<Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>
				)}
				<span className="flex-1" />
				<Badge variant={customer.emailVerified ? "success" : "secondary"}>
					{customer.emailVerified ? "✓" : "✗"} Email
				</Badge>
				<Badge variant={customer.document ? "success" : "secondary"}>
					{customer.document ? "✓" : "—"} Doc
				</Badge>
			</div>

			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-3">
					<span className="font-bold text-[20px] text-foreground tabular-nums">
						{NUMBER_FORMATTER.format(customer.ordersCount)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Pedidos
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-3">
					<span className="font-bold text-[13px] text-foreground">
						{customer.lastOrderAt ? (
							<Tooltip>
								<TooltipTrigger
									render={
										<span>{formatRelativeDate(customer.lastOrderAt)}</span>
									}
								/>
								<TooltipContent>
									{DATE_FORMATTER.format(customer.lastOrderAt)}
								</TooltipContent>
							</Tooltip>
						) : (
							"—"
						)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Último pedido
					</span>
				</div>
				<div className="flex flex-col items-center py-3">
					<span className="font-bold text-[13px] text-foreground">
						{SINCE_FORMATTER.format(customer.createdAt)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Cliente desde
					</span>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `cd /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard && bun check-types`
Expected: PASS. Se acusar variant inválido em `<Badge>`, conferir os variants disponíveis em `packages/ui/src/components/badge.tsx` (devem existir `success`/`info`/`warning`/`secondary`/`destructive` — já usados no `customer-table.tsx` original). Se `Avatar` não aceitar `className`, conferir assinatura em `packages/ui/src/components/avatar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-card.tsx
git commit -m "feat: card de cliente para a listagem"
```

---

### Task 3: Trocar a tabela pelo grid de cards e deletar a tabela

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customers-infinite.tsx`
- Delete: `apps/web/src/app/dashboard/customers/_components/customer-table.tsx`

- [ ] **Step 1: Reescrever `customers-infinite.tsx`**

Conteúdo completo do arquivo:

```tsx
"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchCustomersPage } from "../actions";
import type { CustomerListItem, CustomersListFilters } from "../data";
import { CustomerCard } from "./customer-card";

interface CustomersInfiniteProps {
	filters: CustomersListFilters;
	initial: CustomerListItem[];
	initialCursor: string | null;
}

export function CustomersInfinite({
	initial,
	initialCursor,
	filters,
}: CustomersInfiniteProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchCustomersPage({ filters, cursor }),
		resetKey,
	});

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((item) => (
					<CustomerCard customer={item} key={item.id} />
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

- [ ] **Step 2: Deletar a tabela**

Run: `cd /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard && rm apps/web/src/app/dashboard/customers/_components/customer-table.tsx`

- [ ] **Step 3: Confirmar que nada mais importa a tabela**

Run: `cd /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard && rg -n "customer-table" apps/web/src`
Expected: nenhum resultado.

- [ ] **Step 4: Type-check**

Run: `cd /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard && bun check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customers-infinite.tsx apps/web/src/app/dashboard/customers/_components/customer-table.tsx
git commit -m "feat: listagem de clientes em grid de cards"
```

---

### Task 4: Limpar `hasFilters` na page (cleanup)

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/page.tsx:66-79`

`hasFilters` ainda checa `ltvMin/ltvMax/createdFrom/createdTo/lastOrderFrom/lastOrderTo`, que não têm mais UI. Reduzir para os filtros visíveis + os toggles do painel de pendências.

- [ ] **Step 1: Substituir o bloco `hasFilters`**

```tsx
	const hasFilters = Boolean(
		filters.q ||
			filters.status ||
			filters.clientType?.length ||
			filters.missingDoc ||
			filters.openOrderInactive ||
			filters.unverifiedNew
	);
```

- [ ] **Step 2: Type-check**

Run: `cd /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/customers/page.tsx
git commit -m "chore: simplificar hasFilters da listagem de clientes"
```

---

### Task 5: Verificação visual

**Files:** nenhum (smoke test).

- [ ] **Step 1: Subir o dev na porta 3002**

Run: `cd /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard && bun dev:web --port 3002`
(rodar em background; a 3001 está ocupada por outra branch)

- [ ] **Step 2: Visitar `/dashboard/customers` e conferir**

Abrir `http://localhost:3002/dashboard/customers` e validar:
- Barra de filtros: Buscar (larga) · Status · Tipo · Ordenar. Sem LTV nem datas.
- Grid de cards responsivo: 1 → 2 → 3 → 4 colunas conforme a largura.
- Card: avatar/iniciais + nome + email + botão Editar (ícone lápis quadrado com borda). Linha de badges Status/Tipo + ✓ Email / ✓ Doc. Rodapé: Pedidos · Último pedido · Cliente desde.
- Clicar no card abre o detalhe; clicar no lápis abre `?edit=1` sem ir pro detalhe.
- Cliente bloqueado: card com opacidade reduzida.
- Scroll até o fim carrega a próxima página (sentinela).

- [ ] **Step 3: Conferir erros de runtime**

Via MCP `next-devtools`: `nextjs_call 3002 get_errors`
Expected: sem erros. (Type-check não pega SQL/runtime; este passo fecha o gap descrito no `CLAUDE.md`.)

---

## Self-review

- **Cobertura do spec:** filtros enxutos (T1), card variante B + stats opção 1 (T2), grid responsivo + tabela deletada (T3), cleanup hasFilters (T4), validação na 3002 (T5). ✓
- **Sem placeholders:** todo código está completo. ✓
- **Consistência de tipos:** `CustomerListItem` (campos `name/email/image/status/clientType/document/emailVerified/ordersCount/lastOrderAt/createdAt`) usado consistentemente; `CLIENT_STATUS_CONFIG`/`CLIENT_TYPE_CONFIG` com os mesmos variants do `customer-table` original. ✓
- **Risco conhecido:** `<Avatar className>` e variants de `<Badge>` — validados por `bun check-types` na T2 Step 2, com fallback de onde conferir.
