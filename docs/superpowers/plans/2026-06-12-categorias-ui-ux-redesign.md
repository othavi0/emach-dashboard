# Redesign de UI/UX de Categorias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar as telas de criar/editar categoria e a árvore ao padrão do sistema, esconder o slug, dar paridade de atributos ao criar, melhorar o select de pai e corrigir a contagem de produtos com rollup.

**Architecture:** Mudanças concentradas em `apps/web/src/app/dashboard/categories/**`. A única lógica pura nova (rollup de contagem + helper de breadcrumb) vai em `_lib/category-tree.ts` com testes vitest; o resto é UI verificada por smoke visual. Sem mudança de schema, server actions ou triggers — slug continua persistido e auto-gerado.

**Tech Stack:** Next 16 (App Router, Server Components), React 19 (compiler ativo — sem `useMemo`/`useCallback` manuais), base-ui Select, Tailwind v4, vitest (env node).

**Spec:** `docs/superpowers/specs/2026-06-12-categorias-ui-ux-redesign-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
| --- | --- | --- |
| `_lib/category-tree.ts` | Montagem da árvore + helpers puros | Modificar: `rollupCount` em `CategoryTreeNode`, `buildNameBySlug` |
| `_lib/category-tree.test.ts` | Testes dos helpers puros | Modificar: casos de rollup + nameBySlug |
| `_components/categories-tree.tsx` | Árvore drag/drop + contagem | Modificar: exibição de contagem por estado |
| `_components/attributes-table.tsx` | Tabelas de atributos próprios/herdados | Modificar: remover slug mono; melhorar empty-state |
| `_components/attribute-form.tsx` | Form de atributo (sheet) | Modificar: esconder campo de slug |
| `_components/attributes-locked.tsx` | Empty-state bloqueado de atributos (criar) | **Criar** |
| `_components/category-form.tsx` | Form de categoria (criar/editar) | Reescrever: layout, slug, select, "Onde fica", redirect |
| `new/page.tsx` | Página criar | Modificar: wrapper `max-w-2xl` + seção bloqueada |
| `[id]/edit/page.tsx` | Página editar | Modificar: wrapper + header breadcrumb |

---

## Task 1: Rollup de contagem + helper `buildNameBySlug` (TDD)

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_lib/category-tree.ts`
- Test: `apps/web/src/app/dashboard/categories/_lib/category-tree.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `category-tree.test.ts` (o `import` de `buildCategoryTree`/`FlatCategory` já existe no topo; adicionar `buildNameBySlug` ao import existente):

```ts
import {
	breadcrumbFromPath,
	buildCategoryTree,
	buildNameBySlug,
	type FlatCategory,
} from "./category-tree";

// ... (mantém os describes existentes) ...

describe("buildCategoryTree → rollupCount", () => {
	it("soma o direto do nó com o rollup de todas as descendentes", () => {
		const tree = buildCategoryTree(flat);
		const a = tree.find((n) => n.id === "a");
		// a (direto 5) + a0 (0) + a1 (2) = 7
		expect(a?.rollupCount).toBe(7);
		// folhas: rollup == direto
		expect(a?.children.find((n) => n.id === "a1")?.rollupCount).toBe(2);
		expect(tree.find((n) => n.id === "b")?.rollupCount).toBe(0);
	});

	it("propaga por mais de um nível", () => {
		const deep: FlatCategory[] = [
			{ id: "r", name: "R", slug: "r", parentId: null, depth: 0, sortOrder: 0, isActive: true, productCount: 1 },
			{ id: "c", name: "C", slug: "c", parentId: "r", depth: 1, sortOrder: 0, isActive: true, productCount: 2 },
			{ id: "g", name: "G", slug: "g", parentId: "c", depth: 2, sortOrder: 0, isActive: true, productCount: 4 },
		];
		const tree = buildCategoryTree(deep);
		const r = tree.find((n) => n.id === "r");
		expect(r?.rollupCount).toBe(7); // 1 + 2 + 4
		expect(r?.children[0]?.rollupCount).toBe(6); // 2 + 4
	});
});

describe("buildNameBySlug", () => {
	it("mapeia slug → nome", () => {
		const map = buildNameBySlug([
			{ slug: "a", name: "Ferramentas" },
			{ slug: "a1", name: "Furadeiras" },
		]);
		expect(map.get("a")).toBe("Ferramentas");
		expect(map.get("a1")).toBe("Furadeiras");
		expect(map.size).toBe(2);
	});
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun --cwd apps/web test src/app/dashboard/categories/_lib/category-tree.test.ts`
Expected: FAIL — `rollupCount` é `undefined` e `buildNameBySlug` não existe.

- [ ] **Step 3: Implementar**

Em `category-tree.ts`: adicionar `rollupCount` à interface, computar post-order em `buildCategoryTree`, e exportar `buildNameBySlug`.

```ts
export interface CategoryTreeNode extends FlatCategory {
	children: CategoryTreeNode[];
	/** Direto do nó + soma dos rollups das descendentes (calculado no cliente). */
	rollupCount: number;
}

/** Monta a árvore a partir da lista achatada, ordenando irmãos por sortOrder e nome. */
export function buildCategoryTree(flat: FlatCategory[]): CategoryTreeNode[] {
	const byId = new Map<string, CategoryTreeNode>();
	for (const c of flat) {
		byId.set(c.id, { ...c, children: [], rollupCount: 0 });
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
		nodes.sort(
			(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
		);
		for (const n of nodes) {
			sortSiblings(n.children);
		}
	};
	sortSiblings(roots);

	const computeRollup = (node: CategoryTreeNode): number => {
		let total = node.productCount;
		for (const child of node.children) {
			total += computeRollup(child);
		}
		node.rollupCount = total;
		return total;
	};
	for (const root of roots) {
		computeRollup(root);
	}

	return roots;
}

/** Mapa slug → nome, para montar breadcrumbs de hierarquia. */
export function buildNameBySlug(
	categories: { slug: string; name: string }[]
): Map<string, string> {
	return new Map(categories.map((c) => [c.slug, c.name]));
}
```

(Manter `FlatCategory` e `breadcrumbFromPath` como estão.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun --cwd apps/web test src/app/dashboard/categories/_lib/category-tree.test.ts`
Expected: PASS (incluindo os testes pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_lib/category-tree.ts apps/web/src/app/dashboard/categories/_lib/category-tree.test.ts
git commit -m "feat: rollup de contagem de produtos e helper buildNameBySlug na árvore de categorias"
```

---

## Task 2: Exibição da contagem por estado na árvore

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_components/categories-tree.tsx:235-237`

- [ ] **Step 1: Trocar o `<span>` de contagem**

Substituir o bloco atual (linhas ~235-237):

```tsx
				<span className="text-muted-foreground text-xs tabular-nums">
					{node.productCount} produto{node.productCount === 1 ? "" : "s"}
				</span>
```

por uma exibição dependente de `hasChildren` / `isOpen` (ambos já estão no escopo de `TreeRow`):

```tsx
				<CountLabel
					direct={node.productCount}
					hasChildren={hasChildren}
					isOpen={isOpen}
					rollup={node.rollupCount}
				/>
```

- [ ] **Step 2: Adicionar o componente `CountLabel`**

Adicionar no mesmo arquivo, abaixo de `TreeRow` (fora dele):

```tsx
function CountLabel({
	direct,
	hasChildren,
	isOpen,
	rollup,
}: {
	direct: number;
	hasChildren: boolean;
	isOpen: boolean;
	rollup: number;
}) {
	// Folha (ou rollup == direto): só o número direto.
	if (!hasChildren || rollup === direct) {
		return (
			<span className="text-muted-foreground text-xs tabular-nums">
				{direct} produto{direct === 1 ? "" : "s"}
			</span>
		);
	}
	// Recolhido com filhas: total (rollup) + rótulo.
	if (!isOpen) {
		return (
			<span className="text-muted-foreground text-xs tabular-nums">
				{rollup} produto{rollup === 1 ? "" : "s"}
				<span className="ml-1 text-muted-foreground/70">· com subcategorias</span>
			</span>
		);
	}
	// Expandido com filhas: direto + rótulo.
	return (
		<span className="text-muted-foreground text-xs tabular-nums">
			{direct} <span className="text-muted-foreground/70">direto{direct === 1 ? "" : "s"}</span>
		</span>
	);
}
```

- [ ] **Step 3: check-types**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 4: Smoke visual**

Garantir server de dev rodando (ver "Verificação final"). Visitar `/dashboard/categories`:
- Categoria-pai recolhida mostra o total com "· com subcategorias".
- Ao expandir, o pai mostra "N diretos" e as filhas mostram suas contagens; a soma fecha com o total recolhido.
- Categoria folha mostra "N produto(s)".

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components/categories-tree.tsx
git commit -m "feat: contagem de produtos com rollup (recolhido=total, expandido=direto) na árvore"
```

---

## Task 3: Tabela de atributos — esconder slug e melhorar empty-state

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_components/attributes-table.tsx`

- [ ] **Step 1: Remover o slug mono da tabela "próprios"**

Em `OwnAttributesTable`, trocar a célula do rótulo (linhas ~69-74):

```tsx
						<TableCell className="font-medium">
							{def.label}
							<p className="font-mono text-muted-foreground text-xs">
								{def.slug}
							</p>
						</TableCell>
```

por:

```tsx
						<TableCell className="font-medium">{def.label}</TableCell>
```

- [ ] **Step 2: Remover o slug mono da tabela "herdados"**

Em `InheritedAttributesTable`, trocar a célula do rótulo (linhas ~130-135) pela mesma forma enxuta:

```tsx
						<TableCell className="font-medium">{def.label}</TableCell>
```

- [ ] **Step 3: Melhorar o empty-state de "próprios"**

Trocar o retorno `rows.length === 0` (linhas ~48-54) por um estado mais amigável:

```tsx
	if (rows.length === 0) {
		return (
			<div className="flex flex-col items-center gap-1 rounded-md border border-border border-dashed px-4 py-8 text-center">
				<p className="font-medium text-sm">Nenhum atributo próprio ainda</p>
				<p className="text-muted-foreground text-xs">
					Use "Novo atributo" para definir especificações desta categoria. Elas
					valem para ela e todas as descendentes.
				</p>
			</div>
		);
	}
```

- [ ] **Step 4: check-types**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 5: Smoke visual**

Visitar uma categoria em `/dashboard/categories/<id>/edit`:
- A tabela de atributos não mostra mais o slug (`potencia-w`) sob o rótulo.
- Uma categoria sem atributos próprios mostra o card pontilhado.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components/attributes-table.tsx
git commit -m "feat: esconder slug do atributo na tabela e empty-state amigável"
```

---

## Task 4: Esconder o campo de slug no form de atributo

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_components/attribute-form.tsx`

Contexto: o slug do atributo continua sendo gerado de `label` via `slugifyLabel` (no `onChange` do Rótulo, modo create) e persiste normalmente. Só o **input visível** sai. No modo edit, o slug fica congelado (não exibido, mantido em `values.slug` a partir de `defaultValues`).

- [ ] **Step 1: Remover o bloco do input de slug**

Remover por completo o `<div>` do slug (linhas ~199-230, do `<Label htmlFor="slug">` até o fechamento do `</div>` que contém `{errors.slug && ...}`). Não remover a geração de slug no `onChange` do Rótulo (linhas ~187-189) — ela permanece.

- [ ] **Step 2: Limpar imports órfãos**

`validateSlugFormat` deixa de ser usado neste arquivo — remover do import de `../_lib/attribute-schema` (manter `slugifyLabel`, `ATTRIBUTE_INPUT_TYPE_LABELS`, `ATTRIBUTE_INPUT_TYPES`, `attributeFormSchema`, `AttributeFormValues`). `HelpTooltip` ainda é usado em "Tipo de campo" — manter.

- [ ] **Step 3: check + check-types**

Run: `bun check-types && bun check apps/web/src/app/dashboard/categories/_components/attribute-form.tsx`
Expected: sem erros e sem variável/import não usado (ultracite `noUnusedImports`).

- [ ] **Step 4: Smoke visual**

Em `/dashboard/categories/<id>/edit`, abrir "Novo atributo" e editar um existente: o sheet não mostra mais o campo de slug; criar/editar atributo continua funcionando (o slug é gravado).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components/attribute-form.tsx
git commit -m "feat: esconder campo de slug no form de atributo (gerado do rótulo)"
```

---

## Task 5: Componente `AttributesLocked` (empty-state bloqueado do criar)

**Files:**
- Create: `apps/web/src/app/dashboard/categories/_components/attributes-locked.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { Lock } from "lucide-react";

export function AttributesLocked() {
	return (
		<section className="flex flex-col gap-4 rounded-md border border-border border-dashed bg-card p-6">
			<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
				Atributos
			</h2>
			<div className="flex flex-col items-center gap-2 py-6 text-center">
				<Lock aria-hidden className="size-5 text-muted-foreground" />
				<p className="font-medium text-sm">
					Disponível depois de salvar
				</p>
				<p className="max-w-sm text-muted-foreground text-xs">
					Salve a categoria para definir atributos próprios. Ela já herda
					automaticamente os atributos das categorias-pai.
				</p>
			</div>
		</section>
	);
}
```

- [ ] **Step 2: check-types**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components/attributes-locked.tsx
git commit -m "feat: empty-state bloqueado de atributos para o criar categoria"
```

---

## Task 6: Reescrever `category-form.tsx` (layout, slug, select, "Onde fica", redirect)

**Files:**
- Modify (rewrite): `apps/web/src/app/dashboard/categories/_components/category-form.tsx`

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
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

import { slugifyLabel } from "../_lib/attribute-schema";
import {
	breadcrumbFromPath,
	buildNameBySlug,
} from "../_lib/category-tree";
import {
	type CategoryListItem,
	createCategory,
	updateCategory,
} from "../actions";
import { type CategoryInput, categorySchema } from "../schema";

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	slug: "Nome",
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

	const nameBySlug = buildNameBySlug(categories);

	const ownPath = defaultValues.path ?? "";
	const parentOptions =
		mode === "edit" && defaultValues.id
			? categories.filter(
					(c) =>
						c.id !== defaultValues.id &&
						(ownPath === "" || !c.path.startsWith(`${ownPath}/`))
				)
			: categories;

	const selectedParent =
		parentId === NO_PARENT
			? null
			: (categories.find((c) => c.id === parentId) ?? null);

	const parentSegments = selectedParent
		? breadcrumbFromPath(selectedParent.path, nameBySlug)
		: ["Raiz"];
	const placement = [...parentSegments, name.trim() || "…"].join(" › ");

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
			// Slug é oculto e derivado do nome: realocar o erro de slug para o Nome.
			const issues = zodIssuesToFormIssues(parsed.error, FIELD_LABELS).map(
				(issue) =>
					issue.label === "Nome" && issue.path === "slug"
						? {
								...issue,
								message:
									"O nome não gera um identificador válido — use letras ou números.",
							}
						: issue
			);
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
				if (mode === "create") {
					router.push(`/dashboard/categories/${result.data.id}/edit`);
				} else {
					router.push("/dashboard/categories");
				}
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível salvar a categoria");
			}
		});
	}

	return (
		<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
			<FormErrorPanel issues={formIssues} />

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Informações básicas
				</h2>

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
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Hierarquia e exibição
				</h2>

				<div className="flex flex-col gap-2">
					<Label htmlFor="category-parent">Categoria pai</Label>
					<Select
						disabled={isPending}
						onValueChange={(value) => setParentId(value ?? NO_PARENT)}
						value={parentId}
					>
						<SelectTrigger id="category-parent">
							<SelectValue placeholder="Nenhuma (raiz)">
								{(value) => {
									if (value === NO_PARENT || value == null || value === "") {
										return "Nenhuma (raiz)";
									}
									const parent = categories.find((c) => c.id === value);
									if (!parent) {
										return "Nenhuma (raiz)";
									}
									return breadcrumbFromPath(parent.path, nameBySlug).join(" › ");
								}}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={NO_PARENT}>Nenhuma (raiz)</SelectItem>
								{parentOptions.map((c) => (
									<SelectItem
										className={c.depth === 0 ? "font-semibold" : undefined}
										key={c.id}
										style={{ paddingLeft: `${0.5 + c.depth * 0.9}rem` }}
										value={c.id}
									>
										{c.depth > 0 && (
											<span aria-hidden className="text-muted-foreground/70">
												└ 
											</span>
										)}
										{c.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<p className="text-muted-foreground text-xs">
						Onde fica: <span className="text-foreground">{placement}</span>
					</p>
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
			</section>

			<div className="flex items-center gap-3">
				<Button disabled={isPending} type="submit">
					<SubmitLabel isPending={isPending} mode={mode} />
				</Button>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href="/dashboard/categories"
				>
					Cancelar
				</Link>
			</div>
		</form>
	);
}
```

Notas de implementação:
- **Slug:** sem input. Em `create`, segue derivado de `name` via `slugifyLabel` (mantém comportamento). Em `edit`, fica congelado em `slug` a partir de `defaultValues.slug` e é re-submetido inalterado → `updateCategory` não muda o `path` (trigger não recalcula). Renomear não toca o slug.
- **Select:** indentação por `paddingLeft` (depende de `c.depth`, que existe em `CategoryListItem`), raízes em negrito, conector `└` decorativo (`aria-hidden`). O trigger usa a render function de `SelectValue` para mostrar o breadcrumb de nomes quando um filho é o pai selecionado. *Caveat:* o typeahead do base-ui passa a casar com o texto que inclui o `└` em descendentes — aceitável para árvore pequena; se incomodar, mover o conector para `::before` via classe.
- **"Onde fica":** breadcrumb de nomes do pai + nome digitado; raiz vira `Raiz › Nome`.

- [ ] **Step 2: check + check-types**

Run: `bun check-types && bun check apps/web/src/app/dashboard/categories/_components/category-form.tsx`
Expected: sem erros.

- [ ] **Step 3: Smoke visual (criar)**

Em `/dashboard/categories/new`:
- Coluna única, sem rail, sem campo de slug.
- Select de pai indentado com `└` e raízes em negrito; ao escolher um filho, o trigger mostra o caminho de nomes.
- "Onde fica" atualiza ao digitar o nome e ao trocar o pai.
- Salvar redireciona para `/dashboard/categories/<novo-id>/edit`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components/category-form.tsx
git commit -m "feat: form de categoria em coluna única, sem slug, select em árvore e Onde fica"
```

---

## Task 7: `new/page.tsx` — wrapper + seção bloqueada

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/new/page.tsx`

- [ ] **Step 1: Renderizar o form e a seção bloqueada num container `max-w-2xl`**

Trocar o JSX retornado (linhas ~21-33) por:

```tsx
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description="Crie uma categoria raiz ou subcategoria para classificar ferramentas."
				title="Nova categoria"
			/>
			<div className="flex max-w-2xl flex-col gap-6">
				<CategoryForm
					categories={categories}
					defaultValues={{ isActive: true, parentId: validParent }}
					mode="create"
				/>
				<AttributesLocked />
			</div>
		</div>
	);
```

- [ ] **Step 2: Importar `AttributesLocked`**

Adicionar ao topo:

```tsx
import { AttributesLocked } from "../_components/attributes-locked";
```

- [ ] **Step 3: check-types**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 4: Smoke visual**

`/dashboard/categories/new`: a seção "Atributos" aparece bloqueada (cadeado + texto) abaixo do form, dentro da mesma largura.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/categories/new/page.tsx
git commit -m "feat: criar categoria mostra seção de atributos bloqueada"
```

---

## Task 8: `[id]/edit/page.tsx` — wrapper + header breadcrumb

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/[id]/edit/page.tsx`

- [ ] **Step 1: Montar o breadcrumb de nomes e ajustar o JSX**

No `EditCategoryPage`, depois de garantir `existing`, calcular o breadcrumb a partir do `path` e da lista `categories` (ambos já carregados) e envolver form + painel num `max-w-2xl`. Substituir o `return (...)` (linhas ~120-154) por:

```tsx
	const nameBySlug = buildNameBySlug(categories);
	const segments = breadcrumbFromPath(existing.path, nameBySlug);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description={segments.length > 0 ? segments.join(" › ") : existing.name}
				title="Editar categoria"
			/>
			<div className="flex max-w-2xl flex-col gap-6">
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
		</div>
	);
```

- [ ] **Step 2: Importar os helpers**

Adicionar ao import existente de `../../_components/...`? Não — os helpers vêm de `_lib/category-tree`. Adicionar:

```tsx
import { breadcrumbFromPath, buildNameBySlug } from "../../_lib/category-tree";
```

- [ ] **Step 3: check-types**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 4: Smoke visual**

`/dashboard/categories/<id>/edit`:
- Header mostra breadcrumb de nomes (ex.: `Ferramentas Elétricas › Furadeiras`), não `/slug` em código.
- Form e painel de atributos alinhados em `max-w-2xl`.
- Sem campo de slug; tabela de atributos sem slug mono.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/categories/[id]/edit/page.tsx
git commit -m "feat: editar categoria com header breadcrumb e largura padrão"
```

---

## Verificação final

- [ ] **Step 1: Suíte de testes**

Run: `bun --cwd apps/web test src/app/dashboard/categories`
Expected: PASS.

- [ ] **Step 2: Tipos e lint**

Run: `bun check-types && bun check`
Expected: sem erros (ultracite). Atenção a imports não usados (ex.: `validateSlugFormat` removido na Task 4; componentes `Card*`/`Select`/`Textarea` que saíram do `category-form`).

- [ ] **Step 3: Smoke run-time completo**

Com `bun dev:web` (ou o server de dev já ativo), percorrer:
1. `/dashboard/categories` — contagens (recolhido/expandido/folha) corretas e fechando a soma.
2. `/dashboard/categories/new` — coluna única, sem slug, select em árvore, "Onde fica", seção bloqueada; criar uma categoria filha → redireciona pro editar dela.
3. `/dashboard/categories/<id>/edit` — header breadcrumb, sem slug, atributos sem slug mono, criar/editar atributo via sheet (sem campo de slug) funcionando.
4. Renomear uma categoria existente e confirmar (via árvore/loja ou query) que o `slug`/`path` **não** mudaram.

- [ ] **Step 4: Conferir critérios de aceite da spec** (`docs/superpowers/specs/2026-06-12-categorias-ui-ux-redesign-design.md`, seção "Critérios de aceite") — todos atendidos.

---

## Self-review (autor do plano)

- **Cobertura da spec:** D1 (T6 redirect + T7 seção bloqueada) · D2 (T6 + T7/T8 wrappers) · D3 (T6 select) · D4 (T1 + T2) · D5 (T6 slug oculto/congelado) · D6: P1 (T8) P2 (T6 "Onde fica") P3 (T3 + T4) P4 (T3 + T5). Sem lacunas.
- **Sem placeholders:** todo step tem código/comando concretos.
- **Consistência de tipos:** `CategoryTreeNode.rollupCount` (T1) usado em `CountLabel` (T2); `buildNameBySlug`/`breadcrumbFromPath` (T1) usados em T6/T8; `AttributesLocked` (T5) importado em T7. `CategoryListItem` tem `depth`/`path`/`slug` (confirmado no schema `category`).
