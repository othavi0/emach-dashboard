# Migração Fornecedores → padrão Filiais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o fluxo de Fornecedores (`/dashboard/suppliers`) para o Entity/CRUD pattern canônico de Filiais, corrigindo 3 bugs e trocando hard-delete por soft-delete via status.

**Architecture:** Next 16 / React 19 RSC. Server Components decidem ação de header por `?tab=`; tabs de coleção carregam lazy + scroll infinito (cursor keyset). Mutações via server actions com audit log. Reuso de componentes compartilhados (`EntityIdentityHeader`, `EntityCard`, `EntityEditSheet`, `InfiniteSentinel`, `useInfiniteList`).

**Tech Stack:** Drizzle 0.45 (push-only), Zod, server actions, Tailwind tokens (`DESIGN.md`), vitest (cursor/schema), smoke visual no browser.

**Spec:** `docs/superpowers/specs/2026-06-01-suppliers-ui-migration-design.md`

**Convenções do projeto (não violar):** sem `console.*` (usar `logger`); sem `: any`/`as any`; IDs estáveis em `key` (nunca `index`); `next/image` exceto thumb Supabase; sem `useMemo`/`useCallback` manual (React Compiler); server actions começam com `"use server"` + `await requireCapability(...)`; ações destrutivas nunca `variant="default"` (coral). Após editar schema: `bun db:sync`. `check-types` não pega import de hook client em RSC nem SQL inválido — **smoke visual obrigatório**.

**Verificação de UI:** servidor dev na porta dev atual (3001 ou 3006). Comando: `bun check-types` para tipos; browser para visual.

---

## File Structure

**Schema (packages/db):**
- Modify: `packages/db/src/schema/tools.ts` — coluna `status` em `supplier`
- Modify: `packages/db/src/schema/supplier-audit.ts` — valor `archived` no enum

**Data/actions (apps/web/.../suppliers):**
- Modify: `data.ts` — `status` nos shapes + `fetchSupplierToolsPage` (cursor)
- Modify: `actions.ts` — `archiveSupplier`/`restoreSupplier`, remove `deleteSupplier` + dead code
- Test: `_components/__tests__/supplier-tools-cursor.test.ts` (novo)

**Componentes compartilhados (apps/web/src/components):**
- Create: `tool-status-badge.tsx`

**Form (suppliers/_components):**
- Create: `supplier-form-fields.tsx`
- Modify: `supplier-form.tsx`, `[id]/_components/supplier-edit-sheet.tsx`, `new/page.tsx`

**Detalhe (suppliers/[id]):**
- Modify: `page.tsx`, `_components/supplier-identity.tsx`, `_components/overview-tab.tsx`, `_components/tools-tab.tsx`
- Create: `_components/supplier-tools-infinite.tsx`, `_components/supplier-tool-card.tsx`
- Rename/rewrite: `_components/delete-supplier-dialog.tsx` → `archive-supplier-dialog.tsx`

**Listagem (suppliers/_components):**
- Modify: `supplier-card.tsx`

---

## Task 1: Schema — status em supplier + archived no audit enum

**Files:**
- Modify: `packages/db/src/schema/tools.ts:26-48` (tabela `supplier`)
- Modify: `packages/db/src/schema/supplier-audit.ts:16-21` (enum)

- [ ] **Step 1: Adicionar coluna `status` em `supplier`**

Em `tools.ts`, dentro do objeto de colunas de `supplier` (após `cnpj`, antes de `createdAt`):

```ts
		cnpj: text("cnpj"),
		status: text("status", { enum: ["active", "archived"] })
			.default("active")
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
```

- [ ] **Step 2: Adicionar index de status** (no array de `(table) => [...]` de `supplier`):

```ts
		index("supplier_status_created_idx").on(
			table.status,
			table.createdAt.desc(),
			table.id.desc()
		),
```

- [ ] **Step 3: Adicionar `archived` ao enum de audit**

Em `supplier-audit.ts`, atualizar o enum (mantém `deleted` para retrocompat de registros antigos):

```ts
export const supplierAuditActionEnum = pgEnum("supplier_audit_action", [
	"created",
	"profile_updated",
	"deleted",
	"archived",
	"restored",
]);
```

- [ ] **Step 4: Aplicar no banco**

Run: `bun db:sync`
Expected: push aplica a coluna e o novo valor do enum sem erro. Se `drizzle-kit` pedir TTY por rename ambíguo, rodar interativo. Adicionar valor a pgEnum é aditivo (não destrutivo).

- [ ] **Step 5: Verificar tipos**

Run: `bun check-types`
Expected: PASS (o `$inferSelect` de `supplier` agora inclui `status: "active" | "archived"`).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/tools.ts packages/db/src/schema/supplier-audit.ts
git commit -m "feat(db): status active/archived em supplier"
```

> **Coordenação ecommerce:** `tools.ts` está na superfície de sync CI → o workflow abre PR no repo ecommerce. Mudança aditiva, ecommerce não lê `supplier`. Mencionar no corpo do PR de sync.

---

## Task 2: data.ts — status nos shapes + paginação de ferramentas

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/data.ts` (shapes `status` + tipo `SupplierToolRow`)
- Modify: `apps/web/src/app/dashboard/suppliers/actions.ts` (função `fetchSupplierToolsPage`)
- Test: `apps/web/src/app/dashboard/suppliers/_components/__tests__/supplier-tools-cursor.test.ts` (novo)

- [ ] **Step 1: Adicionar `status` ao `SupplierDetail` e à query**

Em `data.ts`, na interface `SupplierDetail` (após `name`):

```ts
	status: "active" | "archived";
```

No `getSupplierDetail`, incluir no retorno (o `base` já traz `status` via `select()`):

```ts
		name: base.name,
		status: base.status,
		contactEmail: base.contactEmail,
```

- [ ] **Step 2: Adicionar `status` ao `SupplierTableRow` e ao aggregate da listagem**

Na interface `SupplierTableRow` (após `name`):

```ts
	status: "active" | "archived";
```

Em `fetchSuppliersTablePage` (em `actions.ts`, ajustado na Task 3) o `status` virá do `supplier` base — ver Task 3 Step 3.

- [ ] **Step 3: Criar `fetchSupplierToolsPage` paginada (cursor keyset) — em `actions.ts`**

**Importante:** essa função é chamada do **client** (scroll infinito), então vive em `actions.ts` (módulo `"use server"`), NÃO em `data.ts`. O tipo `SupplierToolRow` continua exportado de `data.ts` e é importado por `actions.ts`. (A `getSupplierTools` com `limit(100)` em `data.ts` é removida na Task 3, junto do dead code.) Adicionar em `actions.ts`:

```ts
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import type { SupplierToolRow } from "./data";

export async function fetchSupplierToolsPage({
	supplierId,
	search,
	cursor,
}: {
	supplierId: string;
	search?: string;
	cursor: string | null;
}): Promise<InfiniteResult<SupplierToolRow>> {
	const decoded = cursor ? decodeCursor(cursor) : null;
	const conditions = [eq(tool.supplierId, supplierId)];

	if (search?.trim()) {
		const pattern = `%${search.trim()}%`;
		conditions.push(
			sql`(${tool.name} ILIKE ${pattern} OR ${tool.slug} ILIKE ${pattern})`
		);
	}
	if (decoded && decoded.sort === "newest") {
		conditions.push(
			sql`(${tool.createdAt}, ${tool.id}) < (${decoded.createdAt}::timestamp, ${decoded.id})`
		);
	}

	const rows = await db
		.select({
			id: tool.id,
			name: tool.name,
			slug: tool.slug,
			status: tool.status,
			defaultSku: sql<
				string | null
			>`(select sku from tool_variant where tool_id = ${tool.id} and is_default = true limit 1)`,
			createdAt: tool.createdAt,
		})
		.from(tool)
		.where(and(...conditions))
		.orderBy(desc(tool.createdAt), desc(tool.id))
		.limit(BATCH_SIZE + 1);

	const hasMore = rows.length > BATCH_SIZE;
	const items = (hasMore ? rows.slice(0, BATCH_SIZE) : rows) as SupplierToolRow[];
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "newest",
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;
	return { items, nextCursor };
}
```

(Garantir que `and`, `desc`, `eq`, `sql` estão importados de `drizzle-orm` — `and`/`desc`/`eq`/`sql` já estão no arquivo; adicionar o que faltar.)

- [ ] **Step 4: Escrever teste de cursor** (espelha `branch-orders-cursor.test.ts`)

Ler primeiro `apps/web/src/app/dashboard/branches/_components/__tests__/branch-orders-cursor.test.ts` para o shape exato. O teste valida que `encodeCursor`/`decodeCursor` round-trip do shape `{ v:1, sort:"newest", createdAt, id }` e que a condição keyset não repete itens na fronteira de página. Conteúdo:

```ts
import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "@/lib/cursor";

describe("supplier tools cursor", () => {
	it("round-trips newest cursor", () => {
		const createdAt = new Date("2026-05-01T12:00:00.000Z").toISOString();
		const token = encodeCursor({ v: 1, sort: "newest", createdAt, id: "tool-9" });
		const decoded = decodeCursor(token);
		expect(decoded).toMatchObject({ sort: "newest", createdAt, id: "tool-9" });
	});
});
```

- [ ] **Step 5: Rodar o teste**

Run: `cd apps/web && bunx vitest run src/app/dashboard/suppliers/_components/__tests__/supplier-tools-cursor.test.ts`
Expected: PASS.

- [ ] **Step 6: check-types + commit**

Run: `bun check-types` → PASS

```bash
git add apps/web/src/app/dashboard/suppliers/data.ts apps/web/src/app/dashboard/suppliers/actions.ts apps/web/src/app/dashboard/suppliers/_components/__tests__/supplier-tools-cursor.test.ts
git commit -m "feat(suppliers): status nos shapes + fetchSupplierToolsPage paginada"
```

---

## Task 3: actions.ts — archive/restore + limpeza de dead code

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/actions.ts`

- [ ] **Step 1: Confirmar não-uso do dead code**

Run: `rg -rn "listSuppliers|getSupplier\b|LinkedTool" apps/web/src`
Expected: referências só dentro do próprio `actions.ts`. Se houver consumidor externo, NÃO remover aquele símbolo — relatar. (Esperado: nenhum consumidor externo.)

- [ ] **Step 2: Remover `listSuppliers`, `getSupplier`, `LinkedTool` e `SupplierDetail` duplicado**

Apagar de `actions.ts`: a interface `SupplierListItem`, `LinkedTool`, a interface `SupplierDetail` (linhas ~38-49 — a viva é a de `data.ts`), a função `listSuppliers` e a função `getSupplier`. Manter `ActionResult`, `SuppliersSort`, `SuppliersFiltersInput`, `normalizePayload`, `errorMessage`, `fetchSuppliersPage`, `fetchSuppliersTablePage`, `createSupplier`, `updateSupplier`.

- [ ] **Step 3: Incluir `status` no `fetchSuppliersTablePage`**

Em `fetchSuppliersTablePage`, no `map`, adicionar `status` (vem do `supplier` base em `fetchSuppliersPage`, que já faz `.select()` completo):

```ts
		return {
			id: s.id,
			name: s.name,
			status: s.status,
			contactEmail: s.contactEmail,
			phone: s.phone,
			createdAt: s.createdAt,
			toolsTotal: agg.toolsTotal,
			toolsActive: agg.toolsActive,
		};
```

- [ ] **Step 4: Substituir `deleteSupplier` por `archiveSupplier` + `restoreSupplier`**

Remover a função `deleteSupplier` inteira. Adicionar:

```ts
async function setSupplierStatus(
	id: string,
	next: "active" | "archived",
	action: "archived" | "restored"
): Promise<ActionResult> {
	const session = await requireCapability("suppliers.manage");

	const [before] = await db
		.select({ name: supplier.name, status: supplier.status })
		.from(supplier)
		.where(eq(supplier.id, id))
		.limit(1);

	if (!before) {
		return { ok: false, error: "Fornecedor não encontrado" };
	}

	try {
		await db.update(supplier).set({ status: next }).where(eq(supplier.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}

	await db.insert(supplierAuditLog).values({
		id: crypto.randomUUID(),
		supplierId: id,
		actorType: "user",
		actorUserId: session.user.id,
		action,
		beforeJson: { status: before.status },
		afterJson: { status: next },
	});

	await logUserActivity({
		actorUserId: session.user.id,
		action: action === "archived" ? "supplier.archived" : "supplier.restored",
		targetId: id,
		targetType: "supplier",
		metadata: { name: before.name },
	});
	revalidatePath(SUPPLIERS_PATH);
	revalidatePath(`${SUPPLIERS_PATH}/${id}`);
	return { ok: true, data: undefined };
}

export async function archiveSupplier(id: string): Promise<ActionResult> {
	return setSupplierStatus(id, "archived", "archived");
}

export async function restoreSupplier(id: string): Promise<ActionResult> {
	return setSupplierStatus(id, "active", "restored");
}
```

Garantir import de `supplierAuditLog` (já existe) e que `"use server"` está no topo (já existe).

- [ ] **Step 5: check-types**

Run: `bun check-types`
Expected: PASS. Se acusar `deleteSupplier` não encontrado, é o `DeleteSupplierDialog` (tratado na Task 7) — temporariamente o componente órfão pode quebrar; como é órfão (não importado em página), não afeta runtime. Resolver na Task 7.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/suppliers/actions.ts
git commit -m "feat(suppliers): archiveSupplier/restoreSupplier + remove dead code"
```

---

## Task 4: SupplierFormFields compartilhado (paridade create/edit)

**Files:**
- Create: `apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx`
- Modify: `apps/web/src/app/dashboard/suppliers/_components/supplier-form.tsx`
- Modify: `apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-edit-sheet.tsx`
- Modify: `apps/web/src/app/dashboard/suppliers/new/page.tsx`

- [ ] **Step 1: Criar `SupplierFormFields`** (padrão `values` + `onPatch`, espelha `BranchFormFields`)

```tsx
"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Textarea } from "@emach/ui/components/textarea";

import type { SupplierFormValues } from "./supplier-schema";

type Patch = (next: Partial<SupplierFormValues>) => void;

interface Props {
	disabled?: boolean;
	onPatch: Patch;
	values: SupplierFormValues;
}

export function SupplierFormFields({ values, onPatch, disabled }: Props) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="supplier-name">
					Nome<span className="text-destructive"> *</span>
				</Label>
				<Input
					disabled={disabled}
					id="supplier-name"
					onChange={(e) => onPatch({ name: e.target.value })}
					placeholder="Ex: Bosch Brasil"
					value={values.name ?? ""}
				/>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-email">E-mail (opcional)</Label>
					<Input
						disabled={disabled}
						id="supplier-email"
						onChange={(e) => onPatch({ contactEmail: e.target.value })}
						placeholder="contato@fornecedor.com"
						type="email"
						value={values.contactEmail ?? ""}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-phone">Telefone (opcional)</Label>
					<Input
						disabled={disabled}
						id="supplier-phone"
						onChange={(e) => onPatch({ phone: e.target.value })}
						placeholder="(11) 99999-9999"
						value={values.phone ?? ""}
					/>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-website">Website (opcional)</Label>
					<Input
						disabled={disabled}
						id="supplier-website"
						onChange={(e) => onPatch({ website: e.target.value })}
						placeholder="https://..."
						type="url"
						value={values.website ?? ""}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-cnpj">CNPJ (opcional)</Label>
					<Input
						disabled={disabled}
						id="supplier-cnpj"
						onChange={(e) => onPatch({ cnpj: e.target.value })}
						placeholder="00.000.000/0000-00"
						value={values.cnpj ?? ""}
					/>
					<p className="text-muted-foreground text-xs">
						Só dígitos são salvos.
					</p>
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="supplier-notes">Observações (opcional)</Label>
				<Textarea
					disabled={disabled}
					id="supplier-notes"
					onChange={(e) => onPatch({ notes: e.target.value })}
					placeholder="Condições comerciais, contato responsável ou instruções internas."
					rows={5}
					value={values.notes ?? ""}
				/>
				<p className="text-muted-foreground text-xs">Markdown suportado</p>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Refatorar `supplier-form.tsx` para usar o componente**

Substituir os campos manuais (Nome/Email/Telefone/Observações) por estado único `values` + `<SupplierFormFields>`. O componente passa a coletar `website`/`cnpj` também. Estrutura:

```tsx
const [values, setValues] = useState<SupplierFormValues>({
	name: defaultValues.name ?? "",
	contactEmail: defaultValues.contactEmail ?? "",
	phone: defaultValues.phone ?? "",
	website: defaultValues.website ?? "",
	cnpj: defaultValues.cnpj ?? "",
	notes: defaultValues.notes ?? "",
});
```

No `handleSubmit`, `supplierSchema.safeParse(values)`. Manter `FormErrorPanel`, toast com contagem, e a seção `INFORMAÇÕES BÁSICAS` envolvendo `<SupplierFormFields values={values} onPatch={(p) => setValues((v) => ({ ...v, ...p }))} disabled={isPending} />`. `FIELD_LABELS` adiciona `website: "Website"`, `cnpj: "CNPJ"`.

- [ ] **Step 3: Refatorar `supplier-edit-sheet.tsx` para usar o componente**

Trocar os 6 `useState` individuais + campos manuais por um único `values` + `<SupplierFormFields>` (igual ao form). O `FIELD_LABELS` do sheet já tem todos os rótulos; adicionar `website`/`cnpj` se faltarem. `handleSubmit` faz `supplierSchema.safeParse(values)`.

- [ ] **Step 4: `new/page.tsx` → PageHeader**

```tsx
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/session";
import { SupplierForm } from "../_components/supplier-form";

export default async function NewSupplierPage() {
	await requireRole("admin");
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description="Cadastre um fornecedor para vinculá-lo às ferramentas do catálogo."
				title="Novo fornecedor"
			/>
			<SupplierForm defaultValues={{}} mode="create" />
		</div>
	);
}
```

- [ ] **Step 5: check-types + smoke visual**

Run: `bun check-types` → PASS
Browser: `/dashboard/suppliers/new` — confirmar **Website** e **CNPJ** presentes. Criar fornecedor com CNPJ válido → aparece no detalhe. Abrir edit drawer → mesmos campos.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx apps/web/src/app/dashboard/suppliers/_components/supplier-form.tsx apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-edit-sheet.tsx apps/web/src/app/dashboard/suppliers/new/page.tsx
git commit -m "fix(suppliers): paridade create/edit (website+cnpj) via SupplierFormFields"
```

---

## Task 5: ToolStatusBadge compartilhado

**Files:**
- Create: `apps/web/src/components/tool-status-badge.tsx`

- [ ] **Step 1: Criar o componente** (extrai o mapeamento canônico de `tools/[id]/_components/tool-detail-header.tsx:7-20`)

```tsx
import { Badge } from "@emach/ui/components/badge";

type ToolStatus = "active" | "draft" | "discontinued";

const LABEL: Record<ToolStatus, string> = {
	active: "Ativa",
	draft: "Rascunho",
	discontinued: "Descontinuada",
};

const VARIANT: Record<ToolStatus, "success" | "secondary" | "outline"> = {
	active: "success",
	draft: "secondary",
	discontinued: "outline",
};

export function ToolStatusBadge({ status }: { status: ToolStatus }) {
	return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
```

- [ ] **Step 2: check-types + commit**

Run: `bun check-types` → PASS

```bash
git add apps/web/src/components/tool-status-badge.tsx
git commit -m "feat(ui): ToolStatusBadge compartilhado (status com role correta)"
```

---

## Task 6: Tab Ferramentas — card-grid + scroll infinito

**Files:**
- Create: `apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-tool-card.tsx`
- Create: `apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-tools-infinite.tsx`
- Modify: `apps/web/src/app/dashboard/suppliers/[id]/_components/tools-tab.tsx`

- [ ] **Step 1: Criar `SupplierToolCard`** (arquétipo entity-card, espelha `OrderCard`)

```tsx
import { Wrench } from "lucide-react";
import Link from "next/link";

import { ToolStatusBadge } from "@/components/tool-status-badge";
import type { SupplierToolRow } from "../../data";

const DATE = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

export function SupplierToolCard({ tool }: { tool: SupplierToolRow }) {
	return (
		<Link
			className="group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`/dashboard/tools/${tool.id}`}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-[52px] flex-shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted text-muted-foreground">
					<Wrench aria-hidden className="size-5" />
				</div>
				<div className="min-w-0 flex-1">
					<span className="block truncate font-semibold text-[14px] text-foreground leading-tight">
						{tool.name}
					</span>
					<p className="truncate text-muted-foreground text-xs">
						{tool.defaultSku ?? tool.slug}
					</p>
				</div>
				<ToolStatusBadge status={tool.status} />
			</div>

			<div className="flex flex-col items-center border-border border-t py-2.5">
				<span className="font-bold text-[14px] text-foreground tabular-nums">
					{DATE.format(tool.createdAt)}
				</span>
				<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
					Criada em
				</span>
			</div>
		</Link>
	);
}
```

- [ ] **Step 2: Criar `SupplierToolsInfinite`** (client, espelha `BranchOrdersInfinite`)

```tsx
"use client";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchSupplierToolsPage } from "../../actions";
import type { SupplierToolRow } from "../../data";
import { SupplierToolCard } from "./supplier-tool-card";

interface Props {
	initial: SupplierToolRow[];
	initialCursor: string | null;
	search?: string;
	supplierId: string;
}

export function SupplierToolsInfinite({
	supplierId,
	search,
	initial,
	initialCursor,
}: Props) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) =>
			fetchSupplierToolsPage({ supplierId, search, cursor }),
	});

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((t) => (
					<SupplierToolCard key={t.id} tool={t} />
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

> **Nota:** `fetchSupplierToolsPage` já vive em `actions.ts` (`"use server"`) desde a Task 2 Step 3 — o client importa dela ali; o tipo `SupplierToolRow` vem de `data.ts`.

- [ ] **Step 3: Reescrever `tools-tab.tsx`** (server async lazy, espelha `OrdersTab`)

```tsx
import { Wrench } from "lucide-react";

import { fetchSupplierToolsPage } from "../../actions";
import { SupplierToolsInfinite } from "./supplier-tools-infinite";

interface Props {
	search?: string;
	supplierId: string;
}

export async function ToolsTab({ supplierId, search }: Props) {
	const first = await fetchSupplierToolsPage({ supplierId, search, cursor: null });

	if (first.items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Wrench aria-hidden className="size-12 text-muted-foreground opacity-40" />
				<p className="font-medium text-sm">Sem ferramentas vinculadas</p>
				<p className="text-muted-foreground text-xs">
					{search
						? "Nenhuma ferramenta corresponde à busca."
						: "Adicione a primeira ferramenta deste fornecedor."}
				</p>
			</div>
		);
	}

	return (
		<SupplierToolsInfinite
			initial={first.items}
			initialCursor={first.nextCursor}
			search={search}
			supplierId={supplierId}
		/>
	);
}
```

> A busca local (Input client) e o botão "Nova ferramenta" saem da tab. A busca vira `?q=` server-side (a tab recebe `search` de `page.tsx`, Task 7). "Nova ferramenta" vai pro header contextual (Task 7).

- [ ] **Step 4: check-types**

Run: `bun check-types`
Expected: PASS. (`fetchSupplierToolsPage` já está em `actions.ts` desde a Task 2.)

- [ ] **Step 5: Commit** (a verificação visual completa vem na Task 7, quando page.tsx liga tudo)

```bash
git add apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-tool-card.tsx apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-tools-infinite.tsx apps/web/src/app/dashboard/suppliers/[id]/_components/tools-tab.tsx
git commit -m "feat(suppliers): tab Ferramentas card-grid + scroll infinito"
```

---

## Task 7: ArchiveSupplierDialog + detalhe (header contextual + lazy + badge)

**Files:**
- Rename/rewrite: `_components/delete-supplier-dialog.tsx` → `_components/archive-supplier-dialog.tsx`
- Modify: `[id]/_components/supplier-identity.tsx`
- Modify: `[id]/page.tsx`

- [ ] **Step 1: Criar `ArchiveSupplierDialog`** (de `DeleteSupplierDialog`, copy de arquivar/restaurar)

Renomear o arquivo e reescrever: recebe `supplierId`, `supplierName`, `status: "active" | "archived"`. Quando `active` → ação "Arquivar" (chama `archiveSupplier`, botão `outline`, ícone `Archive`); quando `archived` → "Restaurar" (chama `restoreSupplier`, botão `success` ou `secondary`, ícone `ArchiveRestore`). `AlertDialog` controlado (`useState` open, `e.preventDefault()` no action + fechar no sucesso). Copy ativa: "Arquivar fornecedor <strong>{name}</strong>? Ele deixa de aparecer como ativo; as ferramentas vinculadas continuam intactas. Você pode restaurar depois." Copy restaurar: "Restaurar fornecedor <strong>{name}</strong>?". `import { archiveSupplier, restoreSupplier } from "../../actions";`. `toast.success("Fornecedor arquivado" / "Fornecedor restaurado")`. `router.refresh()` no sucesso.

- [ ] **Step 2: `SupplierIdentity` vira "burro"** (recebe `actions`, sem client)

```tsx
import { Badge } from "@emach/ui/components/badge";
import { ExternalLink, Factory } from "lucide-react";
import type { ReactNode } from "react";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import type { SupplierDetail } from "../../data";

export function SupplierIdentity({
	detail,
	actions,
}: {
	detail: SupplierDetail;
	actions?: ReactNode;
}) {
	const badges = detail.website ? (
		<a href={detail.website} rel="noopener noreferrer" target="_blank">
			<Badge className="flex items-center gap-1" variant="outline">
				<ExternalLink aria-hidden className="size-3" />
				Website
			</Badge>
		</a>
	) : undefined;

	return (
		<EntityIdentityHeader
			actions={actions}
			avatarFallback={<Factory aria-hidden className="size-5" />}
			badges={badges}
			subtitle={detail.contactEmail ?? detail.phone ?? undefined}
			title={detail.name}
		/>
	);
}
```

(Remove `"use client"`, `useRouter`/`usePathname`/`useSearchParams` e o botão Editar fixo.)

- [ ] **Step 3: `page.tsx` — header contextual + lazy + badge secondary**

Reescrever o `SupplierDetailPage`:
- `searchParams` ganha `q?: string` (busca da tab tools).
- `Promise.all` carrega só `getSupplierDetail` + `getSupplierDetailKpis` (audit/tools saem do load incondicional).
- Tabs: `tools` content só quando `sp.tab === "tools"` (passa `search={sp.q}`); `history` content só quando `sp.tab === "history"` (carrega `getSupplierAuditLog` ali). Badge da tab tools usa o mesmo span `secondary rounded-md` do `branches/[id]/page.tsx:61-65`.
- `headerAction` por tab:

```tsx
import { Pencil } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@emach/ui/components/button";
import { ArchiveSupplierDialog } from "./_components/archive-supplier-dialog";

// dentro do componente, após obter detail/sp:
const tab = sp.tab ?? "overview";
const headerAction =
	tab === "tools" ? (
		<Link
			className={buttonVariants({ size: "sm" })}
			href={`/dashboard/tools/new?supplierId=${id}`}
		>
			Nova ferramenta
		</Link>
	) : tab === "overview" ? (
		<div className="flex items-center gap-2">
			<Link
				className={buttonVariants({ size: "sm", variant: "outline" })}
				href={`/dashboard/suppliers/${id}?edit=1`}
			>
				<Pencil aria-hidden className="mr-1.5 size-3.5" />
				Editar
			</Link>
			<ArchiveSupplierDialog
				status={detail.status}
				supplierId={id}
				supplierName={detail.name}
			/>
		</div>
	) : null;
```

E `<SupplierIdentity actions={headerAction} detail={detail} />`. A tab `history` carrega o audit:

```tsx
content: tab === "history" ? <HistoryTab rows={await getSupplierAuditLog(id)} /> : null,
```

(Como o conteúdo é async, calcular `audit` antes do array `tabs` num bloco condicional, OU manter `HistoryTab` recebendo a promise resolvida — preferir calcular `const audit = tab === "history" ? await getSupplierAuditLog(id) : [];` antes do array, espelhando o lazy de branches.)

- [ ] **Step 4: check-types + smoke visual completo**

Run: `bun check-types` → PASS
Browser `/dashboard/suppliers/<id>`:
- Tab **Visão geral**: header mostra **Editar + Arquivar**.
- Tab **Ferramentas**: header muda para **Nova ferramenta**; grid de cards; status "Ativa" em **verde (jade)**, não coral; scroll infinito.
- Tab **Histórico**: sem ação no header; tabela de audit.
- Badge "2" da tab Ferramentas em `secondary` (cinza), não coral.
- Clicar **Arquivar** → toast + (Task 10 mostra esmaecido na listagem). Voltar e **Restaurar**.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/suppliers/[id]/_components/archive-supplier-dialog.tsx apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-identity.tsx apps/web/src/app/dashboard/suppliers/[id]/page.tsx
git rm apps/web/src/app/dashboard/suppliers/_components/delete-supplier-dialog.tsx
git commit -m "feat(suppliers): header contextual + lazy tabs + arquivar/restaurar"
```

---

## Task 8: Overview-tab — grid 2-col + status badge + footer edge-to-edge

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/[id]/_components/overview-tab.tsx`

- [ ] **Step 1: Re-layout** (mantém `EntityKpisRow`; "Sobre" full-width; "Contato" com status badge + footer edge-to-edge)

Manter o `<EntityKpisRow>` atual. Manter o card "Sobre" (notes markdown) full-width. Trocar o card "Contato" para incluir status badge no header e footer edge-to-edge de datas, espelhando `branches/[id]/_components/overview-tab.tsx:75-83,205-222`. O `CardHeader` vira `flex flex-row items-center justify-between` com:

```tsx
<CardTitle className="text-sm">Contato</CardTitle>
<Badge variant={detail.status === "active" ? "success" : "secondary"}>
	{detail.status === "active" ? "Ativo" : "Arquivado"}
</Badge>
```

E adicionar, no fim do `CardContent` de Contato, o footer de datas edge-to-edge:

```tsx
<div className="-mx-4 -mb-4 grid grid-cols-2 border-border border-t">
	<div className="flex flex-col items-center border-border border-r py-2.5">
		<span className="font-bold text-[14px] text-foreground tabular-nums">
			{DATE_FORMAT.format(detail.createdAt)}
		</span>
		<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
			Criado em
		</span>
	</div>
	<div className="flex flex-col items-center py-2.5">
		<span className="font-bold text-[14px] text-foreground tabular-nums">
			{DATE_FORMAT.format(detail.updatedAt)}
		</span>
		<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
			Atualizado em
		</span>
	</div>
</div>
```

> Requer `detail.status`, `detail.createdAt`, `detail.updatedAt` no `SupplierDetail` (status adicionado na Task 2; datas já existem). `Badge` importado.

- [ ] **Step 2: check-types + smoke visual**

Run: `bun check-types` → PASS
Browser: overview mostra status badge no card Contato e footer Criado/Atualizado edge-to-edge.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/suppliers/[id]/_components/overview-tab.tsx
git commit -m "feat(suppliers): overview com status badge + footer edge-to-edge"
```

---

## Task 9: Card de listagem — remover Eye/Pencil + estado arquivado

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/_components/supplier-card.tsx`

- [ ] **Step 1: Reescrever o card** (sem ações inline; estado arquivado esmaecido)

Remover o bloco de ações (`Eye` + `Pencil`, linhas ~55-82). Card continua `role="button"`/`Link` → detalhe. Adicionar atalho ghost opcional "ver ferramentas" (espelha o atalho de estoque de filial em `branch-card.tsx:58-70`):

```tsx
<Link
	aria-label={`Ver ferramentas de ${supplier.name}`}
	className={`${buttonVariants({ size: "icon-sm", variant: "ghost" })} shrink-0 border border-border bg-muted`}
	href={`/dashboard/suppliers/${supplier.id}?tab=tools`}
	onClick={(e) => e.stopPropagation()}
>
	<Wrench aria-hidden className="size-4" />
</Link>
```

Estado arquivado: no wrapper, `${supplier.status === "archived" ? "opacity-70" : ""}`; e abaixo do nome, quando arquivado:

```tsx
{supplier.status === "archived" && (
	<span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
		Arquivado
	</span>
)}
```

> Requer `status` em `SupplierTableRow` (Task 2/3). Trocar imports de ícones (`Eye`, `Pencil` → `Wrench`).

- [ ] **Step 2: check-types + smoke visual**

Run: `bun check-types` → PASS
Browser `/dashboard/suppliers`: cards sem Eye/Pencil; o fornecedor arquivado na Task 7 aparece esmaecido + badge "Arquivado". Atalho "ver ferramentas" leva a `?tab=tools`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/suppliers/_components/supplier-card.tsx
git commit -m "feat(suppliers): card sem ações inline + estado arquivado"
```

---

## Task 10: Verificação final integrada

**Files:** nenhuma modificação — checklist.

- [ ] **Step 1: Tipos e testes**

Run: `bun check-types` → PASS
Run: `cd apps/web && bunx vitest run src/app/dashboard/suppliers` → PASS

- [ ] **Step 2: Smoke visual end-to-end** (porta dev atual)

Percorrer e confirmar contra o spec:
1. **Listagem** — cards sem Eye/Pencil; arquivado esmaecido + badge; atalho "ver ferramentas".
2. **Criar** — Website + CNPJ presentes; criar com CNPJ válido persiste.
3. **Detalhe / Visão geral** — header Editar+Arquivar; overview 2-col com status badge + footer datas; KPIs.
4. **Detalhe / Ferramentas** — header Nova ferramenta; card-grid; status "Ativa" jade; badge tab secondary; scroll infinito.
5. **Detalhe / Histórico** — tabela audit; entradas "Arquivado"/"Restaurado" aparecem após a ação.
6. **Editar (drawer)** — mesmos campos do criar.
7. **Arquivar → Restaurar** — ciclo completo reflete na listagem e no audit.

- [ ] **Step 3: Limpeza de log** — `rg -rn "console\\.(log|warn|error)" apps/web/src/app/dashboard/suppliers` → vazio.

- [ ] **Step 4: Commit final (se houver ajuste do smoke)**

```bash
git add -A apps/web/src/app/dashboard/suppliers
git commit -m "chore(suppliers): ajustes finais pós-smoke"
```

---

## Self-Review (preenchido)

**Cobertura do spec:**
- Frente 1 (schema) → Task 1 ✓
- Frente 2 (bugs: paridade form / lazy tabs / dead code) → Task 4 (paridade), Task 7 Step 3 (lazy), Task 3 (dead code) ✓
- Frente 3 (soft-delete) → Task 1 (enum), Task 3 (actions), Task 7 (dialog + religar) ✓
- Frente 4 (header contextual + overview) → Task 7 (header/lazy/badge), Task 8 (overview) ✓
- Frente 5 (tab card-grid + scroll infinito) → Task 5 (badge), Task 6 ✓
- Frente 6 (card + new page) → Task 4 Step 4 (new page), Task 9 (card) ✓

**Consistência de tipos:** `SupplierToolRow` (data.ts) usado em Task 2/6; `fetchSupplierToolsPage` movida para `actions.ts` (módulo `"use server"`) — Task 6 Step 2/4 nota a mudança; `SupplierDetail.status` definido na Task 2, consumido em Tasks 7/8/9; `archiveSupplier`/`restoreSupplier` definidos na Task 3, consumidos na Task 7.

**Ponto de atenção de ordem:** `check-types` na Task 3 Step 5 pode acusar o `DeleteSupplierDialog` órfão referenciando `deleteSupplier` removido — resolvido na Task 7 (rename). Como é órfão (não importado em página), não quebra runtime entre as tasks.
