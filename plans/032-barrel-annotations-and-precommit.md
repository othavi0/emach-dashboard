# Plan 032: Anotar barrels permitidos e ativar pre-commit via lefthook

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- CLAUDE.md apps/web/src/lib/masks/index.ts packages/db/src/schema/index.ts lefthook.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

O `CLAUDE.md` lista apenas `packages/db/src/schema/index.ts` como exceção
permitida ao anti-pattern de barrel files, mas `apps/web/src/lib/masks/index.ts`
também é um barrel intencional com `biome-ignore` válido sem correspondência
na documentação. Um executor (humano ou model) que leia o CLAUDE.md e encontre
o barrel de masks sem entender a exceção pode removê-lo ou duplicar a anotação
sem saber por quê. Além disso, não há pre-commit hook configurado no
repositório: commits feitos fora do harness do Claude Code
(por humanos via CLI, outro editor, CI) não passam por `bun fix` antes do push,
deixando o CI como único gate de lint/format. Ativar o pre-commit com `bun fix`
fecha essa janela e torna o comportamento de auto-format consistente para todos
os contribuidores.

## Current state

### Barrels com biome-ignore (estado atual)

Há exatamente dois arquivos com `biome-ignore lint/performance/noBarrelFile`:

**`packages/db/src/schema/index.ts:1`** — barrel público do pacote `@emach/db/schema`:
```ts
// biome-ignore lint/performance/noBarrelFile: intentional public API barrel for @emach/db schema consumers
export * from "./attributes";
export * from "./auth";
// ... (20 re-exports)
```

**`apps/web/src/lib/masks/index.ts:10`** — barrel de máscaras de input:
```ts
// biome-ignore lint/performance/noBarrelFile: pasta de máscaras intencionalmente reexporta para import ergonômico
export { cepMask } from "./cep";
export { cestMask } from "./cest";
// ... (11 named re-exports)
```

### O que NÃO é barrel (importante: corrigir o brief original)

`packages/db/src/index.ts` (linhas 1–147) **não é barrel** pela definição do biome
(`noBarrelFile` dispara apenas em arquivos que só re-exportam). Esse arquivo
importa schemas de `./schema/*`, monta o objeto `schema` local (linhas 81–141),
e exporta `createDb()` (linha 143) e `db` (linha 147) — lógica real, não só
re-export. O biome não o sinaliza; nenhuma anotação é necessária.

Verificação: `npx @biomejs/biome lint packages/db/src/index.ts` → `No fixes applied`.

### CLAUDE.md — lista de exceções desatualizada

`CLAUDE.md:34` (raiz do monorepo):
```
- Barrel files (`index.ts` re-export only). Exceção: `packages/db/src/schema/index.ts` (marcado com biome-ignore).
```

`apps/web/src/lib/masks/index.ts` tem `biome-ignore` válido mas não consta aqui.

### pre-commit hook — inexistente

Não há `lefthook.yml` no repositório, lefthook **não está nas dependências**, e
nenhum hook git ativo existe (`ls .git/hooks/` mostra apenas arquivos `.sample`).
Este plano cria a configuração do zero (devDep + `lefthook.yml` + script `prepare`).

O hook PostToolUse do harness (`.claude/settings.json`) já roda `bun fix` após
`Write`/`Edit` no Claude Code. O pre-commit do lefthook é complementar: protege
commits humanos e outros clientes git.

### Comando bun fix

`package.json:37`: `"fix": "ultracite fix"` — formata e corrige o monorepo
inteiro. É o mesmo comando que o hook PostToolUse executa (com flag extra
`--skip=correctness/noUnusedImports` no harness; o lefthook usará a versão
simples, que é idempotente se executado após o harness).

## Commands you will need

| Purpose               | Command                                              | Expected on success              |
|-----------------------|------------------------------------------------------|----------------------------------|
| Lint completo         | `bun check`                                          | exit 0, `No fixes applied`       |
| Typecheck             | `bun check-types`                                    | exit 0, sem erros                |
| Testes                | `bun --cwd apps/web test`                            | todos passam (≥ 359 testes)      |
| Guard de forms        | `bun guard:forms`                                    | exit 0                           |
| Build                 | `bun run --cwd apps/web build`                       | exit 0                           |
| Verificar barrel lint | `npx @biomejs/biome lint <arquivo>`                  | `No fixes applied`               |
| Instalar hooks git    | `bunx lefthook install`                              | exit 0, `Hooks installed`        |
| Testar hook           | `bunx lefthook run pre-commit`                       | exit 0                           |
| Ver hooks instalados  | `ls .git/hooks/pre-commit`                           | arquivo existe                   |

## Scope

**In scope** (os únicos arquivos que você deve modificar):

- `CLAUDE.md` (raiz) — atualizar a lista de exceções de barrels (linha 34)
- `lefthook.yml` (raiz) — **criar** (não existe) com a configuração pre-commit
- `package.json` (raiz) — adicionar `lefthook` em `devDependencies` + script `prepare` (`lefthook install`) para reprodutibilidade em clones novos
- `bun.lock` (raiz) — atualizado por `bun add` (não editar à mão)

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):

- `packages/db/src/index.ts` — não é barrel; nenhuma anotação necessária
- `packages/db/src/schema/index.ts` — já tem anotação correta; não modificar
- `apps/web/src/lib/masks/index.ts` — biome-ignore já correto; não modificar
- `.claude/settings.json` — hook PostToolUse não deve ser alterado; lefthook é complementar, não substituto
- Qualquer refatoração do barrel de `@emach/db/schema` — L-effort, fora de escopo
- `packages/db/CLAUDE.md` — documenta `schema/index.ts`; já correto, não duplicar

## Git workflow

- Branch: `advisor/032-barrel-annotations-and-precommit`
- Um commit por passo lógico; estilo Conventional Commits em PT, subject ≤ 50 chars
  - Exemplo do repo: `docs(perf): planos de auditoria + skill improve`
  - Para este plano: `docs(dx): anotar barrels + ativar lefthook pre-commit`
- NÃO fazer push nem abrir PR sem instrução explícita.

## Steps

### Step 1: Criar branch de trabalho

```bash
git checkout -b advisor/032-barrel-annotations-and-precommit
```

**Verify**: `git branch --show-current` → `advisor/032-barrel-annotations-and-precommit`

---

### Step 2: Atualizar lista de exceções de barrels no CLAUDE.md

Abrir `CLAUDE.md` (raiz). Localizar a linha 34 (seção "Anti-patterns banidos"):

**Estado atual (linha 34):**
```
- Barrel files (`index.ts` re-export only). Exceção: `packages/db/src/schema/index.ts` (marcado com biome-ignore).
```

**Substituir por:**
```
- Barrel files (`index.ts` re-export only). Exceções marcadas com `biome-ignore lint/performance/noBarrelFile`: `packages/db/src/schema/index.ts` (API pública do pacote `@emach/db`) e `apps/web/src/lib/masks/index.ts` (import ergonômico das máscaras de input). Outros barrels em `src/index.ts` de pacotes que exportam lógica real (ex: `packages/db/src/index.ts`) **não são barrels** pela definição do biome — não precisam de anotação.
```

ATENÇÃO: O hook PostToolUse (`bun fix`) pode reformatar o arquivo após `Edit`.
Se a linha ficar diferente, re-ler o arquivo antes de verificar — o conteúdo
semântico deve estar correto.

**Verify**: `grep -c "masks/index.ts" CLAUDE.md` → `1` (exatamente uma ocorrência na seção Anti-patterns)

---

### Step 3: Adicionar lefthook (devDep + script prepare + config)

`lefthook.yml` **não existe** e lefthook **não é dependência**. Primeiro adicione
lefthook como devDependency da raiz:

```bash
bun add -d lefthook
```

Em seguida adicione um script `prepare` ao `package.json` (raiz, bloco `scripts`)
para que clones novos instalem os hooks automaticamente em `bun install`:

```json
"prepare": "lefthook install"
```

**Verify**: `grep -c '"lefthook"' package.json` → ≥ 1 (devDependencies);
`grep -c '"prepare"' package.json` → `1`

Por fim, **crie** `lefthook.yml` na raiz com o conteúdo:

```yaml
# Lefthook — git hooks para o monorepo emach-dashboard
# Docs: https://lefthook.dev/configuration/
#
# O hook `pre-commit` espelha o PostToolUse do harness Claude Code
# (.claude/settings.json: `bun fix`), tornando o auto-format consistente
# para commits humanos e outros clientes git.
#
# ATENÇÃO: não remover o PostToolUse do harness — lefthook e harness são
# complementares (harness roda em Write/Edit; lefthook roda no git commit).
# Os dois são idempotentes juntos.

pre-commit:
  jobs:
    - name: lint-fix
      run: bun fix
    - name: stage-fixes
      run: git add -u
```

**Verify**: `grep -n "pre-commit" lefthook.yml` → exibe a linha com `pre-commit:`

---

### Step 4: Instalar os hooks git via lefthook

```bash
bunx lefthook install
```

Lefthook lê `lefthook.yml` e instala o script em `.git/hooks/pre-commit`.

**Verify**: `ls .git/hooks/pre-commit` → arquivo existe (não `.sample`)

---

### Step 5: Testar o hook em dry-run

```bash
bunx lefthook run pre-commit
```

Deve rodar `bun fix` e `git add -u` sem erros. Se não houver arquivos staged,
`bun fix` ainda roda no monorepo inteiro e retorna exit 0.

**Verify**: saída contém `lint-fix` e `stage-fixes` sem `FAILED`; exit 0

---

### Step 6: Verificar que bun check continua verde

```bash
bun check
```

**Verify**: `exit 0`, saída `No fixes applied` (ou `Fixes applied` se o hook
auto-formatou algo — desde que exit 0 ao rodar uma segunda vez)

---

### Step 7: Verificar typecheck e testes

```bash
bun check-types && bun --cwd apps/web test
```

**Verify**: `bun check-types` exit 0 sem erros; `bun --cwd apps/web test`
mostra todos os testes passando (baseline ≥ 359 testes)

---

### Step 8: Commit

```bash
git add CLAUDE.md lefthook.yml package.json bun.lock
git commit -m "docs(dx): anotar barrels + ativar lefthook pre-commit"
```

**Verify**: `git log --oneline -1` → mostra o commit com a mensagem acima;
`git diff HEAD~1 --name-only` → lista `CLAUDE.md`, `lefthook.yml`, `package.json` e `bun.lock`

## Test plan

Este plano não introduz código de produção nem testes unitários novos.
A verificação é comportamental:

1. **Hook instalado**: `ls .git/hooks/pre-commit` existe após `bunx lefthook install`.
2. **Hook funcional**: `bunx lefthook run pre-commit` exit 0 sem `FAILED`.
3. **Lint não regride**: `bun check` exit 0 antes e depois das mudanças.
4. **Testes não regridem**: `bun --cwd apps/web test` baseline ≥ 359 testes passando.
5. **Documentação coerente**: `grep "masks/index.ts" CLAUDE.md` encontra a
   menção à exceção.

Não há arquivo de teste novo a criar — todas as verificações são comandos
de lint/hook já listados na tabela de comandos.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check` exits 0
- [ ] `bun check-types` exits 0
- [ ] `bun --cwd apps/web test` exits 0, todos os testes passam (≥ 359)
- [ ] `bun guard:forms` exits 0
- [ ] `grep "masks/index.ts" CLAUDE.md` retorna ≥ 1 linha na seção de Anti-patterns
- [ ] `grep -n "pre-commit:" lefthook.yml` retorna ≥ 1 linha (não dentro de comentário)
- [ ] `ls .git/hooks/pre-commit` → arquivo existe
- [ ] `bunx lefthook run pre-commit` exits 0 sem `FAILED`
- [ ] `git diff HEAD~1 --name-only` lista somente `CLAUDE.md`, `lefthook.yml`, `package.json` e `bun.lock`
      (nenhum arquivo fora do scope foi modificado)
- [ ] `plans/README.md` status row atualizado para DONE

## STOP conditions

Parar e reportar (não improvisar) se:

- O conteúdo de `CLAUDE.md:34` não contém `packages/db/src/schema/index.ts`
  como descrito em "Current state" (o arquivo sofreu drift).
- `lefthook.yml` já contém uma seção `pre-commit:` ativa (não apenas comentada)
  diferente do descrito — não sobrescrever sem revisar o que está lá.
- `bunx lefthook install` falha com erro diferente de "not found" (nesse caso,
  adicionar `lefthook` como devDep e tentar de novo).
- `bunx lefthook run pre-commit` retorna `FAILED` na job `lint-fix` após `bun fix`
  ter rodado — indica que `bun fix` tem erros não-fixáveis; reportar o output.
- `bun check` começa a falhar após qualquer alteração neste plano.
- O hook PostToolUse do harness (`.claude/settings.json`) entrar em conflito
  com o pre-commit (loop de re-format infinito). Nesse caso, documentar e tornar
  o lefthook idempotente, mas NÃO remover o hook do harness.

## Maintenance notes

- **Conflito harness × lefthook**: os dois são intencionalmente idempotentes.
  O harness roda `bun fix --skip=correctness/noUnusedImports` em `Write`/`Edit`;
  o lefthook roda `bun fix` (sem skip) no `git commit`. A diferença de flag é
  deliberada: o harness pula `noUnusedImports` para não bloquear edições
  intermediárias; o pre-commit final aplica a regra completa. Se o CI começar
  a falhar por `noUnusedImports` nunca ter sido corrigido, revisar a flag do
  lefthook ou alinhar com o harness.
- **Novos barrels intencionais**: ao criar um novo barrel, adicionar
  `// biome-ignore lint/performance/noBarrelFile: <justificativa>` no arquivo
  E adicionar o caminho à lista de exceções em `CLAUDE.md:34`.
- **lefthook e CI**: o lefthook roda apenas em máquinas com o hook instalado
  (`bunx lefthook install` precisa ter sido executado). No CI (GitHub Actions),
  o hook não roda automaticamente — o CI usa `bun check` direto. Se quiser
  enforçar no CI também, adicionar `bun check` ao workflow (já coberto pelo
  `ci.yml` existente).
- **`packages/db/src/index.ts` não é barrel**: o brief original da auditoria
  descreveu esse arquivo como barrel. Confirmado em recon que ele contém lógica
  real (`createDb()`, `db`, objeto `schema`) e o biome não o sinaliza.
  Nenhuma anotação ou mudança é necessária nele.
