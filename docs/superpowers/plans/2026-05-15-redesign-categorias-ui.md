# Redesign da UI de categorias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a UI de categorias (lista achatada + "tudo é formulário") por lista em árvore com drag-and-drop, página de detalhe rica estilo `orders`, e formulários em cards — removendo os campos legados `imageUrl` e `sortOrder` do form.

**Architecture:** Lista vira árvore expansível com reorder de irmãos via `@dnd-kit`. Nova rota `[id]` é Server Component de leitura (grid `1.45fr/0.95fr`). `[id]/edit` e `new` reaproveitam `category-form.tsx` redesenhado em cards. A coluna `category.image_url` é dropada via migration versionada. Ordenação passa a ser persistida por uma server action de reorder.

**Tech Stack:** Next 16 / React 19 (RSC), Drizzle 0.45, `@dnd-kit/core` + `@dnd-kit/sortable`, shadcn/ui, Tailwind 4, Vitest.

**Spec de referência:** `docs/superpowers/specs/2026-05-15-redesign-categorias-ui-design.md`
**Mockups aprovados:** `.superpowers/brainstorm/145183-1778861631/content/{lista,detalhe,form,final}.html`

**Convenções herdadas (não reinventar):**
- Server action devolve `ActionResult<T>` (`actions.ts:15`).
- `requireCapability("categories.manage")` em mutations; `requireCapabilityOrRedirect` em pages.
- IDs: `crypto.randomUUID()`.
- Form: painel de erros Zod no topo (`FormErrorPanel`), toast com contagem, slug auto-gerado em create via `slugifyLabel()`.
- Sem `console.*` (usar `logger`), sem `: any`, sem `key={index}`, `<Image>` do Next.
- Trigger `prevent_category_cycle` recalcula `path`/`depth` só em mudança de `parent_id`/`slug` — **reorder por `sort_order` não dispara trigger** (seguro).

---

## File Structure

**Criar:**
- `apps/web/src/app/dashboard/categories/[id]/page.tsx` — página de detalhe (RSC).
- `apps/web/src/app/dashboard/categories/_components/categories-tree.tsx` — árvore client (dnd + expand/collapse).
- `apps/web/src/app/dashboard/categories/_components/category-detail-actions.tsx` — client: botões Desativar/Excluir do detalhe.
- `apps/web/src/app/dashboard/categories/_lib/category-tree.ts` — helpers puros: `buildCategoryTree`, `breadcrumbFromPath`.
- `apps/web/src/app/dashboard/categories/_lib/category-tree.test.ts` — unit tests dos helpers.

**Modificar:**
- `packages/db/src/schema/categories.ts` — remover `imageUrl`.
- `packages/db/src/queries/catalog.ts:686-722` — remover `image_url AS "imageUrl"` dos SELECTs.
- `apps/web/src/app/dashboard/categories/schema.ts` — remover `imageUrl`, remover `sortOrder` (não é mais editado no form).
- `apps/web/src/app/dashboard/categories/actions.ts` — remover `imageUrl`/`sortOrder` de create/update; adicionar `getCategoryDetail`, `getCategoryProducts`, `reorderCategories`, `toggleCategoryActive`.
- `apps/web/src/app/dashboard/categories/page.tsx` — usar `CategoriesTree`.
- `apps/web/src/app/dashboard/categories/new/page.tsx` — layout em cards.
- `apps/web/src/app/dashboard/categories/[id]/edit/page.tsx` — layout em cards.
- `apps/web/src/app/dashboard/categories/_components/category-form.tsx` — redesenho em cards + sidebar; remover campos imagem/ordem.
- `apps/web/src/app/dashboard/categories/_components/delete-category-dialog.tsx` — aceitar prop `variant` (`"icon" | "button"`) para reuso no detalhe.
- `apps/web/CLAUDE.md`, `.claude/CLAUDE.md`, `docs/integration/admin-ecommerce.md` — documentação.
- `apps/web/package.json` — deps `@dnd-kit/*`.

**Deletar:**
- `apps/web/src/app/dashboard/categories/_components/categories-table.tsx` — substituído por `categories-tree.tsx`.

---

## FASE 1 — Schema: drop `image_url`

### Task 1: Remover a coluna `image_url`

**Files:**
- Modify: `packages/db/src/schema/categories.ts:29`
- Modify: `packages/db/src/queries/catalog.ts:692,713`

- [ ] **Step 1: Remover o campo do schema Drizzle**

Em `packages/db/src/schema/categories.ts`, deletar a linha 29 inteira:

```ts
	imageUrl: text("image_url"),
```

(O bloco fica: `description: text("description"),` seguido direto de `path: text("path").notNull(),`.)

- [ ] **Step 2: Remover `image_url` das queries de catálogo**

Em `packages/db/src/queries/catalog.ts`, nos dois SELECTs de `getCategoryBySlug` (linhas ~692 e ~713), trocar:

```sql
SELECT id, slug, name, parent_id AS "parentId", sort_order AS "sortOrder",
       is_active AS "isActive", description, image_url AS "imageUrl",
       path, depth, created_at AS "createdAt", updated_at AS "updatedAt"
```

por (sem `image_url AS "imageUrl"`):

```sql
SELECT id, slug, name, parent_id AS "parentId", sort_order AS "sortOrder",
       is_active AS "isActive", description,
       path, depth, created_at AS "createdAt", updated_at AS "updatedAt"
```

- [ ] **Step 3: Gerar a migration versionada**

Run: `bun db:generate`
Expected: cria um novo arquivo SQL em `packages/db/src/migrations/` contendo `ALTER TABLE "category" DROP COLUMN "image_url";`. Revisar o SQL gerado — deve conter **apenas** esse drop.

- [ ] **Step 4: Aplicar em dev e reaplicar triggers**

Run: `bun db:push && bun --cwd packages/db db:apply-triggers`
Expected: push sem erros; triggers reaplicados (idempotente).

- [ ] **Step 5: Garantir que não sobrou referência a `imageUrl` de categoria**

Run: `grep -rn "imageUrl" apps/web/src/app/dashboard/categories packages/db/src/queries/catalog.ts`
Expected: zero ocorrências (as referências em `schema.ts`, `actions.ts`, `category-form.tsx` e `[id]/edit/page.tsx` serão removidas nas Tasks 2, 8 e 9; se aparecerem aqui é esperado — confirmar que nenhuma está fora desses arquivos).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/categories.ts packages/db/src/queries/catalog.ts packages/db/src/migrations
git commit -m "feat(db): remove coluna image_url de category"
```

---

## FASE 2 — Helpers puros e tipos

### Task 2: Atualizar Zod schema e tipos de input

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/schema.ts`

- [ ] **Step 1: Reescrever o schema sem `imageUrl` e sem `sortOrder`**

Substituir o conteúdo inteiro de `apps/web/src/app/dashboard/categories/schema.ts` por:

```ts
import { z } from "zod";

export const categorySchema = z.object({
	name: z.string().min(1, "Nome obrigatório").max(120, "Nome muito longo"),
	slug: z
		.string()
		.min(1, "Slug obrigatório")
		.max(120, "Slug muito longo")
		.regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífens"),
	parentId: z.string().nullable().optional(),
	description: z
		.string()
		.max(2000, "Descrição muito longa")
		.nullable()
		.optional(),
	isActive: z.boolean().default(true),
});

export type CategoryInput = z.infer<typeof categorySchema>;
```

Nota: `sortOrder` deixa de ser entrada do form — é persistido só pela action de reorder. Categorias novas nascem com o default `0` da coluna.

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types`
Expected: FAIL — `actions.ts`, `category-form.tsx` e `[id]/edit/page.tsx` ainda referenciam `imageUrl`/`sortOrder`. Esses erros são corrigidos nas Tasks 3, 8 e 9.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/categories/schema.ts
git commit -m "refactor(categories): remove imageUrl e sortOrder do schema do form"
```

### Task 3: Helpers puros da árvore + testes

**Files:**
- Create: `apps/web/src/app/dashboard/categories/_lib/category-tree.ts`
- Test: `apps/web/src/app/dashboard/categories/_lib/category-tree.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/web/src/app/dashboard/categories/_lib/category-tree.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	breadcrumbFromPath,
	buildCategoryTree,
	type FlatCategory,
} from "./category-tree";

const flat: FlatCategory[] = [
	{ id: "a", name: "A", slug: "a", parentId: null, depth: 0, sortOrder: 1, isActive: true, productCount: 5 },
	{ id: "b", name: "B", slug: "b", parentId: null, depth: 0, sortOrder: 0, isActive: true, productCount: 0 },
	{ id: "a1", name: "A1", slug: "a1", parentId: "a", depth: 1, sortOrder: 1, isActive: true, productCount: 2 },
	{ id: "a0", name: "A0", slug: "a0", parentId: "a", depth: 1, sortOrder: 0, isActive: false, productCount: 0 },
];

describe("buildCategoryTree", () => {
	it("ordena raízes e filhos por sortOrder", () => {
		const tree = buildCategoryTree(flat);
		expect(tree.map((n) => n.id)).toEqual(["b", "a"]);
		const a = tree.find((n) => n.id === "a");
		expect(a?.children.map((n) => n.id)).toEqual(["a0", "a1"]);
	});

	it("anexa órfãos (pai ausente) como raiz", () => {
		const orphan: FlatCategory[] = [
			{ id: "x", name: "X", slug: "x", parentId: "missing", depth: 1, sortOrder: 0, isActive: true, productCount: 0 },
		];
		expect(buildCategoryTree(orphan).map((n) => n.id)).toEqual(["x"]);
	});
});

describe("breadcrumbFromPath", () => {
	it("monta os segmentos a partir do path e do mapa de nomes", () => {
		const names = new Map([["a", "Ferramentas"], ["a1", "Furadeiras"]]);
		expect(breadcrumbFromPath("/a/a1", names)).toEqual(["Ferramentas", "Furadeiras"]);
	});

	it("ignora segmentos sem nome conhecido", () => {
		expect(breadcrumbFromPath("/a/a1", new Map([["a", "Ferramentas"]]))).toEqual(["Ferramentas"]);
	});
});
```

Nota: `path` materializado guarda **slugs** (ver trigger: `NEW.path := parent_path || '/' || NEW.slug`). `breadcrumbFromPath` recebe um mapa `slug → name`.

- [ ] **Step 2: Rodar para confirmar falha**

Run: `bun --cwd apps/web vitest run src/app/dashboard/categories/_lib/category-tree.test.ts`
Expected: FAIL — módulo `./category-tree` não existe.

- [ ] **Step 3: Implementar os helpers**

Criar `apps/web/src/app/dashboard/categories/_lib/category-tree.ts`:

```ts
export interface FlatCategory {
	depth: number;
	id: string;
	isActive: boolean;
	name: string;
	parentId: string | null;
	productCount: number;
	slug: string;
	sortOrder: number;
}

export interface CategoryTreeNode extends FlatCategory {
	children: CategoryTreeNode[];
}

/** Monta a árvore a partir da lista achatada, ordenando irmãos por sortOrder e nome. */
export function buildCategoryTree(flat: FlatCategory[]): CategoryTreeNode[] {
	const byId = new Map<string, CategoryTreeNode>();
	for (const c of flat) {
		byId.set(c.id, { ...c, children: [] });
	}

	const roots: CategoryTreeNode[] = [];
	for (const node of byId.values()) {
		const parent = node.parentId ? byId.get(node.parentId) : undefined;
		if (parent) {
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}

	const sortSiblings = (nodes: CategoryTreeNode[]) => {
		nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
		for (const n of nodes) {
			sortSiblings(n.children);
		}
	};
	sortSiblings(roots);

	return roots;
}

/** Converte um path materializado (segmentos de slug) numa lista de nomes para breadcrumb. */
export function breadcrumbFromPath(
	path: string,
	nameBySlug: Map<string, string>
): string[] {
	return path
		.split("/")
		.filter((seg) => seg !== "")
		.map((seg) => nameBySlug.get(seg))
		.filter((name): name is string => name !== undefined);
}
```

- [ ] **Step 4: Rodar para confirmar verde**

Run: `bun --cwd apps/web vitest run src/app/dashboard/categories/_lib/category-tree.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_lib/category-tree.ts apps/web/src/app/dashboard/categories/_lib/category-tree.test.ts
git commit -m "feat(categories): helpers puros de árvore + testes"
```

---

## FASE 3 — Server actions

### Task 4: Reescrever `actions.ts` (create/update sem campos legados + novas actions)

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/actions.ts`

- [ ] **Step 1: Substituir o conteúdo de `actions.ts`**

Reescrever `apps/web/src/app/dashboard/categories/actions.ts` por:

```ts
"use server";

import { db } from "@emach/db";
import { attributeDefinition } from "@emach/db/schema/attributes";
import { category, toolCategory } from "@emach/db/schema/categories";
import { tool, toolVariant } from "@emach/db/schema/tools";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import logger from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { type CategoryInput, categorySchema } from "./schema";

const CATEGORIES_PATH = "/dashboard/categories";

export type CategoryListItem = typeof category.$inferSelect;

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function zodErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro de validação";
}

function mapWriteError(e: unknown): string {
	if (e instanceof Error && e.message.includes("category cycle")) {
		return "Operação criaria um ciclo na árvore";
	}
	if (
		e instanceof Error &&
		e.message.includes("unique") &&
		e.message.includes("slug")
	) {
		return "Slug já está em uso";
	}
	return zodErrorMessage(e);
}

function revalidateCategoryTrees() {
	revalidatePath(CATEGORIES_PATH);
	revalidatePath("/dashboard/tools", "layout");
	revalidatePath("/dashboard/stock");
}

export async function listCategories(): Promise<CategoryListItem[]> {
	return await db.select().from(category).orderBy(asc(category.path));
}

export async function getCategory(
	id: string
): Promise<CategoryListItem | null> {
	const rows = await db
		.select()
		.from(category)
		.where(eq(category.id, id))
		.limit(1);
	return rows[0] ?? null;
}

/** Lista achatada com contagem de produtos (categoria primária) — alimenta a árvore. */
export interface CategoryTreeItem {
	depth: number;
	id: string;
	isActive: boolean;
	name: string;
	parentId: string | null;
	productCount: number;
	slug: string;
	sortOrder: number;
}

export async function listCategoriesForTree(): Promise<CategoryTreeItem[]> {
	const cats = await db
		.select({
			id: category.id,
			name: category.name,
			slug: category.slug,
			parentId: category.parentId,
			depth: category.depth,
			sortOrder: category.sortOrder,
			isActive: category.isActive,
		})
		.from(category)
		.orderBy(asc(category.path));

	const counts = await db
		.select({
			categoryId: toolCategory.categoryId,
			productCount: count(),
		})
		.from(toolCategory)
		.where(eq(toolCategory.isPrimary, true))
		.groupBy(toolCategory.categoryId);

	const countById = new Map(
		counts.map((c) => [c.categoryId, Number(c.productCount)])
	);

	return cats.map((c) => ({
		...c,
		productCount: countById.get(c.id) ?? 0,
	}));
}

export interface CategoryDetailData {
	category: CategoryListItem;
	children: { id: string; name: string; productCount: number }[];
	parent: { id: string; name: string } | null;
	ownAttributeCount: number;
	productCount: number;
}

export async function getCategoryDetail(
	id: string
): Promise<CategoryDetailData | null> {
	const current = await getCategory(id);
	if (!current) {
		return null;
	}

	const [parentRow] = current.parentId
		? await db
				.select({ id: category.id, name: category.name })
				.from(category)
				.where(eq(category.id, current.parentId))
				.limit(1)
		: [];

	const childRows = await db
		.select({ id: category.id, name: category.name })
		.from(category)
		.where(eq(category.parentId, id))
		.orderBy(asc(category.sortOrder), asc(category.name));

	const childCounts = await db
		.select({ categoryId: toolCategory.categoryId, c: count() })
		.from(toolCategory)
		.where(
			and(
				eq(toolCategory.isPrimary, true),
				inArray(
					toolCategory.categoryId,
					childRows.length > 0 ? childRows.map((r) => r.id) : [""]
				)
			)
		)
		.groupBy(toolCategory.categoryId);
	const childCountById = new Map(childCounts.map((r) => [r.categoryId, Number(r.c)]));

	const [{ value: productCount }] = await db
		.select({ value: count() })
		.from(toolCategory)
		.where(and(eq(toolCategory.categoryId, id), eq(toolCategory.isPrimary, true)));

	const [{ value: ownAttributeCount }] = await db
		.select({ value: count() })
		.from(attributeDefinition)
		.where(eq(attributeDefinition.categoryId, id));

	return {
		category: current,
		parent: parentRow ?? null,
		children: childRows.map((r) => ({
			id: r.id,
			name: r.name,
			productCount: childCountById.get(r.id) ?? 0,
		})),
		ownAttributeCount: Number(ownAttributeCount),
		productCount: Number(productCount),
	};
}

export interface CategoryProduct {
	id: string;
	name: string;
	sku: string | null;
}

export async function getCategoryProducts(
	id: string,
	limit = 8
): Promise<CategoryProduct[]> {
	const rows = await db
		.select({
			id: tool.id,
			name: tool.name,
			sku: toolVariant.sku,
		})
		.from(toolCategory)
		.innerJoin(tool, eq(tool.id, toolCategory.toolId))
		.leftJoin(
			toolVariant,
			and(eq(toolVariant.toolId, tool.id), eq(toolVariant.isDefault, true))
		)
		.where(and(eq(toolCategory.categoryId, id), eq(toolCategory.isPrimary, true)))
		.orderBy(asc(tool.name))
		.limit(limit);
	return rows;
}

export async function createCategory(
	input: CategoryInput
): Promise<ActionResult<{ id: string }>> {
	await requireCapability("categories.manage");

	const parsed = categorySchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: zodErrorMessage(parsed.error) };
	}

	const id = crypto.randomUUID();

	try {
		await db.insert(category).values({
			id,
			slug: parsed.data.slug,
			name: parsed.data.name,
			parentId: parsed.data.parentId ?? null,
			description: parsed.data.description ?? null,
			isActive: parsed.data.isActive,
			path: `/${parsed.data.slug}`,
			depth: 0,
		});
	} catch (e) {
		return { ok: false, error: mapWriteError(e) };
	}

	revalidateCategoryTrees();
	return { ok: true, data: { id } };
}

export async function updateCategory(
	id: string,
	input: CategoryInput
): Promise<ActionResult> {
	await requireCapability("categories.manage");

	const parsed = categorySchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: zodErrorMessage(parsed.error) };
	}

	try {
		await db
			.update(category)
			.set({
				slug: parsed.data.slug,
				name: parsed.data.name,
				parentId: parsed.data.parentId ?? null,
				description: parsed.data.description ?? null,
				isActive: parsed.data.isActive,
			})
			.where(eq(category.id, id));
	} catch (e) {
		return { ok: false, error: mapWriteError(e) };
	}

	revalidateCategoryTrees();
	revalidatePath(`${CATEGORIES_PATH}/${id}`);
	revalidatePath(`${CATEGORIES_PATH}/${id}/edit`);
	return { ok: true, data: undefined };
}

export async function toggleCategoryActive(
	id: string,
	isActive: boolean
): Promise<ActionResult> {
	await requireCapability("categories.manage");

	try {
		await db.update(category).set({ isActive }).where(eq(category.id, id));
	} catch (e) {
		logger.error({ err: e }, "toggleCategoryActive falhou");
		return { ok: false, error: "Não foi possível atualizar o status" };
	}

	revalidateCategoryTrees();
	revalidatePath(`${CATEGORIES_PATH}/${id}`);
	return { ok: true, data: undefined };
}

const reorderSchema = z.object({
	parentId: z.string().nullable(),
	orderedIds: z.array(z.string().min(1)).min(1),
});

/** Persiste sortOrder = índice para cada irmão. Não dispara o trigger de path/depth. */
export async function reorderCategories(
	input: unknown
): Promise<ActionResult> {
	await requireCapability("categories.manage");

	const parsed = reorderSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "Entrada de reordenação inválida" };
	}

	try {
		await db.transaction(async (tx) => {
			for (const [index, categoryId] of parsed.data.orderedIds.entries()) {
				await tx
					.update(category)
					.set({ sortOrder: index })
					.where(eq(category.id, categoryId));
			}
		});
	} catch (e) {
		logger.error({ err: e }, "reorderCategories falhou");
		return { ok: false, error: "Não foi possível salvar a nova ordem" };
	}

	revalidateCategoryTrees();
	return { ok: true, data: undefined };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
	await requireCapability("categories.manage");

	try {
		await db.delete(category).where(eq(category.id, id));
	} catch (e) {
		if (e instanceof Error && e.message.includes("foreign key")) {
			return {
				ok: false,
				error: "Categoria possui filhos ou produtos vinculados",
			};
		}
		return { ok: false, error: zodErrorMessage(e) };
	}

	revalidateCategoryTrees();
	return { ok: true, data: undefined };
}
```

- [ ] **Step 2: Verificar tipos do workspace db (imports usados existem)**

Run: `bun --cwd apps/web check-types 2>&1 | grep -i "actions.ts" || echo "actions.ts OK"`
Expected: `actions.ts OK` — sem erros no arquivo (erros remanescentes em `category-form.tsx`/`[id]/edit` são esperados, corrigidos depois).

Nota: se `toolVariant` não estiver exportado de `@emach/db/schema/tools`, importar de onde o schema o define (confirmar o caminho com `grep -rn "export const toolVariant" packages/db/src/schema`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/categories/actions.ts
git commit -m "feat(categories): actions de detalhe, reorder e toggle de status"
```

---

## FASE 4 — Lista em árvore com drag-and-drop

### Task 5: Adicionar dependências `@dnd-kit`

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Instalar as deps**

Run: `bun add --cwd apps/web @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
Expected: três pacotes adicionados a `apps/web/package.json` > `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/package.json bun.lock
git commit -m "build(web): adiciona @dnd-kit para reorder de categorias"
```

### Task 6: Componente `CategoriesTree`

**Files:**
- Create: `apps/web/src/app/dashboard/categories/_components/categories-tree.tsx`
- Delete: `apps/web/src/app/dashboard/categories/_components/categories-table.tsx`

- [ ] **Step 1: Criar `categories-tree.tsx`**

Árvore expansível com reorder de irmãos. Cada grupo de irmãos é um `SortableContext` próprio — assim o `@dnd-kit` só reordena dentro do mesmo pai (escopo aprovado: drag não muda de pai).

Criar `apps/web/src/app/dashboard/categories/_components/categories-tree.tsx`:

```tsx
"use client";

import {
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import { ChevronDown, ChevronRight, GripVertical, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
	buildCategoryTree,
	type CategoryTreeNode,
	type FlatCategory,
} from "../_lib/category-tree";
import { reorderCategories } from "../actions";
import { DeleteCategoryDialog } from "./delete-category-dialog";

interface CategoriesTreeProps {
	canMutate: boolean;
	categories: FlatCategory[];
}

export function CategoriesTree({ canMutate, categories }: CategoriesTreeProps) {
	const router = useRouter();
	const [, startTransition] = useTransition();
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	// Estado local da ordem para feedback otimista; re-deriva quando o server revalida.
	const [order, setOrder] = useState(categories);
	const tree = useMemo(() => buildCategoryTree(order), [order]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
	);

	function toggle(id: string) {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function handleDragEnd(event: DragEndEvent, siblings: CategoryTreeNode[]) {
		const { active, over } = event;
		if (!over || active.id === over.id) {
			return;
		}
		const ids = siblings.map((s) => s.id);
		const from = ids.indexOf(String(active.id));
		const to = ids.indexOf(String(over.id));
		if (from === -1 || to === -1) {
			return;
		}
		const reordered = [...ids];
		const [moved] = reordered.splice(from, 1);
		reordered.splice(to, 0, moved);

		// otimista: aplica sortOrder = índice no estado local
		setOrder((prev) =>
			prev.map((c) => {
				const idx = reordered.indexOf(c.id);
				return idx === -1 ? c : { ...c, sortOrder: idx };
			})
		);

		const parentId = siblings[0]?.parentId ?? null;
		startTransition(async () => {
			const result = await reorderCategories({ parentId, orderedIds: reordered });
			if (result.ok) {
				toast.success("Ordem atualizada");
				router.refresh();
			} else {
				toast.error(result.error);
				setOrder(categories); // rollback
			}
		});
	}

	return (
		<div className="rounded-md border border-border bg-card">
			<SiblingGroup
				canMutate={canMutate}
				expanded={expanded}
				nodes={tree}
				onDragEnd={handleDragEnd}
				onToggle={toggle}
				sensors={sensors}
			/>
		</div>
	);
}

interface SiblingGroupProps {
	canMutate: boolean;
	expanded: Set<string>;
	nodes: CategoryTreeNode[];
	onDragEnd: (event: DragEndEvent, siblings: CategoryTreeNode[]) => void;
	onToggle: (id: string) => void;
	sensors: ReturnType<typeof useSensors>;
}

function SiblingGroup({
	canMutate,
	expanded,
	nodes,
	onDragEnd,
	onToggle,
	sensors,
}: SiblingGroupProps) {
	if (nodes.length === 0) {
		return null;
	}
	return (
		<DndContext
			onDragEnd={(event) => onDragEnd(event, nodes)}
			sensors={sensors}
		>
			<SortableContext
				items={nodes.map((n) => n.id)}
				strategy={verticalListSortingStrategy}
			>
				{nodes.map((node) => (
					<TreeRow
						canMutate={canMutate}
						expanded={expanded}
						key={node.id}
						node={node}
						onDragEnd={onDragEnd}
						onToggle={onToggle}
						sensors={sensors}
					/>
				))}
			</SortableContext>
		</DndContext>
	);
}

interface TreeRowProps {
	canMutate: boolean;
	expanded: Set<string>;
	node: CategoryTreeNode;
	onDragEnd: (event: DragEndEvent, siblings: CategoryTreeNode[]) => void;
	onToggle: (id: string) => void;
	sensors: ReturnType<typeof useSensors>;
}

function TreeRow({
	canMutate,
	expanded,
	node,
	onDragEnd,
	onToggle,
	sensors,
}: TreeRowProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: node.id });
	const hasChildren = node.children.length > 0;
	const isOpen = expanded.has(node.id);

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : 1,
			}}
		>
			<div
				className="flex items-center gap-2 border-border border-b px-3 py-2 last:border-b-0 hover:bg-muted/40"
				style={{ paddingLeft: `${0.75 + node.depth * 1.5}rem` }}
			>
				{canMutate && (
					<button
						aria-label={`Reordenar ${node.name}`}
						className="cursor-grab text-muted-foreground"
						type="button"
						{...attributes}
						{...listeners}
					>
						<GripVertical aria-hidden className="size-4" />
					</button>
				)}
				<button
					aria-label={isOpen ? "Recolher" : "Expandir"}
					className="text-muted-foreground"
					disabled={!hasChildren}
					onClick={() => onToggle(node.id)}
					type="button"
				>
					{hasChildren ? (
						isOpen ? (
							<ChevronDown aria-hidden className="size-4" />
						) : (
							<ChevronRight aria-hidden className="size-4" />
						)
					) : (
						<span className="inline-block size-4" />
					)}
				</button>
				<Link
					className="font-medium text-sm hover:underline"
					href={`/dashboard/categories/${node.id}`}
				>
					{node.name}
				</Link>
				<span className="text-muted-foreground text-xs tabular-nums">
					{node.productCount} produto{node.productCount === 1 ? "" : "s"}
				</span>
				<span className="flex-1" />
				<Badge variant={node.isActive ? "success" : "outline"}>
					{node.isActive ? "Ativa" : "Inativa"}
				</Badge>
				{canMutate && (
					<>
						<Link
							aria-label={`Editar categoria ${node.name}`}
							className={buttonVariants({ size: "icon-sm", variant: "secondary" })}
							href={`/dashboard/categories/${node.id}/edit`}
						>
							<Pencil aria-hidden className="size-3.5" />
						</Link>
						<DeleteCategoryDialog
							categoryId={node.id}
							categoryName={node.name}
							variant="icon"
						/>
					</>
				)}
			</div>
			{isOpen && hasChildren && (
				<SiblingGroup
					canMutate={canMutate}
					expanded={expanded}
					nodes={node.children}
					onDragEnd={onDragEnd}
					onToggle={onToggle}
					sensors={sensors}
				/>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Deletar o componente antigo**

Run: `git rm apps/web/src/app/dashboard/categories/_components/categories-table.tsx`
Expected: arquivo removido.

- [ ] **Step 3: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -i "categories-tree" || echo "tree OK"`
Expected: `tree OK` (erro de `page.tsx` ainda importando `categories-table` é esperado — corrigido na Task 7).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components
git commit -m "feat(categories): árvore expansível com reorder drag-and-drop"
```

### Task 7: Atualizar `page.tsx` da lista

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/page.tsx`

- [ ] **Step 1: Reescrever `page.tsx`**

Substituir o conteúdo de `apps/web/src/app/dashboard/categories/page.tsx` por:

```tsx
import type { UserRole } from "@emach/db/schema/auth";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { CategoriesTree } from "./_components/categories-tree";
import { listCategoriesForTree } from "./actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
	const session = await requireCurrentSession();
	const role = session.user.role as UserRole | undefined;
	const canMutate = can(role, "categories.manage");

	const categories = await listCategoriesForTree();
	const isEmpty = categories.length === 0;

	return (
		<>
			<PageHeader
				action={
					canMutate ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/categories/new"
						>
							Nova categoria
						</Link>
					) : null
				}
				description="Hierarquia de categorias do catálogo. Arraste para reordenar categorias irmãs; clique numa categoria para ver os detalhes."
				title="Categorias"
			/>

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma categoria cadastrada</EmptyTitle>
						<EmptyDescription>
							Cadastre as categorias raiz do catálogo. Você pode organizá-las em
							subcategorias depois.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{canMutate && (
							<Link
								className={buttonVariants({ variant: "default" })}
								href="/dashboard/categories/new"
							>
								Nova categoria
							</Link>
						)}
					</EmptyContent>
				</Empty>
			) : (
				<CategoriesTree canMutate={canMutate} categories={categories} />
			)}
		</>
	);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -iE "categories/page" || echo "page OK"`
Expected: `page OK`.

- [ ] **Step 3: Smoke**

Run: `bun dev:web` e visitar `http://localhost:3001/dashboard/categories`.
Expected: árvore renderiza; expandir/recolher funciona; arrastar um irmão reordena e mostra toast "Ordem atualizada"; recarregar a página mantém a nova ordem.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/categories/page.tsx
git commit -m "feat(categories): lista em árvore na página principal"
```

---

## FASE 5 — Página de detalhe

### Task 8: Adicionar `variant` ao `DeleteCategoryDialog`

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_components/delete-category-dialog.tsx`

- [ ] **Step 1: Aceitar prop `variant`**

Em `delete-category-dialog.tsx`, atualizar a interface e o trigger. Trocar a interface por:

```tsx
interface DeleteCategoryDialogProps {
	categoryId: string;
	categoryName: string;
	/** "icon" = botão ícone (lista); "button" = botão com texto (detalhe). */
	variant?: "button" | "icon";
	/** Para onde navegar após excluir. Default: refresh na rota atual. */
	redirectTo?: string;
}
```

Atualizar a assinatura da função para `({ categoryId, categoryName, variant = "icon", redirectTo })` e, no `handleConfirm`, após `toast.success`, trocar `router.refresh()` por:

```tsx
				if (redirectTo) {
					router.push(redirectTo);
				} else {
					router.refresh();
				}
```

Trocar o `<AlertDialogTrigger>` por renderização condicional:

```tsx
				<AlertDialogTrigger
					aria-label={`Remover categoria ${categoryName}`}
					render={
						variant === "button" ? (
							<Button className="w-full" variant="destructive" />
						) : (
							<Button size="icon-sm" variant="destructive" />
						)
					}
				>
					{variant === "button" ? (
						<>
							<Trash2 aria-hidden className="size-3.5" /> Excluir categoria
						</>
					) : (
						<Trash2 aria-hidden className="size-3.5" />
					)}
				</AlertDialogTrigger>
```

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -i "delete-category" || echo "dialog OK"`
Expected: `dialog OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components/delete-category-dialog.tsx
git commit -m "refactor(categories): DeleteCategoryDialog aceita variant e redirect"
```

### Task 9: Componente client `CategoryDetailActions`

**Files:**
- Create: `apps/web/src/app/dashboard/categories/_components/category-detail-actions.tsx`

- [ ] **Step 1: Criar o componente**

Botões da sidebar do detalhe que disparam mutations. "Editar" e "Nova subcategoria" são `<Link>` renderizados na própria page (server) — aqui ficam só os que precisam de client (toggle + delete).

Criar `apps/web/src/app/dashboard/categories/_components/category-detail-actions.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { toggleCategoryActive } from "../actions";
import { DeleteCategoryDialog } from "./delete-category-dialog";

interface CategoryDetailActionsProps {
	categoryId: string;
	categoryName: string;
	isActive: boolean;
}

export function CategoryDetailActions({
	categoryId,
	categoryName,
	isActive,
}: CategoryDetailActionsProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	function handleToggle() {
		startTransition(async () => {
			const result = await toggleCategoryActive(categoryId, !isActive);
			if (result.ok) {
				toast.success(isActive ? "Categoria desativada" : "Categoria ativada");
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<div className="flex flex-col gap-2">
			<Button
				className="w-full"
				disabled={isPending}
				onClick={handleToggle}
				type="button"
				variant="outline"
			>
				{isPending ? <Spinner /> : null}
				{isActive ? "Desativar" : "Ativar"}
			</Button>
			<DeleteCategoryDialog
				categoryId={categoryId}
				categoryName={categoryName}
				redirectTo="/dashboard/categories"
				variant="button"
			/>
		</div>
	);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -i "category-detail-actions" || echo "actions component OK"`
Expected: `actions component OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components/category-detail-actions.tsx
git commit -m "feat(categories): ações de status/exclusão do detalhe"
```

### Task 10: Página de detalhe `[id]/page.tsx`

**Files:**
- Create: `apps/web/src/app/dashboard/categories/[id]/page.tsx`

- [ ] **Step 1: Criar a página**

Server Component. Layout grid `1.45fr/0.95fr` (idêntico a `orders/[id]/page.tsx:56`). Reusa `loadAttributeRows` — mover esse helper para um módulo compartilhado seria ideal, mas para manter escopo, a página de detalhe importa direto de `../[id]/edit/page.tsx` **não** é possível (page não exporta helper). Portanto: a página de detalhe usa `getCategoryDetail` + `getCategoryProducts` + uma consulta inline de atributos próprios/herdados via `attributeDefinition` (mesma lógica de `loadAttributeRows`, somente leitura).

Criar `apps/web/src/app/dashboard/categories/[id]/page.tsx`:

```tsx
import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
} from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { eq, inArray } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ATTRIBUTE_INPUT_TYPE_LABELS } from "../_lib/attribute-schema";
import { CategoryDetailActions } from "../_components/category-detail-actions";
import { getCategoryDetail, getCategoryProducts } from "../actions";

export const dynamic = "force-dynamic";

interface PageProps {
	params: Promise<{ id: string }>;
}

interface AttrView {
	def: AttributeDefinition;
	ownerName: string | null;
}

async function loadAttributes(categoryId: string): Promise<AttrView[]> {
	const [self] = await db
		.select({ id: category.id, parentId: category.parentId })
		.from(category)
		.where(eq(category.id, categoryId))
		.limit(1);
	if (!self) {
		return [];
	}

	const chain: { id: string; name: string }[] = [];
	let cursor: string | null = self.parentId;
	while (cursor) {
		const [row]: { id: string; name: string; parentId: string | null }[] =
			await db
				.select({
					id: category.id,
					name: category.name,
					parentId: category.parentId,
				})
				.from(category)
				.where(eq(category.id, cursor))
				.limit(1);
		if (!row) {
			break;
		}
		chain.push({ id: row.id, name: row.name });
		cursor = row.parentId;
	}
	const nameById = new Map(chain.map((c) => [c.id, c.name]));

	const ids = [categoryId, ...chain.map((c) => c.id)];
	const defs = await db
		.select()
		.from(attributeDefinition)
		.where(inArray(attributeDefinition.categoryId, ids));

	return defs
		.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
		.map((def) => ({
			def,
			ownerName:
				def.categoryId === categoryId
					? null
					: (nameById.get(def.categoryId) ?? "Origem"),
		}));
}

export default async function CategoryDetailPage({ params }: PageProps) {
	const { id } = await params;
	const [detail, products, attributes] = await Promise.all([
		getCategoryDetail(id),
		getCategoryProducts(id),
		loadAttributes(id),
	]);

	if (!detail) {
		notFound();
	}

	const { category: cat, parent, children, ownAttributeCount, productCount } =
		detail;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				action={
					<Link
						className={buttonVariants({ variant: "default" })}
						href={`/dashboard/categories/${cat.id}/edit`}
					>
						Editar
					</Link>
				}
				description={
					<>
						<code className="text-xs">{cat.path}</code>
						{parent ? ` · em ${parent.name}` : " · categoria raiz"}
					</>
				}
				title={cat.name}
			/>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)]">
				{/* Coluna esquerda */}
				<div className="flex flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-3">
								Sobre
								<Badge variant={cat.isActive ? "success" : "outline"}>
									{cat.isActive ? "Ativa" : "Inativa"}
								</Badge>
							</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground text-sm">
								{cat.description ?? "Sem descrição."}
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Atributos técnicos</CardTitle>
							<CardDescription>
								Próprios desta categoria e herdados dos pais. Edite-os na aba de
								edição.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-1">
							{attributes.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									Nenhum atributo aplicável.
								</p>
							) : (
								attributes.map(({ def, ownerName }) => (
									<div
										className="flex items-center justify-between border-border border-b py-2 last:border-b-0"
										key={def.id}
									>
										<span className="text-sm">
											<span className="font-medium">{def.label}</span>{" "}
											<span className="text-muted-foreground text-xs">
												· {ATTRIBUTE_INPUT_TYPE_LABELS[def.inputType]}
												{def.unit ? ` · ${def.unit}` : ""}
											</span>
										</span>
										{ownerName ? (
											<Badge variant="secondary">↑ {ownerName}</Badge>
										) : (
											<Badge variant="default">Próprio</Badge>
										)}
									</div>
								))
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Produtos · {productCount}</CardTitle>
							<CardDescription>
								Ferramentas com esta categoria como primária.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-1">
							{products.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									Nenhum produto nesta categoria.
								</p>
							) : (
								products.map((p) => (
									<div
										className="flex items-center justify-between border-border border-b py-2 last:border-b-0"
										key={p.id}
									>
										<span className="font-medium text-sm">{p.name}</span>
										<span className="font-mono text-muted-foreground text-xs">
											{p.sku ?? "—"}
										</span>
									</div>
								))
							)}
							{productCount > products.length && (
								<Link
									className="pt-2 text-primary text-xs hover:underline"
									href={`/dashboard/tools?category=${cat.id}`}
								>
									Ver todos os {productCount} produtos →
								</Link>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Sidebar */}
				<div className="flex flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle>Ações</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<Link
								className={buttonVariants({ variant: "default", className: "w-full" })}
								href={`/dashboard/categories/${cat.id}/edit`}
							>
								Editar categoria
							</Link>
							<Link
								className={buttonVariants({ variant: "outline", className: "w-full" })}
								href={`/dashboard/categories/new?parent=${cat.id}`}
							>
								Nova subcategoria
							</Link>
							<CategoryDetailActions
								categoryId={cat.id}
								categoryName={cat.name}
								isActive={cat.isActive}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Resumo</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-2">
							<Stat label="Produtos" value={String(productCount)} />
							<Stat label="Subcategorias" value={String(children.length)} />
							<Stat label="Atributos próprios" value={String(ownAttributeCount)} />
							<Stat label="Profundidade" value={`Nível ${cat.depth}`} />
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Hierarquia</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-1">
							{parent && (
								<Link
									className="flex items-center gap-2 border-border border-b py-2 text-sm hover:underline"
									href={`/dashboard/categories/${parent.id}`}
								>
									<ArrowUpRight aria-hidden className="size-3.5 text-muted-foreground" />
									<span className="text-primary">{parent.name}</span>
									<span className="ml-auto text-muted-foreground text-xs">pai</span>
								</Link>
							)}
							{children.length === 0 ? (
								<p className="py-2 text-muted-foreground text-xs">
									Sem subcategorias.
								</p>
							) : (
								children.map((c) => (
									<Link
										className="flex items-center justify-between border-border border-b py-2 text-sm hover:underline last:border-b-0"
										href={`/dashboard/categories/${c.id}`}
										key={c.id}
									>
										<span>{c.name}</span>
										<span className="text-muted-foreground text-xs">
											{c.productCount}
										</span>
									</Link>
								))
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border border-border bg-background p-3 text-center">
			<p className="font-medium text-primary text-xl tabular-nums">{value}</p>
			<p className="text-muted-foreground text-xs uppercase tracking-wide">
				{label}
			</p>
		</div>
	);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -iE "categories/\[id\]/page" || echo "detail OK"`
Expected: `detail OK`.

Nota: confirmar que `ATTRIBUTE_INPUT_TYPE_LABELS` é exportado de `_lib/attribute-schema.ts` (`grep -n "ATTRIBUTE_INPUT_TYPE_LABELS" apps/web/src/app/dashboard/categories/_lib/attribute-schema.ts`) e que `Card`/`buttonVariants` aceitam as props usadas (`buttonVariants({ className })` é suportado pelo `cva` do shadcn).

- [ ] **Step 3: Smoke**

Run: `bun dev:web` e visitar `http://localhost:3001/dashboard/categories/<id-real>` (pegar um id da árvore).
Expected: header com breadcrumb/path; 3 cards à esquerda; sidebar com ações/resumo/hierarquia; Desativar e Excluir funcionam; navegação pai/filho funciona.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/categories/[id]/page.tsx
git commit -m "feat(categories): página de detalhe da categoria"
```

---

## FASE 6 — Formulário em cards

### Task 11: Redesenhar `category-form.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_components/category-form.tsx`

- [ ] **Step 1: Reescrever o componente**

Layout grid `1.45fr/0.95fr`: coluna de cards à esquerda, card de salvar à direita. Remover os campos `imageUrl` e `sortOrder`. Suportar `defaultValues.parentId` vindo de query (`new?parent=<id>`) via prop. Substituir o conteúdo de `apps/web/src/app/dashboard/categories/_components/category-form.tsx` por:

```tsx
"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Spinner } from "@emach/ui/components/spinner";
import { Switch } from "@emach/ui/components/switch";
import { Textarea } from "@emach/ui/components/textarea";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ZodError } from "zod";

import {
	FormErrorPanel,
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";

import { slugifyLabel, validateSlugFormat } from "../_lib/attribute-schema";
import {
	type CategoryListItem,
	createCategory,
	updateCategory,
} from "../actions";
import { type CategoryInput, categorySchema } from "../schema";

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	slug: "Slug",
	parentId: "Categoria pai",
	description: "Descrição",
	isActive: "Ativa",
};

const NO_PARENT = "__none__";

interface CategoryFormProps {
	categories: CategoryListItem[];
	categoryId?: string;
	defaultValues: Partial<CategoryInput> & { id?: string; path?: string };
	mode: "create" | "edit";
}

function SubmitLabel({
	isPending,
	mode,
}: {
	isPending: boolean;
	mode: "create" | "edit";
}) {
	if (isPending) {
		return (
			<>
				<Spinner /> Salvando…
			</>
		);
	}
	return <>{mode === "create" ? "Criar categoria" : "Salvar alterações"}</>;
}

function zodErrorsToFieldMap(
	error: ZodError<CategoryInput>
): Partial<Record<keyof CategoryInput, string>> {
	const map: Partial<Record<keyof CategoryInput, string>> = {};
	for (const issue of error.issues) {
		const key = issue.path[0] as keyof CategoryInput | undefined;
		if (key && !map[key]) {
			map[key] = issue.message;
		}
	}
	return map;
}

export function CategoryForm({
	categories,
	categoryId,
	defaultValues,
	mode,
}: CategoryFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState(defaultValues.name ?? "");
	const [slug, setSlug] = useState(defaultValues.slug ?? "");
	const [parentId, setParentId] = useState<string>(
		defaultValues.parentId ?? NO_PARENT
	);
	const [description, setDescription] = useState(
		defaultValues.description ?? ""
	);
	const [isActive, setIsActive] = useState(defaultValues.isActive ?? true);
	const [errors, setErrors] = useState<
		Partial<Record<keyof CategoryInput, string>>
	>({});
	const [formIssues, setFormIssues] = useState<FormIssue[]>([]);

	const ownPath = defaultValues.path ?? "";
	const parentOptions =
		mode === "edit" && defaultValues.id
			? categories.filter(
					(c) =>
						c.id !== defaultValues.id &&
						(ownPath === "" || !c.path.startsWith(`${ownPath}/`))
				)
			: categories;

	const pathPreview =
		parentId === NO_PARENT
			? `/${slug || "…"}`
			: `${categories.find((c) => c.id === parentId)?.path ?? ""}/${slug || "…"}`;

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});
		setFormIssues([]);

		const parsed = categorySchema.safeParse({
			name,
			slug,
			parentId: parentId === NO_PARENT ? null : parentId,
			description: description.trim() === "" ? null : description,
			isActive,
		});

		if (!parsed.success) {
			setErrors(zodErrorsToFieldMap(parsed.error));
			const issues = zodIssuesToFormIssues(parsed.error, FIELD_LABELS);
			setFormIssues(issues);
			toast.error(
				`${issues.length} ${issues.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
			return;
		}

		startTransition(async () => {
			const result =
				mode === "create"
					? await createCategory(parsed.data)
					: await updateCategory(categoryId ?? "", parsed.data);

			if (result.ok) {
				toast.success(
					mode === "create" ? "Categoria criada" : "Categoria atualizada"
				);
				router.push("/dashboard/categories");
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível salvar a categoria");
			}
		});
	}

	return (
		<form
			className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)]"
			onSubmit={handleSubmit}
		>
			<div className="flex flex-col gap-4">
				<FormErrorPanel issues={formIssues} />

				<Card>
					<CardHeader>
						<CardTitle>Informações básicas</CardTitle>
						<CardDescription>Nome, identificador e descrição.</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="category-name">
								Nome
								<span className="text-destructive"> *</span>
							</Label>
							<Input
								aria-invalid={errors.name ? true : undefined}
								disabled={isPending}
								id="category-name"
								onChange={(event) => {
									const next = event.target.value;
									setName(next);
									if (mode === "create") {
										setSlug(slugifyLabel(next));
									}
								}}
								placeholder="Ex: Furadeiras"
								value={name}
							/>
							{errors.name && (
								<p className="text-destructive text-sm">{errors.name}</p>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="category-slug">
								Slug
								<span className="text-destructive"> *</span>
							</Label>
							<Input
								aria-invalid={errors.slug ? true : undefined}
								disabled={isPending || mode === "create"}
								id="category-slug"
								onBlur={() => {
									if (mode === "edit") {
										const err = validateSlugFormat(slug);
										setErrors((prev) => ({ ...prev, slug: err ?? undefined }));
									}
								}}
								onChange={(event) => setSlug(event.target.value)}
								placeholder="furadeiras"
								value={slug}
							/>
							<p className="text-muted-foreground text-xs">
								{mode === "create"
									? "Gerado automaticamente a partir do nome."
									: "Atenção: alterar o slug pode quebrar URLs salvas."}
							</p>
							{errors.slug && (
								<p className="text-destructive text-sm">{errors.slug}</p>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="category-description">Descrição (opcional)</Label>
							<Textarea
								disabled={isPending}
								id="category-description"
								onChange={(event) => setDescription(event.target.value)}
								placeholder="Texto curto explicando a categoria"
								rows={3}
								value={description}
							/>
							{errors.description && (
								<p className="text-destructive text-sm">{errors.description}</p>
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Hierarquia e exibição</CardTitle>
						<CardDescription>
							Posição na árvore e visibilidade. A ordem entre categorias irmãs é
							ajustada arrastando na lista.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="category-parent">Categoria pai</Label>
							<Select
								disabled={isPending}
								onValueChange={(value) => setParentId(value ?? NO_PARENT)}
								value={parentId}
							>
								<SelectTrigger id="category-parent">
									<SelectValue placeholder="Nenhuma (raiz)" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value={NO_PARENT}>Nenhuma (raiz)</SelectItem>
										{parentOptions.map((c) => (
											<SelectItem key={c.id} value={c.id}>
												{"— ".repeat(c.depth)}
												{c.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>

						<div className="flex items-center gap-3">
							<Switch
								checked={isActive}
								disabled={isPending}
								id="category-active"
								onCheckedChange={setIsActive}
							/>
							<Label htmlFor="category-active">Ativa (visível no site)</Label>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="flex flex-col gap-4">
				<Card>
					<CardHeader>
						<CardTitle>
							{mode === "create" ? "Criar categoria" : "Salvar alterações"}
						</CardTitle>
						<CardDescription>Pré-visualização do caminho</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<code className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
							{pathPreview}
						</code>
						<Button disabled={isPending} type="submit">
							<SubmitLabel isPending={isPending} mode={mode} />
						</Button>
						<Link
							className={buttonVariants({ variant: "ghost" })}
							href="/dashboard/categories"
						>
							Cancelar
						</Link>
					</CardContent>
				</Card>
			</div>
		</form>
	);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -i "category-form" || echo "form OK"`
Expected: `form OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components/category-form.tsx
git commit -m "feat(categories): formulário em cards com preview de caminho"
```

### Task 12: Atualizar `new/page.tsx` e `[id]/edit/page.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/new/page.tsx`
- Modify: `apps/web/src/app/dashboard/categories/[id]/edit/page.tsx`

- [ ] **Step 1: Reescrever `new/page.tsx`**

Aceita `?parent=<id>` (vindo do botão "Nova subcategoria" do detalhe). Substituir o conteúdo por:

```tsx
import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { CategoryForm } from "../_components/category-form";
import { listCategories } from "../actions";

export const dynamic = "force-dynamic";

interface NewCategoryPageProps {
	searchParams: Promise<{ parent?: string }>;
}

export default async function NewCategoryPage({
	searchParams,
}: NewCategoryPageProps) {
	await requireCapabilityOrRedirect("categories.manage");
	const { parent } = await searchParams;
	const categories = await listCategories();
	const validParent =
		parent && categories.some((c) => c.id === parent) ? parent : null;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description="Crie uma categoria raiz ou subcategoria para classificar ferramentas."
				title="Nova categoria"
			/>
			<CategoryForm
				categories={categories}
				defaultValues={{ isActive: true, parentId: validParent }}
				mode="create"
			/>
		</div>
	);
}
```

- [ ] **Step 2: Reescrever `[id]/edit/page.tsx`**

Mantém `loadAttributeRows` e o painel de atributos; só troca o cabeçalho por `PageHeader` e remove `imageUrl`/`sortOrder` dos `defaultValues`. Substituir o bloco `return (...)` e os `defaultValues` — o restante do arquivo (incluindo `loadAttributeRows`) permanece. Trocar o `return`:

```tsx
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description={
					<>
						Caminho atual: <code className="text-xs">{existing.path}</code>
					</>
				}
				title="Editar categoria"
			/>
			<CategoryForm
				categories={categories}
				categoryId={id}
				defaultValues={{
					id: existing.id,
					name: existing.name,
					slug: existing.slug,
					parentId: existing.parentId,
					description: existing.description,
					isActive: existing.isActive,
					path: existing.path,
				}}
				mode="edit"
			/>
			<CategoryAttributesPanel
				canCreate={can(role, "attributes.create")}
				canDelete={can(role, "attributes.delete")}
				canUpdate={can(role, "attributes.update")}
				categoryId={id}
				categoryName={existing.name}
				inheritedRows={attrRows.inheritedRows}
				ownRows={attrRows.ownRows}
			/>
		</div>
	);
```

E adicionar o import no topo do arquivo:

```tsx
import { PageHeader } from "@/components/page-header";
```

- [ ] **Step 3: Verificar tipos do workspace inteiro**

Run: `bun --cwd apps/web check-types`
Expected: PASS — sem erros.

- [ ] **Step 4: Rodar lint/format**

Run: `bun fix`
Expected: sem erros de correctness.

- [ ] **Step 5: Smoke completo**

Run: `bun dev:web` e visitar:
- `/dashboard/categories` — árvore, expandir, arrastar.
- `/dashboard/categories/<id>` — detalhe.
- `/dashboard/categories/<id>/edit` — form em cards + painel de atributos; salvar.
- `/dashboard/categories/new` e `/dashboard/categories/new?parent=<id>` — criar; no segundo, o pai vem pré-selecionado.

Expected: todas as rotas sem erro de SSR (`nextjs_call 3001 get_errors` para confirmar).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/categories/new/page.tsx apps/web/src/app/dashboard/categories/[id]/edit/page.tsx
git commit -m "feat(categories): páginas criar/editar com layout em cards"
```

---

## FASE 7 — Documentação

### Task 13: Atualizar docs e remover referências legadas

**Files:**
- Modify: `apps/web/CLAUDE.md`
- Modify: `.claude/CLAUDE.md`
- Modify: `docs/integration/admin-ecommerce.md`

- [ ] **Step 1: Atualizar `apps/web/CLAUDE.md`**

Na seção "Convenções de UX em forms", substituir o bullet "Painel de atributos por categoria" para refletir a nova estrutura. Trocar o texto do bullet por:

```md
- **Categorias — rotas e UX:** `/dashboard/categories` é uma árvore expansível (`categories-tree.tsx`) com reorder de irmãos por drag-and-drop (`@dnd-kit`, persiste `sort_order` via `reorderCategories`). `/dashboard/categories/[id]` é a página de detalhe em leitura (grid `1.45fr/0.95fr` estilo orders): cards Sobre, Atributos técnicos (read-only), Produtos + sidebar Ações/Resumo/Hierarquia. `/dashboard/categories/[id]/edit` e `/new` usam `category-form.tsx` em cards. O CRUD de definição de atributo continua só no `edit`, via Sheet lateral (`attribute-sheet.tsx`) — "Atributos próprios" + "Atributos herdados" (read-only com link para a categoria-dona). Categoria **não tem imagem** — é só estrutura de catálogo. A ordem (`sort_order`) **não** é campo de formulário; só muda pelo drag-and-drop.
```

- [ ] **Step 2: Atualizar `.claude/CLAUDE.md`**

Na seção "Topologia", na linha de `categories/`, trocar a descrição para:

```
      categories/         Árvore hierárquica (drag-and-drop) + detalhe [id] + edição com painel de atributos
```

- [ ] **Step 3: Registrar o drop de `image_url` na integração**

Em `docs/integration/admin-ecommerce.md`, adicionar uma nota na seção que descreve o schema de `category` (ou criar um item de changelog no topo do arquivo):

```md
> **2026-05-15 — `category.image_url` removida.** A coluna foi dropada do schema. As queries compartilhadas `getCategoryTree` e `getCategoryBySlug` não selecionam mais `image_url`. O app ecomerce deve sincronizar a cópia versionada do schema e remover qualquer leitura de `imageUrl` em categoria.
```

(Se a estrutura do arquivo não tiver seção de changelog, inserir o bloco logo após o título.)

- [ ] **Step 4: Verificar que não restou menção a padrão legado de categoria**

Run: `grep -rn "imageUrl\|image_url" apps/web/src docs/integration/admin-ecommerce.md`
Expected: as únicas ocorrências em `docs/integration` são a nota de changelog adicionada; zero em `apps/web/src` no escopo de categorias.

- [ ] **Step 5: Commit**

```bash
git add apps/web/CLAUDE.md .claude/CLAUDE.md docs/integration/admin-ecommerce.md
git commit -m "docs(categories): documenta nova UI e drop de image_url"
```

---

## Verificação final

- [ ] `bun --cwd apps/web check-types` — PASS.
- [ ] `bun --cwd packages/db check-types` — PASS.
- [ ] `bun --cwd apps/web vitest run src/app/dashboard/categories` — PASS (helpers de árvore).
- [ ] `bun fix` — sem erros de correctness.
- [ ] Smoke `bun dev:web`: lista (árvore + dnd), detalhe `[id]`, editar, novo (com e sem `?parent=`). `nextjs_call 3001 get_errors` sem stack traces.
- [ ] Migration de drop aplicada em dev (`bun db:push`); triggers reaplicados.

---

## Self-Review (preenchido pelo autor do plano)

**Cobertura do spec:**
- Lista em árvore + dnd → Tasks 5-7. ✅
- Página de detalhe `[id]` → Tasks 8-10. ✅
- Form em cards (editar/novo) → Tasks 11-12. ✅
- Drop `image_url` + coordenação ecomerce → Tasks 1, 13. ✅
- `sortOrder` fora do form, via reorder action → Tasks 2, 4. ✅
- Remoção de referências legadas nos docs → Task 13. ✅

**Pontos de atenção para o executor:**
- O caminho de import de `toolVariant` (Task 4) e a existência de `ATTRIBUTE_INPUT_TYPE_LABELS`/`logger` default export devem ser confirmados com `grep` antes de assumir — as notas nos steps indicam isso.
- O hook PostToolUse de auto-format pode reordenar imports após cada Write; se um Edit subsequente falhar por "string não encontrada", re-ler o arquivo.
- `db.execute` não é usado nas novas queries (tudo via query builder) — sem risco do bug de timestamp/snake_case.
