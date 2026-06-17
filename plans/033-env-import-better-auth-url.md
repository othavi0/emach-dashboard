# Plan 033: Substituir process.env direto por @emach/env em users/actions.ts e supabase-server.ts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/users/actions.ts apps/web/src/lib/supabase-server.ts packages/env/src/server.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`apps/web/src/app/dashboard/users/actions.ts:485` constrói o link de reset de senha com `${process.env.BETTER_AUTH_URL}/reset-password`. Se a variável não estiver definida no ambiente, o valor vira a string literal `"undefined/reset-password"` — e o usuário recebe um e-mail com link quebrado sem nenhum erro visível. O contrato estabelecido no projeto é que todas as variáveis de ambiente passem pela validação de schema em `@emach/env/server` (que usa `@t3-oss/env-core` com Zod e lança em startup se qualquer var obrigatória faltar). Usar `env.BETTER_AUTH_URL` em vez de `process.env.BETTER_AUTH_URL` move a falha para startup — ruidosa e imediata — em vez de runtime silenciosa. O mesmo padrão se aplica aos dois reads brutos em `supabase-server.ts`, que já lançam manualmente se as vars faltarem, mas ficam fora do contrato centralizado.

## Current state

### Arquivo 1 — `apps/web/src/app/dashboard/users/actions.ts`

Papel: server actions de gerenciamento de usuários do dashboard (convite, suspensão, reset de senha etc.).

O arquivo **já importa** `env` de `@emach/env/server` na linha 16:

```ts
// apps/web/src/app/dashboard/users/actions.ts:16
import { env } from "@emach/env/server";
```

Mas na linha 485, dentro da action `triggerPasswordReset`, usa `process.env` diretamente:

```ts
// apps/web/src/app/dashboard/users/actions.ts:483-487
await authDashboard.api.requestPasswordReset({
    body: {
        email: target.email,
        redirectTo: `${process.env.BETTER_AUTH_URL}/reset-password`,
    },
});
```

### Arquivo 2 — `apps/web/src/lib/supabase-server.ts`

Papel: cliente Supabase Admin (service role) para Storage — export `supabaseAdmin`.

Linhas 1-20 completas:

```ts
// apps/web/src/lib/supabase-server.ts:1-20
import "server-only";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL nao configurado no ambiente");
}

if (!serviceKey) {
    throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY nao configurado no ambiente do servidor"
    );
}

export const supabaseAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

export const TOOL_IMAGES_BUCKET = "tool-images";
export const TOOL_VIDEOS_BUCKET = "tool-videos";
export const BANNER_IMAGES_BUCKET = "banner-images";
```

Não há import de `@emach/env` neste arquivo.

### Arquivo 3 — `packages/env/src/server.ts` (schema de referência)

As três variáveis envolvidas já estão no schema:

```ts
// packages/env/src/server.ts:25 — BETTER_AUTH_URL
BETTER_AUTH_URL: z.url(),

// packages/env/src/server.ts:33-34 — Supabase
SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
NEXT_PUBLIC_SUPABASE_URL: z.url(),
```

`NEXT_PUBLIC_SUPABASE_URL` está declarada na seção `server` do schema (linha 34), não na seção `client`, mesmo sendo prefixada com `NEXT_PUBLIC_`. Isso é intencional: o arquivo `supabase-server.ts` roda exclusivamente no servidor (`import "server-only"`) e precisa do schema server.

### Convenções aplicáveis

- Anti-pattern banido (raiz `CLAUDE.md`): `console.log/warn/error` em produção — usar `logger` de `apps/web/src/lib/logger.ts`.
- Anti-pattern banido: `: any`, `as any`, `@ts-ignore`.
- Módulos com `"use server"` ou `"server-only"` não importam do bundle client.
- Exemplar do padrão correto: `apps/web/src/app/api/cron/cancel-stale-orders/route.ts:6` usa `import { env } from "@emach/env/server"` e acessa `env.CRON_SECRET`.

## Commands you will need

| Purpose     | Command                                | Expected on success           |
|-------------|----------------------------------------|-------------------------------|
| Typecheck   | `bun check-types`                      | exit 0, sem erros             |
| Lint        | `bun check`                            | exit 0                        |
| Testes      | `bun --cwd apps/web test`              | exit 0, todos passam          |
| Guard forms | `bun guard:forms`                      | exit 0                        |
| Build       | `bun run --cwd apps/web build`         | exit 0                        |
| Grep done   | `grep -rn "process\.env\.BETTER_AUTH_URL" apps/web/src` | 0 matches (nenhuma linha) |

## Scope

**In scope** (os únicos arquivos que você deve modificar):

- `apps/web/src/app/dashboard/users/actions.ts` — substituir `process.env.BETTER_AUTH_URL` por `env.BETTER_AUTH_URL` na linha 485.
- `apps/web/src/lib/supabase-server.ts` — adicionar import de `@emach/env/server`, substituir os dois `process.env.*` por `env.*`, remover os `if (!url)` / `if (!serviceKey)` manuais (o schema do env já lança em startup).

**Out of scope** (não tocar, mesmo que pareça relacionado):

- `packages/env/src/server.ts` — as três variáveis já existem no schema; nenhuma adição necessária.
- Qualquer outro arquivo que use `process.env.*` no repo — este plano corrige apenas estes dois sites identificados.
- `apps/web/.env` ou `.env.example` — não são código, não são escopo deste plano.

## Git workflow

- Branch: `advisor/033-env-import-better-auth-url`
- Mensagem de commit (Conventional Commits, PT, subject ≤50 chars):
  `refactor: usar env validado no reset e supabase-client`
- Não fazer push nem abrir PR sem instrução do operador.

## Steps

### Step 1: Corrigir users/actions.ts — linha 485

Abra `apps/web/src/app/dashboard/users/actions.ts`. O arquivo já importa `env` na linha 16 (`import { env } from "@emach/env/server"`). Não é preciso adicionar nenhum import.

Localize a linha 485:

```ts
redirectTo: `${process.env.BETTER_AUTH_URL}/reset-password`,
```

Substitua por:

```ts
redirectTo: `${env.BETTER_AUTH_URL}/reset-password`,
```

Nenhuma outra alteração no arquivo.

**Verify**: `grep -n "process\.env\.BETTER_AUTH_URL" apps/web/src/app/dashboard/users/actions.ts` → nenhuma saída (0 matches).

### Step 2: Corrigir supabase-server.ts — migrar para env validado

Abra `apps/web/src/lib/supabase-server.ts`.

O arquivo tem 24 linhas no total. Substitua o conteúdo **completo** (linhas 1-24) por:

```ts
import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "@emach/env/server";

export const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
);

export const TOOL_IMAGES_BUCKET = "tool-images";
export const TOOL_VIDEOS_BUCKET = "tool-videos";
export const BANNER_IMAGES_BUCKET = "banner-images";
```

Racional: os guards `if (!url) throw` e `if (!serviceKey) throw` eram a única validação presente. Com `env.*`, o `@t3-oss/env-core` já lança em startup se as vars faltarem — o comportamento de falha permanece, só migra para o momento certo. O TypeScript sabe que `env.NEXT_PUBLIC_SUPABASE_URL` e `env.SUPABASE_SERVICE_ROLE_KEY` são `string` (não `string | undefined`), então `createClient` recebe tipos corretos sem cast.

**Verify**: `grep -n "process\.env" apps/web/src/lib/supabase-server.ts` → nenhuma saída (0 matches).

### Step 3: Typecheck e lint

Execute typecheck e lint para confirmar que não há erros introduzidos:

```
bun check-types
bun check
```

**Verify**: ambos retornam exit 0 sem erros ou warnings novos.

### Step 4: Testes e guard

Execute a suíte completa e o guard de forms:

```
bun --cwd apps/web test
bun guard:forms
```

**Verify**: `bun --cwd apps/web test` → exit 0, todos os testes passam (baseline: 54 arquivos / 359 testes). `bun guard:forms` → exit 0.

### Step 5: Commit

```
git add apps/web/src/app/dashboard/users/actions.ts apps/web/src/lib/supabase-server.ts
git commit -m "refactor: usar env validado no reset e supabase-client"
```

**Verify**: `git status` → working tree limpa; somente os dois arquivos in-scope foram modificados.

## Test plan

Este plano não exige novos testes unitários: a mudança é uma substituição de leitura de variável de ambiente — comportamento em produção é idêntico quando as vars estão presentes, e a diferença (falha em startup vs. `"undefined/..."` silencioso) só é observável quando uma var está ausente, o que não é testável na suíte vitest sem mock de módulo de env.

Os testes existentes em `apps/web/src/app/dashboard/users/__tests__/` (`invite-schema.test.ts`, `_components/__tests__/update-user-schema.test.ts`) cobrem schemas de validação de form — não são afetados.

**Verification**: `bun --cwd apps/web test` → exit 0, contagem de testes idêntica ao baseline (359 testes).

## Done criteria

Machine-checkable. TODOS devem ser verdadeiros:

- [ ] `grep -rn "process\.env\.BETTER_AUTH_URL" apps/web/src` → 0 matches
- [ ] `grep -n "process\.env" apps/web/src/lib/supabase-server.ts` → 0 matches
- [ ] `bun check-types` → exit 0
- [ ] `bun check` → exit 0
- [ ] `bun --cwd apps/web test` → exit 0, todos os testes passam
- [ ] `bun guard:forms` → exit 0
- [ ] `git diff --name-only HEAD~1 HEAD` lista exatamente os dois arquivos in-scope e nenhum outro
- [ ] `plans/README.md` atualizado com status `DONE` para o plano 033

## STOP conditions

Pare e reporte (não improvise) se:

- O código nas localizações descritas em "Current state" não corresponder aos trechos (o codebase derivou desde que este plano foi escrito).
- `BETTER_AUTH_URL`, `SUPABASE_SERVICE_ROLE_KEY` ou `NEXT_PUBLIC_SUPABASE_URL` não existirem em `packages/env/src/server.ts` — isso indica que o schema foi editado e o Step 2 pode quebrar a validação de startup.
- `bun check-types` falhar com erro novo após qualquer step (não apenas warning pré-existente).
- Qualquer step de verificação falhar duas vezes seguidas mesmo após ajuste razoável.
- O fix aparentemente exige tocar em um arquivo fora da lista in-scope.

## Maintenance notes

- **Se `BETTER_AUTH_URL` for renomeada no schema de env** (`packages/env/src/server.ts`), a referência em `users/actions.ts:485` deve ser atualizada junto.
- **Se `supabase-server.ts` for expandido** com novos clientes ou buckets que precisem de outras vars de env, usar sempre `env.<VAR>` em vez de `process.env.<VAR>`.
- Após este plano, o único ponto de leitura raw de `process.env` para variáveis de aplicação deve ser o próprio `packages/env/src/server.ts` (que alimenta o `createEnv`). Auditorias futuras podem usar `grep -rn "process\.env\." apps/web/src` para detectar novos desvios.
- Este plano **não** audita o restante do monorepo (outros apps ou packages) — é escopo deliberadamente limitado aos dois sites identificados.
