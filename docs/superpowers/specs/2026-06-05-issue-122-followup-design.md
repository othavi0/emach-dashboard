# Spec — #122: Follow-up do redesign do form de ferramenta

> Issue: #122 (relacionada: #121). Branch: `issue-122`.
> Escopo aprovado: **seções 1 + 2 + 3** (issue inteira).

## Contexto

O redesign do form de ferramenta (#121) introduziu o `HelpTooltip` genérico e
quebrou o monólito `tool-form` em `ToolWizard` (criar) + `ToolEditView` (editar).
O code-review do #121 surfaçou pendências de retrofit, dedup e refinamentos.
Esta spec fecha as três seções.

## Decisões (com porquê)

### Auto-reset de atributos ao trocar categoria principal (2a) — **MANTER, sem código**

`toggleCategory` (`fields/identity-fields.tsx`) **não** reseta
`attributeAssignments` ao mudar a categoria principal em modo create. Confirmado
em `attribute-assignments-editor.tsx:135-137`: atributos da categoria antiga que
deixaram de ser sugeridos aparecem como `Badge` **`extra · não herdado`**
(`variant="outline"`) e continuam marcados — logo **submetem**.

**Decisão:** manter o comportamento atual (escolha consciente do #121). Não
re-adicionar o `useEffect` de reset.

**Porquê:** trocar a categoria não destrói trabalho do usuário (atributos já
preenchidos sobrevivem), e o badge `extra · não herdado` torna o estado órfão
visível e removível (botão `X`). Um reset automático surpreenderia quem troca a
categoria sem querer perder os atributos. O fluxo de `edit` já tem o caminho
explícito de confirmação (`updateTool` → `warning: "orphan_attributes"`) para o
caso destrutivo; no create, o badge basta.

## A. Retrofit `HelpTooltip` (seção 1)

**Estratégia de colocação:** `ⓘ` dentro do `<Label>` via
`className="flex items-center gap-1.5"` — mesmo padrão de
`fields/identity-fields.tsx:81`. Converter `<p>` verboso em tooltip onde
declutterar; **manter visível** caveat comportamental crítico. `text` curto pra
desambiguar; rich (`title+body+example`) onde há exemplo.

| Form | Campo | Tipo | Copy |
|---|---|---|---|
| Branches | Horário (SectionHeader) | `text` | "Exibido na página da filial no site. Domingo é sempre fechado." (substitui o `<p>` "Domingos são tratados como fechado.") |
| Branches | Responsável (Label) | `text` | "Usuário responsável por esta filial." |
| Branches | Faixas de CEP | — | **mantém o `<p>` atual** — o caveat "não restringe pedidos" é gotcha que deve ficar visível |
| Suppliers | CNPJ (Label) | `rich` | título "CNPJ" · body "Só os dígitos são salvos; a máscara é visual." · example "12.345.678/0001-90 → 12345678000190" (substitui o `<p>` "Só dígitos são salvos.") |
| Suppliers | Website (Label) | `text` | "URL completa, começando com https://." |
| Categories/attributes | Tipo de campo (Label) | `rich` | título "Tipo de campo" · body "Texto e número são livres. Lista (select) exige opções; cor exige swatches; faixa numérica pede unidade." |
| Categories/attributes | Slug (Label, create) | `text` | "Gerado do rótulo; vira a chave técnica do atributo." — mantém o warning visível no modo edit |
| Categories/attributes | Opções (header) | `text` | "Cada opção tem rótulo visível e um slug técnico (gerado do rótulo)." |

Copy é ajustável na implementação; o que é fixo é a estratégia (placement + text
vs rich + manter caveats visíveis).

## B. Dedup wizard ↔ edit-view (2b)

Hoje `STEP_COMPONENT` (`tool-wizard.tsx:23-33`) e `SECTION`
(`tool-edit-view.tsx:22-29`) são mapas idênticos `ToolStepId → Component`, e
`submit()` é ~95% espelhado (difere só em `"create"`/`"edit"` e no texto do
toast de sucesso). Risco de drift ao adicionar campo/passo.

- **`tool-sections.ts`** (novo): exporta
  `TOOL_SECTION_COMPONENTS: Record<ToolStepId, ComponentType<ToolFieldGroupProps>>`.
  Wizard e edit-view importam; removem os mapas locais.
- **`use-tool-submit.ts`** (novo): hook
  `useToolSubmit({ mode, values, setErrors })` encapsula parse → `setErrors` +
  `setIssues` → toast de contagem → scroll pro painel → `startTransition` +
  `persistTool` → toast de sucesso (texto por `mode`) → `router.push("/dashboard/tools")` + `refresh()`.
  Retorna `{ submit, isPending, issues, errorRef }`.
- O wizard mantém **só** o estado do stepper (`active`, `next`, `stepDone`) e
  consome `submit`/`isPending`/`issues`/`errorRef` do hook.

## C. Refinamentos (seção 3)

- **3a — `safeParse` 6×/render:** chamar `toolFormSchema.safeParse(values)` **uma
  vez** no corpo do `ToolWizard` (React Compiler memoiza sobre `values`) e passar
  o resultado a uma função pura `filterStepIssues(parsed, stepId)`. Sem `useMemo`
  manual (respeita o ban). Refatorar `getStepIssues` em `tool-form-steps.ts` para
  separar o parse da filtragem por step.
- **3c — stale closure em `toggleCategory`:** tornar `patch` de
  `tool-form-state.ts` capaz de aceitar
  `Partial<ToolFormState> | ((prev: ToolFormState) => Partial<ToolFormState>)`.
  `toggleCategory` passa a derivar `categoryIds`/`primaryCategoryId` da forma
  funcional, eliminando o drop da 1ª seleção em dois cliques no mesmo frame.
- **3d — exaustividade de `STEP_FIELDS`:** trocar a anotação explícita por
  `satisfies Record<ToolStepId, (keyof ToolFormValues)[]>` (preserva os literais)
  e adicionar assert type-level:
  `type _Uncovered = Exclude<keyof ToolFormValues, (typeof STEP_FIELDS)[ToolStepId][number]>`
  com `const _exhaustive: _Uncovered extends never ? true : ['faltam em STEP_FIELDS:', _Uncovered] = true;`.
  Um campo `required` novo no schema que não entre em `STEP_FIELDS` passa a
  quebrar o build.
- **3b — Esc no HoverCard (WCAG 1.4.13):** verificar nas docs do `@base-ui/react`
  se `PreviewCard` fecha no Esc. O trigger já é `<button>` (focável ✓). Se não
  fechar por padrão, adicionar handling (ou trocar o primitivo do tooltip rico).

## Verificação

- `bun check` (ultracite/biome — pega `useAwait`, nested-ternary etc.) + `bun check-types`.
- Smoke visual (CLAUDE.md: `check-types` não pega fronteira RSC/client):
  - 3 rotas de form (branches, suppliers, categories) — tooltips aparecem, rico fecha no Esc.
  - Wizard de tool (`/new`) e edit (`/edit`) pós-refactor B — submit create e edit funcionam, painel de erros + scroll preservados.

## Documentação pós-implementação

Registrar no CLAUDE.md do projeto (raiz e/ou `apps/web/CLAUDE.md`):
- Decisão 2a (auto-reset mantido + porquê + referência ao badge).
- `HelpTooltip` como padrão de ajuda contextual em forms (placement + text vs rich).
- `TOOL_SECTION_COMPONENTS` + `useToolSubmit` como fonte única wizard/edit.
