# Plan 030: Logger emite JSON estruturado com requestId em produção

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- apps/web/src/lib/logger.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`apps/web/src/lib/logger.ts` é um wrapper de `console.*` de 14 linhas que emite
texto livre. Em produção (Vercel), cada entrada de log é uma string opaca sem
campos estruturados, tornando impossível correlacionar um erro a um request,
sessão ou server action específica. Com saída JSON (nível, scope, timestamp,
requestId opcional), o Vercel Log Drains e qualquer agregador externo conseguem
filtrar e correlacionar eventos instantaneamente — sem instrumentação adicional.
A API pública (`logger.error(scope, payload)` / `logger.info(scope, payload)`)
não muda, então 62 call-sites existentes continuam sem edição.

## Current state

### Arquivo principal

`apps/web/src/lib/logger.ts` (14 linhas, `@planned-at 79379ef5`):

```ts
// file: apps/web/src/lib/logger.ts:1-14
const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  error(scope: string, error: unknown): void {
    // Erros logam sempre — em produção o stderr é capturado pela observabilidade
    // do host (Vercel). É o canal permitido pelo CLAUDE.md (não console cru).
    console.error(`[${scope}]`, error);
  },
  info(scope: string, payload?: unknown): void {
    if (isDev) {
      console.info(`[${scope}]`, payload ?? "");
    }
  },
};
```

**Problema:** `console.error(`[${scope}]`, error)` emite texto livre. Em
produção não há campos `level`, `scope`, `ts` nem `requestId` — correlação é
manual.

### Call-sites relevantes (amostral — API não muda)

- `apps/web/src/app/api/cron/cancel-stale-orders/route.ts:68` —
  `logger.error("cancelStaleOrder", { orderId: id, err: perOrderErr })`
  (runtime `nodejs`)
- `apps/web/src/app/dashboard/branches/_components/cep-input.tsx:90` —
  `logger.error("ViaCEP lookup failed", { err, cep })`
  (**Client Component** `"use client"` — o logger **deve** funcionar no browser)
- `apps/web/src/app/error.tsx:18` — `logger.error("route-error-boundary", error)`
  (**Client Component** — idem)
- `apps/web/src/app/dashboard/customers/export/route.ts:232` —
  `logger.info("customers.csv_export", { userId, count, bytes, truncated })`
  (único `logger.info` com payload significativo)

Total de call-sites: 62 (60 `error` + 2 `info`). Nenhum usa `logger.warn`.

### Contexto de runtime

- Apenas uma rota declara `export const runtime = "nodejs"`: `api/cron/cancel-stale-orders/route.ts:13`.
- As outras três (`api/auth/[...all]/route.ts`, `dashboard/customers/export/route.ts`, `dashboard/orders/export/route.ts`) **não declaram `runtime`** → Next.js usa **Node.js runtime por padrão** (Edge Runtime requer `export const runtime = "edge"` explícito; não há default Edge no `next.config.ts`).
- Client Components (`"use client"`) executam no browser.
- O logger precisa ser compatível com browser (Client Components como `error.tsx` e `cep-input.tsx` importam-no diretamente). Portanto **sem imports de módulos Node-only** (`fs`, `node:stream`). `pino` tem caveats de bundle edge/browser — implementação própria é mais segura.

### Convenções do repo que se aplicam

- `CLAUDE.md` (raiz): **anti-pattern banido** — `console.log/warn/error` em
  produção. Usar `logger` de `apps/web/src/lib/logger.ts`. O plano respeita isso
  — `console.*` passa a ser implementação interna do logger, não chamado direto.
- `apps/web/CLAUDE.md` → Server actions: `logger.error({ err })` no catch —
  sem `console`. A API preservada garante conformidade.
- Testes: `vitest`, `environment: node`, mock de `@emach/db` via `vi.hoisted` +
  `vi.mock` (referência: `src/lib/__tests__/form-errors.test.ts` para estrutura
  simples sem mock de db).

## Commands you will need

| Purpose    | Command                                                  | Expected on success         |
|------------|----------------------------------------------------------|-----------------------------|
| Typecheck  | `bun check-types`                                        | exit 0, 0 errors            |
| Lint       | `bun check`                                              | exit 0 (ultracite/biome)    |
| Tests      | `bun --cwd apps/web test`                                | exit 0, ≥ baseline verde    |
| Tests (filtro) | `bun --cwd apps/web test src/lib/__tests__/logger` | exit 0, todos novos passam  |
| Build      | `bun run --cwd apps/web build`                           | exit 0                      |
| Guard forms| `bun guard:forms`                                        | exit 0                      |

## Scope

**In scope** (os únicos arquivos a modificar/criar):

- `apps/web/src/lib/logger.ts` — substituir implementação; manter API pública
- `apps/web/src/lib/__tests__/logger.test.ts` — criar (não existe hoje)

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):

- Nenhum call-site (`actions.ts`, `route.ts`, `error.tsx`, `cep-input.tsx`,
  etc.) — a API `logger.error(scope, payload)` e `logger.info(scope, payload)`
  é preservada; os 62 call-sites não precisam de edição.
- `apps/web/src/app/error.tsx` e `apps/web/src/app/global-error.tsx` — Client
  Components que já usam `logger.error`; não tocar.
- `packages/*` — sem alteração de pacotes compartilhados.
- Nenhuma adição de APM/observabilidade externa (Axiom, Logtail, Sentry, etc.).
- `plans/README.md` — atualizar a linha de status deste plano (030) após
  concluir, mas NÃO editar as linhas dos planos 001–026.

## Git workflow

- Branch: `advisor/030-structured-logger`
- Commits Conventional Commits em PT, subject ≤ 50 chars. Exemplo do repo:
  `feat(logger): emitir JSON estruturado em produção`
- **NÃO** fazer push nem abrir PR sem instrução explícita.

## Steps

### Step 1: Substituir `apps/web/src/lib/logger.ts`

Reescrever o arquivo completo. A nova implementação deve:

1. **Preservar a assinatura pública** — `logger.error(scope: string, error: unknown): void`
   e `logger.info(scope: string, payload?: unknown): void`. Nenhuma assinatura
   nova obrigatória neste plano (não adicionar `warn` nem `requestId` como
   parâmetro posicional — seria breaking change nos 62 call-sites).

2. **Modo produção** (`process.env.NODE_ENV === "production"`): emitir uma única
   linha JSON por evento para `stdout`/`stderr` via `console.log`/`console.error`
   (o Vercel captura ambos e interpreta JSON). Campos obrigatórios:
   - `level`: `"error"` | `"info"`
   - `scope`: o primeiro argumento
   - `ts`: `new Date().toISOString()` (ISO-8601 UTC)
   - `payload`: o segundo argumento serializado — se for `Error`, serializar como
     `{ message: err.message, name: err.name, stack: err.stack }` para que o
     objeto apareça no JSON (objetos Error não serializam com `JSON.stringify`
     por padrão); se for objeto literal, passar direto.

3. **Campo `requestId` opcional**: a função de serialização aceita que `payload`
   já contenha `requestId` se o chamador quiser injetar (ex: `logger.error("scope",
   { requestId, err })`). O logger não gera `requestId` automaticamente — isso
   é responsabilidade do chamador (middleware ou server action que quiser
   correlacionar). O plano não modifica call-sites, portanto hoje o campo aparece
   só quando o payload passado já o contém.

4. **Modo dev** (`NODE_ENV !== "production"`): manter saída legível —
   `console.error(`[${scope}]`, payload)` e `console.info(`[${scope}]`, payload)`
   (sem JSON), igual ao comportamento atual.

5. **Compatibilidade universal**: sem imports de módulos Node-only (`fs`, `path`,
   `node:stream`). `process.env.NODE_ENV` é disponível em todos os runtimes
   (Node, Edge, browser via Next.js bundler).

**Formato alvo da função interna de serialização** (referência — adaptar conforme
julgamento do executor, desde que os campos acima estejam presentes):

```ts
// Exemplo de shape esperado em produção:
// console.log(JSON.stringify({ level: "error", scope, ts, payload: serializePayload(error) }))
// console.error(JSON.stringify({ level: "error", scope, ts, payload: serializePayload(error) }))

function serializePayload(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}
```

> **Nota sobre `console.error` vs `console.log`**: usar `console.error` para
> `level: "error"` e `console.log` para `level: "info"`. O Vercel captura ambos
> os streams; usar stderr para erros facilita triagem visual nas Function Logs.

**Verify**: `bun check-types` → exit 0, 0 erros de tipo

### Step 2: Criar `apps/web/src/lib/__tests__/logger.test.ts`

Criar o arquivo de teste em `apps/web/src/lib/__tests__/logger.test.ts`.

**Estrutura do teste** (modelo: `src/lib/__tests__/form-errors.test.ts` — sem
mock de db, só lógica pura):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger";

// ...
```

**Casos obrigatórios**:

1. **`logger.error` emite JSON com campos corretos em produção**
   - Setup: `vi.stubEnv("NODE_ENV", "production")`, spy em `console.error`
   - Chamar `logger.error("myScope", new Error("boom"))`
   - Assert: `console.error` chamado 1 vez; argumento é string JSON válida;
     campo `level === "error"`; campo `scope === "myScope"`; `payload.message === "boom"`;
     campo `ts` é string ISO-8601.

2. **`logger.error` em produção: objeto literal no payload**
   - Setup: NODE_ENV=production, spy em `console.error`
   - Chamar `logger.error("scope", { orderId: "x", err: "msg" })`
   - Assert: `payload.orderId === "x"`.

3. **`logger.info` emite JSON com `level: "info"` em produção**
   - Setup: NODE_ENV=production, spy em `console.log` (ou `console.info` — o que
     a implementação usar para info)
   - Chamar `logger.info("scope", { count: 5 })`
   - Assert: campo `level === "info"`; `payload.count === 5`.

4. **`logger.error` em dev NÃO emite JSON**
   - Setup: NODE_ENV=development, spy em `console.error`
   - Chamar `logger.error("scope", new Error("x"))`
   - Assert: o argumento passado para `console.error` **não** é uma string JSON
     (ou seja, `typeof arg !== "string"` OU `!arg.startsWith("{")`).

5. **`logger.info` em dev loga em NODE_ENV=test** (opcional mas útil — confirma que qualquer `!== "production"` inclui o ambiente de testes)
   - Setup: NODE_ENV=test (padrão do vitest), spy em `console.info` (ou `console.log`, conforme o que a implementação usar)
   - Chamar `logger.info("scope", { x: 1 })`
   - Assert: o console spy foi chamado **1 vez** (texto legível, **não** JSON stringificado — mesma garantia do caso 4).

> **Atenção**: `NODE_ENV` é avaliado em **runtime** na nova implementação (não
> capturado em closure de módulo). Se a implementação anterior (original) capturava
> em `const isDev = process.env.NODE_ENV !== "production"` no topo do módulo,
> `vi.stubEnv` não retroage sobre essa constante. A nova implementação **deve**
> ler `process.env.NODE_ENV` dentro de cada função (não em closure de nível de
> módulo) para que `vi.stubEnv` funcione nos testes. Isso é um requisito de
> design — não um detalhe.

Use `vi.spyOn(console, "error")` / `vi.spyOn(console, "log")` com
`vi.restoreAllMocks()` no `afterEach`.

**Verify**: `bun --cwd apps/web test src/lib/__tests__/logger` → exit 0, todos
os casos do `describe("logger")` passam

### Step 3: Verificar lint e baseline de testes completo

Rodar o conjunto completo de verificações para garantir que nada quebrou:

```sh
bun check-types
bun check
bun guard:forms
bun --cwd apps/web test
```

**Verify**: todos os quatro comandos exitam 0; a suíte de testes reporta ≥ 359
testes (baseline) + os novos testes de logger.

### Step 4: Commit

```sh
git add apps/web/src/lib/logger.ts apps/web/src/lib/__tests__/logger.test.ts
git commit -m "feat(logger): emitir JSON estruturado em produção"
```

**Verify**: `git log --oneline -1` mostra o commit com a mensagem acima.

## Test plan

**Arquivo a criar**: `apps/web/src/lib/__tests__/logger.test.ts`

**Modelo estrutural**: `apps/web/src/lib/__tests__/form-errors.test.ts` —
describe + it aninhados, sem mock de db, sem imports de módulos server-only.

**Casos cobertos** (descrição → o que valida):

| # | Caso | Valida |
|---|------|--------|
| 1 | `error` em prod com `Error` | JSON com `level`, `scope`, `ts`, `payload.message` |
| 2 | `error` em prod com objeto literal | `payload` preserva campos do objeto |
| 3 | `info` em prod | JSON com `level: "info"`, `payload` correto |
| 4 | `error` em dev | saída **não** é JSON stringificado |
| 5 | `info` em test/dev | `console.info` não chamado (supressão dev) |

**Comando de validação**: `bun --cwd apps/web test src/lib/__tests__/logger` → exit 0

## Done criteria

Machine-checkable. TODOS devem ser verdadeiros:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun guard:forms` exits 0
- [ ] `bun --cwd apps/web test` exits 0; `logger.test.ts` existe e passa
- [ ] `bun --cwd apps/web test src/lib/__tests__/logger` exits 0 com ≥ 4 testes passando
- [ ] `grep -n "console\." apps/web/src/lib/logger.ts` retorna **apenas** linhas
  dentro do corpo das funções do `logger` (o `console.*` é detalhe de implementação
  interna, não call-site direto)
- [ ] `grep -rn "console\.error\|console\.log\|console\.info\|console\.warn" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "logger.ts" | grep -v "// biome-ignore"` retorna 0 matches (nenhum console cru fora do logger e dos biome-ignores existentes)
- [ ] `git diff --name-only` lista **apenas** `apps/web/src/lib/logger.ts` e
  `apps/web/src/lib/__tests__/logger.test.ts` (nenhum call-site modificado)
- [ ] `bun run --cwd apps/web build` exits 0

## STOP conditions

Parar e reportar (não improvisar) se:

- O conteúdo de `apps/web/src/lib/logger.ts` no repo não bater com o excerpt de
  14 linhas em "Current state" (drift desde o planejamento).
- `vi.stubEnv("NODE_ENV", "production")` não afeta o comportamento do logger
  nos testes porque a implementação capturou `NODE_ENV` em closure de módulo —
  nesse caso reportar antes de alterar a abordagem de teste.
- `bun check` (ultracite/biome) falha com regra nova que proíbe `console.*`
  também dentro de `logger.ts` — reportar; a exceção pode exigir um comentário
  `// biome-ignore` na linha específica com motivo.
- O build falha com `Module not found: Can't resolve 'net'/'tls'` ou similar
  após a mudança — indica que uma dependência de módulo Node-only foi acidentalmente
  introduzida. Reverter e reportar.
- Qualquer verificação falha duas vezes após tentativa razoável de correção.
- A correção de um failing test exigir modificar algum call-site fora da lista
  de in-scope.

## Maintenance notes

- **requestId por request**: o plano não injeta `requestId` automaticamente nos
  call-sites. Se futuramente uma middleware (Next 16 `middleware.ts`) gerar um
  `requestId` e armazená-lo em `AsyncLocalStorage`, o logger pode ser estendido
  para lê-lo automaticamente sem alterar a API pública. Isso é um follow-up
  natural (DX-03 completo), fora deste plano.
- **Pino/Winston no futuro**: se o projeto crescer para precisar de sampling,
  child loggers ou transports, `pino` edge-compatible (`pino/browser` + `pino`
  nodejs) é a escolha natural. A substituição seria localizada em `logger.ts`
  sem tocar call-sites — por isso este plano optou por implementação própria
  agora e não por adicionar uma dependência pesada prematuramente.
- **Client Components**: `error.tsx` e `cep-input.tsx` usam `logger.error` no
  browser. O JSON emitido vai para `console.error` do browser (visível no
  DevTools, não no Vercel). Isso é aceitável — erros client-side idealmente
  terão uma integração de Sentry/Axiom futura que intercepta `console.error`.
- **Revisor**: verificar no PR que `process.env.NODE_ENV` é lido dentro das
  funções (não capturado em closure de módulo), e que o campo `ts` aparece nos
  snapshots dos testes.
