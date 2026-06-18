# Plan 019: Corrigir doc-drift que engana agents (enum manager, README, contagem de ADR/testes, typedRoutes, bodySizeLimit)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- CLAUDE.md CONTEXT.md README.md apps/web/CLAUDE.md apps/web/next.config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

Docs divergentes do código são instruções erradas para agentes e humanos. Cinco pontos de drift confirmados enganam qualquer executor que leia os docs sem verificar o código: o enum `manager` foi removido em 2026-06-16 mas três frases em dois arquivos ainda afirmam que ele existe; o README referencia `packages/auth/src/ecommerce.ts` que não existe neste repo (vive no repo ecommerce — ADR-0004); o range de ADRs está desatualizado (vai até 0017, não 0013); a contagem de testes em `apps/web/CLAUDE.md` está congelada em junho-07 enquanto a suíte real tem 54 arquivos / 359 testes; e o doc de `bodySizeLimit` diz `"5mb"` enquanto `next.config.ts` usa `"8mb"`. O comentário obsoleto de `typedRoutes` (Phase 1/2) também é corrigido aqui. Nenhuma dessas correções altera código — apenas docs e um comentário de arquivo de config.

## Current state

### Arquivos em scope e seus papéis

- `CLAUDE.md` (raiz) — guia canônico de stack, auth, anti-patterns e gotchas; 72 linhas.
- `CONTEXT.md` (raiz) — glossário de domínio + lista de ADRs; 174 linhas.
- `README.md` (raiz) — onboarding público, project structure, available scripts; 119 linhas.
- `apps/web/CLAUDE.md` — convenções do app Next 16; contém contagem de testes na L134.
- `apps/web/next.config.ts` — config Next 16; comentário typedRoutes obsoleto na L13–15.

### (a) Enum manager — CLAUDE.md raiz

Arquivo lido em 2026-06-17. Três ocorrências incorretas:

**L12** (tabela Auth):
```
| Dashboard (super_admin/admin/manager/user) | `@emach/auth/dashboard` | default       | `CORS_ORIGIN`      |
```
Deve ser: `super_admin/admin/user` (sem `manager`).

**L22** (Roles dashboard):
```
Roles dashboard: `user.role` enum `super_admin/admin/manager/user`; `user.status` enum `pending/active/suspended`.
```
Deve ser: `user.role` enum `super_admin/admin/user`.

**L24** (Gates role-based):
```
**3 níveis**: `super_admin`/`admin`/`user` (enum ainda tem `manager` = alias de admin).
```
A parte entre parênteses deve ser removida — `manager` foi removido do enum em 2026-06-16 (confirmado em `packages/db/src/schema/auth.ts` L11–15 que lista apenas `"super_admin"`, `"admin"`, `"user"`).

Evidência no código vivo (`packages/db/src/schema/auth.ts:11–15`):
```ts
export const userRoleEnum = pgEnum("user_role", [
	"super_admin",
	"admin",
	"user",
]);
```

### (b) README — referência a `ecommerce.ts` e range de ADRs

**README.md L14** (Stack, auth):
```
**Auth:** Better Auth 1.6 — dual instances (`packages/auth/src/dashboard.ts` + `ecommerce.ts`), dashboard é **convite-only** (ADR-0013)
```
`ecommerce.ts` não existe neste repo (`ls packages/auth/src/` → só `dashboard.ts`). Deve referenciar apenas `dashboard.ts` com nota de que a instância ecommerce vive no repo ecommerce (ADR-0004).

**README.md L84** (Project Structure, `packages/auth/`):
```
│   ├── auth/                        # Better Auth dual: dashboard.ts + ecommerce.ts
```
Idem — deve mencionar apenas `dashboard.ts`.

**README.md L89** (Project Structure, `docs/`):
```
│   ├── adr/                         # Decisões arquiteturais (0001…0013)
```
ADRs vão até 0017 (confirmado: `ls docs/adr/` lista `0001` a `0017`). Deve ser `(0001…0017)`.

### (c) CONTEXT.md — enum manager e ADR-0017 ausente

**CONTEXT.md L42** (glossário, Role):
```
O enum Postgres ainda carrega `manager` por compatibilidade, mas o nível está **aposentado** — `manager` é tratado como `admin` (migração de dado `manager → admin`).
```
Deve ser substituído por: `O enum Postgres tem 3 valores: \`super_admin\`/\`admin\`/\`user\`; o valor \`manager\` foi removido em 2026-06-16 (ADR-0016).`

**CONTEXT.md L171** (lista de ADRs, entrada ADR-0016):
```
- **ADR-0016** — Religar gates com 3 níveis (`manager` aposentado) e Branch-scoping em dois planos (visibilidade + ação); admin filial-scoped, fail-closed, invariante "todo admin/user tem ≥1 filial". Substitui ADR-0012.
```
Texto do ADR-0016 está ok quanto ao conteúdo; `manager aposentado` pode permanecer como informação histórica da decisão (o ADR documenta o que foi feito). Não alterar.

**CONTEXT.md — ausência de ADR-0017**: A lista de ADRs termina em ADR-0016 (L171–172). Falta adicionar entrada para ADR-0017 (arquivo existe: `docs/adr/0017-permissoes-por-usuario.md`, 7.7K). Deve ser adicionado após a entrada de ADR-0016.

### (d) apps/web/CLAUDE.md — contagem de testes

**apps/web/CLAUDE.md L134**:
```
`bun --cwd apps/web test` (vitest, `environment: node`). Suíte verde (30 arquivos / 183 testes em 2026-06-07).
```
Contagem real verificada agora: **54 arquivos / 359 testes** (executado `bun --cwd apps/web test` → "Test Files 54 passed (54) / Tests 359 passed (359)"). Data de referência: 2026-06-17.

### (e) apps/web/next.config.ts — comentário typedRoutes obsoleto

**apps/web/next.config.ts L13–15**:
```ts
// typedRoutes temporariamente desabilitado durante Phase 1 foundation — muitas rotas
// criadas antes de seus pages existirem (stock, categories, suppliers, branches).
// Re-habilitar na Phase 2 quando todos os pages estiverem populados.
```
As 39+ pages existem. O comentário Phase 1/2 é histórico. Substituir por comentário neutro que não induz a ligar `typedRoutes: true` (ligar é tarefa separada fora de escopo deste plano — requer auditoria de todos os `href` no codebase).

### (f) CLAUDE.md raiz — bodySizeLimit

**CLAUDE.md raiz L47** (Gotchas):
```
**Server actions com upload base64:** limite Next 16 default é 1MB. Configurado em `apps/web/next.config.ts` como `experimental.serverActions.bodySizeLimit = "5mb"`.
```
Valor real no código (`apps/web/next.config.ts L22`): `bodySizeLimit: "8mb"`. Deve ser corrigido para `"8mb"`.

## Commands you will need

| Propósito       | Comando                                                  | Esperado no sucesso          |
|-----------------|----------------------------------------------------------|------------------------------|
| Drift check     | `git diff --stat 79379ef5..HEAD -- CLAUDE.md CONTEXT.md README.md apps/web/CLAUDE.md apps/web/next.config.ts` | sem saída (nenhum arquivo mudou) ou listar arquivos para comparação manual |
| Typecheck       | `bun check-types`                                        | exit 0, sem erros            |
| Lint/format     | `bun check`                                              | exit 0                       |
| Testes          | `bun --cwd apps/web test`                                | 54 arquivos / 359 testes, exit 0 |
| Verificar enum  | `grep -n "manager" CLAUDE.md CONTEXT.md`                 | sem referência ao enum (ok ter "manager aposentado" no histórico do ADR-0016) |
| Verificar README auth | `grep -n "ecommerce.ts" README.md`                 | zero matches                 |
| Verificar ADR range | `grep -n "0001.*0013\|0001.*0017" README.md`         | deve mostrar `0017`          |
| Verificar bodySizeLimit doc | `grep -n "bodySizeLimit\|5mb\|8mb" CLAUDE.md` | deve mostrar `"8mb"`, não `"5mb"` |
| Verificar contagem testes | `grep -n "arquivos\|testes" apps/web/CLAUDE.md`  | deve mostrar `54 arquivos / 359 testes` |

## Scope

**In scope** (únicos arquivos a modificar):

- `CLAUDE.md` (raiz) — L12, L22, L24, L47
- `CONTEXT.md` (raiz) — L42, e adicionar entrada ADR-0017 após L171
- `README.md` (raiz) — L14, L84, L89
- `apps/web/CLAUDE.md` — L134
- `apps/web/next.config.ts` — L13–15 (apenas o comentário; `typedRoutes: false` NÃO muda)

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):

- `packages/db/src/schema/auth.ts` — código correto, não mexer.
- `apps/web/next.config.ts` linha `typedRoutes: false` — ligar `typedRoutes: true` é tarefa separada fora de escopo.
- `apps/web/src/lib/permissions.ts` — código correto.
- `packages/auth/src/dashboard.ts` — código correto.
- `plans/README.md` — atualizar o índice é responsabilidade do executor ao final; NÃO criar/editar `plans/README.md` neste plano além de marcar o status desta entrada.
- Qualquer arquivo em `docs/adr/` — ADRs são imutáveis após aceitos.
- `packages/db/CLAUDE.md` e `apps/web/src/lib/permissions.ts` CLAUDE.md — já corretos quanto ao `manager`.

## Git workflow

- Branch: `advisor/019-fix-doc-drift`
- Commits em Conventional Commits PT, subject ≤50 chars; um commit por passo ou agrupar os doc-only num único commit faz sentido aqui — sugestão: 1 commit por arquivo editado para rastreabilidade.
- Exemplo de mensagem: `docs: remove enum manager obsoleto do CLAUDE.md`
- NÃO fazer push nem abrir PR sem instrução explícita.

## Steps

### Step 1: Criar branch

```bash
git checkout -b advisor/019-fix-doc-drift
```

**Verify**: `git branch --show-current` → `advisor/019-fix-doc-drift`

---

### Step 2: Corrigir CLAUDE.md raiz — enum manager e bodySizeLimit

Abrir `CLAUDE.md` (raiz). Fazer as seguintes alterações (ler o arquivo antes de editar):

**2a — L12**, tabela Auth, coluna Instância:
- Antes: `Dashboard (super_admin/admin/manager/user)`
- Depois: `Dashboard (super_admin/admin/user)`

**2b — L22**, parágrafo "Roles dashboard":
- Antes: `` `user.role` enum `super_admin/admin/manager/user` ``
- Depois: `` `user.role` enum `super_admin/admin/user` ``

**2c — L24**, parágrafo "Gates role-based":
- Antes: `**3 níveis**: \`super_admin\`/\`admin\`/\`user\` (enum ainda tem \`manager\` = alias de admin).`
- Depois: `**3 níveis**: \`super_admin\`/\`admin\`/\`user\`.`
  (remover apenas o trecho entre parênteses; o resto da frase permanece intacto)

**2d — L47**, Gotchas, bodySizeLimit:
- Antes: `experimental.serverActions.bodySizeLimit = "5mb"`
- Depois: `experimental.serverActions.bodySizeLimit = "8mb"`

**Verify**:
```bash
grep -n "manager" CLAUDE.md
```
→ zero matches (nenhuma linha deve citar `manager` no contexto do enum de roles).

```bash
grep -n "5mb\|8mb" CLAUDE.md
```
→ deve mostrar `"8mb"` na linha do bodySizeLimit, sem `"5mb"`.

Commit:
```
docs: remove enum manager e corrige bodySizeLimit no CLAUDE.md
```

---

### Step 3: Corrigir CONTEXT.md — enum manager e ADR-0017

Abrir `CONTEXT.md`. Fazer as seguintes alterações:

**3a — L42**, glossário Role, frase sobre manager:
- Antes: `O enum Postgres ainda carrega \`manager\` por compatibilidade, mas o nível está **aposentado** — \`manager\` é tratado como \`admin\` (migração de dado \`manager → admin\`).`
- Depois: `O enum Postgres tem 3 valores: \`super_admin\`/\`admin\`/\`user\`; o valor \`manager\` foi removido em 2026-06-16 (ADR-0016).`

**3b — após L171** (entrada ADR-0016, que é a última da lista), adicionar nova entrada para ADR-0017:
```
- **ADR-0017** — Overrides de capability por usuário: registry declarativo (`capabilities.ts`), tabela `user_capability_override` (text livre, não pgEnum), `can()` async com request-cache, anti-escalada em grant, auditoria em `userActivityLog`. Estende ADR-0016.
```
(O ponto após ADR-0016 com "Se um output contradiz um ADR existente, sinalize explicitamente em vez de sobrescrever em silêncio." deve permanecer como última linha da seção, após a nova entrada de ADR-0017.)

**Verify**:
```bash
grep -n "ainda carrega.*manager\|manager.*compatibilidade" CONTEXT.md
```
→ zero matches.

```bash
grep -n "ADR-0017" CONTEXT.md
```
→ deve mostrar a nova linha com `ADR-0017`.

Commit:
```
docs: corrige enum manager e adiciona ADR-0017 no CONTEXT.md
```

---

### Step 4: Corrigir README.md — ecommerce.ts e range de ADRs

Abrir `README.md`. Fazer as seguintes alterações:

**4a — L14** (Stack, auth):
- Antes: `**Auth:** Better Auth 1.6 — dual instances (\`packages/auth/src/dashboard.ts\` + \`ecommerce.ts\`), dashboard é **convite-only** (ADR-0013)`
- Depois: `**Auth:** Better Auth 1.6 — instância dashboard em \`packages/auth/src/dashboard.ts\` (convite-only, ADR-0013); instância ecommerce vive no repo ecommerce (ADR-0004)`

**4b — L84** (Project Structure, packages/auth/):
- Antes: `│   ├── auth/                        # Better Auth dual: dashboard.ts + ecommerce.ts`
- Depois: `│   ├── auth/                        # Better Auth dashboard: dashboard.ts (ecommerce no repo ecommerce — ADR-0004)`

**4c — L89** (Project Structure, docs/adr/):
- Antes: `│   ├── adr/                         # Decisões arquiteturais (0001…0013)`
- Depois: `│   ├── adr/                         # Decisões arquiteturais (0001…0017)`

**Verify**:
```bash
grep -n "ecommerce.ts" README.md
```
→ zero matches.

```bash
grep -n "0001.*0017\|0017" README.md
```
→ deve mostrar a linha corrigida do adr com `0017`.

Commit:
```
docs: corrige ref ecommerce.ts e range de ADRs no README.md
```

---

### Step 5: Corrigir apps/web/CLAUDE.md — contagem de testes

Abrir `apps/web/CLAUDE.md`. Editar L134:

- Antes: `` `bun --cwd apps/web test` (vitest, `environment: node`). Suíte verde (30 arquivos / 183 testes em 2026-06-07). ``
- Depois: `` `bun --cwd apps/web test` (vitest, `environment: node`). Suíte verde (54 arquivos / 359 testes em 2026-06-17). ``

**STOP**: Se `bun --cwd apps/web test` retornar contagem diferente de 54/359, use o valor **real medido** e registre a discrepância antes de commitar.

**Verify**:
```bash
grep -n "arquivos.*testes\|testes.*arquivos" apps/web/CLAUDE.md
```
→ deve mostrar `54 arquivos / 359 testes`.

Commit:
```
docs: atualiza contagem de testes no apps/web/CLAUDE.md
```

---

### Step 6: Corrigir comentário typedRoutes em apps/web/next.config.ts

Abrir `apps/web/next.config.ts`. Editar o comentário nas L13–15 (apenas o comentário — `typedRoutes: false` NÃO muda):

- Antes (L13–15):
  ```ts
  // typedRoutes temporariamente desabilitado durante Phase 1 foundation — muitas rotas
  // criadas antes de seus pages existirem (stock, categories, suppliers, branches).
  // Re-habilitar na Phase 2 quando todos os pages estiverem populados.
  ```
- Depois:
  ```ts
  // typedRoutes desabilitado — habilitar requer auditoria de todos os hrefs do codebase.
  ```

**Atenção**: NÃO alterar `typedRoutes: false` → isso fica para outro plano. Apenas o comentário acima dele muda.

**Verify**:
```bash
grep -n "Phase 1\|Phase 2\|typedRoutes" apps/web/next.config.ts
```
→ deve mostrar apenas a linha `typedRoutes: false` e o novo comentário de uma linha; sem referência a "Phase 1" ou "Phase 2".

Commit:
```
docs: atualiza comentário typedRoutes no next.config.ts
```

---

### Step 7: Verificação global e lint

```bash
bun check-types
```
→ exit 0 (docs não afetam tipos; verificar para garantir que nenhuma edição acidental tocou código).

```bash
bun check
```
→ exit 0 (Ultracite lint/format — o hook PostToolUse `bun fix` pode ter já aplicado auto-format, mas rodar explicitamente para garantir).

```bash
bun --cwd apps/web test
```
→ 54 arquivos / 359 testes, exit 0.

---

### Step 8: Atualizar plans/README.md

Abrir `plans/README.md` e marcar o status da entrada `019` como `DONE`.

**Verify**: `grep -n "019" plans/README.md` → mostra linha com status `DONE`.

## Test plan

Este plano não adiciona nem altera código de produção — apenas docs e um comentário de config. Não há novos testes a escrever.

A verificação de regressão é:

- `bun check-types` → exit 0 (sem erros de tipos introduzidos por acidente).
- `bun check` → exit 0 (sem violações de lint/format).
- `bun --cwd apps/web test` → 54 arquivos / 359 testes passando (linha de base não regrediu).
- `bun guard:forms` → exit 0 (AST-grep rules intactas).

## Done criteria

Machine-checkable. TODOS devem ser verdadeiros:

- [ ] `grep -n "manager" CLAUDE.md CONTEXT.md` → zero matches que referenciem o enum de role (referências históricas em texto de ADR-0016 dentro do CONTEXT.md são aceitáveis se descritas como "aposentado"; a frase de L42 do CONTEXT.md deve estar corrigida)
- [ ] `grep -n "ecommerce.ts" README.md` → zero matches
- [ ] `grep -n "0001.*0013" README.md` → zero matches (o range desatualizado foi removido)
- [ ] `grep -n "ADR-0017" CONTEXT.md` → ≥1 match (nova entrada adicionada)
- [ ] `grep -n "54 arquivos / 359 testes" apps/web/CLAUDE.md` → ≥1 match
- [ ] `grep -n "5mb" CLAUDE.md` → zero matches no contexto de bodySizeLimit
- [ ] `grep -n "8mb" CLAUDE.md` → ≥1 match
- [ ] `grep -n "Phase 1\|Phase 2" apps/web/next.config.ts` → zero matches
- [ ] `bun check-types` → exit 0
- [ ] `bun check` → exit 0
- [ ] `bun --cwd apps/web test` → exit 0, 54 arquivos / 359 testes
- [ ] `git diff --name-only` mostra apenas os arquivos in-scope (zero fora deles)
- [ ] `plans/README.md` status atualizado para `DONE`

## STOP conditions

Parar e reportar (não improvisar) se:

- O texto nos arquivos nos pontos indicados não corresponder aos excerpts de "Current state" (o repo derivou desde a escrita do plano — tratar como drift e reportar).
- `bun --cwd apps/web test` retornar contagem diferente de 54 arquivos / 359 testes — usar o valor real, mas reportar a discrepância antes de commitar.
- `bun check` ou `bun check-types` falhar após as edições (um arquivo doc foi acidentalmente corrompido ou o hook auto-format gerou conflito).
- Qualquer edição parecer exigir tocar um arquivo fora da lista in-scope.
- O arquivo `packages/auth/src/ecommerce.ts` existir no repo (significa que o finding (b) estava errado — verificar `ls packages/auth/src/` antes do Step 4).

## Maintenance notes

- **Contagem de testes**: deve ser atualizada sempre que a suíte crescer significativamente. Considerar remover a contagem hardcoded e substituir por "ver output de `bun --cwd apps/web test`" para evitar drift futuro.
- **typedRoutes**: quando for habilitado (`typedRoutes: true`), remover o comentário de `next.config.ts` inteiramente e adicionar nota em `apps/web/CLAUDE.md` sobre a convenção de `href` tipado.
- **ADR-0017**: a entrada adicionada ao CONTEXT.md é um resumo; o documento canônico completo está em `docs/adr/0017-permissoes-por-usuario.md`.
- **Enum manager**: se algum dia o valor voltar ao enum Postgres (improvável), o ADR-0016 deve ser atualizado primeiro — não restaurar as frases removidas sem esse embasamento.
- **Reviewer**: confirmar via `git diff 79379ef5..HEAD -- '*.ts' '*.tsx'` que zero arquivos TypeScript foram modificados (apenas docs + next.config.ts comentário).
