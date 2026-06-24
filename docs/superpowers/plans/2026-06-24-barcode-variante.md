# Código de barras por variante — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `barcode` único e obrigatório por Tool Variant, usado em Catálogo, Estoque da filial, Busca global e snapshot de Pedidos.

**Architecture:** Coluna `tool_variant.barcode text NOT NULL UNIQUE` (espelha o `sku`). A coluna é introduzida **nullable** e promovida a `NOT NULL UNIQUE` só no fim da Fase A — assim cada commit mantém `check-types`/build verdes enquanto os escritores (form, seed, actions) passam a fornecer o valor. Validação client-side de duplicado espelha a de SKU; o barcode resolve para `variantId` em pontos de scan (estoque, ⌘K) via lookup dedicado.

**Tech Stack:** Drizzle 0.45 (push-only, ADR-0006), Next 16 / React 19, Zod, Vitest (node env), Supabase Postgres.

## Global Constraints

- Schema é **push-only** (ADR-0006): `bun db:sync` após editar `packages/db/src/schema/*.ts`. Sem migrations versionadas.
- `tool_variant` e `order_item` estão na **superfície de sync** (ADR-0009): mudança em `packages/db/src/schema/` abre PR automático no repo `emach-ecommerce` via CI. **Nunca editar o ecommerce a partir deste repo** — coordenação vira issue de handoff.
- Anti-patterns banidos: `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`; `console.*` (usar `logger`); `key={index}` (exceto lista curta de primitivos controlados, documentada com `//`); `React.forwardRef`; `useMemo`/`useCallback` manuais (React Compiler ativo).
- Server actions: `"use server"` no topo + `await requireCapability(...)`/`requireCapabilityWithContext(...)` no início; retorno `ActionResult<T>`; erro de banco via `getPgError(e)` (nunca `e.message.includes`); `"use server"` **só exporta async functions**.
- Erros de validação Zod no form via `<FieldError>` (regra ast-grep `raw-validation-error`); sinalização de duplicado **client-only** (não-Zod) pode usar `<p>` cru, por coerência com o erro de SKU duplicado já existente.
- Constraint de barcode: nome explícito **`tool_variant_barcode_key`**. Backfill dev: `barcode = sku` (SKU já é único). Unicidade case-sensitive, só `trim()`.
- Gate de cada fase: `bun verify` (check-types + check + test) **e** `bun run build` quando tocar arquivo `"use server"`/schema, **e** smoke visual na rota afetada (porta dev 3001).

---

## Fase A — Catálogo + schema (bloqueante)

### Task A1: Coluna `barcode` nullable + backfill no banco

**Files:**
- Modify: `packages/db/src/schema/tools.ts` (tabela `toolVariant`, ~linha 146)

**Interfaces:**
- Produces: coluna `tool_variant.barcode` (nullable, no banco) e o campo `barcode: string | null` em `typeof toolVariant.$inferSelect` / `…$inferInsert` (opcional no insert).

- [ ] **Step 1: Adicionar a coluna nullable no schema**

Em `packages/db/src/schema/tools.ts`, dentro do objeto de colunas de `toolVariant`, logo após a linha `sku: text("sku").notNull().unique(),`:

```ts
		barcode: text("barcode"),
```

(Nullable de propósito nesta task — sem `.notNull()`, sem `.unique()` ainda.)

- [ ] **Step 2: Aplicar no banco**

Run: `bun db:sync`
Expected: aplica `ALTER TABLE tool_variant ADD COLUMN barcode text;` sem prompt destrutivo.

- [ ] **Step 3: Backfill das 17 variantes existentes**

Via `mcp__supabase__execute_sql` (project `wrxohbzepoyscsacjzvd`) ou psql:

```sql
UPDATE tool_variant SET barcode = sku WHERE barcode IS NULL;
```

- [ ] **Step 4: Verificar que não há nulos**

Run (SQL): `SELECT count(*) AS nulos FROM tool_variant WHERE barcode IS NULL;`
Expected: `nulos = 0`.

- [ ] **Step 5: check-types**

Run: `bun check-types`
Expected: PASS (coluna nullable não quebra nenhum consumidor; `$inferInsert.barcode` é opcional).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/tools.ts
git commit -m "feat(db): adiciona coluna barcode nullable em tool_variant"
```

---

### Task A2: Barcode obrigatório na validação + fixes de tipo + dup-check (TDD)

Esta é a task type-coupled: tornar `barcode` obrigatório em `ToolVariantInput` quebra todos os literais de `variants`. Todos os fixes entram aqui para manter o build verde.

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` (`toolVariantSchema`, `updateVariantSchema`, `toolFormSchema.superRefine`)
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-state.ts` (`EMPTY_TOOL_VALUES.variants[0]`)
- Modify: `apps/web/src/app/dashboard/tools/[id]/edit/page.tsx` (`toFormValues`)
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-form-steps.test.ts`
- Modify: `apps/web/__tests__/tool-form-steps.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (independe do banco).
- Produces: `ToolVariantInput` agora exige `barcode: string`; `UpdateVariantInput` aceita `barcode?: string`; `toolFormSchema` rejeita barcode duplicado entre variantes com issue em `path: ["variants", i, "barcode"]`.

- [ ] **Step 1: Escrever o teste que falha (dup de barcode)**

Em `tool-schema.test.ts`, adicionar `barcode: "BAR-1"` à variante do `baseTool()` (linha ~85) **e** um novo describe ao fim do arquivo:

```ts
describe("toolFormSchema — barcode duplicado entre variantes", () => {
	it("rejeita duas variantes com o mesmo barcode", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				variants: [
					{ sku: "S1", barcode: "DUP", priceAmount: 100, isDefault: true, sortOrder: 0 },
					{ sku: "S2", barcode: "DUP", priceAmount: 100, isDefault: false, sortOrder: 1 },
				],
			})
		);
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(
				r.error.issues.some(
					(i) => i.path[0] === "variants" && i.path[2] === "barcode"
				)
			).toBe(true);
		}
	});

	it("rejeita variante sem barcode", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				variants: [{ sku: "S1", priceAmount: 100, isDefault: true, sortOrder: 0 }],
			})
		);
		expect(r.success).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun --cwd apps/web test tool-schema`
Expected: FAIL — o novo describe falha (sem validação de barcode ainda) e/ou `baseTool` quebra por TS.

- [ ] **Step 3: Adicionar barcode ao `toolVariantSchema` e `updateVariantSchema`**

Em `tool-schema.ts`, no `toolVariantSchema` (após `sku`):

```ts
	barcode: z.string().min(1, "Código de barras obrigatório"),
```

No `updateVariantSchema` (após `sku`):

```ts
	barcode: z.string().min(1).max(128).optional(),
```

- [ ] **Step 4: Adicionar o loop de duplicado no `superRefine`**

Em `toolFormSchema.superRefine`, logo após o bloco que valida SKUs duplicados (o `const skus = new Set<string>()` … loop):

```ts
		const barcodes = new Set<string>();
		for (let i = 0; i < data.variants.length; i++) {
			const code = data.variants[i]?.barcode;
			if (code && barcodes.has(code)) {
				ctx.addIssue({
					code: "custom",
					path: ["variants", i, "barcode"],
					message: "Código de barras duplicado entre variantes",
				});
			}
			if (code) {
				barcodes.add(code);
			}
		}
```

- [ ] **Step 5: Corrigir literais que agora quebram o tipo**

Em `tool-form-state.ts`, `EMPTY_TOOL_VALUES.variants[0]` ganha `barcode: ""`:

```ts
		{
			sku: "",
			barcode: "",
			voltage: "",
			priceAmount: 0,
			isDefault: true,
			sortOrder: 0,
		},
```

Em `apps/web/src/app/dashboard/tools/[id]/edit/page.tsx`, no `.map` do `toFormValues` que constrói as variantes, adicionar `barcode: v.barcode ?? ""` ao objeto retornado.

Em `apps/web/src/app/dashboard/tools/_components/__tests__/tool-form-steps.test.ts` e `apps/web/__tests__/tool-form-steps.test.ts`, adicionar `barcode: "BAR-<n>"` a cada literal de variante nos fixtures.

- [ ] **Step 6: Rodar os testes e ver passar**

Run: `bun --cwd apps/web test tool-schema tool-form-steps`
Expected: PASS.

- [ ] **Step 7: check-types**

Run: `bun check-types`
Expected: PASS (todos os literais de variante agora têm `barcode`).

- [ ] **Step 8: Commit**

```bash
git add apps/web packages
git commit -m "feat(tools): exige barcode por variante na validação"
```

---

### Task A3: Seed e invariantes

**Files:**
- Modify: `packages/db/scripts/seed/catalog.ts` (`VariantDef` ~linha 357, `TOOLS[*].variants`, insert ~linha 898)
- Modify: `packages/db/scripts/seed/verify.ts`

**Interfaces:**
- Consumes: coluna `barcode` no banco (Task A1).
- Produces: seed type-safe que preenche `barcode`; invariantes de nulo/duplicado no verify.

- [ ] **Step 1: Adicionar barcode ao `VariantDef` e às 17 variantes**

Em `catalog.ts`, na interface `VariantDef`, adicionar `barcode: string;`. Em cada entrada de `TOOLS[*].variants`, adicionar `barcode: "<mesmo valor do sku>"` (ex.: `barcode: "DHP453Z-127"`). No `tx.insert(toolVariant).values({...})`, adicionar `barcode: varDef.barcode`.

- [ ] **Step 2: Adicionar invariantes ao verify**

Em `verify.ts`, adicionar duas checagens:

```ts
// barcode: nenhum nulo, nenhum duplicado
const nullBarcodes = await db.execute(
	sql`SELECT count(*)::int AS n FROM tool_variant WHERE barcode IS NULL`
);
assertZero(nullBarcodes, "tool_variant com barcode nulo");
const dupBarcodes = await db.execute(
	sql`SELECT count(*)::int AS n FROM (SELECT barcode FROM tool_variant GROUP BY barcode HAVING count(*) > 1) d`
);
assertZero(dupBarcodes, "barcodes duplicados em tool_variant");
```

(Adaptar `assertZero`/acesso ao count ao helper real do `verify.ts` — seguir o padrão das checagens existentes no arquivo.)

- [ ] **Step 3: Rodar o seed e o verify**

Run: `bun db:seed-demo`
Expected: reconstrói a DB sem erro de `NOT NULL` (coluna ainda nullable, mas os valores são fornecidos) e o verify passa.

- [ ] **Step 4: Commit**

```bash
git add packages/db/scripts/seed
git commit -m "feat(db): seed e invariantes de barcode por variante"
```

---

### Task A4: Editor de variantes (UI do wizard/edit)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/variants-editor.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/variant-fields.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts` (descrição do step `variants`)

**Interfaces:**
- Consumes: `ToolVariantInput.barcode` (Task A2).
- Produces: input "Código de barras" por linha + detecção visual de duplicado.

- [ ] **Step 1: EMPTY_VARIANT + computeDuplicateBarcodes**

Em `variants-editor.tsx`: `EMPTY_VARIANT` ganha `barcode: ""`. Adicionar função espelhando `computeDuplicateSkus`:

```ts
function computeDuplicateBarcodes(variants: ToolVariantInput[]): Set<string> {
	const seen = new Map<string, number>();
	const dups = new Set<string>();
	for (const v of variants) {
		const key = v.barcode.trim().toLowerCase();
		if (!key) {
			continue;
		}
		const count = (seen.get(key) ?? 0) + 1;
		seen.set(key, count);
		if (count > 1) {
			dups.add(key);
		}
	}
	return dups;
}
```

No corpo do componente, ao lado de `const duplicateSkus = computeDuplicateSkus(value);`:

```ts
	const duplicateBarcodes = computeDuplicateBarcodes(value);
```

- [ ] **Step 2: Input de barcode no grid**

Ampliar a classe do grid de `md:grid-cols-[2fr_1fr_1fr_auto]` para `md:grid-cols-[2fr_2fr_1fr_1fr_auto]`. Dentro do `value.map((variant, index) => {…})`, calcular o flag e adicionar a coluna após o bloco de SKU:

```tsx
				const barcodeKey = variant.barcode.trim().toLowerCase();
				const isBarcodeDuplicate =
					barcodeKey !== "" && duplicateBarcodes.has(barcodeKey);
```

```tsx
						<div className="flex flex-col gap-2">
							<Label htmlFor={`var-barcode-${index}`}>
								Código de barras
								<span className="text-destructive"> *</span>
							</Label>
							<Input
								aria-invalid={isBarcodeDuplicate || undefined}
								aria-required="true"
								className="font-mono"
								id={`var-barcode-${index}`}
								onChange={(e) => update(index, { barcode: e.target.value })}
								value={variant.barcode}
							/>
							{isBarcodeDuplicate && (
								<p className="text-destructive text-xs">
									Código de barras duplicado entre variantes
								</p>
							)}
						</div>
```

(Importar `Input` de `@emach/ui/components/input`. Usar `<Input>` puro — **não** `MaskedInput`/`skuMask`, que uppercase/strip.)

- [ ] **Step 3: Texto de ajuda e descrição do step**

Em `variant-fields.tsx`, ampliar o parágrafo de ajuda mencionando o código de barras (ex.: "Cada variante tem SKU, código de barras e preço próprios."). Em `tool-form-steps.ts`, atualizar a descrição do step `variants` para incluir "códigos de barras".

- [ ] **Step 4: check-types + smoke visual**

Run: `bun check-types`
Expected: PASS.
Smoke (porta 3001): abrir `/dashboard/tools/new`, passo Variantes — o campo aparece, duplicar dois barcodes mostra o erro inline, layout não quebra no mobile.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components
git commit -m "feat(tools): campo código de barras no editor de variantes"
```

---

### Task A5: Normalização + server action de variante (TDD onde puro)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts` (`normalizeVariantValues`)
- Modify: `apps/web/src/app/dashboard/tools/actions.ts` (`updateToolVariant`)
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-query-helpers.test.ts`

**Interfaces:**
- Consumes: `ToolVariantInput.barcode`, `UpdateVariantInput.barcode` (Task A2).
- Produces: `normalizeVariantValues` inclui `barcode: v.barcode.trim()`; `updateToolVariant` persiste barcode e diferencia colisão de barcode vs SKU.

- [ ] **Step 1: Teste de normalize (falha)**

Em `tool-query-helpers.test.ts`, adicionar:

```ts
it("normaliza barcode com trim", () => {
	const out = normalizeVariantValues({
		sku: "S1",
		barcode: "  7891234567890 ",
		voltage: "",
		priceAmount: 100,
		isDefault: true,
		sortOrder: 0,
	});
	expect(out.barcode).toBe("7891234567890");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test tool-query-helpers`
Expected: FAIL — `out.barcode` é `undefined`.

- [ ] **Step 3: Implementar no normalize**

Em `normalizeVariantValues`, adicionar ao objeto retornado:

```ts
		barcode: v.barcode.trim(),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test tool-query-helpers`
Expected: PASS.

- [ ] **Step 5: updateToolVariant — persistir barcode + diferenciar 23505**

Em `actions.ts`, no `updateToolVariant`, no bloco que monta `updateFields`:

```ts
	if (fields.barcode !== undefined) {
		updateFields.barcode = fields.barcode;
	}
```

No catch que trata `23505`, diferenciar por constraint:

```ts
		const pg = getPgError(error);
		if (pg?.code === "23505") {
			if (pg.constraint === "tool_variant_barcode_key") {
				return { ok: false, error: "Código de barras já cadastrado em outra variante" };
			}
			return { ok: false, error: "SKU já existe para outra variante" };
		}
```

(Adaptar à forma exata do catch existente — manter o fallback que loga + mensagem genérica.)

- [ ] **Step 6: check-types + build (toca `"use server"`)**

Run: `bun check-types && bun run build`
Expected: PASS (o build é gate obrigatório ao tocar `actions.ts`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/tools
git commit -m "feat(tools): persiste e valida barcode na variante"
```

---

### Task A6: Aba "Variantes & Preços" — edição inline

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx`

**Interfaces:**
- Consumes: `ToolDetailVariant.barcode` (herdado de `$inferSelect`, Task A1), `updateToolVariant` com barcode (Task A5).
- Produces: edição inline e exibição read-only do barcode.

- [ ] **Step 1: RowState / makeRowState / isDirty**

`RowState` ganha `barcode: string`; `makeRowState` retorna `barcode: v.barcode`; `isDirty` adiciona `|| initial.barcode !== current.barcode`.

- [ ] **Step 2: Header + célula editável + handleSave**

No `<TableHeader>` de `VariantsTab`, após o `<TableHead>SKU</TableHead>`: `<TableHead>Código de barras</TableHead>`. No `EditableRow`, após a célula de SKU:

```tsx
				<TableCell>
					<Input
						className="h-8 w-[160px] font-mono text-xs"
						onChange={(e) => setState({ ...state, barcode: e.target.value })}
						value={state.barcode}
					/>
				</TableCell>
```

No `handleSave`, na chamada de `updateToolVariant`, adicionar:

```ts
				barcode: state.barcode === initial.barcode ? undefined : state.barcode,
```

- [ ] **Step 3: VariantsReadOnly**

Adicionar `<TableHead>Código de barras</TableHead>` e a célula `<TableCell className="font-mono text-xs">{v.barcode}</TableCell>` no componente read-only.

- [ ] **Step 4: check-types + smoke**

Run: `bun check-types`
Expected: PASS.
Smoke: `/dashboard/tools/[id]?tab=variants` — editar barcode salva; duplicar com barcode existente mostra "Código de barras já cadastrado…".

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx
git commit -m "feat(tools): edição inline de barcode na aba de variantes"
```

---

### Task A7: Promover a `NOT NULL UNIQUE` + confirmar constraint

**Files:**
- Modify: `packages/db/src/schema/tools.ts` (`toolVariant`)

**Interfaces:**
- Consumes: todos os escritores já fornecem barcode (Tasks A2/A3/A5).
- Produces: `tool_variant.barcode` `NOT NULL UNIQUE` com constraint `tool_variant_barcode_key`.

- [ ] **Step 1: Promover a NOT NULL**

Em `tools.ts`, alterar a coluna para `barcode: text("barcode").notNull(),` e rodar:

Run: `bun db:sync`
Expected: `ALTER COLUMN barcode SET NOT NULL` (seguro — sem nulos após A1). Rodar interativo se pedir TTY.

- [ ] **Step 2: Adicionar UNIQUE com nome explícito**

No array de constraints da tabela (segundo argumento do `pgTable`), adicionar:

```ts
		unique("tool_variant_barcode_key").on(table.barcode),
```

(Importar `unique` de `drizzle-orm/pg-core` se ainda não estiver importado. **Não** adicionar índice separado — o unique já cria o B-tree.)

Run: `bun db:sync`
Expected: `ADD CONSTRAINT tool_variant_barcode_key UNIQUE (barcode)`.

- [ ] **Step 3: Confirmar o nome do constraint no banco**

Run (SQL): `SELECT conname FROM pg_constraint WHERE conrelid = 'tool_variant'::regclass AND contype = 'u';`
Expected: a lista inclui `tool_variant_barcode_key` (se divergir, ajustar o string no catch de A5).

- [ ] **Step 4: Verify + build**

Run: `bun db:seed-demo && bun check-types && bun run build`
Expected: seed/verify verdes (invariantes de A3 passam), build OK.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/tools.ts
git commit -m "feat(db): barcode NOT NULL UNIQUE em tool_variant"
```

**Gate Fase A:** `bun verify` verde + smoke completo de criar/editar/variantes. A partir daqui o catálogo enforça barcode end-to-end.

---

## Fase B — Estoque da filial / scanner

### Task B1: Barcode na query e exibição de estoque

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/branch-stock-data.ts`
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-sheet-head.tsx`
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-filters.tsx`

**Interfaces:**
- Produces: `BranchStockRow.barcode: string`; busca textual cobre barcode.

- [ ] **Step 1: Adicionar barcode ao tipo e à query**

Em `branch-stock-data.ts`: `BranchStockRow` e `BranchStockDbRow` ganham `barcode: string`. No SELECT raw, adicionar `tv.barcode`. Nos dois mapeamentos (urgency/paginate), `barcode: row.barcode`. No `whereParts` da busca, estender o OR: `OR tv.barcode ILIKE ${pattern}`.

- [ ] **Step 2: Exibir no card e no sheet-head**

`branch-stock-card.tsx`: adicionar `row.barcode` à linha de metadados (junto de sku/voltagem). `branch-stock-sheet-head.tsx`: adicionar `· {row.barcode}` ao `subtitle` em ambos os `lead`.

- [ ] **Step 3: Placeholder do filtro**

`branch-stock-filters.tsx`: placeholder do input de busca → `"Nome, SKU ou cód. barras"`.

- [ ] **Step 4: check-types + smoke**

Run: `bun check-types`
Expected: PASS.
Smoke: `/dashboard/branches/[id]?tab=stock` — barcode aparece no card; buscar pelo código filtra.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/stock
git commit -m "feat(stock): exibe e busca por barcode no estoque da filial"
```

---

### Task B2: Scanner keyboard-wedge → abre movimentação

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/branch-stock-data.ts` (`lookupVariantByBarcode`)
- Modify: `apps/web/src/app/dashboard/stock/actions.ts` (`lookupVariantByBarcodeAction`)
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-infinite.tsx` (input de scanner)

**Interfaces:**
- Consumes: `BranchStockRow` (Task B1).
- Produces: `lookupVariantByBarcodeAction(barcode, branchId): Promise<ActionResult<BranchStockRow | null>>`.

- [ ] **Step 1: Função de lookup (data layer)**

Em `branch-stock-data.ts`, adicionar `lookupVariantByBarcode(branchId: string, barcode: string): Promise<BranchStockRow | null>` — `SELECT … FROM tool_variant tv JOIN tool t ON t.id = tv.tool_id LEFT JOIN stock_level sl ON sl.variant_id = tv.id AND sl.branch_id = $branchId WHERE tv.barcode = $barcode LIMIT 1`, mapeando para `BranchStockRow` (mesmo shape do paginate).

- [ ] **Step 2: Server action com branch-scope**

Em `actions.ts`:

```ts
export async function lookupVariantByBarcodeAction(
	barcode: string,
	branchId: string
): Promise<ActionResult<BranchStockRow | null>> {
	await requireCapabilityWithContext("stock.read", { targetBranchIds: [branchId] });
	const row = await lookupVariantByBarcode(branchId, barcode.trim());
	return { ok: true, data: row };
}
```

- [ ] **Step 3: Input de scanner no grid**

Em `branch-stock-infinite.tsx`, acima do `<BranchStockCardGrid>`, adicionar um `<Input>` (placeholder "Escanear ou digitar código de barras") com handler de `Enter` (sem debounce): procura em `items` por `item.barcode === value.trim()`; achou → `setSelectedRow(item)`; senão → `lookupVariantByBarcodeAction(value, branchId)` e, se `data`, `setSelectedRow(data)`; em ambos limpar + refocus o input. Mensagem de "não encontrado" via `notify`.

- [ ] **Step 4: check-types + build + smoke**

Run: `bun check-types && bun run build`
Expected: PASS.
Smoke: escanear (ou digitar código + Enter) abre o sheet da variante correta; código de outra filial respeita o branch-scope.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/stock
git commit -m "feat(stock): escaneia barcode para abrir movimentação"
```

---

## Fase C — Busca global

### Task C1: Barcode na busca global (⌘K) e na lista de tools

**Files:**
- Modify: `apps/web/src/app/dashboard/_lib/global-search.server.ts`
- Modify: `apps/web/src/app/dashboard/_lib/global-search.ts` (`SearchHit.variantId?`)
- Modify: `apps/web/src/app/dashboard/_components/command-palette.tsx`
- Modify: `apps/web/src/app/dashboard/tools/data.ts` (`buildToolsWhereClause`)
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-filters.tsx`

**Interfaces:**
- Produces: hit de barcode (match exato) navegando para `/dashboard/tools/{toolId}?variant={variantId}`; busca textual da lista cobre barcode.

- [ ] **Step 1: Match exato de barcode no runGlobalSearch**

Em `global-search.server.ts`, adicionar a query: `SELECT tv.id AS variant_id, t.id, t.name, tv.sku FROM tool_variant tv JOIN tool t ON t.id = tv.tool_id WHERE tv.barcode = ${query.trim()} LIMIT 1`. Match **exato** (não ILIKE). Montar `SearchHit` com `href = '/dashboard/tools/' + t.id + '?variant=' + tv.id`, sublabel = SKU.

- [ ] **Step 2: Tipo + navegação**

Em `global-search.ts`, `SearchHit` ganha `variantId?: string`. Em `command-palette.tsx`, garantir que selecionar o hit navega via `router.push(hit.href)` (já é o comportamento; adicionar o caso de barcode aos resultados exibidos).

- [ ] **Step 3: Busca textual da lista cobre barcode**

Em `tools/data.ts`, no `buildToolsWhereClause`, adicionar ao OR de busca: `OR EXISTS (SELECT 1 FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.barcode ILIKE ${pattern})`. Em `tool-filters.tsx`, ampliar label/placeholder para incluir "código de barras".

- [ ] **Step 4: check-types + build + smoke**

Run: `bun check-types && bun run build`
Expected: PASS.
Smoke: digitar/escanear um barcode no ⌘K → navega à ferramenta; busca parcial na lista de tools casa pelo código.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard
git commit -m "feat(search): busca por barcode no ⌘K e na lista de ferramentas"
```

---

### Task C2: Highlight da variante no detalhe

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/page.tsx` (ler `?variant=`)
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx` (destacar linha)

**Interfaces:**
- Consumes: query-param `?variant={variantId}` (Task C1).
- Produces: a aba Variantes destaca/scrolla a linha correspondente.

- [ ] **Step 1: Propagar o param**

Em `page.tsx`, ler `sp.variant` e passar `highlightVariantId` ao `VariantsTab` (forçando `?tab=variants` quando presente).

- [ ] **Step 2: Destacar a linha**

Em `variants-tab.tsx`, aplicar um estilo de destaque (ex.: `data-highlight` + classe `bg-accent/40`) à `<TableRow>` cujo `v.id === highlightVariantId`; `scrollIntoView` via `ref` na montagem.

- [ ] **Step 3: check-types + smoke**

Run: `bun check-types`
Expected: PASS.
Smoke: escanear no ⌘K leva ao detalhe com a linha da variante destacada.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/tools/[id]
git commit -m "feat(tools): destaca variante via ?variant no detalhe"
```

---

## Fase D — Pedidos (snapshot) + coordenação e-commerce

### Task D1: Snapshot de barcode em `order_item`

**Files:**
- Modify: `packages/db/src/schema/orders.ts` (`orderItem`)
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (`OrderDetailItem` + mapper)
- Modify: `apps/web/src/app/dashboard/orders/[id]/_components/tabs/items-tab.tsx`

**Interfaces:**
- Produces: `order_item.barcode text` nullable; `OrderDetailItem.barcode: string | null`; exibição condicional.

- [ ] **Step 1: Coluna nullable em order_item**

Em `orders.ts`, em `orderItem`, após `sku`, adicionar `barcode: text("barcode"),` (nullable, **sem** unique, **sem** CHECK — é snapshot histórico).

Run: `bun db:sync`
Expected: `ADD COLUMN barcode text` (não-destrutivo; 42 order_items ficam null).

- [ ] **Step 2: Tipo + mapper no dashboard**

Em `orders/data.ts`, `OrderDetailItem` ganha `barcode: string | null`; no mapper de `items`, adicionar `barcode: item.barcode`.

- [ ] **Step 3: Exibição condicional**

Em `items-tab.tsx`, no bloco de metadados do item, adicionar `{item.barcode && <span>Código de barras: {item.barcode}</span>}`.

- [ ] **Step 4: check-types + smoke**

Run: `bun check-types`
Expected: PASS.
Smoke: `/dashboard/orders/[id]?tab=items` — pedido antigo não mostra linha de barcode (null); não há lixo.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/src/app/dashboard/orders
git commit -m "feat(orders): snapshot de barcode em order_item"
```

---

### Task D2: Contrato e handoff para o e-commerce

**Files:**
- Modify: `packages/db/src/queries/tools.ts` (`getToolBySlug` — SELECT explícito)
- Modify: `docs/integration/admin-ecommerce.md` (tabela de campos de `order_item`)

**Interfaces:**
- Produces: `getToolBySlug` retorna `barcode` em runtime (storefront); contrato documenta o campo.

- [ ] **Step 1: Incluir barcode no SELECT de getToolBySlug**

Em `packages/db/src/queries/tools.ts`, na lista explícita de colunas de `tool_variant` do `getToolBySlug`, adicionar `barcode` (senão o storefront recebe `undefined` mesmo com o tipo correto).

- [ ] **Step 2: Documentar no contrato**

Em `docs/integration/admin-ecommerce.md`, na tabela de campos de `order_item`, adicionar a linha do `barcode` (opcional/nullable: "Snapshot do `tool_variant.barcode`; gravar se disponível").

- [ ] **Step 3: check-types + build**

Run: `bun check-types && bun run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/queries/tools.ts docs/integration/admin-ecommerce.md
git commit -m "feat(db): expõe barcode no getToolBySlug e no contrato"
```

- [ ] **Step 5: Abrir issues de handoff no `emach-ecommerce`**

Criar (via `gh` no repo `emach-ecommerce`, ou registrar como tarefa para o usuário) duas issues:
1. "Checkout: copiar `toolVariant.barcode` → `order_item.barcode` no INSERT" — o CI sincroniza o schema, não o código de checkout.
2. "Coordenação de deploy: garantir backfill de `tool_variant.barcode` antes de qualquer deploy que leia/escreva o campo."

**Gate Fase D:** detalhe de pedido exibe barcode quando presente; PR de sync gerado pelo CI revisado; issues de handoff abertas.

---

## Self-review (cobertura do spec)

- Schema + backfill → A1, A7. Seed/verify → A3. ✔
- Validação obrigatória + dup → A2. ✔
- Editor criar/editar → A4. Normalize/actions → A5. Edição inline → A6. Testes → A2/A5. ✔
- Estoque exibição/busca → B1. Scanner → B2. ✔
- Busca global → C1. Highlight → C2. ✔
- Snapshot pedido → D1. Contrato/handoff e-commerce → D2. ✔
- Decisões (constraint name, no-extra-index, case-sensitive, keyboard-wedge) → Global Constraints + A7. ✔

Sem placeholders de implementação; tipos consistentes (`barcode`/`BranchStockRow.barcode`/`OrderDetailItem.barcode`/`tool_variant_barcode_key` usados de forma idêntica entre tasks).
