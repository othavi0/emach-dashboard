# Detail Pages Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar header de `/dashboard/orders/[id]`, polir `OrderTimeline`, reduzir `CustomerKpisHeader` para 4 cards e adicionar metadados ao `CustomerHeader`.

**Architecture:** Mudanças isoladas em 4 arquivos. Sem alteração de data layer; tudo presentation.

**Tech Stack:** Next 16 RSC, Tailwind 4, shadcn Card.

Spec: `docs/superpowers/specs/2026-05-13-detail-pages-redesign-design.md`.

---

### Task 1: Order detail header → `<PageHeader>` + remove "Voltar"

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/[id]/page.tsx`

- [ ] **Step 1: Adicionar import do PageHeader**

```ts
import { PageHeader } from "@/components/page-header";
```

- [ ] **Step 2: Substituir o `<div className="flex items-start justify-between gap-4">...</div>` (linhas ~42-66)**

Substituir:

```tsx
<div className="flex items-start justify-between gap-4">
	<div>
		<p className="text-muted-foreground text-sm">Pedido</p>
		<h1 className="font-medium text-2xl tracking-tight">
			{order.number}
		</h1>
		<p className="text-muted-foreground text-sm">
			{order.clientName} • {order.clientEmail}
		</p>
	</div>
	<div className="flex gap-2">
		<Link
			className={buttonVariants({ variant: "secondary" })}
			href={`/dashboard/orders/${order.id}/print`}
		>
			Imprimir
		</Link>
		<Link
			className={buttonVariants({ variant: "ghost" })}
			href="/dashboard/orders"
		>
			Voltar
		</Link>
	</div>
</div>
```

Por:

```tsx
<PageHeader
	action={
		<Link
			className={buttonVariants({ variant: "secondary" })}
			href={`/dashboard/orders/${order.id}/print`}
		>
			Imprimir
		</Link>
	}
	description={`${order.clientName} • ${order.clientEmail}`}
	title={`Pedido ${order.number}`}
/>
```

- [ ] **Step 3: Verify types**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "orders/\[id\]/page\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/\[id\]/page.tsx
git commit -m "feat(orders/[id]): usa PageHeader padrão + remove Voltar"
```

---

### Task 2: `OrderTimeline` polish — dots coloridos + data mono

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/order-timeline.tsx`

- [ ] **Step 1: Adicionar mapeamento de cor por entry**

No topo do arquivo (após `formatDateTime`), adicionar helper:

```ts
const OK_STATUSES = new Set(["paid", "preparing", "shipped", "delivered"]);
const WARN_STATUSES = new Set(["pending_payment"]);
const BAD_STATUSES = new Set(["canceled", "refunded"]);

function dotColorClass(entry: TimelineEntry): string {
	if (entry.kind === "note") {
		return "bg-info";
	}
	if (OK_STATUSES.has(entry.toStatus)) {
		return "bg-success";
	}
	if (WARN_STATUSES.has(entry.toStatus)) {
		return "bg-warning";
	}
	if (BAD_STATUSES.has(entry.toStatus)) {
		return "bg-destructive";
	}
	return "bg-primary";
}
```

- [ ] **Step 2: Atualizar o render do entry**

Substituir o bloco do entry (atualmente linhas ~56-75):

```tsx
<div className="flex gap-3" key={entry.id}>
	<div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
	<div className="min-w-0 flex-1 border-border border-b pb-4 last:border-b-0 last:pb-0">
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
			<p className="font-medium text-sm">
				{entry.kind === "history"
					? `${ORDER_STATUS_LABELS[entry.fromStatus]} → ${ORDER_STATUS_LABELS[entry.toStatus]}`
					: `Nota interna • ${entry.authorName}`}
			</p>
			<span className="text-muted-foreground text-xs">
				{formatDateTime(entry.createdAt)}
			</span>
		</div>
		<p className="mt-1 text-muted-foreground text-sm">
			{entry.kind === "history"
				? `${entry.actorLabel}${entry.reason ? ` • ${entry.reason}` : ""}`
				: entry.body}
		</p>
	</div>
</div>
```

Por:

```tsx
<div className="flex gap-3" key={entry.id}>
	<div
		className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dotColorClass(entry)}`}
	/>
	<div className="min-w-0 flex-1 border-border border-b pb-4 last:border-b-0 last:pb-0">
		<div className="flex items-start justify-between gap-3">
			<p className="font-medium text-sm">
				{entry.kind === "history"
					? `${ORDER_STATUS_LABELS[entry.fromStatus]} → ${ORDER_STATUS_LABELS[entry.toStatus]}`
					: `Nota interna • ${entry.authorName}`}
			</p>
			<span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
				{formatDateTime(entry.createdAt)}
			</span>
		</div>
		<p className="mt-1 text-muted-foreground text-sm">
			{entry.kind === "history"
				? `${entry.actorLabel}${entry.reason ? ` • ${entry.reason}` : ""}`
				: entry.body}
		</p>
	</div>
</div>
```

- [ ] **Step 3: Verify types**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "order-timeline\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/order-timeline.tsx
git commit -m "feat(orders/timeline): dots coloridos por kind e data mono à direita"
```

---

### Task 3: Customer KPIs — 5→4 cards

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-kpis-header.tsx`

- [ ] **Step 1: Remover o 5º card "Dias como Cliente"**

Localizar o Card (atualmente linhas ~108-121) que renderiza `kpis.daysSinceCreated`. Remover o `<Card>...</Card>` inteiro.

- [ ] **Step 2: Ajustar grid**

Substituir:

```tsx
<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
```

Por:

```tsx
<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
```

- [ ] **Step 3: Verify types**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "customer-kpis-header\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-kpis-header.tsx
git commit -m "feat(customers/kpis): 5→4 cards, remove Dias como Cliente"
```

---

### Task 4: CustomerHeader — bloco metadados

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-header.tsx`

- [ ] **Step 1: Read file**

Use Read tool para ver estrutura atual.

- [ ] **Step 2: Adicionar linha "Cadastrado em … · N dias como cliente" abaixo do nome do cliente**

Localizar o bloco onde o nome do cliente aparece (provavelmente `<h1>` ou `<h2>`). Logo abaixo, antes do bloco de ações, adicionar:

```tsx
<p className="text-muted-foreground text-xs">
	Cadastrado em{" "}
	{new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(customer.createdAt)}{" "}
	· {Math.floor((Date.now() - customer.createdAt.getTime()) / 86_400_000)} dias
	como cliente
</p>
```

`customer.createdAt` é `Date` (já no `CustomerDetail` type). Se o formato exato do prop for diferente, ajustar inline.

- [ ] **Step 3: Verify types**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "customer-header\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-header.tsx
git commit -m "feat(customers/header): adiciona metadados cadastro + tempo"
```

---

### Task 5: Verificação + smoke + commit docs

- [ ] **Step 1: Type-check**

Run: `bun --cwd apps/web check-types 2>&1 | grep -v "drizzle-orm\|branches/actions.ts\|lib/permissions.ts" | tail -10`
Expected: nenhum erro novo.

- [ ] **Step 2: Smoke**

`bun dev:web` (já rodando) → visitar:
1. `/dashboard/orders` → clicar um pedido → `/dashboard/orders/[id]`. Header com `<PageHeader>` (title + description + só "Imprimir" action). Timeline com dots coloridos. Sem botão Voltar.
2. `/dashboard/customers` → clicar um cliente → `/dashboard/customers/[id]`. 4 KPI cards (não 5). Header com bloco "Cadastrado em … · N dias".
3. Reduzir viewport para mobile (e.g., DevTools 375px). Tabs no `CustomerTabs` continua scrollable. KPIs grid passa para 2-col.

- [ ] **Step 3: Commit specs/plan untracked**

```bash
git add docs/superpowers/specs/2026-05-13-detail-pages-redesign-design.md docs/superpowers/plans/2026-05-13-detail-pages-redesign.md
git commit -m "docs(superpowers): spec e plan do detail pages redesign"
```

---

## Self-review

- Cobertura spec §1 (order header) → Task 1.
- Cobertura spec §2 (timeline) → Task 2.
- Cobertura spec §3 (customer KPIs + header meta) → Tasks 3, 4.
- Cobertura spec §4 (tabs mobile) → Task 5 step 2.3 (smoke only).
- Placeholders: zero.
- Risco residual: Task 4 assume `customer.createdAt` é `Date` na prop. Se `CustomerHeader` receber outro shape, ajustar inline. O subagent deve Read primeiro p/ confirmar.
