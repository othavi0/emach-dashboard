# Fluxo de Estoque com Fornecedor por Entrada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover a proveniência do Fornecedor da Tool para a entrada de estoque (N:N derivado), separar as escritas de estoque do admin em três operações (Entrada/Baixa/Ajuste), e expor estoque geral + histórico (aba Estoque do fornecedor + ledger global).

**Architecture:** `stock_movement` ganha `supplier_id` (obrigatório em `entrada_compra`). A relação Fornecedor↔Tool passa a ser **derivada** das entradas — toda query do feature de fornecedor que hoje lê `tool.supplier_id` é reescrita para agregar movimentos. A UI de ajuste único vira três intenções. Por fim, `tool.supplier_id` é removido (drop coordenado com o e-commerce). Ver `docs/adr/0015-fornecedor-na-entrada-de-estoque.md` e CONTEXT.md (Inventory).

**Tech Stack:** Next 16 / React 19, Drizzle 0.45 (push-only, ADR-0006), Postgres/Supabase, Zod, server actions com `ActionResult<T>`, vitest (db mockado).

**Ordem é crítica:** schema aditivo → operações de escrita → migrar leitores para derivado → UI/ledger → **só então** remover `tool.supplier_id`. Nunca dropar a coluna antes de todos os leitores migrarem (Fase 6).

**Verificação canônica do projeto** (precede o TDD genérico — ver `apps/web/CLAUDE.md` e `packages/db/CLAUDE.md`): após cada task, `bun check-types`; antes de cada commit, `bun check` (ultracite); para schema/SQL/SSR, smoke runtime com `bun dev:web` + visitar a rota. `tsc` **não** pega SQL inválido em template nem coluna removida — o smoke é obrigatório onde indicado.

---

## File Structure

**Schema (packages/db):**
- `packages/db/src/schema/stock-movements.ts` — adicionar `supplierId` + index + CHECK `entrada_requires_supplier`.
- `packages/db/src/sql/triggers.sql` — (sem mudança; só referência).

**Server actions / data (apps/web):**
- `apps/web/src/app/dashboard/stock/_components/stock-movement-schema.ts` — **renomeia/expande** `stock-adjustment-schema.ts`: três schemas (entrada/baixa/ajuste).
- `apps/web/src/app/dashboard/stock/actions.ts` — novas actions `recordStockEntry`, `recordStockWriteOff`; `adjustStock` passa a ser só recontagem; queries de movimento ganham `supplierId`/`supplierName`.
- `apps/web/src/app/dashboard/stock/movements-data.ts` — **novo**: ledger global (query + filtros).
- `apps/web/src/app/dashboard/suppliers/data.ts` — reescreve `getSupplierDetail`/`getSupplierDetailKpis`/`getSupplierTableAggregates`/(novo) `getSupplierStockTools` para derivar das entradas.
- `apps/web/src/app/dashboard/suppliers/actions.ts` — `fetchSupplierToolsPage` → `fetchSupplierStockPage` (derivado).
- `apps/web/src/lib/suppliers.ts` — **novo**: `getActiveSuppliers()` (lista p/ o select de entrada).

**UI (apps/web):**
- `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` — três modos (Entrada/Baixa/Ajuste).
- `apps/web/src/app/dashboard/suppliers/[id]/_components/estoque-tab.tsx` — **novo** (substitui `tools-tab.tsx`).
- `apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-stock-infinite.tsx` — **novo** (substitui `supplier-tools-infinite.tsx`).
- `apps/web/src/app/dashboard/suppliers/[id]/page.tsx` — aba "Estoque" + remoção do deep-link `?supplierId=`.
- `apps/web/src/app/dashboard/stock/movements/page.tsx` — **novo**: ledger global.
- `apps/web/src/app/dashboard/stock/movements/_components/*` — filtros + lista infinita do ledger.
- Timelines: `tools/[id]/_components/activity-timeline.tsx`, `branches/[id]/_components/branch-activity-timeline.tsx` — render do fornecedor.

**Tool form (remoção do supplier — Fase 6):**
- `tools/_components/fields/identity-fields.tsx`, `tools/_components/tool-schema.ts`, `tools/_components/tool-form-state.ts`, `tools/_components/tool-form-steps.ts`, `tools/actions.ts`, `tools/[id]/edit/page.tsx`, `tools/[id]/_lib/tool-detail-data.ts`, `packages/db/src/queries/catalog.ts`, `packages/db/src/schema/tools.ts`.

---

## Fase 0 — Schema aditivo: `stock_movement.supplier_id`

### Task 0.1: Adicionar coluna, index e CHECK

**Files:**
- Modify: `packages/db/src/schema/stock-movements.ts`

- [ ] **Step 1: Importar `supplier` e adicionar a coluna + index + CHECK**

Em `stock-movements.ts`, adicionar o import e os campos. A coluna é nullable (entradas legadas e os demais motivos têm null); o CHECK garante que **novas** entradas tenham fornecedor. Como o e-commerce nunca escreve `entrada_compra`, o CHECK só afeta escritas do dashboard.

```typescript
// no topo, junto aos outros imports de schema:
import { supplier } from "./tools";

// dentro de pgTable("stock_movement", { ... }), após orderItemId:
		supplierId: text("supplier_id").references(() => supplier.id, {
			onDelete: "set null",
		}),
```

E no array de constraints (segundo argumento do `pgTable`), adicionar o index e o CHECK:

```typescript
		index("stock_movement_supplier_created_idx").on(
			table.supplierId,
			table.createdAt.desc()
		),
		check(
			"entrada_requires_supplier",
			sql`(${table.reason} <> 'entrada_compra') OR (${table.supplierId} IS NOT NULL)`
		),
```

- [ ] **Step 2: Adicionar a relação `supplier` no `stockMovementRelations`**

```typescript
// dentro de relations(stockMovement, ({ one }) => ({ ... })):
	supplier: one(supplier, {
		fields: [stockMovement.supplierId],
		references: [supplier.id],
	}),
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS (sem novos erros).

- [ ] **Step 4: Backfill defensivo de entradas legadas + aplicar schema**

Entradas pré-existentes têm `supplier_id` nulo e violariam o CHECK. Elas eram, na prática, ajustes (não havia fornecedor). Converter para `ajuste_inventario` antes de aplicar o CHECK. Rodar via psql/execute_sql no banco de dev:

```sql
UPDATE stock_movement
SET reason = 'ajuste_inventario'
WHERE reason = 'entrada_compra' AND supplier_id IS NULL;
```

Depois aplicar o schema:

Run: `bun db:sync`
Expected: coluna `supplier_id`, index e CHECK criados sem erro. Se o push pedir confirmação de coluna nova, confirmar (não-destrutivo).

- [ ] **Step 5: Confirmar o CHECK no banco**

Run (via execute_sql/psql): `SELECT conname FROM pg_constraint WHERE conname = 'entrada_requires_supplier';`
Expected: uma linha.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/stock-movements.ts
git commit -m "feat(db): stock_movement.supplier_id obrigatório em entrada_compra"
```

> **Coordenação e-commerce (ADR-0009):** a mudança em `schema/stock-movements.ts` dispara o PR de sync. O e-commerce só lê/escreve `saida_venda` (supplier null) — o CHECK não o afeta. Mencionar no PR de sync.

---

## Fase 1 — Schemas e server actions das três operações

### Task 1.1: Schemas de entrada/baixa/ajuste

**Files:**
- Create: `apps/web/src/app/dashboard/stock/_components/stock-movement-schema.ts`
- Modify (depois): consumidores do antigo `stock-adjustment-schema.ts`

- [ ] **Step 1: Criar o novo schema unificado**

Cria os três schemas. Entrada e baixa são **delta** (quantidade a somar/subtrair); ajuste é **alvo** (quantidade final). Mantém `STOCK_MOVEMENT_REASONS` (usado por filtros/labels).

```typescript
import { z } from "zod";

export const STOCK_MOVEMENT_REASONS = [
	"entrada_compra",
	"saida_venda",
	"ajuste_inventario",
	"perda",
	"outro",
] as const;
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

const variantBranch = {
	variantId: z.string().min(1, "Variante obrigatória"),
	branchId: z.string().min(1, "Filial obrigatória"),
};

// Entrada (+N): soma estoque; fornecedor obrigatório; sem custo.
export const stockEntrySchema = z.object({
	...variantBranch,
	quantity: z
		.int("Quantidade deve ser inteira")
		.min(1, "Quantidade deve ser maior que zero")
		.max(999_999, "Quantidade excede o limite permitido"),
	supplierId: z.string().min(1, "Fornecedor obrigatório na entrada"),
	note: z
		.string()
		.trim()
		.max(500, "Observação não pode exceder 500 caracteres")
		.optional(),
});
export type StockEntryInput = z.infer<typeof stockEntrySchema>;

// Baixa (−N): subtrai estoque; motivo perda|outro; sem fornecedor.
export const stockWriteOffReasons = ["perda", "outro"] as const;
export type StockWriteOffReason = (typeof stockWriteOffReasons)[number];

export const stockWriteOffSchema = z
	.object({
		...variantBranch,
		quantity: z
			.int("Quantidade deve ser inteira")
			.min(1, "Quantidade deve ser maior que zero")
			.max(999_999, "Quantidade excede o limite permitido"),
		reason: z.enum(stockWriteOffReasons),
		note: z
			.string()
			.trim()
			.max(500, "Observação não pode exceder 500 caracteres")
			.optional(),
	})
	.refine(
		(d) => d.reason !== "outro" || (typeof d.note === "string" && d.note.length > 0),
		{ path: ["note"], message: "Observação obrigatória quando motivo é 'Outro'" }
	);
export type StockWriteOffInput = z.infer<typeof stockWriteOffSchema>;

// Ajuste de inventário: quantidade-alvo (recontagem).
export const stockRecountSchema = z.object({
	...variantBranch,
	newQty: z
		.int("Quantidade deve ser inteira")
		.min(0, "Quantidade não pode ser negativa")
		.max(999_999, "Quantidade excede o limite permitido"),
	note: z
		.string()
		.trim()
		.max(500, "Observação não pode exceder 500 caracteres")
		.optional(),
});
export type StockRecountInput = z.infer<typeof stockRecountSchema>;
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/stock/_components/stock-movement-schema.ts
git commit -m "feat(stock): schemas de entrada/baixa/ajuste"
```

### Task 1.2: Server actions `recordStockEntry` e `recordStockWriteOff`; `adjustStock` vira recontagem

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/actions.ts`

- [ ] **Step 1: Extrair um helper transacional de movimento**

No topo de `actions.ts` (após os imports), adicionar um helper que faz o lock + update + insert de movimento, reusado pelas três operações. Substitui a lógica inline do `adjustStock`.

```typescript
import {
	stockEntrySchema,
	stockWriteOffSchema,
	stockRecountSchema,
	type StockEntryInput,
	type StockWriteOffInput,
	type StockRecountInput,
} from "./_components/stock-movement-schema";
import type { StockMovementReason } from "@emach/db/schema/stock-movements";

interface ApplyMovementArgs {
	variantId: string;
	branchId: string;
	/** quantidade final desejada (target). */
	newQty: number;
	reason: StockMovementReason;
	reasonNote: string | null;
	supplierId: string | null;
	actorId: string;
}

async function applyMovement(args: ApplyMovementArgs): Promise<AdjustStockSuccess> {
	return await db.transaction(async (tx) => {
		await tx
			.insert(stockLevel)
			.values({ variantId: args.variantId, branchId: args.branchId, quantity: 0, updatedAt: new Date() })
			.onConflictDoNothing({ target: [stockLevel.variantId, stockLevel.branchId] });

		const lockedRows = await tx
			.select({ quantity: stockLevel.quantity })
			.from(stockLevel)
			.where(and(eq(stockLevel.variantId, args.variantId), eq(stockLevel.branchId, args.branchId)))
			.for("update");

		const previousQty = lockedRows[0]?.quantity ?? 0;
		const delta = args.newQty - previousQty;
		if (delta === 0) {
			return { previousQty, newQty: args.newQty, delta, movementId: null };
		}

		await tx
			.update(stockLevel)
			.set({ quantity: args.newQty, updatedAt: new Date() })
			.where(and(eq(stockLevel.variantId, args.variantId), eq(stockLevel.branchId, args.branchId)));

		const movementId = crypto.randomUUID();
		await tx.insert(stockMovement).values({
			id: movementId,
			variantId: args.variantId,
			branchId: args.branchId,
			previousQty,
			newQty: args.newQty,
			delta,
			reason: args.reason,
			reasonNote: args.reasonNote,
			supplierId: args.supplierId,
			actorType: "user",
			actorId: args.actorId,
		});
		return { previousQty, newQty: args.newQty, delta, movementId };
	});
}

async function revalidateStockPaths(variantId: string, branchId: string): Promise<void> {
	const [variantRow] = await db
		.select({ toolId: toolVariant.toolId })
		.from(toolVariant)
		.where(eq(toolVariant.id, variantId))
		.limit(1);
	const toolId = variantRow?.toolId;
	revalidatePath("/dashboard/stock");
	revalidatePath("/dashboard/stock/movements");
	revalidatePath(`/dashboard/branches/${branchId}`);
	revalidatePath(`/dashboard/branches/${branchId}/stock`);
	if (toolId) {
		revalidatePath(`/dashboard/tools/${toolId}/stock`);
	}
	revalidatePath("/dashboard", "layout");
}
```

(`AdjustStockSuccess` passa a ter `newQty`; ajustar a interface existente para incluir `newQty: number`.)

- [ ] **Step 2: `recordStockEntry` (delta +N, fornecedor obrigatório)**

```typescript
export async function recordStockEntry(
	input: StockEntryInput
): Promise<ActionResult<AdjustStockSuccess>> {
	const session = await requireCapability("stock.adjust");
	const parsed = stockEntrySchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
	}
	const { variantId, branchId, quantity, supplierId, note } = parsed.data;
	try {
		// newQty = atual + quantity → calculado dentro do lock; passamos delta via target.
		const current = await currentQty(variantId, branchId);
		const result = await applyMovement({
			variantId, branchId,
			newQty: current + quantity,
			reason: "entrada_compra",
			reasonNote: note ?? null,
			supplierId,
			actorId: session.user.id,
		});
		await revalidateStockPaths(variantId, branchId);
		return { ok: true, data: result };
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
}
```

Onde `currentQty` é um helper de leitura (a quantidade dentro do lock recalcula o delta correto a partir do `previousQty` real, então passar `current + quantity` como alvo é seguro mesmo com concorrência — o lock garante `previousQty` atual e `delta` final = alvo − previousQty; em concorrência o alvo pode ficar levemente diferente, mas **para entrada queremos delta fixo**). **Correção:** para entrada/baixa o delta deve ser fixo, não alvo. Reescrever `applyMovement` para aceitar `mode: "delta" | "target"`:

```typescript
// substituir o cálculo de delta em applyMovement:
//   target: delta = args.newQty - previousQty
//   delta : newQty = previousQty + args.deltaQty; delta = args.deltaQty
```

Refatorar `applyMovement` para o seguinte contrato final:

```typescript
type MovementMode =
	| { mode: "target"; newQty: number }
	| { mode: "delta"; deltaQty: number }; // deltaQty pode ser negativo (baixa)

interface ApplyMovementArgs {
	variantId: string;
	branchId: string;
	op: MovementMode;
	reason: StockMovementReason;
	reasonNote: string | null;
	supplierId: string | null;
	actorId: string;
}
// dentro do lock:
//   const previousQty = lockedRows[0]?.quantity ?? 0;
//   const newQty = args.op.mode === "target" ? args.op.newQty : previousQty + args.op.deltaQty;
//   const delta = newQty - previousQty;
//   if (newQty < 0) throw new Error("Estoque não pode ficar negativo");
//   ... resto igual, usando newQty/delta ...
```

`recordStockEntry` passa `op: { mode: "delta", deltaQty: quantity }`. Remove o helper `currentQty` (desnecessário).

- [ ] **Step 3: `recordStockWriteOff` (delta −N)**

```typescript
export async function recordStockWriteOff(
	input: StockWriteOffInput
): Promise<ActionResult<AdjustStockSuccess>> {
	const session = await requireCapability("stock.adjust");
	const parsed = stockWriteOffSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
	}
	const { variantId, branchId, quantity, reason, note } = parsed.data;
	try {
		const result = await applyMovement({
			variantId, branchId,
			op: { mode: "delta", deltaQty: -quantity },
			reason,
			reasonNote: note ?? null,
			supplierId: null,
			actorId: session.user.id,
		});
		await revalidateStockPaths(variantId, branchId);
		return { ok: true, data: result };
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
}
```

- [ ] **Step 4: `adjustStock` vira recontagem pura (target, sem fornecedor)**

Reescrever `adjustStock` para aceitar `StockRecountInput` (campo `newQty`, sem `reason` — sempre `ajuste_inventario`):

```typescript
export async function adjustStock(
	input: StockRecountInput
): Promise<ActionResult<AdjustStockSuccess>> {
	const session = await requireCapability("stock.adjust");
	const parsed = stockRecountSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
	}
	const { variantId, branchId, newQty, note } = parsed.data;
	try {
		const result = await applyMovement({
			variantId, branchId,
			op: { mode: "target", newQty },
			reason: "ajuste_inventario",
			reasonNote: note ?? null,
			supplierId: null,
			actorId: session.user.id,
		});
		await revalidateStockPaths(variantId, branchId);
		return { ok: true, data: result };
	} catch (error) {
		return { ok: false, error: errorMessage(error) };
	}
}
```

- [ ] **Step 5: Adicionar `supplierId`/`supplierName` aos row types e queries de movimento**

Em `StockMovementRow` e `ToolActivityRow`, adicionar `supplierId: string | null; supplierName: string | null;`. Nas queries `getStockMovements`, `getStockMovementsByVariantBranch`, `fetchVariantBranchMovementsPage`, `getToolActivity`, `fetchToolActivityPage`: adicionar ao `.select({...})`:

```typescript
			supplierId: stockMovement.supplierId,
			supplierName: supplier.name,
```

e o join (após o join de branch):

```typescript
			.leftJoin(supplier, eq(stockMovement.supplierId, supplier.id))
```

(importar `supplier` de `@emach/db/schema/tools`).

- [ ] **Step 6: Verificar tipos**

Run: `bun check-types`
Expected: PASS. (Os consumidores da antiga assinatura de `adjustStock`/`stock-adjustment-schema` vão quebrar — corrigidos na Fase 2/Task 2.2; se necessário, comentar temporariamente o import quebrado da sheet e religar na Task 2.2. Preferir fazer a Task 2.2 antes do commit desta para manter verde.)

- [ ] **Step 7: Commit (junto com Task 2.2 se o build exigir)**

```bash
git add apps/web/src/app/dashboard/stock/actions.ts
git commit -m "feat(stock): actions recordStockEntry/recordStockWriteOff + adjustStock recontagem"
```

---

## Fase 2 — UI das três operações

### Task 2.1: `getActiveSuppliers()` para o select de entrada

**Files:**
- Create: `apps/web/src/lib/suppliers.ts`

- [ ] **Step 1: Criar o helper**

```typescript
import "server-only";
import { db } from "@emach/db";
import { supplier } from "@emach/db/schema/tools";
import { asc, eq } from "drizzle-orm";

export interface ActiveSupplierOption {
	id: string;
	name: string;
}

export async function getActiveSuppliers(): Promise<ActiveSupplierOption[]> {
	return await db
		.select({ id: supplier.id, name: supplier.name })
		.from(supplier)
		.where(eq(supplier.status, "active"))
		.orderBy(asc(supplier.name));
}
```

- [ ] **Step 2: check-types + commit**

Run: `bun check-types` → PASS

```bash
git add apps/web/src/lib/suppliers.ts
git commit -m "feat(stock): getActiveSuppliers para o select de entrada"
```

### Task 2.2: Reescrever a sheet em três modos (Entrada/Baixa/Ajuste)

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx`
- Modify (caller): a página/tabela que renderiza a sheet precisa passar `suppliers: ActiveSupplierOption[]` (carregar via `getActiveSuppliers()` no Server Component pai de `/dashboard/stock` e do `branches/[id]/stock`).

- [ ] **Step 1: Trocar o estado de "ajuste único" por um seletor de modo**

Substituir o bloco "Ajustar quantidade" (linhas ~458-536 do arquivo atual) por um segmented control de 3 modos e 3 sub-formulários. Estado novo:

```typescript
type Mode = "entrada" | "baixa" | "ajuste";
const [mode, setMode] = useState<Mode>("entrada");
const [qty, setQty] = useState<number | undefined>(undefined);      // entrada/baixa: delta
const [targetQty, setTargetQty] = useState<number | undefined>(undefined); // ajuste: alvo
const [supplierId, setSupplierId] = useState<string>("");
const [writeOffReason, setWriteOffReason] = useState<StockWriteOffReason>("perda");
const [note, setNote] = useState("");
```

Imports novos: `recordStockEntry`, `recordStockWriteOff`, `adjustStock` de `../actions`; schemas de `./stock-movement-schema`; `Select*` de `@emach/ui/components/select`; tipo `ActiveSupplierOption` de `@/lib/suppliers`. Prop nova: `suppliers: ActiveSupplierOption[]`.

- [ ] **Step 2: Segmented control + submit por modo**

O segmented control (3 botões `variant={mode===x?"default":"outline"}`). Cada modo renderiza seu form:

- **Entrada:** `MaskedInput` (qty, label "Quantidade a adicionar"), `Select` de fornecedor (obrigatório, options = `suppliers`), `Textarea` opcional. Submit → `recordStockEntry({ variantId, branchId, quantity: qty, supplierId, note })`.
- **Baixa:** `MaskedInput` (qty, "Quantidade a remover"), botões de motivo (`perda`/`outro`), `Textarea` (obrigatória se `outro`). Submit → `recordStockWriteOff({ variantId, branchId, quantity: qty, reason: writeOffReason, note })`.
- **Ajuste:** `MaskedInput` (targetQty, "Quantidade contada", placeholder `Atual: ${row.quantity}`), `Textarea` opcional. Submit → `adjustStock({ variantId, branchId, newQty: targetQty, note })`.

Cada submit: `safeParse` do schema correspondente, `reportValidationError` em falha, `startAdjustTransition` + `notify.success`/`router.refresh()`/`onClose()` em sucesso (mesmo padrão do `handleAdjustSubmit` atual). Resetar campos no `useEffect` de troca de variante (incluir `setMode("entrada")`, `setQty(undefined)`, `setTargetQty(row.quantity)`, `setSupplierId("")`).

- [ ] **Step 3: Atualizar o caller para passar `suppliers`**

No Server Component que monta a página de estoque (`/dashboard/stock/page.tsx` e o componente da aba de estoque da filial), carregar `const suppliers = await getActiveSuppliers();` e repassar até a sheet via props. (Seguir a cadeia de props existente do `row`/`branchId`.)

- [ ] **Step 4: Verificar tipos + remover o schema antigo**

Deletar `stock-adjustment-schema.ts` e corrigir imports remanescentes (o `fetchToolActivityPage` usa `STOCK_MOVEMENT_REASONS` — reapontar para `stock-movement-schema.ts`).

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 5: Smoke runtime (obrigatório — UI + SQL)**

Run: `bun dev:web`, abrir `/dashboard/stock`, abrir a sheet de uma variante:
- Entrada +5 com fornecedor → estoque sobe 5, toast ok.
- Baixa −2 (perda) → estoque cai 2.
- Ajuste alvo = 10 → estoque vira 10.
- Tentar entrada sem fornecedor → erro de validação no campo.
Conferir que cada operação aparece no card "Movimentos recentes" com o delta certo.

- [ ] **Step 6: `bun check` + commit**

```bash
bun check
git add apps/web/src/app/dashboard/stock apps/web/src/lib/suppliers.ts
git commit -m "feat(stock): UI de entrada/baixa/ajuste com fornecedor na entrada"
```

---

## Fase 3 — Migrar leitores do fornecedor para derivado das entradas

### Task 3.1: Reescrever `suppliers/data.ts` para derivar das entradas

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/data.ts`

Conceito da derivação: "tools que o fornecedor fornece" = tools com ≥1 `stock_movement` `reason='entrada_compra'` e `supplier_id = :id`, via `tool_variant`. Usar uma CTE/subquery de `DISTINCT tool_id`.

- [ ] **Step 1: `getSupplierStockTools` — base derivada (tool ids + métricas)**

Novo helper raw (`db.execute`, colunas aliasadas — ver armadilha snake_case em `packages/db/CLAUDE.md`):

```typescript
export interface SupplierStockToolRow {
	id: string;
	name: string;
	slug: string;
	status: "draft" | "active" | "discontinued";
	createdAt: Date;
	/** estoque geral: soma de todas as variantes × filiais. */
	generalStock: number;
	/** total já recebido deste fornecedor (soma dos deltas de entrada dele). */
	receivedFromSupplier: number;
	defaultSku: string | null;
	imageUrl: string | null;
	category: string | null;
}
```

Query (paginável por `(createdAt, id)` desc): selecionar tools cujo id ∈ entradas do fornecedor, com:
- `generalStock` = `COALESCE((SELECT SUM(sl.quantity) FROM stock_level sl JOIN tool_variant tv ON tv.id = sl.variant_id WHERE tv.tool_id = t.id), 0)`
- `receivedFromSupplier` = `COALESCE((SELECT SUM(sm.delta) FROM stock_movement sm JOIN tool_variant tv ON tv.id = sm.variant_id WHERE tv.tool_id = t.id AND sm.reason='entrada_compra' AND sm.supplier_id = :id), 0)`
- `defaultSku`/`imageUrl`/`category` via subqueries escalares (mesmo padrão de `getToolCardMeta`) — **mas** como subqueries escalares correlacionadas falham no `db.select` builder, usar `db.execute` raw aqui (padrão validado, ver armadilha em `packages/db/CLAUDE.md`).

Filtro de derivação: `WHERE t.id IN (SELECT DISTINCT tv.tool_id FROM stock_movement sm JOIN tool_variant tv ON tv.id = sm.variant_id WHERE sm.reason='entrada_compra' AND sm.supplier_id = ${id})`. `coerceDates(row, ["createdAt"])` no boundary.

- [ ] **Step 2: Reescrever `getSupplierDetail` counts (total/active/inactive) para derivado**

Trocar o bloco que usa `eq(tool.supplierId, id)` por uma contagem sobre os tools derivados. Reusar o filtro de derivação acima num count:

```typescript
	const [counts] = await db.execute<{ total: number; active: number; inactive: number }>(sql`
		SELECT
			count(*)::int AS "total",
			count(*) FILTER (WHERE t.status = 'active')::int AS "active",
			count(*) FILTER (WHERE t.status <> 'active')::int AS "inactive"
		FROM tool t
		WHERE t.id IN (
			SELECT DISTINCT tv.tool_id FROM stock_movement sm
			JOIN tool_variant tv ON tv.id = sm.variant_id
			WHERE sm.reason = 'entrada_compra' AND sm.supplier_id = ${id}
		)
	`).then((r) => r.rows);
```

- [ ] **Step 3: Reescrever `getSupplierDetailKpis` e `getSupplierTableAggregates` igual**

Ambos trocam `eq(tool.supplierId, ...)` pelo mesmo filtro derivado. `getSupplierTableAggregates` recebe `supplierIds[]` — derivar por `sm.supplier_id IN (...)` agrupando por `supplier_id` (juntar `stock_movement → tool_variant → tool` e `count(distinct tool_id)`).

- [ ] **Step 4: check-types**

Run: `bun check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/suppliers/data.ts
git commit -m "refactor(suppliers): derivar relação fornecedor↔tool das entradas"
```

### Task 3.2: `fetchSupplierStockPage` (substitui `fetchSupplierToolsPage`)

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/actions.ts`

- [ ] **Step 1: Substituir `fetchSupplierToolsPage` por `fetchSupplierStockPage`**

Mesma assinatura (`{ supplierId, search, cursor }`), mas retorna `InfiniteResult<SupplierStockToolRow>` chamando `getSupplierStockTools` (derivado, com paginação keyset `(createdAt,id)` desc). Manter o tratamento de `search` (ILIKE em name/slug). Remover a dependência de `tool.supplierId`.

- [ ] **Step 2: check-types + commit**

Run: `bun check-types` → PASS (a `tools-tab.tsx` ainda importa o antigo — será trocada na Fase 4; se quebrar o build, fazer a Fase 4/Task 4.1 antes do commit).

```bash
git add apps/web/src/app/dashboard/suppliers/actions.ts
git commit -m "refactor(suppliers): fetchSupplierStockPage derivado das entradas"
```

---

## Fase 4 — Aba "Estoque" do fornecedor

### Task 4.1: Componentes da aba Estoque

**Files:**
- Create: `apps/web/src/app/dashboard/suppliers/[id]/_components/estoque-tab.tsx`
- Create: `apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-stock-infinite.tsx`
- Delete: `tools-tab.tsx`, `supplier-tools-infinite.tsx`, `supplier-tool-card.tsx` (substituídos)

- [ ] **Step 1: `estoque-tab.tsx` (Server Component)**

Espelhar `tools-tab.tsx`, mas chamar `fetchSupplierStockPage` e renderizar `SupplierStockInfinite`. Empty state: "Nenhuma ferramenta recebida deste fornecedor" / "Registre uma entrada com este fornecedor para vê-la aqui."

- [ ] **Step 2: `supplier-stock-infinite.tsx` (Client) — linha por ferramenta**

Reusar `useInfiniteList` + `InfiniteSentinel`. Cada linha (arquétipo card "entity", ver `DESIGN.md §4`): thumb + nome + SKU/categoria + **estoque geral** (headline, tabular-nums) + **recebido dele** (secundário, "recebidos N"). A linha inteira é `<Link href={\`/dashboard/tools/${id}/stock\`}>` (atalho pro estoque detalhado — convenção decidida no grill).

- [ ] **Step 3: check-types + smoke**

Run: `bun check-types` → PASS. `bun dev:web` → abrir `/dashboard/suppliers/<id>?tab=estoque`: registrar uma entrada do fornecedor X numa tool, conferir que a tool aparece com estoque geral correto e "recebidos".

- [ ] **Step 4: commit**

```bash
git add apps/web/src/app/dashboard/suppliers/[id]/_components
git rm apps/web/src/app/dashboard/suppliers/[id]/_components/tools-tab.tsx apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-tools-infinite.tsx apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-tool-card.tsx
git commit -m "feat(suppliers): aba Estoque derivada das entradas"
```

### Task 4.2: Atualizar a página do fornecedor (aba + header action)

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/[id]/page.tsx`

- [ ] **Step 1: Trocar a tab "Ferramentas" por "Estoque"**

Renomear `value: "tools"` → `value: "estoque"`, label "Estoque", icon `Boxes`/`Warehouse`, `content` = `<EstoqueTab supplierId={id} search={sp.q} />` quando `tab === "estoque"`. Badge = `detail.toolsTotal` (agora derivado).

- [ ] **Step 2: Remover o deep-link `?supplierId=` do header action**

O `headerAction` da tab tools apontava para `/dashboard/tools/new?supplierId=${id}` — fornecedor não é mais campo da tool. Remover esse botão (a aba Estoque não cria tool; entradas são feitas na tela de estoque). Manter o header action de "overview" (Editar/Arquivar).

- [ ] **Step 3: check-types + smoke + commit**

Run: `bun check-types` → PASS. Smoke: aba "Estoque" abre, sem botão "Nova ferramenta".

```bash
git add apps/web/src/app/dashboard/suppliers/[id]/page.tsx
git commit -m "feat(suppliers): aba Estoque + remover deep-link supplierId"
```

---

## Fase 5 — Ledger global de movimentações

### Task 5.1: Query do ledger com filtros

**Files:**
- Create: `apps/web/src/app/dashboard/stock/movements-data.ts`

- [ ] **Step 1: Tipos + query paginada com filtros**

```typescript
import "server-only";
// ... imports db, schema, cursor, infinite ...

export interface LedgerFilters {
	actorId?: string;
	toolId?: string;
	branchId?: string;
	supplierId?: string;
	reasons?: string[];
	period: "today" | "7d" | "30d" | "90d" | "all";
}

export interface LedgerRow {
	id: string;
	createdAt: Date;
	delta: number;
	previousQty: number;
	newQty: number;
	reason: string | null;
	reasonNote: string | null;
	toolId: string | null;
	toolName: string | null;
	variantSku: string | null;
	branchId: string | null;
	branchName: string | null;
	supplierId: string | null;
	supplierName: string | null;
	actorId: string | null;
	actorName: string | null;
}

export async function fetchLedgerPage(
	filters: LedgerFilters,
	cursor: string | null
): Promise<InfiniteResult<LedgerRow>> {
	await requireCapability("stock.read");
	// joins: stock_movement → tool_variant → tool, leftJoin branch, supplier, user
	// conditions: filtros opcionais (toolId via toolVariant.toolId, branchId, supplierId,
	//   inArray(reason, reasons), gte(createdAt, cutoff)); cursor keyset (createdAt,id) desc.
	// orderBy desc(createdAt), desc(id); limit BATCH_SIZE+1; encode/decode cursor "activity".
}
```

(Modelar a query igual a `fetchToolActivityPage`, sem fixar `toolId` e adicionando os joins de supplier/actor — todos os campos já existem nas queries da Fase 1/Step 5.)

- [ ] **Step 2: check-types + commit**

Run: `bun check-types` → PASS.

```bash
git add apps/web/src/app/dashboard/stock/movements-data.ts
git commit -m "feat(stock): query do ledger global com filtros"
```

### Task 5.2: Página e filtros do ledger

**Files:**
- Create: `apps/web/src/app/dashboard/stock/movements/page.tsx`
- Create: `apps/web/src/app/dashboard/stock/movements/_components/ledger-filters.tsx`
- Create: `apps/web/src/app/dashboard/stock/movements/_components/ledger-infinite.tsx`

- [ ] **Step 1: `page.tsx` (Server Component)**

`requireCapabilityOrRedirect("stock.read")`. Ler filtros de `searchParams` (toolId/branchId/supplierId/reason/period/actorId). Carregar listas para os selects (`getActiveSuppliers`, branches, e opções de motivo). Primeira página via `fetchLedgerPage(filters, null)`. Render: `EntityIdentityHeader`-like título "Movimentações" + `<LedgerFilters/>` + `<LedgerInfinite initial=... filters=.../>`.

- [ ] **Step 2: `ledger-filters.tsx` (Client)**

Selects controlados que escrevem em `?param=` (via `useRouter`/`useSearchParams`): Filial, Fornecedor, Motivo (multi), Período (today/7d/30d/90d/all), e busca por ferramenta (opcional). Padrão de filtro já usado em `tools/[id]/_components/activity-filters.tsx` — reusar a abordagem.

- [ ] **Step 3: `ledger-infinite.tsx` (Client)**

`useInfiniteList` + `InfiniteSentinel`. Cada linha mostra: data (`formatDateTime` de `@/lib/format/datetime`), delta colorido, motivo, ferramenta+SKU (link pro tool), filial, **fornecedor** (quando entrada), ator. Linha linka pro tool/branch conforme o caso.

- [ ] **Step 4: Adicionar entrada no menu/nav**

Incluir "Movimentações" na navegação do dashboard de estoque (seguir o padrão de itens de nav existente; localizar o sidebar/nav e adicionar o link `/dashboard/stock/movements`).

- [ ] **Step 5: check-types + smoke + bun check + commit**

Run: `bun check-types` → PASS. Smoke: `/dashboard/stock/movements` lista todos os movimentos; filtrar por fornecedor mostra só entradas dele; por período/filial funciona; **testar o caminho de 1 filtro só** (deep-link `?reason=entrada_compra`) — ver armadilha UNION/ORDER BY em `packages/db/CLAUDE.md` se a query usar union (esta não usa, mas confirmar paginação com filtro único).

```bash
bun check
git add apps/web/src/app/dashboard/stock/movements
git commit -m "feat(stock): ledger global de movimentações com filtros"
```

---

## Fase 6 — Enriquecer timelines + remover `tool.supplier_id`

### Task 6.1: Mostrar fornecedor nas timelines de tool e filial

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/activity-timeline.tsx`
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/branch-activity-timeline.tsx`

- [ ] **Step 1: Renderizar `supplierName` nas linhas de entrada**

As queries já trazem `supplierName` (Fase 1/Step 5; a branch timeline data precisa do mesmo join — adicionar `leftJoin(supplier, ...)` + `supplierName` na query que alimenta a branch timeline, em `branches/[id]/activity-data.ts`). No render, quando `reason === "entrada_compra"` e `supplierName`, mostrar "· Fornecedor: {supplierName}".

- [ ] **Step 2: check-types + smoke + commit**

Run: `bun check-types` → PASS. Smoke: timeline de uma tool e de uma filial mostram o fornecedor nas entradas.

```bash
git add apps/web/src/app/dashboard/tools/[id]/_components apps/web/src/app/dashboard/branches/[id]
git commit -m "feat(stock): fornecedor nas timelines de tool e filial"
```

### Task 6.2: Remover o campo Fornecedor do form de Tool

**Files:**
- Modify: `tools/_components/fields/identity-fields.tsx`, `tools/_components/tool-schema.ts`, `tools/_components/tool-form-state.ts`, `tools/_components/tool-form-steps.ts`, `tools/actions.ts`, `tools/[id]/edit/page.tsx`, `tools/[id]/_lib/tool-detail-data.ts`

- [ ] **Step 1: Remover o `<LabeledField id="supplierId">`** (identity-fields.tsx, ~167-188) e a prop `suppliers` que o alimenta. Remover a passagem de `suppliers` na cadeia do form (wizard/edit).

- [ ] **Step 2: Remover `supplierId` do schema/estado/steps**: `tool-schema.ts` (`supplierId: optionalString`), `tool-form-state.ts` (`supplierId: ""`), `tool-form-steps.ts` (string `"supplierId"` em `STEP_FIELDS`), `tools/actions.ts` (`supplierId: nullableText(...)` no create e no update), `tools/[id]/edit/page.tsx` (`supplierId: row.supplierId ?? ""`), `tools/[id]/_lib/tool-detail-data.ts` (`leftJoin(supplier, eq(tool.supplierId, supplier.id))` e seleção do supplier no detalhe — remover ou manter o join só se exibir o fornecedor "histórico"; aqui **remover**).

- [ ] **Step 3: check-types**

Run: `bun check-types` → PASS. (`STEP_FIELDS` tem assert de exaustividade — remover `supplierId` do schema **e** do step ao mesmo tempo.)

- [ ] **Step 4: smoke + commit**

Smoke: criar e editar uma tool sem o campo Fornecedor; nenhuma referência quebrada.

```bash
git add apps/web/src/app/dashboard/tools
git commit -m "refactor(tools): remover campo Fornecedor do form de ferramenta"
```

### Task 6.3: Drop coordenado de `tool.supplier_id`

**Files:**
- Modify: `packages/db/src/schema/tools.ts`, `packages/db/src/queries/catalog.ts`

- [ ] **Step 1: Remover a coluna do schema**

Em `tools.ts`: remover `supplierId: text("supplier_id")...`, o `index("tool_supplier_id_idx")`, e a relação `supplier` em `toolRelations`. Manter o `export const supplier` e `supplierRelations` (a tabela supplier permanece; só o vínculo na tool sai). **Atenção:** `supplierRelations` tem `tools: many(tool)` — remover esse campo (não há mais FK).

- [ ] **Step 2: Remover `t.supplier_id AS "supplierId"` de `getToolBySlug`** (catalog.ts:442) e do tipo `Tool` derivado, se necessário (a coluna some do `$inferSelect` ao sair do schema — ajustar selects que a enumeram).

- [ ] **Step 3: check-types**

Run: `bun check-types` → PASS.

- [ ] **Step 4: Aplicar o drop (interativo, TTY — ADR-0006)**

Run: `bun db:sync`
Expected: drizzle-kit detecta o drop de `tool.supplier_id`; confirmar no prompt TTY. (Drop é destrutivo → PR explícito + comunicar ao e-commerce, ADR-0009. O e-commerce não lê `tool.supplier_id` para lógica, mas o tipo `Tool` sincronizado muda — coordenar deploy.)

- [ ] **Step 5: smoke + bun check + commit**

Smoke: storefront-facing `getToolBySlug` e detalhe de tool no dashboard ainda renderizam. `bun check`.

```bash
git add packages/db/src/schema/tools.ts packages/db/src/queries/catalog.ts
git commit -m "refactor(db): drop tool.supplier_id (proveniência via entradas) [ADR-0015]"
```

---

## Self-Review

- **Cobertura do spec:**
  - Fornecedor↔Tool derivado → Fase 3 (queries) + Fase 4 (aba). ✓
  - `tool.supplier_id` removido → Fase 6 (forms + drop). ✓
  - 3 operações (entrada/baixa/ajuste) → Fase 1 (actions) + Fase 2 (UI). ✓
  - Sem custo → nenhuma coluna/campo de custo tocado; `costAmount` intacto (limpeza separada). ✓
  - `supplier_id` obrigatório em entrada → Fase 0 (CHECK) + Fase 1 (schema Zod). ✓
  - Aba Estoque (estoque geral + recebido dele, link pro tool) → Fase 4. ✓
  - Ledger global filtrável + timelines com fornecedor → Fase 5 + Fase 6.1. ✓
  - Transferência fora de escopo → não há task; documentado em CONTEXT.md/ADR. ✓
- **Backfill:** Fase 0/Step 4 converte entradas legadas sem fornecedor em `ajuste_inventario` antes do CHECK. ✓
- **Ordem de drop:** `tool.supplier_id` só na Fase 6, após todos os leitores migrarem (Fase 3). ✓
- **Consistência de nomes:** `recordStockEntry`, `recordStockWriteOff`, `adjustStock` (recontagem), `applyMovement` (mode target|delta), `fetchSupplierStockPage`, `getSupplierStockTools`, `SupplierStockToolRow`, `fetchLedgerPage`, `LedgerRow`. ✓
- **Armadilhas referenciadas:** subquery escalar correlacionada (usar `db.execute` raw), snake_case do raw execute (alias `AS "camelCase"`), `db.execute` timestamp string (`coerceDates`/`toDate`), erro Postgres em `.cause` (`getPgError`), CHECK só constrange `entrada_compra` (e-commerce não afetado). ✓

**Riscos abertos para validar na execução:**
1. O CHECK `entrada_requires_supplier` assume que nenhum caminho do e-commerce escreve `entrada_compra` — confirmar no contrato `docs/integration/admin-ecommerce.md` antes do drop.
2. Capability: as três operações reusam `stock.adjust` (gates off por ADR-0012; manter a chamada para religar depois). Se quiser granularidade (`stock.entry`), é decisão à parte.
3. Drop de `tool.supplier_id` dispara o CI de sync (ADR-0009) — coordenar o PR no e-commerce no mesmo ciclo.
