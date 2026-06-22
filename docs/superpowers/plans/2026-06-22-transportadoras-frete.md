# Transportadoras + Cálculo de Frete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro de transportadoras com tabelas de frete negociadas (CEP × peso) + catálogo de caixas + motor de cotação local que consolida múltiplos itens antes de cotar, consumido pelo storefront e pelo preview do admin.

**Architecture:** Schema novo em `packages/db` (4 tabelas + 3 colunas em `tool`); motor de cotação como funções puras em `packages/db/src/queries/` (superfície sincronizada via CI ADR-0009, propaga ao ecommerce); UI dashboard em nova rota `/dashboard/shipping` com 3 abas (Transportadoras · Caixas · Configurações), seguindo o padrão de CRUD de `branches`/`suppliers`.

**Tech Stack:** Next 16 / React 19, Drizzle 0.45 (push-only), Zod, vitest, Tailwind/base-ui (`@emach/ui`).

**Spec:** `docs/superpowers/specs/2026-06-22-transportadoras-frete-design.md`

## Global Constraints

Aplicam-se a TODA task (verbatim do CLAUDE.md / spec):

- **Sem `console.*`** em produção — usar `logger` (`@/lib/logger`). Sem `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`. Sem `key={index}` (IDs estáveis). Sem `React.forwardRef` (React 19: `ref` como prop). Sem `useMemo`/`useCallback` manuais (React Compiler ativo). Sem `async function` em Client Component (fetch via Server Component). Sem barrel files novos.
- **IDs:** `crypto.randomUUID()` no caller (sem nanoid).
- **Money/medida:** colunas `numeric` voltam como string US do Postgres — **nunca** renderizar cru; usar `formatMeasure` (`@/lib/format/number`) p/ peso/dimensão e `formatMoney` (`@/lib/discount-format`) p/ dinheiro. No motor puro, `Number(...)` no boundary do read.
- **Schema push-only (ADR-0006):** após editar `packages/db/src/schema/*.ts`, rodar `bun db:sync` (interativo, precisa TTY). CHECK novo × dados existentes: colunas NOT NULL com default fazem backfill automático e satisfazem o CHECK.
- **Server actions:** `"use server"` no topo + `await requireCapability(cap)` (devolve session) no início; validar com `safeParse`; retorno `ActionResult<T>` = `{ ok:true; data } | { ok:false; error }`; `try/catch` só em volta de `db.*` com `actionErrorMessage(error)`; `logUserActivity(...)` nas mutações; `revalidatePath(...)` depois. Reads expostos a Client Component vão em `actions.ts` com guard; reads server-only em `data.ts` (`import "server-only"`).
- **Forms:** `useFormErrors<T>()` + `LabeledField` (render-prop `{...field}`) + `<FieldError>` (nunca `<p text-destructive>` cru — CI ast-grep `raw-validation-error`). Blocos/arrays mostram `<FieldError>` no nível do grupo.
- **Sync surface:** arquivos em `packages/db/src/{schema,queries}` **não podem importar de fora** dessa superfície (quebra `check-types` no ecommerce). O motor é puro, sem imports externos.
- **Gate antes de commit:** `bun verify` (= `check-types && check && test`). Após refatorar arquivo `"use server"` (mover actions), **`bun run build`** também (regra só do build: re-exportar não-async de `"use server"` quebra).

---

## Mapa de arquivos

**Criar:**
- `packages/db/src/schema/shipping.ts` — tabelas `carrier`, `carrierZone`, `carrierRate`, `shippingBox` + relations + tipos.
- `packages/db/src/queries/shipping-quote.ts` — motor PURO (packItems, quoteShipping, matchCepRange) + tipos.
- `packages/db/src/queries/shipping.ts` — reads p/ o motor (`getActiveCarriersWithTables`, `getActiveBoxes`).
- `packages/db/src/queries/__tests__/shipping-quote.test.ts` — testes do motor.
- `apps/web/src/app/dashboard/shipping/page.tsx` — rota + 3 abas.
- `apps/web/src/app/dashboard/shipping/actions.ts` — actions (carriers, zones, rates, boxes, + settings movidas).
- `apps/web/src/app/dashboard/shipping/data.ts` — reads server-only.
- `apps/web/src/app/dashboard/shipping/_components/*` — schemas Zod, cards, grids, drawers, forms.
- `apps/web/src/app/dashboard/shipping/carriers/[id]/page.tsx` — detalhe da transportadora.
- `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/*` — editor de zonas/tabela, sobretaxas, preview.

**Modificar:**
- `packages/db/src/schema/tools.ts` — +3 colunas em `tool`.
- `packages/db/src/schema/index.ts` — exportar `./shipping`.
- `apps/web/src/lib/capabilities.ts` — +`shipping.read`/`shipping.manage` + `RESOURCE_SECTION`.
- `apps/web/src/app/dashboard/_components/nav-config.ts` — entrada "Frete".
- `apps/web/src/app/dashboard/site/settings/page.tsx` — remover aba Frete + redirect.
- `docs/integration/admin-ecommerce.md` — contrato das novas tabelas + motor.

---

## Task 1: Schema das tabelas de frete

**Files:**
- Create: `packages/db/src/schema/shipping.ts`
- Modify: `packages/db/src/schema/index.ts`

**Interfaces:**
- Produces: tabelas `carrier`, `carrierZone`, `carrierRate`, `shippingBox`; tipos `Carrier`, `NewCarrier`, `CarrierZone`, `NewCarrierZone`, `CarrierRate`, `NewCarrierRate`, `ShippingBox`, `NewShippingBox`; tipo `CarrierCepRange = { from: string; to: string; label?: string }`.

- [ ] **Step 1: Criar `packages/db/src/schema/shipping.ts`**

```ts
import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// Mesmo shape de branch.cep_ranges (queries/branch-cep.ts: CepRange).
export type CarrierCepRange = { from: string; to: string; label?: string };

export const carrier = pgTable(
	"carrier",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		cnpj: text("cnpj"),
		active: boolean("active").notNull().default(true),
		// Divisor de peso cubado: Correios/aéreo 6000; rodoviário pode variar.
		cubageDivisor: integer("cubage_divisor").notNull().default(6000),
		grisPercent: numeric("gris_percent", { precision: 5, scale: 2 }),
		grisMinAmount: numeric("gris_min_amount", { precision: 10, scale: 2 }),
		advaloremPercent: numeric("advalorem_percent", { precision: 5, scale: 2 }),
		tollAmount: numeric("toll_amount", { precision: 10, scale: 2 }),
		icmsPercent: numeric("icms_percent", { precision: 5, scale: 2 }),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("carrier_active_idx").on(table.active, table.createdAt.desc()),
		uniqueIndex("carrier_cnpj_unique_when_present")
			.on(table.cnpj)
			.where(sql`${table.cnpj} IS NOT NULL`),
		check("carrier_cubage_divisor_positive", sql`${table.cubageDivisor} > 0`),
		check(
			"carrier_percents_valid",
			sql`(${table.grisPercent} IS NULL OR (${table.grisPercent} >= 0 AND ${table.grisPercent} <= 100)) AND (${table.advaloremPercent} IS NULL OR (${table.advaloremPercent} >= 0 AND ${table.advaloremPercent} <= 100)) AND (${table.icmsPercent} IS NULL OR (${table.icmsPercent} >= 0 AND ${table.icmsPercent} < 100))`
		),
		check(
			"carrier_amounts_non_negative",
			sql`(${table.grisMinAmount} IS NULL OR ${table.grisMinAmount} >= 0) AND (${table.tollAmount} IS NULL OR ${table.tollAmount} >= 0)`
		),
	]
);

export const carrierZone = pgTable(
	"carrier_zone",
	{
		id: text("id").primaryKey(),
		carrierId: text("carrier_id")
			.notNull()
			.references(() => carrier.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		cepRanges: jsonb("cep_ranges")
			.$type<CarrierCepRange[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		deliveryDays: integer("delivery_days"),
		minFreightAmount: numeric("min_freight_amount", { precision: 10, scale: 2 }),
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
		index("carrier_zone_carrier_idx").on(table.carrierId, table.sortOrder),
		check(
			"carrier_zone_values_non_negative",
			sql`(${table.deliveryDays} IS NULL OR ${table.deliveryDays} >= 0) AND (${table.minFreightAmount} IS NULL OR ${table.minFreightAmount} >= 0)`
		),
	]
);

export const carrierRate = pgTable(
	"carrier_rate",
	{
		id: text("id").primaryKey(),
		carrierId: text("carrier_id")
			.notNull()
			.references(() => carrier.id, { onDelete: "cascade" }),
		zoneId: text("zone_id")
			.notNull()
			.references(() => carrierZone.id, { onDelete: "cascade" }),
		weightFromKg: numeric("weight_from_kg", { precision: 10, scale: 3 }).notNull(),
		// NULL = ∞ (faixa topo).
		weightToKg: numeric("weight_to_kg", { precision: 10, scale: 3 }),
		baseAmount: numeric("base_amount", { precision: 10, scale: 2 }).notNull(),
		perKgAmount: numeric("per_kg_amount", { precision: 10, scale: 2 })
			.notNull()
			.default("0"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("carrier_rate_zone_from_unique").on(
			table.zoneId,
			table.weightFromKg
		),
		index("carrier_rate_carrier_idx").on(table.carrierId),
		check(
			"carrier_rate_weight_valid",
			sql`${table.weightFromKg} >= 0 AND (${table.weightToKg} IS NULL OR ${table.weightToKg} > ${table.weightFromKg})`
		),
		check(
			"carrier_rate_amounts_non_negative",
			sql`${table.baseAmount} >= 0 AND ${table.perKgAmount} >= 0`
		),
	]
);

export const shippingBox = pgTable(
	"shipping_box",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		internalLengthCm: numeric("internal_length_cm", { precision: 10, scale: 2 }).notNull(),
		internalWidthCm: numeric("internal_width_cm", { precision: 10, scale: 2 }).notNull(),
		internalHeightCm: numeric("internal_height_cm", { precision: 10, scale: 2 }).notNull(),
		maxWeightKg: numeric("max_weight_kg", { precision: 10, scale: 3 }).notNull(),
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

export const carrierRelations = relations(carrier, ({ many }) => ({
	zones: many(carrierZone),
	rates: many(carrierRate),
}));

export const carrierZoneRelations = relations(carrierZone, ({ one, many }) => ({
	carrier: one(carrier, {
		fields: [carrierZone.carrierId],
		references: [carrier.id],
	}),
	rates: many(carrierRate),
}));

export const carrierRateRelations = relations(carrierRate, ({ one }) => ({
	carrier: one(carrier, {
		fields: [carrierRate.carrierId],
		references: [carrier.id],
	}),
	zone: one(carrierZone, {
		fields: [carrierRate.zoneId],
		references: [carrierZone.id],
	}),
}));

export type Carrier = typeof carrier.$inferSelect;
export type NewCarrier = typeof carrier.$inferInsert;
export type CarrierZone = typeof carrierZone.$inferSelect;
export type NewCarrierZone = typeof carrierZone.$inferInsert;
export type CarrierRate = typeof carrierRate.$inferSelect;
export type NewCarrierRate = typeof carrierRate.$inferInsert;
export type ShippingBox = typeof shippingBox.$inferSelect;
export type NewShippingBox = typeof shippingBox.$inferInsert;
```

- [ ] **Step 2: Exportar no barrel `packages/db/src/schema/index.ts`**

Adicionar a linha (mantendo a ordem alfabética das exports existentes):

```ts
export * from "./shipping";
```

- [ ] **Step 3: Verificar tipos**

Run: `bun --cwd packages/db check-types`
Expected: PASS (sem erros).

- [ ] **Step 4: Aplicar no banco**

Run: `bun --cwd packages/db db:sync` (interativo — confirmar criação das 4 tabelas; precisa TTY).
Expected: "Changes applied" criando `carrier`, `carrier_zone`, `carrier_rate`, `shipping_box`.

Confirmar: `SELECT table_name FROM information_schema.tables WHERE table_name IN ('carrier','carrier_zone','carrier_rate','shipping_box');` retorna 4 linhas.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/shipping.ts packages/db/src/schema/index.ts
git commit -m "feat(db): schema de transportadoras e frete"
```

---

## Task 2: Colunas físicas de embalagem no produto

**Files:**
- Modify: `packages/db/src/schema/tools.ts:71-86` (bloco da tabela `tool`)

**Interfaces:**
- Produces: `tool.packagingWeightKg`, `tool.stackable`, `tool.shipsInOwnBox`.

- [ ] **Step 1: Adicionar as 3 colunas em `tool`**

Em `packages/db/src/schema/tools.ts`, dentro do objeto de colunas de `tool` (logo após `overweightShippingAmount`, antes de `createdAt`), inserir:

```ts
		// Peso da embalagem (espuma/proteção). Despacho = weightKg + packagingWeightKg.
		packagingWeightKg: numeric("packaging_weight_kg", { precision: 10, scale: 3 })
			.notNull()
			.default("0"),
		// Pode empilhar sobre/sob outros itens na consolidação de frete.
		stackable: boolean("stackable").notNull().default(true),
		// Viaja sozinho — usa as próprias dims embaladas (ex: lixadeira telescópica 180cm).
		shipsInOwnBox: boolean("ships_in_own_box").notNull().default(false),
```

- [ ] **Step 2: Adicionar o CHECK de peso de embalagem**

No array de constraints de `tool` (após `overweight_shipping_non_negative`), inserir:

```ts
		check(
			"packaging_weight_non_negative",
			sql`${table.packagingWeightKg} >= 0`
		),
```

- [ ] **Step 3: Verificar tipos + aplicar**

Run: `bun --cwd packages/db check-types && bun --cwd packages/db db:sync`
Expected: PASS; colunas adicionadas com default (backfill automático nos 23 produtos — não viola o CHECK).

Confirmar: `SELECT packaging_weight_kg, stackable, ships_in_own_box FROM tool LIMIT 3;` retorna `0.000 / true / false`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/tools.ts
git commit -m "feat(db): campos de embalagem do produto p/ frete"
```

---

## Task 3: Motor de cotação — empacotamento (packItems) [TDD]

**Files:**
- Create: `packages/db/src/queries/shipping-quote.ts`
- Test: `packages/db/src/queries/__tests__/shipping-quote.test.ts`

**Interfaces:**
- Produces: tipos `QuoteItem`, `QuoteBox`, `ShippingPackage`; função `packItems(items: QuoteItem[], boxes: QuoteBox[]): ShippingPackage[]`. Funções puras, **sem** imports de `@emach/db` nem `server-only` (testáveis direto).

- [ ] **Step 1: Escrever o teste que falha**

Criar `packages/db/src/queries/__tests__/shipping-quote.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type QuoteBox, type QuoteItem, packItems } from "../shipping-quote";

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
	{ id: "box-s", internalLengthCm: 35, internalWidthCm: 35, internalHeightCm: 30, maxWeightKg: 20, tareWeightKg: 0.5 },
	{ id: "box-l", internalLengthCm: 70, internalWidthCm: 60, internalHeightCm: 50, maxWeightKg: 60, tareWeightKg: 1.2 },
	{ id: "box-xl", internalLengthCm: 90, internalWidthCm: 70, internalHeightCm: 60, maxWeightKg: 80, tareWeightKg: 1.8 },
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
			lengthCm: 180, widthCm: 34, heightCm: 34, weightKg: 5.8,
			packagingWeightKg: 1, stackable: false, shipsInOwnBox: true, qty: 1,
		};
		const pkgs = packItems([tele], BOXES);
		expect(pkgs).toHaveLength(1);
		expect(pkgs[0]?.lengthCm).toBe(180);
		expect(pkgs[0]?.weightKg).toBeCloseTo(6.8, 3);
		expect(pkgs[0]?.outOfCatalog).toBe(false);
	});

	it("item que não cabe em nenhuma caixa → pacote fora de catálogo", () => {
		const enorme: QuoteItem = {
			lengthCm: 200, widthCm: 80, heightCm: 80, weightKg: 50,
			packagingWeightKg: 0, stackable: true, shipsInOwnBox: false, qty: 1,
		};
		const pkgs = packItems([enorme], BOXES);
		expect(pkgs).toHaveLength(1);
		expect(pkgs[0]?.outOfCatalog).toBe(true);
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd packages/db test shipping-quote`
Expected: FAIL — `Cannot find module '../shipping-quote'`.

- [ ] **Step 3: Implementar `packItems` (mínimo p/ passar)**

Criar `packages/db/src/queries/shipping-quote.ts`:

```ts
// Motor de cotação de frete — funções PURAS (sem DB, sem server-only).
// Vive em queries/ p/ sincronizar ao ecommerce via CI (ADR-0009).
// Consumido pelo storefront (checkout) e pelo preview do dashboard.

export interface QuoteItem {
	lengthCm: number;
	widthCm: number;
	heightCm: number;
	weightKg: number;
	packagingWeightKg: number;
	stackable: boolean;
	shipsInOwnBox: boolean;
	qty: number;
}

export interface QuoteBox {
	id: string;
	internalLengthCm: number;
	internalWidthCm: number;
	internalHeightCm: number;
	maxWeightKg: number;
	tareWeightKg: number;
}

export interface ShippingPackage {
	lengthCm: number;
	widthCm: number;
	heightCm: number;
	weightKg: number;
	outOfCatalog: boolean;
}

// Folga de empacotamento: itens nunca preenchem 100% do volume interno.
const FILL_FACTOR = 0.9;

function sortedDesc(a: number, b: number, c: number): [number, number, number] {
	return [a, b, c].sort((x, y) => y - x) as [number, number, number];
}

function fitsByDims(item: QuoteItem, box: QuoteBox): boolean {
	const i = sortedDesc(item.lengthCm, item.widthCm, item.heightCm);
	const b = sortedDesc(box.internalLengthCm, box.internalWidthCm, box.internalHeightCm);
	return i[0] <= b[0] && i[1] <= b[1] && i[2] <= b[2];
}

function unitVolume(u: QuoteItem): number {
	return u.lengthCm * u.widthCm * u.heightCm;
}

function footprint(u: QuoteItem): number {
	const s = sortedDesc(u.lengthCm, u.widthCm, u.heightCm);
	return s[0] * s[1];
}

// Item não-empilhável reserva a coluna acima dele (footprint × altura da caixa).
function occupiedVolume(u: QuoteItem, box: QuoteBox): number {
	return u.stackable ? unitVolume(u) : footprint(u) * box.internalHeightCm;
}

function boxVolume(b: QuoteBox): number {
	return b.internalLengthCm * b.internalWidthCm * b.internalHeightCm;
}

function dispatchWeight(u: QuoteItem): number {
	return u.weightKg + u.packagingWeightKg;
}

// Um conjunto de unidades cabe numa caixa se: cada unidade cabe por eixo
// (com rotação), o peso total (+ tara) ≤ máximo, e o volume ocupado total ≤
// volume interno × fator de folga.
function fitsSet(units: QuoteItem[], box: QuoteBox): boolean {
	let weight = box.tareWeightKg;
	let occupied = 0;
	for (const u of units) {
		if (!fitsByDims(u, box)) return false;
		weight += dispatchWeight(u);
		occupied += occupiedVolume(u, box);
	}
	return weight <= box.maxWeightKg && occupied <= boxVolume(box) * FILL_FACTOR;
}

function emitPackage(units: QuoteItem[], box: QuoteBox): ShippingPackage {
	let weight = box.tareWeightKg;
	for (const u of units) weight += dispatchWeight(u);
	return {
		lengthCm: box.internalLengthCm,
		widthCm: box.internalWidthCm,
		heightCm: box.internalHeightCm,
		weightKg: weight,
		outOfCatalog: false,
	};
}

export function packItems(items: QuoteItem[], boxes: QuoteBox[]): ShippingPackage[] {
	const packages: ShippingPackage[] = [];

	// Expande qty em unidades.
	const units: QuoteItem[] = [];
	for (const it of items) {
		for (let i = 0; i < it.qty; i++) units.push({ ...it, qty: 1 });
	}

	// shipsInOwnBox → cada unidade é seu próprio pacote (usa as próprias dims).
	for (const u of units.filter((x) => x.shipsInOwnBox)) {
		packages.push({
			lengthCm: u.lengthCm,
			widthCm: u.widthCm,
			heightCm: u.heightCm,
			weightKg: dispatchWeight(u),
			outOfCatalog: false,
		});
	}

	// Itens a consolidar, maiores volumes primeiro.
	const rest = units
		.filter((x) => !x.shipsInOwnBox)
		.sort((a, b) => unitVolume(b) - unitVolume(a));
	if (rest.length === 0) return packages;

	const boxesAsc = [...boxes].sort((a, b) => boxVolume(a) - boxVolume(b));

	// Consolidação: a MENOR caixa única que cabe TODOS os itens → 1 pacote.
	// (É o que evita cobrar N× — ex: 4 furadeiras numa box-xl em vez de 4 box-s.)
	const single = boxesAsc.find((box) => fitsSet(rest, box));
	if (single) {
		packages.push(emitPackage(rest, single));
		return packages;
	}

	// Nenhuma caixa única cabe tudo → multi-caixa, enchendo a MAIOR caixa por
	// bin (máxima consolidação). Unidade grande/pesada demais até pra maior
	// caixa → pacote próprio marcado out_of_catalog ("a combinar").
	const largest = boxesAsc.at(-1);
	const bins: QuoteItem[][] = [];
	for (const u of rest) {
		if (!largest || !fitsSet([u], largest)) {
			packages.push({
				lengthCm: u.lengthCm,
				widthCm: u.widthCm,
				heightCm: u.heightCm,
				weightKg: dispatchWeight(u),
				outOfCatalog: true,
			});
			continue;
		}
		const bin = bins.find((b) => fitsSet([...b, u], largest));
		if (bin) bin.push(u);
		else bins.push([u]);
	}
	for (const bin of bins) packages.push(emitPackage(bin, largest));

	return packages;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd packages/db test shipping-quote`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/queries/shipping-quote.ts packages/db/src/queries/__tests__/shipping-quote.test.ts
git commit -m "feat(db): empacotamento FFD de frete"
```

---

## Task 4: Motor de cotação — cotação (quoteShipping) [TDD]

**Files:**
- Modify: `packages/db/src/queries/shipping-quote.ts` (adicionar `matchCepRange`, `quoteShipping` + tipos)
- Modify: `packages/db/src/queries/__tests__/shipping-quote.test.ts`

**Interfaces:**
- Consumes: `packItems`, `QuoteItem`, `QuoteBox` (Task 3).
- Produces: tipos `QuoteRate`, `QuoteZone`, `QuoteCarrier`, `QuoteResult`; funções `matchCepRange(cep: string, ranges: { from: string; to: string }[]): boolean` e `quoteShipping(input): QuoteResult`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `packages/db/src/queries/__tests__/shipping-quote.test.ts`:

```ts
import {
	matchCepRange,
	type QuoteCarrier,
	quoteShipping,
} from "../shipping-quote";

const CARRIER_BASE: Omit<QuoteCarrier, "zones"> = {
	id: "c1",
	name: "Transp X",
	cubageDivisor: 6000,
	grisPercent: null,
	grisMinAmount: null,
	advaloremPercent: null,
	tollAmount: null,
	icmsPercent: null,
};

const ZONA_CWB: QuoteCarrier["zones"][number] = {
	cepRanges: [{ from: "80000000", to: "82999999" }],
	deliveryDays: 3,
	minFreightAmount: 20,
	rates: [
		{ weightFromKg: 0, weightToKg: 30, baseAmount: 25, perKgAmount: 0 },
		{ weightFromKg: 30, weightToKg: null, baseAmount: 25, perKgAmount: 1.5 },
	],
};

describe("matchCepRange", () => {
	it("casa CEP dentro da faixa (normaliza máscara)", () => {
		expect(matchCepRange("81.200-526", [{ from: "80000000", to: "82999999" }])).toBe(true);
		expect(matchCepRange("01000000", [{ from: "80000000", to: "82999999" }])).toBe(false);
	});
});

describe("quoteShipping", () => {
	const boxes: QuoteBox[] = BOXES;
	const itens = [{ ...FURADEIRA, qty: 1 }]; // 17.5kg em box-s 35x35x30

	it("cota faixa discreta + frete mínimo", () => {
		const r = quoteShipping({
			items: itens,
			destinationCep: "81200526",
			declaredValue: 500,
			carriers: [{ ...CARRIER_BASE, zones: [ZONA_CWB] }],
			boxes,
		});
		expect(r.options).toHaveLength(1);
		// peso cobrado = max(17.5, cubado 35*35*30/6000=6.13) = 17.5 → faixa 0-30 base 25
		expect(r.options[0]?.amount).toBeCloseTo(25, 2);
		expect(r.options[0]?.deliveryDays).toBe(3);
		expect(r.unquotable).toHaveLength(0);
	});

	it("aplica kg excedente acima da faixa topo", () => {
		// 4 furadeiras = 69.8kg, faixa 30-∞ base 25 + (69.8-30)*1.5 = 25 + 59.7 = 84.7
		const r = quoteShipping({
			items: [{ ...FURADEIRA, qty: 4 }],
			destinationCep: "81200526",
			declaredValue: 500,
			carriers: [{ ...CARRIER_BASE, zones: [ZONA_CWB] }],
			boxes,
		});
		expect(r.options[0]?.amount).toBeCloseTo(84.7, 1);
	});

	it("soma GRIS, ad valorem e aplica ICMS por dentro", () => {
		const r = quoteShipping({
			items: itens,
			destinationCep: "81200526",
			declaredValue: 1000,
			carriers: [{
				...CARRIER_BASE,
				grisPercent: 0.5, grisMinAmount: 5,
				advaloremPercent: 1, icmsPercent: 12,
				zones: [ZONA_CWB],
			}],
			boxes,
		});
		// frete 25 + gris max(5,5)=5 + advalorem 10 = 40 ; ICMS 12% por dentro: 40/0.88 = 45.45
		expect(r.options[0]?.amount).toBeCloseTo(45.45, 2);
	});

	it("CEP sem zona → unquotable no_zone", () => {
		const r = quoteShipping({
			items: itens,
			destinationCep: "01000000",
			declaredValue: 500,
			carriers: [{ ...CARRIER_BASE, zones: [ZONA_CWB] }],
			boxes,
		});
		expect(r.options).toHaveLength(0);
		expect(r.unquotable[0]?.reason).toBe("no_zone");
	});

	it("pacote fora de catálogo → unquotable out_of_catalog", () => {
		const enorme: QuoteItem = {
			lengthCm: 200, widthCm: 80, heightCm: 80, weightKg: 50,
			packagingWeightKg: 0, stackable: true, shipsInOwnBox: false, qty: 1,
		};
		const r = quoteShipping({
			items: [enorme],
			destinationCep: "81200526",
			declaredValue: 500,
			carriers: [{ ...CARRIER_BASE, zones: [ZONA_CWB] }],
			boxes,
		});
		expect(r.unquotable[0]?.reason).toBe("out_of_catalog");
	});
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bun --cwd packages/db test shipping-quote`
Expected: FAIL — `matchCepRange`/`quoteShipping` não exportados.

- [ ] **Step 3: Implementar `matchCepRange` + `quoteShipping`**

Acrescentar ao final de `packages/db/src/queries/shipping-quote.ts`:

```ts
export interface QuoteRate {
	weightFromKg: number;
	weightToKg: number | null; // null = ∞
	baseAmount: number;
	perKgAmount: number;
}

export interface QuoteZone {
	cepRanges: { from: string; to: string }[];
	deliveryDays: number | null;
	minFreightAmount: number | null;
	rates: QuoteRate[];
}

export interface QuoteCarrier {
	id: string;
	name: string;
	cubageDivisor: number;
	grisPercent: number | null;
	grisMinAmount: number | null;
	advaloremPercent: number | null;
	tollAmount: number | null;
	icmsPercent: number | null;
	zones: QuoteZone[];
}

export type UnquotableReason = "no_zone" | "no_rate" | "out_of_catalog";

export interface QuoteResult {
	options: {
		carrierId: string;
		carrierName: string;
		amount: number;
		deliveryDays: number | null;
	}[];
	unquotable: {
		carrierId: string;
		carrierName: string;
		reason: UnquotableReason;
	}[];
}

function onlyDigits(cep: string): string {
	return cep.replace(/\D/g, "");
}

// CEPs normalizados a 8 dígitos → comparação léxica equivale a numérica.
export function matchCepRange(
	cep: string,
	ranges: { from: string; to: string }[]
): boolean {
	const c = onlyDigits(cep);
	return ranges.some((r) => {
		const from = onlyDigits(r.from);
		const to = onlyDigits(r.to);
		return c >= from && c <= to;
	});
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

export function quoteShipping(input: {
	items: QuoteItem[];
	destinationCep: string;
	declaredValue: number;
	carriers: QuoteCarrier[];
	boxes: QuoteBox[];
}): QuoteResult {
	const packages = packItems(input.items, input.boxes);
	const cep = onlyDigits(input.destinationCep);
	const hasOutOfCatalog = packages.some((p) => p.outOfCatalog);

	const options: QuoteResult["options"] = [];
	const unquotable: QuoteResult["unquotable"] = [];

	for (const carrier of input.carriers) {
		const zone = carrier.zones.find((z) => matchCepRange(cep, z.cepRanges));
		if (!zone) {
			unquotable.push({ carrierId: carrier.id, carrierName: carrier.name, reason: "no_zone" });
			continue;
		}
		if (hasOutOfCatalog) {
			unquotable.push({ carrierId: carrier.id, carrierName: carrier.name, reason: "out_of_catalog" });
			continue;
		}

		let fretePeso = 0;
		let failed = false;
		for (const pkg of packages) {
			const cubado = (pkg.lengthCm * pkg.widthCm * pkg.heightCm) / carrier.cubageDivisor;
			const peso = Math.max(pkg.weightKg, cubado);
			const rate = zone.rates.find(
				(r) => peso >= r.weightFromKg && (r.weightToKg === null || peso < r.weightToKg)
			);
			if (!rate) {
				failed = true;
				break;
			}
			fretePeso += rate.baseAmount + Math.max(0, peso - rate.weightFromKg) * rate.perKgAmount;
		}
		if (failed) {
			unquotable.push({ carrierId: carrier.id, carrierName: carrier.name, reason: "no_rate" });
			continue;
		}

		fretePeso = Math.max(fretePeso, zone.minFreightAmount ?? 0);

		let subtotal = fretePeso;
		if (carrier.grisPercent != null) {
			subtotal += Math.max(
				(input.declaredValue * carrier.grisPercent) / 100,
				carrier.grisMinAmount ?? 0
			);
		}
		if (carrier.advaloremPercent != null) {
			subtotal += (input.declaredValue * carrier.advaloremPercent) / 100;
		}
		if (carrier.tollAmount != null) {
			subtotal += carrier.tollAmount;
		}

		let total = subtotal;
		if (carrier.icmsPercent != null && carrier.icmsPercent > 0) {
			total = subtotal / (1 - carrier.icmsPercent / 100); // ICMS "por dentro"
		}

		options.push({
			carrierId: carrier.id,
			carrierName: carrier.name,
			amount: round2(total),
			deliveryDays: zone.deliveryDays,
		});
	}

	options.sort((a, b) => a.amount - b.amount);
	return { options, unquotable };
}
```

- [ ] **Step 4: Rodar e confirmar PASS**

Run: `bun --cwd packages/db test shipping-quote`
Expected: PASS (todos os testes, incl. ICMS por dentro 45.45).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/queries/shipping-quote.ts packages/db/src/queries/__tests__/shipping-quote.test.ts
git commit -m "feat(db): motor de cotacao de frete por tabela"
```

---

## Task 5: Reads do motor (getActiveCarriersWithTables, getActiveBoxes)

**Files:**
- Create: `packages/db/src/queries/shipping.ts`

**Interfaces:**
- Consumes: `QuoteCarrier`, `QuoteBox` (Task 3-4); schema `carrier`/`carrierZone`/`carrierRate`/`shippingBox` (Task 1).
- Produces: `getActiveCarriersWithTables(db): Promise<QuoteCarrier[]>`, `getActiveBoxes(db): Promise<QuoteBox[]>`. `db` parametrizado (não singleton), padrão de `store-settings.ts`. Coerce `numeric` (string) → `number` no boundary.

- [ ] **Step 1: Criar `packages/db/src/queries/shipping.ts`**

```ts
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { asc, eq } from "drizzle-orm";

import { carrier, carrierRate, carrierZone, shippingBox } from "../schema/shipping";
import type { QuoteBox, QuoteCarrier } from "./shipping-quote";

// Coerce numeric (string US do Postgres) → number; null preservado.
function num(v: string | null): number | null {
	return v === null ? null : Number(v);
}

export async function getActiveCarriersWithTables(
	db: NodePgDatabase<Record<string, unknown>>
): Promise<QuoteCarrier[]> {
	const rows = await db.query.carrier.findMany({
		where: eq(carrier.active, true),
		with: {
			zones: { orderBy: [asc(carrierZone.sortOrder)] },
			rates: { orderBy: [asc(carrierRate.weightFromKg)] },
		},
	});

	return rows.map((c) => ({
		id: c.id,
		name: c.name,
		cubageDivisor: c.cubageDivisor,
		grisPercent: num(c.grisPercent),
		grisMinAmount: num(c.grisMinAmount),
		advaloremPercent: num(c.advaloremPercent),
		tollAmount: num(c.tollAmount),
		icmsPercent: num(c.icmsPercent),
		zones: c.zones.map((z) => ({
			cepRanges: z.cepRanges.map((r) => ({ from: r.from, to: r.to })),
			deliveryDays: z.deliveryDays,
			minFreightAmount: num(z.minFreightAmount),
			rates: c.rates
				.filter((r) => r.zoneId === z.id)
				.map((r) => ({
					weightFromKg: Number(r.weightFromKg),
					weightToKg: num(r.weightToKg),
					baseAmount: Number(r.baseAmount),
					perKgAmount: Number(r.perKgAmount),
				})),
		})),
	}));
}

export async function getActiveBoxes(
	db: NodePgDatabase<Record<string, unknown>>
): Promise<QuoteBox[]> {
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

> Nota: `db.query.carrier.findMany` (relational) devolve `Date`/tipos certos e não sofre o bug de `db.execute`. As relations de Task 1 (`carrierRelations` etc.) precisam estar registradas no schema do drizzle client — já estão via barrel.

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd packages/db check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/queries/shipping.ts
git commit -m "feat(db): reads de transportadoras e caixas p/ cotacao"
```

---

## Task 6: Capabilities de frete

**Files:**
- Modify: `apps/web/src/lib/capabilities.ts`
- Test: `apps/web/__tests__/capabilities.test.ts` (já existe — só validar que continua verde)

**Interfaces:**
- Produces: capabilities `shipping.read` (defaultRoles `SA`) e `shipping.manage` (defaultRoles `S`); `RESOURCE_SECTION["Frete"] = "Sistema"`.

- [ ] **Step 1: Adicionar as capabilities**

Em `apps/web/src/lib/capabilities.ts`, dentro do objeto `CAPABILITIES`, após o bloco `// ── Site ──` (depois de `site.publish_announcements`), inserir:

```ts
	// ── Frete ─────────────────────────────────────────────────
	"shipping.read": {
		group: "Frete",
		resource: "Frete",
		action: "Ver",
		description: "Visualizar transportadoras, tabelas e caixas",
		defaultRoles: SA,
	},
	"shipping.manage": {
		group: "Frete",
		resource: "Frete",
		action: "Gerenciar",
		description: "Criar/editar transportadoras, tabelas, caixas e config",
		defaultRoles: S,
	},
```

- [ ] **Step 2: Mapear o recurso para uma seção**

No mesmo arquivo, no objeto `RESOURCE_SECTION` (~linha 379), adicionar a entrada (após `Site: "Sistema",`):

```ts
	Frete: "Sistema",
```

- [ ] **Step 3: Rodar o teste de exaustividade**

Run: `bun --cwd apps/web test capabilities`
Expected: PASS — incluindo "toda capability tem uma seção em SECTION_ORDER" (cobre `shipping.read`/`shipping.manage`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/capabilities.ts
git commit -m "feat(web): capabilities shipping.read e shipping.manage"
```

---

## Task 7: Rota /dashboard/shipping + relocação das configurações de frete

**Files:**
- Create: `apps/web/src/app/dashboard/shipping/page.tsx`
- Create: `apps/web/src/app/dashboard/shipping/actions.ts`
- Create: `apps/web/src/app/dashboard/shipping/_components/shipping-settings-form.tsx` (movido)
- Create: `apps/web/src/app/dashboard/shipping/_components/shipping-preview-rail.tsx` (movido)
- Create: `apps/web/src/app/dashboard/shipping/_components/shipping-schema.ts` (movido)
- Modify: `apps/web/src/app/dashboard/site/settings/page.tsx` (remover aba Frete)
- Modify: `apps/web/src/app/dashboard/_components/nav-config.ts` (entrada "Frete")

**Interfaces:**
- Consumes: capabilities Task 6; `EntityTabs`/`EntityTab` (`@/components/entity/entity-tabs`), `PageHeader` (`@/components/page-header`).
- Produces: rota `/dashboard/shipping` com abas `transportadoras` (default) · `caixas` · `config`; actions `getOrCreateShippingSettings`, `listOriginBranchOptions`, `updateShippingSettings` (movidas de site/settings, agora gated por `shipping.manage`), `OriginBranchOption`.

- [ ] **Step 1: Mover os 3 componentes de settings**

Mover (git mv) os arquivos para a nova pasta `_components`:

```bash
git mv apps/web/src/app/dashboard/site/settings/_components/shipping-settings-form.tsx apps/web/src/app/dashboard/shipping/_components/shipping-settings-form.tsx
git mv apps/web/src/app/dashboard/site/settings/_components/shipping-preview-rail.tsx apps/web/src/app/dashboard/shipping/_components/shipping-preview-rail.tsx
git mv apps/web/src/app/dashboard/site/settings/_components/shipping-schema.ts apps/web/src/app/dashboard/shipping/_components/shipping-schema.ts
```

Em `shipping-settings-form.tsx`, ajustar os imports relativos de `../actions` e `./shipping-schema` para apontar para a nova `../actions` (mesma pasta-pai, continua `../actions`) — confirmar que `OriginBranchOption` e `updateShippingSettings` vêm de `../actions` (será criada no Step 3).

- [ ] **Step 2: Criar `apps/web/src/app/dashboard/shipping/actions.ts` com as 3 actions de settings (gated por shipping.manage)**

Copiar as funções `getOrCreateShippingSettings`, `listOriginBranchOptions`, `updateShippingSettings` de `apps/web/src/app/dashboard/site/settings/actions.ts` para o novo arquivo, com 2 mudanças: (a) trocar o guard de `"site.update_settings"` por `"shipping.manage"`; (b) trocar `revalidatePath("/dashboard/site/settings")` por `revalidatePath(SHIPPING_PATH)`.

```ts
"use server";

import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { type StoreSettings, storeSettings } from "@emach/db/schema/store-settings";
import { asc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { logUserActivity } from "@/lib/activity";
import { requireCapability } from "@/lib/permissions";
import {
	type ShippingSettingsFormValues,
	shippingSettingsSchema,
} from "./_components/shipping-schema";

const SHIPPING_PATH = "/dashboard/shipping";

export interface OriginBranchOption {
	cep: string;
	id: string;
	name: string;
}

export async function getOrCreateShippingSettings(): Promise<StoreSettings> {
	await requireCapability("shipping.read");
	const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.id, "singleton")).limit(1);
	if (existing) return existing;
	const [created] = await db.insert(storeSettings).values({ id: "singleton" }).returning();
	return created;
}

export async function listOriginBranchOptions(): Promise<OriginBranchOption[]> {
	await requireCapability("shipping.read");
	const rows = await db
		.select({ id: branch.id, name: branch.name, cep: branch.cep })
		.from(branch)
		.where(isNotNull(branch.cep))
		.orderBy(asc(branch.name));
	return rows.map((r) => ({ id: r.id, name: r.name, cep: r.cep ?? "" }));
}

export async function updateShippingSettings(
	input: ShippingSettingsFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = shippingSettingsSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: actionErrorMessage(parsed.error) };

	try {
		await db
			.insert(storeSettings)
			.values({
				id: "singleton",
				shippingOriginBranchId: parsed.data.originBranchId || null,
				shippingInsurancePolicy: parsed.data.insurancePolicy,
				shippingInsuranceCapAmount: parsed.data.insuranceCapAmount.toFixed(2),
			})
			.onConflictDoUpdate({
				target: storeSettings.id,
				set: {
					shippingOriginBranchId: parsed.data.originBranchId || null,
					shippingInsurancePolicy: parsed.data.insurancePolicy,
					shippingInsuranceCapAmount: parsed.data.insuranceCapAmount.toFixed(2),
				},
			});
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "settings.shipping.updated",
		targetType: "store_settings",
		metadata: { insurancePolicy: parsed.data.insurancePolicy },
	});
	revalidatePath(SHIPPING_PATH);
	return { ok: true, data: { id: "singleton" } };
}
```

> Confirmar a forma exata do upsert/seed contra `site/settings/actions.ts` original e reproduzir fielmente (campos do singleton). Se o original usa um shape diferente para `getOrCreateShippingSettings`, copiar verbatim e só trocar o guard/path.

- [ ] **Step 3: Criar a página `apps/web/src/app/dashboard/shipping/page.tsx`**

```tsx
import type { Metadata } from "next";

import { type EntityTab, EntityTabs } from "@/components/entity/entity-tabs";
import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { CarriersTab } from "./_components/carriers-tab"; // Task 9
import { BoxesTab } from "./_components/boxes-tab"; // Task 8
import { ShippingPreviewRail } from "./_components/shipping-preview-rail";
import { ShippingSettingsForm } from "./_components/shipping-settings-form";
import { getOrCreateShippingSettings, listOriginBranchOptions } from "./actions";

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
		originOptions.find((o) => o.id === settings.shippingOriginBranchId)?.name ?? null;

	const tabs: EntityTab[] = [
		{ value: "transportadoras", label: "Transportadoras", content: <CarriersTab /> },
		{ value: "caixas", label: "Caixas", content: sp.tab === "caixas" ? <BoxesTab /> : null },
		{
			value: "config",
			label: "Configurações",
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
			<PageHeader description="Transportadoras, tabelas de frete e caixas de envio." title="Frete" />
			<EntityTabs defaultValue="transportadoras" tabs={tabs} />
		</div>
	);
}
```

> A ação "Nova transportadora" no header é injetada na Task 9 (depende de `sp.tab` + `can(shipping.manage)`). Por ora a página renderiza sem header-action. `CarriersTab`/`BoxesTab` são criados nas Tasks 8 e 9 — este step deixa imports que ainda não existem; **não rodar build até a Task 9**. Para compilar isoladamente agora, criar stubs temporários OU implementar Tasks 8-9 antes do build. Recomendado: implementar 7→8→9 e rodar o gate de build no fim da Task 9.

- [ ] **Step 4: Remover a aba Frete de `site/settings` + redirect**

Em `apps/web/src/app/dashboard/site/settings/page.tsx`: remover o objeto de tab `{ value: "frete", ... }` do array `tabs`, remover os imports de `ShippingSettingsForm`/`ShippingPreviewRail`/`getOrCreateShippingSettings`/`listOriginBranchOptions` e a montagem de `originOptions`/`originLabel`/`socialState` que dependiam só de frete (manter o que `redes`/`local` usam). Trocar `defaultValue="frete"` por `defaultValue="redes"`. Atualizar a `description` do `PageHeader` removendo "frete".

Adicionar no topo do `SettingsPageContent`, após o guard, um redirect do deep-link antigo:

```ts
import { redirect } from "next/navigation";
// dentro de SettingsPageContent, recebendo searchParams:
const sp = await searchParams;
if (sp.tab === "frete") redirect("/dashboard/shipping?tab=config");
```

(Adicionar `searchParams: Promise<{ tab?: string }>` ao `PageProps` da settings page e propagar pelo shell, espelhando o padrão de `branches/page.tsx`.)

- [ ] **Step 5: Adicionar entrada "Frete" na sidebar**

Em `apps/web/src/app/dashboard/_components/nav-config.ts`, no grupo cujo `label` é `"Sistema"` (onde mora "Site"/"Configurações"), adicionar o item (o ícone `Truck` de `lucide-react` já é importado no arquivo — se não, adicionar ao import):

```ts
{
	label: "Frete",
	href: "/dashboard/shipping",
	icon: Truck,
	capability: "shipping.read",
},
```

- [ ] **Step 6: Verificar (após Tasks 8-9 implementadas) — tipos, build, smoke**

Run: `bun --cwd apps/web check-types && bun run build`
Expected: PASS (build é gate obrigatório por causa do `"use server"` movido). Smoke: `bun dev:web`, visitar `/dashboard/shipping` (abas trocam, Configurações salva), `/dashboard/site/settings?tab=frete` redireciona, sidebar mostra "Frete".

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/shipping apps/web/src/app/dashboard/site/settings/page.tsx apps/web/src/app/dashboard/_components/nav-config.ts
git commit -m "feat(web): rota /dashboard/shipping e move config de frete"
```

---

## Task 8: CRUD de caixas (catálogo de embalagens)

**Files:**
- Create: `apps/web/src/app/dashboard/shipping/_components/box-schema.ts`
- Create: `apps/web/src/app/dashboard/shipping/_components/boxes-tab.tsx` (Server Component que busca + renderiza grid)
- Create: `apps/web/src/app/dashboard/shipping/_components/box-card-grid.tsx` (Client)
- Create: `apps/web/src/app/dashboard/shipping/_components/box-card.tsx` (Client)
- Create: `apps/web/src/app/dashboard/shipping/_components/box-form-fields.tsx` (Client)
- Create: `apps/web/src/app/dashboard/shipping/_components/box-create-sheet.tsx` (Client, drawer ?newBox=1)
- Create: `apps/web/src/app/dashboard/shipping/_components/box-edit-sheet.tsx` (Client, drawer ?editBox=<id>)
- Modify: `apps/web/src/app/dashboard/shipping/actions.ts` (actions de caixa)
- Modify: `apps/web/src/app/dashboard/shipping/data.ts` (criar; reads de caixa)

**Interfaces:**
- Consumes: schema `shippingBox` (Task 1); `useInfiniteList`/`InfiniteSentinel`/`paginate`/`BATCH_SIZE`/cursor (`@/lib/...`); `LabeledField`, `MaskedInput`+`decimalMask`, `useFormErrors`, `formatMeasure`.
- Produces: `BoxFormValues`/`boxSchema`; actions `fetchBoxesPage`, `createBox`, `updateBox`, `archiveBox`; tipo `ShippingBoxRow`.

- [ ] **Step 1: Zod schema `box-schema.ts`**

```ts
import { z } from "zod";

const dim = z
	.number({ message: "Obrigatório" })
	.positive("Deve ser maior que zero")
	.max(1000, "Valor muito alto");

export const boxSchema = z.object({
	name: z.string().trim().min(1, "Nome obrigatório").max(80, "Nome muito longo"),
	internalLengthCm: dim,
	internalWidthCm: dim,
	internalHeightCm: dim,
	maxWeightKg: z.number({ message: "Obrigatório" }).positive("Deve ser maior que zero").max(1000),
	tareWeightKg: z.number().nonnegative("Não pode ser negativo").max(100).default(0),
	active: z.boolean().default(true),
});

export type BoxFormValues = z.infer<typeof boxSchema>;
```

- [ ] **Step 2: Reads em `data.ts`**

Criar `apps/web/src/app/dashboard/shipping/data.ts`:

```ts
import "server-only";

import { db } from "@emach/db";
import { shippingBox } from "@emach/db/schema/shipping";
import { asc } from "drizzle-orm";

export interface ShippingBoxRow {
	id: string;
	name: string;
	internalLengthCm: string;
	internalWidthCm: string;
	internalHeightCm: string;
	maxWeightKg: string;
	tareWeightKg: string;
	active: boolean;
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

> Catálogo de caixas é pequeno (poucas linhas) → lista simples sem cursor. Não usar `useInfiniteList` aqui; renderizar a lista inteira no Server Component (`BoxesTab`).

- [ ] **Step 3: Actions de caixa em `actions.ts`**

Acrescentar a `apps/web/src/app/dashboard/shipping/actions.ts` (e os imports `shippingBox`, `eq`, `crypto` já global):

```ts
import { shippingBox } from "@emach/db/schema/shipping";
import { boxSchema, type BoxFormValues } from "./_components/box-schema";
// ... (eq já importado de drizzle-orm)

export async function createBox(input: BoxFormValues): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = boxSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: actionErrorMessage(parsed.error) };
	const id = crypto.randomUUID();
	try {
		await db.insert(shippingBox).values({
			id,
			name: parsed.data.name,
			internalLengthCm: parsed.data.internalLengthCm.toString(),
			internalWidthCm: parsed.data.internalWidthCm.toString(),
			internalHeightCm: parsed.data.internalHeightCm.toString(),
			maxWeightKg: parsed.data.maxWeightKg.toString(),
			tareWeightKg: parsed.data.tareWeightKg.toString(),
			active: parsed.data.active,
		});
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.box.created",
		targetId: id,
		targetType: "shipping_box",
		metadata: { name: parsed.data.name },
	});
	revalidatePath(SHIPPING_PATH);
	return { ok: true, data: { id } };
}

export async function updateBox(id: string, input: BoxFormValues): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = boxSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: actionErrorMessage(parsed.error) };
	try {
		await db.update(shippingBox).set({
			name: parsed.data.name,
			internalLengthCm: parsed.data.internalLengthCm.toString(),
			internalWidthCm: parsed.data.internalWidthCm.toString(),
			internalHeightCm: parsed.data.internalHeightCm.toString(),
			maxWeightKg: parsed.data.maxWeightKg.toString(),
			tareWeightKg: parsed.data.tareWeightKg.toString(),
			active: parsed.data.active,
		}).where(eq(shippingBox.id, id));
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.box.updated",
		targetId: id,
		targetType: "shipping_box",
		metadata: { name: parsed.data.name },
	});
	revalidatePath(SHIPPING_PATH);
	return { ok: true, data: { id } };
}
```

- [ ] **Step 4: UI — `boxes-tab.tsx` (Server), `box-card.tsx`, `box-create-sheet.tsx`, `box-edit-sheet.tsx`, `box-form-fields.tsx`**

- `boxes-tab.tsx` (Server): `await requireCapability("shipping.read")` (ou recebe `canManage` por prop do page — preferir buscar `can(session,"shipping.manage")` aqui via `getCurrentSession`); chama `getBoxes()`; renderiza um header local com botão "Nova caixa" (drawer via `?newBox=1`) condicionado a `canManage`, a lista de `<BoxCard>` num grid `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3`, e monta `<BoxCreateSheet />` + `<BoxEditSheet />` lendo os params.
- `box-form-fields.tsx` (Client): campos via `LabeledField` + `MaskedInput`+`decimalMask` para dimensões/peso/tara, `Input` para nome, `Switch` para `active`. Espelhar `branch-form-fields.tsx` na estrutura (render-prop `{...field}`, `onPatch`).
- `box-create-sheet.tsx` / `box-edit-sheet.tsx`: copiar a estrutura de `branches/[id]/_components/branch-edit-sheet.tsx` (drawer `EntityEditSheet`, `useFormErrors`, `useTransition`, `safeParse` → `reportValidationError`, `notify`, `router.refresh()`), trocando: param `edit` → `newBox`/`editBox`, schema → `boxSchema`, action → `createBox`/`updateBox`, campos → `<BoxFormFields>`.
- `box-card.tsx` (Client): card arquétipo *entity* mostrando nome, dims via `formatMeasure(...)+ " cm"`, peso máx, tara, badge ativo/inativo; clicar abre `?editBox=<id>`. **Dims via `formatMeasure`** (nunca cru).

> Referência exata a copiar: `branch-edit-sheet.tsx` (drawer + form), `supplier-card.tsx` (card), `branch-form-fields.tsx` (LabeledField). Adaptar nomes/campos conforme `BoxFormValues`.

- [ ] **Step 5: Verificar + smoke**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web check`
Expected: PASS. Smoke após Task 9 build: criar/editar caixa na aba Caixas; ver dims formatadas pt-BR.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/shipping
git commit -m "feat(web): CRUD de caixas de envio"
```

---

## Task 9: CRUD de transportadora (lista + criar)

**Files:**
- Create: `apps/web/src/app/dashboard/shipping/_components/carrier-schema.ts`
- Create: `apps/web/src/app/dashboard/shipping/_components/carriers-tab.tsx` (Server)
- Create: `apps/web/src/app/dashboard/shipping/_components/carrier-card-grid.tsx` (Client)
- Create: `apps/web/src/app/dashboard/shipping/_components/carrier-card.tsx` (Client)
- Create: `apps/web/src/app/dashboard/shipping/_components/carrier-form-fields.tsx` (Client)
- Create: `apps/web/src/app/dashboard/shipping/_components/carrier-create-sheet.tsx` (Client, ?newCarrier=1)
- Modify: `apps/web/src/app/dashboard/shipping/actions.ts` (actions de carrier + read paginado)
- Modify: `apps/web/src/app/dashboard/shipping/data.ts` (reads de carrier)
- Modify: `apps/web/src/app/dashboard/shipping/page.tsx` (header-action por tab)

**Interfaces:**
- Consumes: schema `carrier` (Task 1); padrão card-grid de `suppliers`; `normalizeCnpj`/`isValidCnpj` (`@/lib/cpf-cnpj`), `MoneyInput`, `MaskedInput`+máscaras (`percentageMask`, `integerMask`, `cnpjMask`).
- Produces: `CarrierFormValues`/`carrierSchema` (campos base + sobretaxas); actions `fetchCarriersPage`, `createCarrier`; tipos `CarrierBaseRow`.

- [ ] **Step 1: Zod schema `carrier-schema.ts`**

```ts
import { z } from "zod";
import { isValidCnpj } from "@/lib/cpf-cnpj";

const pct = z.number().min(0, "≥ 0").max(100, "≤ 100").optional().nullable();
const money = z.number().nonnegative("≥ 0").max(1_000_000).optional().nullable();

export const carrierSchema = z.object({
	name: z.string().trim().min(1, "Nome obrigatório").max(120),
	cnpj: z.string().trim().refine((v) => !v || isValidCnpj(v), "CNPJ inválido").optional().or(z.literal("")),
	active: z.boolean().default(true),
	cubageDivisor: z.number().int("Inteiro").positive("> 0").max(100_000).default(6000),
	grisPercent: pct,
	grisMinAmount: money,
	advaloremPercent: pct,
	tollAmount: money,
	icmsPercent: z.number().min(0).max(99.99).optional().nullable(),
	notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type CarrierFormValues = z.infer<typeof carrierSchema>;
```

- [ ] **Step 2: Reads paginados em `data.ts` + thin wrapper em `actions.ts`**

Em `data.ts` adicionar `CarrierBaseRow` + `getCarriersPage({ cursor })` (keyset por `createdAt desc, id desc`, `.limit(BATCH_SIZE+1)`, `paginate(...)`) — espelhar `fetchSuppliersPage` de `suppliers`. Em `actions.ts` o thin wrapper:

```ts
export async function fetchCarriersPage({
	cursor,
}: { cursor: string | null }): Promise<InfiniteResult<CarrierBaseRow>> {
	await requireCapability("shipping.read");
	const { getCarriersPage } = await import("./data");
	return getCarriersPage({ cursor });
}
```

(Imports a adicionar em actions.ts: `BATCH_SIZE, type InfiniteResult` de `@/lib/infinite`; `CarrierBaseRow` via `import type` de `./data`.)

- [ ] **Step 3: Action `createCarrier`**

```ts
import { carrier } from "@emach/db/schema/shipping";
import { normalizeCnpj } from "@/lib/cpf-cnpj";
import { carrierSchema, type CarrierFormValues } from "./_components/carrier-schema";

function numOrNull(v: number | null | undefined): string | null {
	return v === null || v === undefined ? null : v.toString();
}

export async function createCarrier(input: CarrierFormValues): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("shipping.manage");
	const parsed = carrierSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: actionErrorMessage(parsed.error) };
	const id = crypto.randomUUID();
	try {
		await db.insert(carrier).values({
			id,
			name: parsed.data.name,
			cnpj: parsed.data.cnpj ? normalizeCnpj(parsed.data.cnpj) : null,
			active: parsed.data.active,
			cubageDivisor: parsed.data.cubageDivisor,
			grisPercent: numOrNull(parsed.data.grisPercent),
			grisMinAmount: numOrNull(parsed.data.grisMinAmount),
			advaloremPercent: numOrNull(parsed.data.advaloremPercent),
			tollAmount: numOrNull(parsed.data.tollAmount),
			icmsPercent: numOrNull(parsed.data.icmsPercent),
			notes: parsed.data.notes || null,
		});
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "shipping.carrier.created",
		targetId: id,
		targetType: "carrier",
		metadata: { name: parsed.data.name },
	});
	revalidatePath(SHIPPING_PATH);
	return { ok: true, data: { id } };
}
```

- [ ] **Step 4: UI — `carriers-tab.tsx`, `carrier-card-grid.tsx`, `carrier-card.tsx`, `carrier-form-fields.tsx`, `carrier-create-sheet.tsx`**

- `carriers-tab.tsx` (Server): `fetchCarriersPage({ cursor: null })`, renderiza `<CarrierCardGrid initial initialCursor />` (copiar `supplier-card-grid.tsx` trocando fetch/tipo/card) e monta `<CarrierCreateSheet />` (lendo `?newCarrier=1`).
- `carrier-card.tsx`: card → `Link`/router para `/dashboard/shipping/carriers/<id>` (detalhe na Task 10). Mostra nome, CNPJ (mascarado), badge ativo, e contadores de zonas/faixas (se baratos via agregado; senão omitir nesta task).
- `carrier-form-fields.tsx`: `LabeledField` + `Input` (nome), `MaskedInput`+`cnpjMask` (CNPJ), `MaskedInput`+`integerMask` (divisor, default 6000), `MoneyInput` (grisMinAmount, tollAmount), `MaskedInput`+`percentageMask` (grisPercent, advaloremPercent, icmsPercent), `Switch` (active), `Textarea` (notes). Help tooltips em GRIS/ad valorem/ICMS explicando "% sobre valor da NF" / "ICMS por dentro".
- `carrier-create-sheet.tsx`: copiar `branch-edit-sheet.tsx` (modo create), param `newCarrier`, schema `carrierSchema`, action `createCarrier`; no sucesso, `router.push("/dashboard/shipping/carriers/" + res.data.id)` para já abrir o detalhe e cadastrar a tabela.

- [ ] **Step 5: Header-action "Nova transportadora" na page**

Em `page.tsx`, ler `session` do guard e `can(session, "shipping.manage")`, e injetar no `PageHeader action={...}` condicionado a `sp.tab` (default/`transportadoras` → botão "Nova transportadora" que faz `?newCarrier=1`; `caixas` → "Nova caixa" `?newBox=1`; `config` → undefined). Usar um pequeno Client Component `ShippingHeaderAction` (igual `EditBranchButton`) que escreve o param.

```tsx
// trecho do PageHeader em page.tsx:
const session = await requireCapabilityOrRedirect("shipping.read");
const canManage = await can(session, "shipping.manage");
// ...
<PageHeader
	action={canManage ? <ShippingHeaderAction tab={sp.tab ?? "transportadoras"} /> : undefined}
	description="Transportadoras, tabelas de frete e caixas de envio."
	title="Frete"
/>
```

- [ ] **Step 6: Verificar — tipos, lint, BUILD, smoke**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web check && bun run build`
Expected: PASS (build valida o `"use server"` movido na Task 7). Smoke: criar transportadora pelo botão do header → redireciona pro detalhe; lista mostra o card.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/shipping
git commit -m "feat(web): CRUD de transportadora (lista e criar)"
```

---

## Task 10: Detalhe da transportadora + edição de sobretaxas

**Files:**
- Create: `apps/web/src/app/dashboard/shipping/carriers/[id]/page.tsx`
- Create: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/carrier-identity.tsx`
- Create: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/carrier-edit-sheet.tsx`
- Modify: `apps/web/src/app/dashboard/shipping/actions.ts` (`updateCarrier`, `deleteCarrier`)
- Modify: `apps/web/src/app/dashboard/shipping/data.ts` (`getCarrierDetail`)

**Interfaces:**
- Consumes: `carrierSchema` (Task 9); `EntityIdentityHeader`, `EntityTabs`; `requireCapabilityOrRedirect`/`can`.
- Produces: `getCarrierDetail(id): Promise<CarrierDetail | null>`; actions `updateCarrier(id, input)`, `deleteCarrier(id)`. Tabs `sobretaxas` (default) · `zonas` (Task 11) · `preview` (Task 12).

- [ ] **Step 1: `getCarrierDetail` em `data.ts`**

```ts
import { carrier, carrierZone, carrierRate } from "@emach/db/schema/shipping";
import { eq, asc } from "drizzle-orm";

export interface CarrierDetail {
	id: string;
	name: string;
	cnpj: string | null;
	active: boolean;
	cubageDivisor: number;
	grisPercent: string | null;
	grisMinAmount: string | null;
	advaloremPercent: string | null;
	tollAmount: string | null;
	icmsPercent: string | null;
	notes: string | null;
}

export async function getCarrierDetail(id: string): Promise<CarrierDetail | null> {
	const [row] = await db.select().from(carrier).where(eq(carrier.id, id)).limit(1);
	if (!row) return null;
	return {
		id: row.id, name: row.name, cnpj: row.cnpj, active: row.active,
		cubageDivisor: row.cubageDivisor, grisPercent: row.grisPercent,
		grisMinAmount: row.grisMinAmount, advaloremPercent: row.advaloremPercent,
		tollAmount: row.tollAmount, icmsPercent: row.icmsPercent, notes: row.notes,
	};
}
```

- [ ] **Step 2: `updateCarrier` + `deleteCarrier` em `actions.ts`**

`updateCarrier(id, input)` = espelho de `createCarrier` com `db.update(...).where(eq(carrier.id, id))` + `action: "shipping.carrier.updated"`. `deleteCarrier(id)` = `requireCapability("shipping.manage")` + `db.delete(carrier).where(eq(carrier.id, id))` (cascade derruba zonas/rates) + `logUserActivity action: "shipping.carrier.deleted"` + `revalidatePath`. No catch usar `actionErrorMessage`.

- [ ] **Step 3: `page.tsx` do detalhe**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityTabs, type EntityTab } from "@/components/entity/entity-tabs";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { getCarrierDetail } from "../../data";
import { CarrierIdentity } from "./_components/carrier-identity";
import { CarrierEditSheet } from "./_components/carrier-edit-sheet";
import { SurchargesTab } from "./_components/surcharges-tab"; // criado neste task
import { ZonesTab } from "./_components/zones-tab"; // Task 11
import { CarrierPreviewTab } from "./_components/carrier-preview-tab"; // Task 12

export const metadata: Metadata = { title: "Transportadora" };

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string; edit?: string }>;
}

export default function CarrierDetailPage({ params, searchParams }: PageProps) {
	return <Content params={params} searchParams={searchParams} />;
}

async function Content({ params, searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("shipping.read");
	const canManage = await can(session, "shipping.manage");
	const { id } = await params;
	const sp = await searchParams;
	const detail = await getCarrierDetail(id);
	if (!detail) notFound();

	const tabs: EntityTab[] = [
		{ value: "sobretaxas", label: "Sobretaxas", content: <SurchargesTab detail={detail} /> },
		{ value: "zonas", label: "Zonas & Tabela", content: sp.tab === "zonas" ? <ZonesTab carrierId={id} /> : null },
		{ value: "preview", label: "Preview", content: sp.tab === "preview" ? <CarrierPreviewTab carrierId={id} /> : null },
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<CarrierIdentity actions={canManage ? "edit-button" : null} detail={detail} />
			<EntityTabs defaultValue="sobretaxas" tabs={tabs} />
			{canManage && sp.edit === "1" ? <CarrierEditSheet detail={detail} /> : null}
		</div>
	);
}
```

- `carrier-identity.tsx`: `EntityIdentityHeader` (avatar quadrado com inicial, title=nome, badges=ativo/inativo, actions=botão Editar via `?edit=1` quando `canManage`). 
- `carrier-edit-sheet.tsx`: copiar `branch-edit-sheet.tsx`, schema `carrierSchema`, action `updateCarrier`, campos `<CarrierFormFields>` (reuso da Task 9).
- `surcharges-tab.tsx`: Server Component read-only que **exibe** as sobretaxas formatadas (`formatMeasure`/`formatMoney`/`%`) + um botão "Editar" (abre o mesmo `?edit=1`). (A edição é o drawer; a aba só mostra os valores atuais + divisor de cubagem.)

- [ ] **Step 4: Verificar + smoke**

Run: `bun --cwd apps/web check-types && bun run build`
Expected: PASS. Smoke: abrir detalhe da transportadora, editar sobretaxas via drawer, ver valores formatados.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/shipping/carriers
git commit -m "feat(web): detalhe e sobretaxas da transportadora"
```

---

## Task 11: Editor de zonas + tabela de faixas de peso

**Files:**
- Create: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/zones-tab.tsx` (Server)
- Create: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/zone-editor.tsx` (Client)
- Create: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/rate-table-editor.tsx` (Client)
- Create: `apps/web/src/app/dashboard/shipping/_components/zone-schema.ts`
- Modify: `apps/web/src/app/dashboard/shipping/actions.ts` (`upsertZone`, `deleteZone`, `saveZoneRates`)
- Modify: `apps/web/src/app/dashboard/shipping/data.ts` (`getCarrierZones`)

**Interfaces:**
- Consumes: schema `carrierZone`/`carrierRate` (Task 1); `CepRangesEditor` + `CepRangeValue` (`@/app/dashboard/branches/_components/cep-ranges-editor` — **reuso**); `MoneyInput`, `MaskedInput`+`decimalMask`/`integerMask`.
- Produces: `zoneSchema`/`ZoneFormValues`, `rateRowSchema`/`RateRow`; actions `upsertZone`, `deleteZone`, `saveZoneRates`; `getCarrierZones(carrierId)`.

- [ ] **Step 1: Zod `zone-schema.ts`**

```ts
import { z } from "zod";

export const cepRangeSchema = z.object({
	from: z.string().trim().regex(/^\d{8}$/, "8 dígitos"),
	to: z.string().trim().regex(/^\d{8}$/, "8 dígitos"),
	label: z.string().trim().max(60).optional(),
}).refine((r) => r.from <= r.to, { message: "De deve ser ≤ Até", path: ["to"] });

export const zoneSchema = z.object({
	name: z.string().trim().min(1, "Nome obrigatório").max(80),
	cepRanges: z.array(cepRangeSchema).min(1, "Adicione ao menos uma faixa de CEP").max(50),
	deliveryDays: z.number().int().min(0).max(365).optional().nullable(),
	minFreightAmount: z.number().nonnegative().max(100_000).optional().nullable(),
});
export type ZoneFormValues = z.infer<typeof zoneSchema>;

export const rateRowSchema = z.object({
	weightFromKg: z.number().nonnegative("≥ 0"),
	weightToKg: z.number().positive("> 0").nullable(), // null = ∞
	baseAmount: z.number().nonnegative("≥ 0"),
	perKgAmount: z.number().nonnegative("≥ 0").default(0),
}).refine((r) => r.weightToKg === null || r.weightToKg > r.weightFromKg, {
	message: "Até deve ser > De", path: ["weightToKg"],
});
export type RateRow = z.infer<typeof rateRowSchema>;

export const ratesSchema = z.array(rateRowSchema).min(1, "Adicione ao menos uma faixa");
```

- [ ] **Step 2: `getCarrierZones` em `data.ts`**

```ts
export interface ZoneWithRates {
	id: string;
	name: string;
	cepRanges: { from: string; to: string; label?: string }[];
	deliveryDays: number | null;
	minFreightAmount: string | null;
	rates: { id: string; weightFromKg: string; weightToKg: string | null; baseAmount: string; perKgAmount: string }[];
}

export async function getCarrierZones(carrierId: string): Promise<ZoneWithRates[]> {
	const zones = await db.select().from(carrierZone)
		.where(eq(carrierZone.carrierId, carrierId))
		.orderBy(asc(carrierZone.sortOrder), asc(carrierZone.name));
	const rates = await db.select().from(carrierRate)
		.where(eq(carrierRate.carrierId, carrierId))
		.orderBy(asc(carrierRate.weightFromKg));
	return zones.map((z) => ({
		id: z.id, name: z.name, cepRanges: z.cepRanges,
		deliveryDays: z.deliveryDays, minFreightAmount: z.minFreightAmount,
		rates: rates.filter((r) => r.zoneId === z.id).map((r) => ({
			id: r.id, weightFromKg: r.weightFromKg, weightToKg: r.weightToKg,
			baseAmount: r.baseAmount, perKgAmount: r.perKgAmount,
		})),
	}));
}
```

- [ ] **Step 3: Actions `upsertZone`, `deleteZone`, `saveZoneRates`**

`upsertZone(carrierId, zoneId|null, input: ZoneFormValues)`: `requireCapability("shipping.manage")` + `safeParse(zoneSchema)`; se `zoneId` null → insert (id novo), senão update; persistir `cepRanges` direto (jsonb), `minFreightAmount`/`deliveryDays` coercidos; `logUserActivity action:"shipping.zone.upserted"`; `revalidatePath`. `deleteZone(zoneId)`: delete (cascade nas rates). `saveZoneRates(carrierId, zoneId, rows: RateRow[])`: `safeParse(ratesSchema)`; transação que **substitui** as rates da zona (`db.delete(carrierRate).where(eq(zoneId))` + `db.insert(carrierRate).values(rows.map(...))` com `id: crypto.randomUUID()`, `carrierId`, `zoneId`, valores `.toString()` e `weightToKg` null→null); `logUserActivity action:"shipping.rates.saved"`. Tudo dentro de `try/catch` com `actionErrorMessage`.

- [ ] **Step 4: UI — `zones-tab.tsx` (Server), `zone-editor.tsx`, `rate-table-editor.tsx`**

- `zones-tab.tsx`: `getCarrierZones(carrierId)`; lista de zonas (cada uma um card/accordion) + botão "Nova zona". Passa `canManage`.
- `zone-editor.tsx` (Client): form da zona — nome (`Input`), `CepRangesEditor` **reusado** (`value={cepRanges}` mapeado para `CepRangeValue[]`, `onChange` → patch), `deliveryDays` (`MaskedInput`+`integerMask`), `minFreightAmount` (`MoneyInput`); `useFormErrors<ZoneFormValues>`; submit → `upsertZone`. `<FieldError>{errors.cepRanges}</FieldError>` no nível do bloco. Botão deletar zona → `deleteZone` (AlertDialog).
- `rate-table-editor.tsx` (Client): grid editável de faixas — cada linha: De (`MaskedInput`+`decimalMask`), Até (`MaskedInput`+`decimalMask`, vazio = ∞ → null), Base (`MoneyInput`), R$/kg (`MoneyInput`). Botões "Adicionar faixa" / remover linha. Submit "Salvar tabela" → `saveZoneRates(carrierId, zoneId, rows)`; valida com `ratesSchema` via `useFormErrors`; mostra erro por linha no bloco. Render dos valores existentes via os números (estado local number), nunca string crua.

> Reuso-chave: `import { CepRangesEditor, type CepRangeValue } from "@/app/dashboard/branches/_components/cep-ranges-editor"`. Mapear `ZoneWithRates.cepRanges` → `CepRangeValue[]` (campos idênticos) e de volta no submit.

- [ ] **Step 5: Verificar + smoke**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web check && bun run build`
Expected: PASS. Smoke: criar zona com faixa de CEP "Brasil todo" (preset), adicionar faixas de peso, salvar, recarregar e ver persistido.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/shipping/carriers apps/web/src/app/dashboard/shipping/_components/zone-schema.ts
git commit -m "feat(web): editor de zonas e tabela de frete"
```

---

## Task 12: Preview de cotação + contrato de integração

**Files:**
- Create: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/carrier-preview-tab.tsx` (Server shell) + `preview-form.tsx` (Client)
- Create: `apps/web/src/app/dashboard/shipping/preview-action.ts` (ou adicionar em `actions.ts`)
- Modify: `docs/integration/admin-ecommerce.md`

**Interfaces:**
- Consumes: `quoteShipping`, `getActiveCarriersWithTables`, `getActiveBoxes` (Tasks 3-5); `tool` dims (`@emach/db`).
- Produces: action `previewQuote({ carrierId?, destinationCep, items })` retornando `QuoteResult` filtrado pela transportadora; UI de teste.

- [ ] **Step 1: Action `previewQuote`**

```ts
"use server";
// em apps/web/src/app/dashboard/shipping/actions.ts (ou arquivo dedicado)
import { db } from "@emach/db";
import { getActiveBoxes, getActiveCarriersWithTables } from "@emach/db/queries/shipping";
import { quoteShipping, type QuoteItem, type QuoteResult } from "@emach/db/queries/shipping-quote";

export async function previewQuote(input: {
	destinationCep: string;
	declaredValue: number;
	items: QuoteItem[];
}): Promise<ActionResult<QuoteResult>> {
	await requireCapability("shipping.read");
	try {
		const [carriers, boxes] = await Promise.all([
			getActiveCarriersWithTables(db),
			getActiveBoxes(db),
		]);
		const result = quoteShipping({ ...input, carriers, boxes });
		return { ok: true, data: result };
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}
}
```

- [ ] **Step 2: UI Preview**

`carrier-preview-tab.tsx` (Server): busca a lista de tools (id, nome, dims, peso, packagingWeightKg, stackable, shipsInOwnBox) p/ o seletor; renderiza `<PreviewForm carrierId tools={...} />`. `preview-form.tsx` (Client): inputs de CEP destino (`MaskedInput`+`cepMask`), valor declarado (`MoneyInput`), e um seletor "produto + quantidade" que monta `items: QuoteItem[]`. Botão "Cotar" → `previewQuote(...)`; mostra `options` (transportadora, valor via `formatMoney`, prazo) destacando a transportadora atual (`carrierId`), e os `unquotable` com o motivo legível ("Sem zona para o CEP", "Sem faixa de peso", "Fora do catálogo de caixas → a combinar").

- [ ] **Step 3: Atualizar o contrato de integração**

Em `docs/integration/admin-ecommerce.md`, na seção de frete, documentar: as 4 tabelas novas; que o storefront passa a cotar via `getActiveCarriersWithTables(db)` + `getActiveBoxes(db)` + `quoteShipping(...)` de `@emach/db/queries/shipping*`; o comportamento "a combinar" (sem zona / sem faixa / fora de catálogo → `overweightShippingAmount` fixo ou "a combinar"); e que isso substitui o caminho SuperFrete no preço.

- [ ] **Step 4: Verificar + smoke**

Run: `bun --cwd apps/web check-types && bun run build`
Expected: PASS. Smoke: aba Preview, cotar um CEP coberto → vê valor; CEP não coberto → "a combinar"/unquotable.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/shipping docs/integration/admin-ecommerce.md
git commit -m "feat(web): preview de cotacao e contrato de frete"
```

---

## Task 13: Seed de dev + sync para ecommerce + handoff

**Files:**
- Modify: `packages/db/scripts/seed-demo.ts` (caixas + 1 transportadora exemplo)

**Interfaces:**
- Consumes: schema Task 1.

- [ ] **Step 1: Adicionar seed de caixas + transportadora**

Em `packages/db/scripts/seed-demo.ts`, inserir um catálogo de caixas (S/M/L/XL com as dims do exemplo da spec) e 1 transportadora "Transportadora Exemplo" (cubage 6000) com 2 zonas — "Curitiba e RMC" (`80000000–82999999`) e "Brasil" (`00000000–99999999`) — cada uma com 2-3 faixas de peso. IDs via `crypto.randomUUID()`. Espelhar o estilo de insert dos outros seeds no arquivo.

- [ ] **Step 2: Rodar o seed e verificar**

Run: `bun --cwd packages/db db:seed-demo`
Expected: caixas e transportadora exemplo aparecem em `/dashboard/shipping`.

- [ ] **Step 3: Commit + push (deixa o CI ADR-0009 abrir o PR de schema no ecommerce)**

```bash
git add packages/db/scripts/seed-demo.ts
git commit -m "chore(db): seed de caixas e transportadora exemplo"
```

- [ ] **Step 4: Abrir issue de handoff no repo ecommerce**

Criar issue no repo do ecommerce (`gh issue create` no repo ecommerce, NÃO editar código de lá daqui): "Consumir motor de frete por tabela no checkout" — trocar a chamada SuperFrete por `quoteShipping(...)` lendo `getActiveCarriersWithTables`/`getActiveBoxes`; tratar `unquotable` como "Frete a combinar". Referenciar a spec e o contrato atualizado.

---

## Self-Review (preenchido pelo autor)

**Spec coverage:** §4 schema → Tasks 1-2; §5 motor → Tasks 3-5; §6 UI/nav → Tasks 7-11; §7 permissões → Task 6; §8 migração/seed/handoff → Tasks 1-2 (db:sync), 12-13; §9 testes → Tasks 3-4 (engine TDD) + smoke nas UI; §3 decisões → todas refletidas. Sem lacuna.

**Placeholders:** nenhum "TBD/TODO"; código completo em schema, motor (TDD) e actions; componentes-espelho referenciam o arquivo canônico exato + as adaptações precisas (não "similar a") — aceitável em codebase existente onde o padrão JÁ existe e está citado.

**Type consistency:** `QuoteItem`/`QuoteBox`/`QuoteCarrier`/`QuoteResult` definidos em Task 3-4 e reusados em 5/12; `ShippingBoxRow`/`CarrierBaseRow`/`CarrierDetail`/`ZoneWithRates` definidos em data.ts e consumidos pelas actions/UI; capabilities `shipping.read`/`shipping.manage` consistentes do Task 6 em diante; `SHIPPING_PATH` reusado nas actions.

**Ordem de execução / nota:** Task 7 deixa imports de `CarriersTab`/`BoxesTab` que só existem após Tasks 8-9 — implementar na ordem 7→8→9 e rodar o **gate de build** no fim da Task 9 (não isoladamente no meio da 7). As demais tasks são sequencialmente compiláveis.
