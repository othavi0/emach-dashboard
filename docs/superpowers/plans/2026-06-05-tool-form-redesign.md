# Redesign do form de ferramenta — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quebrar o monólito `tool-form.tsx` num wizard de 6 passos (criar) + página com rail de seções (editar), reaproveitando um conjunto de componentes de campo, com ajuda contextual via `HelpTooltip` e categorização sem redundância.

**Architecture:** Espelha o padrão de filiais (`*FormFields` apresentacional + wrappers criar/editar). Lógica de passos/validação isolada em módulo puro testável (`tool-form-steps.ts`); dados estáticos via React context (`ToolFormProvider`); estado mutável via hook (`useToolFormState`). Seis grupos de campo em `fields/` consumidos tanto pelo `ToolWizard` (criar) quanto pelo `ToolEditView` (editar). `toolFormSchema` e o DB **não mudam**.

**Tech Stack:** Next 16 / React 19 (Client Components), Zod 4, base-ui (`Tooltip`/`HoverCard`), Tailwind tokens do design system, vitest (node env, lógica pura).

**Contexto de referência:** spec em `docs/superpowers/specs/2026-06-05-tool-form-redesign-design.md`. Padrão canônico: `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx` + `branch-form.tsx` + `branches/[id]/_components/branch-edit-sheet.tsx`. Schema reusado: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`. Editores existentes a envolver: `variants-editor.tsx`, `attribute-assignments-editor.tsx`, `dynamic-specs-editor.tsx`, `tool-image-gallery.tsx`. Validação/erros: `apps/web/src/components/form-error-panel.tsx` (`FormErrorPanel`, `zodIssuesToFormIssues`, `FormIssue`).

---

## Convenções compartilhadas (válidas em todas as tasks)

**Tipo de estado do form** (já existe em `tool-form.tsx:149-158`, vai migrar pra `tool-form-state.ts`):

```ts
// numéricos de frete podem ser undefined em edição antes do preenchimento
export type ToolFormState = Omit<
  ToolFormValues,
  "weightKg" | "lengthCm" | "widthCm" | "heightCm" | "overweightShippingAmount"
> & {
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  overweightShippingAmount?: number;
};
```

**Contrato dos grupos de campo** (`fields/*`):

```ts
export interface ToolFieldGroupProps {
  values: ToolFormState;
  onPatch: (patch: Partial<ToolFormState>) => void;
  errors: Partial<Record<keyof ToolFormValues, string>>;
  disabled?: boolean;
}
```

Dados estáticos (categorias, fornecedores, definições) vêm do `useToolFormContext()` (Task 4), não por props.

**Rodar 1 teste:** `cd apps/web && bun run vitest run __tests__/<arquivo>.test.ts`
**Type-check:** `bun check-types` (raiz). **Lint:** `bun check` (raiz, ultracite).

---

## Task 1: Módulo puro de passos + validação por passo

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts`
- Test: `apps/web/__tests__/tool-form-steps.test.ts`

- [ ] **Step 1: Escrever o teste falho**

```ts
// apps/web/__tests__/tool-form-steps.test.ts
import { describe, expect, it } from "vitest";
import {
  getStepIssues,
  STEP_FIELDS,
  TOOL_STEPS,
} from "@/app/dashboard/tools/_components/tool-form-steps";

const EMPTY = {
  name: "",
  description: "",
  model: "",
  invoiceModel: "",
  manufacturerName: "",
  status: "draft" as const,
  hsCode: "",
  ncm: "",
  cest: "",
  powerWatts: undefined,
  weightKg: undefined,
  lengthCm: undefined,
  widthCm: undefined,
  heightCm: undefined,
  overweightShippingAmount: undefined,
  categoryIds: [] as string[],
  primaryCategoryId: "",
  supplierId: "",
  visibleOnSite: true,
  images: [],
  variants: [
    { sku: "", voltage: "", priceAmount: 0, costAmount: undefined, isDefault: true, sortOrder: 0 },
  ],
  attributeValues: {},
  attributeAssignments: [],
};

describe("TOOL_STEPS", () => {
  it("tem 6 passos na ordem esperada com fiscal opcional", () => {
    expect(TOOL_STEPS.map((s) => s.id)).toEqual([
      "identity",
      "variants",
      "specs",
      "logistics",
      "fiscal",
      "publish",
    ]);
    expect(TOOL_STEPS.find((s) => s.id === "fiscal")?.optional).toBe(true);
  });
});

describe("getStepIssues", () => {
  it("acusa nome e categoria faltando no passo identity", () => {
    const issues = getStepIssues(EMPTY, "identity");
    const paths = issues.map((i) => i.path);
    expect(paths.some((p) => p.includes("Nome"))).toBe(true);
    expect(paths.some((p) => p.includes("Categoria"))).toBe(true);
  });

  it("não vaza erro de peso (logistics) pro passo identity", () => {
    const issues = getStepIssues(EMPTY, "identity");
    expect(issues.some((i) => i.path.includes("Peso"))).toBe(false);
  });

  it("acusa peso/dimensões faltando no passo logistics", () => {
    const issues = getStepIssues(EMPTY, "logistics");
    expect(issues.some((i) => i.path.includes("Peso"))).toBe(true);
  });

  it("passo identity fica sem issues quando nome+categoria estão preenchidos", () => {
    const ok = {
      ...EMPTY,
      name: "Furadeira",
      categoryIds: ["c1"],
      primaryCategoryId: "c1",
    };
    expect(getStepIssues(ok, "identity")).toHaveLength(0);
  });

  it("STEP_FIELDS cobre exatamente os 6 passos", () => {
    expect(Object.keys(STEP_FIELDS).sort()).toEqual(
      ["fiscal", "identity", "logistics", "publish", "specs", "variants"].sort()
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && bun run vitest run __tests__/tool-form-steps.test.ts`
Expected: FAIL — `Cannot find module '.../tool-form-steps'`.

- [ ] **Step 3: Implementar o módulo**

```ts
// apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts
import {
  type FormIssue,
  zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { type ToolFormValues, toolFormSchema } from "./tool-schema";

export type ToolStepId =
  | "identity"
  | "variants"
  | "specs"
  | "logistics"
  | "fiscal"
  | "publish";

export interface ToolStep {
  id: ToolStepId;
  label: string;
  description: string;
  optional?: boolean;
}

export const TOOL_STEPS: ToolStep[] = [
  { id: "identity", label: "Identidade & categoria", description: "Nome, descrição, categorias e fornecedor" },
  { id: "variants", label: "Variantes & preço", description: "SKUs vendáveis, voltagem, preço e custo" },
  { id: "specs", label: "Especificações", description: "Atributos técnicos da categoria principal" },
  { id: "logistics", label: "Logística & frete", description: "Peso, dimensões, potência e frete" },
  { id: "fiscal", label: "Fiscal", description: "Modelos, marca e códigos fiscais", optional: true },
  { id: "publish", label: "Imagens & publicação", description: "Galeria, status e visibilidade" },
];

// path[0] de cada issue do schema → passo. Cobre campos diretos e os
// caminhos do superRefine (variants, images, primaryCategoryId, attributeValues).
export const STEP_FIELDS: Record<ToolStepId, (keyof ToolFormValues)[]> = {
  identity: ["name", "description", "categoryIds", "primaryCategoryId", "supplierId"],
  variants: ["variants"],
  specs: ["attributeAssignments", "attributeValues"],
  logistics: ["weightKg", "lengthCm", "widthCm", "heightCm", "powerWatts", "overweightShippingAmount"],
  fiscal: ["model", "invoiceModel", "manufacturerName", "ncm", "cest", "hsCode"],
  publish: ["images", "status", "visibleOnSite"],
};

// Rótulos humanos por campo (espelha FIELD_LABELS de tool-form.tsx).
const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  description: "Descrição",
  model: "Modelo comercial",
  invoiceModel: "Modelo da fábrica",
  manufacturerName: "Marca / fabricante",
  status: "Status",
  hsCode: "HS Code",
  ncm: "NCM",
  cest: "CEST",
  powerWatts: "Potência (W)",
  weightKg: "Peso (kg)",
  lengthCm: "Comprimento (cm)",
  widthCm: "Largura (cm)",
  heightCm: "Altura (cm)",
  categoryIds: "Categorias",
  primaryCategoryId: "Categoria principal",
  supplierId: "Fornecedor",
  visibleOnSite: "Visível no site",
  images: "Imagens",
  variants: "Variantes",
  attributeValues: "Especificações técnicas",
  attributeAssignments: "Atributos vinculados",
};

export function getStepIssues(values: unknown, stepId: ToolStepId): FormIssue[] {
  const result = toolFormSchema.safeParse(values);
  if (result.success) {
    return [];
  }
  const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
  const scoped = result.error.issues.filter(
    (issue) => issue.path.length > 0 && fields.has(String(issue.path[0]))
  );
  if (scoped.length === 0) {
    return [];
  }
  // Reusa o formatador do sistema construindo um ZodError-like só com os scoped.
  return zodIssuesToFormIssues(
    { issues: scoped } as Parameters<typeof zodIssuesToFormIssues>[0],
    FIELD_LABELS
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && bun run vitest run __tests__/tool-form-steps.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 5: Type-check + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts apps/web/__tests__/tool-form-steps.test.ts
git commit -m "feat(tools): módulo de passos + validação por passo do form"
```

---

## Task 2: Componente HelpTooltip

**Files:**
- Create: `apps/web/src/components/help-tooltip.tsx`

> Sem teste unitário (UI, base-ui usa Portal; vitest é node env). Verificação por type-check agora e smoke depois.

- [ ] **Step 1: Implementar o componente**

```tsx
// apps/web/src/components/help-tooltip.tsx
"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@emach/ui/components/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { CircleHelp } from "lucide-react";

interface ShortProps {
  text: string;
  title?: never;
  body?: never;
  example?: never;
}
interface RichProps {
  title: string;
  body: string;
  example?: string;
  text?: never;
}
type HelpTooltipProps = (ShortProps | RichProps) & { label?: string };

const TRIGGER_CLASS =
  "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-info focus-visible:text-info focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-transparent";

export function HelpTooltip(props: HelpTooltipProps) {
  const ariaLabel = props.label ?? "Ajuda sobre o campo";

  if ("text" in props && props.text) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            aria-label={ariaLabel}
            className={TRIGGER_CLASS}
            render={<button type="button" />}
          >
            <CircleHelp aria-hidden className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] text-xs leading-relaxed">
            {props.text}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const { title, body, example } = props as RichProps;
  return (
    <HoverCard>
      <HoverCardTrigger
        aria-label={ariaLabel}
        className={TRIGGER_CLASS}
        render={<button type="button" />}
      >
        <CircleHelp aria-hidden className="size-3.5" />
      </HoverCardTrigger>
      <HoverCardContent className="w-72">
        <p className="font-semibold text-foreground text-xs">{title}</p>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{body}</p>
        {example ? (
          <p className="mt-2 rounded bg-surface-deep px-2 py-1 font-mono text-[11px] text-info">
            {example}
          </p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
```

> **Nota base-ui:** `TooltipTrigger`/`HoverCardTrigger` aceitam `render={<button type="button" />}` pra virar botão acessível (foco por teclado + Esc nativo). Se o type-check reclamar da prop `render`, conferir a assinatura em `packages/ui/src/components/tooltip.tsx` (base-ui `Trigger.Props`) e usar `nativeButton`/`render` conforme a versão — validar no smoke (Task 12).

- [ ] **Step 2: Type-check + commit**

```bash
bun check-types
git add apps/web/src/components/help-tooltip.tsx
git commit -m "feat(ui): HelpTooltip híbrido (tooltip curto / hovercard rico)"
```

---

## Task 3: Hook de estado do form

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/tool-form-state.ts`

- [ ] **Step 1: Implementar o hook + tipo de estado**

```ts
// apps/web/src/app/dashboard/tools/_components/tool-form-state.ts
"use client";

import { useCallback, useState } from "react";
import type { ToolFormValues } from "./tool-schema";

export type ToolFormState = Omit<
  ToolFormValues,
  "weightKg" | "lengthCm" | "widthCm" | "heightCm" | "overweightShippingAmount"
> & {
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  overweightShippingAmount?: number;
};

export const EMPTY_TOOL_VALUES: ToolFormState = {
  name: "",
  description: "",
  model: "",
  invoiceModel: "",
  manufacturerName: "",
  status: "draft",
  hsCode: "",
  ncm: "",
  cest: "",
  powerWatts: undefined,
  weightKg: undefined,
  lengthCm: undefined,
  widthCm: undefined,
  heightCm: undefined,
  overweightShippingAmount: undefined,
  categoryIds: [],
  primaryCategoryId: "",
  supplierId: "",
  visibleOnSite: true,
  images: [],
  variants: [
    { sku: "", voltage: "", priceAmount: 0, costAmount: undefined, isDefault: true, sortOrder: 0 },
  ],
  attributeValues: {},
  attributeAssignments: [],
};

export function useToolFormState(defaultValues: Partial<ToolFormState>) {
  const [values, setValues] = useState<ToolFormState>(() => ({
    ...EMPTY_TOOL_VALUES,
    ...defaultValues,
    variants:
      defaultValues.variants && defaultValues.variants.length > 0
        ? defaultValues.variants
        : EMPTY_TOOL_VALUES.variants,
    attributeValues: defaultValues.attributeValues ?? {},
    attributeAssignments: defaultValues.attributeAssignments ?? [],
  }));
  const [errors, setErrors] = useState<
    Partial<Record<keyof ToolFormValues, string>>
  >({});

  const patch = useCallback((next: Partial<ToolFormState>) => {
    setValues((prev) => ({ ...prev, ...next }));
  }, []);

  return { values, setValues, patch, errors, setErrors };
}
```

- [ ] **Step 2: Type-check + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/tool-form-state.ts
git commit -m "feat(tools): hook de estado do form de ferramenta"
```

---

## Task 4: Context de dados estáticos

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/tool-form-context.tsx`

- [ ] **Step 1: Implementar o provider/hook**

```tsx
// apps/web/src/app/dashboard/tools/_components/tool-form-context.tsx
"use client";

import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { createContext, useContext } from "react";

export interface CategoryOption {
  depth: number;
  id: string;
  name: string;
  path: string;
  slug: string;
}
export interface SupplierOption {
  id: string;
  name: string;
}

export interface ToolFormContextValue {
  allDefinitions: AttributeDefinition[];
  categories: CategoryOption[];
  definitionsByCategory: Record<string, AttributeDefinition[]>;
  suppliers: SupplierOption[];
  mode: "create" | "edit";
  existingSlug?: string;
  toolId?: string;
}

const ToolFormContext = createContext<ToolFormContextValue | null>(null);

export function ToolFormProvider({
  value,
  children,
}: {
  value: ToolFormContextValue;
  children: React.ReactNode;
}) {
  return (
    <ToolFormContext.Provider value={value}>{children}</ToolFormContext.Provider>
  );
}

export function useToolFormContext(): ToolFormContextValue {
  const ctx = useContext(ToolFormContext);
  if (!ctx) {
    throw new Error("useToolFormContext deve ser usado dentro de ToolFormProvider");
  }
  return ctx;
}
```

- [ ] **Step 2: Type-check + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/tool-form-context.tsx
git commit -m "feat(tools): context de dados estáticos do form"
```

---

## Task 5: Grupo de campos — Identidade & categoria (com categorização sem redundância)

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx`

Fonte a adaptar: seções "Identidade do produto" (`tool-form.tsx:377-416`) e "Categorização" (`tool-form.tsx:435-546`). A **mudança de design** é fundir árvore (checkbox) + radio de principal num controle só: cada categoria marcada ganha um botão "★ Principal" inline; clicar define `primaryCategoryId`. Remove o `<RadioGroup>` separado.

- [ ] **Step 1: Implementar o componente**

```tsx
// apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx
"use client";

import { Checkbox } from "@emach/ui/components/checkbox";
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
import { Textarea } from "@emach/ui/components/textarea";
import { Star } from "lucide-react";
import { useMemo } from "react";

import { HelpTooltip } from "@/components/help-tooltip";
import { useToolFormContext } from "../tool-form-context";
import type { ToolFieldGroupProps } from "./types";
import { slugify } from "../tool-schema";

export function IdentityFields({ values, onPatch, errors, disabled }: ToolFieldGroupProps) {
  const { categories, suppliers, mode, existingSlug } = useToolFormContext();

  const slugPreview = useMemo(() => {
    if (mode === "edit" && existingSlug) {
      return existingSlug;
    }
    return slugify(values.name) || "—";
  }, [mode, existingSlug, values.name]);

  function toggleCategory(catId: string, checked: boolean) {
    if (checked) {
      const next = [...values.categoryIds, catId];
      onPatch({
        categoryIds: next,
        primaryCategoryId: next.length === 1 ? catId : values.primaryCategoryId,
      });
    } else {
      const next = values.categoryIds.filter((c) => c !== catId);
      onPatch({
        categoryIds: next,
        primaryCategoryId:
          values.primaryCategoryId === catId ? (next[0] ?? "") : values.primaryCategoryId,
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">
          Nome <span className="text-destructive">*</span>
        </Label>
        <Input
          aria-invalid={errors.name ? true : undefined}
          aria-required="true"
          disabled={disabled}
          id="name"
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="Ex: Furadeira de impacto 700W"
          value={values.name}
        />
        <p className="font-mono text-muted-foreground text-xs">
          Endereço público: /ferramentas/{slugPreview}
        </p>
        {errors.name && <p className="text-destructive text-xs">{errors.name}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label className="flex items-center gap-1.5" htmlFor="description">
          Descrição
          <HelpTooltip
            title="Aceita Markdown"
            body="Use **negrito**, listas com - e títulos. É renderizado na página pública da ferramenta."
            example="**Potente** e leve\n- 700W\n- Bivolt"
          />
        </Label>
        <Textarea
          disabled={disabled}
          id="description"
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder="Especificações, destaques e uso recomendado. Aceita markdown."
          rows={4}
          value={values.description ?? ""}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label className="flex items-center gap-1.5">
          Categorias <span className="text-destructive">*</span>
          <HelpTooltip text="Onde a ferramenta aparece na árvore do site. A categoria principal (★) define as especificações técnicas disponíveis." />
        </Label>
        <div className="flex flex-col gap-1 rounded border border-border p-3">
          {categories.map((cat) => {
            const checked = values.categoryIds.includes(cat.id);
            const isPrimary = values.primaryCategoryId === cat.id;
            return (
              <div
                className="flex items-center justify-between gap-2"
                key={cat.id}
                style={{ paddingLeft: cat.depth * 16 }}
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    id={`cat-${cat.id}`}
                    onCheckedChange={(v) => toggleCategory(cat.id, v === true)}
                  />
                  <label className="cursor-pointer text-sm" htmlFor={`cat-${cat.id}`}>
                    {cat.name}
                  </label>
                </div>
                {checked && (
                  <button
                    aria-label={
                      isPrimary
                        ? `${cat.name} é a categoria principal`
                        : `Tornar ${cat.name} principal`
                    }
                    aria-pressed={isPrimary}
                    className={
                      isPrimary
                        ? "inline-flex items-center gap-1 rounded px-2 py-0.5 text-primary text-xs"
                        : "inline-flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground text-xs hover:text-foreground"
                    }
                    disabled={disabled}
                    onClick={() => onPatch({ primaryCategoryId: cat.id })}
                    type="button"
                  >
                    <Star
                      aria-hidden
                      className={isPrimary ? "size-3.5 fill-primary" : "size-3.5"}
                    />
                    {isPrimary ? "Principal" : "Tornar principal"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {errors.categoryIds && <p className="text-destructive text-xs">{errors.categoryIds}</p>}
        {errors.primaryCategoryId && (
          <p className="text-destructive text-xs">{errors.primaryCategoryId}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="supplierId">Fornecedor</Label>
        <Select
          disabled={disabled}
          onValueChange={(v) => onPatch({ supplierId: v ?? "" })}
          value={values.supplierId ?? ""}
        >
          <SelectTrigger id="supplierId">
            <SelectValue placeholder="Opcional" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar o tipo compartilhado dos grupos**

```tsx
// apps/web/src/app/dashboard/tools/_components/fields/types.ts
import type { ToolFormValues } from "../tool-schema";
import type { ToolFormState } from "../tool-form-state";

export interface ToolFieldGroupProps {
  values: ToolFormState;
  onPatch: (patch: Partial<ToolFormState>) => void;
  errors: Partial<Record<keyof ToolFormValues, string>>;
  disabled?: boolean;
}
```

- [ ] **Step 3: Type-check + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx apps/web/src/app/dashboard/tools/_components/fields/types.ts
git commit -m "feat(tools): grupo Identidade & categoria (sem redundância de principal)"
```

---

## Task 6: Grupo de campos — Variantes

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/fields/variant-fields.tsx`

Envolve o `VariantsEditor` existente (`variants-editor.tsx`, intacto). Header copiado de `tool-form.tsx:418-433`.

- [ ] **Step 1: Implementar**

```tsx
// apps/web/src/app/dashboard/tools/_components/fields/variant-fields.tsx
"use client";

import { HelpTooltip } from "@/components/help-tooltip";
import { VariantsEditor } from "../variants-editor";
import type { ToolVariantInput } from "../tool-schema";
import type { ToolFieldGroupProps } from "./types";

export function VariantFields({ values, onPatch, errors, disabled }: ToolFieldGroupProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        Cada variante é uma SKU vendável. Use voltagens distintas (127V/220V) como linhas separadas.
        <HelpTooltip text="A variante padrão é a SKU pré-selecionada na loja quando o cliente abre a ferramenta. Exatamente uma por produto." />
      </p>
      <VariantsEditor
        error={errors.variants}
        onChange={(next: ToolVariantInput[]) => onPatch({ variants: next })}
        value={values.variants}
      />
    </div>
  );
}
```

> `disabled` não é repassado: `VariantsEditor` não aceita a prop hoje. Se a UX exigir desabilitar durante submit, adicionar `disabled?` ao `VariantsEditor` numa task futura — fora de escopo aqui.

- [ ] **Step 2: Type-check + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/fields/variant-fields.tsx
git commit -m "feat(tools): grupo Variantes"
```

---

## Task 7: Grupo de campos — Especificações

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/fields/spec-fields.tsx`

Envolve `AttributeAssignmentsEditor` + `DynamicSpecsEditor` (intactos). Lógica de derivação por categoria principal copiada de `tool-form.tsx:242-309` + seção `548-577`.

- [ ] **Step 1: Implementar**

```tsx
// apps/web/src/app/dashboard/tools/_components/fields/spec-fields.tsx
"use client";

import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { useMemo } from "react";

import { AttributeAssignmentsEditor } from "../attribute-assignments-editor";
import { DynamicSpecsEditor } from "../dynamic-specs-editor";
import { useToolFormContext } from "../tool-form-context";
import type { AttributeValueInput } from "../tool-schema";
import type { ToolFieldGroupProps } from "./types";

export function SpecFields({ values, onPatch, disabled }: ToolFieldGroupProps) {
  const { allDefinitions, definitionsByCategory } = useToolFormContext();

  const suggestedDefinitions = useMemo(
    () => definitionsByCategory[values.primaryCategoryId] ?? [],
    [definitionsByCategory, values.primaryCategoryId]
  );

  const definitionsBySlug = useMemo(
    () => new Map(allDefinitions.map((d) => [d.slug, d])),
    [allDefinitions]
  );

  const assignedDefinitions = useMemo(() => {
    const out: AttributeDefinition[] = [];
    for (const slug of values.attributeAssignments) {
      const def = definitionsBySlug.get(slug);
      if (def) {
        out.push(def);
      }
    }
    return out;
  }, [values.attributeAssignments, definitionsBySlug]);

  function updateAssignments(next: string[]) {
    const nextSet = new Set(next);
    const trimmed: Record<string, AttributeValueInput> = {};
    for (const [k, v] of Object.entries(values.attributeValues)) {
      if (nextSet.has(k)) {
        trimmed[k] = v;
      }
    }
    onPatch({ attributeAssignments: next, attributeValues: trimmed });
  }

  function updateValue(slug: string, value: AttributeValueInput) {
    onPatch({ attributeValues: { ...values.attributeValues, [slug]: value } });
  }

  if (!values.primaryCategoryId) {
    return (
      <p className="text-muted-foreground text-sm">
        Selecione a categoria principal no passo 1 para liberar as especificações técnicas.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-medium text-sm">Atributos desta ferramenta</h3>
      <AttributeAssignmentsEditor
        allDefinitions={allDefinitions}
        onChange={updateAssignments}
        suggested={suggestedDefinitions}
        value={values.attributeAssignments}
      />
      {assignedDefinitions.length > 0 && (
        <div className="flex flex-col gap-2 border-border border-t pt-4">
          <h3 className="font-medium text-sm">Valores</h3>
          <DynamicSpecsEditor
            definitions={assignedDefinitions}
            onChange={updateValue}
            values={values.attributeValues}
          />
        </div>
      )}
    </div>
  );
}
```

> **Mudança de comportamento intencional:** o auto-reset de assignments ao trocar a categoria principal (efeito em `tool-form.tsx:263-278`, só no modo create) **sai**. Motivo: no wizard a categoria é escolhida no passo 1 antes de abrir o passo 3, então o reset por efeito vira ruído. O pool sugerido continua aparecendo via `suggested`; o usuário marca o que quer. `disabled` não repassado (editores não aceitam hoje).

- [ ] **Step 2: Type-check + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/fields/spec-fields.tsx
git commit -m "feat(tools): grupo Especificações"
```

---

## Task 8: Grupo de campos — Logística & frete

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/fields/logistics-fields.tsx`

Fonte: seção "Dimensões físicas" (`tool-form.tsx:579-703`) incluindo `exceedsShippingQuoteLimit` (`162-169`) e o alerta de item pesado.

- [ ] **Step 1: Implementar**

```tsx
// apps/web/src/app/dashboard/tools/_components/fields/logistics-fields.tsx
"use client";

import { Label } from "@emach/ui/components/label";
import { TriangleAlert } from "lucide-react";

import { HelpTooltip } from "@/components/help-tooltip";
import { MaskedInput } from "@/components/masked-input";
import { decimalMask, integerMask } from "@/lib/masks";
import type { ToolFormState } from "../tool-form-state";
import type { ToolFieldGroupProps } from "./types";

function exceedsShippingQuoteLimit(v: ToolFormState): boolean {
  return (
    (v.weightKg ?? 0) > 30 ||
    (v.lengthCm ?? 0) > 100 ||
    (v.widthCm ?? 0) > 100 ||
    (v.heightCm ?? 0) > 100
  );
}

export function LogisticsFields({ values, onPatch, errors, disabled }: ToolFieldGroupProps) {
  const exceeds = exceedsShippingQuoteLimit(values);
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
        A loja usa peso e medidas para cotar o frete no checkout.
        <HelpTooltip
          title="Por que peso e dimensões são obrigatórios"
          body="A loja cota o frete pelo SuperFrete usando esses valores. Sem eles, o cliente não consegue fechar o pedido. Cotação cobre até 30 kg e 100 cm por lado."
          example="Peso 2,5 kg · 30×20×10 cm"
        />
      </p>
      <div className="grid gap-4 md:grid-cols-5">
        <FieldNum id="weightKg" label="Peso (kg)" required error={errors.weightKg} disabled={disabled} mask={decimalMask} placeholder="Ex: 2,5" value={values.weightKg} onChange={(v) => onPatch({ weightKg: v })} />
        <FieldNum id="lengthCm" label="Comprimento (cm)" required error={errors.lengthCm} disabled={disabled} mask={decimalMask} placeholder="Ex: 30" value={values.lengthCm} onChange={(v) => onPatch({ lengthCm: v })} />
        <FieldNum id="widthCm" label="Largura (cm)" required error={errors.widthCm} disabled={disabled} mask={decimalMask} placeholder="Ex: 10" value={values.widthCm} onChange={(v) => onPatch({ widthCm: v })} />
        <FieldNum id="heightCm" label="Altura (cm)" required error={errors.heightCm} disabled={disabled} mask={decimalMask} placeholder="Ex: 20" value={values.heightCm} onChange={(v) => onPatch({ heightCm: v })} />
        <FieldNum id="powerWatts" label="Potência (W)" disabled={disabled} mask={integerMask} placeholder="Ex: 700" value={values.powerWatts} onChange={(v) => onPatch({ powerWatts: v })} />
      </div>
      {exceeds && (
        <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-foreground text-xs leading-relaxed">
              Excede os limites do SuperFrete (máx. 30 kg e 100 cm por lado). A loja não cota
              automaticamente — o custo real pode sair <strong>mais caro do que o cliente pagou</strong>.
              Defina um frete fixo abaixo ou trate manualmente.
            </p>
          </div>
          <div className="flex max-w-xs flex-col gap-2">
            <Label className="flex items-center gap-1.5" htmlFor="overweightShippingAmount">
              Frete para item pesado (R$)
              <HelpTooltip
                title="Quando a cotação automática não cobre"
                body="Acima de 30 kg / 100 cm a loja não cota. Esse valor fixo entra no lugar. Em branco = 'Frete a combinar' na loja."
                example="Ex: 250,00"
              />
            </Label>
            <MaskedInput
              disabled={disabled}
              id="overweightShippingAmount"
              mask={decimalMask}
              onChange={(v) => onPatch({ overweightShippingAmount: v })}
              placeholder="Ex: 250,00"
              value={values.overweightShippingAmount}
            />
            <p className="text-muted-foreground text-xs">
              Cobrado no lugar da cotação automática.
            </p>
          </div>
        </div>
      )}
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
  mask: Parameters<typeof MaskedInput>[0]["mask"];
  placeholder: string;
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <MaskedInput
        aria-invalid={error ? true : undefined}
        aria-required={required ? "true" : undefined}
        disabled={disabled}
        id={id}
        mask={mask}
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
```

> Conferir a assinatura de `MaskedInput` em `apps/web/src/components/masked-input.tsx` antes de usar o `Parameters<...>["mask"]` — se o tipo do mask for exportado nominalmente, importar e usar o tipo nomeado em vez do `Parameters`.

- [ ] **Step 2: Type-check + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/fields/logistics-fields.tsx
git commit -m "feat(tools): grupo Logística & frete"
```

---

## Task 9: Grupo de campos — Fiscal

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/fields/fiscal-fields.tsx`

Fonte: seção "Identificação fiscal" (`tool-form.tsx:705-782`). Adiciona HelpTooltip rico em NCM/CEST/HS e curto em modelo comercial vs fábrica.

- [ ] **Step 1: Implementar**

```tsx
// apps/web/src/app/dashboard/tools/_components/fields/fiscal-fields.tsx
"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";

import { HelpTooltip } from "@/components/help-tooltip";
import { MaskedInput } from "@/components/masked-input";
import { cestMask, hsCodeMask, ncmMask } from "@/lib/masks";
import type { ToolFieldGroupProps } from "./types";

export function FiscalFields({ values, onPatch, disabled }: ToolFieldGroupProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1.5" htmlFor="model">
            Modelo comercial
            <HelpTooltip text="Nome curto pra catálogo e busca interna. Ex: ELT 800." />
          </Label>
          <Input disabled={disabled} id="model" onChange={(e) => onPatch({ model: e.target.value })} placeholder="Ex: ELT 800" value={values.model ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1.5" htmlFor="invoiceModel">
            Modelo da fábrica
            <HelpTooltip text="Identificação completa usada em invoice e importação. Diferente do modelo comercial (curto, pra catálogo)." />
          </Label>
          <Input disabled={disabled} id="invoiceModel" onChange={(e) => onPatch({ invoiceModel: e.target.value })} placeholder="Ex: FG-S225L-3-220V" value={values.invoiceModel ?? ""} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="manufacturerName">Marca / fabricante</Label>
        <Input disabled={disabled} id="manufacturerName" onChange={(e) => onPatch({ manufacturerName: e.target.value })} placeholder="Ex: Bosch, Makita" value={values.manufacturerName ?? ""} />
      </div>
      <div className="grid gap-4 border-border border-t pt-4 md:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1.5" htmlFor="ncm">
            NCM
            <HelpTooltip title="Nomenclatura Comum do Mercosul" body="Classifica a mercadoria para impostos e importação. 8 dígitos. Pegue na ficha do fabricante." example="Ex: 8467.21.00" />
          </Label>
          <MaskedInput disabled={disabled} id="ncm" mask={ncmMask} onChange={(v) => onPatch({ ncm: v ?? "" })} value={values.ncm ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1.5" htmlFor="cest">
            CEST
            <HelpTooltip title="Código Especificador da Substituição Tributária" body="Identifica mercadorias sujeitas a ICMS-ST. Usado na nota fiscal. 7 dígitos." example="Ex: 21.106.00" />
          </Label>
          <MaskedInput disabled={disabled} id="cest" mask={cestMask} onChange={(v) => onPatch({ cest: v ?? "" })} value={values.cest ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1.5" htmlFor="hsCode">
            HS Code
            <HelpTooltip title="Harmonized System Code" body="Código aduaneiro internacional usado em importação/exportação. 6+ dígitos." example="Ex: 8467.21" />
          </Label>
          <MaskedInput disabled={disabled} id="hsCode" mask={hsCodeMask} onChange={(v) => onPatch({ hsCode: v ?? "" })} value={values.hsCode ?? ""} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/fields/fiscal-fields.tsx
git commit -m "feat(tools): grupo Fiscal com ajuda contextual"
```

---

## Task 10: Grupo de campos — Imagens & publicação

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/fields/publish-fields.tsx`

Fonte: seções "Imagens" (`tool-form.tsx:784-803`) e "Publicação" (`805-852`). Envolve `ToolImageGallery`.

- [ ] **Step 1: Implementar**

```tsx
// apps/web/src/app/dashboard/tools/_components/fields/publish-fields.tsx
"use client";

import { Label } from "@emach/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@emach/ui/components/select";
import { Switch } from "@emach/ui/components/switch";

import { HelpTooltip } from "@/components/help-tooltip";
import { ToolImageGallery } from "../tool-image-gallery";
import {
  MAX_IMAGES,
  MIN_IMAGES_ACTIVE,
  TOOL_STATUS_LABELS,
  TOOL_STATUS_OPTIONS,
  type ToolFormValues,
} from "../tool-schema";
import type { ToolFieldGroupProps } from "./types";

export function PublishFields({ values, onPatch, errors, disabled }: ToolFieldGroupProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          {values.images.length} de {MAX_IMAGES} imagens. Primeira é a capa. Status "Ativo"
          exige no mínimo {MIN_IMAGES_ACTIVE}.
        </p>
        <ToolImageGallery
          max={MAX_IMAGES}
          min={values.status === "active" ? MIN_IMAGES_ACTIVE : 0}
          onChange={(images) => onPatch({ images })}
          value={values.images}
        />
        {errors.images && <p className="text-destructive text-xs">{errors.images}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1.5" htmlFor="status">
            Status <span className="text-destructive">*</span>
            <HelpTooltip text={`Rascunho fica oculto. "Ativo" exige ${MIN_IMAGES_ACTIVE} imagens e publica na loja. Descontinuado some de novas vendas.`} />
          </Label>
          <Select
            disabled={disabled}
            onValueChange={(v) => onPatch({ status: v as ToolFormValues["status"] })}
            value={values.status}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TOOL_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TOOL_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5" htmlFor="visibleOnSite">
            Visível no site
            <HelpTooltip text="Desligado, a ferramenta existe no catálogo interno mas não aparece pra clientes na loja, mesmo se 'Ativo'." />
          </Label>
          <Switch
            checked={values.visibleOnSite}
            disabled={disabled}
            id="visibleOnSite"
            onCheckedChange={(checked) => onPatch({ visibleOnSite: checked })}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/fields/publish-fields.tsx
git commit -m "feat(tools): grupo Imagens & publicação"
```

---

## Task 11: ToolWizard (criar) + ToolEditView (editar) + helper de submit

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/tool-submit.ts`
- Create: `apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx`
- Create: `apps/web/src/app/dashboard/tools/_components/tool-edit-view.tsx`

- [ ] **Step 1: Helper de submit compartilhado**

```ts
// apps/web/src/app/dashboard/tools/_components/tool-submit.ts
"use client";

import type { ZodError } from "zod";
import {
  type FormIssue,
  zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { createTool, updateTool } from "../actions";
import type { ToolFormState } from "./tool-form-state";
import { type ToolFormValues, toolFormSchema } from "./tool-schema";

const FIELD_LABELS: Record<string, string> = {
  name: "Nome", description: "Descrição", model: "Modelo comercial",
  invoiceModel: "Modelo da fábrica", manufacturerName: "Marca / fabricante",
  status: "Status", hsCode: "HS Code", ncm: "NCM", cest: "CEST",
  powerWatts: "Potência (W)", weightKg: "Peso (kg)", lengthCm: "Comprimento (cm)",
  widthCm: "Largura (cm)", heightCm: "Altura (cm)", categoryIds: "Categorias",
  primaryCategoryId: "Categoria principal", supplierId: "Fornecedor",
  visibleOnSite: "Visível no site", images: "Imagens", variants: "Variantes",
  attributeValues: "Especificações técnicas", attributeAssignments: "Atributos vinculados",
};

export interface ParsedResult {
  ok: boolean;
  data?: ToolFormValues;
  fieldErrors: Partial<Record<keyof ToolFormValues, string>>;
  issues: FormIssue[];
}

export function parseToolForm(values: ToolFormState): ParsedResult {
  const result = toolFormSchema.safeParse(values);
  if (result.success) {
    return { ok: true, data: result.data, fieldErrors: {}, issues: [] };
  }
  const err = result.error as ZodError<ToolFormValues>;
  const fieldErrors: Partial<Record<keyof ToolFormValues, string>> = {};
  for (const issue of err.issues) {
    const key = issue.path[0] as keyof ToolFormValues | undefined;
    if (key && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return {
    ok: false,
    fieldErrors,
    issues: zodIssuesToFormIssues(err, FIELD_LABELS),
  };
}

export async function persistTool(
  mode: "create" | "edit",
  data: ToolFormValues,
  toolId?: string
) {
  return mode === "create" ? createTool(data) : updateTool(toolId ?? "", data);
}
```

- [ ] **Step 2: ToolWizard**

```tsx
// apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormErrorPanel } from "@/components/form-error-panel";
import { IdentityFields } from "./fields/identity-fields";
import { VariantFields } from "./fields/variant-fields";
import { SpecFields } from "./fields/spec-fields";
import { LogisticsFields } from "./fields/logistics-fields";
import { FiscalFields } from "./fields/fiscal-fields";
import { PublishFields } from "./fields/publish-fields";
import { getStepIssues, TOOL_STEPS, type ToolStepId } from "./tool-form-steps";
import { useToolFormState } from "./tool-form-state";
import { parseToolForm, persistTool } from "./tool-submit";
import { useToolFormContext } from "./tool-form-context";

const STEP_COMPONENT: Record<ToolStepId, typeof IdentityFields> = {
  identity: IdentityFields,
  variants: VariantFields,
  specs: SpecFields,
  logistics: LogisticsFields,
  fiscal: FiscalFields,
  publish: PublishFields,
};

export function ToolWizard({ defaultValues }: { defaultValues?: Record<string, unknown> }) {
  const router = useRouter();
  const { toolId } = useToolFormContext();
  const { values, errors, setErrors } = useToolFormState(defaultValues ?? {});
  const { patch } = useToolFormState; // placeholder — ver nota abaixo
  const [active, setActive] = useState(0);
  const [issues, setIssues] = useState<ReturnType<typeof getStepIssues>>([]);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLDivElement | null>(null);

  const step = TOOL_STEPS[active];
  const Fields = STEP_COMPONENT[step.id];

  function stepDone(stepId: ToolStepId): boolean {
    return getStepIssues(values, stepId).length === 0;
  }

  function next() {
    const stepIssues = getStepIssues(values, step.id);
    setIssues(stepIssues);
    if (stepIssues.length > 0 && !step.optional) {
      return;
    }
    setActive((i) => Math.min(i + 1, TOOL_STEPS.length - 1));
  }

  function submit() {
    const parsed = parseToolForm(values);
    setErrors(parsed.fieldErrors);
    setIssues(parsed.issues);
    if (!parsed.ok || !parsed.data) {
      requestAnimationFrame(() =>
        errorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
      return;
    }
    startTransition(async () => {
      const res = await persistTool("create", parsed.data, toolId);
      if (res.ok) {
        toast.success("Ferramenta criada com sucesso");
        router.push("/dashboard/tools");
        router.refresh();
      } else {
        toast.error(res.error || "Falha ao salvar");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-1 rounded-md bg-muted p-1 ring-1 ring-border/60">
        {TOOL_STEPS.map((s, i) => {
          const done = i !== active && stepDone(s.id);
          const isActive = i === active;
          return (
            <li key={s.id}>
              <button
                aria-current={isActive ? "step" : undefined}
                className={
                  isActive
                    ? "flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs"
                    : "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:text-foreground"
                }
                onClick={() => setActive(i)}
                type="button"
              >
                {done ? <Check aria-hidden className="size-3.5 text-success" /> : <span>{i + 1}</span>}
                {s.label}
                {s.optional && <span className="text-[10px] opacity-70">(opcional)</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <FormErrorPanel issues={issues} ref={errorRef} />

      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-primary text-sm uppercase tracking-wide">{step.label}</h2>
          <p className="text-muted-foreground text-xs">{step.description}</p>
        </div>
        <div className="pt-4">
          <Fields values={values} onPatch={patch} errors={errors} disabled={isPending} />
        </div>
      </section>

      <div className="flex items-center justify-between">
        <Button disabled={active === 0} onClick={() => setActive((i) => Math.max(i - 1, 0))} type="button" variant="ghost">
          ‹ Voltar
        </Button>
        {active < TOOL_STEPS.length - 1 ? (
          <Button onClick={next} type="button">
            Próximo ›
          </Button>
        ) : (
          <Button disabled={isPending} onClick={submit} type="button">
            {isPending ? (<><Spinner /> Salvando…</>) : "Criar ferramenta"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

> **Correção obrigatória no Step 2:** o `useToolFormState` deve ser chamado **uma vez**; o rascunho acima tem um placeholder errado (`const { patch } = useToolFormState`). Implementar como:
> ```tsx
> const { values, patch, errors, setErrors } = useToolFormState(defaultValues ?? {});
> ```
> e remover a linha placeholder. (Deixado explícito pra não copiar o erro.)

- [ ] **Step 3: ToolEditView**

```tsx
// apps/web/src/app/dashboard/tools/_components/tool-edit-view.tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormErrorPanel } from "@/components/form-error-panel";
import { IdentityFields } from "./fields/identity-fields";
import { VariantFields } from "./fields/variant-fields";
import { SpecFields } from "./fields/spec-fields";
import { LogisticsFields } from "./fields/logistics-fields";
import { FiscalFields } from "./fields/fiscal-fields";
import { PublishFields } from "./fields/publish-fields";
import { TOOL_STEPS } from "./tool-form-steps";
import { useToolFormState } from "./tool-form-state";
import { parseToolForm, persistTool } from "./tool-submit";
import { useToolFormContext } from "./tool-form-context";

const SECTION = {
  identity: IdentityFields,
  variants: VariantFields,
  specs: SpecFields,
  logistics: LogisticsFields,
  fiscal: FiscalFields,
  publish: PublishFields,
} as const;

export function ToolEditView({ defaultValues }: { defaultValues?: Record<string, unknown> }) {
  const router = useRouter();
  const { toolId } = useToolFormContext();
  const { values, patch, errors, setErrors } = useToolFormState(defaultValues ?? {});
  const [issues, setIssues] = useState<ReturnType<typeof parseToolForm>["issues"]>([]);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLDivElement | null>(null);

  function submit() {
    const parsed = parseToolForm(values);
    setErrors(parsed.fieldErrors);
    setIssues(parsed.issues);
    if (!parsed.ok || !parsed.data) {
      requestAnimationFrame(() =>
        errorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
      return;
    }
    startTransition(async () => {
      const res = await persistTool("edit", parsed.data, toolId);
      if (res.ok) {
        toast.success("Ferramenta atualizada com sucesso");
        router.push("/dashboard/tools");
        router.refresh();
      } else {
        toast.error(res.error || "Falha ao salvar");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
      <nav className="hidden lg:sticky lg:top-6 lg:flex lg:h-fit lg:flex-col lg:gap-1">
        {TOOL_STEPS.map((s) => (
          <a
            className="rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
            href={`#sec-${s.id}`}
            key={s.id}
          >
            {s.label}
          </a>
        ))}
      </nav>
      <div className="flex flex-col gap-6">
        <FormErrorPanel issues={issues} ref={errorRef} />
        {TOOL_STEPS.map((s) => {
          const Fields = SECTION[s.id];
          return (
            <section className="flex flex-col gap-2 scroll-mt-6 rounded-md border border-border bg-card p-6" id={`sec-${s.id}`} key={s.id}>
              <div className="flex flex-col gap-1">
                <h2 className="font-semibold text-primary text-sm uppercase tracking-wide">{s.label}</h2>
                <p className="text-muted-foreground text-xs">{s.description}</p>
              </div>
              <div className="pt-4">
                <Fields values={values} onPatch={patch} errors={errors} disabled={isPending} />
              </div>
            </section>
          );
        })}
        <div className="flex gap-3">
          <Button disabled={isPending} onClick={submit} type="button">
            {isPending ? (<><Spinner /> Salvando…</>) : "Salvar alterações"}
          </Button>
          <Button onClick={() => router.push("/dashboard/tools")} type="button" variant="ghost">
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
```

> Scrollspy "destaca a seção visível" pode ficar pra um polish posterior (IntersectionObserver); âncoras com `scroll-mt-6` já entregam a navegação. Não bloquear a task por isso.

- [ ] **Step 4: Type-check + commit**

```bash
bun check-types
git add apps/web/src/app/dashboard/tools/_components/tool-submit.ts apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx apps/web/src/app/dashboard/tools/_components/tool-edit-view.tsx
git commit -m "feat(tools): ToolWizard (criar) + ToolEditView (editar)"
```

---

## Task 12: Religar as páginas /new e /[id]/edit e remover o monólito

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/new/page.tsx`
- Modify: `apps/web/src/app/dashboard/tools/[id]/edit/page.tsx`
- Delete: `apps/web/src/app/dashboard/tools/_components/tool-form.tsx`

- [ ] **Step 1: `new/page.tsx` renderiza o wizard dentro do provider**

Substituir o bloco `return (...)` (`new/page.tsx:40-60`) por:

```tsx
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-medium font-serif text-4xl tracking-tight">Nova ferramenta</h1>
        <p className="text-muted-foreground text-sm">Seis passos guiados. Você pode pular entre eles a qualquer momento.</p>
      </div>
      <ToolFormProvider
        value={{
          allDefinitions,
          categories,
          definitionsByCategory,
          suppliers,
          mode: "create",
        }}
      >
        <ToolWizard />
      </ToolFormProvider>
    </div>
  );
```

Trocar os imports: remover `ToolForm`, adicionar
```tsx
import { ToolFormProvider } from "../_components/tool-form-context";
import { ToolWizard } from "../_components/tool-wizard";
```

- [ ] **Step 2: `[id]/edit/page.tsx` renderiza o edit-view dentro do provider**

Substituir o bloco `return (...)` (`[id]/edit/page.tsx:192-221`) por:

```tsx
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-medium font-serif text-4xl tracking-tight">Editar: {row.name}</h1>
        <p className="text-muted-foreground text-sm">Atualize os dados da ferramenta.</p>
      </div>
      <ToolFormProvider
        value={{
          allDefinitions,
          categories,
          definitionsByCategory,
          suppliers,
          mode: "edit",
          existingSlug: row.slug ?? undefined,
          toolId: id,
        }}
      >
        <ToolEditView
          defaultValues={toFormValues(row, images, toolCats, variants, attrValues, attributeAssignments)}
        />
      </ToolFormProvider>
    </div>
  );
```

Trocar os imports: remover `ToolForm`, adicionar
```tsx
import { ToolFormProvider } from "../../_components/tool-form-context";
import { ToolEditView } from "../../_components/tool-edit-view";
```

E passar `defaultValues` ao `ToolWizard` no create? Não — create começa vazio. (O `ToolWizard` aceita `defaultValues` opcional pra futuro reuso; em `/new` não passamos.)

- [ ] **Step 3: Remover o monólito**

```bash
git rm apps/web/src/app/dashboard/tools/_components/tool-form.tsx
```

- [ ] **Step 4: Type-check + lint**

```bash
bun check-types
bun check
```
Expected: ambos verdes. Se `bun check` apontar `useExhaustiveDependencies` ou nested-ternary nos componentes novos, corrigir seguindo o padrão do repo (extrair helper, early-return) — **não** suprimir com biome-ignore salvo se o código canônico de referência também suprime.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/new/page.tsx apps/web/src/app/dashboard/tools/[id]/edit/page.tsx
git commit -m "refactor(tools): wizard no /new, edit-view no /edit, remove tool-form monólito"
```

---

## Task 13: Smoke visual + code-review

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir o dev server** — pedir ao usuário/retomar o `/dev-here 3006` (o monitor acusou queda). Ou `cd apps/web && bun run dev --port 3006`.

- [ ] **Step 2: Smoke de CRIAR** — visitar `http://localhost:3006/dashboard/tools/new`:
  - Percorrer os 6 passos; conferir stepper coral + check verde ao completar.
  - Navegação livre (clicar em passo à frente e voltar).
  - "Próximo" bloqueia em passo essencial inválido (ex: passo 1 sem nome) e mostra os issues no `FormErrorPanel`.
  - Passo 5 (Fiscal) avança mesmo vazio (opcional).
  - `HelpTooltip`: hover **e** foco por teclado (Tab até o `?`, Esc fecha) em descrição, NCM/CEST/HS, frete pesado, status.
  - Categorização: marcar categoria, clicar "★ Tornar principal", trocar principal — sem o radio duplicado antigo.
  - Submeter válido → cria no banco, redireciona pra `/dashboard/tools`. Conferir a ferramenta criada.
  - Erros de console/client: `read_console_messages` (onlyErrors) na aba.

- [ ] **Step 3: Smoke de EDITAR** — visitar `/dashboard/tools/<id>/edit` de uma ferramenta existente:
  - Rail lateral navega pras seções; todos os campos pré-preenchidos.
  - Alterar um campo e salvar → persiste, redireciona. Conferir alteração.

- [ ] **Step 4: `/code-review`** no diff acumulado da branch. Aplicar findings de correção; cleanups via `/simplify` se fizer sentido.

- [ ] **Step 5: Commit final** (se o review gerar ajustes)

```bash
git add -A
git commit -m "fix(tools): ajustes pós code-review do redesign do form"
```

---

## Self-review (cobertura do spec)

- Wizard 6 passos (criar) → Tasks 1, 11, 12 ✓
- Página + rail (editar) → Tasks 11 (ToolEditView), 12 ✓
- HelpTooltip híbrido → Task 2; aplicado em 5, 6, 8, 9, 10 ✓
- Validação por passo (nav livre + check verde) → Tasks 1 (getStepIssues), 11 (stepDone/next) ✓
- Categorização sem redundância → Task 5 ✓
- "Peso" em Logística com porquê → Task 8 ✓
- Arquitetura espelhando filiais (fields + state + context) → Tasks 3, 4, 5–10 ✓
- Sem mudança de schema/DB → nenhuma task toca `tool-schema.ts` (só lê) nem `packages/db` ✓
- Smoke + code-review → Task 13 ✓
- Fora de escopo (outros forms, draft parcial) → não há task; follow-up registrado fora do repo ✓
```
