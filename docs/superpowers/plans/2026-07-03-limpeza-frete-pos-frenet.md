# Limpeza de frete pós-Frenet (issue #287) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dropar o motor próprio de tabelas de frete (`carrier`/`carrier_zone`/`carrier_rate`) e todo o código morto pós-Frenet (coluna `tool.overweight_shipping_amount`, `quoteShipping`, UI de transportadoras, copy SuperFrete), preservando intacto o que o checkout Frenet do ecommerce consome (`shippingBox`, `getActiveBoxes`, `packItems`, `QuoteItem`).

**Architecture:** Remoção em camadas na ordem consumidor→provedor para manter cada commit verde: (1) UI dashboard, (2) form de tools, (3) queries do motor, (4) schema+seed, (5) drop físico, (6) docs. O gate final do lado ecommerce é o PR automático do `sync-db-schema.yml` passar CI lá.

**Tech Stack:** Next 16 / React 19, Drizzle 0.45 push-only (ADR-0006), Bun workspaces, Biome/ultracite, vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-limpeza-frete-pos-frenet-design.md`

## Global Constraints

- **Símbolos que o ecommerce importa e NÃO podem sumir** (verificado na main de othavi0/emach-ecommerce em 2026-07-03): `getActiveBoxes` (de `@emach/db/queries/shipping`), `packItems` e `type QuoteItem` (de `@emach/db/queries/shipping-quote`). Os tipos `QuoteBox` e `ShippingPackage` fazem parte das assinaturas de ambos — ficam também.
- Commits: Conventional Commits em PT, subject ≤50 chars.
- Proibido `console.*` (usar `logger`), `any`, `@ts-ignore`.
- Hook PostToolUse roda `bun fix` após Write/Edit — pode reordenar campos e invalidar `old_string` de Edits subsequentes; re-ler o arquivo se um Edit falhar com "string not found".
- lefthook pre-commit roda `bun fix` + `git add -u` no commit.
- `scripts/enrich-demo.ts:748,848` usa `carrier:` como chave de metadata JSON de `orderEvent` — **não é a tabela; não tocar**.
- Comandos rodam da **raiz do monorepo** (turbo/bun).

## Setup (antes da Task 1)

```bash
git checkout -b chore/287-limpeza-frete-pos-frenet
```

---

### Task 1: Remover UI de transportadoras + reestruturar `/dashboard/shipping`

**Files:**
- Delete: `apps/web/src/app/dashboard/shipping/carriers/` (diretório inteiro — 13 arquivos)
- Delete: `apps/web/src/app/dashboard/shipping/preview-action.ts`
- Delete: `apps/web/src/app/dashboard/shipping/_lib/` (diretório inteiro: `derive-zone-name.ts` + `__tests__/derive-zone-name.test.ts`)
- Delete em `apps/web/src/app/dashboard/shipping/_components/`: `carriers-tab.tsx`, `carrier-card.tsx`, `carrier-card-grid.tsx`, `carrier-schema.ts`, `carrier-form-fields.tsx`, `carrier-wizard.tsx`, `carrier-wizard-steps.ts`, `zone-schema.ts`, `zone-fieldset.tsx`, `rate-rows-editor.tsx`, `shipping-header-action.tsx`, `__tests__/carrier-schema.test.ts`
- Modify: `apps/web/src/app/dashboard/shipping/page.tsx` (reescrita completa abaixo)
- Modify: `apps/web/src/app/dashboard/shipping/data.ts` (reescrita completa abaixo)
- Modify: `apps/web/src/app/dashboard/shipping/actions.ts` (remoção cirúrgica abaixo)
- Modify: `apps/web/src/app/dashboard/shipping/_components/shipping-preview-rail.tsx` (só o array `rows`)
- Modify: `apps/web/src/lib/capabilities.ts:295,302` (descrições)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `data.ts` exporta apenas `ShippingBoxRow` + `getBoxes()`; `actions.ts` exporta apenas `getOrCreateShippingSettings`, `listOriginBranchOptions`, `updateShippingSettings`, `createBox`, `updateBox` (+ `type OriginBranchOption`). Nenhuma outra task depende dos removidos.

- [ ] **Step 1: Deletar arquivos**

```bash
git rm -r apps/web/src/app/dashboard/shipping/carriers
git rm apps/web/src/app/dashboard/shipping/preview-action.ts
git rm -r apps/web/src/app/dashboard/shipping/_lib
cd apps/web/src/app/dashboard/shipping/_components
git rm carriers-tab.tsx carrier-card.tsx carrier-card-grid.tsx carrier-schema.ts \
  carrier-form-fields.tsx carrier-wizard.tsx carrier-wizard-steps.ts \
  zone-schema.ts zone-fieldset.tsx rate-rows-editor.tsx shipping-header-action.tsx \
  __tests__/carrier-schema.test.ts
cd -
```

- [ ] **Step 2: Reescrever `page.tsx`** (2 tabs, Caixas default, sem header action)

Conteúdo final completo:

```tsx
import { Package, Settings } from "lucide-react";
import type { Metadata } from "next";

import { type EntityTab, EntityTabs } from "@/components/entity/entity-tabs";
import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { BoxesTab } from "./_components/boxes-tab";
import { ShippingPreviewRail } from "./_components/shipping-preview-rail";
import { ShippingSettingsForm } from "./_components/shipping-settings-form";
import {
	getOrCreateShippingSettings,
	listOriginBranchOptions,
} from "./actions";

export const metadata: Metadata = { title: "Frete" };

const GRID = "grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]";

interface PageProps {
	searchParams: Promise<{ tab?: string }>;
}

export default function ShippingPage({ searchParams }: PageProps) {
	return <ShippingPageContent searchParams={searchParams} />;
}

async function ShippingPageContent({ searchParams }: PageProps) {
	await requireCapabilityOrRedirect("shipping.read");
	const sp = await searchParams;

	const [settings, originOptions] = await Promise.all([
		getOrCreateShippingSettings(),
		listOriginBranchOptions(),
	]);
	const originLabel =
		originOptions.find((o) => o.id === settings.shippingOriginBranchId)?.name ??
		null;

	const tabs: EntityTab[] = [
		{
			value: "caixas",
			label: "Caixas",
			icon: <Package aria-hidden className="size-3.5" />,
			content: sp.tab === "config" ? null : <BoxesTab />,
		},
		{
			value: "config",
			label: "Configurações",
			icon: <Settings aria-hidden className="size-3.5" />,
			content: (
				<div className={GRID}>
					<ShippingSettingsForm
						originOptions={originOptions}
						settings={{
							originBranchId: settings.shippingOriginBranchId,
							insurancePolicy: settings.shippingInsurancePolicy,
							insuranceCapAmount: Number(settings.shippingInsuranceCapAmount),
						}}
					/>
					<ShippingPreviewRail
						insuranceCapAmount={Number(settings.shippingInsuranceCapAmount)}
						insurancePolicy={settings.shippingInsurancePolicy}
						originLabel={originLabel}
					/>
				</div>
			),
		},
	];

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description="Caixas de envio e configurações de frete da loja."
				title="Frete"
			/>
			<EntityTabs defaultValue="caixas" tabs={tabs} />
		</div>
	);
}
```

Nota: o botão "Nova caixa" já existe dentro de `BoxesTab` (`boxes-tab.tsx:27-36`, link `?newBox=1`) — o header fica sem action.

- [ ] **Step 3: Reescrever `data.ts`**

Conteúdo final completo:

```ts
import "server-only";

import { db } from "@emach/db";
import { shippingBox } from "@emach/db/schema/shipping";
import { asc } from "drizzle-orm";

export interface ShippingBoxRow {
	active: boolean;
	id: string;
	internalHeightCm: string;
	internalLengthCm: string;
	internalWidthCm: string;
	maxWeightKg: string;
	name: string;
	tareWeightKg: string;
}

export async function getBoxes(): Promise<ShippingBoxRow[]> {
	const rows = await db
		.select()
		.from(shippingBox)
		.orderBy(asc(shippingBox.sortOrder), asc(shippingBox.name));
	return rows.map((b) => ({
		id: b.id,
		name: b.name,
		internalLengthCm: b.internalLengthCm,
		internalWidthCm: b.internalWidthCm,
		internalHeightCm: b.internalHeightCm,
		maxWeightKg: b.maxWeightKg,
		tareWeightKg: b.tareWeightKg,
		active: b.active,
	}));
}
```

- [ ] **Step 4: Enxugar `actions.ts`**

Deletar as funções `fetchCarriersPage` (L214-222), `numOrNull` (L224-226), `createCarrierWithZones` (L228-292), `updateCarrier` (L294-335), `deleteCarrier` (L337-356), `upsertZone` (L358-410), `deleteZone` (L412-432), `saveZoneRates` (L434-474). **Manter intactas** as funções `getOrCreateShippingSettings`, `listOriginBranchOptions` (+ `interface OriginBranchOption`), `updateShippingSettings`, `createBox`, `updateBox` e as consts `SHIPPING_PATH`/`SINGLETON_ID`.

Bloco de imports final (substitui L1-44):

```ts
"use server";

import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { shippingBox } from "@emach/db/schema/shipping";
import {
	type StoreSettings,
	storeSettings,
} from "@emach/db/schema/store-settings";
import { asc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import type { BoxFormValues } from "./_components/box-schema";
import { boxSchema } from "./_components/box-schema";
import {
	type ShippingSettingsFormValues,
	shippingSettingsSchema,
} from "./_components/shipping-schema";
```

(Saem: `carrier`/`carrierRate`/`carrierZone`, `normalizeCnpj`, `getPgError`, `InfiniteResult`, `carrier-schema`, `zone-schema`, `deriveZoneName`, `CarrierBaseRow`.)

- [ ] **Step 5: Atualizar `shipping-preview-rail.tsx`**

Substituir o array `rows` (L24-39) por:

```ts
	const rows: PreviewRow[] = [
		{
			label: "Origem do despacho",
			value: originLabel ?? "Sem origem definida",
		},
		{
			label: "Seguro declarado",
			value:
				insurancePolicy === "cart_value"
					? `Valor do carrinho (até ${BRL.format(insuranceCapAmount)})`
					: "Sem seguro",
		},
		{
			label: "Cotação",
			value: "Frenet (multi-transportadora), por caixa de envio",
		},
		{ label: "Item fora do catálogo de caixas", value: "Frete a combinar" },
		{ label: "Frete grátis", value: "Apenas via cupom de promoção" },
	];
```

- [ ] **Step 6: Atualizar descrições em `capabilities.ts`**

`shipping.read` (L295): `description: "Visualizar caixas de envio e config de frete",`
`shipping.manage` (L302): `description: "Criar/editar caixas de envio e config de frete",`

- [ ] **Step 7: Verificar**

```bash
bun check-types && bun check
bun --cwd apps/web test
bun run build
```

Expected: tudo verde. **`bun run build` é gate obrigatório** — `actions.ts` é arquivo `"use server"` refatorado (regra "Only async functions are allowed to be exported" só aparece no build).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(web): remove UI de transportadoras (#287)"
```

---

### Task 2: Form de tools — remover `overweightShippingAmount` + copy Frenet

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/logistics-fields.tsx` (reescrita completa)
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts:26-30,127`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-state.ts:6-15,38`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts:63`
- Modify: `apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts:46`
- Modify: `apps/web/src/app/dashboard/tools/[id]/edit/page.tsx:96-98`
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx:110-114`

**Interfaces:**
- Consumes: nada.
- Produces: `ToolFormValues`/`ToolFormState` sem `overweightShippingAmount`. A coluna DB ainda existe até a Task 4 — inserts passam a omiti-la (coluna nullable, sem quebra).

- [ ] **Step 1: Reescrever `logistics-fields.tsx`**

Conteúdo final completo:

```tsx
"use client";

import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import type { Mask } from "@/lib/masks";
import { decimalMask, integerMask } from "@/lib/masks";
import type { ToolFieldGroupProps } from "./types";

export function LogisticsFields({
	values,
	onPatch,
	errors,
	disabled,
}: ToolFieldGroupProps) {
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

(Saem: `TriangleAlert`, `exceedsShippingQuoteLimit`, o bloco condicional de overweight e o import de `ToolFormState`.)

- [ ] **Step 2: `tool-schema.ts`** — deletar a linha `overweightShippingAmount: optionalNumber,` (L127). O helper `optionalNumber` (L26-30) fica órfão — deletá-lo também (única referência era essa linha; `bun check` acusa unused se sobrar).

- [ ] **Step 3: `tool-form-state.ts`** — no `Omit` (L6-9), remover `| "overweightShippingAmount"`; remover a linha `overweightShippingAmount?: number;` (L14) e a linha `overweightShippingAmount: undefined,` do `EMPTY_TOOL_VALUES` (L38).

- [ ] **Step 4: `tool-form-steps.ts`** — remover `"overweightShippingAmount",` do array `STEP_FIELDS.logistics` (L63). O assert de exaustividade `_stepFieldsAreExhaustive` continua compilando (o campo saiu do schema na Step 2).

- [ ] **Step 5: `tool-query-helpers.ts`** — remover a linha `overweightShippingAmount: toNumericString(input.overweightShippingAmount),` (L46) de `normalizeToolPayload`. `toNumericString` continua exportado (pode ter outros usos); se `bun check` acusar unused, remover também.

- [ ] **Step 6: `edit/page.tsx`** — remover as linhas do mapeamento (L96-98):

```ts
		overweightShippingAmount: row.overweightShippingAmount
			? Number(row.overweightShippingAmount)
			: undefined,
```

- [ ] **Step 7: `overview-tab.tsx`** — remover o bloco `MetaRow` (L110-114):

```tsx
							<MetaRow label="Frete > 30kg">
								{tool.overweightShippingAmount === null
									? "a combinar"
									: BRL.format(Number(tool.overweightShippingAmount))}
							</MetaRow>
```

Se `BRL` (L19) ficar sem uso no arquivo, remover a const (`bun check` acusa).

- [ ] **Step 8: Verificar**

```bash
bun check-types && bun check && bun --cwd apps/web test
rg -n 'overweightShipping' apps/web/src
```

Expected: verde; rg sem resultados.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(web): remove frete overweight do form de tool"
```

---

### Task 3: `packages/db` — enxugar queries do motor

**Files:**
- Modify: `packages/db/src/queries/shipping.ts` (reescrita completa)
- Modify: `packages/db/src/queries/shipping-quote.ts` (remoção cirúrgica)
- Modify: `packages/db/src/queries/__tests__/shipping-quote.test.ts` (reescrita completa)

**Interfaces:**
- Consumes: Task 1 já removeu os únicos consumidores dashboard (`preview-action.ts`).
- Produces: `queries/shipping.ts` exporta só `getActiveBoxes(db)`. `queries/shipping-quote.ts` exporta só `QuoteItem`, `QuoteBox`, `ShippingPackage`, `packItems` — exatamente o que o ecommerce importa.

- [ ] **Step 1: Reescrever `queries/shipping.ts`**

Conteúdo final completo:

```ts
import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { shippingBox } from "../schema/shipping";
import type { QuoteBox } from "./shipping-quote";

type AnyDb = NodePgDatabase<Record<string, unknown>>;

export async function getActiveBoxes(db: AnyDb): Promise<QuoteBox[]> {
	const rows = await db
		.select()
		.from(shippingBox)
		.where(eq(shippingBox.active, true))
		.orderBy(asc(shippingBox.sortOrder));

	return rows.map((b) => ({
		id: b.id,
		internalLengthCm: Number(b.internalLengthCm),
		internalWidthCm: Number(b.internalWidthCm),
		internalHeightCm: Number(b.internalHeightCm),
		maxWeightKg: Number(b.maxWeightKg),
		tareWeightKg: Number(b.tareWeightKg),
	}));
}
```

- [ ] **Step 2: Enxugar `queries/shipping-quote.ts`**

Deletar: `QuoteRate` (L102-107), `QuoteZone` (L109-114), `QuoteCarrier` (L116-126), `UnquotableReason` (L128), `QuoteResult` (L130-142), `onlyDigits` (L144-146), `matchCepRange` (L148-159), `round2` (L161-163), `quoteShipping` inteiro com seu comentário biome-ignore (L165-258).

**Manter intactos**: `QuoteItem`, `QuoteBox`, `ShippingPackage`, `FILL_FACTOR`, `sortedDesc`, `fitsByDims`, `unitVolume`, `footprint`, `occupiedVolume`, `boxVolume`, `dispatchWeight`, `fitsSet`, `emitPackage`, `packItems`.

Substituir o comentário de cabeçalho (L1-3) por:

```ts
// Consolidação do carrinho em caixas — funções PURAS (sem DB, sem server-only).
// Vive em queries/ p/ sincronizar ao ecommerce via CI (ADR-0009).
// Consumido pelo checkout do storefront: cada pacote de packItems vira uma
// linha do ShippingItemArray na cotação Frenet; pacote outOfCatalog → "a
// combinar" (sem chamar a API).
```

- [ ] **Step 3: Reescrever o teste**

Conteúdo final completo de `__tests__/shipping-quote.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	packItems,
	type QuoteBox,
	type QuoteItem,
} from "../shipping-quote";

const FURADEIRA: QuoteItem = {
	lengthCm: 35,
	widthCm: 30,
	heightCm: 28,
	weightKg: 15,
	packagingWeightKg: 2,
	stackable: false,
	shipsInOwnBox: false,
	qty: 1,
};

const BOXES: QuoteBox[] = [
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

describe("packItems", () => {
	it("1 furadeira → 1 pacote (caixa pequena), peso = produto + embalagem + tara", () => {
		const pkgs = packItems([{ ...FURADEIRA, qty: 1 }], BOXES);
		expect(pkgs).toHaveLength(1);
		expect(pkgs[0]?.weightKg).toBeCloseTo(17.5, 3); // 15 + 2 + 0.5 (box-s)
		expect(pkgs[0]?.outOfCatalog).toBe(false);
	});

	it("4 furadeiras → 1 pacote consolidado (não 4)", () => {
		const pkgs = packItems([{ ...FURADEIRA, qty: 4 }], BOXES);
		expect(pkgs).toHaveLength(1);
		// 4×17 = 68kg + tara box-xl 1.8 = 69.8 (box-l estoura 60kg)
		expect(pkgs[0]?.weightKg).toBeCloseTo(69.8, 3);
		expect(pkgs[0]?.lengthCm).toBe(90);
	});

	it("item com shipsInOwnBox usa as próprias dims (telescópica 180cm)", () => {
		const tele: QuoteItem = {
			lengthCm: 180,
			widthCm: 34,
			heightCm: 34,
			weightKg: 5.8,
			packagingWeightKg: 1,
			stackable: false,
			shipsInOwnBox: true,
			qty: 1,
		};
		const pkgs = packItems([tele], BOXES);
		expect(pkgs).toHaveLength(1);
		expect(pkgs[0]?.lengthCm).toBe(180);
		expect(pkgs[0]?.weightKg).toBeCloseTo(6.8, 3);
		expect(pkgs[0]?.outOfCatalog).toBe(false);
	});

	it("item que não cabe em nenhuma caixa → pacote fora de catálogo", () => {
		const enorme: QuoteItem = {
			lengthCm: 200,
			widthCm: 80,
			heightCm: 80,
			weightKg: 50,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			qty: 1,
		};
		const pkgs = packItems([enorme], BOXES);
		expect(pkgs).toHaveLength(1);
		expect(pkgs[0]?.outOfCatalog).toBe(true);
	});
});
```

- [ ] **Step 4: Verificar**

```bash
bun --cwd packages/db test
bun check-types && bun check
rg -n 'quoteShipping|matchCepRange|QuoteCarrier|QuoteResult|UnquotableReason|getActiveCarriersWithTables' packages apps --glob '!node_modules'
```

Expected: 4 testes de `packItems` passando; rg sem resultados.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(db): remove motor quoteShipping morto"
```

---

### Task 4: `packages/db` — schema, barrel e seed sem carrier

**Files:**
- Modify: `packages/db/src/schema/shipping.ts` (reescrita completa)
- Modify: `packages/db/src/schema/tools.ts:82-86,128-131`
- Modify: `packages/db/src/index.ts:67-75,128-134`
- Modify: `packages/db/scripts/seed/shipping.ts` (reescrita completa)
- Modify: `packages/db/scripts/seed/truncate.ts:36-38`

**Interfaces:**
- Consumes: Tasks 1-3 removeram todos os consumidores de `carrier*` e `overweightShippingAmount`.
- Produces: `@emach/db/schema/shipping` exporta só `shippingBox` + types; `tool` sem `overweightShippingAmount`.

- [ ] **Step 1: Reescrever `schema/shipping.ts`**

Conteúdo final completo:

```ts
import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	numeric,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const shippingBox = pgTable(
	"shipping_box",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		internalLengthCm: numeric("internal_length_cm", {
			precision: 10,
			scale: 2,
		}).notNull(),
		internalWidthCm: numeric("internal_width_cm", {
			precision: 10,
			scale: 2,
		}).notNull(),
		internalHeightCm: numeric("internal_height_cm", {
			precision: 10,
			scale: 2,
		}).notNull(),
		maxWeightKg: numeric("max_weight_kg", {
			precision: 10,
			scale: 3,
		}).notNull(),
		tareWeightKg: numeric("tare_weight_kg", { precision: 10, scale: 3 })
			.notNull()
			.default("0"),
		active: boolean("active").notNull().default(true),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("shipping_box_active_idx").on(table.active, table.sortOrder),
		check(
			"shipping_box_dimensions_positive",
			sql`${table.internalLengthCm} >= 0 AND ${table.internalWidthCm} >= 0 AND ${table.internalHeightCm} >= 0 AND ${table.maxWeightKg} >= 0 AND ${table.tareWeightKg} >= 0`
		),
	]
);

export type ShippingBox = typeof shippingBox.$inferSelect;
export type NewShippingBox = typeof shippingBox.$inferInsert;
```

- [ ] **Step 2: `schema/tools.ts`** — deletar o bloco da coluna (L82-86):

```ts
		// Frete por-produto p/ itens > 30kg (teto SuperFrete). Null = "a combinar".
		overweightShippingAmount: numeric("overweight_shipping_amount", {
			precision: 10,
			scale: 2,
		}),
```

e o check (L128-131):

```ts
		check(
			"overweight_shipping_non_negative",
			sql`${table.overweightShippingAmount} IS NULL OR ${table.overweightShippingAmount} >= 0`
		),
```

- [ ] **Step 3: `src/index.ts`** — substituir o import de shipping (L67-75) por:

```ts
import { shippingBox } from "./schema/shipping";
```

e no objeto `schema` (L128-134), remover as 6 entradas `carrier`, `carrierRate`, `carrierRateRelations`, `carrierRelations`, `carrierZone`, `carrierZoneRelations` (mantendo `shippingBox`).

- [ ] **Step 4: Reescrever `scripts/seed/shipping.ts`**

Conteúdo final completo:

```ts
// packages/db/scripts/seed/shipping.ts
import { shippingBox } from "@emach/db/schema/shipping";
import type { Tx } from "./context";

// ---------------------------------------------------------------------------
// Catálogo de caixas (S / M / L / XL)
// ---------------------------------------------------------------------------

interface BoxDef {
	internalHeightCm: string;
	internalLengthCm: string;
	internalWidthCm: string;
	maxWeightKg: string;
	name: string;
	sortOrder: number;
	tareWeightKg: string;
}

const BOXES: BoxDef[] = [
	{
		name: "Caixa S",
		internalLengthCm: "35.00",
		internalWidthCm: "35.00",
		internalHeightCm: "30.00",
		maxWeightKg: "20.000",
		tareWeightKg: "0.500",
		sortOrder: 0,
	},
	{
		name: "Caixa M",
		internalLengthCm: "50.00",
		internalWidthCm: "50.00",
		internalHeightCm: "40.00",
		maxWeightKg: "35.000",
		tareWeightKg: "0.800",
		sortOrder: 1,
	},
	{
		name: "Caixa L",
		internalLengthCm: "70.00",
		internalWidthCm: "60.00",
		internalHeightCm: "50.00",
		maxWeightKg: "60.000",
		tareWeightKg: "1.200",
		sortOrder: 2,
	},
	{
		name: "Caixa XL",
		internalLengthCm: "90.00",
		internalWidthCm: "70.00",
		internalHeightCm: "60.00",
		maxWeightKg: "80.000",
		tareWeightKg: "1.800",
		sortOrder: 3,
	},
];

export async function seedShipping(tx: Tx): Promise<void> {
	for (const box of BOXES) {
		await tx.insert(shippingBox).values({
			id: crypto.randomUUID(),
			name: box.name,
			internalLengthCm: box.internalLengthCm,
			internalWidthCm: box.internalWidthCm,
			internalHeightCm: box.internalHeightCm,
			maxWeightKg: box.maxWeightKg,
			tareWeightKg: box.tareWeightKg,
			active: true,
			sortOrder: box.sortOrder,
		});
	}
}
```

- [ ] **Step 5: `scripts/seed/truncate.ts`** — remover as 3 linhas (L36-38):

```ts
	"carrier_rate",
	"carrier_zone",
	"carrier",
```

- [ ] **Step 6: Verificar**

```bash
bun check-types && bun check
rg -n "\bcarrier\b|carrierZone|carrierRate" packages apps --glob '!node_modules' --glob '!docs'
```

Expected: verde; rg retorna **apenas** `packages/db/scripts/enrich-demo.ts` (chave de metadata JSON — não tocar).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db)!: drop schema carrier/zone/rate (#287)"
```

---

### Task 5: Drop físico no banco de dev

**Files:** nenhum (só banco). Push-only (ADR-0006): sem migration versionada; `drizzle-kit push` de drop pendura sem TTY, então o drop é SQL direto.

**Interfaces:**
- Consumes: schema TS já sem `carrier*`/`overweight` (Task 4).
- Produces: banco ≡ schema TS.

- [ ] **Step 1: Executar o drop** via MCP Supabase (`mcp__supabase__execute_sql`, project `wrxohbzepoyscsacjzvd` — carregar a tool via ToolSearch se necessário):

```sql
DROP TABLE IF EXISTS carrier_rate;
DROP TABLE IF EXISTS carrier_zone;
DROP TABLE IF EXISTS carrier;
ALTER TABLE tool DROP COLUMN IF EXISTS overweight_shipping_amount;
```

(Ordem filho→pai; o DROP COLUMN leva o CHECK `overweight_shipping_non_negative` junto.)

- [ ] **Step 2: Confirmar no-op do push**

```bash
bun db:push
```

Expected: sem mudanças detectadas (schema TS ≡ banco). Se pedir confirmação interativa de qualquer mudança, **abortar e investigar** — significa resíduo de schema.

- [ ] **Step 3: Sanity SQL** (via `mcp__supabase__execute_sql`):

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('carrier','carrier_zone','carrier_rate');
SELECT column_name FROM information_schema.columns
WHERE table_name='tool' AND column_name='overweight_shipping_amount';
```

Expected: ambos vazios.

---

### Task 6: Docs — contrato de integração + referência Frenet

**Files:**
- Modify: `docs/integration/admin-ecommerce.md` (seções "Configurações de frete" e "Motor de cotação próprio")
- Move: `frenetapi.apib` (raiz, untracked) → `docs/integration/frenet-api.apib`

**Interfaces:** nenhuma (docs).

- [ ] **Step 1: Atualizar a seção "Configurações de frete"**

No bloco "Contrato para o e-commerce" (após a linha do `originCep`), substituir os 2 bullets que citam SuperFrete/overweight:

De:

```markdown
- `insurancePolicy`: `'none'` (sem seguro, `insurance_value: 0` na cotação SuperFrete) ou `'cart_value'` (declara o valor do carrinho até `insuranceCapAmount`).
- Item com `tool.overweight_shipping_amount` não-nulo e peso/dimensão acima do teto SuperFrete (30kg / 100cm): cobra esse valor fixo no lugar da cotação automática; nulo → "Frete a combinar".
```

Para:

```markdown
- `insurancePolicy`: `'none'` (sem valor declarado adicional) ou `'cart_value'` (declara o valor do carrinho até `insuranceCapAmount` como `ShipmentInvoiceValue` na cotação Frenet).
```

E substituir o parágrafo final da seção ("A troca efetiva no storefront (`getOriginBranchCep` → `getShippingSettings` ...)") por:

```markdown
A v1 da cotação Frenet no storefront usa `env.FRENET_SELLER_CEP` como origem e declara o subtotal integral — o swap para `getShippingSettings` (origem + política de seguro) é pendência rastreada em issue no repo emach-ecommerce.
```

- [ ] **Step 2: Substituir a seção "Motor de cotação próprio (substitui SuperFrete)" inteira** (do heading até o fim de "Não-regressão com SuperFrete", exclusive o heading seguinte "O que o checkout deve gravar…") por:

```markdown
## Consolidação em caixas + cotação Frenet

A cotação de frete do storefront é feita na **API Frenet** (`POST /shipping/quote`). O papel do
dashboard é manter os insumos: o **catálogo de caixas** (`shipping_box`) e os **dados físicos do
produto** (`tool`). Antes de cotar, o checkout consolida o carrinho em caixas reais via
`packItems`; cada caixa vira uma linha do `ShippingItemArray` da Frenet.

### Tabela compartilhada

| Tabela         | Dono primário | Quem lê    | Notas                                                                 |
| -------------- | ------------- | ---------- | --------------------------------------------------------------------- |
| `shipping_box` | Dashboard     | E-commerce | Caixa do catálogo: dimensões internas (cm), peso máximo e tara (kg). |

### Colunas de `tool` consumidas pela cotação

| Coluna                                   | Semântica                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `weight_kg`, `length_cm`, `width_cm`, `height_cm` | Peso e dimensões do produto (obrigatórios no cadastro).                     |
| `packaging_weight_kg`                    | Peso da embalagem/proteção. Peso de despacho = `weight_kg + packaging_weight_kg`.    |
| `stackable`                              | Pode empilhar sobre/sob outros itens na consolidação de volume.                      |
| `ships_in_own_box`                       | Viaja em embalagem própria (ex: item longo); não consolida com outros itens.         |

### Funções compartilhadas (`@emach/db/queries/shipping*`)

Sincronizadas ao ecommerce via CI (ADR-0009):

```ts
import { getActiveBoxes } from "@emach/db/queries/shipping";
import { packItems, type QuoteItem } from "@emach/db/queries/shipping-quote";

const boxes = await getActiveBoxes(db);
const packages = packItems(items, boxes);
// → cada ShippingPackage vira { Weight, Length, Height, Width, Quantity: 1 }
//   no ShippingItemArray da Frenet.
```

Pacote marcado `outOfCatalog: true` (item que não cabe nem na maior caixa ativa) → o checkout
exibe **"Frete a combinar"** sem chamar a Frenet.

O motor antigo de tabelas próprias (`carrier`/`carrier_zone`/`carrier_rate` + `quoteShipping`)
foi removido em 2026-07-03 (issue #287 do dashboard).
```

- [ ] **Step 3: Mover a referência da API**

```bash
mv frenetapi.apib docs/integration/frenet-api.apib
git add docs/integration/frenet-api.apib
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: contrato de frete reflete Frenet (#287)"
```

---

### Task 7: Verificação integrada + smoke run-time (main loop)

**Files:** nenhum. Executar no main loop (usa `/dev-up 3007`).

- [ ] **Step 1: Suíte completa**

```bash
bun verify
```

Expected: check-types + check (ultracite) + test todos verdes.

- [ ] **Step 2: Greps residuais**

```bash
rg -n "carrierZone|carrierRate|\bcarrier\b|overweightShipping|getActiveCarriersWithTables|quoteShipping|SuperFrete" packages apps --glob '!node_modules'
```

Expected: só `packages/db/scripts/enrich-demo.ts` (metadata JSON de rastreio).

- [ ] **Step 3: Smoke run-time** — `check-types` não pega SQL/colunas removidas em queries SSR. Subir com `/dev-up 3007` e visitar:
  - `/dashboard/shipping` — 2 tabs (Caixas default, Configurações); grid de caixas renderiza; criar/editar caixa funciona; salvar configurações funciona; rail "Como o cliente vê" sem menção a SuperFrete.
  - `/dashboard/tools/new` — step "Logística & frete" com 5 campos, sem bloco de frete overweight.
  - `/dashboard/tools/<id>` — aba overview sem a linha "Frete > 30kg"; editar tool e salvar sem erro.
  - Sidebar — item "Frete" continua navegando.

- [ ] **Step 4: Encerramento do branch** — invocar `superpowers:finishing-a-development-branch` (merge/PR conforme decisão do usuário). **Pós-merge na main:** conferir que o `sync-db-schema.yml` abriu o PR no emach-ecommerce e que `check-types` + `test:ci` passam lá antes de mergear o sync.

---

### Task 8: Issue no ecommerce — wire do `getShippingSettings`

**Files:** nenhum (GitHub, repo `othavi0/emach-ecommerce`).

- [ ] **Step 1: Criar a issue**

```bash
gh issue create --repo othavi0/emach-ecommerce \
  --title "feat(frete): ler getShippingSettings em vez de env na cotação Frenet" \
  --body "$(cat <<'EOF'
## Contexto

A v1 da cotação Frenet (PR #178) usa `env.FRENET_SELLER_CEP` como CEP de origem e declara o subtotal integral do carrinho como `ShipmentInvoiceValue`. O dashboard já expõe essa configuração em `store_settings` (rota `/dashboard/shipping`, aba Configurações), lida via `getShippingSettings` (`@emach/db/queries/store-settings`) — hoje órfã no storefront.

## Escopo

Em `apps/web/src/lib/shipping/quote.ts`:

- `SellerCEP` ← `getShippingSettings(db).originCep` (CEP da filial de origem); fallback para `env.FRENET_SELLER_CEP` quando `originCep` é `null`.
- `ShipmentInvoiceValue` ← respeitar `insurancePolicy`: `'none'` → valor mínimo/zero conforme aceito pela Frenet; `'cart_value'` → subtotal do carrinho limitado a `insuranceCapAmount`.
- Invalidar/considerar o cache Redis de cotação (a chave precisa refletir a origem, se ela virar dinâmica).

## Referências

- Contrato: `docs/integration/admin-ecommerce.md` (seção "Configurações de frete") no repo dashboard.
- Pendência citada na spec `docs/superpowers/specs/2026-07-02-frenet-cotacao-design.md` deste repo.
EOF
)"
```

Expected: issue criada; anotar o número no resumo final.

---

## Self-review (executado na escrita do plano)

- **Cobertura da spec:** §2 banco → Tasks 4-5; §3 packages/db → Tasks 3-4; §4 UI → Tasks 1-2; §5 docs → Task 6; §6 verificação/propagação → Task 7; issue ecommerce → Task 8. Sem lacunas.
- **Consistência de tipos:** exports finais de `data.ts`/`actions.ts` (Task 1) conferem com o que `boxes-tab.tsx`/`box-*-sheet.tsx`/`shipping-settings-form.tsx` importam hoje; `QuoteItem`/`QuoteBox`/`ShippingPackage`/`packItems`/`getActiveBoxes` (Task 3) conferem com os imports reais do ecommerce.
- **Sem placeholders:** todos os passos têm código/comando/expectativa concretos.
