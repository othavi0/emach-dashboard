# Plan 017: CI executa testes automaticamente e `bun verify` encadeia types+lint+tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- .github/workflows/ci.yml package.json CLAUDE.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

O CI atual (`quality` job) roda lint, typecheck e guard de forms, mas **não roda os testes**
(359 testes em permissions, orders, cursor, schemas). Regressões em lógica testada passam
pelo CI sem serem detectadas. Além disso, não há comando único que reproduza localmente
exatamente o que o CI verifica — um dev precisa lembrar de rodar `bun check-types`, `bun check`
*e* `bun --cwd apps/web test` separadamente. Adicionar o step de testes ao CI e o script
`bun verify` fecha ambas as lacunas com risco zero (os testes são completamente mockados —
não precisam de DB, secrets ou env real).

## Current state

**`.github/workflows/ci.yml`** — pipeline único no job `quality`, linhas 1–43:

```yaml
# .github/workflows/ci.yml:24-43
      - name: Lint (ultracite)
        run: bun check

      - name: Typecheck
        run: bun check-types

      - name: Guard de forms — self-test da regra
        run: |
          out="$(bun guard:forms:test 2>&1)"
          echo "$out"
          echo "$out" | grep -qE '[1-9][0-9]* passed' || {
            echo "::error::regra raw-validation-error não carregou (0 casos testados)"
            exit 1
          }

      - name: Guard de forms — scan
        run: bun guard:forms
```

Não existe nenhum step com `bun --cwd apps/web test` ou variante.

**`package.json` (raiz)** — seção `scripts`, linhas 23–39:

```json
// package.json:23-39
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "check-types": "turbo check-types",
    "clean": "bash scripts/clean.sh",
    ...
    "check": "ultracite check",
    "fix": "ultracite fix",
    "guard:forms": "ast-grep scan",
    "guard:forms:test": "ast-grep test --skip-snapshot-tests"
  },
```

Não existe script `verify`.

**`apps/web/package.json`** — script de test (linha 10):

```json
// apps/web/package.json:10
    "test": "vitest run",
```

**`apps/web/vitest.config.ts`** — ambiente e resolução de alias (linhas 1–22):
- `environment: "node"` — sem browser, sem DOM, sem Supabase/DB real.
- `server-only` resolvido via alias para `src/__mocks__/server-only.ts` (stub vazio).
- Inclui `__tests__/**/*.test.ts`, `src/**/*.test.ts`, `src/**/*.test.tsx`.

Os testes mockam `@emach/db` via `vi.hoisted` + `vi.mock` (padrão docuementado em
`apps/web/CLAUDE.md` seção "Testes"). Nenhuma credencial ou variável de ambiente real é
necessária para rodar a suíte.

**Baseline atual:** 359 testes (conforme brief; a seção "Testes" de `apps/web/CLAUDE.md`
cita uma versão mais antiga — 183 testes de 2026-06-07; o número cresce com a codebase;
o baseline correto é o resultado de `bun --cwd apps/web test` no HEAD atual).

**`CLAUDE.md` raiz — seção "Smoke run-time"** (linhas 52–56):

```
`check-types` (tsc) também **não pega regras de lint** (`useAwait`, `noNestedTernary`, etc.)
— o CI roda `bun check` (ultracite). Antes de commitar/PR, rodar **`bun check`** além de
`check-types`.
```

Não menciona `bun verify` nem a suite de testes como parte do checklist pré-commit.

## Commands you will need

| Purpose              | Command                              | Expected on success                    |
|----------------------|--------------------------------------|----------------------------------------|
| Rodar testes         | `bun --cwd apps/web test`            | exit 0, todos os testes passam         |
| Typecheck            | `bun check-types`                    | exit 0, sem erros                      |
| Lint                 | `bun check`                          | exit 0, sem erros                      |
| Script verify (novo) | `bun verify`                         | exit 0 (encadeia os 3 acima)           |
| Verificar ci.yml     | `grep -n "Tests\|bun.*test" .github/workflows/ci.yml` | mostra o novo step |

## Scope

**In scope** (os únicos arquivos a modificar):
- `.github/workflows/ci.yml` — adicionar step "Tests" após "Typecheck"
- `package.json` (raiz) — adicionar script `"verify"` na seção `"scripts"`
- `CLAUDE.md` (raiz) — acrescentar uma linha na seção "Smoke run-time" mencionando `bun verify`

**Out of scope** (não tocar, mesmo parecendo relacionado):
- `apps/web/package.json` — já tem o script `test: vitest run`; não alterar
- `apps/web/vitest.config.ts` — não alterar
- Qualquer outro step do CI (Lint, Typecheck, guards) — não reordenar nem reescrever
- `plans/README.md` — atualizado pelo executor **depois** de concluir os passos, não antes

## Git workflow

- Branch: `advisor/017-ci-test-gate-and-verify-script`
- Conventional Commits em PT, subject ≤ 50 chars. Exemplo do projeto: `docs(perf): planos de auditoria + skill improve (#218)`. Para este plano:
  - `ci: adiciona step de testes ao pipeline`
  - `chore: adiciona script verify ao package.json`
  - `docs: menciona bun verify no smoke run-time`
  
  Pode fazer em um único commit `ci(dx): gate de testes + script verify` se preferir.
- **Não** fazer push nem abrir PR sem instrução.

## Steps

### Step 1: Criar branch de trabalho

```bash
git checkout -b advisor/017-ci-test-gate-and-verify-script
```

**Verify**: `git branch --show-current` → `advisor/017-ci-test-gate-and-verify-script`

---

### Step 2: Confirmar que os testes passam no HEAD atual

Antes de alterar qualquer arquivo, validar o baseline:

```bash
bun --cwd apps/web test
```

**Verify**: exit 0, todos os testes passam. Anote o número total (ex.: "359 tests passed").
Se algum teste falhar: **STOP** — registrar falha e não prosseguir; o CI não deve ser
habilitado com testes vermelhos no HEAD.

---

### Step 3: Adicionar step "Tests" ao CI

Edite `.github/workflows/ci.yml`. Insira o seguinte bloco **imediatamente após** o step
"Typecheck" (linha 27 do arquivo atual) e **antes** do step "Guard de forms — self-test da
regra" (linha 30 atual):

```yaml
      - name: Tests
        run: bun --cwd apps/web test
```

O resultado esperado da seção `quality` após a edição (ordem dos steps):

```yaml
      - name: Lint (ultracite)
        run: bun check

      - name: Typecheck
        run: bun check-types

      - name: Tests
        run: bun --cwd apps/web test

      - name: Guard de forms — self-test da regra
        run: |
          out="$(bun guard:forms:test 2>&1)"
          ...

      - name: Guard de forms — scan
        run: bun guard:forms
```

Não alterar nenhuma outra parte do arquivo (steps de checkout, setup-bun, install).

**Verify**:
```bash
grep -n "Tests\|bun --cwd apps/web test" .github/workflows/ci.yml
```
Deve mostrar as duas linhas do novo step (name e run).

---

### Step 4: Adicionar script `verify` ao `package.json` raiz

Edite `package.json` na raiz do monorepo. Na seção `"scripts"`, adicione após `"fix"`:

```json
    "verify": "bun check-types && bun check && bun --cwd apps/web test",
```

O bloco de scripts após a edição deve conter:

```json
    "check": "ultracite check",
    "fix": "ultracite fix",
    "verify": "bun check-types && bun check && bun --cwd apps/web test",
    "guard:forms": "ast-grep scan",
```

> Nota: o hook `PostToolUse` do projeto roda `bun fix` após `Edit`/`Write` e pode
> reordenar campos (`"allowScripts"`, etc.). Se isso acontecer, re-`Read` o arquivo
> antes de qualquer Edit subsequente. O posicionamento exato do script dentro do objeto
> não é crítico — o que importa é que a chave `"verify"` exista com o valor correto.

**Verify**:
```bash
grep '"verify"' package.json
```
Deve retornar:
```
    "verify": "bun check-types && bun check && bun --cwd apps/web test",
```

---

### Step 5: Executar `bun verify` localmente

```bash
bun verify
```

**Verify**: exit 0. As três fases (typecheck → lint → tests) devem concluir sem erros.
Se alguma fase falhar: **STOP** — não commitar; reportar a fase que falhou e o erro.

---

### Step 6: Atualizar nota no `CLAUDE.md` raiz (seção "Smoke run-time")

Edite `CLAUDE.md` na raiz. Localize a seção "Smoke run-time" (linhas 52–56 atuais).
O parágrafo atual termina com:

```
Antes de commitar/PR, rodar **`bun check`** além de `check-types`. Exceção: ...
```

Adicione **ao final do segundo parágrafo** (logo após `check-types`), antes da frase
"Exceção:", a referência ao comando unificado:

```
Atalho: **`bun verify`** encadeia os três (`check-types && check && test`).
```

O resultado final do segundo parágrafo deve ficar:

```
`check-types` (tsc) também **não pega regras de lint** (`useAwait`, `noNestedTernary`,
etc.) — o CI roda `bun check` (ultracite). Antes de commitar/PR, rodar **`bun check`**
além de `check-types`. Atalho: **`bun verify`** encadeia os três
(`check-types && check && test`). Exceção: warnings que o código canônico de referência
também tem ...
```

> Se o hook de auto-format reformatar o arquivo, o conteúdo textual deve ser preservado.
> Re-`Read` se precisar verificar.

**Verify**:
```bash
grep -n "bun verify" CLAUDE.md
```
Deve retornar a linha com a menção ao `bun verify`.

---

### Step 7: Commit

Confirme que apenas os três arquivos in-scope foram modificados:

```bash
git diff --name-only
```

Esperado: `.github/workflows/ci.yml`, `package.json`, `CLAUDE.md` (e apenas esses).

Commite:

```bash
git add .github/workflows/ci.yml package.json CLAUDE.md
git commit -m "ci(dx): gate de testes + script verify"
```

**Verify**: `git log --oneline -1` → mostra o commit com a mensagem acima.

---

### Step 8: Atualizar `plans/README.md`

Localize a linha do plano 017 na tabela de `plans/README.md` e altere o status de
`TODO` para `DONE`.

**Verify**:
```bash
grep "017" plans/README.md
```
Deve mostrar a linha com `DONE`.

## Test plan

Este plano não cria novos testes — ele adiciona a *execução* da suíte existente ao CI.
O "test plan" é a própria suíte:

- Comando: `bun --cwd apps/web test`
- Esperado: exit 0, todos os testes passam (baseline ≥ 359 testes no momento da execução)
- Confirmar no Step 2 (antes das mudanças) e novamente no Step 5 (via `bun verify`)

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun verify` exits 0 (encadeia `check-types && check && bun --cwd apps/web test`)
- [ ] `grep -n "bun --cwd apps/web test" .github/workflows/ci.yml` retorna pelo menos uma linha com o step "Tests"
- [ ] `grep '"verify"' package.json` retorna a linha com `"bun check-types && bun check && bun --cwd apps/web test"`
- [ ] `grep "bun verify" CLAUDE.md` retorna pelo menos uma linha
- [ ] `git diff --name-only HEAD~1` mostra apenas `.github/workflows/ci.yml`, `package.json`, `CLAUDE.md`
- [ ] `plans/README.md` tem status `DONE` para o plano 017

## STOP conditions

Stop e reportar (não improvisar) se:

- O Step 2 mostrar testes vermelhos no HEAD — não habilitar o gate com baseline quebrado.
- O arquivo `.github/workflows/ci.yml` não corresponder ao trecho em "Current state"
  (estrutura do job `quality` diferente) — o plano foi escrito para aquela estrutura.
- `bun verify` falhar por lint ou typecheck (não por testes) nos Steps 5 — o CI também
  falharia; corrigir está fora do escopo deste plano, reportar.
- Os testes exigirem variável de ambiente real (mensagem de erro mencionando secrets,
  `DATABASE_URL`, `SUPABASE_*`, etc.) — não embutir secrets; reportar.
- `git diff --name-only` no Step 7 mostrar arquivos fora do scope (ex: `bun.lockb` é
  esperado se o hook de install rodar; qualquer outro arquivo de código = STOP).

> Nota: `bun.lockb` pode aparecer no diff se o bun regenerar o lockfile ao instalar.
> Isso é aceitável — incluir no commit junto com os três arquivos in-scope.

## Maintenance notes

- **Adicionando novos workspaces com testes no futuro:** o comando `bun --cwd apps/web test`
  é específico do workspace `web`. Se outros pacotes ganharem suítes de teste, adicionar
  steps paralelos no CI (`bun --cwd packages/db test`, etc.) — não consolidar em um único
  `bun test` na raiz sem antes verificar que o turbo pipeline está configurado para isso.
- **Tempo de CI:** a suíte de testes roda em `environment: node` com mocks completos —
  nenhuma chamada de rede real. Deve ser rápida (segundos). Se o CI começar a demorar
  mais de 2 minutos só nos testes, investigar se algum teste passou a fazer I/O real.
- **`bun verify` vs CI:** o script local inclui `bun check-types` que roda via turbo
  (`turbo check-types`), enquanto o CI roda os steps separadamente. O resultado deve ser
  equivalente; se divergir, é sinal de que o turbo pipeline está filtrando algo.
- **Smoke run-time:** `bun verify` não substitui o smoke visual — `check-types` não detecta
  SQL inválido em templates nem imports de hook client em Server Components (ver
  `apps/web/CLAUDE.md` seção "Smoke run-time").
