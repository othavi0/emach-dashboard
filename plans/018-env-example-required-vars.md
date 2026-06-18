# Plan 018: Documentar RESEND_API_KEY e EMAIL_FROM no .env.example

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- apps/web/.env.example packages/env/src/server.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`packages/env/src/server.ts` declara `RESEND_API_KEY` e `EMAIL_FROM` como
obrigatórios (schema Zod `.string().min(1)`, sem `.optional()`), mas nenhum
dos dois aparece em `apps/web/.env.example`. Um desenvolvedor que clona o
repo e segue o `.env.example` ao pé da letra não consegue subir o servidor
(falha de validação Zod no boot) e — mesmo que burle isso — o fluxo de
convite de usuário (`sendInviteEmail` em `packages/email/src/send.tsx`) e o
fluxo de reset de senha (`sendPasswordResetEmail`) crasham em runtime por
falta dessas vars. Adicionar os dois placeholders ao `.env.example` elimina
o atrito de onboarding sem nenhum risco de regressão.

## Current state

### Arquivos relevantes

- `packages/env/src/server.ts` — validação de env vars do servidor via
  `@t3-oss/env-core`; declara as vars obrigatórias.
- `apps/web/.env.example` — template de onboarding commitado; atualmente
  com 25 linhas, sem menção a email.
- `packages/email/src/send.tsx` — usa `env.RESEND_API_KEY` (via client) e
  `env.EMAIL_FROM` diretamente nos dois fluxos de email transacional.

### Schema obrigatório hoje (`packages/env/src/server.ts`, L22–38)

```ts
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),           // L23 — presente no .env.example (L19)
    BETTER_AUTH_SECRET: z.string().min(32),    // L24 — presente (L2)
    BETTER_AUTH_URL: z.url(),                  // L25 — presente (L3)
    CRON_SECRET: z.string().min(32),           // L26 — presente (L25)
    CORS_ORIGIN: z.url(),                      // L27 — presente (L4)
    BETTER_AUTH_URL_ECOMMERCE: z.url().optional(), // L28 — opcional, comentado (L7)
    ECOMMERCE_ORIGIN: z.url().optional(),      // L29 — opcional, comentado (L8)
    NODE_ENV: z.enum([...]).default(...),      // L30–33 — tem default, não precisa
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), // L33 — presente (L16)
    NEXT_PUBLIC_SUPABASE_URL: z.url(),         // L34 — presente (L11)
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: z.string().min(1), // L35 — presente (L12)
    RESEND_API_KEY: z.string().min(1),         // L36 — AUSENTE do .env.example ❌
    EMAIL_FROM: z.string().min(1),             // L37 — AUSENTE do .env.example ❌
  },
  ...
});
```

### Estado atual do `apps/web/.env.example` (L1–25, completo)

```dotenv
# Better Auth
BETTER_AUTH_SECRET="<32+ chars random>"
BETTER_AUTH_URL="http://localhost:3001"
CORS_ORIGIN="http://localhost:3001"

# Better Auth — Ecommerce (opcional no dashboard; obrigatorio no app ecomerce)
# BETTER_AUTH_URL_ECOMMERCE="http://localhost:3002"
# ECOMMERCE_ORIGIN="http://localhost:3002"

# Supabase (cliente público)
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY="sb_publishable_..."

# Supabase (server-only) — obtido em Dashboard > Project Settings > API > service_role
# NUNCA commitar. Usado por server actions em tools/_components/image-actions.ts
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Postgres (pode ser pooler ou direct)
DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"

# Cron (Vercel Cron) — autentica chamadas a /api/cron/* via Bearer.
# Gerar: openssl rand -hex 32
# Em produção: configurar em Vercel > Project Settings > Environment Variables (Production).
# Vercel Cron injeta esse valor automaticamente no header Authorization quando dispara o job.
CRON_SECRET="<64 chars hex aleatorios>"
```

### Vars opcionais/com default — não precisam de entrada no .env.example

- `BETTER_AUTH_URL_ECOMMERCE` e `ECOMMERCE_ORIGIN` — `.optional()`, já
  aparecem comentadas (L7–8 do .env.example).
- `NODE_ENV` — tem `.default("development")`, omitir é correto.
- `UPSTASH_*`, `SUPERFRETE_*`, `ECOMMERCE_SYNC_TOKEN` — **não existem** em
  `packages/env/src/server.ts`; não adicionar.

### Estilo de placeholder vigente no arquivo

- Secret sem formato fixo → `"<32+ chars random>"` ou `"<64 chars hex aleatorios>"`
- Chave de API com prefixo conhecido → `"prefixo_..."` (ex: `"sb_publishable_..."`)
- URL com variável → `"https://<project-ref>.supabase.co"`
- Valor opaco sem prefixo público → `"eyJ..."` (JWT base64)

Resend API keys têm o prefixo público `re_` — usar `"re_..."`. O
`EMAIL_FROM` é um endereço de email — usar um placeholder concreto mas
obviamente não-real: `"noreply@emach.com.br"` (domínio real da empresa, mas
valor que qualquer desenvolvedor reconhece como placeholder de formulário).

## Commands you will need

| Purpose              | Command                                                                           | Expected on success              |
|----------------------|-----------------------------------------------------------------------------------|----------------------------------|
| Drift check          | `git diff --stat 79379ef5..HEAD -- apps/web/.env.example packages/env/src/server.ts` | Sem output (sem drift) ou inspecionar manualmente |
| Verificar ausência   | `grep -n "RESEND\|EMAIL_FROM" apps/web/.env.example`                             | Nenhuma linha (antes da edição)  |
| Verificar adição     | `grep -n "RESEND\|EMAIL_FROM" apps/web/.env.example`                             | 2 linhas com os placeholders     |
| Verificar não-secreto| `grep -vE '^#\|^$\|<\|re_\.\.\.\|noreply@' apps/web/.env.example`               | Nenhuma linha que pareça real    |
| Typecheck            | `bun check-types`                                                                 | exit 0, sem erros                |
| Lint                 | `bun check`                                                                       | exit 0                           |
| Testes               | `bun --cwd apps/web test`                                                         | Verde (baseline ≥ 54 arquivos / 359 testes) |

## Scope

**In scope** (únicos arquivos a modificar):

- `apps/web/.env.example`

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):

- `packages/env/src/server.ts` — schema correto; não alterar.
- `packages/email/src/send.tsx`, `packages/email/src/client.ts` — código correto; não alterar.
- Qualquer arquivo `.env` real (`.env`, `.env.local`, `.env.production`, etc.) — **jamais**.
- `plans/README.md` — atualizar o status nesse arquivo após concluir, mas não tocar em outras linhas.

## Git workflow

- Branch: `advisor/018-env-example-required-vars`
- Commit único após o Step 1 (única modificação de arquivo):
  `docs(dx): adiciona RESEND_API_KEY e EMAIL_FROM ao .env.example`
- Não fazer push nem abrir PR sem instrução explícita.

## Steps

### Step 1: Adicionar seção de email ao `apps/web/.env.example`

Abrir `apps/web/.env.example`. O arquivo termina na linha 25 com
`CRON_SECRET="<64 chars hex aleatorios>"` seguido de um newline final padrão
POSIX (o `Read` mostra L26 em branco — isso é normal). Adicionar ao final do
arquivo um bloco separado por linha em branco:

```dotenv

# Email transacional (Resend) — obrigatório; sem essas vars o boot falha.
# RESEND_API_KEY: obtido em resend.com > API Keys. Prefixo re_ é parte real da chave.
# EMAIL_FROM: endereço verificado no domínio configurado no Resend.
RESEND_API_KEY="re_..."
EMAIL_FROM="noreply@emach.com.br"
```

Regras de ouro ao editar:
1. Os valores `"re_..."` e `"noreply@emach.com.br"` são **placeholders** — não
   substituir por valores reais.
2. Não alterar nenhuma outra linha do arquivo.
3. Se o arquivo já tiver uma linha em branco no final, não duplicar.

**Verify**: `grep -n "RESEND_API_KEY\|EMAIL_FROM" apps/web/.env.example`
→ Deve retornar exatamente 2 linhas, cada uma com o placeholder correspondente.

Exemplo de output esperado:
```
apps/web/.env.example:28:RESEND_API_KEY="re_..."
apps/web/.env.example:29:EMAIL_FROM="noreply@emach.com.br"
```
(Números de linha podem variar em ±1 dependendo da linha em branco de separação.)

### Step 2: Verificar que nenhum valor real foi introduzido

**Verify**: `grep -n "RESEND_API_KEY\|EMAIL_FROM" apps/web/.env.example`
→ Ambas as linhas devem conter apenas placeholders (`re_...` e `noreply@emach.com.br`).

Se qualquer linha retornar uma chave com comprimento real (ex: `re_` seguido
de 20+ caracteres reais) — **STOP**: registrar `file:line` + tipo da
credencial (API key Resend) e recomendar rotação imediata.

### Step 3: Confirmar que o arquivo não foi corrompido

**Verify**: `bun check-types` → exit 0.
**Verify**: `bun check` → exit 0.

Ambos não devem produzir erros novos. O `.env.example` é arquivo de texto
puro não-importado pelo TypeScript ou pelo linter; a ausência de erros
confirma que nenhum arquivo adjacente foi tocado acidentalmente.

### Step 4: Rodar a suíte de testes como sanidade final

**Verify**: `bun --cwd apps/web test` → verde, ≥359 testes passando.

Nenhum teste exercita o `.env.example` diretamente, mas esta verificação
confirma que nenhum arquivo de código foi alterado por engano.

### Step 5: Commit

```bash
git add apps/web/.env.example
git commit -m "docs(dx): adiciona RESEND_API_KEY e EMAIL_FROM ao .env.example"
```

**Verify**: `git show --stat HEAD` → deve listar apenas `apps/web/.env.example`
com `+5` (ou `+6`) linhas adicionadas e `0` deletadas.

## Test plan

Este plano não requer novos testes — é uma alteração puramente documental em
arquivo não-importado pelo código. A suíte existente (`bun --cwd apps/web test`)
serve como guarda: se passar verde após a edição, nenhum arquivo de código foi
alterado acidentalmente.

Não há testes a escrever.

## Done criteria

Machine-checkable. TODOS devem passar:

- [ ] `grep -n "RESEND_API_KEY" apps/web/.env.example` → retorna exatamente 1 linha com `"re_..."`
- [ ] `grep -n "EMAIL_FROM" apps/web/.env.example` → retorna exatamente 1 linha com `"noreply@emach.com.br"`
- [ ] Nenhum valor real de API key ou email no arquivo: `grep -c "re_[A-Za-z0-9]\{10,\}" apps/web/.env.example` → `0`
- [ ] `bun check-types` → exit 0
- [ ] `bun check` → exit 0
- [ ] `bun --cwd apps/web test` → exit 0 com ≥359 testes passando
- [ ] `git diff --name-only HEAD~1 HEAD` → lista apenas `apps/web/.env.example`
- [ ] Status desta entrada em `plans/README.md` atualizado para `DONE`

## STOP conditions

Parar e reportar (não improvisar) se:

- O conteúdo de `apps/web/.env.example` não bate com o "Current state" acima
  (colunas trocadas, vars já presentes, ou arquivo ausente) — o repo pode ter
  mudado desde este plano.
- Qualquer linha do arquivo já contiver um valor que pareça uma API key Resend
  real (`re_` seguido de 10+ caracteres alfanuméricos) ou um endereço de email
  com domínio real (`@emach.com.br` com nome real) — registrar `file:line` +
  tipo (API key Resend / email remetente), **não reproduzir o valor**, e
  recomendar rotação imediata ao operador.
- `packages/env/src/server.ts` contiver vars obrigatórias novas (sem
  `.optional()`) que ainda não constem do `.env.example` além de
  `RESEND_API_KEY` e `EMAIL_FROM` — adicionar ao escopo antes de continuar,
  ou reportar para decisão.
- `bun check-types` ou `bun check` falharem após a edição — investigar se
  outro arquivo foi tocado acidentalmente; não tentar corrigir fora do escopo.

## Maintenance notes

- **Manter sincronia .env.example ↔ server.ts**: sempre que uma nova var
  obrigatória for adicionada a `packages/env/src/server.ts`, adicionar o
  placeholder correspondente ao `apps/web/.env.example` no mesmo PR.
- **Convenção de placeholder**: chaves com prefixo público conhecido → usar
  `"prefixo_..."` (ex: `re_...`, `sb_publishable_...`); sem prefixo →
  `"<descrição>"` (ex: `"<32+ chars random>"`); emails → domínio real com
  nome óbvio de noreply.
- **Vars opcionais**: vars com `.optional()` ou `.default()` não precisam de
  entrada obrigatória, mas podem aparecer comentadas (como `BETTER_AUTH_URL_ECOMMERCE`)
  para orientação.
- **Rotação de credencial**: se durante este plano for encontrado um valor real
  commitado em `apps/web/.env.example`, a credencial deve ser considerada
  comprometida e rotacionada no painel Resend antes de qualquer outro passo.
