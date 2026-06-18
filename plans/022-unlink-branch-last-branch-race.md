# Plan 022: Fechar a race do guard de última filial em unlinkUserFromBranch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/users/actions.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`unlinkUserFromBranch` lê o role do usuário e conta as filiais restantes em
duas queries separadas, fora de transação, e só então executa o DELETE numa
terceira statement. Duas chamadas concorrentes para as duas últimas filiais do
mesmo `admin` ou `user` podem ambas ler `remaining.n >= 1`, passar o guard, e
ambas deletar — deixando o usuário sem nenhuma filial. O invariante
"todo admin/user tem ≥1 filial" (CLAUDE.md seção Auth, CONTEXT.md #8) é
violado, e o mecanismo fail-closed (`getUserBranchScope` devolve escopo vazio
sem `user_branch`) deixa esse usuário cego — não enxerga nada no dashboard.
Mover count + guard + delete para uma única transação com `FOR UPDATE` elimina
a janela de race sem alterar a lógica de escopo ou role.

## Current state

### Arquivo relevante

- `apps/web/src/app/dashboard/users/actions.ts` — todas as server actions de
  usuários; a função com o bug é `unlinkUserFromBranch` (linha 784–840).

### Trecho atual com bug (linhas 784–839)

```typescript
// actions.ts:784
export async function unlinkUserFromBranch(
    input: unknown
): Promise<ActionResult> {
    const parsed = branchLinkSchema.safeParse(input);
    if (!parsed.success) {
        return { ok: false, error: "validação" };
    }

    const actor = await requireCapabilityWithContext("users.update_branches", {
        targetUserId: parsed.data.userId,
        targetBranchIds: [parsed.data.branchId],
    });

    const { userId: targetUserId, branchId } = parsed.data;

    // Last-branch guard: admin/user precisam de ≥1 filial
    const [targetUser] = await db           // ← query 1: fora de tx
        .select({ role: userTable.role })
        .from(userTable)
        .where(eq(userTable.id, targetUserId))
        .limit(1);
    const [remaining] = await db            // ← query 2: fora de tx
        .select({ n: sql<number>`count(*)::int` })
        .from(userBranch)
        .where(
            and(
                eq(userBranch.userId, targetUserId),
                ne(userBranch.branchId, branchId)
            )
        );
    if (
        targetUser &&
        targetUser.role !== "super_admin" &&
        (remaining?.n ?? 0) < 1
    ) {
        return { ok: false, error: "Usuário precisa de ao menos 1 filial" };
    }

    await db                                // ← query 3: statement separada
        .delete(userBranch)
        .where(
            and(
                eq(userBranch.userId, targetUserId),
                eq(userBranch.branchId, branchId)
            )
        );
    // ...logUserActivity + revalidatePath
}
```

### Padrão de transação com FOR UPDATE (exemplar canônico)

`apps/web/src/app/dashboard/orders/_lib/stock-returns.ts` linhas 42–51 mostra
o padrão: dentro de `db.transaction(async (tx) => { ... })`, o primeiro
`.select(...).for("update")` adquire o lock; mutations subsequentes usam `tx`
(não `db`).

`apps/web/src/app/dashboard/orders/actions.ts` linhas 126–163 mostra
`lockOrderAndAuthorize` — mesmo padrão para lock + guard atômico.

### Convenções obrigatórias neste arquivo

- `"use server"` no topo (linha 1) — já presente, não remover.
- `await requireCapabilityWithContext(...)` antes de qualquer query — já feito
  nas linhas 792–795, mantido sem alteração.
- Retorno `ActionResult` = `{ ok: true; data } | { ok: false; error }` —
  `src/lib/action-result.ts`.
- Erros de banco: `getPgError(e)` de `src/lib/db-error.ts`; em catch:
  `logger.error({ err })` (nunca `console`).
- `revalidatePath` após mutação bem-sucedida — já na linha 838, manter.

### Imports existentes usados na função

```typescript
// actions.ts:6-17
import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { userBranch } from "@emach/db/schema/inventory";
import { and, eq, ne, sql } from "drizzle-orm";
```

Nenhum import novo é necessário.

## Commands you will need

| Purpose            | Command                              | Expected on success              |
|--------------------|--------------------------------------|----------------------------------|
| Typecheck          | `bun check-types`                    | exit 0, sem erros                |
| Lint               | `bun check`                          | exit 0 (ultracite/biome)         |
| Testes             | `bun --cwd apps/web test`            | verde (baseline ≥54 arquivos)    |
| Testes filtrado    | `bun --cwd apps/web test unlink`     | todos passam, ≥3 novos testes    |
| Guard de forms     | `bun guard:forms`                    | exit 0                           |

## Scope

**In scope** (únicos arquivos a modificar):
- `apps/web/src/app/dashboard/users/actions.ts` — aplicar o fix na função `unlinkUserFromBranch`
- `apps/web/src/app/dashboard/users/__tests__/unlink-branch-guard.test.ts` — criar (novo arquivo)

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):
- `apps/web/src/app/dashboard/users/actions.ts` — qualquer função além de `unlinkUserFromBranch` (em especial `linkUserToBranch` — não tem guard, comportamento correto)
- Lógica de escopo/role em `src/lib/permissions.ts`, `src/lib/branch-scope.ts`
- Schema de tabelas em `packages/db/`
- Qualquer outro arquivo de actions

## Git workflow

- Branch: `advisor/022-unlink-branch-last-branch-race`
- Um commit por step lógico; mensagem estilo Conventional Commits em PT, subject ≤50 chars.
  - Exemplo: `fix(users): guard de última filial em transação atômica`
  - Exemplo de teste: `test(users): cobertura do guard de última filial`
- **NÃO** fazer push nem abrir PR sem instrução explícita.

## Steps

### Step 1: Criar a branch de trabalho

```bash
git checkout -b advisor/022-unlink-branch-last-branch-race
```

**Verify**: `git branch --show-current` → `advisor/022-unlink-branch-last-branch-race`

---

### Step 2: Aplicar o fix em `unlinkUserFromBranch`

Abra `apps/web/src/app/dashboard/users/actions.ts`. Leia o arquivo com a
ferramenta Read antes de editar.

Substitua o bloco entre o comentário `// Last-branch guard` e o
`await logUserActivity` (linhas 799–829 conforme o drift check) pela
implementação abaixo.

**Implementação alvo (substituir as três queries soltas por uma transação):**

```typescript
    const { userId: targetUserId, branchId } = parsed.data;

    // Last-branch guard atômico: lê role + lock nas linhas de user_branch
    // dentro de uma única transação para eliminar race condition.
    // Para super_admin o guard não se aplica.
    const deleted = await db.transaction(async (tx) => {
        const [targetUser] = await tx
            .select({ role: userTable.role })
            .from(userTable)
            .where(eq(userTable.id, targetUserId))
            .limit(1);

        if (!targetUser) {
            return "not_found" as const;
        }

        if (targetUser.role !== "super_admin") {
            // Bloqueia as linhas de user_branch deste user para serializar
            // chamadas concorrentes que testariam o mesmo invariante.
            const locked = await tx
                .select({ branchId: userBranch.branchId })
                .from(userBranch)
                .where(eq(userBranch.userId, targetUserId))
                .for("update");

            const remainingAfterDelete = locked.filter(
                (r) => r.branchId !== branchId
            ).length;

            if (remainingAfterDelete < 1) {
                return "last_branch" as const;
            }
        }

        const result = await tx
            .delete(userBranch)
            .where(
                and(
                    eq(userBranch.userId, targetUserId),
                    eq(userBranch.branchId, branchId)
                )
            );

        return result;
    });

    if (deleted === "last_branch") {
        return { ok: false, error: "Usuário precisa de ao menos 1 filial" };
    }
    if (deleted === "not_found") {
        return { ok: false, error: "Usuário não encontrado" };
    }
```

O restante da função (`logUserActivity` + `revalidatePath` + `return { ok: true, data: undefined }`)
permanece inalterado.

**Notas de implementação:**

1. O `.for("update")` em todas as linhas de `user_branch` do usuário serializa
   chamadas concorrentes — a segunda transação bloqueia até a primeira
   confirmar. Quando a primeira deletar, a segunda re-filtra o array `locked`
   e verá `remainingAfterDelete = 0`, retornando `"last_branch"`.

2. O `ne(userBranch.branchId, branchId)` da query original foi substituído por
   filter em memória sobre o `locked` array — isso é intencional: o lock
   precisa cobrir **todas** as linhas do usuário (inclusive a que será
   deletada) para serializar corretamente. Filtrar no SQL deixaria a linha
   alvo sem lock.

3. O `import { ne }` ainda pode ser usado em outros pontos do arquivo — não
   remover do import se existir outro uso. Verificar antes de alterar imports.

**Verify**:
```bash
bun check-types
```
→ exit 0, sem erros em `users/actions.ts`

---

### Step 3: Escrever os testes

Crie o arquivo
`apps/web/src/app/dashboard/users/__tests__/unlink-branch-guard.test.ts`.

**Referência de estrutura de mock:** `apps/web/src/app/dashboard/users/__tests__/invite-schema.test.ts`
para o esqueleto; para mock de `@emach/db` com `vi.hoisted` + `vi.mock`, use
o padrão de `apps/web/src/lib/__tests__/notify.test.ts` como inspiração para
o padrão de mock de módulo externo.

**Nota sobre `server-only`:** módulos que importam `server-only` são
testáveis via alias em `vitest.config.ts` (`server-only → src/__mocks__/server-only.ts`).
Não é necessário `vi.mock("server-only")`.

**Casos a cobrir:**

1. **`admin` com 1 filial → unlink rejeitado** — mock retorna 1 linha locked
   com `branchId === alvo`; espera `{ ok: false, error: "Usuário precisa de ao menos 1 filial" }`.

2. **`admin` com 2 filiais → unlink permitido** — mock retorna 2 linhas
   locked; a filial-alvo é deletada; espera `{ ok: true }`.

3. **`super_admin` com 1 filial → unlink permitido** — guard não se aplica
   para `super_admin`; espera `{ ok: true }`.

4. **Usuário não encontrado → retorna erro genérico** — mock de `userTable`
   retorna array vazio; espera `{ ok: false, error: "Usuário não encontrado" }`.

Como a função é uma server action que chama `requireCapabilityWithContext`,
`logUserActivity`, e `revalidatePath`, esses módulos devem ser mockados.
Estrutura sugerida do arquivo de teste:

```typescript
// apps/web/src/app/dashboard/users/__tests__/unlink-branch-guard.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mockar módulos externos antes do import da função sob teste
vi.mock("@emach/db", () => ({ db: { transaction: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
    requireCapabilityWithContext: vi.fn().mockResolvedValue({
        user: { id: "actor-1" },
    }),
}));
vi.mock("@/lib/activity", () => ({ logUserActivity: vi.fn() }));
vi.mock("@emach/email/send", () => ({ sendInviteEmail: vi.fn() }));
// Outros imports do arquivo de actions que precisam de stub:
vi.mock("@emach/auth/dashboard", () => ({
    authDashboard: {},
    DashboardSession: {},
}));
vi.mock("@emach/env/server", () => ({ env: { INVITE_JWT_SECRET: "x" } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Map()) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/session", () => ({ requireCurrentSession: vi.fn() }));

import { db } from "@emach/db";
import { unlinkUserFromBranch } from "../actions";

describe("unlinkUserFromBranch — last-branch guard", () => {
    beforeEach(() => vi.clearAllMocks());

    it("rejeita quando admin tem exatamente 1 filial", async () => {
        // A função recebe a tx mock via callback de db.transaction
        vi.mocked(db.transaction).mockImplementation(async (fn) => {
            const tx = {
                select: vi.fn().mockReturnValue({
                    from: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([{ role: "admin" }]),
                            for: vi.fn().mockReturnValue(
                                Promise.resolve([{ branchId: "branch-1" }])
                            ),
                        }),
                    }),
                }),
                delete: vi.fn(),
            };
            return fn(tx as never);
        });

        const result = await unlinkUserFromBranch({
            userId: "user-1",
            branchId: "branch-1",
        });

        expect(result).toEqual({
            ok: false,
            error: "Usuário precisa de ao menos 1 filial",
        });
    });

    // demais casos seguem o mesmo padrão — veja comentário de casos acima
});
```

> **Atenção**: o mock do query builder do Drizzle dentro da transação é
> profundo (chain `select().from().where().limit()`). Se a cadeia de métodos
> do tx mudar entre steps (ex: o `for("update")` é chamado em cadeia diferente),
> ajustar o mock de acordo. Prefira testar a lógica de guarda (retorno da
> transação) em vez de verificar as queries exatas chamadas.

**Verify**:
```bash
bun --cwd apps/web test unlink
```
→ todos os testes do arquivo passam (≥4 novos testes)

---

### Step 4: Verificação final completa

```bash
bun check-types && bun check && bun --cwd apps/web test && bun guard:forms
```

**Verify**: todos os comandos exitam 0; suite de testes continua verde com os
novos testes adicionados.

---

### Step 5: Commit

```bash
git add apps/web/src/app/dashboard/users/actions.ts \
        apps/web/src/app/dashboard/users/__tests__/unlink-branch-guard.test.ts
git commit -m "fix(users): guard de última filial em transação atômica"
```

**Verify**: `git log --oneline -1` → exibe o commit com mensagem acima.

---

### Step 6: Atualizar `plans/README.md`

O plano 022 ainda não tem linha na tabela de `plans/README.md`. Adicione uma
linha no final da tabela existente (a tabela tem colunas
`| Plano | Título | Wave | Prioridade | Esforço | Depende de | Status |`):

```
| 022 | Guard de última filial em transação atômica | bug | P2 | S | — | DONE |
```

**Verify**: `grep -n "022" plans/README.md` → retorna ≥1 linha com `022` e `DONE`.

## Test plan

**Arquivo novo**: `apps/web/src/app/dashboard/users/__tests__/unlink-branch-guard.test.ts`

Casos obrigatórios:

| # | Caso | Input | Resultado esperado |
|---|------|-------|--------------------|
| 1 | admin com 1 filial → bloqueado | `role="admin"`, locked=[branch-1] | `{ ok: false, error: "Usuário precisa de ao menos 1 filial" }` |
| 2 | admin com 2 filiais → permitido | `role="admin"`, locked=[branch-1, branch-2] | `{ ok: true, data: undefined }` |
| 3 | super_admin com 1 filial → permitido | `role="super_admin"`, locked=[branch-1] | `{ ok: true, data: undefined }` |
| 4 | usuário não encontrado → erro genérico | select userTable retorna `[]` | `{ ok: false, error: "Usuário não encontrado" }` |

Referência estrutural para o arquivo de teste:
`apps/web/src/app/dashboard/users/__tests__/invite-schema.test.ts`.

Comando de execução:
```bash
bun --cwd apps/web test unlink
```
→ suite passa, 4+ novos testes.

## Done criteria

Machine-checkable. TODOS devem ser verdadeiros:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0 (lint ultracite/biome)
- [ ] `bun --cwd apps/web test` exits 0; arquivo `unlink-branch-guard.test.ts` existe e passa ≥4 testes
- [ ] `bun guard:forms` exits 0
- [ ] O bloco antigo de três queries separadas (linhas ~799–829) não existe mais: `grep -n "Last-branch guard: admin" apps/web/src/app/dashboard/users/actions.ts` retorna 0 matches
- [ ] O novo bloco usa `db.transaction`: `grep -n "db.transaction" apps/web/src/app/dashboard/users/actions.ts` retorna ≥1 match
- [ ] Apenas os arquivos esperados foram modificados: `git diff --name-only HEAD` lista somente os dois arquivos in-scope de código + `plans/README.md` (para o update de status)
- [ ] Status desta linha em `plans/README.md` atualizado para `DONE`

## STOP conditions

Pare e reporte (não improvise) se:

- O trecho da função `unlinkUserFromBranch` em `actions.ts` não corresponde
  ao excerpt em "Current state" (o código deriva desde o planejamento).
- `bun check-types` falha com erros em arquivos **fora** do escopo após
  qualquer edição.
- O driver Drizzle-ORM instalado não suporta `.for("update")` dentro de
  `db.transaction` (ex: erro `TypeError: tx.select(...).for is not a function`
  — sinal de versão incompatível); nesse caso use a Opção Alternativa abaixo.
- Os mocks de vitest não conseguem interceptar `db.transaction` (ex: a função
  real é chamada e tenta conectar ao banco em ambiente de teste) — extrair a
  lógica de guarda para uma função pura testável antes de testar a action.
- `bun --cwd apps/web test` falha em testes pré-existentes (regressão fora do
  escopo).

### Opção Alternativa (usar se `.for("update")` falhar)

Se o STOP sobre `FOR UPDATE` ocorrer, use a abordagem de subquery atômica
no DELETE em vez de transação com lock explícito:

```typescript
// Substitui o db.transaction inteiro:
const [targetUser] = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, targetUserId))
    .limit(1);

if (!targetUser) {
    return { ok: false, error: "Usuário não encontrado" };
}

let rowsDeleted = 0;

if (targetUser.role === "super_admin") {
    // super_admin: sem guard, deleta direto
    await db
        .delete(userBranch)
        .where(
            and(
                eq(userBranch.userId, targetUserId),
                eq(userBranch.branchId, branchId)
            )
        );
    rowsDeleted = 1; // assume sucesso
} else {
    // DELETE condicional: só executa se restar ≥1 outra filial
    const result = await db.execute(sql`
        DELETE FROM "user_branch"
        WHERE user_id = ${targetUserId}
          AND branch_id = ${branchId}
          AND (
              SELECT count(*) FROM "user_branch"
              WHERE user_id = ${targetUserId}
                AND branch_id <> ${branchId}
          ) >= 1
    `);
    rowsDeleted = result.rowCount ?? 0;
}

if (rowsDeleted === 0 && targetUser.role !== "super_admin") {
    return { ok: false, error: "Usuário precisa de ao menos 1 filial" };
}
```

Nota: `db.execute` raw devolve `rowCount` via `pg` driver (não via Drizzle
ORM); confirmar tipo retornado em `packages/db/CLAUDE.md` antes de usar.

## Maintenance notes

- **Invariante "≥1 filial por admin/user"** é documentada em CLAUDE.md (seção
  Auth P0) e CONTEXT.md #8. O guard aqui é a única barreira programática —
  não existe constraint de banco para isso. Se futuramente uma constraint
  `CHECK` for adicionada, este guard vira redundante (mas inofensivo).
- **Reviewer deve verificar no PR**: o `.for("update")` bloqueia todas as
  linhas de `user_branch` do usuário — em cenários de alta concorrência com
  muitas filiais por usuário (raro no contexto atual), considerar lock mais
  seletivo. Para o porte atual (admin/user com 1–10 filiais), é aceitável.
- **Não confundir com `linkUserToBranch`** (linha 650): a função de vincular
  usa `.onConflictDoNothing()` e não precisa de guard; não tem nada a mudar.
- O `logUserActivity` permanece fora da transação (correto): auditoria de
  atividade usa conexão separada e não precisa ser atômica com o DELETE.
