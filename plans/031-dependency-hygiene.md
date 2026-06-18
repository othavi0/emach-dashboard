# Plan 031: Higiene de dependências: lockfile versionado + alinhamento via catalog + postcss

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- .gitignore .github/workflows/ci.yml package.json packages/ui/package.json apps/web/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dependencies
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`recharts` e `date-fns` têm versões diferentes em `packages/ui` e `apps/web`, o que significa que o bundler pode instalar duas cópias do mesmo pacote — aumentando o bundle e potencialmente causando bugs sutis quando a instância do `packages/ui` e a do `apps/web` não são idênticas (ex: formatters de data com comportamento diferente entre versões minor). O `postcss@8.4.31` é puxado pelo `next@16.2.6` (pin exato em suas deps) e coexiste com o `postcss@8.5.14` — a versão `8.4.31` está abaixo do limiar do advisory GHSA-qx2v-qp2m-jg93 (XSS no stringify), atingível em build/test ainda que não em runtime. A decisão de gitignorar `bun.lock` é **intencional e documentada** (`ci.yml:20`) e não será revertida — a reprodutibilidade fica por conta dos pins do `package.json`; o plano apenas documenta esse fato e foca nos três desalinhamentos concretos.

## Current state

### Arquivos relevantes

- `.gitignore:72` — `bun.lock` na lista de gitignore
- `.github/workflows/ci.yml:20-22` — comentário explica a decisão + `bun install` sem `--frozen-lockfile`
- `package.json:1-21` — raiz do monorepo; contém seção `workspaces.catalog` com dotenv, zod, lucide-react, react, react-dom, sonner, better-auth, @types/react, @types/react-dom, tailwindcss; **não** contém recharts nem date-fns no catalog
- `packages/ui/package.json:21` — `"date-fns": "^4.1.0"` (versão menor)
- `packages/ui/package.json:29` — `"recharts": "3.8.0"` (pin exato sem caret)
- `apps/web/package.json:25` — `"date-fns": "^4.3.0"` (versão maior)
- `apps/web/package.json:32` — `"recharts": "^3.8.0"` (caret)

### Excerpts confirmados

```jsonc
// packages/ui/package.json (linhas 19-34)
"dependencies": {
  "@base-ui/react": "^1.4.0",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "cmdk": "^1.1.1",
  "date-fns": "^4.1.0",          // ← desalinhado: web usa ^4.3.0
  ...
  "recharts": "3.8.0",           // ← pin exato; web usa ^3.8.0
  ...
}
```

```jsonc
// apps/web/package.json (linhas 22-36)
"dependencies": {
  ...
  "date-fns": "^4.3.0",          // ← desalinhado: ui usa ^4.1.0
  ...
  "recharts": "^3.8.0",          // ← caret; ui usa pin exato
  ...
}
```

```jsonc
// package.json (linhas 8-21) — catalog atual, sem recharts/date-fns
"catalog": {
  "dotenv": "^17.4.2",
  "zod": "^4.3.6",
  "lucide-react": "^1.16.0",
  "react": "^19.2.3",
  "react-dom": "^19.2.3",
  "sonner": "^2.0.7",
  "better-auth": "1.6.11",
  "@types/react": "^19.2.10",
  "@types/react-dom": "^19.2.3",
  "tailwindcss": "^4.1.18"
}
```

```yaml
# .github/workflows/ci.yml (linhas 19-22)
      # bun.lock é gitignored neste repo; a reprodutibilidade vem dos pins do package.json.
      - name: Install dependencies
        run: bun install
```

### postcss no lockfile

O `bun.lock` existente (gitignored, local) mostra duas resoluções:
- `postcss@8.5.14` — usado por tailwindcss/vite
- `postcss@8.4.31` — puxado por `next@16.2.6` via pin exato em suas deps (`"postcss": "8.4.31"`)

O `next` pina `postcss` **exatamente** em seu próprio `package.json` (não usa range). Um `overrides` na raiz **não consegue** sobrescrever essa resolução para a dep transitiva do `next` porque o bun respeita o pin exato declarado pelo pacote publicado. A solução viável é aguardar um bump do `next` (já usa `8.5.14` para seus outros consumidores) ou aceitar a coexistência documentada — o vetor de ataque do advisory (XSS no `stringify`) exige que código adversarial seja processado pelo postcss em build/test, sem impacto em runtime de produção.

## Commands you will need

| Purpose           | Command                                | Expected on success             |
|-------------------|----------------------------------------|---------------------------------|
| Install           | `bun install`                          | exit 0                          |
| Typecheck         | `bun check-types`                      | exit 0, sem erros               |
| Lint              | `bun check`                            | exit 0                          |
| Testes            | `bun --cwd apps/web test`              | exit 0, todos verdes            |
| Guard de forms    | `bun guard:forms`                      | exit 0                          |
| Build             | `bun run --cwd apps/web build`         | exit 0                          |
| Ver versões após  | `bun why recharts`                     | uma única versão `3.8.0`        |
| Ver versões após  | `bun why date-fns`                     | uma única versão `4.x.y`        |

## Scope

**In scope** (únicos arquivos a modificar):

- `package.json` (raiz) — adicionar `recharts` e `date-fns` ao catalog
- `packages/ui/package.json` — trocar values por `catalog:`
- `apps/web/package.json` — trocar values por `catalog:`

**Out of scope** (não tocar, mesmo que pareça relacionado):

- `.gitignore` — decisão documentada de não versionar `bun.lock`; não reverter
- `.github/workflows/ci.yml` — comentário e `bun install` sem `--frozen-lockfile` refletem a decisão documentada; não alterar
- Qualquer bump major de framework (next, react, tailwindcss, etc.)
- `shadcn`, `hono`, ou qualquer devDependency sem advisory de segurança de runtime
- Outros packages em `packages/` que não usam recharts/date-fns (auth, db, email, config)

## Git workflow

- Branch: `advisor/031-dependency-hygiene`
- Commits Conventional Commits em PT, subject ≤50 chars
  - Exemplo do repo: `docs(perf): planos de auditoria + skill improve (#218)`
  - Padrão para este plano: `chore(deps): alinhar recharts/date-fns via catalog`
- NÃO fazer push nem abrir PR sem instrução.

## Steps

### Step 1: Adicionar recharts e date-fns ao catalog da raiz

Editar `package.json` na raiz. Na seção `workspaces.catalog` (linhas 9–20), adicionar duas entradas novas. A versão canônica para cada:

- `recharts`: usar `"^3.8.0"` (caret, não pin exato — mantém consistência com o padrão do catalog que usa ranges)
- `date-fns`: usar `"^4.3.0"` (a versão mais alta entre os dois consumers, evita regressão de feature para `apps/web`)

Resultado esperado em `package.json`:

```jsonc
"catalog": {
  "dotenv": "^17.4.2",
  "zod": "^4.3.6",
  "lucide-react": "^1.16.0",
  "react": "^19.2.3",
  "react-dom": "^19.2.3",
  "sonner": "^2.0.7",
  "better-auth": "1.6.11",
  "@types/react": "^19.2.10",
  "@types/react-dom": "^19.2.3",
  "tailwindcss": "^4.1.18",
  "recharts": "^3.8.0",
  "date-fns": "^4.3.0"
}
```

**Verify**: `grep -A 15 '"catalog"' package.json | grep -E 'recharts|date-fns'`
→ deve mostrar as duas entradas com os valores corretos.

### Step 2: Atualizar packages/ui/package.json

Substituir as entradas concretas por referências ao catalog:

- Linha 21: `"date-fns": "^4.1.0"` → `"date-fns": "catalog:"`
- Linha 29: `"recharts": "3.8.0"` → `"recharts": "catalog:"`

**Verify**: `grep -E 'recharts|date-fns' packages/ui/package.json`
→ ambas devem mostrar `"catalog:"` como valor.

### Step 3: Atualizar apps/web/package.json

Substituir as entradas concretas por referências ao catalog:

- Linha 25: `"date-fns": "^4.3.0"` → `"date-fns": "catalog:"`
- Linha 32: `"recharts": "^3.8.0"` → `"recharts": "catalog:"`

**Verify**: `grep -E 'recharts|date-fns' apps/web/package.json`
→ ambas devem mostrar `"catalog:"` como valor.

### Step 4: Reinstalar dependências e confirmar resolução única

```bash
bun install
```

Confirmar que não há duas cópias instaladas:

```bash
bun why recharts
bun why date-fns
```

**Verify**: cada comando deve listar uma única versão resolvida. Se aparecerem duas versões distintas (ex: `3.8.0` e outra), parar e reportar como STOP condition.

### Step 5: Rodar suite de verificação completa

```bash
bun check-types
bun check
bun --cwd apps/web test
bun guard:forms
```

**Verify**: todos os quatro comandos com exit 0. Nenhum erro de tipo novo introduzido pela mudança de `^4.1.0` → `^4.3.0` em `date-fns` (se houver, provavelmente é API removida entre minor versions — reportar como STOP).

### Step 6: Registrar decisão do lockfile como nota no plano e commitar

O bun.lock continua gitignored por decisão explícita (ci.yml:20). Não há nada a mudar — apenas fazer o commit das alterações dos steps 1-3.

Commit:
```
chore(deps): alinhar recharts/date-fns via catalog
```

Mensagem de corpo opcional:
```
DEPS-02/03: recharts e date-fns movidos pro catalog do workspace.
packages/ui usava versões diferentes das de apps/web; agora ambos
referenciam catalog: com range ^3.8.0 e ^4.3.0 respectivamente.

DEPS-01: bun.lock continua gitignored por decisão documentada
(ci.yml:20 — reprodutibilidade via pins do package.json).

DEPS-04: postcss@8.4.31 puxado por next@16.2.6 via pin exato nas
deps publicadas do pacote; overrides não conseguem sobrescrever.
Coexistência aceita — vetor do advisory GHSA-qx2v-qp2m-jg93
(build/test only, não runtime). Monitorar bump do next.
```

**Verify**: `git diff --name-only HEAD` → deve listar exatamente `package.json`, `packages/ui/package.json`, `apps/web/package.json`.

## Test plan

Este plano não requer novos testes — é uma alteração de configuração de dependências, não de código de aplicação. A verificação é inteiramente feita pelos comandos de verificação existentes:

- `bun check-types` cobre que nenhuma API de `date-fns@4.3.0` quebrou tipagem em `packages/ui` (que estava em `^4.1.0`)
- `bun --cwd apps/web test` cobre que nenhuma import de recharts/date-fns quebrou em runtime dos testes
- `bun why recharts` / `bun why date-fns` cobrem que a deduplicação funcionou

Se `bun check-types` falhar após o upgrade de `date-fns` de `^4.1.0` → `^4.3.0` em `packages/ui`, o erro indicará a API exata que mudou — corrigir conforme o erro (não é esperado entre `4.1.0` e `4.3.0` pois são minor releases, mas é possível).

## Done criteria

Machine-checkable. TODOS devem ser verdadeiros:

- [ ] `grep -E '"recharts"|"date-fns"' packages/ui/package.json apps/web/package.json` → todos os matches mostram `"catalog:"` como valor
- [ ] `grep -E '"recharts"|"date-fns"' package.json` → ambos presentes no catalog com ranges `^3.8.0` e `^4.3.0`
- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` exits 0
- [ ] `bun guard:forms` exits 0
- [ ] `git diff --name-only HEAD` lista exatamente 3 arquivos: `package.json`, `packages/ui/package.json`, `apps/web/package.json`
- [ ] `plans/README.md` atualizado com status DONE para este plano

## STOP conditions

Parar e reportar (não improvisar) se:

- O código nas localizações de "Current state" não bater com os excerpts (codebase mudou desde que o plano foi escrito).
- `bun install` falhar ou reportar conflito de versão no catalog.
- `bun why recharts` ou `bun why date-fns` mostrar duas versões distintas após o `bun install` — indica que algum pacote transitivo pina uma versão diferente de forma incompatível com o catalog.
- `bun check-types` falhar com erros em `packages/ui` relacionados a `date-fns` (API quebrada entre `4.1.0` e `4.3.0`).
- Um step de verificação falha duas vezes após tentativa razoável de correção.
- A correção requer tocar arquivo fora da lista in-scope.

## Maintenance notes

- **postcss@8.4.31**: continua presente como dep transitiva do `next@16.2.6` (pin exato no `package.json` publicado do next). Quando o next for atualizado para uma versão que use `postcss@^8.5.x`, essa segunda cópia desaparece automaticamente. Não é necessário criar um override — overrides do bun workspace não sobrescrevem pins exatos declarados por pacotes publicados. Monitorar o changelog do next.
- **bun.lock gitignored**: decisão documentada em `ci.yml:20`. Se em algum momento a equipe decidir versionar o lockfile (para reprodutibilidade total no CI), o passo será: remover a linha `bun.lock` do `.gitignore`, commitar o `bun.lock` gerado localmente, e adicionar `--frozen-lockfile` ao step de install no `ci.yml`. Essa mudança está fora deste plano.
- **Catalog crescimento**: o catalog da raiz agora tem 12 entradas. Se no futuro outro pacote do workspace precisar de `recharts` ou `date-fns`, basta referenciar `"catalog:"` — não é necessário duplicar a versão.
- **Reviewer**: verificar no PR que `apps/web/package.json` e `packages/ui/package.json` não têm mais strings de versão para recharts/date-fns, e que `bun.lock` (se presente localmente no snapshot do PR) mostra resolução única para ambos.
