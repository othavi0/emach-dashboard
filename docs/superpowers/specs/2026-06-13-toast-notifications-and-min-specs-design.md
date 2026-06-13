# Notificações de erro em toast + mínimo de 4 especificações

> Spec de design. Data: 2026-06-13.
> Duas mudanças independentes, executadas em duas fases (B → A).

## Contexto e motivação

Hoje os forms do dashboard comunicam erro de validação em **três camadas**:

1. **`FormErrorPanel`** — uma caixa vermelha grande no topo do form, listando todos os
   issues com rótulo. Usada em ~12 forms + o wizard de tools + o componente genérico
   `entity-edit-sheet`.
2. **Erro por campo** — texto vermelho `text-xs` abaixo do input + `aria-invalid`.
   Presente apenas em parte dos forms (tools, `attribute-form`, `category-form`).
3. **Toast** (`notify.error`, já é sonner) — hoje mostra só a contagem
   ("N erros — veja detalhes acima"), apontando para a caixa.

A caixa vermelha grande é visualmente agressiva e redundante com o toast. O objetivo é
**eliminar a caixa** e padronizar o feedback em **toast (resumo) + erro por campo**,
mantendo a acessibilidade (WCAG 3.3.1: cada campo com erro precisa de indicação ancorada
nele, não só um toast efêmero).

Separadamente: **especificações técnicas de uma ferramenta nunca foram obrigatórias.**
A raiz técnica é que `buildAttributeValuesSchema` (a função que aplicaria a obrigatoriedade)
está **definida mas nunca é chamada**, e o `toolFormSchema` valida `attributeValues` como
um `z.record` solto, sem nenhum `.min()`. Queremos exigir **no mínimo 4 specs preenchidas**
para ativar uma ferramenta.

### Dados reais do banco (2026-06-13, projeto `emach-ferramentas`)

- 18 categorias, 21 atributos, 12 ferramentas.
- Com herança (categoria + ancestrais), **11 das 18 categorias** têm 4+ atributos
  disponíveis; **7 têm menos de 4** (nessas, chega-se a 4 anexando "extras" do catálogo).
- **11 das 12 ferramentas atuais têm menos de 4 specs** (3 têm 1, 6 têm 2, 2 têm 3,
  1 tem 9). Por isso a regra **não pode** ser retroativa a qualquer save — só morde ao
  ativar.

## Decisões tomadas

| Tema | Decisão |
| --- | --- |
| O que migrar p/ toast | Remover **só a caixa do topo** (`FormErrorPanel`). Manter erro por campo. Toast resume + form rola/foca no 1º campo com erro. |
| Escopo de forms | **Todos** os forms do dashboard + `entity-edit-sheet`. Padrão único. |
| Forms sem erro por campo | branches, suppliers, customers, shipping-settings (+ edit-sheets) **ganham** erro por campo. |
| Quando exigir 4 specs | **Só ao ativar** (`status === "active"`), espelhando a regra das 3 imagens (`MIN_IMAGES_ACTIVE`). |
| O que conta como spec | Atributo **vinculado E com valor preenchido** (não só marcado). |
| Categorias com <4 atributos | Exigir **4 fixo**; nessas categorias o usuário anexa atributos "extras" do catálogo. |
| Contador de specs | Incluir "X de 4 preenchidas" no editor de specs, pra guiar antes do erro. |
| `isRequired` individual | **Não religar agora** — incremento futuro (ver seção própria). |
| Ordem de execução | **Fase B (4 specs) primeiro**, depois **Fase A (notificações)**. PRs separados. |

---

## Fase B — Mínimo de 4 especificações ao ativar

Menor, fechada e independente. Entregue primeiro.

### B1. Constante

`MIN_SPECS_ACTIVE = 4` em `tool-schema.ts`, ao lado de `MIN_IMAGES_ACTIVE`.

### B2. Helper `countFilledSpecs`

Em `tool-schema.ts`:

```ts
export function countFilledSpecs(
  attributeValues: Record<string, AttributeValueInput>,
  assignments: string[],
): number
```

Conta atributos que estão **vinculados** (`slug` em `assignments`) **e com valor real**.
"Valor real" por forma de input:
- `valueText`: string não-vazia após `trim`.
- `valueNumeric`: número definido e não-`NaN`.
- `valueBool`: booleano definido (`true` ou `false` contam — o usuário tomou uma decisão).
- `valueNumericMax`: irrelevante isoladamente (faz parte de `numeric_range`; basta `valueNumeric` definido).

Um `slug` conta **uma vez** se tiver qualquer um desses valores satisfeito.

### B3. Validação no `superRefine`

No `toolFormSchema.superRefine`, espelhando a regra de imagens:

```ts
if (data.status === "active"
    && countFilledSpecs(data.attributeValues, data.attributeAssignments) < MIN_SPECS_ACTIVE) {
  ctx.addIssue({
    code: "custom",
    path: ["attributeValues"],
    message: `Ativar exige ao menos ${MIN_SPECS_ACTIVE} especificações preenchidas. `
      + `Se a categoria tiver poucos atributos, anexe atributos extras do catálogo.`,
  });
}
```

O `path: ["attributeValues"]` já está mapeado em `STEP_FIELDS.specs`, então o erro se
associa ao passo "Especificações" no wizard.

### B4. Contador no editor de specs

Em `spec-fields.tsx`, exibir um contador discreto **"X de 4 preenchidas"** próximo ao
título "Valores". Calcula via `countFilledSpecs` sobre os valores atuais. Verde/neutro
quando ≥ 4, neutro quando < 4 (não é erro até tentar ativar). É orientação, não alarme.

### B5. Testes (Fase B)

- `countFilledSpecs`: conta corretamente por tipo; ignora vinculados sem valor; ignora
  valores sem vínculo.
- `toolFormSchema`: rejeita `status: "active"` com < 4 specs preenchidas; **aceita**
  `status: "draft"` com 0 specs; aceita `active` com ≥ 4.

---

## Fase A — Migração de notificações de erro

Mecânica e ampla. Toca ~12 forms + 3 edit-sheets + o sheet genérico.

### A1. Novo módulo `src/lib/form-errors.ts`

Centraliza a lógica hoje espalhada em `form-error-panel.tsx` e duplicada em cada form:

- `zodIssuesToFieldErrors<T>(error, labels?)` → `Partial<Record<keyof T, string>>`.
  Primeiro erro por campo top-level (generaliza o bloco que `tool-submit.ts` já faz).
- `errorToastSummary(count)` → `"N erro(s) — corrija os campos destacados"` (substitui
  "veja detalhes acima", que não faz sentido sem a caixa).
- `focusFirstError(container?)` → em `requestAnimationFrame`, localiza o primeiro
  `[aria-invalid="true"]`, faz `scrollIntoView({ block: "center" })` + `focus()`.

### A2. Hook `useFormErrors<T>()`

Encapsula `fieldErrors` state + `reportErrors(zodError)` que: seta os field errors,
dispara `notify.error(errorToastSummary(count))` e chama `focusFirstError()`. Cada form
troca seu bloco de tratamento de erro por este hook.

### A3. Forms que já têm erro por campo

tools (via `use-tool-submit`/`tool-submit`), `attribute-form`, `category-form`: remover
`FormErrorPanel` / `issues` / `setIssues`; usar `reportErrors`. O foco vai ao primeiro
`[aria-invalid]`.

### A4. Forms sem erro por campo (o grosso do trabalho)

branches, suppliers, customers, shipping-settings: adicionar `errors` aos field components,
`aria-invalid` + `<p className="text-destructive text-xs">` por campo, no padrão de
`identity-fields.tsx`. Cada um tem seu schema próprio; mapear via `zodIssuesToFieldErrors`.

### A5. `entity-edit-sheet.tsx` e edit-sheets

Remover o bloco do `FormErrorPanel` do `entity-edit-sheet`. Os sheets que o consomem
(`branch-edit-sheet`, `supplier-edit-sheet`, `user-edit-sheet`) migram para erro por campo
+ toast. **A confirmar no plano:** como cada sheet passa `issues` hoje e qual a forma mais
limpa de injetar `errors` por campo dentro do sheet.

### A6. Wizard de tools (caso especial)

Ao submeter ou avançar (`next()`) com erro: além do toast + foco, **navegar até o primeiro
passo com erro** (derivar de `STEP_FIELDS` qual passo contém o primeiro issue). `next()` e
`submit()` deixam de usar `setIssues`. Remover `FormErrorPanel` do `tool-wizard.tsx`.

### A7. Limpeza

- Deletar `form-error-panel.tsx` quando nenhum import restar (migrar `zodIssuesToFormIssues`
  → `form-errors.ts` se ainda houver uso; senão remover).
- Atualizar a regra **"Painel de erros no topo"** em `apps/web/CLAUDE.md` para refletir o
  novo padrão (toast resumo + erro por campo + foco).

### A8. Testes (Fase A)

- `zodIssuesToFieldErrors`: mapeia primeiro erro por campo; respeita `labels`.
- Smoke no browser (porta 3008): tool (toast + foco; ativar com <4 specs navega ao passo
  de specs; erro em outro passo navega até ele); branch-form (erro por campo, sem caixa).

---

## Incremento futuro: `isRequired` individual

`buildAttributeValuesSchema` aplica o `isRequired` de cada `AttributeDefinition`, mas está
órfã (nunca chamada) e `is_required` no banco é `default false` — ninguém configurou ainda.
Religar agora dispararia obrigatoriedades nunca testadas. Fica como trabalho separado,
**após** a regra dos 4 estar rodando, e exige antes decidir quais atributos devem ser
obrigatórios por categoria.

## Verificação geral

- `bun check-types` + `bun check` (ultracite) antes de cada PR.
- Smoke run-time na porta 3008 conforme A8 e B (schema não pega SQL/runtime).
- Suíte vitest verde (`bun --cwd apps/web test`).
