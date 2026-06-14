# Guard de erro de validação não-fiado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Falhar o CI quando um erro de validação for renderizado como `<p text-destructive>{errors.X}</p>` cru, fora do padrão `<FieldError>`/`<LabeledField>` (#157).

**Architecture:** Uma regra ast-grep (AST de TSX) versionada num projeto ast-grep (`sgconfig.yml` + `tooling/ast-grep/rules/`), exposta por scripts `bun guard:forms` / `bun guard:forms:test`, e executada por um workflow GitHub Actions dedicado. A CLI `@ast-grep/cli` é pinada em devDependencies para CI = local.

**Tech Stack:** ast-grep 0.43.0 (`@ast-grep/cli`), Bun 1.3.x, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-14-forms-error-guard-design.md`

---

## File Structure

- Create: `sgconfig.yml` — config do projeto ast-grep (raiz). `ruleDirs` + `testConfigs`.
- Create: `tooling/ast-grep/rules/raw-validation-error.yml` — a regra.
- Create: `tooling/ast-grep/rule-tests/raw-validation-error-test.yml` — casos valid/invalid (auto-teste da regra).
- Create: `.github/workflows/forms-guard.yml` — workflow CI.
- Modify: `package.json` (raiz) — devDependency `@ast-grep/cli` + scripts `guard:forms`, `guard:forms:test`.
- Modify: `apps/web/CLAUDE.md` — uma linha referenciando o guard na seção "Feedback de erro de validação".

> Nota: a regra é validada por probe — `ast-grep test` passa e `scan` dá **zero match** na base atual.
> Os kinds de TSX usados (`jsx_element`, `jsx_opening_element` via `field: open_tag`, `jsx_expression`,
> `member_expression`) foram confirmados com `--debug-query=ast`.

---

## Task 1: Dependência pinada + scripts

**Files:**
- Modify: `package.json` (raiz)

- [ ] **Step 1: Adicionar a CLI ast-grep às devDependencies**

Em `package.json` raiz, adicionar a `devDependencies` (mantendo ordem alfabética):

```json
"@ast-grep/cli": "0.43.0",
```

- [ ] **Step 2: Adicionar os scripts do guard**

Em `package.json` raiz, no bloco `scripts`, após `"fix": "ultracite fix"`:

```json
"guard:forms": "ast-grep scan",
"guard:forms:test": "ast-grep test --skip-snapshot-tests"
```

- [ ] **Step 3: Instalar**

Run: `bun install`
Expected: lockfile atualizado, `@ast-grep/cli@0.43.0` instalado. Verificar:

Run: `bunx ast-grep --version`
Expected: `ast-grep 0.43.0`

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "build(forms): adiciona @ast-grep/cli e scripts guard:forms (#157)"
```

---

## Task 2: Config do projeto + teste da regra (falha primeiro)

**Files:**
- Create: `sgconfig.yml`
- Create: `tooling/ast-grep/rule-tests/raw-validation-error-test.yml`

Escrevemos o teste e a config **antes** da regra, pra ver o teste falhar por ausência da regra (TDD).

- [ ] **Step 1: Criar a config do projeto ast-grep**

Create `sgconfig.yml` (raiz):

```yaml
ruleDirs:
  - tooling/ast-grep/rules
testConfigs:
  - testDir: tooling/ast-grep/rule-tests
```

- [ ] **Step 2: Criar os casos de teste da regra**

Create `tooling/ast-grep/rule-tests/raw-validation-error-test.yml`:

```yaml
id: raw-validation-error
valid:
  - '<FieldError>{errors.name?.message}</FieldError>'
  - '<p className="text-destructive text-xs">{error}</p>'
  - '<ul className="text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul>'
  - '<div className="flex gap-2"><span className="text-destructive">*</span><X error={errors.name} /></div>'
invalid:
  - '<p className="text-destructive text-xs">{errors.name?.message}</p>'
  - '<span className="mt-1 text-destructive">{errors.email}</span>'
  - '<p className="text-destructive">{errors.cep.message}</p>'
```

- [ ] **Step 3: Rodar o teste e ver falhar (regra ainda não existe)**

Run: `bun guard:forms:test`
Expected: FAIL — ast-grep reclama que a regra `raw-validation-error` não existe / nenhum teste encontrado (a pasta `tooling/ast-grep/rules` está vazia). Exit code ≠ 0.

---

## Task 3: A regra ast-grep (faz o teste passar)

**Files:**
- Create: `tooling/ast-grep/rules/raw-validation-error.yml`

- [ ] **Step 1: Criar a regra**

Create `tooling/ast-grep/rules/raw-validation-error.yml`:

```yaml
id: raw-validation-error
language: tsx
severity: error
message: >-
  Erro de validação renderizado fora do padrão <FieldError>/<LabeledField>. Use
  <FieldError>{errors.campo?.message}</FieldError> ou <LabeledField error={errors.campo}>.
  Exceção legítima: // ast-grep-ignore: raw-validation-error <motivo>
note: |
  Detecta <p|span|div className="...text-destructive...">{errors.X}</...> cru.
  NÃO casa: <FieldError>, {error} de fetch (identifier solto), asterisco required
  aninhado (className em filho não-relacionado), nem errors.map(...) (array local).
rule:
  kind: jsx_element
  all:
    - has:
        field: open_tag
        has:
          kind: jsx_attribute
          all:
            - has: { kind: property_identifier, regex: '^className$' }
            - has: { stopBy: end, kind: string, regex: 'text-destructive' }
    - has:
        kind: jsx_expression
        has:
          stopBy: end
          kind: member_expression
          all:
            - has: { field: object, stopBy: end, kind: identifier, regex: '^errors$' }
            - not: { inside: { kind: call_expression, field: function } }
```

- [ ] **Step 2: Rodar o teste e ver passar**

Run: `bun guard:forms:test`
Expected: PASS — `test result: ok. 1 passed; 0 failed;` (os 4 casos `valid` não casam, os 3 `invalid` casam).

- [ ] **Step 3: Rodar o scan na base e confirmar zero falso positivo**

Run: `bun guard:forms`
Expected: nenhum diagnóstico, exit code 0. A base já está limpa (pós-#155); qualquer match aqui é falso positivo a investigar.

- [ ] **Step 4: Commit**

```bash
git add sgconfig.yml tooling/ast-grep/rules/raw-validation-error.yml tooling/ast-grep/rule-tests/raw-validation-error-test.yml
git commit -m "feat(forms): regra ast-grep contra erro de validação cru (#157)"
```

---

## Task 4: Provar que o guard bloqueia uma regressão real

**Files:**
- (temporário) um form real, revertido ao fim — nada commitado.

Confiança de que o guard de fato falha numa regressão, ponta-a-ponta via o script.

- [ ] **Step 1: Introduzir um erro cru temporário**

Editar `apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx`: adicionar, logo após a primeira tag de abertura do JSX retornado, a linha:

```tsx
<p className="text-destructive text-xs">{errors.name?.message}</p>
```

- [ ] **Step 2: Rodar o guard e confirmar que falha**

Run: `bun guard:forms`
Expected: FAIL — 1 diagnóstico `error[raw-validation-error]` apontando o `<p>` introduzido, exit code 1.

- [ ] **Step 3: Reverter (não deixar resíduo)**

Run: `git checkout -- apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx`
Then run: `bun guard:forms`
Expected: exit code 0 (base limpa de novo). Nada a commitar nesta task.

---

## Task 5: Workflow GitHub Actions

**Files:**
- Create: `.github/workflows/forms-guard.yml`

- [ ] **Step 1: Criar o workflow**

Create `.github/workflows/forms-guard.yml`:

```yaml
name: Forms error guard

on:
  pull_request:
  push:
    branches: [main]

jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.11"

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Self-test da regra
        run: bun guard:forms:test

      - name: Scan dos forms
        run: bun guard:forms
```

- [ ] **Step 2: Validar o YAML do workflow**

Run: `bunx --bun js-yaml .github/workflows/forms-guard.yml > /dev/null && echo OK`
Expected: `OK` (YAML parseável). Se `js-yaml` não estiver disponível, usar: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/forms-guard.yml')); print('OK')"`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/forms-guard.yml
git commit -m "ci(forms): workflow que roda o guard de erro de validação (#157)"
```

---

## Task 6: Documentar a convenção

**Files:**
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Referenciar o guard na seção de forms**

Em `apps/web/CLAUDE.md`, no bullet **"Feedback de erro de validação (sem caixa no topo)"**, ao final do parágrafo (logo após a frase sobre `<FieldError>` nunca ser `<p>` cru), acrescentar:

```markdown
**Enforcement no CI:** a regra ast-grep `raw-validation-error` (`tooling/ast-grep/rules/`) falha o CI se um `{errors.X}` for renderizado num `<p|span|div text-destructive>` cru fora de `<FieldError>` (workflow `forms-guard.yml`; roda local com `bun guard:forms`). Exceção legítima pontual: comentário `// ast-grep-ignore: raw-validation-error <motivo>` na linha.
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs(forms): documenta o guard de erro de validação no apps/web (#157)"
```

---

## Self-Review (do autor do plano)

**Spec coverage:**
- Mecanismo ast-grep no CI → Tasks 1–3, 5. ✅
- Guard falha fora do padrão → Task 4 prova ponta-a-ponta. ✅
- Zero falso positivo + escape hatch → Task 3 Step 3 (scan limpo); escape hatch na `message` da regra (Task 3) e doc (Task 6). ✅
- Convenção em `apps/web/CLAUDE.md` → Task 6. ✅
- Teste anti-regressão da regra → Tasks 2–3 (`ast-grep test`). ✅

**Placeholder scan:** sem TBD/TODO; todo conteúdo é literal e copy-paste. ✅

**Type/command consistency:** scripts `guard:forms` (scan) e `guard:forms:test` (`ast-grep test --skip-snapshot-tests`) usados de forma idêntica em todas as tasks e no workflow. `id: raw-validation-error` consistente entre regra, teste e doc. ✅
