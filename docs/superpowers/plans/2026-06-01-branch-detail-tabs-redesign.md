# Redesign das tabs de detalhe da filial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar as tabs Visão Geral, Equipe e Estoque da página `/dashboard/branches/[id]`, com ações de header contextuais por tab.

**Architecture:** Server Component (`page.tsx`) lê `sp.tab` e injeta a ação contextual no header. Helpers puros de formatação testados via vitest; componentes React verificados por `bun check-types` + smoke visual no browser. Segue padrões existentes do dashboard (cards `UserCard`/`BranchCard`, `EntityTabs`, `ActionResult`).

**Tech Stack:** Next 16 (App Router, RSC), React 19, Drizzle, Tailwind, shadcn/@emach/ui, vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-branch-detail-tabs-redesign-design.md`

---

## File Structure

**Criar:**
- `apps/web/src/lib/format/phone.ts` — `formatPhone(raw)`.
- `apps/web/src/lib/format/phone.test.ts` — testes do helper.
- `apps/web/src/lib/format/relative.ts` — `formatRelative(date)` (extraído para reuso).
- `apps/web/src/app/dashboard/branches/[id]/_components/edit-branch-button.tsx` — botão "Editar filial" (client).
- `apps/web/src/app/dashboard/branches/[id]/_components/team-member-card.tsx` — card de membro estilo `UserCard`.
- `apps/web/src/app/dashboard/branches/[id]/_components/team-grid.tsx` — grid de cards de membro.

**Modificar:**
- `apps/web/src/lib/format/branch.ts` — adicionar `formatBusinessPeriod`.
- `apps/web/src/lib/format/branch.test.ts` — testes (criar se não existir).
- `apps/web/src/app/dashboard/branches/data.ts` — `getBranchTeam` + `BranchTeamRow` ganham `status` e `lastLoginAt`.
- `apps/web/src/app/dashboard/branches/[id]/page.tsx` — ação de header contextual por tab.
- `apps/web/src/app/dashboard/branches/[id]/_components/branch-identity.tsx` — recebe `actions` (deixa de embutir "Editar filial").
- `apps/web/src/app/dashboard/branches/[id]/_components/overview-tab.tsx` — layout B (2 cards).
- `apps/web/src/app/dashboard/branches/[id]/_components/team-tab.tsx` — só grid (link panel sai pro header).
- `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx` — footer de 3 métricas.

---

## Task 1: Helper `formatPhone`

**Files:**
- Create: `apps/web/src/lib/format/phone.ts`
- Test: `apps/web/src/lib/format/phone.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/format/phone.test.ts
import { describe, expect, it } from "vitest";
import { formatPhone } from "./phone";

describe("formatPhone", () => {
	it("formata fixo de 10 dígitos", () => {
		expect(formatPhone("1636100000")).toBe("(16) 3610-0000");
	});
	it("formata celular de 11 dígitos", () => {
		expect(formatPhone("16998765432")).toBe("(16) 99876-5432");
	});
	it("normaliza entrada já mascarada", () => {
		expect(formatPhone("(16) 3610-0000")).toBe("(16) 3610-0000");
	});
	it("retorna o valor cru quando não casa 10/11 dígitos", () => {
		expect(formatPhone("123")).toBe("123");
	});
	it("retorna string vazia para null/vazio", () => {
		expect(formatPhone(null)).toBe("");
		expect(formatPhone("")).toBe("");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bunx vitest run src/lib/format/phone.test.ts`
Expected: FAIL — `formatPhone` não existe / módulo não encontrado.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/format/phone.ts
const NON_DIGIT = /\D/g;

/**
 * Formata telefone BR. 10 dígitos → (XX) XXXX-XXXX, 11 → (XX) XXXXX-XXXX.
 * Retorna o valor cru quando não casa, "" para null/vazio.
 */
export function formatPhone(raw: string | null | undefined): string {
	if (!raw) {
		return "";
	}
	const digits = raw.replace(NON_DIGIT, "");
	if (digits.length === 10) {
		return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
	}
	if (digits.length === 11) {
		return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
	}
	return raw;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bunx vitest run src/lib/format/phone.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/format/phone.ts apps/web/src/lib/format/phone.test.ts
git commit -m "feat: helper formatPhone para telefone BR"
```

---

## Task 2: Helper `formatBusinessPeriod`

**Files:**
- Modify: `apps/web/src/lib/format/branch.ts`
- Test: `apps/web/src/lib/format/branch.test.ts` (criar)

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/format/branch.test.ts
import { describe, expect, it } from "vitest";
import { formatBusinessPeriod } from "./branch";

describe("formatBusinessPeriod", () => {
	it("formata período aberto", () => {
		expect(
			formatBusinessPeriod({ isOpen: true, opensAt: "08:00", closesAt: "18:00" })
		).toBe("08:00–18:00");
	});
	it("retorna Fechado quando isOpen=false", () => {
		expect(
			formatBusinessPeriod({ isOpen: false, opensAt: "08:00", closesAt: "18:00" })
		).toBe("Fechado");
	});
	it("retorna Fechado quando horários ausentes", () => {
		expect(
			formatBusinessPeriod({ isOpen: true, opensAt: null, closesAt: null })
		).toBe("Fechado");
	});
	it("retorna Fechado para null", () => {
		expect(formatBusinessPeriod(null)).toBe("Fechado");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bunx vitest run src/lib/format/branch.test.ts`
Expected: FAIL — `formatBusinessPeriod` não exportado.

- [ ] **Step 3: Write minimal implementation**

Adicionar ao final de `apps/web/src/lib/format/branch.ts`:

```ts
import type { BranchBusinessHoursPeriod } from "@emach/db/schema/inventory";

export function formatBusinessPeriod(
	p: BranchBusinessHoursPeriod | null | undefined
): string {
	if (!(p && p.isOpen && p.opensAt && p.closesAt)) {
		return "Fechado";
	}
	return `${p.opensAt}–${p.closesAt}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bunx vitest run src/lib/format/branch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/format/branch.ts apps/web/src/lib/format/branch.test.ts
git commit -m "feat: helper formatBusinessPeriod"
```

---

## Task 3: `getBranchTeam` traz `status` e `lastLoginAt`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/data.ts` (interface `BranchTeamRow` ~136-143; query `getBranchTeam` ~145-161)

- [ ] **Step 1: Atualizar a interface `BranchTeamRow`**

Substituir a interface (linhas ~136-143) por:

```ts
export interface BranchTeamRow {
	email: string;
	image: string | null;
	lastLoginAt: Date | null;
	linkedAt: Date;
	name: string;
	role: "super_admin" | "admin" | "manager" | "user";
	status: "active" | "pending" | "suspended";
	userId: string;
}
```

- [ ] **Step 2: Atualizar o `select` de `getBranchTeam`**

No corpo de `getBranchTeam`, acrescentar os dois campos ao `.select({...})`:

```ts
		.select({
			userId: userTable.id,
			name: userTable.name,
			email: userTable.email,
			role: userTable.role,
			status: userTable.status,
			image: userTable.image,
			lastLoginAt: userTable.lastLoginAt,
			linkedAt: userBranch.createdAt,
		})
```

> Nota: `userTable` é `user as userTable` de `@emach/db/schema/auth`. Confirmado: a coluna drizzle é `lastLoginAt` (mapeia `last_login_at`); o enum `status` é `pending/active/suspended`.

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/web && bun check-types`
Expected: PASS (sem erros novos). Se `lastLoginAt` não existir no schema, ajustar o nome conforme o schema antes de prosseguir.

- [ ] **Step 4: Smoke da query (runtime — `tsc` não pega SQL inválido)**

Garantir `bun dev:web` rodando (porta 3001) e abrir
`http://localhost:3001/dashboard/branches/7b2b8bb5-e85d-4c6b-872d-3dbbe0dc307d?tab=team`.
Expected: a tab Equipe carrega sem erro de SQL (a lista atual ainda renderiza).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/data.ts
git commit -m "feat: getBranchTeam traz status e lastLoginAt"
```

---

## Task 4: Ação de header contextual por tab

**Files:**
- Create: `apps/web/src/app/dashboard/branches/[id]/_components/edit-branch-button.tsx`
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/branch-identity.tsx`
- Modify: `apps/web/src/app/dashboard/branches/[id]/page.tsx`

- [ ] **Step 1: Criar `EditBranchButton` (client)**

```tsx
// apps/web/src/app/dashboard/branches/[id]/_components/edit-branch-button.tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function EditBranchButton() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	const handleEdit = () => {
		const sp = new URLSearchParams(params);
		sp.set("edit", "1");
		router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
	};

	return (
		<Button onClick={handleEdit} size="sm" variant="outline">
			<Pencil aria-hidden className="mr-1.5 size-3.5" />
			Editar filial
		</Button>
	);
}
```

- [ ] **Step 2: Simplificar `BranchIdentity` (vira server component, recebe `actions`)**

Substituir o conteúdo inteiro de `branch-identity.tsx` por:

```tsx
import { Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import { formatBranchAddress } from "@/lib/format/branch";
import { formatPhone } from "@/lib/format/phone";
import type { BranchDetail } from "../../data";

export function BranchIdentity({
	detail,
	badges,
	actions,
}: {
	detail: BranchDetail;
	badges?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<EntityIdentityHeader
			actions={actions}
			avatarFallback={<Building2 aria-hidden className="size-5" />}
			badges={badges}
			subtitle={
				formatBranchAddress(detail) ?? formatPhone(detail.phone) ?? undefined
			}
			title={detail.name}
		/>
	);
}
```

- [ ] **Step 3: Montar a ação contextual no `page.tsx`**

Em `page.tsx`, trocar os imports de `BranchEditSheet`/`BranchIdentity` para incluir `EditBranchButton` e `TeamLinkPanel`:

```tsx
import { EditBranchButton } from "./_components/edit-branch-button";
import { TeamLinkPanel } from "./_components/team-link-panel";
```

Substituir o bloco do `return` que renderiza `<BranchIdentity .../>` (linhas ~98-105) por:

```tsx
	const headerAction = isStockTab
		? canMutateStock
			? <AddToolButton branchId={id} branchName={detail.name} />
			: null
		: sp.tab === "team"
			? <TeamLinkPanel branchId={id} />
			: !sp.tab || sp.tab === "overview"
				? <EditBranchButton />
				: null;

	return (
		<div className="flex flex-col gap-6 p-6">
			<BranchIdentity actions={headerAction} detail={detail} />
			<EntityTabs defaultValue="overview" tabs={tabs} />
			{sp.edit === "1" ? <BranchEditSheet branch={detail} /> : null}
		</div>
	);
```

> O `extraAction`/`AddToolButton` que hoje vive separado é absorvido por `headerAction`. Remover o `extraAction={...}` antigo do `<BranchIdentity>`.

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/web && bun check-types`
Expected: PASS.

- [ ] **Step 5: Smoke visual (Claude-in-Chrome, Brave "Notbook")**

Abrir as 4 tabs e confirmar a ação do header em cada uma:
- overview → "Editar filial"
- `?tab=team` → "Vincular usuário"
- `?tab=stock` → "Adicionar ao estoque"
- `?tab=orders` → nenhuma ação

Confirmar que "Editar filial" abre o sheet (seta `?edit=1`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/branches/[id]/_components/edit-branch-button.tsx \
  apps/web/src/app/dashboard/branches/[id]/_components/branch-identity.tsx \
  apps/web/src/app/dashboard/branches/[id]/page.tsx
git commit -m "feat: ações de header contextuais por tab da filial"
```

---

## Task 5: Visão Geral — layout B (2 cards)

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/overview-tab.tsx` (reescrever o JSX do card de informações)

- [ ] **Step 1: Reescrever `overview-tab.tsx`**

Substituir o conteúdo inteiro por:

```tsx
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Badge } from "@emach/ui/components/badge";
import { Building2, MapPin, Package, ShoppingCart, Users } from "lucide-react";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import {
	formatBranchAddress,
	formatBusinessPeriod,
	formatCep,
} from "@/lib/format/branch";
import { formatPhone } from "@/lib/format/phone";
import type { BranchDetail, BranchDetailKpis } from "../../data";

const BRL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function formatDate(date: Date): string {
	return new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(date);
}

function mapsHref(detail: BranchDetail): string | null {
	const addr = formatBranchAddress(detail);
	if (!addr) {
		return null;
	}
	const query = encodeURIComponent(`${addr} ${formatCep(detail.cep) ?? ""}`.trim());
	return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

interface Props {
	detail: BranchDetail;
	kpis: BranchDetailKpis;
}

export function OverviewTab({ detail, kpis }: Props) {
	const phone = formatPhone(detail.phone);
	const address = formatBranchAddress(detail);
	const cep = formatCep(detail.cep);
	const href = mapsHref(detail);
	const bh = detail.businessHours;

	return (
		<div className="flex flex-col gap-6">
			<EntityKpisRow
				items={[
					{ label: "Membros da equipe", value: kpis.teamSize, icon: Users },
					{ label: "SKUs em estoque", value: kpis.skuCount, icon: Package },
					{
						label: "Valor em estoque",
						value: BRL.format(kpis.stockValue),
						icon: Building2,
					},
					{
						label: "Pedidos (30 dias)",
						value: kpis.orders30d,
						icon: ShoppingCart,
					},
				]}
			/>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				{/* Endereço & contato */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="text-sm">Endereço & contato</CardTitle>
						<Badge variant={detail.status === "active" ? "success" : "secondary"}>
							{detail.status === "active" ? "Ativa" : "Inativa"}
						</Badge>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								Endereço
							</p>
							{address ? (
								<div className="mt-1 flex flex-col gap-0.5 text-sm">
									<span>{address}</span>
									{cep && (
										<span className="text-muted-foreground text-xs">
											CEP {cep}
										</span>
									)}
									{detail.complement && (
										<span className="text-muted-foreground text-xs">
											Compl.: {detail.complement}
										</span>
									)}
									{href && (
										<a
											className="mt-1 inline-flex w-fit items-center gap-1.5 text-primary text-xs hover:underline"
											href={href}
											rel="noopener"
											target="_blank"
										>
											<MapPin aria-hidden className="size-3.5" />
											Abrir no Google Maps
										</a>
									)}
								</div>
							) : (
								<p className="mt-1 text-muted-foreground text-sm italic">
									Endereço não cadastrado
								</p>
							)}
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Telefone
								</p>
								<p className="mt-1 text-sm">
									{phone || (
										<span className="text-muted-foreground italic">Não informado</span>
									)}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Responsável
								</p>
								<p className="mt-1 text-sm">
									{detail.responsibleName ?? (
										<span className="text-muted-foreground italic">Não definido</span>
									)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Operação */}
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Operação</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								Horário de funcionamento
							</p>
							{bh ? (
								<dl className="mt-1 flex flex-col gap-1 text-sm">
									<div className="flex justify-between">
										<dt className="text-muted-foreground">Seg – Sex</dt>
										<dd className="tabular-nums">{formatBusinessPeriod(bh.weekdays)}</dd>
									</div>
									<div className="flex justify-between">
										<dt className="text-muted-foreground">Sábado</dt>
										<dd className="tabular-nums">{formatBusinessPeriod(bh.saturday)}</dd>
									</div>
									<div className="flex justify-between">
										<dt className="text-muted-foreground">Feriados</dt>
										<dd className="tabular-nums">{formatBusinessPeriod(bh.holidays)}</dd>
									</div>
								</dl>
							) : (
								<p className="mt-1 text-muted-foreground text-sm italic">
									Não configurado
								</p>
							)}
						</div>
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								Faixas de CEP atendidas
							</p>
							{detail.cepRanges && detail.cepRanges.length > 0 ? (
								<div className="mt-1 flex flex-col gap-0.5 text-sm">
									{detail.cepRanges.map((range) => (
										<span key={`${range.from}-${range.to}`}>
											{range.label ? `${range.label}: ` : ""}
											{formatCep(range.from)} a {formatCep(range.to)}
										</span>
									))}
								</div>
							) : (
								<p className="mt-1 text-muted-foreground text-sm italic">
									Nenhuma faixa cadastrada
								</p>
							)}
						</div>
						<div className="grid grid-cols-2 gap-4 border-border border-t pt-4">
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Criada em
								</p>
								<p className="mt-1 text-sm tabular-nums">
									{formatDate(detail.createdAt)}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Atualizada em
								</p>
								<p className="mt-1 text-sm tabular-nums">
									{formatDate(detail.updatedAt)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/web && bun check-types`
Expected: PASS. (Confirmado: `Badge` tem as variantes `secondary` e `success`.)

- [ ] **Step 3: Smoke visual (Brave "Notbook")**

Abrir `/dashboard/branches/7b2b8bb5-e85d-4c6b-872d-3dbbe0dc307d`. Confirmar:
- 2 cards lado a lado (Endereço & contato | Operação).
- Telefone `(16) 3610-0000`, badge "Ativa", link "Abrir no Google Maps".
- Empty states: horário "Não configurado", faixas "Nenhuma faixa", responsável "Não definido".

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/[id]/_components/overview-tab.tsx
git commit -m "feat: visão geral da filial em layout de 2 cards"
```

---

## Task 6: Equipe — cards estilo Usuários

**Files:**
- Create: `apps/web/src/lib/format/relative.ts`
- Create: `apps/web/src/app/dashboard/branches/[id]/_components/team-member-card.tsx`
- Create: `apps/web/src/app/dashboard/branches/[id]/_components/team-grid.tsx`
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/team-tab.tsx`

- [ ] **Step 1: Criar helper `formatRelative`**

```ts
// apps/web/src/lib/format/relative.ts
const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

/** Tempo relativo legível (minutos/horas/dias/meses) a partir de agora. */
export function formatRelative(date: Date): string {
	const diffMs = date.getTime() - Date.now();
	const absDays = Math.abs(diffMs) / 86_400_000;
	if (absDays < 1) {
		const absHours = Math.abs(diffMs) / 3_600_000;
		if (absHours < 1) {
			return RELATIVE.format(Math.round(diffMs / 60_000), "minute");
		}
		return RELATIVE.format(Math.round(diffMs / 3_600_000), "hour");
	}
	const diffDays = Math.round(diffMs / 86_400_000);
	if (absDays < 30) {
		return RELATIVE.format(diffDays, "day");
	}
	return RELATIVE.format(Math.round(diffDays / 30), "month");
}
```

- [ ] **Step 2: Criar `TeamMemberCard`**

```tsx
// apps/web/src/app/dashboard/branches/[id]/_components/team-member-card.tsx
"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@emach/ui/components/alert-dialog";
import { Button } from "@emach/ui/components/button";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/app/dashboard/users/_components/status-badge";
import { getInitials } from "@/lib/format/name";
import { formatRelative } from "@/lib/format/relative";
import { unlinkUserFromBranchAction } from "../../actions";
import type { BranchTeamRow } from "../../data";

const ROLE_LABEL: Record<BranchTeamRow["role"], string> = {
	super_admin: "Super admin",
	admin: "Admin",
	manager: "Gerente",
	user: "Usuário",
};

interface Props {
	branchId: string;
	member: BranchTeamRow;
}

export function TeamMemberCard({ branchId, member }: Props) {
	const router = useRouter();
	const [unlinking, setUnlinking] = useState(false);

	async function handleUnlink() {
		setUnlinking(true);
		try {
			const result = await unlinkUserFromBranchAction({
				branchId,
				userId: member.userId,
			});
			if (result.ok) {
				toast.success(`${member.name} desvinculado da filial.`);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		} finally {
			setUnlinking(false);
		}
	}

	return (
		<div
			className="group flex cursor-pointer flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => router.push(`/dashboard/users/${member.userId}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/dashboard/users/${member.userId}`);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3">
				<div className="flex size-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-muted font-bold text-[18px] text-foreground">
					{member.image ? (
						// biome-ignore lint/performance/noImgElement: avatar do usuário
						// biome-ignore lint/correctness/useImageSize: tamanho fixo via Tailwind
						<img alt="" className="size-full object-cover" src={member.image} />
					) : (
						getInitials(member.name)
					)}
				</div>
				<div className="min-w-0 flex-1">
					<span className="block truncate font-semibold text-[14px] text-foreground leading-tight">
						{member.name}
					</span>
					<p className="truncate text-muted-foreground text-xs">{member.email}</p>
				</div>
				<StatusBadge status={member.status} />
			</div>

			<div className="flex items-center justify-between gap-2 border-border border-t pt-3">
				<span className="text-muted-foreground text-xs">
					<span className="font-semibold text-foreground">
						{ROLE_LABEL[member.role]}
					</span>
					<span aria-hidden className="mx-1.5">
						·
					</span>
					{member.lastLoginAt
						? `Login ${formatRelative(member.lastLoginAt)}`
						: "Nunca logou"}
				</span>
				<AlertDialog>
					<AlertDialogTrigger
						render={
							<Button
								onClick={(e) => e.stopPropagation()}
								size="sm"
								variant="ghost"
							/>
						}
					>
						Desvincular
					</AlertDialogTrigger>
					<AlertDialogContent onClick={(e) => e.stopPropagation()}>
						<AlertDialogHeader>
							<AlertDialogTitle>Desvincular {member.name}?</AlertDialogTitle>
							<AlertDialogDescription>
								O usuário perde o acesso a esta filial. É possível vincular de novo
								depois.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancelar</AlertDialogCancel>
							<AlertDialogAction disabled={unlinking} onClick={handleUnlink}>
								{unlinking ? (
									<Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" />
								) : null}
								Desvincular
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}
```

> Confirmado: o `@emach/ui` usa base-ui, com o prop `render` (como no código acima) — não `asChild`. Para o padrão de `disabled`/`onClick` no `AlertDialogAction`, espelhar `destructive-action-dialog.tsx` (users).

- [ ] **Step 3: Criar `TeamGrid`**

```tsx
// apps/web/src/app/dashboard/branches/[id]/_components/team-grid.tsx
import { Users } from "lucide-react";
import type { BranchTeamRow } from "../../data";
import { TeamMemberCard } from "./team-member-card";

interface Props {
	branchId: string;
	members: BranchTeamRow[];
}

export function TeamGrid({ branchId, members }: Props) {
	if (members.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Users aria-hidden className="size-12 text-muted-foreground opacity-40" />
				<p className="font-medium text-sm">Nenhum membro vinculado</p>
				<p className="text-muted-foreground text-xs">
					Use "Vincular usuário" no topo para adicionar membros a esta filial.
				</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{members.map((member) => (
				<TeamMemberCard branchId={branchId} key={member.userId} member={member} />
			))}
		</div>
	);
}
```

- [ ] **Step 4: Simplificar `team-tab.tsx`** (o link panel saiu pro header na Task 4)

```tsx
// apps/web/src/app/dashboard/branches/[id]/_components/team-tab.tsx
import type { BranchTeamRow } from "../../data";
import { TeamGrid } from "./team-grid";

interface Props {
	branchId: string;
	team: BranchTeamRow[];
}

export function TeamTab({ branchId, team }: Props) {
	return <TeamGrid branchId={branchId} members={team} />;
}
```

- [ ] **Step 5: Verificar tipos**

Run: `cd apps/web && bun check-types`
Expected: PASS.

- [ ] **Step 6: Smoke visual (Brave "Notbook")**

Abrir `?tab=team`. Confirmar: grid de 3 cards (Othavio super_admin, Estoquista, Teste Pendente), badge "Ativo", clique no card vai pro perfil, "Desvincular" abre confirmação. "Vincular usuário" no header.

- [ ] **Step 7: Remover `team-list.tsx` (não mais usado)**

```bash
git rm apps/web/src/app/dashboard/branches/[id]/_components/team-list.tsx
```

Confirmar que nada mais importa `team-list`: `rg "team-list" apps/web/src` deve não retornar nada.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/format/relative.ts \
  apps/web/src/app/dashboard/branches/[id]/_components/team-member-card.tsx \
  apps/web/src/app/dashboard/branches/[id]/_components/team-grid.tsx \
  apps/web/src/app/dashboard/branches/[id]/_components/team-tab.tsx
git commit -m "feat: equipe da filial em grid de cards estilo usuário"
```

---

## Task 7: Estoque — footer de 3 métricas por card

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx` (substituir o bloco `.sline`, ~104-122)

- [ ] **Step 1: Substituir o corpo inferior do card**

No `branch-stock-card.tsx`, trocar o bloco que hoje renderiza `<hr>` + a linha de Qtd/Mín·Rep (do `<hr ... />` até o fechamento da `<div>` de quantidade) por um footer de 3 colunas. O corpo do card passa a ser:

```tsx
			{/* Corpo */}
			<div className="flex flex-col gap-2 px-4 pt-3 pb-3">
				<div>
					<Link
						className="line-clamp-2 block font-sans font-semibold text-[14px] text-foreground leading-[1.3] tracking-tight hover:underline"
						href={`/dashboard/tools/${row.toolId}?tab=estoque`}
						onClick={(e) => e.stopPropagation()}
					>
						{row.toolName}
					</Link>
					<p className="line-clamp-1 text-muted-foreground text-xs">
						SKU {row.sku}
						{row.voltage ? ` · ${row.voltage}` : ""}
					</p>
				</div>
			</div>

			{/* Footer de 3 métricas (espelha o card de filial) */}
			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span
						className={`font-bold text-[18px] tabular-nums ${
							status === "critical"
								? "text-destructive"
								: status === "reorder"
									? "text-amber-500"
									: "text-foreground"
						}`}
					>
						{row.quantity}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Qtd
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{row.minQty > 0 ? row.minQty : "—"}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Mín
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{row.reorderPoint > 0 ? row.reorderPoint : "—"}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Repor
					</span>
				</div>
			</div>
```

> `status` já é calculado no topo do componente (`const status = stockStatus(row)`). A faixa de imagem com o badge de status permanece inalterada acima do corpo.

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/web && bun check-types`
Expected: PASS.

- [ ] **Step 3: Smoke visual (Brave "Notbook")**

Abrir `?tab=stock`. Confirmar: cada card com footer Qtd/Mín/Repor em 3 colunas; coluna Qtd neutra (filial está toda OK); badge de status na imagem mantido; clique abre o painel de ajuste; nome linka pra ferramenta.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx
git commit -m "feat: footer de métricas no card de estoque da filial"
```

---

## Task 8: Smoke final + verificação

- [ ] **Step 1: `bun check-types` global**

Run: `bun check-types`
Expected: PASS sem erros.

- [ ] **Step 2: Rodar os testes de helper**

Run: `cd apps/web && bunx vitest run src/lib/format/`
Expected: PASS (phone + branch).

- [ ] **Step 3: Smoke visual completo (Brave "Notbook")**

Percorrer as 3 tabs da filial Ribeirão Preto e a tab Pedidos, confirmando ausência de regressão e que cada ação contextual do header está correta. Capturar screenshot de cada tab para o usuário validar.

- [ ] **Step 4: `/code-review` do diff**

Rodar `/code-review` no diff acumulado das tasks para varredura final de bugs/simplificações.

---

## Self-Review (preenchido)

**Spec coverage:**
- Header contextual → Task 4 ✓
- Visão Geral layout B + formatPhone + status + horário + maps + empty states → Tasks 1, 2, 5 ✓
- Equipe cards + desvincular + status/lastLoginAt → Tasks 3, 6 ✓
- Estoque footer 3 métricas + cores por status → Task 7 ✓
- Fora de escopo (Pedidos, mapa pago, painel resumo) → não há tasks ✓

**Type consistency:** `BranchTeamRow` ganha `status`/`lastLoginAt` na Task 3, consumidos na Task 6. `formatPhone`/`formatBusinessPeriod`/`formatRelative` definidos antes de serem usados. `stockStatus`/`status` reusado na Task 7. `BranchIdentity.actions` definido na Task 4 e usado no `page.tsx` da mesma task.

**Pontos de atenção sinalizados nos steps (não placeholders — verificações reais):**
- Nome da coluna `lastLoginAt` no schema auth (Task 3, Step 2).
- Variante `secondary` do `Badge` (Task 5, Step 2).
- API do `AlertDialog` (`render` vs `asChild`) conforme o repo (Task 6, Step 2).
