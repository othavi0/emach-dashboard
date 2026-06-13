# Tab Variantes & preços — exclusão + status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ocultar variante do site, excluir variante específica e excluir a ferramenta (na tab Variantes & preços), com guards e mensagens tratadas.

**Architecture:** Coluna nova `visibleOnSite` em `tool_variant`. Guards de exclusão num helper puro testável; actions order-aware (pré-check de pedidos). UI: tabela editável ganha toggle de visibilidade + excluir inline (order-aware) + zona de perigo para excluir a ferramenta (realocada do header).

**Tech Stack:** Next 16 / React 19 / Drizzle (push-only) / base-ui (`Switch`, `AlertDialog`, `Tooltip`) / vitest (node).

Spec: `docs/superpowers/specs/2026-06-12-tab-variantes-exclusao-status-design.md`.

---

## File Structure

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Modificar | `packages/db/src/schema/tools.ts` | Coluna `visible_on_site` em `tool_variant`. |
| Modificar | `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts` | `orderedVariantIds` em `ToolDetail`. |
| Criar | `apps/web/src/app/dashboard/tools/_components/variant-deletion.ts` | `resolveVariantDeletion` (guards puros). |
| Criar | `apps/web/src/app/dashboard/tools/_components/__tests__/variant-deletion.test.ts` | Testes das guards. |
| Modificar | `apps/web/src/app/dashboard/tools/actions.ts` | `setVariantVisibility`, `deleteToolVariant`, `deleteTool` order-aware. |
| Modificar | `apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx` | Props opcionais `triggerLabel`/`disabledReason`. |
| Criar | `apps/web/src/app/dashboard/tools/_components/delete-variant-dialog.tsx` | Confirmação de exclusão de variante. |
| Modificar | `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx` | Reconstrução (toggle + excluir + zona de perigo). |
| Modificar | `apps/web/src/app/dashboard/tools/[id]/page.tsx` | Passar `canDelete`/`toolName`/`orderedVariantIds` à `VariantsTab`. |
| Modificar | `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx` | Remover `DeleteToolDialog` do header. |

Comandos: testes `bun --cwd apps/web test`; tipos `bun check-types`; lint `bun check`; schema `bun db:sync`.

---

### Task 1: Schema — `visibleOnSite` em `tool_variant`

**Files:** Modify `packages/db/src/schema/tools.ts`.

- [ ] **Step 1: Adicionar a coluna**

No `pgTable("tool_variant", { ... })`, após `isDefault: boolean("is_default").notNull().default(false),`, adicionar:

```ts
visibleOnSite: boolean("visible_on_site").notNull().default(true),
```

- [ ] **Step 2: Sincronizar o schema (push-only)**

Run: `bun db:sync`
Expected: aplica a coluna nova. Em caso de prompt de rename ambíguo (TTY), escolher **add column** (não rename). A coluna tem default `true`, então linhas existentes ficam visíveis.

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: sem erros (`ToolVariant`/`ToolDetailVariant` herdam o campo via `$inferSelect`).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/tools.ts
git commit -m "feat: tool_variant ganha visibleOnSite (visibilidade no site)"
```

> Cross-repo (ADR-0009): o app ecommerce passará a filtrar variantes por `visibleOnSite = true` quando o schema sincronizar via CI PR. Fora do escopo deste plano.

---

### Task 2: Dados — `orderedVariantIds`

**Files:** Modify `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts`.

- [ ] **Step 1: Importar `orderItem`**

No bloco de imports do topo, adicionar:

```ts
import { orderItem } from "@emach/db/schema/orders";
```

- [ ] **Step 2: Adicionar a query ao `Promise.all`**

A desestruturação atual é `const [categories, images, variants, attributes, stockRows] = await Promise.all([...])`. Trocar por `const [categories, images, variants, attributes, stockRows, orderedRows] = await Promise.all([...])` e adicionar, como **último** item do array (após a query de `stockRows`), a query:

```ts
db
	.selectDistinct({ variantId: orderItem.variantId })
	.from(orderItem)
	.innerJoin(toolVariant, eq(toolVariant.id, orderItem.variantId))
	.where(eq(toolVariant.toolId, id)),
```

- [ ] **Step 3: Expor no retorno + interface**

Na interface `ToolDetail`, adicionar:

```ts
orderedVariantIds: string[];
```

No objeto de retorno (onde já constam `variants`, `stockRows`, etc.), adicionar:

```ts
orderedVariantIds: orderedRows.map((r) => r.variantId),
```

- [ ] **Step 4: Verificar tipos**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts"
git commit -m "feat: tool detail expõe variantes com pedidos (orderedVariantIds)"
```

---

### Task 3: Helper `resolveVariantDeletion` (guards puros, TDD)

**Files:** Create `apps/web/src/app/dashboard/tools/_components/variant-deletion.ts` + `apps/web/src/app/dashboard/tools/_components/__tests__/variant-deletion.test.ts`.

- [ ] **Step 1: Teste que falha**

Criar `apps/web/src/app/dashboard/tools/_components/__tests__/variant-deletion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveVariantDeletion } from "../variant-deletion";

const sib = (id: string, sortOrder: number) => ({ id, sortOrder });

describe("resolveVariantDeletion", () => {
	it("bloqueia quando a variante tem pedidos", () => {
		const r = resolveVariantDeletion({
			variantId: "a",
			isDefault: false,
			hasOrders: true,
			siblings: [sib("a", 0), sib("b", 1)],
		});
		expect(r.allowed).toBe(false);
	});

	it("bloqueia quando é a única variante", () => {
		const r = resolveVariantDeletion({
			variantId: "a",
			isDefault: true,
			hasOrders: false,
			siblings: [sib("a", 0)],
		});
		expect(r.allowed).toBe(false);
	});

	it("permite e não reatribui quando não é a padrão", () => {
		const r = resolveVariantDeletion({
			variantId: "b",
			isDefault: false,
			hasOrders: false,
			siblings: [sib("a", 0), sib("b", 1)],
		});
		expect(r).toEqual({ allowed: true, reassignDefaultTo: null });
	});

	it("reatribui a padrão para a menor sortOrder restante", () => {
		const r = resolveVariantDeletion({
			variantId: "a",
			isDefault: true,
			hasOrders: false,
			siblings: [sib("c", 2), sib("a", 0), sib("b", 1)],
		});
		expect(r).toEqual({ allowed: true, reassignDefaultTo: "b" });
	});
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bun --cwd apps/web test variant-deletion`
Expected: FAIL (import não resolve).

- [ ] **Step 3: Implementar o helper**

Criar `apps/web/src/app/dashboard/tools/_components/variant-deletion.ts`:

```ts
interface VariantSibling {
	id: string;
	sortOrder: number;
}

interface VariantDeletionInput {
	hasOrders: boolean;
	isDefault: boolean;
	siblings: VariantSibling[];
	variantId: string;
}

export type VariantDeletionDecision =
	| { allowed: false; error: string }
	| { allowed: true; reassignDefaultTo: string | null };

/**
 * Decide se uma variante pode ser excluída e, se for a padrão, para qual
 * variante reatribuir a marca `isDefault` (a de menor sortOrder restante).
 * Pura — a action faz o IO (checar pedidos, deletar, reatribuir).
 */
export function resolveVariantDeletion({
	variantId,
	isDefault,
	hasOrders,
	siblings,
}: VariantDeletionInput): VariantDeletionDecision {
	if (hasOrders) {
		return {
			allowed: false,
			error:
				"Esta variante tem pedidos e não pode ser excluída. Oculte-a do site.",
		};
	}
	if (siblings.length <= 1) {
		return {
			allowed: false,
			error: "A ferramenta precisa de ao menos uma variante.",
		};
	}
	let reassignDefaultTo: string | null = null;
	if (isDefault) {
		const remaining = siblings
			.filter((s) => s.id !== variantId)
			.sort((a, b) => a.sortOrder - b.sortOrder);
		reassignDefaultTo = remaining[0]?.id ?? null;
	}
	return { allowed: true, reassignDefaultTo };
}
```

- [ ] **Step 4: Rodar e confirmar passa**

Run: `bun --cwd apps/web test variant-deletion`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/variant-deletion.ts apps/web/src/app/dashboard/tools/_components/__tests__/variant-deletion.test.ts
git commit -m "feat: helper resolveVariantDeletion (guards de exclusão)"
```

---

### Task 4: Server actions

**Files:** Modify `apps/web/src/app/dashboard/tools/actions.ts`.

Contexto: o arquivo já importa `db`, `tool`, `toolImage`, `toolVariant`, `{ and, eq, inArray, sql }` de `drizzle-orm`, `revalidatePath`, `z`, `logger`, `requireCapability`, `errorMessage`, `ActionResult`, e `TOOLS_PATH = "/dashboard/tools"`.

- [ ] **Step 1: Imports adicionais**

Adicionar `asc` ao import de `drizzle-orm` (`import { and, asc, eq, inArray, sql } from "drizzle-orm";`), o `orderItem` e o helper:

```ts
import { orderItem } from "@emach/db/schema/orders";
```

```ts
import { resolveVariantDeletion } from "./_components/variant-deletion";
```

- [ ] **Step 2: `setVariantVisibility`**

Adicionar:

```ts
const setVariantVisibilitySchema = z.object({
	variantId: z.string().min(1),
	visible: z.boolean(),
});

export async function setVariantVisibility(input: {
	variantId: string;
	visible: boolean;
}): Promise<ActionResult<{ warning?: "default_hidden" }>> {
	const parsed = setVariantVisibilitySchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	await requireCapability("tools.update");

	try {
		const { variantId, visible } = parsed.data;
		const [v] = await db
			.select({
				toolId: toolVariant.toolId,
				isDefault: toolVariant.isDefault,
			})
			.from(toolVariant)
			.where(eq(toolVariant.id, variantId));
		if (!v) {
			return { ok: false, error: "Variante não encontrada" };
		}

		await db
			.update(toolVariant)
			.set({ visibleOnSite: visible, updatedAt: new Date() })
			.where(eq(toolVariant.id, variantId));

		revalidatePath(`/dashboard/tools/${v.toolId}`);
		revalidatePath(TOOLS_PATH);

		const warning =
			!visible && v.isDefault ? ("default_hidden" as const) : undefined;
		return { ok: true, data: { warning } };
	} catch (error) {
		logger.error("setVariantVisibility falhou", error);
		return { ok: false, error: "Não foi possível atualizar a visibilidade" };
	}
}
```

- [ ] **Step 3: `deleteToolVariant`**

Adicionar:

```ts
const deleteVariantSchema = z.object({ variantId: z.string().min(1) });

export async function deleteToolVariant(input: {
	variantId: string;
}): Promise<ActionResult<{ reassignedDefaultSku?: string }>> {
	const parsed = deleteVariantSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	await requireCapability("tools.delete");

	try {
		const { variantId } = parsed.data;
		const [v] = await db
			.select({
				toolId: toolVariant.toolId,
				isDefault: toolVariant.isDefault,
			})
			.from(toolVariant)
			.where(eq(toolVariant.id, variantId));
		if (!v) {
			return { ok: false, error: "Variante não encontrada" };
		}

		const [ordered] = await db
			.select({ n: sql<number>`count(*)::int` })
			.from(orderItem)
			.where(eq(orderItem.variantId, variantId));

		const siblings = await db
			.select({ id: toolVariant.id, sortOrder: toolVariant.sortOrder })
			.from(toolVariant)
			.where(eq(toolVariant.toolId, v.toolId))
			.orderBy(asc(toolVariant.sortOrder));

		const decision = resolveVariantDeletion({
			variantId,
			isDefault: v.isDefault,
			hasOrders: (ordered?.n ?? 0) > 0,
			siblings,
		});
		if (!decision.allowed) {
			return { ok: false, error: decision.error };
		}

		await db.transaction(async (tx) => {
			await tx.delete(toolVariant).where(eq(toolVariant.id, variantId));
			if (decision.reassignDefaultTo) {
				await tx
					.update(toolVariant)
					.set({ isDefault: true, updatedAt: new Date() })
					.where(eq(toolVariant.id, decision.reassignDefaultTo));
			}
		});

		let reassignedDefaultSku: string | undefined;
		if (decision.reassignDefaultTo) {
			const [nd] = await db
				.select({ sku: toolVariant.sku })
				.from(toolVariant)
				.where(eq(toolVariant.id, decision.reassignDefaultTo));
			reassignedDefaultSku = nd?.sku;
		}

		revalidatePath(`/dashboard/tools/${v.toolId}`);
		revalidatePath(TOOLS_PATH);
		return { ok: true, data: { reassignedDefaultSku } };
	} catch (error) {
		logger.error("deleteToolVariant falhou", error);
		return { ok: false, error: "Não foi possível excluir a variante" };
	}
}
```

- [ ] **Step 4: `deleteTool` order-aware**

Na função `deleteTool` existente, **antes** do bloco `try { await db.delete(tool)... }` (após carregar `toolRow` e `urls`), inserir o pré-check:

```ts
const [orderedForTool] = await db
	.select({ n: sql<number>`count(*)::int` })
	.from(orderItem)
	.innerJoin(toolVariant, eq(toolVariant.id, orderItem.variantId))
	.where(eq(toolVariant.toolId, id));
if ((orderedForTool?.n ?? 0) > 0) {
	return {
		ok: false,
		error:
			"Esta ferramenta tem pedidos e não pode ser excluída. Oculte-a do site (visibilidade) em vez disso.",
	};
}
```

- [ ] **Step 5: Verificar**

Run: `bun check-types`
Expected: sem erros.
Run: `bun --cwd apps/web test variant-deletion`
Expected: PASS (regressão).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/tools/actions.ts
git commit -m "feat: actions de visibilidade e exclusão de variante (order-aware)"
```

---

### Task 5: `DeleteToolDialog` — botão rotulado + order-aware

**Files:** Modify `apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx`.

Objetivo: além do trigger de ícone atual, suportar um botão rotulado e um estado desabilitado com motivo (tooltip). Backward-compatible (sem props novas = comportamento atual).

- [ ] **Step 1: Estender props + trigger**

Substituir a interface e o início do componente. Adicionar imports de `Tooltip` no topo:

```tsx
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
```

Trocar a interface:

```tsx
interface DeleteToolDialogProps {
	disabledReason?: string | null;
	toolId: string;
	toolName: string;
	triggerLabel?: string;
}
```

Atualizar a assinatura: `export function DeleteToolDialog({ toolId, toolName, triggerLabel, disabledReason }: DeleteToolDialogProps) {`.

Logo após os hooks (`const [open...]`, `const [isPending...]`), montar o trigger condicional e o caso desabilitado:

```tsx
if (disabledReason) {
	return (
		<TooltipProvider delay={200}>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button disabled size="sm" variant="outline">
							{triggerLabel ? (
								<>
									<Trash2 aria-hidden className="mr-1.5 size-3.5" />
									{triggerLabel}
								</>
							) : (
								<Trash2 aria-hidden className="size-3.5" />
							)}
						</Button>
					}
				/>
				<TooltipContent>{disabledReason}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
```

Trocar o `<AlertDialogTrigger ...>` para refletir o `triggerLabel`:

```tsx
<AlertDialogTrigger
	aria-label={`Remover ferramenta ${toolName}`}
	render={
		triggerLabel ? (
			<Button size="sm" variant="outline" />
		) : (
			<Button size="icon-sm" variant="destructive" />
		)
	}
>
	{triggerLabel ? (
		<>
			<Trash2 aria-hidden className="mr-1.5 size-3.5" />
			{triggerLabel}
		</>
	) : (
		<Trash2 aria-hidden className="size-3.5" />
	)}
</AlertDialogTrigger>
```

(Resto do componente — `AlertDialogContent`, `handleConfirm` — inalterado.)

- [ ] **Step 2: Verificar**

Run: `bun check-types`
Expected: sem erros.
Run: `bun check apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx`
Expected: sem erros (atenção a ternário aninhado — os usados aqui são em posição de filho JSX, permitidos; se o lint reclamar, extrair o conteúdo do botão numa const).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx
git commit -m "feat: DeleteToolDialog aceita botão rotulado e estado desabilitado"
```

---

### Task 6: `DeleteVariantDialog`

**Files:** Create `apps/web/src/app/dashboard/tools/_components/delete-variant-dialog.tsx`.

- [ ] **Step 1: Criar o componente**

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
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteToolVariant } from "../actions";

interface DeleteVariantDialogProps {
	variantId: string;
	variantSku: string;
}

export function DeleteVariantDialog({
	variantId,
	variantSku,
}: DeleteVariantDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deleteToolVariant({ variantId });
			if (result.ok) {
				const reassigned = result.data.reassignedDefaultSku;
				toast.success(
					reassigned
						? `Variante excluída. Padrão reatribuída para ${reassigned}.`
						: "Variante excluída"
				);
				setOpen(false);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				aria-label={`Excluir variante ${variantSku}`}
				render={<Button size="icon-sm" variant="ghost" />}
			>
				<Trash2 aria-hidden className="size-3.5 text-destructive" />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Excluir variante?</AlertDialogTitle>
					<AlertDialogDescription>
						A variante <strong>{variantSku}</strong> e seus estoques por filial
						serão removidos permanentemente. Esta ação não pode ser desfeita.
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
								<Spinner /> Excluindo…
							</>
						) : (
							"Excluir"
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
```

- [ ] **Step 2: Verificar**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/delete-variant-dialog.tsx
git commit -m "feat: DeleteVariantDialog (confirmação de exclusão de variante)"
```

---

### Task 7: Reconstruir `variants-tab.tsx` + wiring na page

**Files:** Modify `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx` + `apps/web/src/app/dashboard/tools/[id]/page.tsx`.

- [ ] **Step 1: Reescrever `variants-tab.tsx`**

Substituir TODO o conteúdo por:

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Switch } from "@emach/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { CheckCircle2, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DeleteToolDialog } from "../../_components/delete-tool-dialog";
import { DeleteVariantDialog } from "../../_components/delete-variant-dialog";
import { VOLTAGE_OPTIONS } from "../../_components/tool-schema";
import {
	setDefaultToolVariant,
	setVariantVisibility,
	updateToolVariant,
} from "../../actions";
import type { ToolDetailVariant } from "../_lib/tool-detail-data";

interface VariantsTabProps {
	canDelete: boolean;
	canMutate: boolean;
	orderedVariantIds: string[];
	toolId: string;
	toolName: string;
	variants: ToolDetailVariant[];
}

interface RowState {
	costAmount: string;
	priceAmount: string;
	sku: string;
	voltage: string | null;
}

function makeRowState(v: ToolDetailVariant): RowState {
	return {
		sku: v.sku,
		voltage: v.voltage,
		priceAmount: v.priceAmount,
		costAmount: v.costAmount ?? "",
	};
}

function isDirty(initial: RowState, current: RowState): boolean {
	return (
		initial.sku !== current.sku ||
		initial.voltage !== current.voltage ||
		initial.priceAmount !== current.priceAmount ||
		initial.costAmount !== current.costAmount
	);
}

export function VariantsTab({
	variants,
	toolId,
	toolName,
	canMutate,
	canDelete,
	orderedVariantIds,
}: VariantsTabProps) {
	if (variants.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Nenhuma variante cadastrada.
			</p>
		);
	}

	if (!canMutate) {
		return <VariantsReadOnly variants={variants} />;
	}

	const orderedSet = new Set(orderedVariantIds);
	const toolHasOrders = orderedVariantIds.length > 0;

	return (
		<TooltipProvider delay={200}>
			<div className="flex flex-col gap-6">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>SKU</TableHead>
							<TableHead>Voltagem</TableHead>
							<TableHead className="text-right">Preço (R$)</TableHead>
							<TableHead className="text-right">Custo (R$)</TableHead>
							<TableHead className="text-center">Padrão</TableHead>
							<TableHead>Visível no site</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{variants.map((v) => (
							<EditableRow
								canDelete={canDelete}
								hasOrders={orderedSet.has(v.id)}
								isOnlyVariant={variants.length === 1}
								key={v.id}
								toolId={toolId}
								variant={v}
							/>
						))}
					</TableBody>
				</Table>

				{canDelete && (
					<div className="rounded-[10px] border border-destructive/40 bg-destructive/5 p-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="font-medium text-destructive text-sm">
									Excluir ferramenta
								</p>
								<p className="text-muted-foreground text-xs">
									Remove a ferramenta e todas as variantes. Não pode ser
									desfeito.
								</p>
							</div>
							<DeleteToolDialog
								disabledReason={
									toolHasOrders
										? "Esta ferramenta tem pedidos e não pode ser excluída. Oculte-a do site."
										: null
								}
								toolId={toolId}
								toolName={toolName}
								triggerLabel="Excluir ferramenta"
							/>
						</div>
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}

interface EditableRowProps {
	canDelete: boolean;
	hasOrders: boolean;
	isOnlyVariant: boolean;
	toolId: string;
	variant: ToolDetailVariant;
}

function EditableRow({
	variant,
	toolId,
	canDelete,
	hasOrders,
	isOnlyVariant,
}: EditableRowProps) {
	const initial = makeRowState(variant);
	const [state, setState] = useState<RowState>(initial);
	const [savedTick, setSavedTick] = useState(false);
	const [pending, startTransition] = useTransition();
	const [defaultPending, startDefaultTransition] = useTransition();
	const [visiblePending, startVisibleTransition] = useTransition();
	const dirty = isDirty(initial, state);

	function handleSave() {
		let costAmountValue: string | null | undefined;
		if (state.costAmount === initial.costAmount) {
			costAmountValue = undefined;
		} else if (state.costAmount === "") {
			costAmountValue = null;
		} else {
			costAmountValue = state.costAmount;
		}
		startTransition(async () => {
			const result = await updateToolVariant({
				variantId: variant.id,
				sku: state.sku === initial.sku ? undefined : state.sku,
				voltage:
					state.voltage === initial.voltage
						? undefined
						: (state.voltage as (typeof VOLTAGE_OPTIONS)[number] | null),
				priceAmount:
					state.priceAmount === initial.priceAmount
						? undefined
						: state.priceAmount,
				costAmount: costAmountValue,
			});
			if (result.ok) {
				toast.success("Variante atualizada");
				setSavedTick(true);
				setTimeout(() => setSavedTick(false), 1800);
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleSetDefault() {
		if (variant.isDefault) {
			return;
		}
		startDefaultTransition(async () => {
			const result = await setDefaultToolVariant({
				toolId,
				variantId: variant.id,
			});
			if (result.ok) {
				toast.success("Variante padrão atualizada");
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleToggleVisibility(visible: boolean) {
		startVisibleTransition(async () => {
			const result = await setVariantVisibility({
				variantId: variant.id,
				visible,
			});
			if (result.ok) {
				if (result.data.warning === "default_hidden") {
					toast.warning(
						"A variante padrão está oculta do site. Defina outra como padrão visível."
					);
				} else {
					toast.success(visible ? "Variante visível no site" : "Variante oculta");
				}
			} else {
				toast.error(result.error);
			}
		});
	}

	let saveControl: React.ReactNode = null;
	if (dirty) {
		saveControl = (
			<Button disabled={pending} onClick={handleSave} size="sm">
				{pending ? "Salvando…" : "Salvar"}
			</Button>
		);
	} else if (savedTick) {
		saveControl = (
			<span className="inline-flex items-center gap-1 text-success text-xs">
				<CheckCircle2 className="size-3.5" /> Salvo
			</span>
		);
	}

	let deleteControl: React.ReactNode = null;
	if (canDelete) {
		if (isOnlyVariant) {
			deleteControl = (
				<DisabledDeleteIcon reason="A ferramenta precisa de ao menos uma variante." />
			);
		} else if (hasOrders) {
			deleteControl = (
				<DisabledDeleteIcon reason="Tem pedidos — não pode excluir. Oculte do site." />
			);
		} else {
			deleteControl = (
				<DeleteVariantDialog variantId={variant.id} variantSku={variant.sku} />
			);
		}
	}

	return (
		<TableRow>
			<TableCell>
				<Input
					className="h-8 font-mono text-xs"
					onChange={(e) => setState({ ...state, sku: e.target.value })}
					value={state.sku}
				/>
			</TableCell>
			<TableCell>
				<Select
					onValueChange={(value) =>
						setState({ ...state, voltage: value === "_none_" ? null : value })
					}
					value={state.voltage ?? "_none_"}
				>
					<SelectTrigger className="h-8 w-[120px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="_none_">—</SelectItem>
						{VOLTAGE_OPTIONS.map((opt) => (
							<SelectItem key={opt} value={opt}>
								{opt}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</TableCell>
			<TableCell className="text-right">
				<Input
					className="h-8 text-right tabular-nums"
					inputMode="decimal"
					onChange={(e) => setState({ ...state, priceAmount: e.target.value })}
					placeholder="0.00"
					value={state.priceAmount}
				/>
			</TableCell>
			<TableCell className="text-right">
				<Input
					className="h-8 text-right tabular-nums"
					inputMode="decimal"
					onChange={(e) => setState({ ...state, costAmount: e.target.value })}
					placeholder="0.00"
					value={state.costAmount}
				/>
			</TableCell>
			<TableCell className="text-center">
				<input
					checked={variant.isDefault}
					className="size-4 accent-primary"
					disabled={defaultPending}
					name={`default-${toolId}`}
					onChange={handleSetDefault}
					type="radio"
				/>
			</TableCell>
			<TableCell>
				<div className="flex items-center gap-2">
					<Switch
						checked={variant.visibleOnSite}
						disabled={visiblePending}
						onCheckedChange={handleToggleVisibility}
						size="sm"
					/>
					<Badge variant={variant.visibleOnSite ? "success" : "secondary"}>
						{variant.visibleOnSite ? "Ativa" : "Oculta"}
					</Badge>
				</div>
			</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end gap-2">
					{saveControl}
					{deleteControl}
				</div>
			</TableCell>
		</TableRow>
	);
}

function DisabledDeleteIcon({ reason }: { reason: string }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button disabled size="icon-sm" variant="ghost">
						<Lock aria-hidden className="size-3.5 text-muted-foreground" />
					</Button>
				}
			/>
			<TooltipContent>{reason}</TooltipContent>
		</Tooltip>
	);
}

function VariantsReadOnly({ variants }: { variants: ToolDetailVariant[] }) {
	const PRICE = new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
	const fmt = (v: string | null) =>
		v === null ? "—" : PRICE.format(Number(v));

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>SKU</TableHead>
					<TableHead>Voltagem</TableHead>
					<TableHead className="text-right">Preço</TableHead>
					<TableHead className="text-right">Custo</TableHead>
					<TableHead className="text-center">Padrão</TableHead>
					<TableHead>Visível no site</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{variants.map((v) => (
					<TableRow key={v.id}>
						<TableCell className="font-mono text-xs">{v.sku}</TableCell>
						<TableCell>{v.voltage ?? "—"}</TableCell>
						<TableCell className="text-right tabular-nums">
							{fmt(v.priceAmount)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{fmt(v.costAmount)}
						</TableCell>
						<TableCell className="text-center">
							{v.isDefault ? (
								<CheckCircle2
									aria-label="Variante padrão"
									className="inline size-3.5 text-primary"
								/>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						<TableCell>
							<Badge variant={v.visibleOnSite ? "success" : "secondary"}>
								{v.visibleOnSite ? "Ativa" : "Oculta"}
							</Badge>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
```

- [ ] **Step 2: Wiring na page**

Em `apps/web/src/app/dashboard/tools/[id]/page.tsx`, no render do `<VariantsTab>` (passa hoje `canMutate`, `toolId`, `variants`), adicionar `canDelete`, `toolName` e `orderedVariantIds`:

```tsx
<VariantsTab
	canDelete={canDelete}
	canMutate={canMutate}
	orderedVariantIds={detail.orderedVariantIds}
	toolId={detail.tool.id}
	toolName={detail.tool.name}
	variants={detail.variants}
/>
```

(`canDelete` já é computado na page — `const canDelete = can(role, "tools.delete")`.)

- [ ] **Step 3: Verificar**

Run: `bun check-types`
Expected: sem erros.
Run: `bun check`
Expected: sem novos erros nos arquivos tocados.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx" "apps/web/src/app/dashboard/tools/[id]/page.tsx"
git commit -m "feat: tab variantes com visibilidade, exclusão e zona de perigo"
```

---

### Task 8: Remover o delete da ferramenta do header

**Files:** Modify `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx`.

Hoje (após a refator anterior), o componente renderiza `DeleteToolDialog` quando `canDelete` e o botão "Editar ferramenta" na Visão geral. O delete agora vive na tab Variantes & preços, então **remover** o `DeleteToolDialog` daqui.

- [ ] **Step 1: Remover o dialog e a prop `canDelete`**

Substituir o conteúdo por:

```tsx
import { buttonVariants } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import Link from "next/link";

interface ToolDetailActionsProps {
	canMutate: boolean;
	tab: string;
	toolId: string;
}

/**
 * Ação contextual do header. "Editar ferramenta" aparece só na Visão geral
 * (edição é form grande → página `/edit`). Excluir a ferramenta vive na tab
 * Variantes & preços (zona de perigo). Ajuste de estoque é pelo drawer da aba.
 */
export function ToolDetailActions({
	tab,
	toolId,
	canMutate,
}: ToolDetailActionsProps) {
	if (!(canMutate && tab === "visao-geral")) {
		return null;
	}
	return (
		<Link
			className={buttonVariants({ size: "sm", variant: "default" })}
			href={`/dashboard/tools/${toolId}/edit`}
		>
			<Pencil aria-hidden className="mr-1.5 size-3.5" />
			Editar ferramenta
		</Link>
	);
}
```

- [ ] **Step 2: Limpar o uso na page**

Em `apps/web/src/app/dashboard/tools/[id]/page.tsx`, no `<ToolDetailActions>`, **remover** a prop `canDelete={canDelete}` (a action não recebe mais). Manter `canMutate`, `tab`, `toolId`, `toolName`? — `ToolDetailActions` não usa mais `toolName`; remover `toolName` também se estiver sendo passada. Conferir as props passadas e deixar só `canMutate`, `tab`, `toolId`.

`canDelete` continua sendo usado (agora vai pra `VariantsTab`), então **não** remover a linha `const canDelete = ...`.

- [ ] **Step 3: Verificar**

Run: `bun check-types`
Expected: sem erros (sem variável/prop órfã).
Run: `bun check`
Expected: sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx" "apps/web/src/app/dashboard/tools/[id]/page.tsx"
git commit -m "refactor: remove excluir ferramenta do header (vai pra variantes)"
```

---

### Task 9: Verificação final (smoke visual)

**Files:** nenhum.

- [ ] **Step 1: Garantir o dev server na 3006**

Se não estiver no ar: `cd apps/web && ./node_modules/.bin/next dev --port 3006 > /tmp/dev-here-3006.log 2>&1` e aguardar o bind.

- [ ] **Step 2: Suíte + tipos + lint**

Run: `bun check-types` → 6/6.
Run: `bun --cwd apps/web test variant-deletion` → PASS.
Run: `bun check` → sem novos erros.

- [ ] **Step 3: Smoke na tab Variantes & preços (Furadeira `b3be9615-…`)**

Abrir `http://localhost:3006/dashboard/tools/b3be9615-35e4-4849-8ad2-c1cb821d4cf9?tab=variantes`. Confirmar:
- Coluna "Visível no site" com Switch + badge Ativa/Oculta; alternar reflete o badge (toast).
- Coluna de ação: variante sem pedidos → lixeira (abre confirmação); variante com pedidos → cadeado com tooltip; com 1 variante só → cadeado "precisa ≥1".
- Zona de perigo com "Excluir ferramenta" (desabilitado + tooltip se a ferramenta tiver pedidos).
- Header da ferramenta **sem** o botão de lixeira (só "Editar ferramenta" na Visão geral).
- Console sem erros.

- [ ] **Step 4: Confirmar guard de exclusão real (variante sem pedidos)**

Numa ferramenta de teste com ≥2 variantes e sem pedidos, excluir uma variante não-padrão → some da lista; excluir a padrão → outra vira padrão (toast "Padrão reatribuída para …").

> ⚠️ Banco compartilhado de produção: só excluir variantes de uma ferramenta de teste, nunca dados reais em uso.

---

## Notas de execução

- **Reads antes de Edit;** rodar `bun check-types` antes de cada commit.
- **Hook `bun fix`** reordena imports/campos após Write/Edit — re-ler se um Edit falhar por `old_string`.
- **`bun db:sync` (Task 1)** mexe no banco compartilhado; a coluna tem default `true` (não-destrutivo).
- **Ordem:** Task 2 e Task 4 importam `orderItem`; Task 4 usa o helper da Task 3 — manter a ordem.
- **Pool Supabase:** se o dev server saturar (`EMAXCONNSESSION`), reiniciar o server libera as conexões (config server-side, não regressão).
