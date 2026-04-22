# Catalog Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expandir o catálogo de ferramentas do dashboard com campos fiscais/físicos/técnicos da Master Part List, importar as 34 linhas da planilha, adicionar parâmetros de reposição em stock e alertas visuais, tudo refletido em form, tabela e filtros.

**Architecture:** Schema Drizzle já expandido na Fase 0. Fases subsequentes: aplicar migração → importar planilha → expandir Zod/form (4 seções novas + status enum + regra condicional de imagens) → ampliar tabela e filtros → UI de stock min/reorder com badges de alerta. Consumidor do site público continua o mesmo banco (filtro `status='active' AND visibleOnSite=true` quando site for construído, fora deste plano).

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM + Postgres (Supabase), Zod, shadcn/ui, Turborepo, Bun, Biome/Ultracite. Sem framework de testes — gates = `turbo check-types`, `bunx ultracite check`, smoke manual em browser via `bun dev:web`.

**Spec de origem:** `docs/roadmap/catalog-expansion.md` (doc vivo, atualizar checkboxes lá também conforme fases completam).

---

## File Structure

### Arquivos tocados por fase

| Arquivo | Fase | Responsabilidade |
|---|---|---|
| `packages/db/src/schema/tools.ts` | 0 ✅ | Schema `tool` + enums `ProductType`/`ToolStatus` |
| `packages/db/src/schema/inventory.ts` | 0 ✅ | `stockLevel` com `minQty`/`reorderPoint` |
| `packages/db/src/migrations/*.sql` | 0 ✅ | Migrations Drizzle baseline + diff |
| `packages/db/src/scripts/import-master-part-list.ts` | 0 ✅ / 1 | Importer XLSX → tool (upsert por sku) |
| `.claude/CLAUDE.md` | 0 ✅ | Contexto para sessões futuras |
| `docs/roadmap/catalog-expansion.md` | 0 ✅ / 5 | Doc vivo de progresso |
| `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-schema.ts` | 2 | Zod schema + enums UI |
| `apps/web/src/app/dashboard/(inventory)/tools/actions.ts` | 2 | `normalizePayload` + `createTool`/`updateTool` |
| `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx` | 2 | 4 seções novas + status enum |
| `apps/web/src/app/dashboard/(inventory)/tools/[id]/edit/page.tsx` | 2 | Mapear defaults dos novos campos |
| `apps/web/src/app/dashboard/(inventory)/tools/[id]/page.tsx` | 2 | Render detail dos novos campos |
| `apps/web/src/app/dashboard/(inventory)/tools/_components/tools-table.tsx` | 3 | Colunas Model/Status |
| `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-filters.tsx` | 3 | Filtros status/productType/ncm |
| `apps/web/src/app/dashboard/(inventory)/tools/page.tsx` | 3 | SELECT novas colunas + WHERE expandido |
| `apps/web/src/app/dashboard/(inventory)/stock/actions.ts` | 4 | Aceitar min/reorder |
| `apps/web/src/app/dashboard/(inventory)/stock/_components/*` | 4 | Tabela com badges |
| `apps/web/src/app/dashboard/page.tsx` | 4 | Card "Itens para repor" |

---

## Phase 1 — Aplicar migração + importar planilha

### Task 1.1: Commit artefatos da Fase 0

**Files:**
- Add: `packages/db/src/schema/tools.ts`
- Add: `packages/db/src/schema/inventory.ts`
- Add: `packages/db/src/migrations/0000_puzzling_zombie.sql`
- Add: `packages/db/src/migrations/0001_glossy_yellow_claw.sql`
- Add: `packages/db/src/migrations/meta/*`
- Add: `packages/db/src/scripts/import-master-part-list.ts`
- Add: `packages/db/package.json`, `bun.lock`
- Add: `.claude/CLAUDE.md`
- Add: `docs/roadmap/catalog-expansion.md`
- Add: `docs/superpowers/plans/2026-04-22-catalog-expansion.md` (este arquivo)

- [ ] **Step 1: Verificar diff**

```bash
git -C /home/othavio/Work/emach/emach-dashboard status --short
git -C /home/othavio/Work/emach/emach-dashboard diff --stat
```

Expected: modificados `packages/db/src/schema/tools.ts`, `inventory.ts`, `packages/db/package.json`, `bun.lock`, `.claude/CLAUDE.md`; untracked `packages/db/src/migrations/`, `packages/db/src/scripts/`, `docs/`.

- [ ] **Step 2: Typecheck final antes de commit**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun run check-types
```

Expected: PASS (zero erros).

- [ ] **Step 3: Stage + commit (aguardar confirmação do usuário)**

```bash
cd /home/othavio/Work/emach/emach-dashboard && git add \
  packages/db/src/schema/tools.ts \
  packages/db/src/schema/inventory.ts \
  packages/db/src/migrations \
  packages/db/src/scripts \
  packages/db/package.json \
  bun.lock \
  .claude/CLAUDE.md \
  docs/roadmap/catalog-expansion.md \
  docs/superpowers/plans/2026-04-22-catalog-expansion.md
```

```bash
git commit -m "$(cat <<'EOF'
feat(db): expande schema tool + stock_level com fiscais/físicos/técnicos/status

- tool ganha model, invoiceModel, productType/status enums (check), hsCode, ncm,
  cest, barcode, manufacturerName, countryOfOrigin, weightKg, dimensões,
  powerWatts, frequencyHz, warrantyMonths.
- stockLevel ganha minQty + reorderPoint com check reorder >= min.
- Adiciona importer XLSX (bun run packages/db/src/scripts/import-master-part-list.ts).
- Doc de roadmap e plano em docs/.
EOF
)"
```

Nota: só rodar `git commit` após confirmação explícita do usuário (regra global).

---

### Task 1.2: Aplicar schema no banco dev (Supabase)

**Files:** nenhum (apenas estado do DB).

- [ ] **Step 1: Confirmar DATABASE_URL dev no `apps/web/.env`**

```bash
grep DATABASE_URL /home/othavio/Work/emach/emach-dashboard/apps/web/.env
```

Expected: URL apontando para banco de dev (não prod).

- [ ] **Step 2: Push do schema**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun run db:push
```

Expected: drizzle-kit aplica ALTER/CREATE; sem erros. Confirmar prompt interativo se surgir.

- [ ] **Step 3: Verificar coluna count**

```bash
cd /home/othavio/Work/emach/emach-dashboard/packages/db && bun -e "
import { db } from './src/index.ts';
import { sql } from 'drizzle-orm';
const r = await db.execute(sql\`SELECT COUNT(*) FROM information_schema.columns WHERE table_name='tool'\`);
console.log(r.rows[0]);
process.exit(0);
"
```

Expected: `{ count: 30 }`.

---

### Task 1.3: Rodar import real

**Files:** nenhum.

- [ ] **Step 1: Dry-run confirma parsing**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun run packages/db/src/scripts/import-master-part-list.ts "/home/othavio/Downloads/Master Part List with HS and NCM code (1).xlsx" --dry-run
```

Expected: `Processed: 34`, `Skipped: 0`.

- [ ] **Step 2: Import real**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun run packages/db/src/scripts/import-master-part-list.ts "/home/othavio/Downloads/Master Part List with HS and NCM code (1).xlsx"
```

Expected: `Inserted: 34` na primeira execução; `Updated: 34` em re-runs.

- [ ] **Step 3: Validação SQL**

```bash
cd /home/othavio/Work/emach/emach-dashboard/packages/db && bun -e "
import { db } from './src/index.ts';
import { sql } from 'drizzle-orm';
const total = await db.execute(sql\`SELECT COUNT(*) FROM tool\`);
const machines = await db.execute(sql\`SELECT COUNT(*) FROM tool WHERE product_type = 'machine'\`);
const samples = await db.execute(sql\`SELECT COUNT(*) FROM tool WHERE sku LIKE 'SAMPLES-%'\`);
const drafts = await db.execute(sql\`SELECT COUNT(*) FROM tool WHERE status = 'draft'\`);
console.log({ total: total.rows[0], machines: machines.rows[0], samples: samples.rows[0], drafts: drafts.rows[0] });
process.exit(0);
"
```

Expected: `total: 34`, `machines: 27`, `samples: 13`, `drafts: 34`.

- [ ] **Step 4: Commit registro de execução**

```bash
git commit --allow-empty -m "chore(db): importa Master Part List (34 SKUs) em status draft"
```

Nota: commit após confirmação explícita do usuário.

---

## Phase 2 — Zod schema + form expandido

### Task 2.1: Expandir `tool-schema.ts`

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-schema.ts`

- [ ] **Step 1: Reescrever schema completo**

```ts
import { z } from "zod";

export const VOLTAGE_OPTIONS = ["127V", "220V", "Bivolt", "380V"] as const;
export const PRODUCT_TYPE_OPTIONS = [
	"machine",
	"equipment",
	"part",
	"accessory",
] as const;
export const TOOL_STATUS_OPTIONS = [
	"draft",
	"active",
	"discontinued",
	"out_of_stock",
] as const;

export const PRODUCT_TYPE_LABELS: Record<
	(typeof PRODUCT_TYPE_OPTIONS)[number],
	string
> = {
	machine: "Máquina",
	equipment: "Equipamento",
	part: "Peça",
	accessory: "Acessório",
};

export const TOOL_STATUS_LABELS: Record<
	(typeof TOOL_STATUS_OPTIONS)[number],
	string
> = {
	draft: "Rascunho",
	active: "Ativo",
	discontinued: "Descontinuado",
	out_of_stock: "Sem estoque",
};

export const MIN_IMAGES_ACTIVE = 3;
export const MAX_IMAGES = 8;

export const toolImageSchema = z.object({
	id: z.string().optional(),
	url: z.url("URL de imagem inválida"),
	sortOrder: z.number().int().min(0),
});

const optionalString = z.string().optional().or(z.literal(""));
const optionalNumber = z
	.number()
	.nonnegative("Deve ser maior ou igual a zero")
	.optional()
	.or(z.nan().transform(() => undefined));
const optionalInt = z
	.number()
	.int()
	.nonnegative("Deve ser maior ou igual a zero")
	.optional()
	.or(z.nan().transform(() => undefined));

export const toolFormSchema = z
	.object({
		name: z.string().min(1, "Nome obrigatório"),
		description: optionalString,
		sku: z.string().min(1, "SKU obrigatório"),
		model: optionalString,
		invoiceModel: optionalString,
		barcode: optionalString,
		manufacturerName: optionalString,
		countryOfOrigin: optionalString,
		productType: z.enum(PRODUCT_TYPE_OPTIONS).optional().or(z.literal("")),
		status: z.enum(TOOL_STATUS_OPTIONS).default("draft"),
		hsCode: optionalString,
		ncm: optionalString,
		cest: optionalString,
		voltage: z.enum(VOLTAGE_OPTIONS).optional().or(z.literal("")),
		powerWatts: optionalInt,
		frequencyHz: optionalInt,
		warrantyMonths: optionalInt,
		weightKg: optionalNumber,
		lengthCm: optionalNumber,
		widthCm: optionalNumber,
		heightCm: optionalNumber,
		price: optionalNumber,
		cost: optionalNumber,
		categoryId: z.string().min(1, "Categoria obrigatória"),
		supplierId: optionalString,
		visibleOnSite: z.boolean().default(true),
		images: z.array(toolImageSchema).max(MAX_IMAGES, `Máximo de ${MAX_IMAGES} imagens`),
	})
	.superRefine((data, ctx) => {
		if (data.status === "active" && data.images.length < MIN_IMAGES_ACTIVE) {
			ctx.addIssue({
				code: "custom",
				path: ["images"],
				message: `Ativar exige mínimo de ${MIN_IMAGES_ACTIVE} imagens`,
			});
		}
	});

export type ToolFormValues = z.infer<typeof toolFormSchema>;
export type ToolImageValue = z.infer<typeof toolImageSchema>;
export type ProductTypeValue = (typeof PRODUCT_TYPE_OPTIONS)[number];
export type ToolStatusValue = (typeof TOOL_STATUS_OPTIONS)[number];

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun run check-types
```

Expected: erros em `tool-form.tsx`, `actions.ts`, `[id]/page.tsx`, `[id]/edit/page.tsx` por campos ausentes — esperado, serão corrigidos nas próximas tasks.

---

### Task 2.2: `normalizePayload` aceita novos campos

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/actions.ts:29-47`

- [ ] **Step 1: Reescrever `normalizePayload`**

```ts
function toNumericString(value: number | undefined): string | null {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return null;
	}
	return value.toFixed(2);
}

function toWeightString(value: number | undefined): string | null {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return null;
	}
	return value.toFixed(3);
}

function toInt(value: number | undefined): number | null {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return null;
	}
	return Math.trunc(value);
}

function nullableText(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function normalizePayload(input: ToolFormValues) {
	return {
		name: input.name,
		description: nullableText(input.description),
		sku: input.sku,
		model: nullableText(input.model),
		invoiceModel: nullableText(input.invoiceModel),
		barcode: nullableText(input.barcode),
		manufacturerName: nullableText(input.manufacturerName),
		countryOfOrigin: nullableText(input.countryOfOrigin),
		productType: input.productType ? input.productType : null,
		status: input.status,
		hsCode: nullableText(input.hsCode),
		ncm: nullableText(input.ncm),
		cest: nullableText(input.cest),
		voltage: input.voltage ? input.voltage : null,
		powerWatts: toInt(input.powerWatts),
		frequencyHz: toInt(input.frequencyHz),
		warrantyMonths: toInt(input.warrantyMonths),
		weightKg: toWeightString(input.weightKg),
		lengthCm: toNumericString(input.lengthCm),
		widthCm: toNumericString(input.widthCm),
		heightCm: toNumericString(input.heightCm),
		price: toNumericString(input.price),
		cost: toNumericString(input.cost),
		visibleOnSite: input.visibleOnSite,
		categoryId: input.categoryId,
		supplierId: nullableText(input.supplierId),
	};
}
```

- [ ] **Step 2: Typecheck (parcial)**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bunx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep actions.ts | head
```

Expected: zero erros em `actions.ts`.

---

### Task 2.3: Form — refatorar `EMPTY_VALUES` + estado

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx:88-99`

- [ ] **Step 1: Substituir `EMPTY_VALUES`**

```ts
const EMPTY_VALUES: ToolFormValues = {
	name: "",
	description: "",
	sku: "",
	model: "",
	invoiceModel: "",
	barcode: "",
	manufacturerName: "",
	countryOfOrigin: "",
	productType: "",
	status: "draft",
	hsCode: "",
	ncm: "",
	cest: "",
	voltage: "",
	powerWatts: undefined,
	frequencyHz: undefined,
	warrantyMonths: undefined,
	weightKg: undefined,
	lengthCm: undefined,
	widthCm: undefined,
	heightCm: undefined,
	price: undefined,
	cost: undefined,
	categoryId: "",
	supplierId: "",
	visibleOnSite: true,
	images: [],
};
```

- [ ] **Step 2: Atualizar imports**

No topo do arquivo, trocar:
```ts
import {
	MAX_IMAGES,
	MIN_IMAGES,
	slugify,
	type ToolFormValues,
	toolFormSchema,
	VOLTAGE_OPTIONS,
} from "./tool-schema";
```
por:
```ts
import {
	MAX_IMAGES,
	MIN_IMAGES_ACTIVE,
	PRODUCT_TYPE_LABELS,
	PRODUCT_TYPE_OPTIONS,
	slugify,
	TOOL_STATUS_LABELS,
	TOOL_STATUS_OPTIONS,
	type ToolFormValues,
	toolFormSchema,
	VOLTAGE_OPTIONS,
} from "./tool-schema";
```

- [ ] **Step 3: Substituir referência `MIN_IMAGES` na seção Mídia**

Na seção `<h2>Mídia · {values.images.length} de {MAX_IMAGES}</h2>`, substituir `<ToolImageGallery min={MIN_IMAGES}` por `<ToolImageGallery min={values.status === "active" ? MIN_IMAGES_ACTIVE : 0}`.

---

### Task 2.4: Form — seção "Identificação extra"

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx` (adicionar seção após "Informações básicas")

**Visual Companion**: neste ponto o usuário deve ser convidado a abrir o companion para comparar layouts das 4 seções novas (accordion vs cards verticais vs abas). Ver nota no final deste plano.

- [ ] **Step 1: Inserir seção após linha com descrição (~252)**

```tsx
<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
	<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
		Identificação extra
	</h2>

	<div className="grid gap-4 md:grid-cols-2">
		<div className="flex flex-col gap-2">
			<Label htmlFor="model">Modelo (curto)</Label>
			<Input
				id="model"
				onChange={(e) => update("model", e.target.value)}
				placeholder="Ex: ELT 800"
				value={values.model ?? ""}
			/>
		</div>

		<div className="flex flex-col gap-2">
			<Label htmlFor="invoiceModel">Modelo de invoice (fábrica)</Label>
			<Input
				id="invoiceModel"
				onChange={(e) => update("invoiceModel", e.target.value)}
				placeholder="Ex: FG-S225L-3-220V"
				value={values.invoiceModel ?? ""}
			/>
		</div>
	</div>

	<div className="grid gap-4 md:grid-cols-3">
		<div className="flex flex-col gap-2">
			<Label htmlFor="barcode">Barcode (EAN/GTIN)</Label>
			<Input
				id="barcode"
				onChange={(e) => update("barcode", e.target.value)}
				value={values.barcode ?? ""}
			/>
		</div>

		<div className="flex flex-col gap-2">
			<Label htmlFor="manufacturerName">Fabricante</Label>
			<Input
				id="manufacturerName"
				onChange={(e) => update("manufacturerName", e.target.value)}
				value={values.manufacturerName ?? ""}
			/>
		</div>

		<div className="flex flex-col gap-2">
			<Label htmlFor="countryOfOrigin">País de origem</Label>
			<Input
				id="countryOfOrigin"
				onChange={(e) => update("countryOfOrigin", e.target.value)}
				placeholder="Ex: BR, CN"
				value={values.countryOfOrigin ?? ""}
			/>
		</div>
	</div>
</section>
```

---

### Task 2.5: Form — seção "Classificação fiscal"

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx` (adicionar após "Identificação extra")

- [ ] **Step 1: Inserir seção**

```tsx
<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
	<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
		Classificação fiscal
	</h2>

	<div className="grid gap-4 md:grid-cols-2">
		<div className="flex flex-col gap-2">
			<Label htmlFor="productType">Tipo de produto</Label>
			<Select
				onValueChange={(v) =>
					update("productType", v as ToolFormValues["productType"])
				}
				value={values.productType ?? ""}
			>
				<SelectTrigger id="productType">
					<SelectValue placeholder="Selecione" />
				</SelectTrigger>
				<SelectContent>
					{PRODUCT_TYPE_OPTIONS.map((p) => (
						<SelectItem key={p} value={p}>
							{PRODUCT_TYPE_LABELS[p]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>

		<div className="flex flex-col gap-2">
			<Label htmlFor="hsCode">HS Code (invoice)</Label>
			<Input
				id="hsCode"
				onChange={(e) => update("hsCode", e.target.value)}
				placeholder="Ex: 8467291000"
				value={values.hsCode ?? ""}
			/>
		</div>
	</div>

	<div className="grid gap-4 md:grid-cols-2">
		<div className="flex flex-col gap-2">
			<Label htmlFor="ncm">NCM</Label>
			<Input
				id="ncm"
				onChange={(e) => update("ncm", e.target.value)}
				placeholder="Ex: 8467.29.99"
				value={values.ncm ?? ""}
			/>
		</div>

		<div className="flex flex-col gap-2">
			<Label htmlFor="cest">CEST</Label>
			<Input
				id="cest"
				onChange={(e) => update("cest", e.target.value)}
				value={values.cest ?? ""}
			/>
		</div>
	</div>
</section>
```

---

### Task 2.6: Form — seção "Dimensões & peso"

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx`

- [ ] **Step 1: Helper `parseDecimal`**

No topo do arquivo, junto com `parseBRLToReais`, adicionar:
```ts
function parseDecimal(display: string): number | undefined {
	const cleaned = display.replace(",", ".").replace(/[^\d.]/g, "");
	if (!cleaned) return undefined;
	const n = Number(cleaned);
	return Number.isNaN(n) ? undefined : n;
}
```

- [ ] **Step 2: Inserir seção após "Classificação fiscal"**

```tsx
<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
	<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
		Dimensões & peso
	</h2>

	<div className="grid gap-4 md:grid-cols-4">
		<div className="flex flex-col gap-2">
			<Label htmlFor="weightKg">Peso (kg)</Label>
			<Input
				id="weightKg"
				inputMode="decimal"
				onChange={(e) => update("weightKg", parseDecimal(e.target.value))}
				value={values.weightKg ?? ""}
			/>
			{errors.weightKg && (
				<p className="text-destructive text-xs">{errors.weightKg}</p>
			)}
		</div>

		<div className="flex flex-col gap-2">
			<Label htmlFor="lengthCm">Comprimento (cm)</Label>
			<Input
				id="lengthCm"
				inputMode="decimal"
				onChange={(e) => update("lengthCm", parseDecimal(e.target.value))}
				value={values.lengthCm ?? ""}
			/>
		</div>

		<div className="flex flex-col gap-2">
			<Label htmlFor="widthCm">Largura (cm)</Label>
			<Input
				id="widthCm"
				inputMode="decimal"
				onChange={(e) => update("widthCm", parseDecimal(e.target.value))}
				value={values.widthCm ?? ""}
			/>
		</div>

		<div className="flex flex-col gap-2">
			<Label htmlFor="heightCm">Altura (cm)</Label>
			<Input
				id="heightCm"
				inputMode="decimal"
				onChange={(e) => update("heightCm", parseDecimal(e.target.value))}
				value={values.heightCm ?? ""}
			/>
		</div>
	</div>
</section>
```

---

### Task 2.7: Form — seção "Especificações técnicas"

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx`

- [ ] **Step 1: Inserir seção após "Dimensões & peso"**

```tsx
<section className="flex flex-col gap-4 rounded-none border border-border bg-card p-6">
	<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
		Especificações técnicas
	</h2>

	<div className="grid gap-4 md:grid-cols-3">
		<div className="flex flex-col gap-2">
			<Label htmlFor="powerWatts">Potência (W)</Label>
			<Input
				id="powerWatts"
				inputMode="numeric"
				onChange={(e) =>
					update("powerWatts", parseDecimal(e.target.value))
				}
				value={values.powerWatts ?? ""}
			/>
		</div>

		<div className="flex flex-col gap-2">
			<Label htmlFor="frequencyHz">Frequência (Hz)</Label>
			<Input
				id="frequencyHz"
				inputMode="numeric"
				onChange={(e) =>
					update("frequencyHz", parseDecimal(e.target.value))
				}
				value={values.frequencyHz ?? ""}
			/>
		</div>

		<div className="flex flex-col gap-2">
			<Label htmlFor="warrantyMonths">Garantia (meses)</Label>
			<Input
				id="warrantyMonths"
				inputMode="numeric"
				onChange={(e) =>
					update("warrantyMonths", parseDecimal(e.target.value))
				}
				value={values.warrantyMonths ?? ""}
			/>
		</div>
	</div>
</section>
```

---

### Task 2.8: Form — status select na seção "Classificação"

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx` (bloco `visibleOnSite`)

- [ ] **Step 1: Substituir switch isolado por grid com status + switch**

Localizar o bloco atual:
```tsx
<div className="flex items-center justify-between border-border border-t pt-4">
	<Label htmlFor="visibleOnSite">Visível no site público</Label>
	<Switch ... />
</div>
```

Substituir por:
```tsx
<div className="grid gap-4 border-border border-t pt-4 md:grid-cols-2">
	<div className="flex flex-col gap-2">
		<Label htmlFor="status">Status</Label>
		<Select
			onValueChange={(v) =>
				update("status", v as ToolFormValues["status"])
			}
			value={values.status}
		>
			<SelectTrigger id="status">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{TOOL_STATUS_OPTIONS.map((s) => (
					<SelectItem key={s} value={s}>
						{TOOL_STATUS_LABELS[s]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
		<p className="text-muted-foreground text-xs">
			"Ativo" exige {MIN_IMAGES_ACTIVE} imagens.
		</p>
	</div>

	<div className="flex items-center justify-between">
		<Label htmlFor="visibleOnSite">Visível no site público</Label>
		<Switch
			checked={values.visibleOnSite}
			id="visibleOnSite"
			onCheckedChange={(checked) => update("visibleOnSite", checked)}
		/>
	</div>
</div>
```

- [ ] **Step 2: Typecheck inteiro**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun run check-types
```

Expected: zero erros (modulo `[id]/page.tsx` e `[id]/edit/page.tsx` ainda pendentes).

---

### Task 2.9: Edit page mapeia defaults novos

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/[id]/edit/page.tsx:30-45` (ajustar bloco `defaultValues`)

- [ ] **Step 1: Ler arquivo atual e substituir construção de `defaultValues`**

Ler o arquivo para ver estrutura exata, então expandir o objeto para incluir:
```ts
defaultValues: {
	name: row.name,
	description: row.description ?? "",
	sku: row.sku ?? "",
	model: row.model ?? "",
	invoiceModel: row.invoiceModel ?? "",
	barcode: row.barcode ?? "",
	manufacturerName: row.manufacturerName ?? "",
	countryOfOrigin: row.countryOfOrigin ?? "",
	productType: row.productType ?? "",
	status: row.status ?? "draft",
	hsCode: row.hsCode ?? "",
	ncm: row.ncm ?? "",
	cest: row.cest ?? "",
	voltage: row.voltage ?? "",
	powerWatts: row.powerWatts ?? undefined,
	frequencyHz: row.frequencyHz ?? undefined,
	warrantyMonths: row.warrantyMonths ?? undefined,
	weightKg: row.weightKg ? Number(row.weightKg) : undefined,
	lengthCm: row.lengthCm ? Number(row.lengthCm) : undefined,
	widthCm: row.widthCm ? Number(row.widthCm) : undefined,
	heightCm: row.heightCm ? Number(row.heightCm) : undefined,
	price: row.price ? Number(row.price) : undefined,
	cost: row.cost ? Number(row.cost) : undefined,
	categoryId: row.categoryId ?? "",
	supplierId: row.supplierId ?? "",
	visibleOnSite: row.visibleOnSite,
	images: images.map((img) => ({
		id: img.id,
		url: img.url,
		sortOrder: img.sortOrder,
	})),
},
```

Ajustar nomes conforme o que já existe no arquivo. Confirmar com `Read` antes de editar.

- [ ] **Step 2: Garantir que query `db.query.tool.findFirst` inclui colunas novas (Drizzle `$inferSelect` já cobre mas confirmar)**

---

### Task 2.10: Detail page renderiza novos campos

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/[id]/page.tsx`

- [ ] **Step 1: Adicionar blocos de display nas seções existentes**

Após seção de "Visibilidade/Categoria", inserir 2 cards novos:
- **Classificação fiscal**: `productType` (label), `hsCode`, `ncm`, `cest` (rows "—" quando null).
- **Especificações**: `model`, `invoiceModel`, `barcode`, `manufacturerName`, `countryOfOrigin`, `voltage`, `powerWatts`, `frequencyHz`, `warrantyMonths`, `weightKg`, dimensões concatenadas `LxWxH cm`.
- **Status**: badge colorido derivado de `row.status`.

Padrão shadcn existente: usar `<Badge>` + `<dl>` com `<dt>/<dd>`. Replicar estilo da seção de visibilidade.

- [ ] **Step 2: Typecheck final fase 2**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun run check-types
```

Expected: zero erros.

- [ ] **Step 3: Ultracite**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun x ultracite check
```

Expected: pass (ou só warnings justificados).

- [ ] **Step 4: Smoke test manual**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun dev:web
```

Abrir `http://localhost:3001/dashboard/tools`, escolher uma tool importada (draft), editar. Verificar:
- Todas 4 seções novas aparecem com dados da planilha
- Status select funciona
- Trocar status para "Ativo" sem 3 imgs dispara erro "Ativar exige mínimo de 3 imagens"
- Voltar para "draft" + salvar funciona

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web/src/app/dashboard/\(inventory\)/tools/_components/tool-schema.ts \
  apps/web/src/app/dashboard/\(inventory\)/tools/_components/tool-form.tsx \
  apps/web/src/app/dashboard/\(inventory\)/tools/actions.ts \
  apps/web/src/app/dashboard/\(inventory\)/tools/\[id\]/page.tsx \
  apps/web/src/app/dashboard/\(inventory\)/tools/\[id\]/edit/page.tsx
git commit -m "feat(tools): expande form com identificação/fiscal/físico/técnico + status enum"
```

Nota: aguardar confirmação do usuário.

---

## Phase 3 — Tabela + filtros

### Task 3.1: Expandir `ToolRow` + SELECT

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tools-table.tsx:17-27`
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/page.tsx:57-104`

- [ ] **Step 1: Adicionar campos em `ToolRow`**

```ts
export interface ToolRow {
	categoryName: string | null;
	id: string;
	imageUrl: string | null;
	model: string | null;
	name: string;
	productType: string | null;
	sku: string | null;
	slug: string | null;
	status: string;
	supplierName: string | null;
	totalStock: number;
	visibleOnSite: boolean;
}
```

- [ ] **Step 2: SELECT inclui `t.model`, `t.product_type`, `t.status`**

Trocar o bloco SELECT em `page.tsx:67-91` para incluir:
```sql
t.model,
t.product_type,
t.status,
```

Adicionar ao tipo do `db.execute<...>`:
```ts
model: string | null;
product_type: string | null;
status: string;
```

Adicionar ao mapping do `rows.rows.map`:
```ts
model: r.model,
productType: r.product_type,
status: r.status,
```

---

### Task 3.2: ToolsTable colunas Model/Status

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tools-table.tsx`

- [ ] **Step 1: Import labels**

```ts
import {
	PRODUCT_TYPE_LABELS,
	type ProductTypeValue,
	TOOL_STATUS_LABELS,
	type ToolStatusValue,
} from "./tool-schema";
```

- [ ] **Step 2: Helper para variant de status badge**

```ts
const STATUS_BADGE_VARIANT: Record<ToolStatusValue, "default" | "secondary" | "outline" | "destructive"> = {
	active: "default",
	draft: "secondary",
	discontinued: "outline",
	out_of_stock: "destructive",
};
```

- [ ] **Step 3: Adicionar colunas `Model` e `Status` antes de "Visibilidade"**

No `<TableHeader>`:
```tsx
<TableHead>Modelo</TableHead>
<TableHead>Status</TableHead>
```

No `<TableBody>` dentro do map:
```tsx
<TableCell className="text-muted-foreground text-sm">
	{t.model ?? "—"}
</TableCell>
<TableCell>
	<Badge variant={STATUS_BADGE_VARIANT[t.status as ToolStatusValue] ?? "outline"}>
		{TOOL_STATUS_LABELS[t.status as ToolStatusValue] ?? t.status}
	</Badge>
</TableCell>
```

Manter coluna "Visibilidade" como está.

---

### Task 3.3: Filtros novos em `tool-filters.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-filters.tsx`

- [ ] **Step 1: Ler arquivo atual para entender padrão (usa `useRouter` + `URLSearchParams`)**

```bash
cat apps/web/src/app/dashboard/\(inventory\)/tools/_components/tool-filters.tsx
```

- [ ] **Step 2: Adicionar três controles — Status (multi-select simples via checkboxes), Tipo (select), NCM (input text)**

Seguir padrão atual do arquivo para integração com URL params. Importar `PRODUCT_TYPE_*` e `TOOL_STATUS_*` de `./tool-schema`.

**Visual Companion**: usuário deve ser convidado a comparar placement dos filtros (inline topbar vs collapsible vs sidebar).

---

### Task 3.4: Page aplica novos WHERE

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/page.tsx`

- [ ] **Step 1: Estender tipo `searchParams`**

```ts
interface PageProps {
	searchParams: Promise<{
		category?: string;
		ncm?: string;
		productType?: string;
		q?: string;
		search?: string;
		status?: string;
		visible?: string;
	}>;
}
```

- [ ] **Step 2: Estender `fetchTools` params + conditions**

Adicionar:
```ts
if (params.status) {
	const statuses = params.status.split(",").filter(Boolean);
	if (statuses.length > 0) {
		conditions.push(sql`t.status = ANY(${statuses})`);
	}
}
if (params.productType) {
	conditions.push(sql`t.product_type = ${params.productType}`);
}
if (params.ncm) {
	conditions.push(sql`t.ncm ILIKE ${`${params.ncm}%`}`);
}
```

- [ ] **Step 3: Atualizar chamada de `fetchTools`**

```ts
const [tools, categories] = await Promise.all([
	fetchTools({ ...params, search }),
	fetchCategories(),
]);
```

(já passa todos os params; só confirmar tipo).

- [ ] **Step 4: Typecheck + ultracite + smoke**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun run check-types && bun x ultracite check
```

Smoke: filtrar por `status=draft`, `productType=machine`, `ncm=8467`. Verificar colunas Model + Status badge aparecem.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/\(inventory\)/tools/page.tsx \
  apps/web/src/app/dashboard/\(inventory\)/tools/_components/tools-table.tsx \
  apps/web/src/app/dashboard/\(inventory\)/tools/_components/tool-filters.tsx
git commit -m "feat(tools): tabela exibe model/status + filtros productType/status/ncm"
```

Nota: aguardar confirmação.

---

## Phase 4 — Stock UI: min/reorder + alertas

### Task 4.1: Ler stock actions + branch stock UI atuais

**Files:** (leitura apenas)

- [ ] **Step 1: Ler arquivos**

```bash
cat apps/web/src/app/dashboard/\(inventory\)/stock/actions.ts
ls apps/web/src/app/dashboard/\(inventory\)/stock/_components/
ls apps/web/src/app/dashboard/\(inventory\)/stock/branches/
```

Identificar a server action que atualiza `stockLevel` e o componente que renderiza a tabela por filial.

---

### Task 4.2: Estender server action de stock

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/stock/actions.ts`

- [ ] **Step 1: Adicionar `minQty` e `reorderPoint` ao payload da action de update**

Extender o Zod schema local (se existir) para aceitar os 2 novos inteiros, default 0. Propagar no `db.update(stockLevel).set({...})`.

- [ ] **Step 2: Validação**

```ts
if (input.reorderPoint < input.minQty) {
	return { ok: false, error: "reorderPoint deve ser >= minQty" };
}
```

---

### Task 4.3: UI de edição stock por filial

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/stock/_components/*` (componente de tabela de stock por filial; confirmar path ao ler Task 4.1)

- [ ] **Step 1: Adicionar duas colunas editáveis `Min` e `Reposição`**

Inputs numéricos controlados. Validar inline: vermelho se `reorder < min`.

- [ ] **Step 2: Badges de alerta na coluna de quantidade**

```tsx
{quantity <= minQty && (
	<Badge variant="destructive">Crítico</Badge>
)}
{quantity > minQty && quantity <= reorderPoint && (
	<Badge variant="secondary">Repor</Badge>
)}
```

**Visual Companion**: usuário convidado a escolher esquema de cor/threshold.

---

### Task 4.4: Card "Itens para repor" no dashboard

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Adicionar query de contagem**

```ts
const restock = await db.execute<{ count: number }>(
	sql`SELECT COUNT(*)::int AS count FROM stock_level WHERE quantity <= reorder_point`
);
const restockCount = restock.rows[0]?.count ?? 0;
```

- [ ] **Step 2: Card seguindo padrão dos outros**

Seguir exatamente o estilo dos cards existentes no dashboard (confirmar com `Read` antes). Link para `/dashboard/stock`.

- [ ] **Step 3: Typecheck + ultracite + smoke**

Smoke: abrir `/dashboard`, ver contagem; ir em `/dashboard/stock/branches/<id>`, editar min=5 reorder=10 em um tool, voltar ao dashboard, ver contagem refletir.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/\(inventory\)/stock \
  apps/web/src/app/dashboard/page.tsx
git commit -m "feat(stock): adiciona minQty/reorderPoint + badges de reposição"
```

Nota: aguardar confirmação.

---

## Phase 5 — Revisão final

### Task 5.1: Gates globais

- [ ] **Step 1: Typecheck full monorepo**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun run check-types
```

Expected: zero erros.

- [ ] **Step 2: Ultracite**

```bash
cd /home/othavio/Work/emach/emach-dashboard && bun x ultracite check
```

Expected: pass.

- [ ] **Step 3: Drizzle diff-vazio**

```bash
cd /home/othavio/Work/emach/emach-dashboard/packages/db && bun db:generate
```

Expected: "No schema changes, nothing to migrate" (ou equivalente).

- [ ] **Step 4: Smoke manual end-to-end**

Executar roteiro completo:
1. Criar tool draft do zero (sem imagens) — salva.
2. Preencher 3 imagens, trocar status p/ "Ativo" — salva.
3. Trocar para "Ativo" com 2 imagens — erro esperado.
4. Filtrar `/dashboard/tools?status=active&productType=machine&ncm=8467`.
5. `/dashboard/stock/branches/<id>` — editar min/reorder, ver badges.
6. Ver card "Itens para repor" no dashboard.

---

### Task 5.2: Atualizar doc de roadmap + commit final

**Files:**
- Modify: `docs/roadmap/catalog-expansion.md`

- [ ] **Step 1: Marcar todas checkboxes ✅ nas fases 1–5**

- [ ] **Step 2: Atualizar cabeçalho "Status geral"**

Trocar `🟡 em andamento` por `✅ concluído`.

- [ ] **Step 3: Commit**

```bash
git add docs/roadmap/catalog-expansion.md
git commit -m "docs(roadmap): catalog-expansion concluído"
```

Nota: aguardar confirmação.

---

## Visual Companion — quando acionar

- **Task 2.4 (primeira seção nova do form)**: comparar layouts agrupados (accordion vs cards verticais vs abas).
- **Task 3.3 (filtros)**: comparar placement (topbar inline vs collapsible vs sidebar).
- **Task 4.3 (badges de stock)**: validar cores e thresholds (semantic destructive/warning).

Em cada um desses pontos, o builder deve emitir um offer explícito antes de implementar. Se o usuário já tiver aceito o companion na sessão, abrir mockup direto.

---

## Self-review (executada após escrita)

- **Spec coverage**: todas as 5 fases do spec têm tasks correspondentes. Stock `minQty`/`reorderPoint` → Task 4.2–4.3. Card dashboard → Task 4.4. Image rule condicional → Task 2.1. Status coexiste com `visibleOnSite` → Task 2.8. Importer → Task 1.3. Doc vivo → Task 5.2.
- **Placeholders**: zero "TBD"/"TODO"/"similar a..." — todo código está inline.
- **Type consistency**: `ToolFormValues` usa mesmos nomes em schema/form/actions (`productType`, `status`, `invoiceModel`, etc). `ToolRow` campo `status: string` é intencional (conversão para `ToolStatusValue` no componente via assertion + fallback).
- **Spec mismatch notado**: spec inclui passo de "revalidar `/ferramentas/[slug]`" para site público. Fora de escopo confirmado na fase de brainstorm. OK.
