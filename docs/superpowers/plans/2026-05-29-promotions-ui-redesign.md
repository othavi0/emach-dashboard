# Redesenho da UI de Promotions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a UI de `/dashboard/promotions` espelhando o CRUD de filiais (scroll infinito, edição em sheet inline, filtros padronizados), reaproveitando 100% das server actions e dos componentes compartilhados, e corrigindo o bug de gating que escondia o CRUD do super_admin.

**Architecture:** Migra `listPromotions` para paginação keyset cursor-based (`fetchPromotionsPage`), reescreve grid/filtros sobre os helpers compartilhados (`useInfiniteList`/`InfiniteSentinel`/`FiltersBar`/`useFilterState`), extrai os campos do form num componente controlado (`PromotionFormFields`) reutilizado por página `/new` e por um novo `PromotionEditSheet` (`EntityEditSheet`), e remove a página `/[id]/edit`.

**Tech Stack:** Next 16 (App Router, RSC), React 19, Drizzle 0.45, Zod, Tailwind, shadcn-style UI (`@emach/ui`).

**Verificação:** Este projeto não tem harness de teste para server actions com DB. Conforme `CLAUDE.md`, `tsc` não detecta SQL inválido em template strings; a verificação é `bun check-types` (de `apps/web`) + smoke runtime via `bun dev:web`. Cada task termina com check-types + commit; o smoke completo é a Task 11.

**Arquivos de referência (modelos a espelhar):**
- `apps/web/src/app/dashboard/branches/actions.ts` (`fetchBranchesPage` — keyset)
- `apps/web/src/app/dashboard/branches/_components/branch-card-grid.tsx` (grid + `useInfiniteList`)
- `apps/web/src/app/dashboard/branches/_components/branches-filters.tsx` (`FiltersBar`)
- `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx` (campos controlados)
- `apps/web/src/app/dashboard/branches/[id]/_components/branch-edit-sheet.tsx` (`EntityEditSheet`)

---

## Mapa de arquivos

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Modify | `apps/web/src/lib/cursor.ts` | + variantes de cursor de promotions |
| Modify | `apps/web/src/app/dashboard/promotions/actions.ts` | `listPromotions` → `fetchPromotionsPage` (keyset); `duplicate` abre `?edit` |
| Modify | `apps/web/src/app/dashboard/promotions/page.tsx` | fix gating; consome `fetchPromotionsPage`; busca `?edit` |
| Create | `apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx` | campos controlados (values+onPatch) |
| Modify | `apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx` | compõe `PromotionFormFields` (página `/new`) |
| Create | `apps/web/src/app/dashboard/promotions/_components/promotion-edit-sheet.tsx` | `EntityEditSheet` + form fields (`?edit=id`) |
| Modify | `apps/web/src/app/dashboard/promotions/_components/promotions-filters.tsx` | reescrito sobre `FiltersBar` |
| Modify | `apps/web/src/app/dashboard/promotions/_components/promotions-grid.tsx` | `useInfiniteList` + hospeda os 2 sheets |
| Modify | `apps/web/src/app/dashboard/promotions/_components/promotion-card.tsx` | chrome estilo filial; ✏️ → `?edit=id` |
| Modify | `apps/web/src/app/dashboard/promotions/_components/promotion-sheet.tsx` | links "Editar" → `?edit=id` |
| Modify | `apps/web/src/app/dashboard/promotions/_components/promotion-quick-actions.tsx` | links `/edit` → `?edit=id` |
| Delete | `apps/web/src/app/dashboard/promotions/[id]/edit/page.tsx` | edição vira sheet |

---

## Task 1: Fix de gating (causa-raiz)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/page.tsx`

Isolado de propósito: este commit, sozinho, restaura o CRUD para o super_admin.

- [ ] **Step 1: Importar `can` e trocar o check hardcoded**

Em `page.tsx`, adicionar ao bloco de imports:
```ts
import { can } from "@/lib/permissions";
```
Substituir (linhas ~66-68):
```ts
	const session = await requireCurrentSession();
	const role = session.user.role ?? "user";
	const canMutate = role === "admin" || role === "manager";
```
por:
```ts
	const session = await requireCurrentSession();
	const canMutate = can(session.user.role, "promotions.manage");
```

- [ ] **Step 2: check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS (sem erros).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/page.tsx
git commit -m "fix(promotions): usa can() no gating em vez de array hardcoded"
```

---

## Task 2: Variantes de cursor de promotions

**Files:**
- Modify: `apps/web/src/lib/cursor.ts`

`createdDesc` reusa `NewestCursor` (já existe). As demais precisam de variantes novas. `endsAtAsc` exige um cursor com `endsAt` **nullable** (NULLS LAST) — por isso NÃO reusa `ExpiringPromoCursor` (que tem `endsAt: string` e é usado pelo dashboard).

- [ ] **Step 1: Adicionar as interfaces e somar ao union**

Após `ExpiringPromoCursor` (linha ~61), adicionar:
```ts
export interface PromoCreatedAscCursor extends CursorBase {
	createdAt: string;
	sort: "promoCreatedAsc";
}

export interface PromoDiscountCursor extends CursorBase {
	discountPct: string;
	sort: "promoDiscountDesc" | "promoDiscountAsc";
}

export interface PromoEndsAtAscCursor extends CursorBase {
	endsAt: string | null;
	sort: "promoEndsAtAsc";
}
```
No `export type Cursor = ... ;` somar os três:
```ts
	| PromoCreatedAscCursor
	| PromoDiscountCursor
	| PromoEndsAtAscCursor;
```

- [ ] **Step 2: check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/cursor.ts
git commit -m "feat(cursor): variantes de cursor para sorts de promotions"
```

---

## Task 3: Backend — `fetchPromotionsPage` (keyset)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/actions.ts`

Adicionar a nova função paginada **sem** remover `listPromotions` ainda (mantém compilável; remoção na Task 9). A query é a mesma de `listPromotions` (mesmos filtros, mesmo `with`, mesmo `computeStatus`), com keyset no `where`/`orderBy` e `limit BATCH_SIZE + 1`.

- [ ] **Step 1: Imports**

No topo de `actions.ts`, adicionar:
```ts
import { decodeCursor, type Cursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
```

- [ ] **Step 2: Helper de keyset (predicado por sort)**

Adicionar acima da seção `listPromotions` (após `computeStatus`):
```ts
// Predicado keyset por sort. Retorna undefined se o cursor não corresponde ao
// sort atual (defensivo — o front reseta o cursor ao trocar de sort).
function promotionKeyset(
	p: typeof promotion._.columns,
	qSql: (typeof import("drizzle-orm"))["sql"],
	sort: PromotionSort,
	c: Cursor
) {
	switch (sort) {
		case "createdDesc":
			return c.sort === "newest"
				? qSql`(${p.createdAt}, ${p.id}) < (${c.createdAt}::timestamp, ${c.id})`
				: undefined;
		case "createdAsc":
			return c.sort === "promoCreatedAsc"
				? qSql`(${p.createdAt}, ${p.id}) > (${c.createdAt}::timestamp, ${c.id})`
				: undefined;
		case "discountDesc":
			return c.sort === "promoDiscountDesc"
				? qSql`(${p.discountPct}, ${p.id}) < (${c.discountPct}::numeric, ${c.id})`
				: undefined;
		case "discountAsc":
			return c.sort === "promoDiscountAsc"
				? qSql`(${p.discountPct}, ${p.id}) > (${c.discountPct}::numeric, ${c.id})`
				: undefined;
		case "endsAtAsc": {
			if (c.sort !== "promoEndsAtAsc") {
				return;
			}
			if (c.endsAt === null) {
				return qSql`(${p.endsAt} IS NULL AND ${p.id} > ${c.id})`;
			}
			return qSql`(${p.endsAt} > ${c.endsAt}::timestamp OR (${p.endsAt} = ${c.endsAt}::timestamp AND ${p.id} > ${c.id}) OR ${p.endsAt} IS NULL)`;
		}
		default:
			return;
	}
}
```
> Nota: a assinatura de `p`/`qSql` acima é ilustrativa do que o callback do `findMany` fornece. Na prática, escrever o predicado **inline** dentro do callback `where` (que recebe `(p, ops)`), usando `ops.sql`, evita ginástica de tipos. Ver Step 3 — o predicado vai inline.

- [ ] **Step 3: `fetchPromotionsPage`**

Adicionar após `listPromotions` (mantendo `listPromotions` por ora):
```ts
function makePromotionCursor(
	sort: PromotionSort,
	last: { createdAt: Date; discountPct: string; endsAt: Date | null; id: string }
): Cursor {
	switch (sort) {
		case "createdAsc":
			return {
				v: 1,
				sort: "promoCreatedAsc",
				createdAt: last.createdAt.toISOString(),
				id: last.id,
			};
		case "discountDesc":
			return {
				v: 1,
				sort: "promoDiscountDesc",
				discountPct: last.discountPct,
				id: last.id,
			};
		case "discountAsc":
			return {
				v: 1,
				sort: "promoDiscountAsc",
				discountPct: last.discountPct,
				id: last.id,
			};
		case "endsAtAsc":
			return {
				v: 1,
				sort: "promoEndsAtAsc",
				endsAt: last.endsAt ? last.endsAt.toISOString() : null,
				id: last.id,
			};
		default:
			return {
				v: 1,
				sort: "newest",
				createdAt: last.createdAt.toISOString(),
				id: last.id,
			};
	}
}

export async function fetchPromotionsPage({
	filters,
	cursor,
}: {
	filters: ListPromotionsOptions;
	cursor: string | null;
}): Promise<InfiniteResult<PromotionListItem>> {
	await requireCurrentSession();

	const {
		type = "all",
		search,
		status = "all",
		toolId,
		discountMin,
		discountMax,
		sort = "createdDesc",
	} = filters;

	const decoded = cursor ? decodeCursor(cursor) : null;

	const rows = await db.query.promotion.findMany({
		where: (p, ops) => {
			const conds: unknown[] = [];

			if (type !== "all") {
				conds.push(ops.eq(p.type, type));
			}
			if (search && search.trim() !== "") {
				const term = `%${search.trim()}%`;
				conds.push(ops.or(ops.ilike(p.title, term), ops.ilike(p.code as never, term)));
			}
			if (typeof discountMin === "number") {
				conds.push(ops.gte(p.discountPct, String(discountMin)));
			}
			if (typeof discountMax === "number") {
				conds.push(ops.lte(p.discountPct, String(discountMax)));
			}
			if (toolId && UUID_RE.test(toolId)) {
				conds.push(
					ops.inArray(
						p.id,
						db
							.select({ pid: promotionTool.promotionId })
							.from(promotionTool)
							.where(eq(promotionTool.toolId, toolId))
					)
				);
			}
			if (status !== "all") {
				switch (status) {
					case "expired":
						conds.push(ops.sql`${p.endsAt} < now()`);
						break;
					case "scheduled":
						conds.push(
							ops.sql`${p.active} = true AND ${p.startsAt} > now() AND (${p.endsAt} IS NULL OR ${p.endsAt} >= now())`
						);
						break;
					case "active":
						conds.push(
							ops.sql`${p.active} = true AND (${p.startsAt} IS NULL OR ${p.startsAt} <= now()) AND (${p.endsAt} IS NULL OR ${p.endsAt} >= now())`
						);
						break;
					case "inactive":
						conds.push(
							ops.sql`${p.active} = false AND (${p.endsAt} IS NULL OR ${p.endsAt} >= now())`
						);
						break;
					default:
						break;
				}
			}

			// keyset
			if (decoded) {
				const ks = promotionKeysetInline(p, ops.sql, sort, decoded);
				if (ks) {
					conds.push(ks);
				}
			}

			return conds.length > 0
				? ops.and(...(conds as Parameters<typeof ops.and>))
				: undefined;
		},
		orderBy: (p, { asc: qAsc, desc: qDesc, sql: qSql }) => {
			switch (sort) {
				case "createdAsc":
					return [qAsc(p.createdAt), qAsc(p.id)];
				case "discountDesc":
					return [qDesc(p.discountPct), qDesc(p.id)];
				case "discountAsc":
					return [qAsc(p.discountPct), qAsc(p.id)];
				case "endsAtAsc":
					return [qSql`${p.endsAt} ASC NULLS LAST`, qAsc(p.id)];
				default:
					return [qDesc(p.createdAt), qDesc(p.id)];
			}
		},
		limit: BATCH_SIZE + 1,
		with: {
			createdByUser: { columns: { name: true } },
			updatedByUser: { columns: { name: true } },
			promotionTools: {
				with: {
					tool: {
						columns: { id: true, name: true, slug: true },
						with: {
							variants: true,
							images: {
								columns: { url: true, sortOrder: true },
								orderBy: (img, { asc: qAsc }) => qAsc(img.sortOrder),
								limit: 1,
							},
						},
					},
				},
			},
		},
	});

	return paginate(
		rows,
		(row) => mapPromotionRow(row),
		(last) => makePromotionCursor(sort, last)
	);
}
```

- [ ] **Step 4: Extrair o map de row e o keyset inline**

`listPromotions` e `getPromotion` repetem o mapeamento row→`PromotionListItem`. Extrair num helper `mapPromotionRow(row)` (tipar `row` como o retorno do `findMany` — usar `Awaited<ReturnType<...>>[number]` ou um type local) e reusar nos três pontos. Definir `promotionKeysetInline(p, sql, sort, decoded)` com o corpo do `switch` do Step 2 (inline, recebendo `ops.sql`). Manter o `computeStatus` dentro do map.

> O executor deve consolidar o map já existente em `listPromotions` (linhas ~319-352) e `getPromotion` (~395-426) em `mapPromotionRow`, evitando duplicação (DRY).

- [ ] **Step 5: `duplicatePromotion` não muda aqui** (o redirect é no front; a action só retorna `{ id }`). Nenhuma mudança nesta task.

- [ ] **Step 6: check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS. Se falhar em tipos de `ops`/`p`, ajustar o predicado inline (não tipar manualmente — deixar o callback inferir).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/actions.ts
git commit -m "feat(promotions): fetchPromotionsPage com paginação keyset"
```

---

## Task 4: `PromotionFormFields` (componente controlado)

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx`

Extrair o JSX dos campos hoje embutido em `promotion-form.tsx` (linhas ~348-519: Tipo, Título, Descrição, Desconto, Ativa, Datas, Código, Ferramentas, incl. o `ToolCombobox`) para um componente controlado, espelhando `BranchFormFields`.

- [ ] **Step 1: Criar o arquivo**

Estrutura (props controladas, sem estado de submit):
```tsx
"use client";

// imports: Badge, Command*, DatePicker, Input, Label, Popover*, RadioGroup*,
// Switch, Textarea, ChevronsUpDown, X (mesmos de promotion-form.tsx)
import type { PromotionFormValues } from "./promotion-schema";

type Patch = (next: Partial<PromotionFormValues>) => void;

interface ToolOption { id: string; name: string }

interface Props {
	availableTools: ToolOption[];
	disabled?: boolean;
	errors: Record<string, string>;
	mode: "create" | "edit";
	onPatch: Patch;
	values: PromotionFormValues;
}

// Mover ToolCombobox (de promotion-form.tsx) para cá como componente interno.

export function PromotionFormFields({ availableTools, disabled, errors, mode, onPatch, values }: Props) {
	// Render dos campos. Cada onChange chama onPatch({ campo: novoValor }).
	// type: RadioGroup só quando mode === "create"; senão <p> com rótulo.
	// code: só renderiza quando values.type === "promocode".
	// Ferramentas: <ToolCombobox selectedIds={values.toolIds} onChange={(ids) => onPatch({ toolIds: ids })} />
}
```
Adaptações-chave em relação ao form atual:
- Trocar todos os `useState` de campo por leitura de `values.<campo>` e escrita via `onPatch`.
- `discountPct`: `value={values.discountPct}` / `onChange={(n) => onPatch({ discountPct: n ?? 0 })}` no `MaskedInput`.
- Datas: `value={values.startsAt ?? undefined}` / `onChange={(d) => onPatch({ startsAt: d ?? null })}`.
- Manter `FIELD_LABELS`? Não — fica no caller (form/sheet). Aqui só os campos + `errors[campo]`.

- [ ] **Step 2: check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS (o componente ainda não é usado — só precisa compilar).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx
git commit -m "feat(promotions): extrai PromotionFormFields controlado"
```

---

## Task 5: `PromotionForm` compõe `PromotionFormFields` (página /new)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx`

Refatorar o form da página `/new` para usar `PromotionFormFields`, mantendo seu próprio estado em um único objeto `values: PromotionFormValues` (em vez de um `useState` por campo) e os botões/erros próprios.

- [ ] **Step 1: Trocar os `useState` por campo por um único `values`**

Substituir os 9 `useState` de campo por:
```tsx
const [values, setValues] = useState<PromotionFormValues>(() => ({
	type: (defaultValues?.type as PromotionType) ?? "promotion",
	title: defaultValues?.title ?? "",
	description: defaultValues?.description ?? null,
	discountPct: defaultValues?.discountPct ?? 0,
	active: defaultValues?.active ?? true,
	startsAt: defaultValues?.startsAt ?? null,
	endsAt: defaultValues?.endsAt ?? null,
	code: (defaultValues?.code as string | null) ?? null,
	toolIds: defaultValues?.toolIds ?? [],
} as PromotionFormValues));
const onPatch = (p: Partial<PromotionFormValues>) =>
	setValues((prev) => ({ ...prev, ...p }) as PromotionFormValues);
```

- [ ] **Step 2: Substituir o JSX dos campos por `<PromotionFormFields>`**

Remover o `<section>` com os campos (linhas ~348-519) e o `ToolCombobox` interno (movido na Task 4). No lugar:
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
`buildInput()` deixa de existir — usar `values` direto no `safeParse`. Manter `FormErrorPanel`, `serverError`, os botões e o fluxo de `startTransition` → `createPromotion`/`updatePromotion`.

- [ ] **Step 3: check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx
git commit -m "refactor(promotions): PromotionForm usa PromotionFormFields"
```

---

## Task 6: `PromotionEditSheet`

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/_components/promotion-edit-sheet.tsx`

Espelha `BranchEditSheet`: `EntityEditSheet` + `PromotionFormFields`, controlado por `?edit=id`.

- [ ] **Step 1: Criar o arquivo**

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { type FormIssue, zodIssuesToFormIssues } from "@/components/form-error-panel";
import { updatePromotion, type PromotionDetail } from "../actions";
import { PromotionFormFields } from "./promotion-form-fields";
import { type PromotionFormValues, promotionSchema } from "./promotion-schema";

const FIELD_LABELS: Record<string, string> = {
	title: "Título", description: "Descrição", type: "Tipo", code: "Código",
	discountPct: "Desconto", startsAt: "Início", endsAt: "Fim", toolIds: "Ferramentas",
};

function toFormValues(p: PromotionDetail): PromotionFormValues {
	return {
		type: p.type as "promotion" | "promocode",
		title: p.title,
		description: p.description,
		discountPct: Number(p.discountPct),
		active: p.active,
		startsAt: p.startsAt,
		endsAt: p.endsAt,
		code: p.code,
		toolIds: p.toolIds,
	} as PromotionFormValues;
}

interface Props {
	availableTools: { id: string; name: string }[];
	promotion: PromotionDetail | null;
}

export function PromotionEditSheet({ availableTools, promotion }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = Boolean(params.get("edit")) && promotion !== null;

	const [values, setValues] = useState<PromotionFormValues | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open && promotion) {
			setValues(toFormValues(promotion));
			setErrors({});
			setIssues([]);
		}
	}, [open, promotion]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!(values && promotion)) {
			return;
		}
		const parsed = promotionSchema.safeParse(values);
		if (!parsed.success) {
			setIssues(zodIssuesToFormIssues(parsed.error, FIELD_LABELS));
			return;
		}
		startTransition(async () => {
			const res = await updatePromotion(promotion.id, parsed.data);
			if (res.ok) {
				toast.success("Promoção atualizada");
				close();
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize os dados da promoção"
			issues={issues}
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={promotion ? `Editar ${promotion.title}` : "Editar promoção"}
		>
			{values ? (
				<PromotionFormFields
					availableTools={availableTools}
					disabled={submitting}
					errors={errors}
					mode="edit"
					onPatch={(p) => setValues((prev) => (prev ? { ...prev, ...p } as PromotionFormValues : prev))}
					values={values}
				/>
			) : null}
		</EntityEditSheet>
	);
}
```

- [ ] **Step 2: check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-edit-sheet.tsx
git commit -m "feat(promotions): PromotionEditSheet inline via ?edit"
```

---

## Task 7: Filtros sobre `FiltersBar`

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotions-filters.tsx`

Reescrever sobre `FiltersBar` + `useFilterState`/`useDebouncedParam` (modelo: `branches-filters.tsx`). Manter todos os filtros; toolId e desconto ficam em "Filtros avançados" (toggle).

- [ ] **Step 1: Reescrever o componente**

- `const BASE = "/dashboard/promotions";`
- `const TRACKED = ["search", "type", "status", "sort", "toolId", "discountMin", "discountMax"] as const;`
- `useFilterState({ basePath: BASE, trackedKeys: TRACKED })` → `setParam`, `clearAll`, `hasActive`, `searchParams`.
- `useDebouncedParam({ basePath: BASE, key: "search" })` → `[search, setSearch]`.
- Linha principal dentro de `<FiltersBar hasActive={hasActive} onClear={clearAll}>`: busca, tipo (`setParam("type", v === "all" ? null : v)`), status, ordenar (mesmas listas `TYPE_OPTIONS`/`STATUS_OPTIONS`/`SORT_OPTIONS`).
- Bloco avançado (mantém o toggle `advancedOpen`): combobox de ferramenta → `setParam("toolId", id)`; desconto min/max → `setParam("discountMin"/"discountMax", String(n))` ao aplicar.
- Remover o `useEffect` de debounce manual e os `pushParam`/`applyDiscountRange` custom — usar `setParam`. Props do componente: pode manter `availableTools` e os `initial*` (a página continua passando), mas o estado de search agora vem de `useDebouncedParam` (descartar `initialSearch` do controle, ler de `searchParams`).

> Ao trocar qualquer filtro, NÃO é mais preciso `params.delete("view")` manual — mas como `view`/`edit` não estão em `TRACKED`, `setParam` os preserva. Para fechar o sheet ao filtrar, incluir `"view"` e `"edit"` na limpeza: adicioná-los a `TRACKED` OU, mais simples, manter o comportamento atual de fechar via reset do grid (o grid reseta por `resetKey`, mas o sheet é controlado por searchParam). **Decisão:** adicionar `"view"` e `"edit"` a `TRACKED` para que `clearAll` também os remova; e em `setParam` eles ficam (aceitável — o usuário raramente filtra com sheet aberto). Se quiser fechar ao filtrar, o caller do grid trata.

- [ ] **Step 2: check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotions-filters.tsx
git commit -m "refactor(promotions): filtros sobre FiltersBar + useFilterState"
```

---

## Task 8: Grid com scroll infinito

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotions-grid.tsx`

Modelo: `branch-card-grid.tsx`.

- [ ] **Step 1: Reescrever o grid**

```tsx
"use client";

import { Tag } from "lucide-react";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { fetchPromotionsPage, type ListPromotionsOptions, type PromotionDetail, type PromotionListItem } from "../actions";
import { PromotionCard } from "./promotion-card";
import { PromotionEditSheet } from "./promotion-edit-sheet";
import { PromotionSheet } from "./promotion-sheet";

interface Props {
	availableTools: { id: string; name: string }[];
	canMutate: boolean;
	editPromotion: PromotionDetail | null;
	filters: ListPromotionsOptions;
	initial: PromotionListItem[];
	initialCursor: string | null;
	selectedPromotion: PromotionDetail | null;
}

export function PromotionsGrid({ availableTools, canMutate, editPromotion, filters, initial, initialCursor, selectedPromotion }: Props) {
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
				<p className="text-muted-foreground text-xs">Ajuste os filtros ou cadastre a primeira promoção.</p>
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{items.map((p) => (
					<PromotionCard canMutate={canMutate} key={p.id} promotion={p} />
				))}
			</div>
			<InfiniteSentinel error={error} hasMore={hasMore} onLoadMore={loadMore} pending={pending} />
			<PromotionSheet canMutate={canMutate} promotion={selectedPromotion} />
			<PromotionEditSheet availableTools={availableTools} promotion={editPromotion} />
		</div>
	);
}
```
> O empty state "sem filtros" da `page.tsx` (componente `<Empty>`) pode permanecer para o caso de zero promoções totais; o empty do grid cobre "zero após filtro". Não duplicar — ver Task 9 (a página decide qual mostrar; manter o `<Empty>` só quando `!hasFilters && total 0` exige uma contagem que não temos no modo paginado → **simplificar: deixar o empty do grid cobrir ambos os casos** e remover o ramo `<Empty>` da página).

- [ ] **Step 2: check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS (vai falhar enquanto a página ainda passar as props antigas — corrigido na Task 9; se executando task isolada, aceitar erro de props na page e resolver na 9, OU fazer 8+9 juntas).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotions-grid.tsx
git commit -m "feat(promotions): grid com scroll infinito"
```

---

## Task 9: Página consome paginação + remove edit page + remove `listPromotions`

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/page.tsx`
- Modify: `apps/web/src/app/dashboard/promotions/actions.ts`
- Delete: `apps/web/src/app/dashboard/promotions/[id]/edit/page.tsx`

- [ ] **Step 1: Atualizar `page.tsx`**

- Trocar `listPromotions(...)` por `fetchPromotionsPage({ filters: {...}, cursor: null })`; usar `.items`/`.nextCursor`.
- Buscar em paralelo: página inicial, `availableTools`, `selectedPromotion` (`?view`), `editPromotion` (`?edit`) — ambos via `getPromotion`.
- Remover o ramo `<Empty>` (o grid cobre vazio). Manter `PageHeader` + `PromotionsFilters`.
- Passar ao `PromotionsGrid`: `availableTools`, `canMutate`, `editPromotion`, `filters`, `initial`, `initialCursor`, `selectedPromotion`.
```ts
	const filters = { type: typeFilter, search: search || undefined, status: statusFilter, sort, toolId, discountMin, discountMax };
	const [page, availableTools, selectedPromotion, editPromotion] = await Promise.all([
		fetchPromotionsPage({ filters, cursor: null }),
		db.select({ id: tool.id, name: tool.name }).from(tool).orderBy(asc(tool.name)),
		params.view ? getPromotion(params.view) : Promise.resolve(null),
		params.edit ? getPromotion(params.edit) : Promise.resolve(null),
	]);
```
Adicionar `edit?: string` ao tipo de `searchParams`.

- [ ] **Step 2: Remover `listPromotions` de `actions.ts`**

Apagar a função `listPromotions` (agora sem uso) e o que ficou exclusivo dela. Manter `ListPromotionsOptions`, `PromotionSort`, `mapPromotionRow`, `computeStatus`, `getPromotion`, `fetchPromotionsPage`.

- [ ] **Step 3: Deletar a página de edição**

```bash
git rm apps/web/src/app/dashboard/promotions/[id]/edit/page.tsx
```
(O diretório `[id]/edit` fica vazio — remover também se o git deixar resíduo.)

- [ ] **Step 4: check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/
git commit -m "feat(promotions): página consome paginação; edição vira sheet"
```

---

## Task 10: Card + links de edição → `?edit=id`

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-card.tsx`
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-sheet.tsx`
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-quick-actions.tsx`

- [ ] **Step 1: `promotion-card.tsx` — chrome estilo filial + ação editar**

- Alinhar o container ao `BranchCard`: classes de hover/focus/shadow equivalentes; `opacity-70` quando `status === "inactive"`.
- Adicionar, quando `canMutate`, um cluster de ações ghost no topo-direito (padrão `BranchCard`, com `e.stopPropagation()`): botão ✏️ que faz `router.push` setando `?edit=${promotion.id}` (preservando os demais params, igual o `openSheet` faz com `view`).
- Manter o conteúdo (badges, título, desconto, código, janela, chips, `PromotionQuickActions`).

- [ ] **Step 2: `promotion-sheet.tsx` — "Editar"/"Gerenciar" → `?edit`**

- Substituir os `<Link href={.../${promotion.id}/edit}>` (linhas ~210 e ~314) por um botão/handler que troca `?view=id` por `?edit=id` (remove `view`, seta `edit`) via `router.replace`.
- `handleDuplicate` (linha ~95): trocar `router.push(.../${result.data.id}/edit)` por setar `?edit=${result.data.id}` (e remover `view`).

- [ ] **Step 3: `promotion-quick-actions.tsx` — links `/edit` → `?edit`**

- `editHref` (linha ~66) e o `router.push(.../edit)` do duplicate (linha ~62): trocar para setar `?edit=id` preservando params.

- [ ] **Step 4: check-types**

Run: `cd apps/web && bun check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-card.tsx apps/web/src/app/dashboard/promotions/_components/promotion-sheet.tsx apps/web/src/app/dashboard/promotions/_components/promotion-quick-actions.tsx
git commit -m "feat(promotions): card estilo filial + edição via ?edit"
```

---

## Task 11: Smoke runtime + `/impeccable`

**Files:** nenhum arquivo novo; validação + polimento.

- [ ] **Step 1: Subir o dev e validar fluxos**

Run: `bun dev:web` (raiz). Logado como super_admin, em `/dashboard/promotions`:
- Botão "Nova promoção" aparece; criar promoção automática e cupom (página `/new`).
- Card → `?view` abre sheet de detalhes; "Editar" abre `?edit` (sheet) sem trocar de página; salvar atualiza a lista.
- Duplicar → abre `?edit` da cópia.
- Pausar/ativar e excluir.
- **Scroll infinito**: validar cada sort, com atenção a `endsAtAsc` (promoções sem data de fim devem vir por último e paginar sem repetir/pular) e `discountDesc/Asc` (empates de desconto não duplicam itens entre páginas). Para testar com volume, criar >24 promoções via duplicar ou ajustar `BATCH_SIZE` temporariamente.
- Filtros + "Limpar filtros".

Stack trace rápido se quebrar: `nextjs_call <port> get_errors` (MCP next-devtools).

- [ ] **Step 2: `/impeccable`**

Rodar `/impeccable` sobre `promotion-card.tsx`, `promotion-sheet.tsx`, `promotion-edit-sheet.tsx`, `promotions-filters.tsx` para fechar o acabamento visual contra o das filiais (espaçamento, hover, tipografia, dark mode, neutros warm conforme `DESIGN.md`).

- [ ] **Step 3: `/code-review`**

Rodar `/code-review` no diff acumulado (foco no keyset SQL da Task 3 — correção de paginação é o maior risco).

- [ ] **Step 4: Commit do polimento**

```bash
git add -A && git commit -m "style(promotions): polimento visual via impeccable"
```

---

## Self-review (cobertura da spec)

- Fix de gating → Task 1. ✓
- `fetchPromotionsPage` + filtros + keyset (5 sorts, nullable `endsAt`, tie-break `id`) → Tasks 2-3. ✓
- Cursor types aditivos → Task 2. ✓
- `PromotionFormFields` extraído → Task 4; reuso em `/new` → Task 5; reuso em sheet → Task 6. ✓
- Filtros sobre `FiltersBar` → Task 7. ✓
- Grid scroll infinito + hospeda sheets → Task 8. ✓
- Página consome paginação; `?edit`; remove `listPromotions` e `[id]/edit` → Task 9. ✓
- Card chrome + links `?edit` → Task 10. ✓
- Smoke + impeccable + code-review → Task 11. ✓

**Riscos sinalizados:** keyset com `endsAt` nullable (NULLS LAST) e `discountPct` não-único são o ponto frágil — validados explicitamente no smoke (Task 11) e no code-review.
