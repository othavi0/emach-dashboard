# Migração de forms para `<LabeledField>` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Propagar o componente `<LabeledField>` (#154) para todos os forms restantes do dashboard, eliminando a fiação manual `Label` + `aria-invalid` + `<FieldError>` campo a campo.

**Architecture:** Cada campo de **controle único** vira `<LabeledField>` (render-prop que injeta `id` + `aria-invalid` e renderiza o `<FieldError>` com a âncora `data-error`). Blocos/listas/refine cross-field mantêm `<FieldError>` no nível do grupo. 4 custom controls são estendidos antes para repassar `aria-invalid` ao DOM.

**Tech Stack:** Next 16 / React 19, `@emach/ui`, Zod + `useFormErrors`/`zodIssuesToFieldErrors`, vitest, ultracite (`bun check`).

**Spec:** `docs/superpowers/specs/2026-06-13-labeled-field-migration-design.md`

---

## Template canônico (referência de TODA migração de campo único)

A referência de código exata já existe e está merged: **`apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx`** (piloto #154). Todo campo migrado segue esta forma:

```tsx
// ANTES
<div className="flex flex-col gap-1.5">           {/* ou gap-2 */}
  <Label htmlFor="x-id">Rótulo <span className="text-destructive"> *</span></Label>
  <Input
    aria-invalid={errors.foo ? true : undefined}
    id="x-id"
    onChange={(e) => onPatch({ foo: e.target.value })}
    value={values.foo ?? ""}
  />
  <FieldError>{errors.foo}</FieldError>
</div>

// DEPOIS
<LabeledField error={errors.foo} id="x-id" label="Rótulo" required>
  {(field) => (
    <Input
      {...field}
      onChange={(e) => onPatch({ foo: e.target.value })}
      value={values.foo ?? ""}
    />
  )}
</LabeledField>
```

**Regras invariáveis (valem em todas as tasks):**

1. `{...field}` é o **primeiro** prop do controle. Nunca passar `id` ou `aria-invalid` manual depois — descasa do `htmlFor`.
2. `required` substitui o `<span className="text-destructive"> *</span>` manual. Campo sem asterisco hoje → sem `required`.
3. `<HelpTooltip>` que ficava dentro do `<Label>` vai para a prop `help`. (O `LabeledField` já aplica `flex items-center gap-1.5` no Label quando `help` existe.)
4. Texto auxiliar **estático de um campo** (ex: "Markdown suportado") vai para a prop `hint`. Texto que pertence à **seção** (não ao campo) permanece como `<p>` fora do `LabeledField`.
5. Remover o import de `FieldError` quando o arquivo deixar de usá-lo em qualquer ponto. Remover `Label` se não sobrar nenhum uso direto. **Adicionar** `import { LabeledField } from "@/components/labeled-field";`.
6. Blocos/listas/Switch com layout próprio **não** migram — mantêm `<FieldError>` de grupo onde já está.
7. Controles custom recebem `{...field}` igual aos nativos — após a Task 0 todos aceitam `aria-invalid`.

**Verificação por arquivo (todas as tasks de migração usam estes mesmos comandos):**

```bash
bun --cwd apps/web check-types          # tsc — esperado: sem erros
bun check apps/web/src/<caminho-do-arquivo>   # ultracite no arquivo tocado — esperado: sem erros
```

`check-types` roda no projeto todo (não dá pra escopar por arquivo); rode-o uma vez ao fim de cada task. O smoke visual é consolidado na Task 6 (não por arquivo).

---

## Task 0: Estender custom controls para repassar `aria-invalid`

**Files:**
- Modify: `apps/web/src/components/money-input.tsx`
- Modify: `apps/web/src/components/discount-input.tsx`
- Modify: `packages/ui/src/components/date-picker.tsx`
- (ToolCombobox é migrado na Task 4, junto do promotions — é inline naquele arquivo.)

- [ ] **Step 1: `MoneyInput` aceita `aria-invalid`**

Em `money-input.tsx`, adicionar a prop à interface e repassá-la ao `AffixInput` (que já espalha `...rest` no `<input>`):

```tsx
interface MoneyInputProps {
	"aria-invalid"?: true | undefined;
	disabled?: boolean;
	id?: string;
	onChange: (value: number | null) => void;
	value: number | null | undefined;
}

export function MoneyInput({
	"aria-invalid": ariaInvalid,
	disabled,
	id,
	onChange,
	value,
}: MoneyInputProps) {
	// ...corpo inalterado...
	return (
		<AffixInput
			aria-invalid={ariaInvalid}
			disabled={disabled}
			id={id}
			inputMode="numeric"
			onChange={handleChange}
			placeholder="0,00"
			prefix={<span className="flex items-center px-2.5">R$</span>}
			value={display}
		/>
	);
}
```

- [ ] **Step 2: `DiscountInput` aceita `aria-invalid`**

Em `discount-input.tsx`, mesma mudança: adicionar `"aria-invalid"?: true | undefined` à interface, desestruturar como `ariaInvalid`, e passar `aria-invalid={ariaInvalid}` ao `AffixInput` final (o que tem `prefix={prefix}`).

- [ ] **Step 3: `DatePicker` aceita `aria-invalid`**

Em `packages/ui/src/components/date-picker.tsx`, adicionar à interface e repassar ao `<Button>` do `PopoverTrigger`:

```tsx
interface DatePickerProps {
	"aria-invalid"?: boolean;
	align?: "start" | "center" | "end";
	"aria-label"?: string;
	// ...resto inalterado...
}

function DatePicker({
	// ...
	"aria-invalid": ariaInvalid,
	"aria-label": ariaLabel,
}: DatePickerProps) {
	// ...
	// no <Button> do render={}: adicionar aria-invalid={ariaInvalid}
}
```

A prop é opcional → retrocompatível com os usos atuais do `DatePicker`. Caveat: `aria-invalid` num `<button>` popover marca o estado mas não dá foco de texto; o `focusFirstError` ainda rola até ele.

- [ ] **Step 4: Verificar tipos e lint**

Run:
```bash
bun --cwd apps/web check-types
bun check apps/web/src/components/money-input.tsx apps/web/src/components/discount-input.tsx packages/ui/src/components/date-picker.tsx
```
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/money-input.tsx apps/web/src/components/discount-input.tsx packages/ui/src/components/date-picker.tsx
git commit -m "feat(forms): custom controls (MoneyInput/DiscountInput/DatePicker) repassam aria-invalid (#155)"
```

---

## Task 1: Grupo A — branches

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx`

Campos de controle único → `<LabeledField>`. **Atenção às chaves de erro reais** (não inventar):

| id | label | controle | error key | required | help/hint |
|---|---|---|---|---|---|
| `branch-name` | Nome | `Input` | `errors.name` | sim | — |
| `branch-status` | Status | `Select`/`SelectTrigger` | `errors.status` | não | — |
| `branch-phone` | Telefone | `MaskedInput` | `errors.phone` | não | — |
| `branch-cep` | CEP | `CepInput` | `errors.cep` | não | — |
| `branch-street` | Rua | `Input` | `errors.street` | não | — |
| `branch-number` | Número | `Input` | `errors.streetNumber` | não | — |
| `branch-complement` | Complemento | `Input` | `errors.complement` | não | — |
| `branch-neighborhood` | Bairro | `Input` | `errors.neighborhood` | não | — |
| `branch-city` | Cidade | `Input` | `errors.city` | não | — |
| `branch-state` | UF | `UfSelect` | `errors.state` | não | — |

- [ ] **Step 1:** Migrar os 10 campos acima para `<LabeledField>` seguindo o template. Para o `Select` do status: `{...field}` vai no `<SelectTrigger>` (já é onde estava o `aria-invalid`/`id`), o `<Select>` wrapper continua com `onValueChange`/`value`/`disabled`.

- [ ] **Step 2 — NÃO migrar (mantêm `<FieldError>` de bloco):** `businessHours` (seção de horários) e `cepRanges` (`CepRangesEditor`). A seção Equipe (`ResponsibleUserSelect`) não tem erro — deixar como está. Os `<p>` de seção ("Inativa esconde…", "Domingos…", "Sugestão de qual filial…") permanecem fora do `LabeledField`.

- [ ] **Step 3:** Conferir imports — `Label` ainda é usado nos blocos de horário/equipe (manter); adicionar `LabeledField`; manter `FieldError` (usado nos blocos). `branch-form-fields` é compartilhado por página (`columns=2`) e drawer (`columns=1`) — a estrutura de `section`/grid não muda, só o miolo de cada campo.

- [ ] **Step 4:** `bun --cwd apps/web check-types` && `bun check apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx` → sem erros.

- [ ] **Step 5: Commit** — `git commit -m "refactor(branches): form-fields usa <LabeledField> (#155)"`

---

## Task 2: Grupo A — user-edit-sheet, shipping-settings, branch-stock-edit-sheet

Três forms simples. Para cada, **ler o arquivo**, migrar cada campo de controle único com `errors.X` seguindo o template, rodar verificação, commitar.

**Files:**
- Modify: `apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx` — campo: `name` (id `user-name`/o que já estiver, `errors.name`).
- Modify: `apps/web/src/app/dashboard/site/settings/_components/shipping-settings-form.tsx` — campos: `originBranchId` (Select, `errors.originBranchId`), `insuranceCapAmount` (`errors.insuranceCapAmount` — se for `MoneyInput`, já aceita `aria-invalid` pós-Task 0).
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` — campos: `newQty` (`errors.newQty`), `reasonNote` (`errors.reasonNote`).

- [ ] **Step 1:** `user-edit-sheet.tsx` — migrar `name`. Verificar (`check-types` + `bun check` no arquivo). Commit: `refactor(users): user-edit-sheet usa <LabeledField> (#155)`.
- [ ] **Step 2:** `shipping-settings-form.tsx` — migrar `originBranchId` e `insuranceCapAmount`. Verificar. Commit: `refactor(site): shipping-settings usa <LabeledField> (#155)`.
- [ ] **Step 3:** `branch-stock-edit-sheet.tsx` — migrar `newQty` e `reasonNote`; preservar o resto do sheet (é um arquivo grande, ~626 linhas — tocar só os 2 campos). Verificar. Commit: `refactor(stock): branch-stock-edit-sheet usa <LabeledField> (#155)`.

---

## Task 3: Grupo A — categories (category-form + attribute-form)

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_components/category-form.tsx`
- Modify: `apps/web/src/app/dashboard/categories/_components/attribute-form.tsx`

### category-form.tsx

| id | label | controle | error key | required | nota |
|---|---|---|---|---|---|
| `category-name` | Nome | `Input` | `errors.name` | sim | remapeia slug→name (lógica `remapSlugToName` intacta) |
| `category-description` | Descrição (opcional) | `Textarea` | `errors.description` | não | — |

- [ ] **Step 1:** Migrar `name` e `description`. **NÃO** mexer em `parentId` (Select sem erro; o `<p>` "Onde fica: {placement}" é hint dinâmico de seção — deixar fora) nem no Switch `isActive`. Não tocar em `remapSlugToName`/`handleSubmit`.

### attribute-form.tsx

| id | label | controle | error key | required | help |
|---|---|---|---|---|---|
| `label` | Rótulo | `Input` | `errors.label` | sim | manter `aria-required="true"` no Input (passar junto do `{...field}`) |
| `inputType` | Tipo de campo | `Select` | — (sem erro) | sim | `HelpTooltip` (body/title) → prop `help` |
| `sortOrder` | Ordem | `Input` (number) | — (sem erro) | não | — |
| `unit` | Unidade | `Input` (condicional `showUnit`) | — (sem erro) | não | — |

- [ ] **Step 2:** Migrar `label`, `inputType`, `sortOrder`, `unit`. Para campos sem erro, usar `<LabeledField>` sem prop `error`. **NÃO** migrar: Switch `isRequired` (layout próprio justify-between), seções `options` e `swatches` (listas — mantêm `<FieldError>` de bloco).

- [ ] **Step 3:** `bun --cwd apps/web check-types` && `bun check` nos dois arquivos → sem erros.

- [ ] **Step 4: Commit** — `git commit -m "refactor(categories): category-form e attribute-form usam <LabeledField> (#155)"`

---

## Task 4: Grupo B — promotions (depende da Task 0)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx`

| id | label | controle | error key | required | hint |
|---|---|---|---|---|---|
| `promo-title` | Título | `Input` | `errors.title` | sim | — |
| `promo-description` | Descrição | `Textarea` | `errors.description` | não | — |
| `promo-discount-value` | Desconto | `DiscountInput` | `errors.discountValue` | sim | — |
| `promo-code` | Código | `Input` | `errors.code` | sim | "Digitado pelo cliente no checkout…" |
| `promo-max-redemptions` | Limite de resgates | `MaskedInput` | `errors.maxRedemptions` | não | "Vazio = ilimitado" |
| `promo-min-order-amount` | Valor mínimo do pedido | `MoneyInput` | `errors.minOrderAmount` | não | "Vazio = sem mínimo" |
| `promo-starts-at` | Início | `DatePicker` | `errors.startsAt` | não | "Vazio = imediato" |
| `promo-ends-at` | Fim | `DatePicker` | `errors.endsAt` | não | "Vazio = sem prazo" |

- [ ] **Step 1:** Migrar os 8 campos acima. Os `<p className="text-muted-foreground text-xs">` que hoje ficam acima do `<FieldError>` viram a prop `hint`. Os controles `DiscountInput`/`MoneyInput`/`DatePicker` recebem `{...field}` (aceitam `aria-invalid` pós-Task 0).

- [ ] **Step 2: `ToolCombobox` aceita `aria-invalid`.** Adicionar `"aria-invalid"?: boolean` à assinatura do componente inline `ToolCombobox` e aplicá-la ao `PopoverTrigger` (o `<button>` do `render`). O campo de ferramentas é **bloco** (`toolIds`), então NÃO vira `<LabeledField>` — mantém `<FieldError>{errors.toolIds}</FieldError>`. Passar `aria-invalid={errors.toolIds ? true : undefined}` ao `ToolCombobox` para o realce/scroll.

- [ ] **Step 3 — NÃO migrar:** `TypeSelector` (RadioGroup de cartões), Switches `active`/`featured` (sem erro de validação). Os `<p>` explicativos das seções permanecem.

- [ ] **Step 4:** `bun --cwd apps/web check-types` && `bun check apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx` → sem erros.

- [ ] **Step 5: Commit** — `git commit -m "refactor(promotions): form-fields usa <LabeledField> + ToolCombobox aria-invalid (#155)"`

---

## Task 5: Grupo C — tools wizard fields

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/logistics-fields.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/fiscal-fields.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/variant-fields.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/spec-fields.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/publish-fields.tsx`

**Invariante crítica:** o wizard navega ao primeiro passo com erro via `firstStepWithError`/`getStepFieldErrors`/`STEP_FIELDS` (`tool-form-steps.ts`). Esse mapeamento é por **chave de erro** (`errors.X`), independente de como o campo é renderizado. Migrar para `<LabeledField>` preserva as chaves → navegação intacta. **Não** alterar `STEP_FIELDS` nem `tool-sections.ts`.

Para cada arquivo: ler, migrar cada campo de controle único com `errors.X` seguindo o template; manter blocos como `<FieldError>` de grupo.

- [ ] **Step 1: `identity-fields.tsx`** — migrar `name` (`errors.name`, id `name`, required) para `<LabeledField>`. **Bloco:** os `<p>{errors.categoryIds}</p>` e `<p>{errors.primaryCategoryId}</p>` (linhas ~160/163) viram `<FieldError>` de bloco (o seletor de categorias é multi-controle, não cabe em `LabeledField`). Trocar os `<p className="text-destructive text-xs">` crus por `<FieldError>`.

- [ ] **Step 2: `logistics-fields.tsx`** — migrar campos nativos (peso/dimensões/etc.) com `errors.X` para `<LabeledField>`. O `{error && <p className="text-destructive text-xs">{error}</p>}` (linha ~172) é erro de nível de seção → trocar por `<FieldError>{error}</FieldError>`.

- [ ] **Step 3: `fiscal-fields.tsx`** — campos fiscais (sem fiação de erro hoje). Migrar cada `Label`+controle para `<LabeledField>` (sem prop `error` onde não houver). Se algum campo tiver `errors.X`, incluir.

- [ ] **Step 4: `variant-fields.tsx`** — migrar campos de controle único com erro; variantes (lista) ficam no editor próprio com `<FieldError>` de bloco.

- [ ] **Step 5: `spec-fields.tsx`** — migrar campos de controle único com erro; o contador "X de 4 preenchidas" e specs dinâmicas (lista) permanecem como estão.

- [ ] **Step 6: `publish-fields.tsx`** — migrar campo `status` (Select) e demais nativos. O `{errors.images && <p className="text-destructive text-xs">{errors.images}</p>}` (linha ~45) é erro de bloco da galeria (`ToolImageGallery` não é controle único) → trocar por `<FieldError>{errors.images}</FieldError>`.

- [ ] **Step 7:** `bun --cwd apps/web check-types` && `bun check` nos 6 arquivos → sem erros.

- [ ] **Step 8: Commit** — `git commit -m "refactor(tools): wizard fields usam <LabeledField> (#155)"`

---

## Task 6: Documentação, verificação consolidada e smoke

**Files:**
- Modify: `apps/web/CLAUDE.md` (seção "Convenções de UX em forms")

- [ ] **Step 1: Atualizar convenção.** Na sub-seção do `<LabeledField>` em `apps/web/CLAUDE.md`, registrar que `MoneyInput`/`DiscountInput`/`DatePicker`/`ToolCombobox` agora aceitam `aria-invalid`, e o caveat: em `DatePicker`/`ToolCombobox` o `aria-invalid` vai num `<button>` popover (marca estado, sem foco de texto; `focusFirstError` rola via `[aria-invalid="true"]`/`[data-error="true"]`).

- [ ] **Step 2: Grep de regressão.**

Run:
```bash
rg '<p[^>]*text-destructive[^>]*>\{errors\.' apps/web/src/app/dashboard
```
Expected: **vazio** (nenhum `<p>` cru de erro de validação). Exceções conhecidas fora de escopo: `social-settings-form.tsx` (mensagem client hardcoded, não `errors.x`) e `attachment-upload-form.tsx` (lista de upload) — não devem aparecer neste grep porque não casam `{errors.`.

- [ ] **Step 3: Suite completa.**

Run:
```bash
bun --cwd apps/web check-types
bun check
bun --cwd apps/web test
```
Expected: tudo verde.

- [ ] **Step 4: Smoke visual** (`/dev-here <porta>` + Monitor para armar o watcher de erro). Submeter inválido em cada área e confirmar: erro **por campo** + foco/scroll no primeiro, **sem caixa no topo**, console limpo, sem regressão visual.

| Área | Rota | Checar |
|---|---|---|
| tools | `/dashboard/tools/new` | wizard navega ao primeiro passo com erro |
| branches | `/dashboard/branches/new` **e** `/dashboard/branches/[id]?edit=1` | página (2 col) + drawer (1 col) |
| promotions | `/dashboard/promotions/new` | custom controls (DiscountInput/MoneyInput/DatePicker) marcam erro + scroll |
| attributes | categoria → drawer de atributo | listas (options/swatches) erro no bloco |
| stock | drawer de ajuste de estoque | newQty/reasonNote |

- [ ] **Step 5: Commit** — `git commit -m "docs(forms): registrar aria-invalid nos custom controls (#155)"`

---

## Notas de execução

- **Ordem:** Task 0 primeiro (dependência da Task 4). Tasks 1, 2, 3, 5 são **independentes** entre si (arquivos disjuntos) — podem rodar em subagents paralelos. Task 4 depende da Task 0. Task 6 por último (precisa de tudo migrado para o grep limpar).
- **Para subagents implementers, instruir no prompt:** "Ler cada arquivo com a tool Read antes de Edit (não herda state do parent). Rodar `bun --cwd apps/web check-types` antes de commitar. Não duplicar `tool-sections.ts`/`STEP_FIELDS`. Seguir o template canônico de `suppliers/_components/supplier-form-fields.tsx`."
- **Hook auto-format:** o `PostToolUse` roda `bun fix` após Write/Edit e pode reordenar props — se um `old_string` de Edit subsequente falhar, re-ler o arquivo.
