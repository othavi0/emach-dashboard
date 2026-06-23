# Wizard de criação de transportadoras (com zonas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o fluxo de transportadoras para que criar uma transportadora inclua zonas + tabela de peço numa única transação, com CNPJ e sobretaxas (ICMS/GRIS/ad valorem) obrigatórios, pedágio removido, e enforcement no banco.

**Architecture:** O "criar" deixa de ser um drawer e vira uma página `/carriers/new` com um wizard de 2 passos (Dados → Zonas & peço), espelhando o padrão de `tools/_components/tool-wizard.tsx`. Uma nova server action `createCarrierWithZones` persiste `carrier` + `carrier_zone[]` + `carrier_rate[]` numa única `db.transaction` (padrão `createTool`). O passo 2 usa componentes **controlados** novos (`RateRowsEditor`, `ZoneFieldset`) porque o `RateTableEditor` atual persiste sozinho. Ver/editar mantém o detalhe em abas com edição de dados por drawer.

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions), React 19, Drizzle ORM (Postgres/Supabase), Zod v4, Tailwind v4, shadcn/base-ui, vitest (environment: node).

## Global Constraints

- **Server actions:** `"use server"` no topo + `await requireCapability("shipping.manage")` (mutations) no início. Retorno `ActionResult<T>` (`@/lib/action-result`). `revalidatePath` após mutação.
- **Erro de banco no catch:** usar `getPgError(e)` (`@/lib/db-error`) — **nunca** `e.message.includes(...)`. Mapear `23505` (unique) para mensagem amigável.
- **Anti-patterns banidos:** sem `console.*` (usar `logger` de `@/lib/logger`); sem `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`; sem `React.forwardRef`; sem `useMemo`/`useCallback` manuais (React Compiler ativo). `key` estável em `.map()` — para listas de inputs controlados sem id estável (zonas/faixas em draft), `key={index}` é a exceção, documentada com comentário `//` simples; **NUNCA** `biome-ignore lint/suspicious/noArrayIndexKey` (a regra não é enforçada pelo preset aqui → o ignore vira warning `suppressions/unused`).
- **Forms:** `<LabeledField error={errors.x} required>` (`@/components/labeled-field`) + erro por campo via `<FieldError>`; **nunca** caixa de erro no topo. `useFormErrors<T>()` para reportar.
- **Numeric do Postgres:** Drizzle insere `numeric` como **string** — sempre `.toString()` no insert; nunca renderizar a string crua em UI (usar `formatMeasure`/`formatMoney`).
- **Schema push-only (ADR-0006):** editar `packages/db/src/schema/*.ts` → `bun db:sync`. **Backfill obrigatório antes de aplicar `notNull`** (push falha com `null` existente). Sync TS pro ecommerce é CI automático (ADR-0009).
- **Capabilities:** `shipping.read` (super_admin+admin) para reads; `shipping.manage` (super_admin) para mutations.
- **Gate antes de commit:** `bun verify` (= `bun check-types && bun check && bun --cwd apps/web test`). Testes vitest rodam em `environment: node` (sem jsdom) → **só lógica pura/schemas testáveis**; componentes verificam-se por `check-types` + smoke visual.
- **IDs:** `crypto.randomUUID()` no caller.

---

### Task 1: Schemas Zod + propagação de tipo (CNPJ/sobretaxas obrigatórios, pedágio fora)

Muda o contrato de validação e propaga para os 3 consumidores do tipo. A `createCarrier` antiga e o drawer continuam existindo (removidos na Task 6) — então criar via drawer segue funcionando, agora exigindo CNPJ/sobretaxas.

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/_components/carrier-schema.ts`
- Modify: `apps/web/src/app/dashboard/shipping/_components/carrier-form-fields.tsx`
- Modify: `apps/web/src/app/dashboard/shipping/_components/carrier-create-sheet.tsx`
- Modify: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/carrier-edit-sheet.tsx`
- Test: `apps/web/src/app/dashboard/shipping/_components/__tests__/carrier-schema.test.ts`

**Interfaces:**
- Produces: `carrierSchema` (CNPJ/GRIS/ad valorem/ICMS obrigatórios, sem `tollAmount`), `CarrierFormValues` (output), `CarrierDraft` + `EMPTY_CARRIER_DRAFT` (state do form), `createCarrierSchema`, `zoneWithRatesSchema`, `CreateCarrierFormValues`, `RateRowDraft`, `ZoneDraft`, `CreateCarrierDraft`.

- [ ] **Step 1: Escrever o teste do schema (falha)**

Criar `apps/web/src/app/dashboard/shipping/_components/__tests__/carrier-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { carrierSchema, createCarrierSchema } from "../carrier-schema";

const validCarrier = {
  name: "Jadlog",
  cnpj: "04.884.082/0001-35", // CNPJ válido (dígitos verificadores corretos)
  active: true,
  cubageDivisor: 6000,
  grisPercent: 0.5,
  grisMinAmount: 15,
  advaloremPercent: 0.3,
  icmsPercent: 12,
  notes: "",
};

const validZone = {
  name: "Sul",
  cepRanges: [{ from: "80000000", to: "99999999" }],
  deliveryDays: 5,
  minFreightAmount: null,
  rates: [{ weightFromKg: 0, weightToKg: 5, baseAmount: 25, perKgAmount: 2 }],
};

describe("carrierSchema", () => {
  it("aceita uma transportadora completa", () => {
    expect(carrierSchema.safeParse(validCarrier).success).toBe(true);
  });
  it("rejeita CNPJ ausente", () => {
    expect(carrierSchema.safeParse({ ...validCarrier, cnpj: "" }).success).toBe(false);
  });
  it("rejeita CNPJ com dígito inválido", () => {
    expect(carrierSchema.safeParse({ ...validCarrier, cnpj: "11.111.111/1111-11" }).success).toBe(false);
  });
  it("rejeita ICMS/GRIS/ad valorem nulos", () => {
    expect(carrierSchema.safeParse({ ...validCarrier, icmsPercent: null }).success).toBe(false);
    expect(carrierSchema.safeParse({ ...validCarrier, grisPercent: null }).success).toBe(false);
    expect(carrierSchema.safeParse({ ...validCarrier, advaloremPercent: null }).success).toBe(false);
  });
  it("não conhece o campo tollAmount", () => {
    expect("tollAmount" in carrierSchema.shape).toBe(false);
  });
});

describe("createCarrierSchema", () => {
  it("aceita carrier + 1 zona com 1 rate", () => {
    expect(createCarrierSchema.safeParse({ ...validCarrier, zones: [validZone] }).success).toBe(true);
  });
  it("rejeita zero zonas", () => {
    expect(createCarrierSchema.safeParse({ ...validCarrier, zones: [] }).success).toBe(false);
  });
  it("rejeita zona sem nenhuma faixa de peso", () => {
    const z = { ...validZone, rates: [] };
    expect(createCarrierSchema.safeParse({ ...validCarrier, zones: [z] }).success).toBe(false);
  });
  it("rejeita zona sem faixa de CEP", () => {
    const z = { ...validZone, cepRanges: [] };
    expect(createCarrierSchema.safeParse({ ...validCarrier, zones: [z] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test carrier-schema`
Expected: FAIL (`createCarrierSchema` não existe / `carrierSchema` ainda aceita CNPJ vazio).

- [ ] **Step 3: Reescrever `carrier-schema.ts`**

Substituir o conteúdo inteiro de `apps/web/src/app/dashboard/shipping/_components/carrier-schema.ts` por:

```ts
import { z } from "zod";

import type { CepRangeValue } from "@/app/dashboard/branches/_components/cep-ranges-editor";
import { isValidCnpj } from "@/lib/cpf-cnpj";
import { ratesSchema, zoneSchema } from "./zone-schema";

const pctRequired = z.number().min(0, "≥ 0").max(100, "≤ 100");
const money = z.number().nonnegative("≥ 0").max(1_000_000).optional().nullable();

export const carrierSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  cnpj: z
    .string()
    .trim()
    .min(1, "CNPJ obrigatório")
    .refine((v) => isValidCnpj(v), "CNPJ inválido"),
  active: z.boolean().default(true),
  cubageDivisor: z.number().int("Inteiro").positive("> 0").max(100_000).default(6000),
  grisPercent: pctRequired,
  grisMinAmount: money,
  advaloremPercent: pctRequired,
  icmsPercent: z.number().min(0, "≥ 0").max(99.99, "< 100"),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type CarrierFormValues = z.infer<typeof carrierSchema>;

/** Estado do form (campo numérico vazio = null). `carrierSchema` valida e rejeita os nulos. */
export interface CarrierDraft {
  name: string;
  cnpj: string;
  active: boolean;
  cubageDivisor: number;
  grisPercent: number | null;
  grisMinAmount: number | null;
  advaloremPercent: number | null;
  icmsPercent: number | null;
  notes: string;
}

export const EMPTY_CARRIER_DRAFT: CarrierDraft = {
  name: "",
  cnpj: "",
  active: true,
  cubageDivisor: 6000,
  grisPercent: null,
  grisMinAmount: null,
  advaloremPercent: null,
  icmsPercent: null,
  notes: "",
};

// --- Criação com zonas ---

export interface RateRowDraft {
  weightFromKg: number | null;
  weightToKg: number | null;
  baseAmount: number | null;
  perKgAmount: number;
}

export interface ZoneDraft {
  name: string;
  cepRanges: CepRangeValue[];
  deliveryDays: number | null;
  minFreightAmount: number | null;
  rates: RateRowDraft[];
}

export interface CreateCarrierDraft extends CarrierDraft {
  zones: ZoneDraft[];
}

export const zoneWithRatesSchema = zoneSchema.extend({ rates: ratesSchema });

export const createCarrierSchema = carrierSchema.extend({
  zones: z.array(zoneWithRatesSchema).min(1, "Adicione ao menos uma zona"),
});

export type CreateCarrierFormValues = z.infer<typeof createCarrierSchema>;
```

- [ ] **Step 4: Remover o campo Pedágio de `carrier-form-fields.tsx` e re-tipar para `CarrierDraft`**

Em `carrier-form-fields.tsx`:

1. Trocar o import de tipo no topo:
```ts
import type { CarrierDraft } from "./carrier-schema";
```
2. Trocar `Patch` e `Props` para usar `CarrierDraft`:
```ts
type Patch = (next: Partial<CarrierDraft>) => void;

interface Props {
  disabled?: boolean;
  errors?: Partial<Record<keyof CarrierDraft, string>>;
  onPatch: Patch;
  values: CarrierDraft;
}
```
3. Adicionar `required` ao `LabeledField` do CNPJ:
```tsx
<LabeledField error={errors.cnpj} id="carrier-cnpj" label="CNPJ" required>
```
4. Adicionar `required` aos `LabeledField` de `GRIS (%)`, `Ad valorem (%)` e `ICMS (%)` (manter o resto idêntico).
5. **Remover por completo** o bloco `<LabeledField error={errors.tollAmount} ... label="Pedágio (R$)">…</LabeledField>`. O grid que continha Ad valorem + Pedágio passa a conter só Ad valorem — trocar o wrapper `<div className="grid grid-cols-2 gap-3">` desse par por o `LabeledField` de Ad valorem solto (sem grid), já que sobra só um item.

- [ ] **Step 5: Ajustar `carrier-create-sheet.tsx` para o novo tipo (temporário, removido na Task 6)**

Em `carrier-create-sheet.tsx`: trocar `defaultValues` e o tipo para `CarrierDraft`/`EMPTY_CARRIER_DRAFT`:
```ts
import { carrierSchema, EMPTY_CARRIER_DRAFT } from "./carrier-schema";
// ...
const [values, setValues] = useState(EMPTY_CARRIER_DRAFT);
```
Remover o `defaultValues` literal antigo (que tinha `tollAmount: null`). O resto (submit chamando `createCarrier`) permanece.

- [ ] **Step 6: Ajustar `carrier-edit-sheet.tsx` (remover tollAmount de `toFormValues`)**

Em `carrier-edit-sheet.tsx`, na função `toFormValues`, **remover** a linha:
```ts
tollAmount: d.tollAmount === null ? null : Number(d.tollAmount),
```
E trocar o tipo de retorno de `CarrierFormValues` para `CarrierDraft`:
```ts
import { type CarrierDraft, carrierSchema } from "../../../_components/carrier-schema";
function toFormValues(d: CarrierDetail): CarrierDraft { /* ... sem tollAmount ... */ }
```

- [ ] **Step 7: Rodar os testes e o type-check**

Run: `bun --cwd apps/web test carrier-schema && bun check-types`
Expected: PASS (todos os testes do schema verdes; type-check sem erros).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/shipping
git commit -m "feat(shipping): CNPJ e sobretaxas obrigatorios, remove pedagio do form"
```

---

### Task 2: `RateRowsEditor` — editor controlado de faixas de peso

Componente controlado (`value`/`onChange`) com a UI de grid de faixas de peso, para o wizard (onde a zona ainda não tem id). Baseado no visual de `rate-table-editor.tsx`, mas **sem** estado próprio nem `saveZoneRates`.

**Files:**
- Create: `apps/web/src/app/dashboard/shipping/_components/rate-rows-editor.tsx`

**Interfaces:**
- Consumes: `RateRowDraft` (Task 1).
- Produces: `RateRowsEditor` — props `{ value: RateRowDraft[]; onChange: (next: RateRowDraft[]) => void; disabled?: boolean }`.

- [ ] **Step 1: Criar o componente**

Criar `apps/web/src/app/dashboard/shipping/_components/rate-rows-editor.tsx`. Espelhar a UI de `carriers/[id]/_components/rate-table-editor.tsx` (grid: Peso de / Peso até / Base R$ / +kg, botão "+ faixa" e remover por linha), mas controlado:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Plus, Trash2 } from "lucide-react";

import { MoneyInput } from "@/components/money-input";
import { MaskedInput } from "@/components/masked-input";
import { decimalMask } from "@/lib/masks";
import type { RateRowDraft } from "./carrier-schema";

const EMPTY_ROW: RateRowDraft = {
  weightFromKg: null,
  weightToKg: null,
  baseAmount: null,
  perKgAmount: 0,
};

interface Props {
  disabled?: boolean;
  onChange: (next: RateRowDraft[]) => void;
  value: RateRowDraft[];
}

export function RateRowsEditor({ value, onChange, disabled }: Props) {
  const patch = (index: number, next: Partial<RateRowDraft>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...next } : row)));
  };
  const addRow = () => onChange([...value, { ...EMPTY_ROW }]);
  const removeRow = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 text-muted-foreground text-xs">
        <span>Peso de (kg)</span>
        <span>Peso até (kg)</span>
        <span>Base (R$)</span>
        <span>+ por kg (R$)</span>
        <span />
      </div>
      {value.map((row, index) => (
        // Inputs controlados sem id estável; index é a key (exceção do CLAUDE.md — NÃO usar biome-ignore noArrayIndexKey, vira warning suppressions/unused)
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-2" key={index}>
          <MaskedInput disabled={disabled} mask={decimalMask} onChange={(v) => patch(index, { weightFromKg: v ?? null })} placeholder="0" value={row.weightFromKg ?? undefined} />
          <MaskedInput disabled={disabled} mask={decimalMask} onChange={(v) => patch(index, { weightToKg: v ?? null })} placeholder="∞" value={row.weightToKg ?? undefined} />
          <MoneyInput disabled={disabled} onChange={(v) => patch(index, { baseAmount: v })} value={row.baseAmount ?? null} />
          <MoneyInput disabled={disabled} onChange={(v) => patch(index, { perKgAmount: v ?? 0 })} value={row.perKgAmount} />
          <Button disabled={disabled} onClick={() => removeRow(index)} size="icon" type="button" variant="ghost">
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </div>
      ))}
      <Button disabled={disabled} onClick={addRow} size="sm" type="button" variant="outline">
        <Plus aria-hidden className="mr-1.5 size-3.5" /> Faixa de peso
      </Button>
    </div>
  );
}
```

> **Nota de implementação:** confirmar a assinatura de `decimalMask`/`MaskedInput` e `MoneyInput` lendo `rate-table-editor.tsx` (que já os usa para o mesmo fim) antes de finalizar. Ajustar `onChange`/`value` ao contrato real desses controles.

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/shipping/_components/rate-rows-editor.tsx
git commit -m "feat(shipping): RateRowsEditor controlado para faixas de peso"
```

---

### Task 3: `ZoneFieldset` — editor controlado de uma zona

Agrupa nome + faixas de CEP (`CepRangesEditor`, já controlado) + prazo/frete-mín + `RateRowsEditor`, tudo controlado por `value`/`onChange`.

**Files:**
- Create: `apps/web/src/app/dashboard/shipping/_components/zone-fieldset.tsx`

**Interfaces:**
- Consumes: `ZoneDraft` (Task 1), `RateRowsEditor` (Task 2), `CepRangesEditor` (`branches/_components/cep-ranges-editor.tsx`, props `{ value, onChange, disabled }`).
- Produces: `ZoneFieldset` — props `{ value: ZoneDraft; onChange: (next: ZoneDraft) => void; onRemove?: () => void; disabled?: boolean; index: number; error?: string }`.

- [ ] **Step 1: Criar o componente**

Criar `apps/web/src/app/dashboard/shipping/_components/zone-fieldset.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Trash2 } from "lucide-react";

import { CepRangesEditor } from "@/app/dashboard/branches/_components/cep-ranges-editor";
import { FieldError } from "@/components/field-error";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { MoneyInput } from "@/components/money-input";
import { integerMask } from "@/lib/masks";
import type { ZoneDraft } from "./carrier-schema";
import { RateRowsEditor } from "./rate-rows-editor";

interface Props {
  disabled?: boolean;
  error?: string;
  index: number;
  onChange: (next: ZoneDraft) => void;
  onRemove?: () => void;
  value: ZoneDraft;
}

export function ZoneFieldset({ value, onChange, onRemove, disabled, index, error }: Props) {
  const patch = (next: Partial<ZoneDraft>) => onChange({ ...value, ...next });

  return (
    <fieldset className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <legend className="font-semibold text-sm">Zona {index + 1}</legend>
        {onRemove ? (
          <Button disabled={disabled} onClick={onRemove} size="icon" type="button" variant="ghost">
            <Trash2 aria-hidden className="size-4" />
          </Button>
        ) : null}
      </div>

      <LabeledField id={`zone-${index}-name`} label="Nome da zona" required>
        {(field) => (
          <Input {...field} disabled={disabled} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex: Sul" value={value.name} />
        )}
      </LabeledField>

      <div className="flex flex-col gap-1">
        <span className="font-medium text-sm">Faixas de CEP</span>
        <CepRangesEditor disabled={disabled} onChange={(cepRanges) => patch({ cepRanges })} value={value.cepRanges} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <LabeledField id={`zone-${index}-days`} label="Prazo (dias úteis)">
          {(field) => (
            <MaskedInput {...field} disabled={disabled} mask={integerMask} onChange={(v) => patch({ deliveryDays: v ?? null })} placeholder="5" value={value.deliveryDays ?? undefined} />
          )}
        </LabeledField>
        <LabeledField id={`zone-${index}-min`} label="Frete mínimo (R$)">
          {(field) => (
            <MoneyInput aria-invalid={field["aria-invalid"]} disabled={disabled} id={field.id} onChange={(v) => patch({ minFreightAmount: v })} value={value.minFreightAmount ?? null} />
          )}
        </LabeledField>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-medium text-sm">Tabela de peso</span>
        <RateRowsEditor disabled={disabled} onChange={(rates) => patch({ rates })} value={value.rates} />
      </div>

      {error ? <FieldError>{error}</FieldError> : null}
    </fieldset>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/shipping/_components/zone-fieldset.tsx
git commit -m "feat(shipping): ZoneFieldset controlado (CEP + tabela de peso)"
```

---

### Task 4: `createCarrierWithZones` — server action transacional

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/actions.ts`

**Interfaces:**
- Consumes: `createCarrierSchema`, `CreateCarrierFormValues` (Task 1); `getPgError` (`@/lib/db-error`); `numOrNull` (helper já existente em `actions.ts`).
- Produces: `createCarrierWithZones(input: CreateCarrierFormValues): Promise<ActionResult<{ id: string }>>`.

- [ ] **Step 1: Adicionar imports e a action**

Em `actions.ts`, adicionar ao import de schemas:
```ts
import {
  type CarrierFormValues,
  carrierSchema,
  type CreateCarrierFormValues,
  createCarrierSchema,
} from "./_components/carrier-schema";
```
Adicionar import do helper de erro:
```ts
import { getPgError } from "@/lib/db-error";
```
Adicionar a action (após `createCarrier`):

```ts
export async function createCarrierWithZones(
  input: CreateCarrierFormValues
): Promise<ActionResult<{ id: string }>> {
  const session = await requireCapability("shipping.manage");
  const parsed = createCarrierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: actionErrorMessage(parsed.error) };
  }
  const d = parsed.data;
  const id = crypto.randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(carrier).values({
        id,
        name: d.name,
        cnpj: normalizeCnpj(d.cnpj),
        active: d.active,
        cubageDivisor: d.cubageDivisor,
        grisPercent: d.grisPercent.toString(),
        grisMinAmount: numOrNull(d.grisMinAmount),
        advaloremPercent: d.advaloremPercent.toString(),
        icmsPercent: d.icmsPercent.toString(),
        notes: d.notes || null,
      });
      for (const [index, zone] of d.zones.entries()) {
        const zoneId = crypto.randomUUID();
        await tx.insert(carrierZone).values({
          id: zoneId,
          carrierId: id,
          name: zone.name,
          cepRanges: zone.cepRanges,
          deliveryDays: zone.deliveryDays ?? null,
          minFreightAmount: numOrNull(zone.minFreightAmount),
          sortOrder: index,
        });
        await tx.insert(carrierRate).values(
          zone.rates.map((r) => ({
            id: crypto.randomUUID(),
            carrierId: id,
            zoneId,
            weightFromKg: r.weightFromKg.toString(),
            weightToKg: r.weightToKg == null ? null : r.weightToKg.toString(),
            baseAmount: r.baseAmount.toString(),
            perKgAmount: r.perKgAmount.toString(),
          }))
        );
      }
    });
  } catch (error) {
    if (getPgError(error)?.code === "23505") {
      return { ok: false, error: "CNPJ já cadastrado em outra transportadora" };
    }
    logger.error("createCarrierWithZones falhou", error);
    return { ok: false, error: actionErrorMessage(error) };
  }
  await logUserActivity({
    actorUserId: session.user.id,
    action: "shipping.carrier.created",
    targetId: id,
    targetType: "carrier",
    metadata: { name: d.name, zones: d.zones.length },
  });
  revalidatePath(SHIPPING_PATH);
  return { ok: true, data: { id } };
}
```

> **Nota:** `r.weightFromKg`/`r.baseAmount` são `number` no output de `rateRowSchema` (não-null). `numOrNull` é o helper já usado em `createCarrier` para `numeric` opcional.

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/shipping/actions.ts
git commit -m "feat(shipping): createCarrierWithZones (carrier + zonas + rates em transacao)"
```

---

### Task 5: Wizard de 2 passos + rota `/carriers/new`

**Files:**
- Create: `apps/web/src/app/dashboard/shipping/_components/carrier-wizard-steps.ts`
- Create: `apps/web/src/app/dashboard/shipping/_components/carrier-wizard.tsx`
- Create: `apps/web/src/app/dashboard/shipping/carriers/new/page.tsx`

**Interfaces:**
- Consumes: `CreateCarrierDraft`, `EMPTY_CARRIER_DRAFT`, `createCarrierSchema` (Task 1); `CarrierFormFields` (Task 1); `ZoneFieldset` (Task 3); `createCarrierWithZones` (Task 4); `useFormErrors` (`@/lib/use-form-errors`); `focusFirstError` (`@/lib/form-errors`).

- [ ] **Step 1: Helpers de passo**

Criar `carrier-wizard-steps.ts`:

```ts
import type { CreateCarrierDraft } from "./carrier-schema";

export type CarrierStepId = "dados" | "zonas";

export const CARRIER_STEPS: { id: CarrierStepId; label: string; description: string }[] = [
  { id: "dados", label: "Dados", description: "Identidade fiscal e sobretaxas" },
  { id: "zonas", label: "Zonas & peço", description: "Cobertura por CEP e tabela de peso" },
];

export const CARRIER_STEP_FIELDS = {
  dados: ["name", "cnpj", "cubageDivisor", "grisPercent", "grisMinAmount", "advaloremPercent", "icmsPercent", "active", "notes"],
  zonas: ["zones"],
} satisfies Record<CarrierStepId, (keyof CreateCarrierDraft)[]>;

export const EMPTY_ZONE = {
  name: "",
  cepRanges: [],
  deliveryDays: null,
  minFreightAmount: null,
  rates: [{ weightFromKg: null, weightToKg: null, baseAmount: null, perKgAmount: 0 }],
} as const;
```

- [ ] **Step 2: O wizard**

Criar `carrier-wizard.tsx` (client). Estado local `CreateCarrierDraft`; stepper de 2 passos; passo "dados" renderiza `<CarrierFormFields>`; passo "zonas" renderiza a lista de `<ZoneFieldset>` + "Nova zona"; no submit valida `createCarrierSchema`, navega ao passo com erro e chama `createCarrierWithZones`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FieldError } from "@/components/field-error";
import { focusFirstError } from "@/lib/form-errors";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";

import { createCarrierWithZones } from "../actions";
import { CarrierFormFields } from "./carrier-form-fields";
import { type CreateCarrierDraft, createCarrierSchema, EMPTY_CARRIER_DRAFT } from "./carrier-schema";
import { CARRIER_STEP_FIELDS, CARRIER_STEPS, type CarrierStepId, EMPTY_ZONE } from "./carrier-wizard-steps";
import { ZoneFieldset } from "./zone-fieldset";

const INITIAL: CreateCarrierDraft = { ...EMPTY_CARRIER_DRAFT, zones: [{ ...EMPTY_ZONE, cepRanges: [], rates: [{ weightFromKg: null, weightToKg: null, baseAmount: null, perKgAmount: 0 }] }] };

export function CarrierWizard() {
  const router = useRouter();
  const [active, setActive] = useState<CarrierStepId>("dados");
  const [values, setValues] = useState<CreateCarrierDraft>(INITIAL);
  const { errors, reportValidationError, clearErrors } = useFormErrors<CreateCarrierDraft>();
  const [submitting, startTransition] = useTransition();

  const patch = (next: Partial<CreateCarrierDraft>) => setValues((prev) => ({ ...prev, ...next }));
  const setZone = (index: number, zone: CreateCarrierDraft["zones"][number]) =>
    setValues((prev) => ({ ...prev, zones: prev.zones.map((z, i) => (i === index ? zone : z)) }));
  const addZone = () => setValues((prev) => ({ ...prev, zones: [...prev.zones, { ...EMPTY_ZONE, cepRanges: [], rates: [{ weightFromKg: null, weightToKg: null, baseAmount: null, perKgAmount: 0 }] }] }));
  const removeZone = (index: number) => setValues((prev) => ({ ...prev, zones: prev.zones.filter((_, i) => i !== index) }));

  const submit = () => {
    clearErrors();
    const parsed = createCarrierSchema.safeParse(values);
    if (!parsed.success) {
      reportValidationError(parsed.error);
      const keys = parsed.error.issues.map((i) => String(i.path[0]));
      const failing = CARRIER_STEPS.find((s) => (CARRIER_STEP_FIELDS[s.id] as string[]).some((f) => keys.includes(f)));
      if (failing) {
        setActive(failing.id);
      }
      focusFirstError();
      return;
    }
    startTransition(async () => {
      const res = await createCarrierWithZones(parsed.data);
      if (res.ok) {
        notify.success("Transportadora criada");
        router.push(`/dashboard/shipping/carriers/${res.data.id}`);
      } else {
        notify.error(res.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-1 rounded-md bg-muted p-1 ring-1 ring-border/60" aria-label="Etapas">
        {CARRIER_STEPS.map((s) => (
          <li key={s.id}>
            <button
              aria-current={s.id === active ? "step" : undefined}
              className={s.id === active ? "rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs" : "rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:text-foreground"}
              onClick={() => setActive(s.id)}
              type="button"
            >
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
        {active === "dados" ? (
          <CarrierFormFields disabled={submitting} errors={errors} onPatch={patch} values={values} />
        ) : (
          <div className="flex flex-col gap-4">
            {values.zones.map((zone, index) => (
              // Inputs controlados sem id estável até o submit; index é a key (exceção do CLAUDE.md — NÃO usar biome-ignore noArrayIndexKey)
              <ZoneFieldset disabled={submitting} index={index} key={index} onChange={(z) => setZone(index, z)} onRemove={values.zones.length > 1 ? () => removeZone(index) : undefined} value={zone} />
            ))}
            {typeof errors.zones === "string" ? <FieldError>{errors.zones}</FieldError> : null}
            <Button onClick={addZone} type="button" variant="outline">+ Nova zona</Button>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between">
        <Button disabled={active === "dados"} onClick={() => setActive("dados")} type="button" variant="ghost">‹ Voltar</Button>
        {active === "dados" ? (
          <Button onClick={() => setActive("zonas")} type="button">Próximo ›</Button>
        ) : (
          <Button disabled={submitting} onClick={submit} type="button">
            {submitting ? <><Spinner /> Criando…</> : "Criar transportadora"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

> **Nota:** confirmar que `useFormErrors<T>()` aceita chaves aninhadas/array como `zones` (o map de issues usa `path[0]`). Se o hook só mapear chaves diretas, `errors.zones` carrega a mensagem do nível do array (issue de `path: ["zones"]`), que é o que renderizamos. Erros por-zona finos são polimento posterior — o gate é "≥1 zona / ≥1 faixa" no array.

- [ ] **Step 3: A rota `/new`**

Criar `apps/web/src/app/dashboard/shipping/carriers/new/page.tsx` (Server Component com guard):

```tsx
import type { Metadata } from "next";

import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { CarrierWizard } from "../../_components/carrier-wizard";

export const metadata: Metadata = { title: "Nova transportadora" };

export default function NewCarrierPage() {
  return <NewCarrierContent />;
}

async function NewCarrierContent() {
  await requireCapabilityOrRedirect("shipping.manage");
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="font-medium text-2xl tracking-tight">Nova transportadora</h1>
        <p className="text-muted-foreground text-sm">Dois passos: dados fiscais e zonas de entrega.</p>
      </div>
      <CarrierWizard />
    </div>
  );
}
```

> **Nota:** confirmar o nome exato do guard que redireciona (`requireCapabilityOrRedirect`) em `@/lib/permissions` — é o usado em `carriers/[id]/page.tsx`.

- [ ] **Step 4: Type-check + smoke**

Run: `bun check-types`
Expected: PASS.
Smoke: na :3007, abrir `/dashboard/shipping/carriers/new`, preencher os 2 passos e criar — deve redirecionar para o detalhe.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/shipping/_components/carrier-wizard.tsx apps/web/src/app/dashboard/shipping/_components/carrier-wizard-steps.ts apps/web/src/app/dashboard/shipping/carriers/new/page.tsx
git commit -m "feat(shipping): wizard de 2 passos para criar transportadora"
```

---

### Task 6: Trocar a entrada de criação (remover drawer e action antiga)

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/_components/shipping-header-action.tsx`
- Modify: `apps/web/src/app/dashboard/shipping/_components/carriers-tab.tsx`
- Delete: `apps/web/src/app/dashboard/shipping/_components/carrier-create-sheet.tsx`
- Modify: `apps/web/src/app/dashboard/shipping/actions.ts` (remover `createCarrier`)

- [ ] **Step 1: Header navega para `/new`**

Em `shipping-header-action.tsx`, trocar o `handleClick` por navegação direta:
```tsx
const handleClick = () => {
  router.push("/dashboard/shipping/carriers/new");
};
```
Remover `usePathname`/`useSearchParams` se ficarem sem uso (manter `useRouter`).

- [ ] **Step 2: Remover o drawer de `carriers-tab.tsx`**

Em `carriers-tab.tsx`, remover o import `CarrierCreateSheet` e a linha `<CarrierCreateSheet />`. Resultado:
```tsx
import { fetchCarriersPage } from "../actions";
import { CarrierCardGrid } from "./carrier-card-grid";

export async function CarriersTab() {
  const { items, nextCursor } = await fetchCarriersPage({ cursor: null });
  return (
    <div className="flex flex-col gap-4">
      <CarrierCardGrid initial={items} initialCursor={nextCursor} />
    </div>
  );
}
```

- [ ] **Step 3: Deletar o arquivo do drawer e a action antiga**

```bash
git rm apps/web/src/app/dashboard/shipping/_components/carrier-create-sheet.tsx
```
Em `actions.ts`, remover a função `createCarrier` inteira (linhas da export antiga). Verificar que `CarrierFormValues`/`carrierSchema` ainda são usados por `updateCarrier` (são — manter os imports).

- [ ] **Step 4: Build (gate "use server") + type-check**

Run: `bun check-types && bun run --cwd apps/web build`
Expected: PASS. (build é obrigatório após mexer em `actions.ts` — re-export de não-async em `"use server"` só quebra no build.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/shipping
git commit -m "feat(shipping): rota /new substitui o drawer de criar transportadora"
```

---

### Task 7: Ver/editar — remover pedágio da exibição e renomear aba

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/surcharges-tab.tsx`
- Modify: `apps/web/src/app/dashboard/shipping/carriers/[id]/page.tsx`

- [ ] **Step 1: Remover a linha de Pedágio**

Em `surcharges-tab.tsx`, remover a linha:
```tsx
<Row label="Pedágio" value={fmtMoney(detail.tollAmount)} />
```

- [ ] **Step 2: Renomear o label da aba**

Em `carriers/[id]/page.tsx`, trocar o label da aba `sobretaxas` (manter o `value`):
```tsx
{ value: "sobretaxas", label: "Dados & sobretaxas", content: <SurchargesTab detail={detail} /> },
```

- [ ] **Step 3: Type-check + smoke**

Run: `bun check-types`
Expected: PASS. Smoke: abrir um detalhe de transportadora; a aba "Dados & sobretaxas" não mostra mais Pedágio.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/shipping/carriers/[id]
git commit -m "feat(shipping): remove pedagio da exibicao, renomeia aba de dados"
```

---

### Task 8: Banco — backfill da seed + `notNull` + CNPJ único total

**Files:**
- Modify: `packages/db/src/schema/shipping.ts`

- [ ] **Step 1: Backfill da transportadora seed (antes do push)**

Completar a única transportadora existente (sem CNPJ/ICMS/ad valorem) para o `notNull` não falhar. Rodar via SQL no banco (ex.: Supabase SQL editor ou `db.execute`), usando um CNPJ válido real da transportadora; placeholder de exemplo:
```sql
UPDATE carrier
SET cnpj = COALESCE(cnpj, '04884082000135'),
    advalorem_percent = COALESCE(advalorem_percent, 0.30),
    icms_percent = COALESCE(icms_percent, 12.00),
    gris_percent = COALESCE(gris_percent, 0.50)
WHERE cnpj IS NULL OR advalorem_percent IS NULL OR icms_percent IS NULL OR gris_percent IS NULL;
```
Verificar: `SELECT id, cnpj, gris_percent, advalorem_percent, icms_percent FROM carrier;` — nenhum nulo.

- [ ] **Step 2: Editar o schema**

Em `packages/db/src/schema/shipping.ts`, na tabela `carrier`:
1. `cnpj: text("cnpj").notNull(),`
2. `grisPercent: numeric("gris_percent", { precision: 5, scale: 2 }).notNull(),`
3. `advaloremPercent: numeric("advalorem_percent", { precision: 5, scale: 2 }).notNull(),`
4. `icmsPercent: numeric("icms_percent", { precision: 5, scale: 2 }).notNull(),`
5. Trocar o índice parcial por único total:
```ts
uniqueIndex("carrier_cnpj_unique").on(table.cnpj),
```
(remove o `.where(sql\`${table.cnpj} IS NOT NULL\`)`). Manter `tollAmount` e `grisMinAmount` como estão (nullable). Os `check` existentes podem permanecer.

- [ ] **Step 3: Sincronizar o schema**

Run: `bun db:sync`
Expected: push aplica `notNull` + recria o índice sem erro (já não há nulos).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/shipping.ts
git commit -m "feat(db): carrier cnpj/icms/gris/advalorem notNull + cnpj unico"
```

---

### Task 9 (secundária, deferível): `RateTableEditor` reusa `RateRowsEditor`

DRY do detalhe: o `rate-table-editor.tsx` passa a envolver `RateRowsEditor` (mantendo `saveZoneRates`). Não bloqueia o fluxo de criação; pode ser feita depois.

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/rate-table-editor.tsx`

- [ ] **Step 1:** Substituir o grid interno do `RateTableEditor` por `<RateRowsEditor value={rows} onChange={setRows} disabled={...} />`, mantendo o estado local (`rows`) e o `handleSave` que chama `saveZoneRates`. Mapear `RateRowDraft` ↔ o estado atual (`weightToKg` null = ∞).
- [ ] **Step 2:** `bun check-types` (PASS) + smoke na aba Zonas de um detalhe (salvar tabela ainda funciona).
- [ ] **Step 3:** Commit `refactor(shipping): RateTableEditor reusa RateRowsEditor`.

---

### Task 10: Smoke E2E + verificação final

- [ ] **Step 1:** `bun verify` (check-types + check + test) — tudo verde.
- [ ] **Step 2:** Na :3007: criar transportadora completa pelo wizard (CNPJ válido, ICMS/GRIS/ad valorem, 1 zona com CEP e 1 faixa de peso) → redireciona ao detalhe; abrir aba **Preview** e cotar um CEP da zona → retorna valor.
- [ ] **Step 3:** Tentar criar outra transportadora com o **mesmo CNPJ** → erro "CNPJ já cadastrado em outra transportadora" no campo CNPJ (passo 1).
- [ ] **Step 4:** Editar a transportadora pelo drawer (`?edit=1`) — sem campo de pedágio; salvar funciona.

---

## Self-Review

**Spec coverage:**
- Wizard 2 passos (rota /new) → Task 5. Transação carrier+zonas+rates → Task 4. Reuso CepRangesEditor → Task 3; editor de peço controlado (RateTableEditor não-controlado) → Task 2. Obrigatórios CNPJ/ICMS/GRIS/ad valorem → Task 1 + Task 8. Pedágio fora do form/exibição (coluna mantida) → Tasks 1, 7 (coluna intocada na Task 8). Enforcement banco (notNull + CNPJ único) → Task 8. Ver/editar (drawer + aba, rename) → Tasks 6, 7. Capabilities → Tasks 4, 5. Testes → Task 1 (schema) + Task 10 (smoke). Seed backfill → Task 8. ✅ coberto.

**Placeholders:** as "Notas" pedem confirmar assinaturas reais (`MaskedInput`/`MoneyInput`/`decimalMask`, `useFormErrors` com chave de array, nome do guard) lendo os arquivos citados — não são TODOs de design, são checagens de integração contra código existente nomeado. Sem TBDs.

**Type consistency:** `CarrierDraft` (state, números `number | null`) vs `CarrierFormValues` (output, `number`) usados consistentemente; `RateRowDraft.perKgAmount: number` (default 0) evita o null que `rateRowSchema` rejeitaria; `createCarrierWithZones` consome o output validado (`d.grisPercent.toString()` etc.). `numOrNull` reusado para `numeric` opcional. ✅

**Decisão técnica registrada:** `toll_amount` permanece coluna nullable (Task 8 não a toca) — drop coordenado com o ecommerce fica fora deste plano.
