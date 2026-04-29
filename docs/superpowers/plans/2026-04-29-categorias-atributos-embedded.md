# Categorias × Atributos embedded — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a feature standalone `/dashboard/attributes` e embutir o CRUD de atributos dentro de `/dashboard/categories/[id]/edit` via Sheet lateral, eliminando o conceito de "atributo global".

**Architecture:** Migrar `schema.ts`, `actions.ts`, `attribute-form.tsx` e `delete-attribute-dialog.tsx` da pasta `attributes/` para `categories/_lib` e `categories/_components`. Refatorar `category-attributes-panel.tsx` em client component que controla um Sheet shadcn. Tornar `attribute_definition.categoryId` `NOT NULL` via migration que cria a categoria-raiz "Geral" e move atualmente-globais para ela.

**Tech Stack:** Next 16 + React 19 + Drizzle 0.45 + Postgres + shadcn (Sheet, Card, Table, AlertDialog) + Zod + Better Auth.

**Spec source:** `docs/superpowers/specs/2026-04-29-categorias-atributos-embedded-design.md`

**Não há suíte de testes** (CLAUDE.md confirma: roadmap futuro). Verificação em cada task = `bun --cwd apps/web check-types` + smoke run-time em `bun dev:web` quando aplicável.

---

## Convenções para todos os commits

- Conventional Commits em PT.
- **Nunca** comitar sem confirmação explícita do usuário (CLAUDE.md). Cada task termina com `git status` + pedir confirmação antes de commitar.
- Após `Write`/`Edit`, o hook PostToolUse roda `bun fix` automaticamente — pode reordenar campos. Se um Edit subsequente falhar por "string não encontrada", re-ler o arquivo.

---

## Task 1: Migration de schema — `attribute_definition.categoryId` `NOT NULL` + categoria "Geral"

**Files:**
- Modify: `packages/db/src/schema/attributes.ts:53-55`
- Create: `packages/db/src/migrations/<NNNN>_attributes_require_category.sql` (gerado)

- [ ] **Step 1: Verificar quantos atributos globais existem hoje**

Rodar via `bun db:studio` (ou conectar ao Postgres direto):
```sql
SELECT count(*) FROM attribute_definition WHERE category_id IS NULL;
SELECT id, slug, label FROM attribute_definition WHERE category_id IS NULL;
```
Anotar contagem. Esperado em dev: 0 ou poucos. Se houver algo crítico, anotar para validação posterior.

- [ ] **Step 2: Editar schema removendo nullable de `categoryId`**

Em `packages/db/src/schema/attributes.ts`, substituir o bloco atual (linhas 53–55):

```ts
		categoryId: text("category_id").references(() => category.id, {
			onDelete: "restrict",
		}),
```

por:

```ts
		categoryId: text("category_id")
			.notNull()
			.references(() => category.id, {
				onDelete: "restrict",
			}),
```

- [ ] **Step 3: Gerar migration versionada**

```bash
bun --cwd packages/db db:generate
```

Esperado: novo arquivo `packages/db/src/migrations/<NNNN>_*.sql` com `ALTER TABLE attribute_definition ALTER COLUMN category_id SET NOT NULL;`.

- [ ] **Step 4: Editar a migration para inserir o bloco "Geral" antes do `SET NOT NULL`**

Abrir o arquivo gerado e adicionar **acima** do `ALTER TABLE`:

```sql
-- Cria categoria-raiz "Geral" (idempotente). path/depth são preenchidos pelo trigger;
-- INSERT explícito aqui só por garantia em ambientes onde o trigger ainda não rodou.
INSERT INTO category (id, slug, name, path, depth, is_active, sort_order)
SELECT gen_random_uuid(), 'geral', 'Geral', '/geral', 0, true, 0
WHERE NOT EXISTS (SELECT 1 FROM category WHERE slug = 'geral');

-- Move atributos atualmente globais para "Geral".
UPDATE attribute_definition
   SET category_id = (SELECT id FROM category WHERE slug = 'geral')
 WHERE category_id IS NULL;
```

A migration final deve ter, em ordem:
1. INSERT da categoria "Geral".
2. UPDATE dos globais.
3. ALTER COLUMN ... SET NOT NULL (gerado pelo drizzle-kit).

- [ ] **Step 5: Aplicar migration em dev**

```bash
bun --cwd packages/db db:migrate
```

Esperado: SQL roda sem erro.

- [ ] **Step 6: Reaplicar triggers (precaução, idempotente)**

```bash
bun --cwd packages/db db:apply-triggers
```

- [ ] **Step 7: Validar pós-migration**

Via `bun db:studio` ou psql:

```sql
SELECT count(*) FROM attribute_definition WHERE category_id IS NULL;
-- esperado: 0

SELECT id, name, slug, path, depth FROM category WHERE slug = 'geral';
-- esperado: 1 linha
```

- [ ] **Step 8: Confirmar com o usuário antes de commitar**

```bash
git status
git diff packages/db/src/schema/attributes.ts
git diff packages/db/src/migrations/
```

Pedir confirmação. Quando aprovado:

```bash
git add packages/db/src/schema/attributes.ts packages/db/src/migrations/
git commit -m "$(cat <<'EOF'
feat(db): tornar attribute_definition.category_id obrigatório

Cria categoria-raiz "Geral" e move atributos globais
existentes para ela antes de aplicar SET NOT NULL.
EOF
)"
```

---

## Task 2: Migrar schema Zod + utilitários para `categories/_lib`

**Files:**
- Create: `apps/web/src/app/dashboard/categories/_lib/attribute-schema.ts`
- Modify: `apps/web/src/app/dashboard/categories/_components/category-form.tsx:23` (atualizar import de `slugifyLabel`)

- [ ] **Step 1: Criar pasta `_lib` e copiar schema**

Criar `apps/web/src/app/dashboard/categories/_lib/attribute-schema.ts` com este conteúdo (idêntico ao schema atual + nota explicativa de uso embed):

```ts
import type { AttributeOptions } from "@emach/db/schema/attributes";
import { z } from "zod";

export const ATTRIBUTE_INPUT_TYPES = [
	"text",
	"number",
	"select",
	"boolean",
	"numeric_range",
	"color",
] as const;

export type AttributeInputType = (typeof ATTRIBUTE_INPUT_TYPES)[number];

export const ATTRIBUTE_INPUT_TYPE_LABELS: Record<AttributeInputType, string> = {
	text: "Texto livre",
	number: "Número",
	select: "Lista de opções",
	boolean: "Sim / Não",
	numeric_range: "Faixa numérica (mín–máx)",
	color: "Cor",
};

// categoryId NÃO faz parte do form — é injetado pela página da categoria
// no momento de chamar a server action.
export const attributeFormSchema = z
	.object({
		slug: z
			.string()
			.min(1, "Slug obrigatório")
			.regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen"),
		label: z.string().min(1, "Rótulo obrigatório"),
		inputType: z.enum(ATTRIBUTE_INPUT_TYPES),
		unit: z.string().optional().or(z.literal("")),
		isRequired: z.boolean().default(false),
		sortOrder: z.number().int().min(0).default(0),
		options: z
			.array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
			.default([]),
		swatches: z
			.array(
				z.object({
					value: z.string().min(1),
					label: z.string().min(1),
					hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use formato #rrggbb"),
				})
			)
			.default([]),
	})
	.superRefine((data, ctx) => {
		if (data.inputType === "select" && data.options.length < 1) {
			ctx.addIssue({
				code: "custom",
				path: ["options"],
				message: "Adicione ao menos uma opção",
			});
		}
		if (data.inputType === "color" && data.swatches.length < 1) {
			ctx.addIssue({
				code: "custom",
				path: ["swatches"],
				message: "Adicione ao menos uma cor",
			});
		}
	});

export type AttributeFormValues = z.infer<typeof attributeFormSchema>;

export function buildOptionsField(
	values: AttributeFormValues
): AttributeOptions | null {
	if (values.inputType === "select") {
		return { kind: "select", options: values.options };
	}
	if (values.inputType === "color") {
		return { kind: "color", swatches: values.swatches };
	}
	return null;
}

export function slugifyLabel(input: string): string {
	return input
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}
```

> **Diff vs original:** removido `categoryId: z.string().optional().or(z.literal(""))`. A categoryId vira parâmetro explícito das server actions (Task 3).

- [ ] **Step 2: Atualizar import em `category-form.tsx`**

Em `apps/web/src/app/dashboard/categories/_components/category-form.tsx:23`, substituir:

```ts
import { slugifyLabel } from "../../attributes/schema";
```

por:

```ts
import { slugifyLabel } from "../_lib/attribute-schema";
```

- [ ] **Step 3: Verificar typecheck**

```bash
bun --cwd apps/web check-types
```

Esperado: sem erros relacionados a `attribute-schema` ou `slugifyLabel`. Pode ainda existir referência a `attributes/schema` em outros arquivos — esses serão removidos nas próximas tasks; ignorar erros que vão sumir.

- [ ] **Step 4: Não commitar ainda** — depende das próximas tasks para typecheck limpo. Marcar task 2 como done internamente.

---

## Task 3: Migrar server actions para `categories/_lib/attribute-actions.ts`

**Files:**
- Create: `apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts`

- [ ] **Step 1: Criar arquivo com as 4 actions ajustadas**

Conteúdo completo:

```ts
"use server";

import { db } from "@emach/db";
import {
	attributeDefinition,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireCapability } from "@/lib/permissions";
import {
	type AttributeFormValues,
	attributeFormSchema,
	buildOptionsField,
} from "./attribute-schema";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro inesperado";
}

function normalize(input: AttributeFormValues, categoryId: string) {
	return {
		slug: input.slug.trim(),
		label: input.label.trim(),
		inputType: input.inputType,
		unit: input.unit?.trim() ? input.unit.trim() : null,
		options: buildOptionsField(input),
		isRequired: input.isRequired,
		categoryId,
		sortOrder: input.sortOrder,
	};
}

export async function createCategoryAttribute(
	categoryId: string,
	input: AttributeFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireCapability("attributes.create");
	const parsed = attributeFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}
	const id = crypto.randomUUID();
	try {
		await db
			.insert(attributeDefinition)
			.values({ id, ...normalize(parsed.data, categoryId) });
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
	revalidatePath(`/dashboard/categories/${categoryId}/edit`);
	return { ok: true, data: { id } };
}

export async function updateCategoryAttribute(
	id: string,
	categoryId: string,
	input: AttributeFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireCapability("attributes.update");
	const parsed = attributeFormSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: errorMessage(parsed.error) };
	}
	try {
		await db
			.update(attributeDefinition)
			.set(normalize(parsed.data, categoryId))
			.where(eq(attributeDefinition.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
	revalidatePath(`/dashboard/categories/${categoryId}/edit`);
	return { ok: true, data: { id } };
}

export async function deleteCategoryAttribute(
	id: string,
	categoryId: string
): Promise<ActionResult> {
	await requireCapability("attributes.delete");
	try {
		// Cascade na FK de toolAttributeValue lida com valores existentes.
		await db.delete(attributeDefinition).where(eq(attributeDefinition.id, id));
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
	revalidatePath(`/dashboard/categories/${categoryId}/edit`);
	return { ok: true, data: undefined };
}

export async function getAttributeUsage(id: string): Promise<number> {
	const rows = await db
		.select({ toolId: toolAttributeValue.toolId })
		.from(toolAttributeValue)
		.where(eq(toolAttributeValue.attributeId, id));
	return rows.length;
}
```

> **Diff vs original:** `categoryId` é parâmetro obrigatório de create/update/delete, não vem do form payload. `revalidatePath` aponta para a página da categoria.

- [ ] **Step 2: Não commitar ainda** — depende das próximas tasks.

---

## Task 4: Criar `attribute-form.tsx` em `categories/_components/`

**Files:**
- Create: `apps/web/src/app/dashboard/categories/_components/attribute-form.tsx`

- [ ] **Step 1: Criar form refatorado (sem campo categoryId, com onSuccess callback)**

Conteúdo completo:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
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
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ZodError } from "zod";

import {
	createCategoryAttribute,
	updateCategoryAttribute,
} from "../_lib/attribute-actions";
import {
	ATTRIBUTE_INPUT_TYPE_LABELS,
	ATTRIBUTE_INPUT_TYPES,
	type AttributeFormValues,
	attributeFormSchema,
	slugifyLabel,
} from "../_lib/attribute-schema";

interface AttributeFormProps {
	attributeId?: string;
	categoryId: string;
	defaultValues: Partial<AttributeFormValues>;
	mode: "create" | "edit";
	onSuccess: () => void;
}

const EMPTY: AttributeFormValues = {
	slug: "",
	label: "",
	inputType: "text",
	unit: "",
	isRequired: false,
	sortOrder: 0,
	options: [],
	swatches: [],
};

const FIELD_LABELS: Record<string, string> = {
	label: "Rótulo",
	slug: "Slug",
	inputType: "Tipo de campo",
	unit: "Unidade",
	sortOrder: "Ordem",
	options: "Opções da lista",
	swatches: "Cores",
	isRequired: "Obrigatório",
};

function pathToLabel(path: readonly PropertyKey[]): string {
	if (path.length === 0) {
		return "Formulário";
	}
	const head = String(path[0]);
	const root = FIELD_LABELS[head] ?? head;
	if (path.length === 1) {
		return root;
	}
	const rest = path
		.slice(1)
		.map((p) => (typeof p === "number" ? `#${p + 1}` : p))
		.join(" › ");
	return `${root} ${rest}`;
}

function renderSubmitLabel(isPending: boolean, mode: "create" | "edit") {
	if (isPending) {
		return (
			<>
				<Spinner /> Salvando…
			</>
		);
	}
	return mode === "create" ? "Criar atributo" : "Salvar alterações";
}

export function AttributeForm({
	mode,
	attributeId,
	categoryId,
	defaultValues,
	onSuccess,
}: AttributeFormProps) {
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<AttributeFormValues>({
		...EMPTY,
		...defaultValues,
		options: defaultValues.options ?? [],
		swatches: defaultValues.swatches ?? [],
	});
	const [errors, setErrors] = useState<
		Partial<Record<keyof AttributeFormValues, string>>
	>({});
	const [allIssues, setAllIssues] = useState<
		{ path: string; message: string }[]
	>([]);

	function update<K extends keyof AttributeFormValues>(
		key: K,
		value: AttributeFormValues[K]
	) {
		setValues((prev) => ({ ...prev, [key]: value }));
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const result = attributeFormSchema.safeParse(values);
		if (!result.success) {
			const fieldErrors: Partial<Record<keyof AttributeFormValues, string>> =
				{};
			const issues = (result.error as ZodError<AttributeFormValues>).issues;
			for (const issue of issues) {
				const key = issue.path[0] as keyof AttributeFormValues | undefined;
				if (key && !fieldErrors[key]) {
					fieldErrors[key] = issue.message;
				}
			}
			setErrors(fieldErrors);
			setAllIssues(
				issues.map((i) => ({ path: pathToLabel(i.path), message: i.message }))
			);
			toast.error(
				`${issues.length} ${issues.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
			return;
		}
		setErrors({});
		setAllIssues([]);
		startTransition(async () => {
			const action =
				mode === "create"
					? await createCategoryAttribute(categoryId, result.data)
					: await updateCategoryAttribute(
							attributeId ?? "",
							categoryId,
							result.data
						);
			if (action.ok) {
				toast.success(
					mode === "create" ? "Atributo criado" : "Atributo atualizado"
				);
				onSuccess();
				return;
			}
			toast.error(action.error || "Falha ao salvar");
		});
	}

	const showOptions = values.inputType === "select";
	const showSwatches = values.inputType === "color";
	const showUnit =
		values.inputType === "number" || values.inputType === "numeric_range";

	return (
		<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
			{allIssues.length > 0 && (
				<div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
					<p className="font-semibold text-xs">
						{allIssues.length === 1
							? "1 erro impede salvar:"
							: `${allIssues.length} erros impedem salvar:`}
					</p>
					<ul className="mt-2 list-disc pl-5 text-xs">
						{allIssues.map((issue, idx) => (
							<li key={`${issue.path}-${idx}`}>
								<strong>{issue.path}:</strong> {issue.message}
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="flex flex-col gap-2">
				<Label htmlFor="label">
					Rótulo
					<span className="text-destructive"> *</span>
				</Label>
				<Input
					id="label"
					onChange={(e) => {
						const v = e.target.value;
						update("label", v);
						if (mode === "create") {
							update("slug", slugifyLabel(v));
						}
					}}
					placeholder="RPM máximo"
					value={values.label}
				/>
				{errors.label && (
					<p className="text-destructive text-xs">{errors.label}</p>
				)}
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="slug">
					Slug
					<span className="text-destructive"> *</span>
				</Label>
				<Input
					disabled={mode === "create"}
					id="slug"
					onChange={(e) => update("slug", e.target.value)}
					placeholder="rpm-maximo"
					value={values.slug}
				/>
				<p className="text-muted-foreground text-xs">
					{mode === "create"
						? "Gerado automaticamente a partir do rótulo."
						: "Atenção: alterar o slug pode quebrar referências."}
				</p>
				{errors.slug && (
					<p className="text-destructive text-xs">{errors.slug}</p>
				)}
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<div className="flex flex-col gap-2">
					<Label htmlFor="inputType">
						Tipo de campo
						<span className="text-destructive"> *</span>
					</Label>
					<Select
						onValueChange={(v) =>
							update("inputType", v as AttributeFormValues["inputType"])
						}
						value={values.inputType}
					>
						<SelectTrigger id="inputType">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{ATTRIBUTE_INPUT_TYPES.map((t) => (
									<SelectItem key={t} value={t}>
										{ATTRIBUTE_INPUT_TYPE_LABELS[t]}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="sortOrder">Ordem</Label>
					<Input
						id="sortOrder"
						onChange={(e) =>
							update("sortOrder", Number.parseInt(e.target.value, 10) || 0)
						}
						placeholder="0"
						type="number"
						value={values.sortOrder}
					/>
				</div>
			</div>

			{showUnit && (
				<div className="flex flex-col gap-2">
					<Label htmlFor="unit">Unidade</Label>
					<Input
						id="unit"
						onChange={(e) => update("unit", e.target.value)}
						placeholder="RPM, mm, kg, W"
						value={values.unit ?? ""}
					/>
				</div>
			)}

			<div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
				<div className="flex flex-col gap-0.5">
					<Label className="text-xs" htmlFor="isRequired">
						Obrigatório
					</Label>
					<span className="text-muted-foreground text-xs">
						Forçar preenchimento ao cadastrar ferramenta.
					</span>
				</div>
				<Switch
					checked={values.isRequired}
					id="isRequired"
					onCheckedChange={(checked) => update("isRequired", checked)}
				/>
			</div>

			{showOptions && (
				<section className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
					<h3 className="font-semibold text-xs uppercase tracking-wide">
						Opções da lista
					</h3>
					{values.options.map((opt, index) => (
						<div className="grid grid-cols-[2fr_2fr_auto] gap-2" key={index}>
							<Input
								onChange={(e) => {
									const label = e.target.value;
									const next = [...values.options];
									next[index] = {
										...next[index],
										label,
										value:
											mode === "create"
												? slugifyLabel(label)
												: next[index].value,
									};
									update("options", next);
								}}
								placeholder="Rótulo visível"
								value={opt.label}
							/>
							<Input
								disabled={mode === "create"}
								onChange={(e) => {
									const next = [...values.options];
									next[index] = { ...next[index], value: e.target.value };
									update("options", next);
								}}
								placeholder="slug-da-opcao"
								value={opt.value}
							/>
							<Button
								onClick={() =>
									update(
										"options",
										values.options.filter((_, i) => i !== index)
									)
								}
								size="icon-sm"
								type="button"
								variant="ghost"
							>
								<Trash2 />
							</Button>
						</div>
					))}
					<Button
						onClick={() =>
							update("options", [...values.options, { value: "", label: "" }])
						}
						size="sm"
						type="button"
						variant="outline"
					>
						<Plus /> Adicionar opção
					</Button>
					{errors.options && (
						<p className="text-destructive text-xs">{errors.options}</p>
					)}
				</section>
			)}

			{showSwatches && (
				<section className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
					<h3 className="font-semibold text-xs uppercase tracking-wide">
						Cores
					</h3>
					{values.swatches.map((sw, index) => (
						<div
							className="grid grid-cols-[1fr_2fr_2fr_auto] gap-2"
							key={index}
						>
							<Input
								onChange={(e) => {
									const next = [...values.swatches];
									next[index] = { ...next[index], hex: e.target.value };
									update("swatches", next);
								}}
								placeholder="#1a1a1a"
								value={sw.hex}
							/>
							<Input
								onChange={(e) => {
									const label = e.target.value;
									const next = [...values.swatches];
									next[index] = {
										...next[index],
										label,
										value:
											mode === "create"
												? slugifyLabel(label)
												: next[index].value,
									};
									update("swatches", next);
								}}
								placeholder="Rótulo"
								value={sw.label}
							/>
							<Input
								disabled={mode === "create"}
								onChange={(e) => {
									const next = [...values.swatches];
									next[index] = { ...next[index], value: e.target.value };
									update("swatches", next);
								}}
								placeholder="slug-da-cor"
								value={sw.value}
							/>
							<Button
								onClick={() =>
									update(
										"swatches",
										values.swatches.filter((_, i) => i !== index)
									)
								}
								size="icon-sm"
								type="button"
								variant="ghost"
							>
								<Trash2 />
							</Button>
						</div>
					))}
					<Button
						onClick={() =>
							update("swatches", [
								...values.swatches,
								{ hex: "#000000", value: "", label: "" },
							])
						}
						size="sm"
						type="button"
						variant="outline"
					>
						<Plus /> Adicionar cor
					</Button>
					{errors.swatches && (
						<p className="text-destructive text-xs">{errors.swatches}</p>
					)}
				</section>
			)}

			<div className="mt-2 flex justify-end gap-2">
				<Button
					disabled={isPending}
					onClick={() => onSuccess()}
					type="button"
					variant="outline"
				>
					Cancelar
				</Button>
				<Button disabled={isPending} type="submit">
					{renderSubmitLabel(isPending, mode)}
				</Button>
			</div>
		</form>
	);
}
```

> **Diff vs original:** removidos `categoryId` (Select de categoria) e `categories` (prop). Adicionados `categoryId` (string fixa) e `onSuccess` callback. `router.push` removido — Sheet fecha via `onSuccess`. Layout adaptado para drawer (gaps menores, grids 2-cols max).

- [ ] **Step 2: Não commitar ainda.**

---

## Task 5: Migrar `delete-attribute-dialog.tsx` para `categories/_components/`

**Files:**
- Create: `apps/web/src/app/dashboard/categories/_components/delete-attribute-dialog.tsx`

- [ ] **Step 1: Criar arquivo**

```tsx
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
import { Spinner } from "@emach/ui/components/spinner";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteCategoryAttribute } from "../_lib/attribute-actions";

interface DeleteAttributeDialogProps {
	attributeId: string;
	attributeLabel: string;
	categoryId: string;
	usageCount: number;
}

export function DeleteAttributeDialog({
	attributeId,
	attributeLabel,
	categoryId,
	usageCount,
}: DeleteAttributeDialogProps) {
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deleteCategoryAttribute(attributeId, categoryId);
			if (result.ok) {
				toast.success("Atributo removido");
				setOpen(false);
			} else {
				toast.error(result.error || "Não foi possível remover o atributo");
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				render={
					<Button
						className="text-destructive hover:bg-destructive/10"
						size="sm"
						variant="ghost"
					/>
				}
			>
				Remover
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remover atributo?</AlertDialogTitle>
					<AlertDialogDescription>
						O atributo <strong>{attributeLabel}</strong> será removido
						permanentemente.
						{usageCount > 0 ? (
							<>
								{" "}
								<strong>
									{usageCount === 1
										? "1 ferramenta usa este atributo"
										: `${usageCount} ferramentas usam este atributo`}
								</strong>
								. Os valores preenchidos nessas ferramentas também serão
								apagados (cascade).
							</>
						) : (
							" Nenhuma ferramenta usa este atributo no momento."
						)}{" "}
						Esta ação não pode ser desfeita.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending}
						onClick={(e) => {
							e.preventDefault();
							handleConfirm();
						}}
					>
						{isPending ? (
							<>
								<Spinner /> Removendo…
							</>
						) : (
							"Remover"
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
```

> **Diff vs original:** prop adicional `categoryId` (passada para `deleteCategoryAttribute`); `router.refresh()` removido — `revalidatePath` no server action faz o trabalho.

- [ ] **Step 2: Não commitar ainda.**

---

## Task 6: Criar `attribute-sheet.tsx` (wrapper Sheet controlado)

**Files:**
- Create: `apps/web/src/app/dashboard/categories/_components/attribute-sheet.tsx`

- [ ] **Step 1: Criar wrapper**

```tsx
"use client";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";

import type { AttributeFormValues } from "../_lib/attribute-schema";
import { AttributeForm } from "./attribute-form";

export type AttributeSheetMode =
	| { kind: "create" }
	| {
			kind: "edit";
			attributeId: string;
			defaultValues: Partial<AttributeFormValues>;
	  };

interface AttributeSheetProps {
	categoryId: string;
	categoryName: string;
	mode: AttributeSheetMode | null;
	onClose: () => void;
}

export function AttributeSheet({
	categoryId,
	categoryName,
	mode,
	onClose,
}: AttributeSheetProps) {
	const open = mode !== null;
	return (
		<Sheet
			onOpenChange={(next) => {
				if (!next) {
					onClose();
				}
			}}
			open={open}
		>
			<SheetContent
				className="flex w-full flex-col gap-0 sm:max-w-md"
				side="right"
			>
				<SheetHeader>
					<SheetTitle>
						{mode?.kind === "edit" ? "Editar atributo" : "Novo atributo"}
					</SheetTitle>
					<SheetDescription>
						Categoria:{" "}
						<strong className="text-foreground">{categoryName}</strong>
					</SheetDescription>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto p-4">
					{mode && (
						<AttributeForm
							attributeId={
								mode.kind === "edit" ? mode.attributeId : undefined
							}
							categoryId={categoryId}
							defaultValues={
								mode.kind === "edit" ? mode.defaultValues : {}
							}
							mode={mode.kind}
							onSuccess={onClose}
						/>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
```

> **Notas:** `Sheet` da `packages/ui` usa Base UI Dialog primitive; o `onOpenChange={(next) => { if (!next) onClose() }}` cobre o caso de fechar via X, ESC ou backdrop. `mode={null}` mantém Sheet fechado (quando `open=false`, Sheet renderiza vazio mas o portal segue desmontado).

- [ ] **Step 2: Não commitar ainda.**

---

## Task 7: Criar `attributes-table.tsx` (tabela reusável próprios + herdados)

**Files:**
- Create: `apps/web/src/app/dashboard/categories/_components/attributes-table.tsx`

- [ ] **Step 1: Criar componente reusável**

```tsx
"use client";

import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import Link from "next/link";

import { ATTRIBUTE_INPUT_TYPE_LABELS } from "../_lib/attribute-schema";
import { DeleteAttributeDialog } from "./delete-attribute-dialog";

export interface OwnRow {
	def: AttributeDefinition;
	usageCount: number;
}

export interface InheritedRow {
	def: AttributeDefinition;
	ownerCategoryId: string;
	ownerCategoryName: string;
}

interface OwnTableProps {
	categoryId: string;
	canDelete: boolean;
	canUpdate: boolean;
	onEdit: (attribute: AttributeDefinition) => void;
	rows: OwnRow[];
}

export function OwnAttributesTable({
	categoryId,
	canDelete,
	canUpdate,
	onEdit,
	rows,
}: OwnTableProps) {
	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-xs">
				Nenhum atributo próprio. Use “Novo atributo” para adicionar.
			</p>
		);
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Rótulo</TableHead>
					<TableHead>Tipo</TableHead>
					<TableHead>Unidade</TableHead>
					<TableHead>Obrigatório</TableHead>
					<TableHead className="w-32 text-right">Ações</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map(({ def, usageCount }) => (
					<TableRow key={def.id}>
						<TableCell className="font-medium">
							{def.label}
							<p className="font-mono text-muted-foreground text-xs">
								{def.slug}
							</p>
						</TableCell>
						<TableCell>{ATTRIBUTE_INPUT_TYPE_LABELS[def.inputType]}</TableCell>
						<TableCell>{def.unit ?? "—"}</TableCell>
						<TableCell>
							{def.isRequired ? (
								<Badge>Obrigatório</Badge>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						<TableCell className="text-right">
							<div className="flex justify-end gap-1">
								{canUpdate && (
									<Button
										onClick={() => onEdit(def)}
										size="sm"
										type="button"
										variant="ghost"
									>
										Editar
									</Button>
								)}
								{canDelete && (
									<DeleteAttributeDialog
										attributeId={def.id}
										attributeLabel={def.label}
										categoryId={categoryId}
										usageCount={usageCount}
									/>
								)}
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

interface InheritedTableProps {
	rows: InheritedRow[];
}

export function InheritedAttributesTable({ rows }: InheritedTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Rótulo</TableHead>
					<TableHead>Tipo</TableHead>
					<TableHead>Origem</TableHead>
					<TableHead className="w-32 text-right">Ação</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map(({ def, ownerCategoryId, ownerCategoryName }) => (
					<TableRow key={def.id}>
						<TableCell className="font-medium">
							{def.label}
							<p className="font-mono text-muted-foreground text-xs">
								{def.slug}
							</p>
						</TableCell>
						<TableCell>{ATTRIBUTE_INPUT_TYPE_LABELS[def.inputType]}</TableCell>
						<TableCell>
							<Badge variant="secondary">{ownerCategoryName}</Badge>
						</TableCell>
						<TableCell className="text-right">
							<Button asChild size="sm" type="button" variant="ghost">
								<Link href={`/dashboard/categories/${ownerCategoryId}/edit`}>
									Abrir →
								</Link>
							</Button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
```

> **Notas:** `<Button asChild>` permite usar Button styling em `<Link>` (mais idiomático que `buttonVariants` aqui). `usageCount` precisa ser carregado server-side e passado por linha (Task 9).

- [ ] **Step 2: Não commitar ainda.**

---

## Task 8: Refatorar `category-attributes-panel.tsx` para client component

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_components/category-attributes-panel.tsx` (rewrite)

- [ ] **Step 1: Substituir conteúdo do arquivo**

```tsx
"use client";

import type { AttributeDefinition } from "@emach/db/schema/attributes";
import type { AttributeOptions } from "@emach/db/schema/attributes";
import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Plus } from "lucide-react";
import { useState } from "react";

import type { AttributeFormValues } from "../_lib/attribute-schema";
import {
	AttributeSheet,
	type AttributeSheetMode,
} from "./attribute-sheet";
import {
	type InheritedRow,
	InheritedAttributesTable,
	type OwnRow,
	OwnAttributesTable,
} from "./attributes-table";

interface CategoryAttributesPanelProps {
	canCreate: boolean;
	canDelete: boolean;
	canUpdate: boolean;
	categoryId: string;
	categoryName: string;
	inheritedRows: InheritedRow[];
	ownRows: OwnRow[];
}

function defToFormValues(
	def: AttributeDefinition
): Partial<AttributeFormValues> {
	const opts = def.options as AttributeOptions | null;
	return {
		slug: def.slug,
		label: def.label,
		inputType: def.inputType,
		unit: def.unit ?? "",
		isRequired: def.isRequired,
		sortOrder: def.sortOrder,
		options: opts && opts.kind === "select" ? opts.options : [],
		swatches: opts && opts.kind === "color" ? opts.swatches : [],
	};
}

export function CategoryAttributesPanel({
	canCreate,
	canDelete,
	canUpdate,
	categoryId,
	categoryName,
	inheritedRows,
	ownRows,
}: CategoryAttributesPanelProps) {
	const [sheetMode, setSheetMode] = useState<AttributeSheetMode | null>(null);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Atributos próprios</CardTitle>
					<CardDescription>
						Definidos nesta categoria. Aplicam-se a ela e a todas as
						descendentes.
					</CardDescription>
					{canCreate && (
						<CardAction>
							<Button
								onClick={() => setSheetMode({ kind: "create" })}
								size="sm"
								type="button"
							>
								<Plus /> Novo atributo
							</Button>
						</CardAction>
					)}
				</CardHeader>
				<CardContent>
					<OwnAttributesTable
						canDelete={canDelete}
						canUpdate={canUpdate}
						categoryId={categoryId}
						onEdit={(def) =>
							setSheetMode({
								kind: "edit",
								attributeId: def.id,
								defaultValues: defToFormValues(def),
							})
						}
						rows={ownRows}
					/>
				</CardContent>
			</Card>

			{inheritedRows.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Atributos herdados</CardTitle>
						<CardDescription>
							Vindos de categorias-pai. Edite na categoria de origem para
							alterar em todas as descendentes.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<InheritedAttributesTable rows={inheritedRows} />
					</CardContent>
				</Card>
			)}

			<AttributeSheet
				categoryId={categoryId}
				categoryName={categoryName}
				mode={sheetMode}
				onClose={() => setSheetMode(null)}
			/>
		</>
	);
}
```

> **Diff vs original:** componente vira client; deixa de buscar dados — recebe pré-classificados via props; quebra em 2 Cards separados (próprios + herdados); botão "Novo atributo" abre Sheet em vez de navegar.

- [ ] **Step 2: Não commitar ainda.**

---

## Task 9: Atualizar `[id]/edit/page.tsx` — busca server-side de atributos

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/[id]/edit/page.tsx`

- [ ] **Step 1: Reescrever página com busca de próprios + herdados + capabilities**

Conteúdo completo:

```tsx
import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { count, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { CategoryAttributesPanel } from "../../_components/category-attributes-panel";
import { CategoryForm } from "../../_components/category-form";
import { getCategory, listCategories } from "../../actions";
import type {
	InheritedRow,
	OwnRow,
} from "../../_components/attributes-table";

export const dynamic = "force-dynamic";

interface PageProps {
	params: Promise<{ id: string }>;
}

async function loadAttributeRows(
	currentCategoryId: string
): Promise<{ inheritedRows: InheritedRow[]; ownRows: OwnRow[] }> {
	// Cadeia de ancestrais
	const [self] = await db
		.select({ id: category.id, parentId: category.parentId })
		.from(category)
		.where(eq(category.id, currentCategoryId))
		.limit(1);
	if (!self) {
		return { inheritedRows: [], ownRows: [] };
	}

	const ancestors: { id: string; name: string }[] = [];
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
		ancestors.push({ id: row.id, name: row.name });
		cursor = row.parentId;
	}

	const ancestorIds = ancestors.map((a) => a.id);
	const ancestorNameById = new Map(ancestors.map((a) => [a.id, a.name]));

	const ids = [currentCategoryId, ...ancestorIds];
	const definitions: AttributeDefinition[] = await db
		.select()
		.from(attributeDefinition)
		.where(inArray(attributeDefinition.categoryId, ids));

	const ownDefs = definitions.filter(
		(d) => d.categoryId === currentCategoryId
	);
	const inheritedDefs = definitions.filter(
		(d) => d.categoryId !== currentCategoryId
	);

	// Usage counts somente para "próprios" (delete dialog usa esse número)
	const ownIds = ownDefs.map((d) => d.id);
	const usageMap = new Map<string, number>();
	if (ownIds.length > 0) {
		const usages = await db
			.select({
				attributeId: toolAttributeValue.attributeId,
				count: count(),
			})
			.from(toolAttributeValue)
			.where(inArray(toolAttributeValue.attributeId, ownIds))
			.groupBy(toolAttributeValue.attributeId);
		for (const u of usages) {
			usageMap.set(u.attributeId, Number(u.count));
		}
	}

	const ownRows: OwnRow[] = ownDefs
		.sort(
			(a, b) =>
				a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
		)
		.map((def) => ({ def, usageCount: usageMap.get(def.id) ?? 0 }));

	const inheritedRows: InheritedRow[] = inheritedDefs
		.sort(
			(a, b) =>
				a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
		)
		.map((def) => ({
			def,
			ownerCategoryId: def.categoryId,
			ownerCategoryName: ancestorNameById.get(def.categoryId) ?? "Origem",
		}));

	return { inheritedRows, ownRows };
}

export default async function EditCategoryPage({ params }: PageProps) {
	await requireCapabilityOrRedirect("categories.manage");
	const { id } = await params;
	const session = await requireCurrentSession();
	const role = session.user.role ?? null;

	const [existing, categories, attrRows] = await Promise.all([
		getCategory(id),
		listCategories(),
		loadAttributeRows(id),
	]);

	if (!existing) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Editar categoria</h1>
				<p className="text-muted-foreground text-sm">
					Caminho atual: <code className="text-xs">{existing.path}</code>
				</p>
			</div>
			<CategoryForm
				categories={categories}
				categoryId={id}
				defaultValues={{
					id: existing.id,
					name: existing.name,
					slug: existing.slug,
					parentId: existing.parentId,
					description: existing.description,
					imageUrl: existing.imageUrl,
					isActive: existing.isActive,
					sortOrder: existing.sortOrder,
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
}
```

> **Notas:** `count()` da drizzle-orm. Após migration, `def.categoryId` é `string` (não `string | null`) — TypeScript deve aceitar `ownerCategoryId: def.categoryId` direto.

- [ ] **Step 2: Não commitar ainda.**

---

## Task 10: Limpar `buildDefinitionsByCategory` (remover branch globais)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/attribute-helpers.ts`

- [ ] **Step 1: Substituir conteúdo do arquivo**

```ts
import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
} from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { asc } from "drizzle-orm";

/**
 * Returns a record keyed by category.id, where each value is the list of
 * AttributeDefinitions active for that category — definitions tied to the
 * category itself plus any of its ancestors.
 */
export async function buildDefinitionsByCategory(): Promise<
	Record<string, AttributeDefinition[]>
> {
	const [categories, definitions] = await Promise.all([
		db
			.select({
				id: category.id,
				parentId: category.parentId,
			})
			.from(category),
		db
			.select()
			.from(attributeDefinition)
			.orderBy(
				asc(attributeDefinition.sortOrder),
				asc(attributeDefinition.label)
			),
	]);

	const parentById = new Map(categories.map((c) => [c.id, c.parentId]));
	const defsByCategoryId = new Map<string, AttributeDefinition[]>();
	for (const d of definitions) {
		const list = defsByCategoryId.get(d.categoryId) ?? [];
		list.push(d);
		defsByCategoryId.set(d.categoryId, list);
	}

	const result: Record<string, AttributeDefinition[]> = {};
	for (const c of categories) {
		const chain: string[] = [c.id];
		let cur = c.parentId;
		while (cur) {
			chain.push(cur);
			cur = parentById.get(cur) ?? null;
		}
		const seen = new Set<string>();
		const list: AttributeDefinition[] = [];
		for (const ancestorId of chain) {
			for (const d of defsByCategoryId.get(ancestorId) ?? []) {
				if (!seen.has(d.id)) {
					list.push(d);
					seen.add(d.id);
				}
			}
		}
		list.sort(
			(a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
		);
		result[c.id] = list;
	}
	return result;
}
```

> **Diff:** removido `globalDefs`, removido o filtro `categoryId === null`, removido o loop final que adicionava globais.

- [ ] **Step 2: Não commitar ainda.**

---

## Task 11: Remover item "Atributos" da sidebar

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/app-sidebar.tsx:83-86`

- [ ] **Step 1: Apagar o bloco de Atributos**

Em `apps/web/src/app/dashboard/_components/app-sidebar.tsx`, remover as linhas 83–86:

```ts
				{
					label: "Atributos",
					href: "/dashboard/attributes" as Route,
				},
```

(O grupo "Catálogo" continua com Ferramentas, Categorias, Fornecedores, Filiais.)

- [ ] **Step 2: Não commitar ainda.**

---

## Task 12: Deletar a feature standalone de atributos

**Files:**
- Delete: `apps/web/src/app/dashboard/attributes/` (recursivo)

- [ ] **Step 1: Verificar que não há imports remanescentes**

```bash
rg "dashboard/attributes" apps/web/src --files-with-matches
```

Esperado: nenhuma ocorrência (todos os imports foram migrados nas Tasks 2 e 4).

- [ ] **Step 2: Apagar a pasta**

```bash
rm -rf apps/web/src/app/dashboard/attributes
```

- [ ] **Step 3: Não commitar ainda.**

---

## Task 13: Atualizar `apps/web/CLAUDE.md`

**Files:**
- Modify: `apps/web/CLAUDE.md` (seção "Convenções de UX em forms")

- [ ] **Step 1: Editar bullets sobre painel de atributos e specs dinâmicas**

Localizar o bullet começando com `**Painel de atributos por categoria:**` e substituí-lo por:

```md
- **Painel de atributos por categoria:** `/dashboard/categories/[id]/edit` mostra 2 cards separados — "Atributos próprios" (definidos na categoria atual; CRUD via Sheet lateral em `categories/_components/attribute-sheet.tsx`) e "Atributos herdados" (vindos de ancestrais; read-only, com link "Abrir →" para a categoria-dona). `attribute_definition.categoryId` é `NOT NULL` — não há mais o conceito de atributo global; a categoria-raiz "Geral" recebeu os anteriormente globais durante a migration.
```

E no bullet `**Specs dinâmicas:**`, ajustar a frase final:

```md
- **Specs dinâmicas:** form busca `definitionsByCategory[primaryCategoryId]` (server-side via `tools/_components/attribute-helpers.ts`). Inputs renderizados por `inputType` em `tools/_components/dynamic-specs-editor.tsx`. `buildDefinitionsByCategory` resolve a cadeia ancestral da categoria primary e une todas as `attribute_definition` aplicáveis (próprias + herdadas).
```

- [ ] **Step 2: Não commitar ainda.**

---

## Task 14: Verificação targeted

**Files:** (somente leitura)

- [ ] **Step 1: Typecheck do app web**

```bash
bun --cwd apps/web check-types
```

Esperado: 0 erros. Se aparecer erro em `attribute-form.tsx` por `Switch.onCheckedChange`, conferir docs do `@emach/ui` Switch (usa `onCheckedChange` ou `onChange`?). Se for outro nome, ajustar.

- [ ] **Step 2: Lint/format do escopo alterado**

```bash
bun fix
```

Esperado: rodar sem erros remanescentes.

- [ ] **Step 3: Iniciar dev server**

```bash
bun dev:web
```

(Roda em :3001. Aguardar "Ready" no output.)

- [ ] **Step 4: Smoke test 1 — Criar atributo dentro de categoria**

1. Abrir http://localhost:3001/dashboard/categories no browser.
2. Clicar em "Editar" numa categoria existente (ou criar uma nova primeiro).
3. Confirmar que aparecem 2 (ou 1) cards: "Atributos próprios" e "Atributos herdados" (este só se houver pais com atributos).
4. Clicar "+ Novo atributo".
5. Confirmar que Sheet abre pela direita com header "Novo atributo" e descrição "Categoria: <nome>".
6. Preencher: rótulo "RPM", tipo "Número", unidade "rpm", obrigatório ON.
7. Clicar "Criar atributo".
8. Esperado: Sheet fecha, toast de sucesso, tabela "Atributos próprios" mostra "RPM".

- [ ] **Step 5: Smoke test 2 — Editar atributo (slug editável)**

1. Na mesma categoria, clicar "Editar" na linha do atributo recém-criado.
2. Confirmar header "Editar atributo".
3. Confirmar que campo "Slug" agora é editável (não disabled).
4. Mudar a unidade para "RPM".
5. "Salvar alterações".
6. Esperado: Sheet fecha, toast, tabela atualiza.

- [ ] **Step 6: Smoke test 3 — Atributo do tipo `select`**

1. "+ Novo atributo".
2. Rótulo "Tipo de mandril", tipo "Lista de opções".
3. Confirmar que aparece bloco "Opções da lista".
4. Adicionar 2 opções: "Aperto rápido" / "Com chave".
5. Salvar.
6. Esperado: persiste sem erro.

- [ ] **Step 7: Smoke test 4 — Remover com warning**

1. Tentar usar esse atributo numa ferramenta primeiro (rota `/dashboard/tools/<id>/edit`, salvar valor para ele) — opcional se já houver dado real.
2. Voltar para a categoria e clicar "Remover" no atributo.
3. Esperado: AlertDialog mostra contagem (1+ ferramenta) e aviso de cascade.
4. Confirmar remoção.
5. Esperado: toast, atributo some da tabela.

- [ ] **Step 8: Smoke test 5 — Categoria filha vê herdados**

1. Criar/editar uma subcategoria da categoria onde estamos trabalhando.
2. Esperado: Card "Atributos herdados" aparece listando os atributos da categoria-pai com badge da origem e botão "Abrir →".
3. Clicar "Abrir →" — deve navegar para `/dashboard/categories/<pai>/edit`.

- [ ] **Step 9: Smoke test 6 — Form de tool ainda funciona**

1. Abrir `/dashboard/tools/new` ou editar uma tool existente.
2. Selecionar uma categoria como primary.
3. Esperado: o `dynamic-specs-editor` renderiza inputs para os atributos próprios + herdados dessa categoria (sem regressão).

- [ ] **Step 10: Verificar erros SSR via MCP devtools**

Se algum erro aparecer no smoke acima, usar `nextjs_call <port> get_errors` para extrair stack trace.

- [ ] **Step 11: Verificação final de imports residuais**

```bash
rg "dashboard/attributes" apps/web/src
rg "from .*attributes/schema" apps/web/src
rg "from .*attributes/actions" apps/web/src
```

Esperado: nenhuma ocorrência.

---

## Task 15: Commit final

**Files:** (todos os modificados nas Tasks 2–13)

- [ ] **Step 1: Pedir confirmação ao usuário com diff resumido**

```bash
git status
git diff --stat
```

Mostrar ao usuário e pedir aprovação.

- [ ] **Step 2: Commit**

Após aprovação:

```bash
git add apps/web/src/app/dashboard/categories/_lib \
        apps/web/src/app/dashboard/categories/_components \
        apps/web/src/app/dashboard/categories/[id]/edit/page.tsx \
        apps/web/src/app/dashboard/tools/_components/attribute-helpers.ts \
        apps/web/src/app/dashboard/_components/app-sidebar.tsx \
        apps/web/CLAUDE.md
git rm -r apps/web/src/app/dashboard/attributes
git commit -m "$(cat <<'EOF'
feat(categories): embedar CRUD de atributos no editor de categoria

- Remove pasta /dashboard/attributes standalone.
- Painel da categoria expõe 2 cards: próprios (CRUD via Sheet
  lateral) e herdados (read-only com link para a origem).
- Server actions migradas para categories/_lib com categoryId
  obrigatório.
- Form refatorado: categoryId vira prop fixa, onSuccess fecha
  o sheet em vez de redirect.
- Sidebar perde item "Atributos".
- buildDefinitionsByCategory perde branch de globais.
EOF
)"
```

---

## Self-Review Checklist

- [x] **Cobertura do spec:**
  - Schema `categoryId NOT NULL` + migration "Geral" → Task 1
  - Migrar `_lib/attribute-schema.ts` + import em category-form → Task 2
  - Server actions em `_lib/attribute-actions.ts` → Task 3
  - Form refatorado → Task 4
  - Delete dialog migrado → Task 5
  - Sheet wrapper → Task 6
  - Tabelas reusáveis → Task 7
  - Panel client component → Task 8
  - Page busca server-side → Task 9
  - `buildDefinitionsByCategory` limpo → Task 10
  - Sidebar limpa → Task 11
  - Pasta `attributes/` deletada → Task 12
  - CLAUDE.md atualizado → Task 13
  - Verificação targeted + smoke → Task 14
  - Commit → Task 15

- [x] **Sem placeholders:** todos os steps com código exato.

- [x] **Consistência de tipos:**
  - `createCategoryAttribute(categoryId, input)` (Task 3) ↔ usado em `attribute-form.tsx` (Task 4).
  - `updateCategoryAttribute(id, categoryId, input)` (Task 3) ↔ chamada coerente em Task 4.
  - `deleteCategoryAttribute(id, categoryId)` (Task 3) ↔ usado em Task 5 dialog.
  - `OwnRow`/`InheritedRow` (Task 7) ↔ `loadAttributeRows` retorna esses tipos (Task 9).
  - `AttributeSheetMode` (Task 6) ↔ usado em panel (Task 8).
  - `AttributeFormValues` agora **não** tem `categoryId` (Task 2) — coerente com form (Task 4) e actions (Task 3).
