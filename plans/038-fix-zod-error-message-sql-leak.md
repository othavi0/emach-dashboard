# Plan 038: Eliminar cópias locais de zodErrorMessage e o vazamento de SQL cru nos toasts

> **Instruções para o executor**: Siga este plano passo a passo. Execute cada
> comando de verificação e confirme o resultado esperado antes de avançar.
> Se qualquer condição em "STOP conditions" ocorrer, pare e reporte — não
> improvise. Ao terminar, atualize a linha de status deste plano em
> `plans/README.md`.
>
> **Drift check (execute primeiro)**:
> ```
> git diff --stat 03984800..HEAD -- \
>   apps/web/src/app/dashboard/branches/actions.ts \
>   apps/web/src/app/dashboard/site/settings/actions.ts \
>   apps/web/src/app/dashboard/categories/actions.ts \
>   apps/web/src/lib/action-error.ts \
>   apps/web/src/lib/action-error.test.ts
> ```
> Se algum desses arquivos mudou desde este plano ser escrito, compare os
> excerpts em "Current state" com o código real antes de prosseguir. Em caso
> de divergência, trate como STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

Três features definem uma cópia local de `zodErrorMessage(error)` que retorna
`error.message` diretamente quando `error instanceof Error`. Em blocos `catch`
de operações de banco, o `error` capturado é um `DrizzleQueryError` cujo
`.message` é `"Failed query: INSERT INTO ... params: ..."` — SQL cru com
valores dos parâmetros. Esse string chega sem filtro ao toast do usuário, o
que pode expor informações de schema e dados sensíveis para qualquer usuário
autenticado no dashboard.

A função canônica `actionErrorMessage` em `apps/web/src/lib/action-error.ts`
já resolve esse problema: ela detecta erros do Postgres via `getPgError` (que
percorre a cadeia `.cause`) e retorna uma mensagem genérica segura em vez do
SQL. As três cópias locais bypassam essa proteção. Este plano substitui as três
cópias pelo import canônico e adiciona um teste de regressão que garante que
`DrizzleQueryError` jamais vaze `"Failed query"` no retorno.

## Current state

### Arquivos envolvidos

- `apps/web/src/lib/action-error.ts` — função canônica; segura; a ser importada.
- `apps/web/src/lib/db-error.ts` — `getPgError()` percorre `.cause` até achar `code` SQLSTATE; usada internamente por `actionErrorMessage`.
- `apps/web/src/lib/action-error.test.ts` — suite existente; adicionar 2 novos casos.
- `apps/web/src/app/dashboard/branches/actions.ts` — **site de vazamento real** (DB catch).
- `apps/web/src/app/dashboard/site/settings/actions.ts` — **site de vazamento real** (DB catch).
- `apps/web/src/app/dashboard/categories/actions.ts` — cópia local mas sem vazamento (DB catch usa `mapWriteError`); remover por consistência.

### Função canônica (action-error.ts:11-19)

```ts
// apps/web/src/lib/action-error.ts
export function actionErrorMessage(error: unknown): string {
  if (getPgError(error)) {
    return "Não foi possível concluir a operação. Tente novamente.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Erro desconhecido";
}
```

`getPgError` (`db-error.ts`) percorre a cadeia `.cause` e retorna o nó com
`code` SQLSTATE-like (`/^[0-9A-Z]{5}$/`). Um `DrizzleQueryError` tem `.cause`
= `DatabaseError` com `code: "23503"` etc. — então `getPgError` retorna não-null
e `actionErrorMessage` devolve a string genérica sem tocar em `.message`.

### Cópia em branches/actions.ts (linhas 57-62) — VAZA SQL

```ts
// apps/web/src/app/dashboard/branches/actions.ts:57-62
function zodErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;   // ← vaza DrizzleQueryError.message = "Failed query: ..."
  }
  return "Erro de validação";
}
```

Sites de chamada neste arquivo:
- Linha ~222: `return { ok: false, error: zodErrorMessage(parsed.error) };` — Zod (seguro, mas deve usar o canônico)
- Linha ~231: `return { ok: false, error: zodErrorMessage(error) };` — **DB catch de `createBranch`** (VAZA SQL)
- Linha ~279: `return { ok: false, error: zodErrorMessage(error) };` — **DB catch de `updateBranch`** (VAZA SQL)

### Cópia em site/settings/actions.ts (linhas 27-32) — VAZA SQL

```ts
// apps/web/src/app/dashboard/site/settings/actions.ts:27-32
function zodErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;   // ← vaza DrizzleQueryError.message = "Failed query: ..."
  }
  return "Erro de validação";
}
```

Sites de chamada neste arquivo:
- Linha ~87: `return { ok: false, error: zodErrorMessage(parsed.error) };` — Zod (`updateShippingSettings`, seguro)
- Linha ~106: `return { ok: false, error: zodErrorMessage(error) };` — **DB catch de `updateShippingSettings`** (VAZA SQL)
- Linha ~129: `return { ok: false, error: zodErrorMessage(parsed.error) };` — Zod (`updateSocialSettings`, seguro)
- Linha ~157: `return { ok: false, error: zodErrorMessage(error) };` — **DB catch de `updateSocialSettings`** (VAZA SQL)

### Cópia em categories/actions.ts (linhas 28-33) — NÃO vaza (mas remover)

```ts
// apps/web/src/app/dashboard/categories/actions.ts:28-33
function zodErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Erro de validação";
}
```

Sites de chamada neste arquivo:
- Linha ~459: `return { ok: false, error: zodErrorMessage(parsed.error) };` — Zod (`createCategory`, seguro)
- Linha ~498: `return { ok: false, error: zodErrorMessage(parsed.error) };` — Zod (`updateCategory`, seguro)

Os DB catches de `categories/actions.ts` usam `mapWriteError(e)` (função local
que chama `getPgError` e retorna string amigável), portanto **não há vazamento
aqui**. A cópia local `zodErrorMessage` é chamada **apenas em caminhos Zod**
neste arquivo. Ainda assim, deve ser removida para eliminar a inconsistência e
o risco de regressão futura.

### Convenções a seguir

- **Padrão de erro em server actions** (`apps/web/CLAUDE.md`): em `catch`, usar
  `logger.error` (nunca `console`) e retornar `{ ok: false, error: <string> }`.
  O `getPgError(e)` do `apps/web/src/lib/db-error.ts` mapeia SQLSTATE; o
  `actionErrorMessage` de `action-error.ts` encapsula toda a lógica. Esses são
  os únicos dois utilitários necessários no path de erro de banco.
- Nunca detectar por `e.message.includes("...")` — o `e.message` de
  `DrizzleQueryError` é o SQL cru; o erro real está em `e.cause`.
- `actionErrorMessage` já importa `getPgError` internamente — não importar
  `getPgError` diretamente nos `actions.ts` (a não ser que já o use para
  mapeamentos específicos como em `categories`).
- Exemplar de tratamento correto: `apps/web/src/app/dashboard/categories/actions.ts`
  (função `mapWriteError` + `actionErrorMessage` em Zod paths). Para branches e
  site/settings o padrão é mais simples: sem mapeamento específico de SQLSTATE,
  basta `actionErrorMessage(error)` no catch.

## Commands you will need

| Purpose            | Command                                              | Expected on success          |
|--------------------|------------------------------------------------------|------------------------------|
| Typecheck          | `bun check-types`                                    | exit 0, sem erros            |
| Lint               | `bun check`                                          | exit 0, sem erros            |
| Tests (filtrado)   | `bun --cwd apps/web test action-error`               | todos passam, ≥6 testes      |
| Tests (completo)   | `bun --cwd apps/web test`                            | todos passam                 |
| Verificar remoção  | `grep -rn "zodErrorMessage" apps/web/src/`           | nenhuma linha retornada      |
| Verificar import   | `grep -n "actionErrorMessage" apps/web/src/app/dashboard/branches/actions.ts` | ≥1 linha |

> **Nota**: este plano NÃO toca arquivos `"use server"` de forma que exporte
> não-funções, portanto o gate `bun run --cwd apps/web build` não é mandatório
> aqui. Porém, se quiser garantia extra, pode rodar após o passo 3.

## Scope

**In scope** (os únicos arquivos a modificar):
- `apps/web/src/app/dashboard/branches/actions.ts`
- `apps/web/src/app/dashboard/site/settings/actions.ts`
- `apps/web/src/app/dashboard/categories/actions.ts`
- `apps/web/src/lib/action-error.test.ts`

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):
- `apps/web/src/lib/action-error.ts` — não alterar o comportamento da função canônica.
- `apps/web/src/lib/db-error.ts` — não alterar `getPgError`.
- Qualquer outro `actions.ts` do projeto — este plano cobre apenas os 3 listados.
- `mapWriteError` em `categories/actions.ts` — está correta; não remover nem alterar.
- Qualquer mudança na forma do erro retornado (shape de `ActionResult`).

## Git workflow

- Branch: `advisor/038-fix-zod-error-message-sql-leak`
- Conventional Commits em PT, subject ≤50 chars:
  - `fix(branches): usar actionErrorMessage no catch de DB`
  - `fix(site/settings): usar actionErrorMessage no catch de DB`
  - `refactor(categories): remover cópia local de zodErrorMessage`
  - `test(action-error): add casos de regressão SQL-leak`
- Não fazer push nem abrir PR, a menos que instruído.

## Steps

### Step 1: Adicionar testes de regressão em action-error.test.ts

Abra `apps/web/src/lib/action-error.test.ts` e leia o conteúdo atual. A suite
já tem 4 casos (`it(...)`). Adicione 2 novos casos ao `describe` existente:

**Caso 1** — DrizzleQueryError com `.cause` contendo `DatabaseError` de INSERT
não deve vazar o SQL:

```ts
it("não vaza SQL de INSERT em DrizzleQueryError (risco real de branches/actions)", () => {
  const drizzleInsertError = {
    name: "DrizzleQueryError",
    message:
      'Failed query: INSERT INTO "branch" ("id","name") VALUES ($1,$2) -- params: ["uuid-x","Filial Centro"]',
    cause: {
      name: "DatabaseError",
      code: "23505",
      message: 'duplicate key value violates unique constraint "branch_name_key"',
      constraint: "branch_name_key",
    },
  };
  const msg = actionErrorMessage(drizzleInsertError);
  expect(msg).toBe("Não foi possível concluir a operação. Tente novamente.");
  expect(msg).not.toContain("Failed query");
  expect(msg).not.toContain("INSERT");
  expect(msg).not.toContain("params");
});
```

**Caso 2** — DrizzleQueryError de UPDATE não deve vazar o SQL:

```ts
it("não vaza SQL de UPDATE em DrizzleQueryError (risco real de site/settings/actions)", () => {
  const drizzleUpdateError = {
    name: "DrizzleQueryError",
    message:
      'Failed query: UPDATE "store_settings" SET "shipping_origin_branch_id" = $1 WHERE "id" = $2 -- params: ["branch-id","singleton"]',
    cause: {
      name: "DatabaseError",
      code: "23503",
      message:
        'insert or update on table "store_settings" violates foreign key constraint "fk_shipping_origin"',
      constraint: "fk_shipping_origin",
    },
  };
  const msg = actionErrorMessage(drizzleUpdateError);
  expect(msg).toBe("Não foi possível concluir a operação. Tente novamente.");
  expect(msg).not.toContain("Failed query");
  expect(msg).not.toContain("UPDATE");
  expect(msg).not.toContain("params");
});
```

**Verify**: `bun --cwd apps/web test action-error` → todos os 6 testes passam.

### Step 2: Corrigir branches/actions.ts

Abra `apps/web/src/app/dashboard/branches/actions.ts` e leia o conteúdo atual
antes de editar.

**2a.** Adicione o import de `actionErrorMessage` ao bloco de imports existente
(junto com `@/lib/action-result` já importado):

```ts
import { actionErrorMessage } from "@/lib/action-error";
```

**2b.** Remova a definição local (linhas 57-62 no estado atual):

```ts
function zodErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro de validação";
}
```

**2c.** Nos dois sites de chamada dentro de `createBranch` e `updateBranch`
onde `zodErrorMessage` é chamada com `error` (não `parsed.error`) — os blocos
`catch` — substitua pelo canônico:

```ts
// Antes (em cada catch):
return { ok: false, error: zodErrorMessage(error) };

// Depois:
return { ok: false, error: actionErrorMessage(error) };
```

**2d.** No site de chamada com `parsed.error` (Zod) em `createBranch`:

```ts
// Antes:
return { ok: false, error: zodErrorMessage(parsed.error) };

// Depois:
return { ok: false, error: actionErrorMessage(parsed.error) };
```

E o mesmo para `updateBranch`.

> **Nota sobre ZodError**: `actionErrorMessage` recebe um `ZodError` no caminho
> Zod. `getPgError` retornará `null` (ZodError não tem `code` SQLSTATE), então
> cai no `instanceof Error` e retorna `error.message` — idêntico ao
> comportamento anterior. Sem regressão.

**Verify**: `grep -n "zodErrorMessage" apps/web/src/app/dashboard/branches/actions.ts`
→ nenhuma linha. `bun check-types` → exit 0.

### Step 3: Corrigir site/settings/actions.ts

Abra `apps/web/src/app/dashboard/site/settings/actions.ts` e leia o conteúdo
atual antes de editar.

**3a.** Adicione o import de `actionErrorMessage`:

```ts
import { actionErrorMessage } from "@/lib/action-error";
```

**3b.** Remova a definição local (linhas 27-32 no estado atual):

```ts
function zodErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro de validação";
}
```

**3c.** Substitua os 4 call sites:

- Em `updateShippingSettings`, path Zod (`parsed.error`): `zodErrorMessage(parsed.error)` → `actionErrorMessage(parsed.error)`
- Em `updateShippingSettings`, DB catch (`error`): `zodErrorMessage(error)` → `actionErrorMessage(error)`
- Em `updateSocialSettings`, path Zod (`parsed.error`): `zodErrorMessage(parsed.error)` → `actionErrorMessage(parsed.error)`
- Em `updateSocialSettings`, DB catch (`error`): `zodErrorMessage(error)` → `actionErrorMessage(error)`

**Verify**: `grep -n "zodErrorMessage" apps/web/src/app/dashboard/site/settings/actions.ts`
→ nenhuma linha. `bun check-types` → exit 0.

### Step 4: Remover cópia em categories/actions.ts

Abra `apps/web/src/app/dashboard/categories/actions.ts` e leia o conteúdo
atual antes de editar.

**4a.** Adicione o import de `actionErrorMessage`:

```ts
import { actionErrorMessage } from "@/lib/action-error";
```

**4b.** Remova a definição local (linhas 28-33 no estado atual):

```ts
function zodErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro de validação";
}
```

**4c.** Substitua os 2 call sites em `createCategory` e `updateCategory` (ambos
com `parsed.error`, caminho Zod):

```ts
// Antes:
return { ok: false, error: zodErrorMessage(parsed.error) };

// Depois:
return { ok: false, error: actionErrorMessage(parsed.error) };
```

> **Atenção**: NÃO altere `mapWriteError` — ela está correta e é responsável
> pelos DB catches neste arquivo. Apenas remova `zodErrorMessage` e substitua
> nos 2 call sites Zod.

**Verify**: `grep -n "zodErrorMessage" apps/web/src/app/dashboard/categories/actions.ts`
→ nenhuma linha. `bun check-types` → exit 0.

### Step 5: Verificação global e commit

**5a.** Confirme que não existe mais nenhuma cópia de `zodErrorMessage` no projeto:

```bash
grep -rn "zodErrorMessage" apps/web/src/
```

Resultado esperado: **nenhuma linha** (exit 0, sem output).

**5b.** Confirme que `actionErrorMessage` foi importado nos 3 arquivos:

```bash
grep -rn "actionErrorMessage" \
  apps/web/src/app/dashboard/branches/actions.ts \
  apps/web/src/app/dashboard/site/settings/actions.ts \
  apps/web/src/app/dashboard/categories/actions.ts
```

Resultado esperado: ≥1 linha por arquivo (3 arquivos, ≥3 linhas total).

**5c.** Execute a suite de testes filtrada:

```bash
bun --cwd apps/web test action-error
```

Resultado esperado: `6 tests | 6 passed` (os 4 originais + os 2 adicionados no Step 1).

**5d.** Execute `bun verify` (encadeia check-types + check + test):

```bash
bun verify
```

Resultado esperado: exit 0, sem erros de tipo, lint ou testes.

**5e.** Faça commits separados por feature:

```bash
git add apps/web/src/lib/action-error.test.ts
git commit -m "test(action-error): add casos de regressão SQL-leak"

git add apps/web/src/app/dashboard/branches/actions.ts
git commit -m "fix(branches): usar actionErrorMessage no catch de DB"

git add apps/web/src/app/dashboard/site/settings/actions.ts
git commit -m "fix(site/settings): usar actionErrorMessage no catch de DB"

git add apps/web/src/app/dashboard/categories/actions.ts
git commit -m "refactor(categories): remover cópia local de zodErrorMessage"
```

**Verify**: `git log --oneline -4` → 4 novos commits com os subjects acima.

## Test plan

### Testes existentes (não alterar)
Arquivo: `apps/web/src/lib/action-error.test.ts`
4 casos já existentes cobrindo: DrizzleQueryError com `.cause`, PgError direto,
`instanceof Error`, e valores não-Error.

### Novos testes (Step 1)
Arquivo: `apps/web/src/lib/action-error.test.ts` (mesmo arquivo, mesmo describe)
2 novos casos:
1. DrizzleQueryError de INSERT (simula o risco exato de `branches/actions.ts`) — garante que SQL + params não aparecem no retorno.
2. DrizzleQueryError de UPDATE (simula o risco exato de `site/settings/actions.ts`) — mesma garantia.

Padrão estrutural: igual aos casos existentes no arquivo (plain object imitando
DrizzleQueryError, sem precisar importar a classe real).

**Comando de verificação**: `bun --cwd apps/web test action-error` → 6 passed.

## Done criteria

Machine-checkable. TODOS devem ser verdadeiros:

- [ ] `grep -rn "zodErrorMessage" apps/web/src/` retorna zero linhas (nenhuma cópia local sobrou)
- [ ] `grep -rn "actionErrorMessage" apps/web/src/app/dashboard/branches/actions.ts` retorna ≥1 linha
- [ ] `grep -rn "actionErrorMessage" apps/web/src/app/dashboard/site/settings/actions.ts` retorna ≥1 linha
- [ ] `grep -rn "actionErrorMessage" apps/web/src/app/dashboard/categories/actions.ts` retorna ≥1 linha
- [ ] `bun --cwd apps/web test action-error` → `6 tests | 6 passed`
- [ ] `bun check-types` → exit 0
- [ ] `bun check` → exit 0
- [ ] `bun --cwd apps/web test` → todos passam (nenhum teste regressou)
- [ ] `git status` mostra apenas os 4 arquivos in-scope modificados
- [ ] `plans/README.md` atualizado com status DONE para este plano

## STOP conditions

Pare e reporte (não improvise) se:

- O código nas localizações descritas em "Current state" não bate com os
  excerpts (o repo derivou desde que este plano foi escrito — verificar com o
  drift check do header).
- `grep -n "zodErrorMessage" apps/web/src/app/dashboard/categories/actions.ts`
  mostrar call sites em blocos `catch` de DB (não apenas em `parsed.error`) —
  significaria que o arquivo foi alterado e há vazamento novo não coberto aqui.
- Qualquer um dos 3 arquivos in-scope exportar símbolos não-async function
  (um `export const` ou `export type` adicionado ao arquivo `"use server"`) —
  isso quebraria o build; validar com `bun run --cwd apps/web build` antes de commitar.
- Uma etapa de verificação falhar duas vezes mesmo após tentativa razoável de
  correção.
- A correção parecer exigir tocar arquivos fora do in-scope (ex: alterar
  `action-error.ts`, `db-error.ts`, ou outros `actions.ts`).

## Maintenance notes

- **Futuros `actions.ts`** devem importar `actionErrorMessage` de
  `@/lib/action-error` em todos os blocos `catch` — nunca definir cópia local.
  A regra está documentada em `apps/web/CLAUDE.md` ("Erro de banco no catch").
- **Se `getPgError` for estendido** para detectar mais tipos de erro (ex:
  timeout, `ConnectionError`), `actionErrorMessage` automaticamente os tratará
  de forma segura — não há nada a mudar nos `actions.ts`.
- **Revisão em PR**: confirmar que nenhum `catch (error) { return { ok: false, error: error.message } }`
  (pattern perigoso sem wrapper) foi introduzido por outros PRs concorrentes.
  Um `grep -rn "error\.message" apps/web/src/app/dashboard/` aponta candidatos
  a revisar.
- Este plano **não** cobre outros possíveis sites de vazamento fora dos 3 arquivos
  listados. Um sweep mais amplo (`grep -rn "error\.message" apps/web/src/`) é
  recomendado como follow-up de baixo risco.
