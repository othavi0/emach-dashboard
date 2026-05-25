# Tools × Stock Unification — Slice 3: tab Variantes & preços editável inline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Substituir a tabela read-only de variantes (`VariantsTab` da Slice 2) por uma tabela com edição inline: preço, custo, voltagem e SKU editáveis por linha; "Padrão" como radio que atomicamente troca a flag; save por linha com feedback otimista.

**Architecture:** 2 server actions novas atômicas (`updateToolVariant`, `setDefaultToolVariant`) em `apps/web/src/app/dashboard/tools/actions.ts`. `VariantsTab` vira client component com state local por linha (dirty tracking) e `useTransition` pro pending.

**Tech:** Drizzle, Zod, React 19, `useTransition`, shadcn Table/Input/Select.

**Spec:** `docs/superpowers/specs/2026-05-25-tools-stock-unification-design.md` § Tab Variantes & preços.

## Escopo

**Dentro:**
- `updateToolVariant(variantId, fields)` — partial update (SKU, voltagem, preço, custo).
- `setDefaultToolVariant(toolId, variantId)` — atomic flip do flag `isDefault` (unset todos os outros).
- `VariantsTab` editável: inputs por célula, save per row via botão, radio "Padrão" salva imediato.

**Fora desta slice:**
- **Criar nova variante** — fica via `/tools/[id]/edit` (form completo). Botão "+ Variante" aparece **disabled** com tooltip "use Editar".
- **Deletar variante** — fica via form completo. Coluna "ações" não inclui delete; tooltip "use Editar pra remover".
- Resolução do quirk do `audit.read`.

Razão: criar/deletar requer cuidado com FK (`stockMovement`, `stockLevel`). Resolver depois com mais espaço.

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/tools/actions.ts` | **Modificar** | Adiciona `updateToolVariant` e `setDefaultToolVariant` (no fim do arquivo) |
| `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` | **Modificar** | Adiciona `updateVariantSchema` (subset partial-friendly) |
| `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx` | **Reescrever** | Vira client component editável com state por linha |

---

## Task 1: Server actions + schema

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`
- Modify: `apps/web/src/app/dashboard/tools/actions.ts`

### Steps

- [ ] **Step 1: Adicionar `updateVariantSchema` em `tool-schema.ts`** logo após `toolVariantSchema`:

```typescript
export const updateVariantSchema = z.object({
	variantId: z.string().min(1),
	sku: z.string().min(1).max(64).optional(),
	voltage: z.enum(VOLTAGE_OPTIONS).nullable().optional(),
	priceAmount: z
		.string()
		.regex(/^\d+(\.\d{1,2})?$/, "Preço inválido")
		.optional(),
	costAmount: z
		.string()
		.regex(/^\d+(\.\d{1,2})?$/, "Custo inválido")
		.nullable()
		.optional(),
});

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
```

- [ ] **Step 2: Adicionar as 2 actions no fim de `actions.ts`**. Estilo deve seguir o padrão `ActionResult` já usado em `updateTool`/`createTool` (com `"use server"` no topo, `requireCapability("tools.update")`, `logger.error` em catch, `revalidatePath`):

```typescript
import {
	updateVariantSchema,
	type UpdateVariantInput,
} from "./_components/tool-schema";

export async function updateToolVariant(
	input: UpdateVariantInput
): Promise<ActionResult> {
	const parsed = updateVariantSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Dados inválidos",
		};
	}

	await requireCapability("tools.update");

	try {
		const { variantId, ...fields } = parsed.data;
		// busca toolId pra revalidate
		const [v] = await db
			.select({ toolId: toolVariant.toolId })
			.from(toolVariant)
			.where(eq(toolVariant.id, variantId));

		if (!v) {
			return { ok: false, error: "Variante não encontrada" };
		}

		const updateFields: Record<string, unknown> = {};
		if (fields.sku !== undefined) updateFields.sku = fields.sku;
		if (fields.voltage !== undefined) updateFields.voltage = fields.voltage;
		if (fields.priceAmount !== undefined)
			updateFields.priceAmount = fields.priceAmount;
		if (fields.costAmount !== undefined)
			updateFields.costAmount = fields.costAmount;

		if (Object.keys(updateFields).length === 0) {
			return { ok: true, data: undefined };
		}

		updateFields.updatedAt = new Date();

		await db
			.update(toolVariant)
			.set(updateFields)
			.where(eq(toolVariant.id, variantId));

		revalidatePath(`/dashboard/tools/${v.toolId}`);
		revalidatePath("/dashboard/tools");

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateToolVariant falhou", { err: error });
		// SKU duplicado: erro de unique constraint do Postgres
		if (
			error instanceof Error &&
			error.message.toLowerCase().includes("unique")
		) {
			return { ok: false, error: "SKU já existe para outra variante" };
		}
		return { ok: false, error: "Não foi possível atualizar a variante" };
	}
}

const setDefaultVariantSchema = z.object({
	toolId: z.string().min(1),
	variantId: z.string().min(1),
});

export async function setDefaultToolVariant(input: {
	toolId: string;
	variantId: string;
}): Promise<ActionResult> {
	const parsed = setDefaultVariantSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}

	await requireCapability("tools.update");

	try {
		const { toolId, variantId } = parsed.data;
		await db.transaction(async (tx) => {
			await tx
				.update(toolVariant)
				.set({ isDefault: false, updatedAt: new Date() })
				.where(eq(toolVariant.toolId, toolId));
			await tx
				.update(toolVariant)
				.set({ isDefault: true, updatedAt: new Date() })
				.where(eq(toolVariant.id, variantId));
		});

		revalidatePath(`/dashboard/tools/${toolId}`);
		revalidatePath("/dashboard/tools");

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("setDefaultToolVariant falhou", { err: error });
		return { ok: false, error: "Não foi possível marcar como padrão" };
	}
}
```

**Atenção:** verifique se `logger`, `requireCapability`, `ActionResult`, `db`, `toolVariant`, `revalidatePath`, `eq` e `z` já estão importados no topo de `actions.ts`. Provavelmente sim — o arquivo já usa esses símbolos pras outras actions. Se faltar `updateVariantSchema` / `UpdateVariantInput` no import, adicione no bloco que já importa de `./_components/tool-schema`.

- [ ] **Step 3:** `bun check-types` → 0 erros.
- [ ] **Step 4:** Não commitar ainda — combinar com Task 2.

---

## Task 2: Reescrever `VariantsTab` como editor inline

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx`

### Contexto

Tab atual é read-only. Vamos transformar em editor inline com:
- Cada linha tem inputs editáveis (sem labels visíveis — placeholder ou inline).
- Estado local rastreia "dirty" por linha.
- Botão "Salvar" por linha aparece só quando dirty; chama `updateToolVariant`.
- Radio "Padrão" salva imediato no click (call `setDefaultToolVariant`); UI otimista.
- Botão "+ Variante" disabled com tooltip "Use 'Editar' pra adicionar/remover variantes" (slice futura).
- Toasts (sonner) pra feedback success/error.

### Conteúdo (reescrita completa)

Substituir **TODO** o conteúdo de `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx` por:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
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
import { CheckCircle2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
	setDefaultToolVariant,
	updateToolVariant,
} from "../../actions";
import { VOLTAGE_OPTIONS } from "../../_components/tool-schema";
import type { ToolDetailVariant } from "../_lib/tool-detail-data";

interface VariantsTabProps {
	canMutate: boolean;
	toolId: string;
	variants: ToolDetailVariant[];
}

interface RowState {
	sku: string;
	voltage: string | null;
	priceAmount: string;
	costAmount: string;
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

export function VariantsTab({ variants, toolId, canMutate }: VariantsTabProps) {
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

	return (
		<TooltipProvider delay={300}>
			<div className="flex flex-col gap-4">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>SKU</TableHead>
							<TableHead>Voltagem</TableHead>
							<TableHead className="text-right">Preço (R$)</TableHead>
							<TableHead className="text-right">Custo (R$)</TableHead>
							<TableHead className="text-center">Padrão</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{variants.map((v) => (
							<EditableRow key={v.id} toolId={toolId} variant={v} />
						))}
					</TableBody>
				</Table>

				<div className="flex justify-end">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button disabled size="sm" variant="outline">
									+ Variante
								</Button>
							}
						/>
						<TooltipContent>
							Use "Editar" no header para adicionar/remover variantes.
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</TooltipProvider>
	);
}

interface EditableRowProps {
	toolId: string;
	variant: ToolDetailVariant;
}

function EditableRow({ variant, toolId }: EditableRowProps) {
	const initial = makeRowState(variant);
	const [state, setState] = useState<RowState>(initial);
	const [savedTick, setSavedTick] = useState(false);
	const [pending, startTransition] = useTransition();
	const [defaultPending, startDefaultTransition] = useTransition();
	const dirty = isDirty(initial, state);

	function handleSave() {
		startTransition(async () => {
			const result = await updateToolVariant({
				variantId: variant.id,
				sku: state.sku !== initial.sku ? state.sku : undefined,
				voltage: state.voltage !== initial.voltage ? state.voltage : undefined,
				priceAmount:
					state.priceAmount !== initial.priceAmount
						? state.priceAmount
						: undefined,
				costAmount:
					state.costAmount !== initial.costAmount
						? state.costAmount === ""
							? null
							: state.costAmount
						: undefined,
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
		if (variant.isDefault) return;
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
						{VOLTAGE_OPTIONS.map((v) => (
							<SelectItem key={v} value={v}>
								{v}
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
			<TableCell className="text-right">
				{dirty ? (
					<Button
						disabled={pending}
						onClick={handleSave}
						size="sm"
					>
						{pending ? "Salvando…" : "Salvar"}
					</Button>
				) : savedTick ? (
					<span className="inline-flex items-center gap-1 text-success text-xs">
						<CheckCircle2 className="size-3.5" /> Salvo
					</span>
				) : null}
			</TableCell>
		</TableRow>
	);
}

function VariantsReadOnly({ variants }: { variants: ToolDetailVariant[] }) {
	const PRICE = new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
	const fmt = (v: string | null) => (v === null ? "—" : PRICE.format(Number(v)));

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>SKU</TableHead>
					<TableHead>Voltagem</TableHead>
					<TableHead className="text-right">Preço</TableHead>
					<TableHead className="text-right">Custo</TableHead>
					<TableHead className="text-center">Padrão</TableHead>
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
							{v.isDefault ? "●" : "—"}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
```

### Page.tsx: passar `toolId` e `canMutate` pra VariantsTab

- [ ] Em `apps/web/src/app/dashboard/tools/[id]/page.tsx`, atualizar a tab `variantes`:

```tsx
{
	value: "variantes",
	label: "Variantes & preços",
	content: (
		<VariantsTab
			canMutate={canMutate}
			toolId={detail.tool.id}
			variants={detail.variants}
		/>
	),
},
```

(Antes era `<VariantsTab variants={detail.variants} />`.)

- [ ] `bun check-types` → 0 erros.

- [ ] **Commit (Task 1 + 2 combinadas):**

```bash
git add apps/web/src/app/dashboard/tools/
git commit -m "feat(tools): editor inline de variantes (preço, custo, padrão)"
```

---

## Task 3: Smoke

- [ ] Login como super_admin, abrir `/dashboard/tools/[id]?tab=variantes`.
- [ ] Inputs editáveis aparecem (SKU, voltagem, preço, custo).
- [ ] Mudar preço → botão "Salvar" aparece. Click → toast "Variante atualizada" + tick "Salvo" por ~2s.
- [ ] Reload → preço persistiu.
- [ ] Click no radio "Padrão" de outra variante → toast "Variante padrão atualizada", radio move sem reload.
- [ ] Mudar SKU pra um valor que já existe → toast "SKU já existe para outra variante".
- [ ] Inserir preço inválido (`"abc"`) → toast "Preço inválido".
- [ ] Botão "+ Variante" disabled, tooltip aparece no hover.
- [ ] Login como user (sem `tools.update`) → tabela read-only (sem inputs).

## Riscos

1. **`updateToolVariant` SKU duplicado:** o erro vem do unique constraint do Postgres. O catch detecta string "unique" — funciona com mensagem em EN; se o DB estiver em PT, ajustar. Verificar em smoke.
2. **Numeric coercion:** `priceAmount` chega como string do form e do DB. Drizzle aceita string pra coluna numeric. Não converter pra Number — perde precisão.
3. **`useTransition` por linha:** cada `EditableRow` tem seu próprio transition state — não há global blocking. OK.
