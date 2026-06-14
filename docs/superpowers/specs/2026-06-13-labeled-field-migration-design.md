# Migração de todos os forms para `<LabeledField>` (#155)

> Spec de design. Issue #155. Bloqueado por #154 (componente `<LabeledField>`, já merged — PR #160).
> Data: 2026-06-13.

## Objetivo

Substituir a fiação manual `Label` + `aria-invalid` no controle + `<FieldError>` abaixo pela
unidade render-prop `<LabeledField>` (`@/components/labeled-field`, criada em #154) em **todos os
forms restantes** do dashboard.

Regra de altitude: ao fim, nenhum campo de **controle único** tem `Label`/`aria-invalid`/`FieldError`
soltos — o componente garante os três. Blocos aninhados (listas, arrays, controles não-únicos)
mantêm `<FieldError>` no nível do grupo.

Princípio: o padrão hoje é hand-wired ~25 vezes ao longo de ~12 forms, sem barreira estrutural — um
autor futuro pode esquecer o `aria-invalid` (perde realce) ou o `<FieldError>` (perde a âncora de
scroll do `focusFirstError`). O `<LabeledField>` torna o esquecimento difícil; esta migração o
propaga.

## Dois padrões de migração

### (a) Campo de controle único → `<LabeledField>`

```tsx
<LabeledField id="branch-name" label="Nome" required error={errors.name}>
  {(field) => (
    <Input
      {...field}
      value={values.name ?? ""}
      onChange={(e) => onPatch({ name: e.target.value })}
    />
  )}
</LabeledField>
```

Regras:
- `{...field}` vem **antes** dos outros props do controle.
- Nunca repassar `id` manual depois do spread (último prop vence → descasa do `htmlFor` do Label).
- `required` reproduz o ` *` (`text-destructive`) que os forms já fazem manualmente.
- `help` recebe `<HelpTooltip>` quando o campo tem ajuda contextual (aplica `flex items-center gap-1.5` no Label).
- `hint` recebe texto auxiliar persistente (ex: "Vazio = ilimitado").

### (b) Bloco / lista / controle não-único → `<FieldError>` no nível do grupo

Sem `<LabeledField>`. Casos:
- `businessHours`, `cepRanges` (branches) — blocos aninhados.
- `options`, `swatches` (attribute-form) — listas.
- `images` (publish-fields) — `ToolImageGallery` não é controle único.
- `variants` (variants-editor) — erro de nível de seção.
- Refine cross-field (chave `_form`) — `<FieldError>{errors._form}</FieldError>` permanece onde já está.

## Custom controls a estender (decisão: estender todos)

| Controle | Repassa `aria-invalid` hoje | Mudança | Arquivo |
|---|---|---|---|
| `MaskedInput` | ✅ (`...rest` → Input) | nenhuma | — |
| `CepInput`, `UfSelect` | ✅ (PR #153) | nenhuma | — |
| `MoneyInput` | ❌ | add `"aria-invalid"?: boolean` na interface → passa ao `AffixInput` (que já faz `{...rest}` no `<input>`) | `apps/web/src/components/money-input.tsx` |
| `DiscountInput` | ❌ | idem `MoneyInput` | `apps/web/src/components/discount-input.tsx` |
| `DatePicker` | ❌ | add `"aria-invalid"?: boolean` → repassa ao `<Button>` trigger | `packages/ui/src/components/date-picker.tsx` (pacote shared interno) |
| `ToolCombobox` | ❌ | add `"aria-invalid"?: boolean` → `PopoverTrigger` button | inline em `promotions/_components/promotion-form-fields.tsx` |

### Caveat documentado

Em `DatePicker` e `ToolCombobox` o `aria-invalid` é aplicado num `<button>` popover: marca o estado
de inválido mas **não dá foco de texto** como um `<input>`. O `focusFirstError` ainda rola até o
elemento via seletor `[aria-invalid="true"]` (ou o fallback `[data-error="true"]` do `<FieldError>`).
Anotar isso na seção "Convenções de UX em forms" do `apps/web/CLAUDE.md`.

`DatePicker` vive em `@emach/ui` (pacote interno do monorepo dashboard, não o app ecommerce externo)
— estender é seguro; verificar outros usos do `DatePicker` no repo para não quebrar assinatura
(prop é opcional, então retrocompatível).

## Inventário de forms

### Grupo A — planos (mecânico, igual ao piloto suppliers)

| Arquivo | Campos `<LabeledField>` | Blocos `<FieldError>` |
|---|---|---|
| `branches/_components/branch-form-fields.tsx` | name, status, phone, cep, street, number, complement, neighborhood, city, state | businessHours, cepRanges |
| `users/_components/user-edit-sheet.tsx` | name | — |
| `site/settings/_components/shipping-settings-form.tsx` | originBranchId, insuranceCapAmount | — |
| `categories/_components/category-form.tsx` | name, description | — (erro de slug remapeia p/ Nome — manter) |
| `categories/_components/attribute-form.tsx` | label, unit, sortOrder | options, swatches |
| `stock/_components/branch-stock-edit-sheet.tsx` | newQty, reasonNote | — |

### Grupo B — promotions (depende da extensão dos custom controls)

`promotions/_components/promotion-form-fields.tsx`:
- `<LabeledField>`: title (Input), description (Textarea), discountValue (DiscountInput),
  code (Input), maxRedemptions (MaskedInput), minOrderAmount (MoneyInput),
  startsAt/endsAt (DatePicker).
- Bloco `<FieldError>`: toolIds (ToolCombobox).
- `TypeSelector` (RadioGroup de cartões) e os Switches (active/featured) não têm erro de validação —
  ficam como estão.

### Grupo C — tools wizard (manter navegação por passo `firstStepWithError` intacta)

| Arquivo | `<LabeledField>` | Bloco `<FieldError>` |
|---|---|---|
| `tools/_components/fields/identity-fields.tsx` | name | categoryIds, primaryCategoryId |
| `tools/_components/fields/logistics-fields.tsx` | campos nativos do passo | erro de seção existente |
| `tools/_components/fields/fiscal-fields.tsx` | migra só o Label (sem fiação de erro hoje) | — |
| `tools/_components/fields/variant-fields.tsx` | campos nativos | listas/variantes |
| `tools/_components/fields/spec-fields.tsx` | campos nativos | specs dinâmicas |
| `tools/_components/fields/publish-fields.tsx` | status e demais nativos | images (`<p>` cru → `<FieldError>`) |

### Fora de escopo

- `site/settings/_components/social-settings-form.tsx` — `<p>` é mensagem client-side hardcoded
  ("Link inválido…"), não `errors.x` de schema; input já tem `aria-invalid` + `data-error`.
- `orders/[id]/_components/attachment-upload-form.tsx` — `errors` é array de falhas de upload
  (`<ul>`), não validação de campo.

## Nuances visuais (acceptance: "sem mudança perceptível")

- **gap:** `<LabeledField>` é hard-coded `flex flex-col gap-1.5`. Forms que hoje usam `gap-2`
  (ex: promotions) uniformizam para `gap-1.5` — diferença de 2px, imperceptível, padroniza.
- **hint:** a prop `hint` renderiza **após** o `<FieldError>`. No caso comum (sem erro) fica logo
  abaixo do controle, idêntico ao atual. Com erro, fica abaixo da mensagem — aceitável.
- **help:** `<HelpTooltip>` no Label passa via prop `help`.
- **asterisco:** `required` reproduz o ` *` atual exatamente.

## Verificação

- `bun --cwd apps/web check-types`
- `bun check` (ultracite — pega regras de lint que o tsc não pega: `useAwait`, `noNestedTernary`, etc.)
- `bun --cwd apps/web test` (vitest)
- Grep de regressão: `rg '<p[^>]*text-destructive[^>]*>\{errors\.' apps/web/src` → vazio.
- Smoke visual via `/dev-here <porta>` + Monitor, por área:
  - **tools** — wizard navega ao primeiro passo com erro (`firstStepWithError`).
  - **branches** — página (`/new`) + drawer (`?edit=1`).
  - **promotions** — custom controls marcam erro + scroll.
  - **attributes** — listas (options/swatches) no nível do bloco.
  - **stock** — drawer de ajuste.
  - Critério: submeter inválido → erro por campo + foco/scroll no primeiro, sem caixa no topo, console limpo, sem regressão visual.

## Abordagem de execução (detalhar no plano)

Híbrido:
1. Estender os 4 custom controls (`MoneyInput`, `DiscountInput`, `DatePicker`, `ToolCombobox`) no
   main loop — é dependência do Grupo B e o `DatePicker` é pacote shared (exige cuidado).
2. Os 3 grupos de forms são **independentes** (arquivos disjuntos) → candidatos a subagents
   paralelos. Instruir cada implementer: ler cada arquivo antes de editar (não herda state do
   parent), rodar `check-types` antes de finalizar, não duplicar `tool-sections.ts`/schema do wizard.
3. Atualizar a convenção em `apps/web/CLAUDE.md` (caveat do `aria-invalid` em button popover).
4. Verificação consolidada + smoke por área no main loop.

## Acceptance criteria (do issue)

- [ ] Todos os forms listados usam `<LabeledField>` (ou `<FieldError>` no nível do grupo para listas/blocos).
- [ ] Zero `<p className="text-destructive …">{errors.x}</p>` cru de validação (grep limpo).
- [ ] Nenhum input com `errors.x` sem `aria-invalid` (onde o controle suporta).
- [ ] Sem mudança visual perceptível.
- [ ] `check-types`, `bun check`, testes verdes.
- [ ] Smoke por área: tools, branches, promotions, attributes, stock.
