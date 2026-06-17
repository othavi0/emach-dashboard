# Wizard de criação de ferramenta — rascunho persistente + validação que segue a navegação

**Data:** 2026-06-17
**Status:** Design aprovado, pronto para plano
**Escopo:** Apenas o wizard de **criação** (`/dashboard/tools/new` → `ToolWizard`). O modo edição (`ToolEditView`) fica fora.

## Problema

Em teste com usuários, dois atritos no fluxo de criação de ferramenta:

1. **Perda de rascunho ao sair.** O estado do wizard vive só na memória do React (`tool-form-state.ts`, um `useState` — sem react-hook-form, sem autosave, sem `localStorage`). Qualquer saída da página zera tudo. O caso concreto: a pessoa está num passo (ex: Variantes), percebe que precisa de uma **categoria ou atributo que ainda não existe**, mas a aba "Identidade & categoria" só **lista** categorias existentes — não há criação inline. Para criar a entidade, precisa ir a `/dashboard/categories/new` (ou `/categories/[id]/edit` para atributos), o que desmonta o wizard e **perde o trabalho**.

2. **Validação só "acontece" no botão que ninguém usa.** Hoje o botão **"Próximo"** (`ToolWizard.next()`) valida o passo atual e **bloqueia** o avanço se houver erro. Mas **"Voltar" e o clique direto na aba não validam nada**. Como os usuários navegam clicando nas abas, a validação por passo nunca dispara, e o primeiro feedback de erro só vem ao clicar **"Criar ferramenta"**. Bloquear a navegação livre entre abas **não** é desejado.

### Descoberta-chave

A validação não está faltando — está **amarrada a um gesto** (clicar "Próximo"). O wizard já roda `toolFormSchema.safeParse(values)` **a cada render** para desenhar o ✓ verde de passo concluído (`tool-wizard.tsx:57` `parsed`, `stepDone`/`stepHasErrors`). Logo, dá para fazer o feedback de validação **seguir a navegação** sem custo adicional de parse e sem bloquear.

## Feature A — Rascunho persistente

| Decisão | Detalhe |
|---|---|
| **Armazenamento** | `localStorage`, chave versionada `emach:tool-draft:new:v1`. O sufixo de versão invalida rascunhos de um shape antigo se o schema do form mudar. Persistir em banco foi descartado (push-only; cross-device é raro no meio de uma criação). |
| **Hook isolado** | Novo `use-tool-draft.ts` exportando `useToolDraft({ values, setValues })`, com responsabilidade única (autosave + restore + descarte). Chamado **só no `ToolWizard`** — **não** dentro de `useToolFormState`, que é compartilhado com o edit. |
| **Autosave** | `useEffect` com debounce ~500ms sobre `values`; grava `{ savedAt: <epoch ms>, data: ToolFormState }` serializado. Pular gravação enquanto `values` for igual a `EMPTY_TOOL_VALUES` (não criar rascunho de form intocado). |
| **Restore** | Lido em `useEffect` **pós-mount** (NÃO no inicializador do `useState`). É o que evita o hydration mismatch — mesmo Client Components fazem SSR no primeiro paint, e o server não tem `localStorage`. Se houver rascunho válido, não-expirado e parseável → `setValues(draft.data)` + sinaliza `recovered = true`. |
| **Expiração** | **24 horas**: se `Date.now() - savedAt > 24h`, ignora e limpa a chave (rascunho é para retomar no mesmo dia/sessão). |
| **Faixa de recuperação** | Novo componente `draft-recovered-banner.tsx`: faixa discreta no topo do wizard — *"Rascunho recuperado · Descartar"*. Visível apenas quando `recovered === true`. Restaura sozinho (sem dialog); descartar é 1 clique. Estilo segue o sistema visual (`DESIGN.md`); não usar caixa de erro/alerta agressiva. |
| **Descartar** | Limpa a chave do `localStorage` + `setValues(EMPTY_TOOL_VALUES)` + esconde a faixa + zera badges/`visited`. |
| **Limpeza automática** | (a) No submit com sucesso — enganchar no `onSuccess`/retorno `{ ok: true }` do `useToolSubmit` (`use-tool-submit.ts`); (b) por expiração no restore. |

**Hydration:** ler `localStorage` somente em `useEffect`; o primeiro render é sempre o estado vazio/`defaultValues`, igual no server e no client.

**Guard de navegação (`<Link onNavigate>`):** o Next 16 oferece `onNavigate` + padrão `useNavigationBlocker` para avisar de alterações não salvas. **Dispensado** — com o rascunho persistido, sair e voltar restaura; bloquear navegação seria fricção sem ganho.

## Feature B — Validação que segue a navegação

- **Estado novo `visited: Set<ToolStepId>`** em `ToolWizard`. Ao **deixar** um passo — por clique na aba, "Voltar" OU "Próximo" — o passo que sai entra em `visited`. (Centralizar a troca de passo numa função `goTo(index)` que primeiro registra `visited.add(passoAtual)` e depois `setActive(index)`.)
- **`next()` deixa de bloquear.** Remove o `if (stepErrors) { ...; return }` (`tool-wizard.tsx:64-70`). "Próximo"/"Voltar" viram navegação pura; o último passo continua sendo "Criar ferramenta".
- **Indicador por aba** (reusa o `parsed` já existente):
  - **não visitada** → número neutro (sem "mar de vermelho" ao abrir o form);
  - **visitada e válida** → ✓ verde (comportamento atual);
  - **visitada com erro** → ⚠️ vermelho **+ contagem de pendências** (ícone lucide `CircleAlert`/`AlertCircle`, cor `text-destructive`).
  - `fiscal` (`optional: true`) nunca fica vermelho por estar vazio — só se um valor preenchido for inválido (o `safeParse` só acusa erro lá nesse caso).
- **Nova função `getStepErrorCount(parsed, stepId)`** em `tool-form-steps.ts` — conta issues cujo `path[0]` pertence a `STEP_FIELDS[stepId]` (espelha `stepHasErrors`, mas retorna número).
- **Erros inline por passo visitado.** A cada troca de aba, recalcular `errors` para os passos em `visited` (merge de `getStepFieldErrors` de cada passo visitado), de modo que, ao voltar a um passo "vermelho", os campos mostram `<FieldError>` (padrão da casa em `apps/web/CLAUDE.md`). Passo nunca visitado não exibe erro inline.
- **Submit final inalterado.** `useToolSubmit` + `handleValidationFail` continuam validando tudo e pulando para o 1º passo com erro (`firstStepWithError` + `focusFirstError`). Rede final mantida.
- **a11y.** Badge de erro com `aria-label` descritivo (ex: "Identidade & categoria: 2 pendências"); mantém `aria-current="step"` no passo ativo.

### Interação A × B

No **restore** de um rascunho, marcar como **visitadas** todas as abas cujo conteúdo difere do vazio (`EMPTY_TOOL_VALUES`), para que os badges ✓/⚠️ apareçam **de cara** — coerente com "recuperei o trabalho que você já tinha feito". Implementar como um cálculo `stepsWithContent(values)` executado junto do restore.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx` | `visited` + `goTo()`; `next()` sem bloqueio; indicadores ✓/⚠️+contagem; plug do `useToolDraft`; render da faixa. |
| `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts` | nova `getStepErrorCount(parsed, stepId)`; helper `stepsWithContent(values)`. |
| `apps/web/src/app/dashboard/tools/_components/use-tool-draft.ts` | **novo** — `useToolDraft({ values, setValues })`: autosave debounced, restore pós-mount, descarte, expiração 24h, limpeza no sucesso. |
| `apps/web/src/app/dashboard/tools/_components/draft-recovered-banner.tsx` | **novo** — faixa "Rascunho recuperado · Descartar". |
| `apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts` | engatar limpeza do rascunho no sucesso (ou expor callback). |
| `apps/web/src/app/dashboard/tools/_components/tool-form-state.ts` | sem mudança estrutural (`EMPTY_TOOL_VALUES`/`setValues` já exportados e consumidos). |

## Fora de escopo (decisões conscientes)

- **Criação inline de categoria/atributo** — o usuário optou pela abordagem genérica de rascunho. Criar categoria inline esbarraria ainda na regra `MIN_CATEGORY_ATTRIBUTES` (categoria precisa de ≥N atributos para ser principal).
- **Rascunho no modo edição** — dados já no banco.
- **Guard de navegação** (`onNavigate`/`beforeunload`) — coberto pelo rascunho.
- **Limpeza de imagens órfãs no Storage** — imagens enviadas e form abandonado já ficam órfãs hoje; é um problema pré-existente, não regredimos nem resolvemos aqui.
- **Rascunho cross-device** (persistência em banco).

## Verificação (smoke no `localhost:3006`)

1. Preencher parcialmente uma ferramenta → navegar para `/dashboard/categories/new` → voltar a `/dashboard/tools/new` → **rascunho restaurado** + faixa visível + abas com dados já com badge.
2. "Descartar" na faixa → form limpo, badges zerados, chave removida do `localStorage`.
3. Navegar pelas abas **sem** usar "Próximo" → ao deixar um passo incompleto, a aba ganha ⚠️ + contagem; passos não visitados ficam neutros.
4. Corrigir um passo vermelho → badge vira ✓.
5. Clicar "Criar ferramenta" com erro → leva ao 1º passo vermelho e foca o 1º campo.
6. Criar com sucesso → rascunho some do `localStorage`.
7. `bun check` + `bun check-types` verdes.

## Decisões registradas (alinhamento com o usuário)

- Abordagem do Problema 1: **rascunho persistente** (não criação inline).
- Armazenamento: `localStorage` (decisão técnica por convenção).
- UX de restauração: **restaura sozinho + faixa "Descartar"**.
- Validação: **ao sair de cada aba + badge de erro**, abas não visitadas neutras, sem bloquear.
- Botões "Voltar/Próximo": **mantidos, sem bloqueio**.
- Badges no restore: **já aparecem** nas abas com conteúdo.
- Expiração do rascunho: **24 horas**.
