# Migração de Promoções para o padrão Entity/CRUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o módulo de promoções (`apps/web/src/app/dashboard/promotions`) para o padrão Entity/CRUD de filiais — página de detalhe com tabs, cards limpos, filtros em pill tabs e status badges com ícone.

**Architecture:** Reaproveita os componentes `@/components/entity/*` (EntityIdentityHeader, EntityTabs, EntityKpisRow, EntityEditSheet — este último já em uso). Cria a rota `[id]` com 2 tabs (Visão geral + Ferramentas), move as ações do card para o header contextual do detalhe, e converte o filtro de status para pill tabs server-rendered (padrão `users/page.tsx`). O view-sheet (`?view=`) é removido; a edição continua em drawer (`?edit=1`) a partir do detalhe.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Drizzle ORM, Tailwind v4 tokens, Better Auth, vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-promotions-ui-migration-design.md`

**Comandos base:**
- Type-check: `bun check-types` (raiz; turbo)
- Testes (alvo): `cd apps/web && bunx vitest run <path>`
- Lint/format: `bun fix` (também roda via hook PostToolUse após Write/Edit)
- Smoke visual: servidor já rodando em `http://localhost:3007` (porta 3001 ocupada por outro projeto)

**Atenção (project memory):**
- `check-types` NÃO pega import de hook client em Server Component nem fronteira RSC/client — **smoke visual obrigatório** após cada task de UI.
- Hook auto-format pode reordenar campos e quebrar `old_string` de Edits subsequentes — re-ler o arquivo se um Edit falhar.
- Rotas dinâmicas `[id]` quebram `ugrep`/`bfs` — usar `rg` da raiz com word-boundaries se precisar buscar.

---

## Task 1: Helpers de vigência (`daysUntil`, `daysRemainingDisplay`)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/_lib/format.ts`
- Test: `apps/web/src/app/dashboard/promotions/_components/_lib/__tests__/format.test.ts` (criar)

- [ ] **Step 1: Escrever o teste falhando**

Criar `apps/web/src/app/dashboard/promotions/_components/_lib/__tests__/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { daysRemainingDisplay, daysUntil } from "../format";

const NOW = new Date("2026-06-01T12:00:00Z");

describe("daysUntil", () => {
	it("retorna null para data nula", () => {
		expect(daysUntil(null, NOW)).toBeNull();
	});
	it("conta dias inteiros à frente", () => {
		expect(daysUntil(new Date("2026-06-11T12:00:00Z"), NOW)).toBe(10);
	});
	it("é negativo para datas passadas", () => {
		expect(daysUntil(new Date("2026-05-30T12:00:00Z"), NOW)).toBe(-2);
	});
});

describe("daysRemainingDisplay", () => {
	it("expirada → 0 / danger", () => {
		expect(
			daysRemainingDisplay("expired", new Date("2026-05-01T12:00:00Z"), NOW)
		).toEqual({ value: "0", tone: "danger" });
	});
	it("sem endsAt → — / default", () => {
		expect(daysRemainingDisplay("active", null, NOW)).toEqual({
			value: "—",
			tone: "default",
		});
	});
	it("≤7 dias → warning", () => {
		expect(
			daysRemainingDisplay("active", new Date("2026-06-06T12:00:00Z"), NOW)
		).toEqual({ value: "5", tone: "warning" });
	});
	it(">7 dias → default", () => {
		expect(
			daysRemainingDisplay("active", new Date("2026-06-20T12:00:00Z"), NOW)
		).toEqual({ value: "19", tone: "default" });
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/web && bunx vitest run src/app/dashboard/promotions/_components/_lib/__tests__/format.test.ts`
Expected: FAIL — `daysUntil`/`daysRemainingDisplay` não exportados.

- [ ] **Step 3: Implementar os helpers**

Adicionar ao final de `apps/web/src/app/dashboard/promotions/_components/_lib/format.ts`:

```ts
export function daysUntil(d: Date | null, now: Date = new Date()): number | null {
	if (!d) {
		return null;
	}
	const MS_PER_DAY = 86_400_000;
	return Math.ceil((d.getTime() - now.getTime()) / MS_PER_DAY);
}

export interface RemainingDisplay {
	tone: "default" | "warning" | "danger";
	value: string;
}

export function daysRemainingDisplay(
	status: PromotionStatus,
	endsAt: Date | null,
	now: Date = new Date()
): RemainingDisplay {
	if (status === "expired") {
		return { value: "0", tone: "danger" };
	}
	if (!endsAt) {
		return { value: "—", tone: "default" };
	}
	const d = daysUntil(endsAt, now) ?? 0;
	const clamped = d < 0 ? 0 : d;
	return { value: String(clamped), tone: clamped <= 7 ? "warning" : "default" };
}
```

(`PromotionStatus` já é importado no topo do arquivo: `import type { PromotionStatus } from "../../actions";`)

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/web && bunx vitest run src/app/dashboard/promotions/_components/_lib/__tests__/format.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/_lib/format.ts apps/web/src/app/dashboard/promotions/_components/_lib/__tests__/format.test.ts
git commit -m "feat: helpers de vigência de promoção (daysUntil, daysRemainingDisplay)"
```

---

## Task 2: Ícones nos status badges

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-status-badge.tsx`

- [ ] **Step 1: Reescrever o componente com ícone por estado**

Substituir o conteúdo de `promotion-status-badge.tsx`:

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { CalendarX, CheckCircle2, Clock, PauseCircle } from "lucide-react";

import type { PromotionStatus } from "../actions";
import { statusLabel } from "./_lib/format";

interface PromotionStatusBadgeProps {
	status: PromotionStatus;
}

export function PromotionStatusBadge({ status }: PromotionStatusBadgeProps) {
	switch (status) {
		case "active":
			return (
				<Badge className="w-fit" variant="success">
					<CheckCircle2 aria-hidden className="mr-1 size-3" />
					{statusLabel(status)}
				</Badge>
			);
		case "scheduled":
			return (
				<Badge className="w-fit" variant="info">
					<Clock aria-hidden className="mr-1 size-3" />
					{statusLabel(status)}
				</Badge>
			);
		case "expired":
			return (
				<Badge className="w-fit" variant="secondary">
					<CalendarX aria-hidden className="mr-1 size-3" />
					{statusLabel(status)}
				</Badge>
			);
		default:
			return (
				<Badge className="w-fit" variant="outline">
					<PauseCircle aria-hidden className="mr-1 size-3" />
					{statusLabel(status)}
				</Badge>
			);
	}
}
```

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 3: Smoke visual**

Abrir `http://localhost:3007/dashboard/promotions` — cada badge de status deve mostrar ícone + label.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-status-badge.tsx
git commit -m "feat: ícone nos status badges de promoção (color-blind safe)"
```

---

## Task 3: Agregado de contagens por status (`getPromotionStatusCounts`)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/actions.ts`

- [ ] **Step 1: Adicionar `sql` ao import do drizzle-orm**

Em `actions.ts`, linha 6, trocar:

```ts
import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
```

por:

```ts
import { and, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
```

- [ ] **Step 2: Adicionar o tipo e a função**

Adicionar após a definição de `PromotionStatus` (logo após a linha `export type PromotionStatus = ...`):

```ts
export interface PromotionStatusCounts {
	active: number;
	all: number;
	expired: number;
	inactive: number;
	scheduled: number;
}
```

Adicionar ao final do arquivo `actions.ts` (predicados idênticos aos de `fetchPromotionsPage`):

```ts
// ---------------------------------------------------------------------------
// getPromotionStatusCounts — contagens por status p/ as pill tabs
// ---------------------------------------------------------------------------

export async function getPromotionStatusCounts(): Promise<PromotionStatusCounts> {
	await requireCurrentSession();

	const rows = await db
		.select({
			all: sql<number>`count(*)::int`,
			active: sql<number>`count(*) filter (where ${promotion.active} = true and (${promotion.startsAt} is null or ${promotion.startsAt} <= now()) and (${promotion.endsAt} is null or ${promotion.endsAt} >= now()))::int`,
			scheduled: sql<number>`count(*) filter (where ${promotion.active} = true and ${promotion.startsAt} > now() and (${promotion.endsAt} is null or ${promotion.endsAt} >= now()))::int`,
			expired: sql<number>`count(*) filter (where ${promotion.endsAt} < now())::int`,
			inactive: sql<number>`count(*) filter (where ${promotion.active} = false and (${promotion.endsAt} is null or ${promotion.endsAt} >= now()))::int`,
		})
		.from(promotion);

	return (
		rows[0] ?? { all: 0, active: 0, scheduled: 0, expired: 0, inactive: 0 }
	);
}
```

- [ ] **Step 3: Type-check**

Run: `bun check-types`
Expected: sem erros.

> Sem teste unitário: a função bate no DB e o repo não tem harness de DB em vitest. Validação acontece na Task 9 (contagens visíveis nas tabs).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/actions.ts
git commit -m "feat: agregado getPromotionStatusCounts p/ filtros de status"
```

---

## Task 4: `DeletePromotionDialog` aceita redirect no sucesso

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/delete-promotion-dialog.tsx`

Necessário porque, no detalhe, excluir não pode dar `router.refresh()` (a promoção some → 404). Tem que navegar pra listagem.

- [ ] **Step 1: Adicionar prop `redirectTo`**

Na interface `DeletePromotionDialogProps`, adicionar:

```ts
	redirectTo?: string;
```

Na assinatura do componente, adicionar `redirectTo` ao destructuring:

```tsx
export function DeletePromotionDialog({
	promotionId,
	promotionTitle,
	controlled,
	redirectTo,
}: DeletePromotionDialogProps) {
```

No `handleConfirm`, trocar o bloco de sucesso:

```tsx
			if (result.ok) {
				toast.success("Promoção removida");
				setOpen(false);
				router.refresh();
			} else {
```

por:

```tsx
			if (result.ok) {
				toast.success("Promoção removida");
				setOpen(false);
				if (redirectTo) {
					router.push(redirectTo);
				} else {
					router.refresh();
				}
			} else {
```

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: sem erros (prop opcional, callers existentes seguem válidos).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/delete-promotion-dialog.tsx
git commit -m "feat: redirect opcional no DeletePromotionDialog"
```

---

## Task 5: Header de identidade do detalhe (`PromotionIdentity`)

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/[id]/_components/promotion-identity.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { Tag, Ticket } from "lucide-react";
import type { ReactNode } from "react";

import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";

import type { PromotionDetail } from "../../actions";
import { formatJanela } from "../../_components/_lib/format";
import { PromotionStatusBadge } from "../../_components/promotion-status-badge";

export function PromotionIdentity({
	detail,
	actions,
}: {
	actions?: ReactNode;
	detail: PromotionDetail;
}) {
	const isCoupon = detail.type === "promocode";

	return (
		<EntityIdentityHeader
			actions={actions}
			avatarFallback={
				isCoupon ? (
					<Ticket aria-hidden className="size-5" />
				) : (
					<Tag aria-hidden className="size-5" />
				)
			}
			badges={<PromotionStatusBadge status={detail.status} />}
			subtitle={`${isCoupon ? "Cupom" : "Automática"} · ${formatJanela(detail.startsAt, detail.endsAt)}`}
			title={detail.title}
		/>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: sem erros (componente ainda não referenciado; valida imports e tipos).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/[id]/_components/promotion-identity.tsx
git commit -m "feat: PromotionIdentity (header do detalhe de promoção)"
```

---

## Task 6: Ações contextuais do header (`PromotionHeaderActions`)

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/[id]/_components/promotion-header-actions.tsx`

Migra a lógica de `promotion-quick-actions.tsx` (toggle/duplicar/excluir) para o header do detalhe.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Copy, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
	duplicatePromotion,
	type PromotionDetail,
	togglePromotionActive,
} from "../../actions";
import { DeletePromotionDialog } from "../../_components/delete-promotion-dialog";

export function PromotionHeaderActions({
	promotion,
}: {
	promotion: PromotionDetail;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const [isPending, startTransition] = useTransition();
	const [deleteOpen, setDeleteOpen] = useState(false);

	const editParams = new URLSearchParams(params);
	editParams.set("edit", "1");
	const editHref = `${pathname}?${editParams.toString()}`;

	function handleToggle() {
		startTransition(async () => {
			const res = await togglePromotionActive(promotion.id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success(res.data.active ? "Promoção ativada" : "Promoção pausada");
			router.refresh();
		});
	}

	function handleDuplicate() {
		startTransition(async () => {
			const res = await duplicatePromotion(promotion.id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Promoção duplicada");
			router.push(`/dashboard/promotions/${res.data.id}?edit=1`);
		});
	}

	return (
		<>
			<Link className={buttonVariants({ variant: "default" })} href={editHref}>
				Editar
			</Link>
			<Button
				disabled={isPending}
				onClick={handleToggle}
				type="button"
				variant="secondary"
			>
				{promotion.active ? (
					<>
						<PauseCircle aria-hidden className="mr-1.5 size-4" />
						Pausar
					</>
				) : (
					<>
						<PlayCircle aria-hidden className="mr-1.5 size-4" />
						Ativar
					</>
				)}
			</Button>
			<Button
				aria-label="Duplicar promoção"
				disabled={isPending}
				onClick={handleDuplicate}
				size="icon"
				type="button"
				variant="outline"
			>
				<Copy aria-hidden className="size-4" />
			</Button>
			<Button
				aria-label="Excluir promoção"
				onClick={() => setDeleteOpen(true)}
				size="icon"
				type="button"
				variant="destructive"
			>
				<Trash2 aria-hidden className="size-4" />
			</Button>
			<DeletePromotionDialog
				controlled={{ open: deleteOpen, onOpenChange: setDeleteOpen }}
				promotionId={promotion.id}
				promotionTitle={promotion.title}
				redirectTo="/dashboard/promotions"
			/>
		</>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/[id]/_components/promotion-header-actions.tsx
git commit -m "feat: PromotionHeaderActions (toggle/duplicar/excluir no header)"
```

---

## Task 7: Tab Visão geral (`OverviewTab`)

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/[id]/_components/overview-tab.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { CalendarClock, CalendarPlus, Percent, Wrench } from "lucide-react";

import {
	EntityKpisRow,
	type KpiItem,
} from "@/components/entity/entity-kpis-row";

import type { PromotionDetail } from "../../actions";
import { CopyCodeButton } from "../../_components/copy-code-button";
import {
	daysRemainingDisplay,
	fmtDate,
	fmtDateTime,
	formatDesconto,
} from "../../_components/_lib/format";

const MARKER =
	"font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider";

function executionMessage(status: PromotionDetail["status"]): string {
	switch (status) {
		case "active":
			return "Aparece no site para clientes elegíveis.";
		case "scheduled":
			return "Agendada — começa a aparecer no site na data de início.";
		case "expired":
			return "Expirada — não aparece mais no site.";
		default:
			return "Pausada — não aparece no site.";
	}
}

export function OverviewTab({ detail }: { detail: PromotionDetail }) {
	const remaining = daysRemainingDisplay(detail.status, detail.endsAt);
	const isCoupon = detail.type === "promocode";

	const kpis: KpiItem[] = [
		{
			icon: Percent,
			label: "Desconto",
			value: formatDesconto(detail.discountPct),
		},
		{
			href: `/dashboard/promotions/${detail.id}?tab=tools`,
			icon: Wrench,
			label: "Ferramentas",
			tone: detail.tools.length === 0 ? "warning" : "default",
			value: detail.tools.length,
		},
		{
			icon: CalendarPlus,
			label: "Início",
			value: detail.startsAt ? fmtDate(detail.startsAt) : "Imediato",
		},
		{
			hint: detail.endsAt ? `${remaining.value} dias restantes` : "Sem prazo",
			icon: CalendarClock,
			label: "Término",
			tone: remaining.tone,
			value: detail.endsAt ? fmtDate(detail.endsAt) : "—",
		},
	];

	return (
		<div className="flex flex-col gap-6">
			<EntityKpisRow items={kpis} />

			{isCoupon && detail.code ? (
				<section className="rounded-lg border border-border bg-card p-5">
					<h3 className={MARKER}>Código do cupom</h3>
					<div className="mt-2 flex items-center gap-2">
						<code className="rounded bg-muted px-2 py-1 font-mono text-foreground text-sm">
							{detail.code}
						</code>
						<CopyCodeButton code={detail.code} />
					</div>
				</section>
			) : null}

			<section className="rounded-lg border border-border bg-card p-5">
				<h3 className={MARKER}>Descrição</h3>
				<p className="mt-2 text-sm leading-relaxed">
					{detail.description ?? "Sem descrição."}
				</p>
			</section>

			<section className="rounded-lg border border-border bg-card p-5">
				<h3 className={MARKER}>Execução</h3>
				<p className="mt-2 text-sm leading-relaxed">
					{executionMessage(detail.status)}
				</p>
			</section>

			<section className="rounded-lg border border-border bg-card p-5">
				<h3 className={MARKER}>Histórico</h3>
				<dl className="mt-2 space-y-1 text-sm">
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">Criada</dt>
						<dd className="tabular-nums">
							{fmtDateTime(detail.createdAt)}
							{detail.createdByName ? ` · ${detail.createdByName}` : ""}
						</dd>
					</div>
					<div className="flex justify-between gap-4">
						<dt className="text-muted-foreground">Atualizada</dt>
						<dd className="tabular-nums">
							{fmtDateTime(detail.updatedAt)}
							{detail.updatedByName ? ` · ${detail.updatedByName}` : ""}
						</dd>
					</div>
				</dl>
			</section>
		</div>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/[id]/_components/overview-tab.tsx
git commit -m "feat: OverviewTab do detalhe de promoção (KPIs + descrição + histórico)"
```

---

## Task 8: Tab Ferramentas (`ToolsTab`)

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/[id]/_components/tools-tab.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import type { PromotionDetail } from "../../actions";
import { formatDesconto } from "../../_components/_lib/format";

export function ToolsTab({ detail }: { detail: PromotionDetail }) {
	if (detail.tools.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Nenhuma ferramenta vinculada</EmptyTitle>
					<EmptyDescription>
						Vincule ferramentas para que o desconto seja aplicado a elas.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Link
						className={buttonVariants({ variant: "default" })}
						href={`/dashboard/promotions/${detail.id}?tab=tools&edit=1`}
					>
						Gerenciar ferramentas
					</Link>
				</EmptyContent>
			</Empty>
		);
	}

	const discountLabel = `−${formatDesconto(detail.discountPct)}`;

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{detail.tools.map((t) => (
				<div
					className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm"
					key={t.id}
				>
					<div className="relative overflow-hidden">
						{t.thumbUrl ? (
							// biome-ignore lint/performance/noImgElement: Supabase public URL
							// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
							<img
								alt={t.name}
								className="aspect-[16/9] w-full object-cover"
								src={t.thumbUrl}
							/>
						) : (
							<div aria-hidden className="aspect-[16/9] w-full bg-muted/40" />
						)}
						<div className="absolute top-2 right-2">
							<Badge className="shadow-sm backdrop-blur-sm" variant="success">
								{discountLabel}
							</Badge>
						</div>
					</div>
					<div className="flex flex-col gap-1 px-4 pt-3 pb-3">
						<Link
							className="line-clamp-2 flex items-center gap-1 font-semibold text-[14px] text-foreground leading-[1.3] tracking-tight hover:underline"
							href={`/dashboard/tools/${t.id}`}
						>
							{t.name}
							<ArrowUpRight
								aria-hidden
								className="size-3.5 shrink-0 opacity-60"
							/>
						</Link>
						{t.sku ? (
							<p className="line-clamp-1 text-muted-foreground text-xs">
								SKU {t.sku}
							</p>
						) : null}
					</div>
				</div>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/[id]/_components/tools-tab.tsx
git commit -m "feat: ToolsTab do detalhe de promoção (grid de media-cards)"
```

---

## Task 9: Página de detalhe (`[id]/page.tsx`)

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/[id]/page.tsx`

Espelha `branches/[id]/page.tsx`. Ao final desta task a rota `/dashboard/promotions/[id]` fica viva (a listagem ainda usa o view-sheet — ambos funcionam).

- [ ] **Step 1: Criar a página**

```tsx
import { db } from "@emach/db";
import { tool } from "@emach/db/schema/tools";
import { buttonVariants } from "@emach/ui/components/button";
import { asc } from "drizzle-orm";
import { Info, Settings2, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { requireCapabilityOrRedirect } from "@/lib/permissions";

import { getPromotion } from "../actions";
import { PromotionEditSheet } from "../_components/promotion-edit-sheet";
import { OverviewTab } from "./_components/overview-tab";
import { PromotionHeaderActions } from "./_components/promotion-header-actions";
import { PromotionIdentity } from "./_components/promotion-identity";
import { ToolsTab } from "./_components/tools-tab";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; tab?: string }>;
}

export const dynamic = "force-dynamic";

export default async function PromotionDetailPage({
	params,
	searchParams,
}: PageProps) {
	await requireCapabilityOrRedirect("promotions.manage");

	const { id } = await params;
	const sp = await searchParams;

	const [detail, availableTools] = await Promise.all([
		getPromotion(id),
		db
			.select({ id: tool.id, name: tool.name })
			.from(tool)
			.orderBy(asc(tool.name)),
	]);

	if (!detail) {
		notFound();
	}

	const isToolsTab = sp.tab === "tools";

	const tabs: EntityTab[] = [
		{
			value: "overview",
			label: "Visão geral",
			icon: <Info aria-hidden className="size-3.5" />,
			content: <OverviewTab detail={detail} />,
		},
		{
			value: "tools",
			label: "Ferramentas",
			icon: <Wrench aria-hidden className="size-3.5" />,
			badge: (
				<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
					{detail.tools.length}
				</span>
			),
			content: isToolsTab ? <ToolsTab detail={detail} /> : null,
		},
	];

	const headerAction = isToolsTab ? (
		<Link
			className={buttonVariants({ variant: "default" })}
			href={`/dashboard/promotions/${id}?tab=tools&edit=1`}
		>
			<Settings2 aria-hidden className="mr-1.5 size-4" />
			Gerenciar ferramentas
		</Link>
	) : (
		<PromotionHeaderActions promotion={detail} />
	);

	return (
		<div className="flex flex-col gap-6 p-6">
			<PromotionIdentity actions={headerAction} detail={detail} />
			<EntityTabs defaultValue="overview" tabs={tabs} />
			{sp.edit === "1" ? (
				<PromotionEditSheet availableTools={availableTools} promotion={detail} />
			) : null}
		</div>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 3: Smoke visual (rota nova)**

No browser na 3007, abrir uma promoção direto pela URL. Pegar um id da listagem: abrir `http://localhost:3007/dashboard/promotions`, copiar o id de um card via DevTools/URL antiga, e navegar para `http://localhost:3007/dashboard/promotions/<id>`. Verificar:
- Header com avatar (Tag/Ticket), título, subtitle, badge de status, ações (Editar/Pausar/Duplicar/Excluir).
- Tab "Visão geral" com 4 KPIs + descrição + execução + histórico.
- Trocar para "Ferramentas" → grid de media-cards (lazy: só monta com `?tab=tools`).
- Clicar "Editar" → drawer abre (`?edit=1`); Cancelar fecha.
- Clicar "Pausar/Ativar" → toast + status atualiza.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/[id]/page.tsx
git commit -m "feat: página de detalhe de promoção (identity + tabs)"
```

---

## Task 10: Card de listagem limpo (`promotion-card.tsx`)

**Files:**
- Modify (reescrever): `apps/web/src/app/dashboard/promotions/_components/promotion-card.tsx`

Card sem ações inline, footer edge-to-edge, navega para `[id]`. Drop intencional: o `CopyCodeButton` inline some do card (botão dentro de `<a>` é inválido); copiar código fica no detalhe (Task 7). O código segue exibido como texto no card.

- [ ] **Step 1: Reescrever o componente**

```tsx
import { Tag, Ticket } from "lucide-react";
import Link from "next/link";

import type { PromotionListItem } from "../actions";
import {
	daysRemainingDisplay,
	formatDesconto,
	formatJanela,
} from "./_lib/format";
import { PromotionStatusBadge } from "./promotion-status-badge";

const METRIC_LABEL =
	"text-[10px] text-muted-foreground uppercase tracking-wider";

export function PromotionCard({
	promotion,
}: {
	promotion: PromotionListItem;
}) {
	const isCoupon = promotion.type === "promocode";
	const dimmed =
		promotion.status === "inactive" || promotion.status === "expired";
	const remaining = daysRemainingDisplay(promotion.status, promotion.endsAt);
	const remainingTone =
		remaining.tone === "danger"
			? "text-destructive"
			: remaining.tone === "warning"
				? "text-amber-500"
				: "text-foreground";

	return (
		<Link
			className={`group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dimmed ? "opacity-70" : ""}`}
			href={`/dashboard/promotions/${promotion.id}`}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-12 shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted text-foreground">
					{isCoupon ? (
						<Ticket aria-hidden className="size-5" />
					) : (
						<Tag aria-hidden className="size-5" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="line-clamp-1 font-semibold text-[15px] text-foreground leading-tight">
						{promotion.title}
					</p>
					<p className="line-clamp-1 text-muted-foreground text-xs">
						{isCoupon ? "Cupom" : "Automática"}
						{isCoupon && promotion.code ? ` · ${promotion.code}` : ""}
					</p>
				</div>
				<PromotionStatusBadge status={promotion.status} />
			</div>

			<div className="px-4 pb-3">
				<span className="font-medium text-[32px] text-primary leading-none tabular-nums">
					{formatDesconto(promotion.discountPct)}
				</span>
				<p className="mt-1 text-[11px] text-muted-foreground">
					{formatJanela(promotion.startsAt, promotion.endsAt)}
				</p>
			</div>

			<div className="mt-auto grid grid-cols-2 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-3">
					<span
						className={`font-bold text-[20px] tabular-nums ${promotion.tools.length === 0 ? "text-warning" : "text-foreground"}`}
					>
						{promotion.tools.length}
					</span>
					<span className={METRIC_LABEL}>Ferramentas</span>
				</div>
				<div className="flex flex-col items-center py-3">
					<span className={`font-bold text-[20px] tabular-nums ${remainingTone}`}>
						{remaining.value}
					</span>
					<span className={METRIC_LABEL}>Dias restantes</span>
				</div>
			</div>
		</Link>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: ERRO esperado em `promotions-grid.tsx` (ainda passa `canMutate` ao card). Corrigido na Task 11. Se quiser type-check verde isolado, pode pular para o Step 3 e validar após a Task 11.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-card.tsx
git commit -m "feat: card de promoção limpo (stat-card, navega p/ detalhe)"
```

---

## Task 11: Grid sem view-sheet (`promotions-grid.tsx`)

**Files:**
- Modify (reescrever): `apps/web/src/app/dashboard/promotions/_components/promotions-grid.tsx`

Remove `PromotionSheet` (view) e `PromotionEditSheet` (edição migrou pro detalhe) e o prop `canMutate` no card.

- [ ] **Step 1: Reescrever o componente**

```tsx
"use client";

import { Tag } from "lucide-react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import {
	fetchPromotionsPage,
	type ListPromotionsOptions,
	type PromotionListItem,
} from "../actions";
import { PromotionCard } from "./promotion-card";

interface PromotionsGridProps {
	filters: ListPromotionsOptions;
	initial: PromotionListItem[];
	initialCursor: string | null;
}

export function PromotionsGrid({
	filters,
	initial,
	initialCursor,
}: PromotionsGridProps) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchPromotionsPage({ filters, cursor }),
		resetKey,
	});

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Tag aria-hidden className="size-12 opacity-40" />
				<p className="font-medium text-sm">Nenhuma promoção encontrada</p>
				<p className="text-muted-foreground text-xs">
					Ajuste os filtros ou cadastre a primeira promoção.
				</p>
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{items.map((p) => (
					<PromotionCard key={p.id} promotion={p} />
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

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: ERRO esperado em `promotions/page.tsx` (ainda passa props removidos ao grid). Corrigido na Task 12.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotions-grid.tsx
git commit -m "refactor: grid de promoções sem view-sheet (clique navega p/ detalhe)"
```

---

## Task 12: Listagem com pill tabs de status (`promotions/page.tsx` + filtros)

**Files:**
- Modify (reescrever): `apps/web/src/app/dashboard/promotions/page.tsx`
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotions-filters.tsx`

- [ ] **Step 1: Reescrever `page.tsx`**

Remove `view`/`selectedPromotion`/`editPromotion`; adiciona contagens + pill tabs de status (padrão `users/page.tsx`); mantém `availableTools` só para os filtros.

```tsx
import { db } from "@emach/db";
import { tool } from "@emach/db/schema/tools";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { asc } from "drizzle-orm";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { PromotionsFilters } from "./_components/promotions-filters";
import { PromotionsGrid } from "./_components/promotions-grid";
import {
	fetchPromotionsPage,
	getPromotionStatusCounts,
	type ListPromotionsOptions,
	type PromotionSort,
	type PromotionStatus,
} from "./actions";

interface PageProps {
	searchParams: Promise<{
		type?: string;
		search?: string;
		status?: string;
		sort?: string;
		toolId?: string;
		discountMin?: string;
		discountMax?: string;
	}>;
}

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set<PromotionStatus | "all">([
	"active",
	"scheduled",
	"expired",
	"inactive",
	"all",
]);

const VALID_SORT = new Set<PromotionSort>([
	"createdDesc",
	"createdAsc",
	"discountDesc",
	"discountAsc",
	"endsAtAsc",
]);

const STATUS_TABS: Array<{ value: PromotionStatus | "all"; label: string }> = [
	{ value: "all", label: "Todas" },
	{ value: "active", label: "Ativas" },
	{ value: "scheduled", label: "Agendadas" },
	{ value: "expired", label: "Expiradas" },
	{ value: "inactive", label: "Inativas" },
];

function parseDiscount(raw?: string): number | undefined {
	if (!raw) {
		return;
	}
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}

function buildStatusHref(
	sp: Record<string, string | undefined>,
	status: PromotionStatus | "all"
): string {
	const params = new URLSearchParams();
	if (status !== "all") {
		params.set("status", status);
	}
	for (const key of [
		"search",
		"type",
		"sort",
		"toolId",
		"discountMin",
		"discountMax",
	] as const) {
		if (sp[key]) {
			params.set(key, sp[key] as string);
		}
	}
	const qs = params.toString();
	return qs ? `/dashboard/promotions?${qs}` : "/dashboard/promotions";
}

export default async function PromotionsPage({ searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const canMutate = can(session.user.role, "promotions.manage");

	const params = await searchParams;
	const search = params.search ?? "";
	const typeParam = params.type;
	const typeFilter =
		typeParam === "promotion" || typeParam === "promocode" ? typeParam : "all";
	const statusFilter = (
		VALID_STATUS.has(params.status as PromotionStatus | "all")
			? params.status
			: "all"
	) as PromotionStatus | "all";
	const sort = (
		VALID_SORT.has(params.sort as PromotionSort) ? params.sort : "createdDesc"
	) as PromotionSort;
	const discountMin = parseDiscount(params.discountMin);
	const discountMax = parseDiscount(params.discountMax);
	const toolId = params.toolId;

	const filters: ListPromotionsOptions = {
		type: typeFilter,
		search: search || undefined,
		status: statusFilter,
		sort,
		toolId,
		discountMin,
		discountMax,
	};

	const [page, availableTools, counts] = await Promise.all([
		fetchPromotionsPage({ filters, cursor: null }),
		db
			.select({ id: tool.id, name: tool.name })
			.from(tool)
			.orderBy(asc(tool.name)),
		getPromotionStatusCounts(),
	]);

	return (
		<>
			<PageHeader
				action={
					canMutate ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/promotions/new"
						>
							Nova promoção
						</Link>
					) : null
				}
				description="Gerencie promoções automáticas e cupons aplicados a ferramentas específicas."
				title="Promoções"
			/>

			<Tabs value={statusFilter}>
				<TabsList scrollable>
					{STATUS_TABS.map((t) => (
						<TabsTrigger
							key={t.value}
							nativeButton={false}
							render={<Link href={buildStatusHref(params, t.value)} />}
							value={t.value}
						>
							{t.label}
							<TabsCountBadge value={counts[t.value]} />
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<PromotionsFilters availableTools={availableTools} />

			<PromotionsGrid
				filters={filters}
				initial={page.items}
				initialCursor={page.nextCursor}
			/>
		</>
	);
}
```

> `counts[t.value]` indexa `PromotionStatusCounts` por `"all" | PromotionStatus` — todas as chaves existem na interface (Task 3).

- [ ] **Step 2: Remover o Select de Status dos filtros**

Em `promotions-filters.tsx`, remover o bloco do `<Select>` de Status (o `<div className="flex flex-col gap-1 md:w-44">` que contém `Label "Status"` + `Select` com `STATUS_OPTIONS`) e a constante `STATUS_OPTIONS`. Manter Busca, Tipo, Ordenar e Filtros avançados. Remover do `TRACKED` a chave `"status"`:

Trocar:

```ts
const TRACKED = [
	"search",
	"type",
	"status",
	"sort",
	"toolId",
	"discountMin",
	"discountMax",
] as const;
```

por:

```ts
const TRACKED = [
	"search",
	"type",
	"sort",
	"toolId",
	"discountMin",
	"discountMax",
] as const;
```

Remover também a const `STATUS_OPTIONS` e o leitor `currentStatus` (`const currentStatus = searchParams.get("status") ?? "all";`) se ficar sem uso.

> Nota: `clearAll()` do `useFilterState` limpa apenas `TRACKED`. Com `status` fora do TRACKED, "Limpar filtros" não reseta a tab de status — o que é correto (status vive nas pill tabs, é navegação, não filtro-bar). Para voltar a "Todas", usa-se a própria tab.

- [ ] **Step 3: Type-check**

Run: `bun check-types`
Expected: sem erros (grid, card, page e filtros agora consistentes).

- [ ] **Step 4: Smoke visual**

`http://localhost:3007/dashboard/promotions`:
- Pill tabs de status com contagens; clicar troca o filtro via URL (`?status=`).
- Cards limpos sem barra de ações; clicar navega para o detalhe.
- Filtros (busca/tipo/avançados) seguem funcionando; "Limpar filtros" não some com a tab de status.
- Scroll infinito funcionando.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/page.tsx apps/web/src/app/dashboard/promotions/_components/promotions-filters.tsx
git commit -m "feat: filtro de status em pill tabs na listagem de promoções"
```

---

## Task 13: Form de criação seccionado

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx`
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx`

Agrupa os campos em seções com markers caps (também melhora o drawer de edição, que usa o mesmo componente).

- [ ] **Step 1: Adicionar markers de seção em `promotion-form-fields.tsx`**

No componente `PromotionFormFields`, envolver os grupos com headers de seção. Substituir o `return (<div className="flex flex-col gap-6">...)` mantendo os campos, mas inserindo markers. Adicionar no topo do arquivo (após os imports) a constante:

```tsx
const SECTION_MARKER =
	"font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider";
```

Estruturar o corpo assim (mantendo os campos existentes intactos dentro de cada grupo):

```tsx
	return (
		<div className="flex flex-col gap-8">
			{/* TIPO */}
			<section className="flex flex-col gap-4">
				<h3 className={SECTION_MARKER}>Tipo</h3>
				{/* ...bloco "Tipo" existente (RadioGroup/label)... */}
			</section>

			{/* IDENTIDADE */}
			<section className="flex flex-col gap-4">
				<h3 className={SECTION_MARKER}>Identidade</h3>
				{/* ...bloco "Título"...; ...bloco "Descrição"...; e o bloco "Código"
				    (mover o JSX `type === "promocode" && (...)` para cá)... */}
			</section>

			{/* DESCONTO & VIGÊNCIA */}
			<section className="flex flex-col gap-4">
				<h3 className={SECTION_MARKER}>Desconto & vigência</h3>
				{/* ...bloco "Desconto (%)"...; ...bloco "Ativa"...; ...bloco "Datas" (grid)... */}
			</section>

			{/* FERRAMENTAS */}
			<section className="flex flex-col gap-4">
				<h3 className={SECTION_MARKER}>Ferramentas</h3>
				{/* ...bloco "Ferramentas" (ToolCombobox)... */}
			</section>
		</div>
	);
```

Não alterar a lógica dos campos (handlers, `onPatch`, `errors`), só o agrupamento e o wrapper externo (`gap-6` → `gap-8` entre seções; cada seção usa `gap-4`).

- [ ] **Step 2: Tirar o box único do form em `promotion-form.tsx`**

Em `PromotionForm`, trocar:

```tsx
			<section className="flex flex-col gap-6 rounded-md border border-border bg-card p-6">
				<PromotionFormFields
					availableTools={availableTools}
					disabled={isPending}
					errors={errors}
					mode={mode}
					onPatch={onPatch}
					values={values}
				/>
			</section>
```

por (deixa as seções internas estruturarem; mantém helper/erros):

```tsx
			<PromotionFormFields
				availableTools={availableTools}
				disabled={isPending}
				errors={errors}
				mode={mode}
				onPatch={onPatch}
				values={values}
			/>
```

(Manter `className="flex w-full max-w-3xl flex-col gap-6"` no `<form>`.)

- [ ] **Step 3: Type-check**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 4: Smoke visual**

- `http://localhost:3007/dashboard/promotions/new` → form com seções caps (Tipo / Identidade / Desconto & vigência / Ferramentas), footer Criar/Cancelar.
- Abrir o drawer de edição a partir de um detalhe (`?edit=1`) → mesmas seções, layout cabe no drawer estreito.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx
git commit -m "feat: form de promoção seccionado (criar + drawer de edição)"
```

---

## Task 14: Remover arquivos mortos

**Files:**
- Delete: `apps/web/src/app/dashboard/promotions/_components/promotion-sheet.tsx`
- Delete: `apps/web/src/app/dashboard/promotions/_components/promotion-quick-actions.tsx`

- [ ] **Step 1: Confirmar que não há mais referências**

Run: `rg -n "promotion-sheet|PromotionSheet|promotion-quick-actions|PromotionQuickActions" apps/web/src`
Expected: nenhuma referência (as removeções das Tasks 11/10 já cortaram os imports).

> Se aparecer alguma referência, removê-la antes de deletar os arquivos.

- [ ] **Step 2: Deletar os arquivos**

```bash
git rm apps/web/src/app/dashboard/promotions/_components/promotion-sheet.tsx apps/web/src/app/dashboard/promotions/_components/promotion-quick-actions.tsx
```

- [ ] **Step 3: Type-check**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte de testes do módulo**

Run: `cd apps/web && bunx vitest run src/app/dashboard/promotions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove view-sheet e quick-actions de promoção (substituídos pelo detalhe)"
```

---

## Task 15: Polish `/impeccable` + smoke final

**Files:** ajustes finos conforme o review (card, detalhe, KPIs, espaçamento, focus/motion).

- [ ] **Step 1: Rodar `/impeccable`**

Invocar `/impeccable` focado em: `promotions/_components/promotion-card.tsx`, `promotions/[id]/_components/*`. Critérios: hierarquia tipográfica, espaçamento, alinhamento dos KPIs, ring/focus AAA, `prefers-reduced-motion`, consistência com filiais. Avaliar se as 4 ações do header ficam densas — se sim, colapsar Duplicar/Excluir num menu `⋮` (`DropdownMenu`).

- [ ] **Step 2: Aplicar ajustes apontados**

Aplicar os findings inline (não despachar subagent para fix ≤5 linhas).

- [ ] **Step 3: Type-check + testes**

Run: `bun check-types && cd apps/web && bunx vitest run src/app/dashboard/promotions`
Expected: tudo verde.

- [ ] **Step 4: Smoke visual completo na 3007**

Percorrer: listagem (tabs + cards) → detalhe (overview/ferramentas) → editar (drawer) → pausar/ativar → duplicar → excluir (redireciona p/ listagem) → criar (form seccionado). Comparar lado a lado com `/dashboard/branches`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: polish impeccable do módulo de promoções"
```

---

## Self-Review (cobertura do spec)

| Requisito do spec | Task |
|---|---|
| §1 Card stat-card limpo, footer edge-to-edge, navega p/ [id], sem ações inline | Task 10 |
| §2 Status → pill tabs c/ TabsCountBadge; Tipo/avançados secundários | Task 12 |
| §3 Detalhe `[id]` identity header + tabs overview/tools + ações contextuais | Tasks 5–9 |
| §3 Editar = drawer (`?edit=1`) | Task 9 (reusa `PromotionEditSheet`) |
| §3 Excluir = AlertDialog + redirect | Tasks 4, 6 |
| §3 Duplicar → cópia + `[novoId]?edit=1` | Task 6 |
| §3 OverviewTab: KPIs + descrição + execução + histórico + código (cupom) | Task 7 |
| §3 ToolsTab: grid media-cards lazy + empty state | Tasks 8, 9 |
| §4 Form de criação seccionado | Task 13 |
| §5 Status badge com ícone (4 estados) | Task 2 |
| §6 Polish /impeccable + smoke | Task 15 |
| §7 `getPromotionStatusCounts` | Task 3 |
| Cleanup (view-sheet, quick-actions) | Task 14 |
| Helpers de vigência (card + KPI Término) | Task 1 |

Sem placeholders. Tipos consistentes entre tasks (`PromotionStatusCounts`, `RemainingDisplay`, `daysRemainingDisplay`, `PromotionDetail`). Ordem garante app funcional a cada commit (rota nova é aditiva antes do card apontar pra ela; remoções do view-sheet só após o detalhe existir).
