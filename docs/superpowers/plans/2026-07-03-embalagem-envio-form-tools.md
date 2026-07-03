# Embalagem & envio no form de tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor `packagingWeightKg`/`stackable`/`shipsInOwnBox` no step "Logística & frete" do form de tools (layout A: subseção fixa) + warning real "não cabe em nenhuma caixa de envio ativa", fechando o gap: o checkout Frenet lê esses campos e nenhuma UI os escreve.

**Architecture:** Zero mudança de schema/banco (colunas existem com defaults). Helper puro client-safe espelha a regra por-unidade do `packItems`; as caixas ativas chegam ao form via `ToolFormContextValue` (mesmo canal dos outros dados server→form). Wizard e edit compartilham os módulos — mexer só em schema/state/steps/fields/payload/hidratação.

**Tech Stack:** Next 16 / React 19, zod v4, vitest, Bun monorepo.

**Spec:** `docs/superpowers/specs/2026-07-03-embalagem-envio-form-tools-design.md`
**Branch/PR:** commits no `issue-frenet` (já em curso); push atualiza othavi0/emach-dashboard#288.

## Global Constraints

- Client Component **não** importa runtime de `@emach/db` (só `import type`) — o helper do warning é cópia local; a busca de caixas é server-side nas pages.
- Regra fiel ao `packItems` (`packages/db/src/queries/shipping-quote.ts`): dims com rotação (`sortedDesc` ≤ par a par) ∧ `tara + peso + embalagem ≤ maxWeightKg` ∧ volume ocupado ≤ interno × `FILL_FACTOR 0.9`, onde ocupado = volume real se empilhável, senão `footprint × altura interna da caixa`.
- Warning só quando `shipsInOwnBox === false`; lista de caixas vazia → warning aparece (fiel: tudo vira outOfCatalog). Não bloqueia submit.
- Copy do warning (verbatim): `Não cabe em nenhuma caixa de envio ativa — na loja este item aparece como "Frete a combinar". Se ele viaja em embalagem própria, ligue a opção acima.`
- Switches ficam FORA de `LabeledField` (convenção do repo — ver `box-form-fields.tsx:131-141`).
- Hook PostToolUse roda `bun fix` após Write/Edit — se Edit falhar com `string not found`, re-Read.
- Commits: Conventional Commits PT, subject ≤50 chars (conferir com `printf '%s' "<subject>" | wc -c`).
- Proibido `console.*`, `any`, `@ts-ignore`.
- O assert `_stepFieldsAreExhaustive` em `tool-form-steps.ts` deve continuar compilando.

---

### Task 1: Helper puro `fits-shipping-box` (TDD)

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_lib/fits-shipping-box.ts`
- Test: `apps/web/src/app/dashboard/tools/_lib/__tests__/fits-shipping-box.test.ts`

**Interfaces:**
- Consumes: `type QuoteBox` de `@emach/db/queries/shipping-quote` (type-only: `{ id: string; internalLengthCm: number; internalWidthCm: number; internalHeightCm: number; maxWeightKg: number; tareWeightKg: number }`).
- Produces: `interface FitCheckItem { heightCm: number; lengthCm: number; packagingWeightKg: number; stackable: boolean; weightKg: number; widthCm: number }` e `fitsAnyActiveBox(item: FitCheckItem, boxes: QuoteBox[]): boolean` — Task 3 consome ambos.

- [ ] **Step 1: Escrever o teste (falhando)**

Conteúdo completo de `apps/web/src/app/dashboard/tools/_lib/__tests__/fits-shipping-box.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type FitCheckItem, fitsAnyActiveBox } from "../fits-shipping-box";

const BOXES = [
	{
		id: "box-s",
		internalLengthCm: 35,
		internalWidthCm: 35,
		internalHeightCm: 30,
		maxWeightKg: 20,
		tareWeightKg: 0.5,
	},
	{
		id: "box-l",
		internalLengthCm: 70,
		internalWidthCm: 60,
		internalHeightCm: 50,
		maxWeightKg: 60,
		tareWeightKg: 1.2,
	},
	{
		id: "box-xl",
		internalLengthCm: 90,
		internalWidthCm: 70,
		internalHeightCm: 60,
		maxWeightKg: 80,
		tareWeightKg: 1.8,
	},
];

const FURADEIRA: FitCheckItem = {
	lengthCm: 35,
	widthCm: 30,
	heightCm: 28,
	weightKg: 15,
	packagingWeightKg: 2,
	stackable: true,
};

describe("fitsAnyActiveBox", () => {
	it("item pequeno cabe (na menor caixa)", () => {
		expect(fitsAnyActiveBox(FURADEIRA, BOXES)).toBe(true);
	});

	it("cabe só com rotação (maior eixo deitado)", () => {
		// 58×20×20 não cabe na box-s em nenhuma orientação (58 > 35),
		// mas cabe na box-l (70×60×50) com o eixo de 58 no comprimento.
		const comprido: FitCheckItem = {
			lengthCm: 20,
			widthCm: 58,
			heightCm: 20,
			weightKg: 10,
			packagingWeightKg: 0,
			stackable: true,
		};
		expect(fitsAnyActiveBox(comprido, BOXES)).toBe(true);
	});

	it("estoura dimensão em todas as caixas → false", () => {
		const gigante: FitCheckItem = {
			lengthCm: 200,
			widthCm: 80,
			heightCm: 80,
			weightKg: 10,
			packagingWeightKg: 0,
			stackable: true,
		};
		expect(fitsAnyActiveBox(gigante, BOXES)).toBe(false);
	});

	it("peso + embalagem + tara estoura o máximo de todas → false", () => {
		// Dims cabem até na box-s, mas 79 + 1 + tara 1.8 = 81.8 > 80 (xl);
		// nas menores estoura ainda mais cedo.
		const denso: FitCheckItem = {
			lengthCm: 30,
			widthCm: 30,
			heightCm: 25,
			weightKg: 79,
			packagingWeightKg: 1,
			stackable: true,
		};
		expect(fitsAnyActiveBox(denso, BOXES)).toBe(false);
	});

	it("peso conta a tara: 78 + 0.5 + 1.8 = 80.3 > 80 → false; sem embalagem extra caberia", () => {
		const noLimite: FitCheckItem = {
			lengthCm: 30,
			widthCm: 30,
			heightCm: 25,
			weightKg: 78,
			packagingWeightKg: 0.5,
			stackable: true,
		};
		expect(fitsAnyActiveBox(noLimite, BOXES)).toBe(false);
		expect(fitsAnyActiveBox({ ...noLimite, packagingWeightKg: 0 }, BOXES)).toBe(
			true
		);
	});

	it("não-empilhável reserva a coluna: item chapado 70×60×1 não cabe na box-l", () => {
		// footprint 70×60 × altura interna 50 = 210000 > 210000×0.9;
		// empilhável, o mesmo item cabe (volume real 4200).
		const chapado: FitCheckItem = {
			lengthCm: 70,
			widthCm: 60,
			heightCm: 1,
			weightKg: 5,
			packagingWeightKg: 0,
			stackable: false,
		};
		expect(fitsAnyActiveBox(chapado, [BOXES[1] as (typeof BOXES)[number]])).toBe(
			false
		);
		expect(
			fitsAnyActiveBox({ ...chapado, stackable: true }, [
				BOXES[1] as (typeof BOXES)[number],
			])
		).toBe(true);
	});

	it("lista de caixas vazia → false", () => {
		expect(fitsAnyActiveBox(FURADEIRA, [])).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test _lib/__tests__/fits-shipping-box`
Expected: FAIL — `Cannot find module '../fits-shipping-box'`.

- [ ] **Step 3: Implementar o helper**

Conteúdo completo de `apps/web/src/app/dashboard/tools/_lib/fits-shipping-box.ts`:

```ts
import type { QuoteBox } from "@emach/db/queries/shipping-quote";

// Espelho client-safe da regra POR UNIDADE de packItems
// (packages/db/src/queries/shipping-quote.ts: fitsByDims + fitsSet +
// occupiedVolume). Duplicado porque Client Component não pode importar
// runtime de @emach/db. Mudou lá → mudar aqui (testes espelham os do motor).
const FILL_FACTOR = 0.9;

export interface FitCheckItem {
	heightCm: number;
	lengthCm: number;
	packagingWeightKg: number;
	stackable: boolean;
	weightKg: number;
	widthCm: number;
}

function sortedDesc(a: number, b: number, c: number): [number, number, number] {
	return [a, b, c].sort((x, y) => y - x) as [number, number, number];
}

function fitsShippingBox(item: FitCheckItem, box: QuoteBox): boolean {
	const i = sortedDesc(item.lengthCm, item.widthCm, item.heightCm);
	const b = sortedDesc(
		box.internalLengthCm,
		box.internalWidthCm,
		box.internalHeightCm
	);
	if (!(i[0] <= b[0] && i[1] <= b[1] && i[2] <= b[2])) {
		return false;
	}
	const weight = box.tareWeightKg + item.weightKg + item.packagingWeightKg;
	if (weight > box.maxWeightKg) {
		return false;
	}
	const unitVolume = item.lengthCm * item.widthCm * item.heightCm;
	// Não-empilhável reserva a coluna inteira acima dele (footprint × altura).
	const occupied = item.stackable
		? unitVolume
		: i[0] * i[1] * box.internalHeightCm;
	const boxVolume =
		box.internalLengthCm * box.internalWidthCm * box.internalHeightCm;
	return occupied <= boxVolume * FILL_FACTOR;
}

/** true se a unidade cabe em ALGUMA caixa ativa — mesma regra do checkout. */
export function fitsAnyActiveBox(
	item: FitCheckItem,
	boxes: QuoteBox[]
): boolean {
	return boxes.some((box) => fitsShippingBox(item, box));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test _lib/__tests__/fits-shipping-box`
Expected: 7 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_lib/fits-shipping-box.ts \
  apps/web/src/app/dashboard/tools/_lib/__tests__/fits-shipping-box.test.ts
git commit -m "feat(web): helper fits-shipping-box + testes"
```

---

### Task 2: Campos no schema, state, steps, payload e hidratação

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` (objeto `toolFormSchema`)
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-state.ts:6-15` e `EMPTY_TOOL_VALUES`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts` (`STEP_FIELDS.logistics`)
- Modify: `apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts` (`normalizeToolPayload`)
- Modify: `apps/web/src/app/dashboard/tools/[id]/edit/page.tsx` (`toFormValues`)
- Test: `apps/web/__tests__/tool-schema-embalagem.test.ts` (novo)

**Interfaces:**
- Produces: `ToolFormValues` ganha `packagingWeightKg: number` (default 0), `stackable: boolean` (default true), `shipsInOwnBox: boolean` (default false). `ToolFormState` trata `packagingWeightKg` como `number | undefined`. Task 3 consome via `values.*`/`onPatch`.

- [ ] **Step 1: Teste de defaults do zod (falhando)**

Conteúdo completo de `apps/web/__tests__/tool-schema-embalagem.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toolFormSchema } from "@/app/dashboard/tools/_components/tool-schema";

// Input mínimo válido: status draft dispensa imagens/NCM/specs (superRefine).
const BASE = {
	name: "Furadeira X",
	status: "draft",
	weightKg: 2.5,
	lengthCm: 30,
	widthCm: 10,
	heightCm: 20,
	categoryIds: ["cat-1"],
	primaryCategoryId: "cat-1",
	visibleOnSite: true,
	images: [],
	variants: [
		{ sku: "SKU-1", barcode: "789", priceAmount: 100, isDefault: true, sortOrder: 0 },
	],
	attributeValues: {},
	attributeAssignments: [],
	videoUrl: null,
	videoPosterUrl: null,
};

describe("toolFormSchema — defaults de embalagem", () => {
	it("ausentes → 0 / true / false", () => {
		const r = toolFormSchema.safeParse(BASE);
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.packagingWeightKg).toBe(0);
			expect(r.data.stackable).toBe(true);
			expect(r.data.shipsInOwnBox).toBe(false);
		}
	});

	it("NaN no peso da embalagem → 0 (máscara vazia)", () => {
		const r = toolFormSchema.safeParse({ ...BASE, packagingWeightKg: Number.NaN });
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.packagingWeightKg).toBe(0);
		}
	});

	it("negativo → erro de validação", () => {
		const r = toolFormSchema.safeParse({ ...BASE, packagingWeightKg: -1 });
		expect(r.success).toBe(false);
	});

	it("valores explícitos preservados", () => {
		const r = toolFormSchema.safeParse({
			...BASE,
			packagingWeightKg: 1.5,
			stackable: false,
			shipsInOwnBox: true,
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.packagingWeightKg).toBe(1.5);
			expect(r.data.stackable).toBe(false);
			expect(r.data.shipsInOwnBox).toBe(true);
		}
	});
});
```

(Confirme o alias de import olhando `apps/web/__tests__/tool-form-steps.test.ts` — se lá usar caminho relativo, use o mesmo estilo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test __tests__/tool-schema-embalagem`
Expected: FAIL — `packagingWeightKg` undefined no output (campo não existe no schema).

- [ ] **Step 3: `tool-schema.ts`** — dentro do `z.object({...})` do `toolFormSchema`, logo após `heightCm: requiredPositiveNumber,`, adicionar:

```ts
		// Embalagem & envio — insumos do packItems no checkout (Frenet).
		packagingWeightKg: z
			.number()
			.nonnegative("Deve ser maior ou igual a zero")
			.optional()
			.or(z.nan().transform(() => undefined))
			.transform((v) => v ?? 0),
		stackable: z.boolean().default(true),
		shipsInOwnBox: z.boolean().default(false),
```

- [ ] **Step 4: `tool-form-state.ts`** — o tipo vira:

```ts
export type ToolFormState = Omit<
	ToolFormValues,
	"weightKg" | "lengthCm" | "widthCm" | "heightCm" | "packagingWeightKg"
> & {
	weightKg?: number;
	lengthCm?: number;
	widthCm?: number;
	heightCm?: number;
	packagingWeightKg?: number;
};
```

E em `EMPTY_TOOL_VALUES`, após `heightCm: undefined,`:

```ts
	packagingWeightKg: undefined,
	stackable: true,
	shipsInOwnBox: false,
```

- [ ] **Step 5: `tool-form-steps.ts`** — `STEP_FIELDS.logistics` vira:

```ts
	logistics: [
		"weightKg",
		"lengthCm",
		"widthCm",
		"heightCm",
		"powerWatts",
		"packagingWeightKg",
		"stackable",
		"shipsInOwnBox",
	],
```

- [ ] **Step 6: `tool-query-helpers.ts`** — em `normalizeToolPayload`, após `heightCm: input.heightCm.toFixed(2),`:

```ts
		packagingWeightKg: input.packagingWeightKg.toFixed(3),
		stackable: input.stackable,
		shipsInOwnBox: input.shipsInOwnBox,
```

- [ ] **Step 7: `edit/page.tsx`** — em `toFormValues`, após `heightCm: ...`:

```ts
		packagingWeightKg: Number(row.packagingWeightKg),
		stackable: row.stackable,
		shipsInOwnBox: row.shipsInOwnBox,
```

- [ ] **Step 8: Rodar e ver passar + suíte**

Run: `bun --cwd apps/web test __tests__/tool-schema-embalagem && bun check-types && bun --cwd apps/web test`
Expected: novo teste PASS; check-types verde (o assert de exaustividade valida os 3 em STEP_FIELDS); suíte completa verde.

- [ ] **Step 9: Commit**

```bash
git add -A apps/web/src/app/dashboard/tools apps/web/__tests__
git commit -m "feat(web): campos de embalagem no schema do form"
```

---

### Task 3: Subseção "Embalagem & envio" + warning no step Logística

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-context.tsx` (campo novo no context)
- Modify: `apps/web/src/app/dashboard/tools/new/page.tsx` (fetch caixas + provider)
- Modify: `apps/web/src/app/dashboard/tools/[id]/edit/page.tsx` (idem)
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/logistics-fields.tsx` (subseção + warning)

**Interfaces:**
- Consumes: `fitsAnyActiveBox`/`FitCheckItem` (Task 1); campos de `ToolFormValues`/`ToolFormState` (Task 2); `getActiveBoxes(db): Promise<QuoteBox[]>` de `@emach/db/queries/shipping` (server-side).
- Produces: `ToolFormContextValue.activeBoxes: QuoteBox[]` (obrigatório — as DUAS pages precisam passar).

- [ ] **Step 1: `tool-form-context.tsx`** — adicionar o import type e o campo:

```ts
import type { QuoteBox } from "@emach/db/queries/shipping-quote";
```

e em `ToolFormContextValue`:

```ts
	activeBoxes: QuoteBox[];
```

(import type é apagado no compile — permitido em `"use client"`.)

- [ ] **Step 2: `new/page.tsx`** — adicionar imports:

```ts
import { getActiveBoxes } from "@emach/db/queries/shipping";
```

No `Promise.all`, adicionar `getActiveBoxes(db)` como 4º item e capturar como `activeBoxes`:

```ts
	const [categories, definitionsByCategory, allDefinitions, activeBoxes] =
		await Promise.all([
			/* ...3 queries existentes inalteradas... */
			getActiveBoxes(db),
		]);
```

E no `ToolFormProvider`, adicionar `activeBoxes,` ao objeto `value`.

- [ ] **Step 3: `edit/page.tsx`** — mesmos import; adicionar `getActiveBoxes(db)` ao final do `Promise.all` existente (capturar como `activeBoxes` no destructuring) e `activeBoxes,` no objeto `value` do `ToolFormProvider`.

- [ ] **Step 4: `logistics-fields.tsx`** — conteúdo final completo:

```tsx
"use client";

import { TriangleAlert } from "lucide-react";

import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { Switch } from "@emach/ui/components/switch";
import type { Mask } from "@/lib/masks";
import { decimalMask, integerMask } from "@/lib/masks";
import { fitsAnyActiveBox } from "../../_lib/fits-shipping-box";
import { useToolFormContext } from "../tool-form-context";
import type { ToolFormState } from "../tool-form-state";
import type { ToolFieldGroupProps } from "./types";

function dimsReady(v: ToolFormState): boolean {
	return [v.weightKg, v.lengthCm, v.widthCm, v.heightCm].every(
		(n) => typeof n === "number" && n > 0
	);
}

export function LogisticsFields({
	values,
	onPatch,
	errors,
	disabled,
}: ToolFieldGroupProps) {
	const { activeBoxes } = useToolFormContext();
	const showNoFit =
		dimsReady(values) &&
		!values.shipsInOwnBox &&
		!fitsAnyActiveBox(
			{
				lengthCm: values.lengthCm ?? 0,
				widthCm: values.widthCm ?? 0,
				heightCm: values.heightCm ?? 0,
				weightKg: values.weightKg ?? 0,
				packagingWeightKg: values.packagingWeightKg ?? 0,
				stackable: values.stackable,
			},
			activeBoxes
		);
	return (
		<div className="flex flex-col gap-4">
			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				A loja usa peso e medidas para cotar o frete no checkout.
				<HelpTooltip
					body="A loja consolida os itens do carrinho nas caixas de envio cadastradas e cota o frete na Frenet. Sem esses valores, o cliente não consegue fechar o pedido. Item que não cabe na maior caixa ativa aparece como 'Frete a combinar'."
					example="Peso 2,5 kg · 30×20×10 cm"
					title="Por que peso e dimensões são obrigatórios"
				/>
			</p>
			<div className="grid gap-4 md:grid-cols-5">
				<FieldNum
					disabled={disabled}
					error={errors.weightKg}
					id="weightKg"
					label="Peso (kg)"
					mask={decimalMask}
					onChange={(v) => onPatch({ weightKg: v })}
					placeholder="Ex: 2,5"
					required
					value={values.weightKg}
				/>
				<FieldNum
					disabled={disabled}
					error={errors.lengthCm}
					id="lengthCm"
					label="Comprimento (cm)"
					mask={decimalMask}
					onChange={(v) => onPatch({ lengthCm: v })}
					placeholder="Ex: 30"
					required
					value={values.lengthCm}
				/>
				<FieldNum
					disabled={disabled}
					error={errors.widthCm}
					id="widthCm"
					label="Largura (cm)"
					mask={decimalMask}
					onChange={(v) => onPatch({ widthCm: v })}
					placeholder="Ex: 10"
					required
					value={values.widthCm}
				/>
				<FieldNum
					disabled={disabled}
					error={errors.heightCm}
					id="heightCm"
					label="Altura (cm)"
					mask={decimalMask}
					onChange={(v) => onPatch({ heightCm: v })}
					placeholder="Ex: 20"
					required
					value={values.heightCm}
				/>
				<FieldNum
					disabled={disabled}
					id="powerWatts"
					label="Potência (W)"
					mask={integerMask}
					onChange={(v) => onPatch({ powerWatts: v })}
					placeholder="Ex: 700"
					value={values.powerWatts}
				/>
			</div>

			<div className="flex flex-col gap-3">
				<h3 className="flex items-center gap-1.5 font-medium text-sm">
					Embalagem & envio
					<HelpTooltip
						body="Como o item entra na consolidação de caixas do frete. O peso da embalagem (espuma/proteção) soma ao peso do produto no despacho."
						example="Compressor: produto 58 kg + embalagem 1,5 kg"
						title="Consolidação de frete"
					/>
				</h3>
				<div className="flex max-w-xs flex-col gap-2">
					<LabeledField
						error={errors.packagingWeightKg}
						hint="Somado ao peso do produto no despacho."
						id="packagingWeightKg"
						label="Peso da embalagem (kg)"
					>
						{(field) => (
							<MaskedInput
								{...field}
								disabled={disabled}
								mask={decimalMask}
								onChange={(v) => onPatch({ packagingWeightKg: v })}
								placeholder="0"
								value={values.packagingWeightKg}
							/>
						)}
					</LabeledField>
				</div>
				<div className="flex items-center gap-3">
					<Switch
						checked={values.stackable}
						disabled={disabled}
						id="stackable"
						onCheckedChange={(checked) => onPatch({ stackable: checked })}
					/>
					<label
						className="flex cursor-pointer items-center gap-1.5 text-sm"
						htmlFor="stackable"
					>
						Empilhável
						<HelpTooltip text="Pode ir sobre/sob outros itens dentro da caixa. Desligado, o item reserva a coluna inteira acima dele na consolidação." />
					</label>
				</div>
				<div className="flex items-center gap-3">
					<Switch
						checked={values.shipsInOwnBox}
						disabled={disabled}
						id="shipsInOwnBox"
						onCheckedChange={(checked) => onPatch({ shipsInOwnBox: checked })}
					/>
					<label
						className="flex cursor-pointer items-center gap-1.5 text-sm"
						htmlFor="shipsInOwnBox"
					>
						Viaja na própria embalagem
						<HelpTooltip text="Não consolida com outros itens: a cotação usa as próprias dimensões do produto (ex.: item de 180 cm que não entra em caixa)." />
					</label>
				</div>
				{showNoFit && (
					<div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
						<TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
						<p className="text-foreground text-xs leading-relaxed">
							Não cabe em nenhuma caixa de envio ativa — na loja este item
							aparece como <strong>"Frete a combinar"</strong>. Se ele viaja em
							embalagem própria, ligue a opção acima.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

function FieldNum({
	id,
	label,
	required,
	error,
	disabled,
	mask,
	placeholder,
	value,
	onChange,
}: {
	id: string;
	label: string;
	required?: boolean;
	error?: string;
	disabled?: boolean;
	mask: Mask<number>;
	placeholder: string;
	value?: number;
	onChange: (v: number | undefined) => void;
}) {
	return (
		<LabeledField error={error} id={id} label={label} required={required}>
			{(field) => (
				<MaskedInput
					{...field}
					aria-required={required ? "true" : undefined}
					disabled={disabled}
					mask={mask}
					onChange={onChange}
					placeholder={placeholder}
					value={value}
				/>
			)}
		</LabeledField>
	);
}
```

(Se `bun fix` reordenar imports, deixe — o hook manda. Se o caminho de `Switch` divergir, copie o import de `box-form-fields.tsx`.)

- [ ] **Step 5: Verificar**

Run: `bun check-types && bun check && bun --cwd apps/web test`
Expected: tudo verde. Se `check-types` acusar `activeBoxes` faltando em algum `ToolFormProvider`, é um provider esquecido — as DUAS pages (new e edit) precisam passar.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src/app/dashboard/tools
git commit -m "feat(web): seção embalagem & envio no form"
```

---

### Task 4: Linhas de embalagem no detalhe do tool

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx:103-128` (card "Logística & metadados")

**Interfaces:**
- Consumes: `tool.packagingWeightKg` (string numeric), `tool.stackable`, `tool.shipsInOwnBox` — a prop `tool` já é o row completo (`db.select().from(tool)`); confirme que o tipo da prop expõe os 3 campos (se for `Tool` do schema, expõe).

- [ ] **Step 1: Adicionar as 2 `MetaRow`** — dentro do `<dl>` do card "Logística & metadados", logo após a `MetaRow label="Visibilidade"`:

```tsx
							<MetaRow label="Embalagem">
								{Number(tool.packagingWeightKg) > 0
									? `+${formatMeasure(tool.packagingWeightKg, "kg")}`
									: "—"}
							</MetaRow>
							<MetaRow label="Envio">
								{tool.shipsInOwnBox ? "Embalagem própria" : "Consolida em caixa"}
								{tool.stackable ? "" : " · não empilhável"}
							</MetaRow>
```

Import: `formatMeasure` de `@/lib/format/number` (confira a assinatura real no arquivo — `tool-specs.tsx` já a usa como referência de chamada; ajuste `(valor, "kg")` ao formato dela). **Nunca** interpolar `tool.packagingWeightKg` cru (string US "1.500" vira "mil e quinhentos" em pt-BR — regra do CLAUDE.md).

- [ ] **Step 2: Verificar**

Run: `bun check-types && bun check`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/tools
git commit -m "feat(web): embalagem no detalhe da ferramenta"
```

---

### Task 5: Verificação integrada + smoke + PR (main loop)

**Files:** nenhum código. Executar no main loop (dev server já de pé no :3007, sessão `emach-smoke` do agent-browser logada como super_admin).

- [ ] **Step 1:** `bun verify` — tudo verde.
- [ ] **Step 2: Smoke** no `:3007` (sessão `emach-smoke`):
  - `/dashboard/tools/new` → step Logística: subseção "Embalagem & envio" com campo + 2 switches; preencher dims 200×80×80 + peso 10 → warning aparece; ligar "Viaja na própria embalagem" → warning some.
  - Editar o Compressor (58kg): preencher "Peso da embalagem" 1,5, salvar; reabrir edit → valor persistiu; overview mostra "Embalagem +1,5 kg" e "Envio: Consolida em caixa".
  - Confirmação de persistência no banco (read-only): `SELECT packaging_weight_kg, stackable, ships_in_own_box FROM tool WHERE name ILIKE '%compressor%';`
  - Reverter o dado do smoke (embalagem de volta a 0) pela própria UI, para não deixar sujeira de teste.
- [ ] **Step 3: Atualizar o corpo do PR #288** — `gh pr edit 288 --repo othavi0/emach-dashboard --body-file <arquivo>` com o corpo atual + seção nova:

```markdown
## Embalagem & envio no form (follow-up no mesmo PR)

Fecha o gap: o checkout Frenet lê `packaging_weight_kg`/`stackable`/`ships_in_own_box` no `packItems`, mas nenhuma UI os escrevia. Agora o step "Logística & frete" tem a subseção **Embalagem & envio** (peso da embalagem + empilhável + viaja na própria embalagem, defaults seguros) e um warning fiel ao algoritmo — "não cabe em **nenhuma** caixa de envio ativa" (helper client-safe espelhando `packItems`, com testes) — substituindo em espírito o antigo aviso de 30kg do SuperFrete. O detalhe do tool exibe as novas informações. Spec: `docs/superpowers/specs/2026-07-03-embalagem-envio-form-tools-design.md`.
```

- [ ] **Step 4:** `git push` (atualiza o PR) e registrar no ledger.

---

## Self-review (executado na escrita)

- **Cobertura da spec:** §2 form → Tasks 2-3; §3 warning → Tasks 1+3; §4 detalhe → Task 4; §5 testes/smoke → Tasks 1, 2, 5; §6 entrega → Task 5. Refinamento consciente vs spec: o helper inclui `stackable` no volume ocupado (spec simplificava; a regra fiel do `packItems` o exige — teste "chapado" cobre).
- **Placeholders:** nenhum; os dois pontos "confira a assinatura real" (`formatMeasure`, alias de import de teste) são instruções concretas de verificação contra o código vivo, com referência nomeada.
- **Consistência de tipos:** `FitCheckItem`/`fitsAnyActiveBox` idênticos entre Tasks 1 e 3; `activeBoxes: QuoteBox[]` entre context e pages; campos do zod (Task 2) = campos usados na UI (Task 3) = colunas lidas (Task 4).
