# Redesign do form de ferramenta — wizard + rail + ajuda contextual

> Data: 2026-06-05 · Status: aprovado, pronto pra plano de implementação
> Escopo: `apps/web/src/app/dashboard/tools` (criar/editar) + novo `components/help-tooltip.tsx`

## Problema

`tools/_components/tool-form.tsx` é um client component monolítico (~870 linhas, já marcado com `noExcessiveCognitiveComplexity`) que mistura estado, validação e a renderização de **8 seções (~30 campos)** num scroll vertical único, usado igual em criar e editar. Sintomas:

- **Sem disclosure progressivo** — campos fiscais raríssimos (NCM/CEST/HS) têm o mesmo peso visual que o nome.
- **Redundância na categorização** — a árvore aparece como checkboxes **e** de novo como radio pra escolher a principal.
- **Sem ajuda contextual** — nada explica CEST, HS Code, "variante padrão", "modelo da fábrica" vs "comercial".
- **Validação só no fim** — 30+ campos, erro só ao submeter tudo.

Auditoria comparativa: **filiais, fornecedores e categorias já seguem** o padrão `*-form-fields` (apresentacional, com prop `columns`) + `*-form` (página/criar) + `*-edit-sheet` (drawer/editar). **Tools é o único outlier** — nunca foi refatorado pra esse padrão.

## Decisões (todas confirmadas com o usuário)

| Eixo | Decisão |
|------|---------|
| Layout | Híbrido: **wizard por passos** pra criar, **página única + rail de seções** pra editar (comportamentos distintos) |
| Passos | **6 granulares** (ver abaixo) |
| Ajuda | **HelpTooltip híbrido** — `text` curto ou `title+body+example` rico, autor decide por campo |
| Navegação do wizard | **Livre** — clica em qualquer passo; "Próximo" valida o passo atual e marca check verde; "Criar" valida tudo no fim |
| Rascunho | **Exige completar** — sem salvar-parcial; zero mudança de schema/DB |

## Os 6 passos (criar)

1. **Identidade & categoria** — nome, descrição (markdown), categorias, categoria principal, fornecedor. *Essencial.*
2. **Variantes & preço** — SKUs, voltagem, preço, custo, variante padrão. *Essencial.*
3. **Especificações técnicas** — atributos da categoria principal + valores. *Depende do passo 1*; estado vazio explicativo se a categoria não tem atributos.
4. **Logística & frete** — peso, dimensões, potência + alerta/frete de item pesado. *Essencial.* (É aqui que "o peso" passa a morar, com o porquê explicado.)
5. **Fiscal** — modelo comercial, modelo da fábrica, marca, NCM, CEST, HS Code. *Opcional, pulável.*
6. **Imagens & publicação** — galeria (capa), status, visível no site. *Essencial.*

Dependência dura: **categoria principal (passo 1) precede especificações (passo 3)** — os atributos disponíveis derivam da categoria.

## Arquitetura

```
tools/_components/
  tool-schema.ts          REUSO   + adicionar STEP_FIELDS (passo → chaves de campo)
  tool-form-state.ts      NOVO    hook: values + patch + validateStep(n)
  fields/
    identity-fields.tsx   NOVO    passo 1 (+ categorização sem redundância)
    variant-fields.tsx    NOVO    passo 2 (envolve VariantsEditor existente)
    spec-fields.tsx       NOVO    passo 3 (envolve AttributeAssignmentsEditor + DynamicSpecsEditor)
    logistics-fields.tsx  NOVO    passo 4
    fiscal-fields.tsx     NOVO    passo 5
    publish-fields.tsx    NOVO    passo 6 (envolve ToolImageGallery)
  tool-wizard.tsx         NOVO    CRIAR: stepper + nav livre + checks + FormErrorPanel
  tool-edit-view.tsx      NOVO    EDITAR: página única + rail de seções (scrollspy)
  tool-form.tsx           REMOVER após migração de /new e /[id]/edit
components/
  help-tooltip.tsx        NOVO    HelpTooltip híbrido (sobre Tooltip/HoverCard existentes)
```

- `new/page.tsx` passa a renderizar `<ToolWizard>`; `[id]/edit/page.tsx` renderiza `<ToolEditView>`. Ambos reusam os mesmos componentes de `fields/` e o `tool-form-state`.
- Estado e validação centralizados em `tool-form-state.ts` (padrão `values` + `onPatch`, igual `BranchFormFields`).

## Validação por passo

- `STEP_FIELDS: Record<StepId, (keyof ToolFormValues)[]>` mapeia cada passo às suas chaves.
- `validateStep(n)` roda `toolFormSchema.safeParse(values)` e filtra `issues` por `path[0] ∈ STEP_FIELDS[n]` — reaproveita o schema final inteiro, sem duplicar regras. Passo válido → check verde.
- "Criar ferramenta" (passo 6) roda o parse completo; erros no `FormErrorPanel` (padrão do sistema) com link/scroll pro passo do issue.
- Regras cross-field do `superRefine` (ex: "exatamente 1 variante padrão", "ativo exige 3 imagens") rodam na validação final; quando o `path` cai num passo, o check daquele passo reflete.

## HelpTooltip

```
<HelpTooltip text="..." />                          // tooltip curto (1 frase)
<HelpTooltip title="..." body="..." example="..." /> // hovercard rico
```

- Construído sobre `@emach/ui/components/tooltip` (curto) e `hover-card` (rico) — ambos já existem.
- Gatilho: ícone `?`/`ⓘ` ao lado do `<Label>`, `cursor-help`, contraste AAA. Acessível por teclado (foco + Esc), respeita `prefers-reduced-motion`.
- Cobertura inicial:
  - **Curto:** modelo comercial vs fábrica, variante padrão, categoria principal, visível no site, custo, status.
  - **Rico (com exemplo):** NCM, CEST, HS Code, frete de item pesado, peso/dimensões (por que importam pro frete), descrição (markdown).

## Categorização sem redundância

Substituir "árvore de checkboxes + radio separado de principal" por **um controle só**: árvore com checkbox por categoria + toggle "★ principal" inline na(s) categoria(s) marcada(s). Selecionar e definir principal no mesmo lugar.

## Edição

`ToolEditView` renderiza **todos** os 6 grupos de `fields/` numa página única (sem passos), com rail vertical fixo à esquerda (scrollspy destaca a seção visível ao rolar). Mesmos componentes, mesma validação final; sem stepper.

## Fora de escopo (consciente)

- **Filiais/fornecedores/categorias não são redesenhados** — já seguem o padrão e estão bons. `HelpTooltip` nasce genérico e será **retrofitado neles depois** (follow-up acordado com o usuário, registrado fora do repo).
- Sem salvar-rascunho-parcial; sem mudança de `toolFormSchema`, schema Drizzle ou DB.
- Sem religar gates role-based (ADR-0012) — server actions de criar/editar tool seguem como estão.

## Verificação

- `bun check-types` + `bun check` (ultracite) verdes.
- **Smoke visual obrigatório** (check-types não pega hook client em RSC nem SQL em template): `bun dev:web`, visitar `/dashboard/tools/new` (percorrer os 6 passos, testar nav livre + checks + validação por passo + HelpTooltip por hover e teclado) e `/dashboard/tools/[id]/edit` (rail + scrollspy + salvar). Confirmar criação e edição reais persistindo no banco.
- `/code-review` no diff final.
```
