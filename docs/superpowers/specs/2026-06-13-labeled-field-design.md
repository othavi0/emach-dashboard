# Design — `<LabeledField>` (Label + aria-invalid + FieldError)

> Issue [#154](https://github.com/othavioquiliao/emach-dashboard/issues/154). Branch `feat/154-labeled-field`.
> Origem: code-review da PR #153 apontou que a fiação de erro por campo (`Label` + `aria-invalid` no controle + `<FieldError>`) é uma convenção hand-wired ~25× ao longo de ~12 forms, sem barreira estrutural. Este PR cria o componente que torna o padrão difícil de esquecer e prova o caminho ponta-a-ponta migrando o form mais simples (suppliers, 6 campos planos).

## Objetivo

Encapsular `Label` + controle + `<FieldError>` numa única unidade reutilizável, garantindo que `id` e `aria-invalid` cheguem ao controle e que a âncora de scroll (`data-error`) do `focusFirstError` exista sempre — sem depender da memória do autor.

## Infra reaproveitada (não recriar)

- `FieldError` (`@/components/field-error`): renderiza `<p data-error="true" className="text-destructive text-xs">` quando há mensagem; retorna `null` quando vazio. O `data-error` é a âncora de scroll de fallback.
- `focusFirstError` (`src/lib/form-errors.ts`): rola até o primeiro `[aria-invalid="true"]` (foco) **ou** `[data-error="true"]` (scroll).
- `useFormErrors` / `zodIssuesToFieldErrors` / `errorToastMessage` (`src/lib/form-errors.ts`).
- `HelpTooltip` (`@/components/help-tooltip`): tooltip de ajuda contextual dentro do `<Label>`.
- Convenção documentada em `apps/web/CLAUDE.md` (seção "Convenções de UX em forms").

## Decisão de abordagem — render-prop

A API usa **render-prop** porque é a única forma de *garantir* que `aria-invalid` e o `id` cheguem ao controle:

- `children`/slot não consegue injetar props num elemento que o autor controla.
- `cloneElement` é frágil: quebra com `Fragment`, controles compostos e tem tipagem fraca.
- Render-prop é explícito e type-safe: o `field` chega como argumento tipado e o autor faz o spread.

**Limitação honesta (registrada de propósito):** render-prop **reduz**, mas não **elimina**, o esquecimento. O autor não pode mais esquecer de *criar* o `aria-invalid` nem o `<FieldError>` — eles vêm de graça. Mas ele ainda pode esquecer de aplicar `{...field}` no controle. A barreira é ~90%, não 100%. É o teto prático sem macro/codegen; a alternativa (Context + `<FieldControl>`) é mais verbosa e **também** não força o consumo. Mitigação: o teste unitário verifica que `aria-invalid` chega ao DOM, virando o guard-rail de regressão por form na propagação.

## API

```tsx
interface LabeledFieldProps {
  id: string;
  label: ReactNode;
  required?: boolean;
  error?: string;
  help?: ReactNode;   // tooltip/HelpTooltip ao lado do label
  hint?: ReactNode;   // texto auxiliar abaixo do erro (ex: "Markdown suportado")
  children: (field: { id: string; "aria-invalid": true | undefined }) => ReactNode;
}
```

### Por que `aria-invalid: true | undefined` e não `boolean`

Renderizar `aria-invalid="false"` no DOM tem semântica a11y de "campo validado e válido" — falso positivo. O padrão do sistema é `error ? true : undefined` para nunca emitir o atributo quando não há erro. **Não simplificar para `boolean`.**

### Por que `field` é mínimo (só `id` + `aria-invalid`)

`disabled` continua passado à mão em cada controle. Esquecer `disabled` não quebra a11y nem scroll — não é o risco que o componente existe pra matar. Contrato menor = mais fácil de propagar pros 12 forms. (YAGNI.)

## Estrutura renderizada

```tsx
<div className="flex flex-col gap-1.5">
  <Label htmlFor={id} className={help ? "flex items-center gap-1.5" : undefined}>
    {label}
    {required && <span className="text-destructive"> *</span>}
    {help}
  </Label>
  {children({ id, "aria-invalid": error ? true : undefined })}
  <FieldError>{error}</FieldError>
  {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
</div>
```

- O `*` de `required` é `text-destructive` precedido de espaço (` *`), idêntico ao atual.
- `help` entra **dentro** do `<Label>`; a classe `flex items-center gap-1.5` só é aplicada quando há `help` (labels simples ficam intactos), espelhando o padrão atual de website/cnpj.
- `hint` renderiza **depois** do `FieldError`, com estilo padronizado (`text-muted-foreground text-xs`) — autor não reescreve as classes.
- Wrapper fixo em `flex flex-col gap-1.5` — sem `className` passthrough (YAGNI; layouts em grid envolvem o `LabeledField`, não o sobrescrevem).
- Sem `"use client"`: é JSX puro sem hooks; herda o boundary do form client que o consome.

## Arquivo

`apps/web/src/components/labeled-field.tsx` (consistente com `field-error.tsx`).

## Teste unitário (vitest + Testing Library)

Cobre os contratos que o componente existe pra garantir:

1. Renderiza o `label` e o `*` quando `required`; **não** renderiza o `*` quando ausente.
2. O controle recebe `aria-invalid="true"` no DOM quando há `error`; recebe `undefined` (atributo ausente) quando não há — asserção no elemento renderizado pelo children.
3. Renderiza a mensagem de erro dentro de `[data-error="true"]` (âncora de scroll preservada).
4. Renderiza o `hint` quando passado.

## Migração do piloto — `supplier-form-fields.tsx`

Os 6 campos passam a usar `<LabeledField>`, **sem mudança visual** (mesma árvore DOM):

| Campo          | required | help                          | hint                |
| -------------- | -------- | ----------------------------- | ------------------- |
| `name`         | sim      | —                             | —                   |
| `contactEmail` | não      | —                             | —                   |
| `phone`        | não      | —                             | —                   |
| `website`      | não      | HelpTooltip (URL https://)    | —                   |
| `cnpj`         | não      | HelpTooltip (só dígitos)      | —                   |
| `notes`        | não      | —                             | "Markdown suportado" |

- `disabled` continua no spread manual de cada controle.
- O label literal mantém o sufixo "(opcional)" como texto (ex: `"E-mail (opcional)"`); o `*` vem só de `required`.
- A estrutura de grid (`grid gap-4 md:grid-cols-2`) que agrupa pares de campos permanece como `<div>` pai envolvendo os `<LabeledField>`.

## Escopo — o que NÃO entra (premissas e limites)

- **Campos planos só.** `_form` (refine cross-field), campos aninhados/array (`businessHours`, `cepRanges`) e radio-groups (`variants isDefault`) **não** passam por LabeledField. O piloto supplier é 100% plano.
- **Controles custom (premissa de propagação, fora deste PR).** Nos ~12 forms-alvo há `Select`/`CepInput`/`MaskedInput`/`UfSelect`. O `field` passa `aria-invalid`, mas o LabeledField **não verifica** se o controle o repassa ao DOM. Se não repassar, `focusFirstError` cai no fallback `data-error` (scroll, sem foco). Cada issue de propagação que tocar controle custom deve garantir o forward de `aria-invalid` (já consta em `apps/web/CLAUDE.md`). Não é problema do piloto (tudo `Input`/`Textarea` nativo).
- Sem `className` passthrough no wrapper.

## Acceptance criteria (do issue)

- [ ] `<LabeledField>` criado em `apps/web/src/components/` com a API render-prop acima.
- [ ] `field` entrega `id` e `aria-invalid` (`true | undefined`); o controle recebe ambos via spread.
- [ ] Renderiza o `*` quando `required`, e o `<FieldError>` abaixo do controle (com `data-error`).
- [ ] Teste unitário (vitest): label/asterisco, `aria-invalid=true` com `error` e `undefined` sem, e a mensagem de erro.
- [ ] `supplier-form-fields.tsx` migrado nos 6 campos, sem mudança visual.
- [ ] `bun --cwd apps/web check-types`, `bun check`, `bun --cwd apps/web test` verdes.
- [ ] Smoke: criar fornecedor inválido → erro por campo + foco/scroll no primeiro campo, sem regressão visual.

## Adendos a esta proposta (além do issue)

- Slot `hint` adicionado à API — o issue original não previa o texto auxiliar de rodapé que já existe no campo `notes` do piloto.
- Nota explícita sobre a limitação ~90% do render-prop e sobre a premissa de controles custom na propagação.
