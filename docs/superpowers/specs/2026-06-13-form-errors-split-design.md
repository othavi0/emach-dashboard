# Design — Separar funções puras do hook React em `form-errors.ts` (#159)

> Data: 2026-06-13 · Issue: [#159](https://github.com/othavioquiliao/emach-dashboard/issues/159) · Parent: #156 (nota de altitude do PR #158)

## Problema

`apps/web/src/lib/form-errors.ts` é marcado `"use client"` no topo (diretiva de
**módulo**, não de função). Isso força o client boundary sobre **três funções
puras** que não dependem de React e são usadas inclusive fora de componentes
(ex: `tool-submit.ts`). A diretiva existe só por causa de um único export: o
hook `useFormErrors`, que importa `react` + `notify`.

## Objetivo

Separar em dois módulos por natureza, **sem nenhuma mudança de comportamento** —
é reorganização de topologia + estreitamento do client boundary.

## Decisão de design (resolvida no brainstorming)

`FieldErrorMap<T>` é um tipo **puro** (zero dependência de React). Embora o issue
sugira movê-lo "junto do hook", ele vive melhor no módulo das puras: é a *shape*
que `zodIssuesToFieldErrors` produz, e consumidores que usam só as puras
(`tool-submit.ts`, `use-tool-submit.ts`) podem tipar com ele sem puxar o módulo
do hook. O hook importa o tipo do módulo puro (de onde já importa as funções).

## Abordagem escolhida

Dois módulos irmãos em `apps/web/src/lib/`. Alternativas descartadas:

- **Arquivo único, só o hook como client** — inviável: `"use client"` é diretiva
  de módulo, não dá para isolar por função. É a própria razão do issue.
- **Pasta `form-errors/` com `index.ts`** — viola o ban de barrel files (P0,
  CLAUDE.md raiz).

A convenção `use-*` para hooks já existe no repo (`use-tool-submit.ts`,
`use-infinite-list`), então `use-form-errors.ts` é o nome canônico.

## Módulos resultantes

### `form-errors.ts` (puras — **perde** o `"use client"`)

```ts
// sem "use client", sem react, sem notify
import type { ZodError } from "zod";

export function zodIssuesToFieldErrors<T = Record<string, string>>(error: ZodError): ...
export function errorToastMessage(fieldErrors: Record<string, unknown>): string
export function focusFirstError(container?: HTMLElement | null): void
export type FieldErrorMap<T> = Partial<Record<keyof T & string, string>> & { _form?: string };
```

Corpo das funções e do tipo **inalterado** — só removemos a diretiva e os imports
de `react`/`notify` (que não eram usados pelas puras).

### `use-form-errors.ts` (hook — **novo**, `"use client"`)

```ts
"use client";
import { useCallback, useState } from "react";
import type { ZodError } from "zod";
import { notify } from "@/lib/notify";
import {
  errorToastMessage,
  focusFirstError,
  zodIssuesToFieldErrors,
  type FieldErrorMap,
} from "@/lib/form-errors";

export function useFormErrors<T = Record<string, string>>() { ... }
// hook + reportValidationError(error, transform?) + clearErrors — inalterados
```

## Consumidores (14 arquivos mapeados → 11 mudam)

| Ação | Arquivos |
|---|---|
| Re-apontar `useFormErrors` → `use-form-errors.ts` (10) | `branch-edit-sheet`, `branch-form`, `attribute-form`, `promotion-form`, `shipping-settings-form`, `branch-stock-edit-sheet`, `supplier-edit-sheet`, `supplier-form`, `user-edit-sheet`, `category-form` |
| Split em 2 imports (subconjunto do acima) | `category-form`: `type FieldErrorMap` de `form-errors.ts` + `useFormErrors` de `use-form-errors.ts` |
| Não mudam — usam só puras (4) | `tool-submit.ts`, `tool-wizard.tsx`, `use-tool-submit.ts`, `social-settings-form.tsx` |

## Docs a atualizar

`apps/web/CLAUDE.md` (§ "Feedback de erro de validação"): a frase "Tudo de
`src/lib/form-errors.ts`" passa a citar também `use-form-errors.ts` para o hook.

## Critérios de aceite (do issue)

- [ ] Funções puras sem `"use client"` e sem importar `react`/`notify`.
- [ ] Hook `useFormErrors` (com `transform`) em `use-form-errors.ts`; `FieldErrorMap` no módulo puro.
- [ ] `tool-submit.ts` e os forms migrados no #156 com imports atualizados; nenhum import quebrado.
- [ ] Nenhuma mudança de comportamento observável nos forms.
- [ ] `bun check-types` e `bun check` verdes.

## Verificação

`bun check-types` + `bun check`. Sem smoke visual — nenhuma lógica de render
muda; o boundary client só fica mais estreito.
