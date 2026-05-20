# Fase 3 — Suppliers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/dashboard/suppliers` em CRUD rico com lista (KPIs + filters/sort + table), detalhe com 3 tabs (Visão geral, Ferramentas, Histórico), edit sheet via `?edit=1`, validação de CNPJ e audit log via `supplierAuditLog`.

**Architecture:** Reusa primitives da Fase 0 (`EntityKpisRow`, `EntityIdentityHeader`, `EntityTabs`, `EntityEditSheet`, `EntityAuditLogTable`). `cnpj` validation usa `normalizeCnpj`/`isValidCnpj` (Fase 0). Adiciona insert de `supplierAuditLog` em create/update/delete (com beforeJson/afterJson para diff visual).

**Tech Stack:** Next 16 RSC + Server Actions, Drizzle, shadcn/ui Table, cursor pagination, react-markdown + rehype-sanitize para `notes`.

**Spec ref:** `docs/superpowers/specs/2026-05-20-users-branches-suppliers-design.md` § "Fase 3 — Suppliers" (linhas 335–403).

**Branch:** `fase-3-suppliers` (criada a partir de `fase-2-branches` por escolha do user — Fase 2 ainda pending merge).

---

## Convenções

- `actorUserId` em `logUserActivity` vem de `requireCapability` ou `requireCurrentSession`.
- `supplierAuditLog`: sempre `actorType: "user"` + `actorUserId: session.user.id` quando origem é admin. `beforeJson`/`afterJson` armazenam os campos relevantes (não tokens, não secrets).
- Server actions devolvem `ActionResult<T> = { ok: true; data } | { ok: false; error }`.
- IDs novos via `crypto.randomUUID()`.
- Commits Conventional Commits PT, ≤50 chars.
- Subagent-driven: controller commita inline ou autoriza explicitamente.

---

## Task 1: Estender `supplierSchema` com website + cnpj

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/_components/supplier-schema.ts`
- Modify: `apps/web/src/app/dashboard/suppliers/actions.ts` (função `normalizePayload`)

- [ ] **Step 1: Reescrever schema**

```ts
import { z } from "zod";
import { isValidCnpj, normalizeCnpj } from "@/lib/validation/cnpj";

const URL_RE = /^https?:\/\/.+/i;

export const supplierSchema = z.object({
	name: z.string().trim().min(1, "Nome obrigatório").min(2, "Nome muito curto").max(120, "Nome muito longo"),
	contactEmail: z.email("E-mail inválido").max(180, "E-mail muito longo").optional().or(z.literal("")),
	phone: z.string().trim().max(40, "Telefone muito longo").optional().or(z.literal("")),
	website: z
		.string()
		.trim()
		.max(255, "URL muito longa")
		.refine((v) => !v || URL_RE.test(v), "URL deve começar com http:// ou https://")
		.optional()
		.or(z.literal("")),
	cnpj: z
		.string()
		.trim()
		.refine((v) => !v || isValidCnpj(v), "CNPJ inválido")
		.optional()
		.or(z.literal("")),
	notes: z.string().trim().max(1000, "Observações muito longas").optional().or(z.literal("")),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;
```

- [ ] **Step 2: Atualizar `normalizePayload` em `actions.ts`**

```ts
import { normalizeCnpj } from "@/lib/validation/cnpj";

function normalizePayload(input: SupplierFormValues) {
	const contactEmail = input.contactEmail?.trim();
	const phone = input.phone?.trim();
	const website = input.website?.trim();
	const cnpjDigits = input.cnpj ? normalizeCnpj(input.cnpj) : "";
	const notes = input.notes?.trim();

	return {
		name: input.name,
		contactEmail: contactEmail ? contactEmail : null,
		phone: phone ? phone : null,
		website: website ? website : null,
		cnpj: cnpjDigits ? cnpjDigits : null,
		notes: notes ? notes : null,
	};
}
```

- [ ] **Step 3:** `bun check-types`.
- [ ] **Step 4: Commit** `feat(suppliers): website + cnpj no schema`.

---

## Task 2: Data layer (`data.ts`)

**Files:**
- Create: `apps/web/src/app/dashboard/suppliers/data.ts`

- [ ] **Step 1: Implementar**

```ts
import "server-only";

import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { toolCategory } from "@emach/db/schema/categories";
import { supplierAuditLog } from "@emach/db/schema/supplier-audit";
import { supplier, tool, toolVariant } from "@emach/db/schema/tools";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

export interface SupplierKpis {
	total: number;
	withActive: number;
	empty: number;
	recent30d: number;
}

export async function getSupplierKpis(): Promise<SupplierKpis> {
	const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(supplier);
	const [withActive] = await db
		.select({ n: sql<number>`count(distinct ${supplier.id})::int` })
		.from(supplier)
		.innerJoin(tool, eq(tool.supplierId, supplier.id))
		.where(eq(tool.isActive, true));
	const [empty] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(supplier)
		.leftJoin(tool, eq(tool.supplierId, supplier.id))
		.where(isNull(tool.id));
	const [recent] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(supplier)
		.where(sql`${supplier.createdAt} >= now() - interval '30 days'`);
	return {
		total: total?.n ?? 0,
		withActive: withActive?.n ?? 0,
		empty: empty?.n ?? 0,
		recent30d: recent?.n ?? 0,
	};
}

export interface SupplierDetail {
	id: string;
	name: string;
	contactEmail: string | null;
	phone: string | null;
	website: string | null;
	cnpj: string | null;
	notes: string | null;
	createdAt: Date;
	updatedAt: Date;
	toolsTotal: number;
	toolsActive: number;
	toolsInactive: number;
}

export async function getSupplierDetail(id: string): Promise<SupplierDetail | null> {
	const [base] = await db.select().from(supplier).where(eq(supplier.id, id)).limit(1);
	if (!base) return null;
	const [counts] = await db
		.select({
			total: sql<number>`count(*)::int`,
			active: sql<number>`count(*) filter (where ${tool.isActive} = true)::int`,
			inactive: sql<number>`count(*) filter (where ${tool.isActive} = false)::int`,
		})
		.from(tool)
		.where(eq(tool.supplierId, id));
	return {
		id: base.id,
		name: base.name,
		contactEmail: base.contactEmail,
		phone: base.phone,
		website: base.website,
		cnpj: base.cnpj,
		notes: base.notes,
		createdAt: base.createdAt,
		updatedAt: base.updatedAt,
		toolsTotal: counts?.total ?? 0,
		toolsActive: counts?.active ?? 0,
		toolsInactive: counts?.inactive ?? 0,
	};
}

export interface SupplierDetailKpis {
	activeTools: number;
	inactiveTools: number;
	lastToolAddedAt: Date | null;
	categoriesCovered: number;
}

export async function getSupplierDetailKpis(supplierId: string): Promise<SupplierDetailKpis> {
	const [counts] = await db
		.select({
			active: sql<number>`count(*) filter (where ${tool.isActive} = true)::int`,
			inactive: sql<number>`count(*) filter (where ${tool.isActive} = false)::int`,
			last: sql<Date | null>`max(${tool.createdAt})`,
		})
		.from(tool)
		.where(eq(tool.supplierId, supplierId));
	const [cats] = await db
		.select({ n: sql<number>`count(distinct ${toolCategory.categoryId})::int` })
		.from(tool)
		.innerJoin(toolCategory, eq(toolCategory.toolId, tool.id))
		.where(eq(tool.supplierId, supplierId));
	return {
		activeTools: counts?.active ?? 0,
		inactiveTools: counts?.inactive ?? 0,
		lastToolAddedAt: counts?.last ?? null,
		categoriesCovered: cats?.n ?? 0,
	};
}

export interface SupplierToolRow {
	id: string;
	name: string;
	slug: string;
	isActive: boolean;
	defaultSku: string | null;
	createdAt: Date;
}

export async function getSupplierTools(supplierId: string, search: string): Promise<SupplierToolRow[]> {
	const pattern = `%${search}%`;
	return await db
		.select({
			id: tool.id,
			name: tool.name,
			slug: tool.slug,
			isActive: tool.isActive,
			defaultSku: sql<string | null>`(select sku from tool_variant where tool_id = ${tool.id} and is_default = true limit 1)`,
			createdAt: tool.createdAt,
		})
		.from(tool)
		.where(
			search
				? and(eq(tool.supplierId, supplierId), or(ilike(tool.name, pattern), ilike(tool.slug, pattern)))
				: eq(tool.supplierId, supplierId),
		)
		.orderBy(desc(tool.createdAt))
		.limit(100);
}

export interface SupplierAuditRow {
	id: string;
	action: string;
	actorName: string | null;
	beforeJson: Record<string, unknown> | null;
	afterJson: Record<string, unknown> | null;
	reason: string | null;
	createdAt: Date;
}

export async function getSupplierAuditLog(supplierId: string, limit = 50): Promise<SupplierAuditRow[]> {
	return await db
		.select({
			id: supplierAuditLog.id,
			action: supplierAuditLog.action,
			actorName: userTable.name,
			beforeJson: supplierAuditLog.beforeJson,
			afterJson: supplierAuditLog.afterJson,
			reason: supplierAuditLog.reason,
			createdAt: supplierAuditLog.createdAt,
		})
		.from(supplierAuditLog)
		.leftJoin(userTable, eq(userTable.id, supplierAuditLog.actorUserId))
		.where(eq(supplierAuditLog.supplierId, supplierId))
		.orderBy(desc(supplierAuditLog.createdAt))
		.limit(limit);
}

export interface SupplierTableRow {
	id: string;
	name: string;
	contactEmail: string | null;
	phone: string | null;
	createdAt: Date;
	toolsTotal: number;
	toolsActive: number;
}

export async function getSupplierTableAggregates(
	supplierIds: string[],
): Promise<Map<string, { toolsTotal: number; toolsActive: number }>> {
	if (supplierIds.length === 0) return new Map();
	const rows = await db
		.select({
			supplierId: tool.supplierId,
			total: sql<number>`count(*)::int`,
			active: sql<number>`count(*) filter (where ${tool.isActive} = true)::int`,
		})
		.from(tool)
		.where(sql`${tool.supplierId} = any(${supplierIds})`)
		.groupBy(tool.supplierId);
	const map = new Map<string, { toolsTotal: number; toolsActive: number }>();
	for (const id of supplierIds) {
		map.set(id, { toolsTotal: 0, toolsActive: 0 });
	}
	for (const r of rows) {
		if (r.supplierId) {
			map.set(r.supplierId, { toolsTotal: r.total, toolsActive: r.active });
		}
	}
	return map;
}
```

Verifique nomes reais antes de copiar literal:
- `tool.isActive` — confirme em `packages/db/src/schema/tools.ts`. Pode ser `tool.active`, `tool.visibleOnSite`, ou outro flag. Adapte.
- `toolCategory` em `packages/db/src/schema/categories.ts` — pode ser `tool_category` (snake) ou outro nome no export.

- [ ] **Step 2:** `bun check-types`.
- [ ] **Step 3: Commit** `feat(suppliers): data fetchers (kpis, detail, audit)`.

---

## Task 3: Server actions — audit log + delete guard + sort

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/actions.ts`

### Mudanças

- `createSupplier`: após insert, gravar `supplierAuditLog` com `action: "created"`, `afterJson` com o payload normalizado.
- `updateSupplier`: antes do update, SELECT do estado atual (para `beforeJson`); após update, INSERT em `supplierAuditLog` com `action: "profile_updated"`, `beforeJson` + `afterJson`.
- `deleteSupplier`: bloquear se há `tool` count > 0 (mensagem: "Fornecedor tem N ferramenta(s). Mova ou exclua antes."); se ok, INSERT `supplierAuditLog` `action: "deleted"`, `beforeJson` com o estado.
- `listSuppliers`/`fetchSuppliersPage`: adicionar `sort` param (`newest` | `name` | `tools`). `tools` ordena por count DESC.
- Adicionar `fetchSuppliersTablePage` (paralelo a `fetchBranchesTablePage`) que reusa fetcher base + agregados.

### Skeleton dos audit inserts

```ts
import { supplierAuditLog } from "@emach/db/schema/supplier-audit";

// dentro de createSupplier, após o insert do supplier:
await db.insert(supplierAuditLog).values({
	id: crypto.randomUUID(),
	supplierId: id,
	actorType: "user",
	actorUserId: session.user.id,
	action: "created",
	afterJson: payload,
});

// updateSupplier — antes do update:
const [before] = await db
	.select({
		name: supplier.name,
		contactEmail: supplier.contactEmail,
		phone: supplier.phone,
		website: supplier.website,
		cnpj: supplier.cnpj,
		notes: supplier.notes,
	})
	.from(supplier)
	.where(eq(supplier.id, id))
	.limit(1);

if (!before) {
	return { ok: false, error: "Fornecedor não encontrado" };
}

// ... await db.update(supplier).set(payload)...
await db.insert(supplierAuditLog).values({
	id: crypto.randomUUID(),
	supplierId: id,
	actorType: "user",
	actorUserId: session.user.id,
	action: "profile_updated",
	beforeJson: before,
	afterJson: payload,
});

// deleteSupplier — guard + audit:
const [counts] = await db
	.select({ n: sql<number>`count(*)::int` })
	.from(tool)
	.where(eq(tool.supplierId, id));

if ((counts?.n ?? 0) > 0) {
	return {
		ok: false,
		error: `Fornecedor tem ${counts?.n} ferramenta(s) vinculada(s). Mova ou exclua antes.`,
	};
}

const [snapshot] = await db
	.select({ name: supplier.name, contactEmail: supplier.contactEmail, phone: supplier.phone, website: supplier.website, cnpj: supplier.cnpj, notes: supplier.notes })
	.from(supplier).where(eq(supplier.id, id)).limit(1);

// ... await db.delete(...) ...

if (snapshot) {
	await db.insert(supplierAuditLog).values({
		id: crypto.randomUUID(),
		supplierId: id,
		actorType: "user",
		actorUserId: session.user.id,
		action: "deleted",
		beforeJson: snapshot,
	});
}
```

### `SuppliersSort` type + sort

```ts
export type SuppliersSort = "newest" | "name" | "tools";

export interface SuppliersFiltersInput {
	search?: string;
	sort: SuppliersSort;
}
```

Para `sort: "tools"`: usar subquery agregada ou JOIN com `count(*)` no ORDER BY. Cursor para sort=tools fica `{ v: 1, sort: "tools", toolsCount: number, id: string }` (DESC, com id tiebreaker).

Se sort=tools complicar pagination, **simplifique**: ofereça só `newest` e `name` por agora; coloque "tools" como TODO. O importante é newest + name.

- [ ] **Step 1:** Implementar mudanças (audit + guard + sort newest/name; tools como TODO se complicar).
- [ ] **Step 2:** `bun check-types`.
- [ ] **Step 3: Commit** `feat(suppliers): audit log + delete guard + sort`.

---

## Task 4: `SuppliersFilters` (search + sort)

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/_components/suppliers-filter.tsx`

Adicionar Select de sort (`Mais recentes`, `Nome A–Z`). Pattern de `branches-filters.tsx` (criado na Fase 2).

- [ ] **Step 1:** Reescrever no padrão de branches.
- [ ] **Step 2: Commit** `feat(suppliers): filters bar com sort`.

---

## Task 5: `SuppliersTable` (refactor)

**Files:**
- Reescrever: `apps/web/src/app/dashboard/suppliers/_components/suppliers-table.tsx`

Colunas: Nome (link → detalhe), Email, Telefone, Ferramentas (`{toolsActive}/{toolsTotal} ativas` com badge se ativas > 0), Adicionado em, ⋯ menu (Detalhes / Editar).

Estrutura idêntica a `branches-table.tsx` — copie e adapte. Empty state com ícone `Factory` lucide.

- [ ] **Step 1: Implementar**
- [ ] **Step 2:** `bun check-types` + `bunx ultracite check`.
- [ ] **Step 3: Commit** `feat(suppliers): table com agregados`.

---

## Task 6: Refactor lista `page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/page.tsx`

PageHeader + EntityKpisRow + SuppliersFilters + SuppliersTable. Estrutura idêntica à `/dashboard/branches/page.tsx`.

- [ ] **Step 1: Reescrever**
- [ ] **Step 2: Smoke** `/dashboard/suppliers`.
- [ ] **Step 3: Commit** `feat(suppliers): lista com KPIs + filters + table`.

---

## Task 7: Detalhe `[id]/page.tsx` + 3 tabs

**Files:**
- Reescrever: `apps/web/src/app/dashboard/suppliers/[id]/page.tsx`
- Criar: `apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-identity.tsx` (client, com botão Editar)
- Criar: `apps/web/src/app/dashboard/suppliers/[id]/_components/overview-tab.tsx`
- Criar: `apps/web/src/app/dashboard/suppliers/[id]/_components/tools-tab.tsx`
- Criar: `apps/web/src/app/dashboard/suppliers/[id]/_components/history-tab.tsx`

### `[id]/page.tsx`

```tsx
import { Factory, History, ListChecks, Wrench } from "lucide-react";
import { notFound } from "next/navigation";

import { EntityTabs, type EntityTab } from "@/components/entity/entity-tabs";
import { requireCapabilityOrRedirect } from "@/lib/permissions";

import { getSupplierAuditLog, getSupplierDetail, getSupplierDetailKpis, getSupplierTools } from "../data";
import { SupplierEditSheet } from "./_components/supplier-edit-sheet";
import { SupplierIdentity } from "./_components/supplier-identity";
import { HistoryTab } from "./_components/history-tab";
import { OverviewTab } from "./_components/overview-tab";
import { ToolsTab } from "./_components/tools-tab";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; tab?: string; q?: string }>;
}

export default async function SupplierDetailPage({ params, searchParams }: PageProps) {
	await requireCapabilityOrRedirect("suppliers.read");
	const { id } = await params;
	const sp = await searchParams;

	const [detail, kpis, tools, audit] = await Promise.all([
		getSupplierDetail(id),
		getSupplierDetailKpis(id),
		getSupplierTools(id, sp.q ?? ""),
		getSupplierAuditLog(id),
	]);

	if (!detail) notFound();

	const tabs: EntityTab[] = [
		{ value: "overview", label: "Visão geral", icon: Factory, content: <OverviewTab detail={detail} kpis={kpis} /> },
		{ value: "tools", label: "Ferramentas", icon: Wrench, content: <ToolsTab tools={tools} supplierId={id} /> },
		{ value: "history", label: "Histórico", icon: History, content: <HistoryTab rows={audit} /> },
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<SupplierIdentity detail={detail} />
			<EntityTabs defaultValue="overview" tabs={tabs} />
			{sp.edit === "1" ? <SupplierEditSheet supplier={detail} /> : null}
		</div>
	);
}
```

### `supplier-identity.tsx`

Pattern do `BranchIdentity` da Fase 2 — botão Editar abre `?edit=1`, ícone `Factory`, subtitle `detail.contactEmail`, badge "website" se houver.

### `overview-tab.tsx`

Server component. KPIs locais + card "Sobre" (renderiza `notes` via `ToolDescription` ou inline `react-markdown`+`rehype-sanitize`) + card "Contato" (email, phone, website, cnpj formatado).

```tsx
import { ExternalLink, FileText, Mail, Phone } from "lucide-react";
import { ToolDescription } from "@/components/tool-description";  // se existir; senão usar react-markdown direto
import type { SupplierDetail, SupplierDetailKpis } from "../../data";

function formatCnpj(c: string): string {
	if (c.length !== 14) return c;
	return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12,14)}`;
}

export function OverviewTab({ detail, kpis }: { detail: SupplierDetail; kpis: SupplierDetailKpis }) {
	// EntityKpisRow + Cards Sobre/Contato
}
```

### `tools-tab.tsx`

Lista de ferramentas vinculadas com busca local (Input controlado que adiciona `?q=` ou filtra in-memory). Empty state com ícone `Wrench` + CTA "Nova ferramenta" (link para `/dashboard/tools/new?supplierId=${id}`).

### `history-tab.tsx`

Usa `EntityAuditLogTable` da Fase 0 (`apps/web/src/components/entity/entity-audit-log-table.tsx`). Adapte o shape de `SupplierAuditRow` ao que o componente espera (verificar assinatura).

- [ ] **Step 1:** Implementar 5 arquivos.
- [ ] **Step 2:** `bun check-types`.
- [ ] **Step 3: Commit** `feat(suppliers): detalhe page + 3 tabs`.

---

## Task 8: Edit sheet via `?edit=1` + cleanup route `[id]/edit/`

**Files:**
- Criar: `apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-edit-sheet.tsx`
- Modificar: `apps/web/src/app/dashboard/suppliers/[id]/edit/page.tsx` → redirect 301 para `[id]?edit=1`

Estrutura do sheet idêntica a `BranchEditSheet` (Fase 2). Campos:
- name (Input)
- contactEmail (Input email)
- phone (Input)
- website (Input url)
- cnpj (Input com máscara/hint `00.000.000/0000-00`)
- notes (Textarea com hint markdown)

Submit → `updateSupplier(id, parsed.data)`. Erros via `zodIssuesToFormIssues` + painel vermelho.

### Redirect

```tsx
import { permanentRedirect } from "next/navigation";

export default async function SupplierEditRedirect({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	permanentRedirect(`/dashboard/suppliers/${id}?edit=1`);
}
```

(Se a `supplier-form.tsx` original cobria também `/new`, preserve `/new/page.tsx` apontando para o form antigo — não deletar o form, só remover do `[id]/edit/`.)

- [ ] **Step 1:** Implementar sheet + redirect.
- [ ] **Step 2:** `grep -rn "suppliers/.*/edit" apps/web/src` e ajustar refs para `?edit=1`.
- [ ] **Step 3: Commit** `feat(suppliers): edit sheet via ?edit=1`.

---

## Task 9: Polish + verification + push gated

- [ ] **Step 1:** Visitar manualmente `/dashboard/suppliers`, abrir um detalhe, navegar entre 3 tabs, testar `?edit=1`, tentar deletar fornecedor com tools (deve bloquear), salvar update e ver linha em Histórico.
- [ ] **Step 2:** `bun check-types` + `bun --cwd apps/web test` + `bunx ultracite check apps/web/src/app/dashboard/suppliers`.
- [ ] **Step 3:** `git log --oneline` revisão — todas messages PT, ≤50 chars.
- [ ] **Step 4: Push gated** — só após aprovação do user. `git push -u origin fase-3-suppliers`. Base do PR é `main` (não `fase-2-branches`) para o PR ser independente; se Fase 2 ainda não estiver merged, usar `--base main` mostrará diff combinado — ajuste base para `fase-2-branches` se preferir um stack de PRs.
- [ ] **Step 5:** Abrir PR título "feat: Fase 3 — Suppliers CRUD completo".

---

## Self-review

- [x] Spec coverage: rotas, lista, detalhe 3 tabs, edit sheet, server actions + audit, CNPJ validation.
- [x] Sem placeholders.
- [x] Tipos consistentes: `SupplierDetail`, `SupplierKpis`, `SupplierTableRow`, `SupplierAuditRow`.
