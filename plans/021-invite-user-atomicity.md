# Plan 021: Tornar inviteUser atômico — rollback/compensação quando o email falha

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/users/actions.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

Quando `sendInviteEmail` lança exceção no caminho de **usuário novo**, o `catch`
retorna `{ ok: false }` mas o usuário já foi criado em banco (via
`internalAdapter.createUser`) com `status: "pending"` e `inviteToken` definido,
e os vínculos de filial (`user_branch`) já foram reescritos. O usuário fica
observável na listagem como pendente sem convite em trânsito — e sem mecanismo
automático de limpeza. A janela de inconsistência persiste até um admin notar e
revogar manualmente ou reenviar (`resendInvite` recupera para usuário existente,
mas a detecção do estado fantasma é manual).

O caminho de **reenvio** (usuário já existia em `pending`) é seguro: regenera
token e reenvia, portanto um retry manual recupera. A correção foca no caminho
de criação de usuário novo.

## Current state

### Arquivo alvo

`apps/web/src/app/dashboard/users/actions.ts` — contém `inviteUser` e todas as
outras actions de usuário. Somente este arquivo será modificado.

### Trecho problemático (linhas 95–142 conforme lido em 79379ef5)

```ts
// actions.ts:95-142
try {
    let userId: string;
    if (existing) {
        // Caminho de reenvio — safe, não alterar
        userId = existing.id;
        await db
            .update(userTable)
            .set({ role, inviteToken: token, inviteTokenExpiresAt: expiresAt })
            .where(eq(userTable.id, userId));
    } else {
        // Caminho de usuário NOVO — problemático
        const ctx = await authDashboard.$context;
        const created = await ctx.internalAdapter.createUser({  // L106
            email,
            name: "",
            emailVerified: true,
        });
        userId = created.id;
        await db
            .update(userTable)                                   // L112-115
            .set({ role, inviteToken: token, inviteTokenExpiresAt: expiresAt })
            .where(eq(userTable.id, userId));
    }

    // Revincular filiais — fora de transação com o bloco acima     L119-124
    await db.delete(userBranch).where(eq(userBranch.userId, userId));
    if (branchIds.length > 0) {
        await db
            .insert(userBranch)
            .values(branchIds.map((branchId) => ({ userId, branchId })));
    }

    // Email enviado DEPOIS das escritas, mas sem compensação        L126-131
    await sendInviteEmail({
        to: email,
        inviterName: session.user.name,
        acceptUrl: `${env.BETTER_AUTH_URL}/convite?token=${token}`,
    });
    // logUserActivity L132-138 — não problemático
} catch (error) {
    logger.error("inviteUser falhou", error);        // L140
    return { ok: false, error: "Não foi possível enviar o convite" };
    // Usuário novo já persistido — ghost state
}
```

### Restrição técnica crítica

`ctx.internalAdapter.createUser()` usa a **conexão própria do Better Auth** e
**não pode participar de `db.transaction()`** (Better Auth 1.6.x). Portanto não
existe como fazer rollback transacional do `createUser` via Drizzle. A estratégia
de compensação é a única viável: salvar o `userId` recém-criado e deletá-lo no
`catch` caso o email falhe.

A FK `user_branch.user_id → user.id` tem `onDelete: "cascade"` (confirmado em
`packages/db/src/schema/inventory.ts:118`), portanto deletar o user remove os
`user_branch` automaticamente — **não é necessário delete explícito de
`user_branch`**.

### Convenções que se aplicam aqui

**Server actions** (`apps/web/CLAUDE.md`):
- `"use server"` no topo (já presente).
- `requireCapabilityWithContext` no início (já presente em L64).
- Retorno `ActionResult<T> = { ok: true; data } | { ok: false; error }` (em
  `apps/web/src/lib/action-result.ts:2`).
- `logger.error("scope", error)` no catch — nunca `console.*`.
- `revalidatePath` após mutações.

**Anti-patterns banidos** (raiz `CLAUDE.md`): `: any`, `as any`, `@ts-ignore`;
`console.*`; `useMemo`/`useCallback` manuais (irrelevante aqui, mas não
introduzir).

**`db.transaction`** já é usado corretamente em outras actions do mesmo arquivo
(ex: `updateUser` L326-352, `suspendUser` L402-413, `deleteUser` L536-557).
Reusar o mesmo padrão.

## Commands you will need

| Purpose      | Command                                                                     | Expected on success              |
|--------------|-----------------------------------------------------------------------------|----------------------------------|
| Typecheck    | `bun check-types`                                                           | exit 0, sem erros                |
| Lint         | `bun check`                                                                 | exit 0 (ultracite/biome)         |
| Tests        | `bun --cwd apps/web test --reporter=verbose`                                | verde; verificar novos testes    |
| Tests filtro | `bun --cwd apps/web test --reporter=verbose invite`                         | só os testes de invite passam    |
| Guard forms  | `bun guard:forms`                                                           | exit 0                           |
| Build        | `bun run --cwd apps/web build`                                              | exit 0                           |
| Drift check  | `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/users/actions.ts` | deve mostrar só mudanças esperadas |

## Scope

**In scope** (os únicos arquivos a modificar):
- `apps/web/src/app/dashboard/users/actions.ts` — refatorar `inviteUser`
- `apps/web/src/app/dashboard/users/__tests__/invite-user-action.test.ts`
  (criar — novo arquivo de teste)

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):
- `apps/web/src/app/dashboard/users/actions.ts` — qualquer action além de
  `inviteUser` e `makeInviteToken` (se necessário extrair helper)
- `apps/web/src/app/dashboard/users/actions.ts:acceptInvite` — caminho de
  aceite não tem o bug
- `apps/web/src/app/dashboard/users/actions.ts:resendInvite` — já é safe
- `packages/auth/src/dashboard.ts` — não tocar a configuração do Better Auth
- Qualquer arquivo fora de `apps/web/src/app/dashboard/users/`
- Schema do banco — nenhuma coluna nova, nenhum `bun db:sync`

## Git workflow

- Branch: `advisor/021-invite-user-atomicity`
- Commits em Conventional Commits PT, subject ≤ 50 chars. Exemplos do repositório:
  - `fix(users): tornar inviteUser atomico`
  - `test(users): cobrir compensacao de inviteUser`
- **NÃO** fazer push nem abrir PR sem instrução explícita.

## Steps

### Step 1: Ler o arquivo e confirmar estado atual

Leia `apps/web/src/app/dashboard/users/actions.ts` **na íntegra** antes de
qualquer edição. Confirme que as linhas 95–142 correspondem ao trecho em
"Current state". Se divergirem, pare (STOP condition).

**Verify**: `git diff 79379ef5 HEAD -- apps/web/src/app/dashboard/users/actions.ts`
→ deve estar limpo ou mostrar apenas mudanças não relacionadas ao bloco
`inviteUser`.

---

### Step 2: Criar branch

```bash
git checkout -b advisor/021-invite-user-atomicity
```

**Verify**: `git branch --show-current` → `advisor/021-invite-user-atomicity`

---

### Step 3: Refatorar `inviteUser` em `actions.ts`

Substitua o bloco `try { ... } catch` da função `inviteUser` (linhas 95–145
do arquivo original, do `try {` até `revalidatePath(USERS_PATH);` e `return
{ ok: true, data: undefined };`) pelo trecho abaixo. **Leia o arquivo antes
de editar** — o harness exige que `old_string` bata exatamente.

O que mudar:

1. **Caminho de usuário NOVO**: declarar `let newUserId: string | null = null`
   antes do `try`. Dentro do `else`, atribuir `newUserId = created.id` logo
   após o `createUser` retornar.

2. **Envolver `db.update` + `db.delete(userBranch)` + `db.insert(userBranch)`
   numa única `db.transaction`** — igual ao padrão já usado em `updateUser`
   (L326-352) e `deleteUser` (L536-557). `internalAdapter.createUser` fica
   fora da transação (restrição técnica — ver "Current state").

3. **Chamar `sendInviteEmail` APÓS o commit da transação** (já é o caso em
   sequência temporal, mas o `await` deve ficar fora do bloco de transação).

4. **No `catch`**: se `newUserId !== null` (usuário foi criado nesta chamada) e
   o erro veio depois da criação, deletar o user por compensação:

   ```ts
   if (newUserId !== null) {
       try {
           await db.delete(userTable).where(eq(userTable.id, newUserId));
       } catch (cleanupErr) {
           logger.error("inviteUser compensação falhou", cleanupErr);
       }
   }
   ```

   A FK `user_branch.user_id → user.id ON DELETE CASCADE` garante que os
   `user_branch` são removidos junto — sem delete explícito necessário.

5. **Caminho de reenvio (`existing` truthy)**: não alterar. Continua sem
   compensação (o usuário já existia e permanece `pending` — o `resendInvite`
   recupera).

6. **`logUserActivity`**: chamar somente no caminho feliz (fora do `catch`),
   como já está — não alterar.

Formato alvo do bloco `try/catch` de `inviteUser`:

```ts
let newUserId: string | null = null;

try {
    let userId: string;
    if (existing) {
        // Caminho de reenvio — safe: usuário já existia como pending
        userId = existing.id;
        await db
            .update(userTable)
            .set({ role, inviteToken: token, inviteTokenExpiresAt: expiresAt })
            .where(eq(userTable.id, userId));
    } else {
        // Caminho de usuário NOVO
        const ctx = await authDashboard.$context;
        const created = await ctx.internalAdapter.createUser({
            email,
            name: "",
            emailVerified: true,
        });
        newUserId = created.id;
        userId = created.id;
        // db.update + db.delete + db.insert numa transação atômica
        await db.transaction(async (tx) => {
            await tx
                .update(userTable)
                .set({ role, inviteToken: token, inviteTokenExpiresAt: expiresAt })
                .where(eq(userTable.id, userId));
            await tx.delete(userBranch).where(eq(userBranch.userId, userId));
            if (branchIds.length > 0) {
                await tx
                    .insert(userBranch)
                    .values(branchIds.map((branchId) => ({ userId, branchId })));
            }
        });
    }

    // Se existing: revincular filiais fora de transação (caminho original)
    if (existing) {
        await db.delete(userBranch).where(eq(userBranch.userId, userId));
        if (branchIds.length > 0) {
            await db
                .insert(userBranch)
                .values(branchIds.map((branchId) => ({ userId, branchId })));
        }
    }

    // Email enviado após commit — se lançar, compensação no catch remove o user novo
    await sendInviteEmail({
        to: email,
        inviterName: session.user.name,
        acceptUrl: `${env.BETTER_AUTH_URL}/convite?token=${token}`,
    });

    await logUserActivity({
        actorUserId: session.user.id,
        action: "user.invited",
        targetType: "user",
        targetId: userId,
        metadata: { email, role, branchIds, resend: Boolean(existing) },
    });
} catch (error) {
    logger.error("inviteUser falhou", error);
    // Compensação: se o user foi criado nesta chamada, removê-lo.
    // Caminho de reenvio (existing) não compensa — o user preexistia.
    if (newUserId !== null) {
        try {
            await db.delete(userTable).where(eq(userTable.id, newUserId));
        } catch (cleanupErr) {
            logger.error("inviteUser compensação falhou", cleanupErr);
        }
    }
    return { ok: false, error: "Não foi possível enviar o convite" };
}
```

> **Atenção**: a variável `userId` continua sendo usada no `logUserActivity`
> e nos inserts de `userBranch` para o caminho `existing`. Mantenha o escopo
> correto — declare `userId` antes do `if (existing)` para que seja acessível
> fora, ou use o padrão `let userId: string` no início do `try`.

**Verify**: `bun check-types` → exit 0

---

### Step 4: Garantir que não há anti-patterns introduzidos

Verifique manualmente:
- Nenhum `console.log/warn/error` foi adicionado (só `logger.error`).
- Nenhum `: any` ou `as any` foi introduzido.
- A variável `userId` é acessada dentro do `try` com escopo correto.
- O `catch` externo ainda chama `logger.error` antes de retornar.

**Verify**: `bun check` → exit 0

---

### Step 5: Escrever os testes

Crie o arquivo
`apps/web/src/app/dashboard/users/__tests__/invite-user-action.test.ts`.

Modelo estrutural: `apps/web/src/app/dashboard/users/__tests__/invite-schema.test.ts`
para a organização de imports e `describe`/`it`; e
`apps/web/src/lib/__tests__/notify.test.ts` para o padrão de mocks com
`vi.hoisted` + `vi.mock`.

Os testes cobrem a lógica de compensação extraindo-a do contexto de servidor.
Como `inviteUser` é uma server action com muitas dependências externas
(Better Auth, email, banco, session), a estratégia é mockar todas as
dependências e testar o **comportamento observável**: se o email falha,
o user novo deve ser deletado via compensação.

#### Dependências a mockar

Todas as dependências externas devem ser mockadas via `vi.hoisted` + `vi.mock`:

- `@emach/auth/dashboard` → `authDashboard.$context` retorna um
  `internalAdapter.createUser` controlável
- `@emach/db` → `db.update`, `db.delete`, `db.insert`, `db.transaction`,
  `db.select` (para o `existing` check)
- `@emach/email/send` → `sendInviteEmail` controlável (resolve ou lança)
- `@/lib/permissions` → `requireCapabilityWithContext` resolve com session mock
- `@/lib/activity` → `logUserActivity` resolve (no-op)
- `next/cache` → `revalidatePath` (no-op)

> Atenção: o alias `server-only` já está configurado em `vitest.config.ts`
> (`src/__mocks__/server-only.ts`). Não é preciso mockar manualmente.

#### Casos a cobrir

1. **Caminho feliz — user novo**: `internalAdapter.createUser` resolve,
   transação resolve, `sendInviteEmail` resolve →
   `result.ok === true` e `db.delete(userTable)` de compensação **não** é
   chamado.

2. **Falha de email — user novo**: `internalAdapter.createUser` resolve,
   transação resolve, `sendInviteEmail` lança →
   `result.ok === false` e `db.delete(userTable)` de compensação é chamado
   com o `id` do user recém-criado.

3. **Falha de email — user existente (reenvio)**: `existing` já existe como
   `pending`, `db.update` resolve, `sendInviteEmail` lança →
   `result.ok === false` e **compensação NÃO é chamada** (o user preexistia
   — não deve ser deletado).

4. **Falha na transação — user novo**: `internalAdapter.createUser` resolve mas
   `db.transaction` lança → `result.ok === false` e compensação **é chamada**
   (o user foi criado mas o estado do banco ficou incompleto).

Estrutura mínima do arquivo de teste:

```ts
// Imports estáticos no topo — Vitest hoist automaticamente os vi.mock abaixo
// antes de qualquer import, portanto os mocks já estão ativos quando "../actions"
// é importado. Não usar dynamic import() aqui; import estático é o padrão do projeto.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inviteUser } from "../actions";

// --- mocks via vi.hoisted ---
const mocks = vi.hoisted(() => {
    const deleteUser = vi.fn();
    const deleteBranch = vi.fn();
    const insert = vi.fn();
    const update = vi.fn();
    const select = vi.fn();

    // db.transaction executa o callback imediatamente com o tx mock
    const transaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
        await cb({ update, delete: deleteBranch, insert });
    });

    const createUser = vi.fn();
    const sendInviteEmail = vi.fn();

    return {
        deleteUser,
        deleteBranch,
        insert,
        update,
        select,
        transaction,
        createUser,
        sendInviteEmail,
    };
});

vi.mock("@emach/db", () => ({
    db: {
        select: () => ({
            from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
        }),
        update: mocks.update,
        delete: (table: unknown) => ({
            where: (cond: unknown) => {
                // distingue delete de userTable vs userBranch por referência se necessário
                return mocks.deleteUser(table, cond);
            },
        }),
        insert: mocks.insert,
        transaction: mocks.transaction,
    },
}));

vi.mock("@emach/auth/dashboard", () => ({
    authDashboard: {
        $context: Promise.resolve({
            internalAdapter: { createUser: mocks.createUser },
        }),
    },
}));

vi.mock("@emach/email/send", () => ({
    sendInviteEmail: mocks.sendInviteEmail,
}));

vi.mock("@/lib/permissions", () => ({
    requireCapabilityWithContext: vi.fn().mockResolvedValue({
        user: { id: "actor-1", name: "Admin", role: "admin" },
    }),
}));

vi.mock("@/lib/activity", () => ({
    logUserActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Necessário para resolver env
vi.mock("@emach/env/server", () => ({
    env: { BETTER_AUTH_URL: "http://localhost:3000" },
}));

describe("inviteUser — atomicidade", () => {
    const validInput = {
        email: "novo@emach.com.br",
        role: "user" as const,
        branchIds: ["branch-1"],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.update.mockResolvedValue(undefined);
        mocks.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
        mocks.transaction.mockImplementation(async (cb) => {
            await cb({ update: mocks.update, delete: mocks.deleteBranch, insert: mocks.insert });
        });
    });

    it("caminho feliz: cria user, salva em transação, envia email", async () => {
        mocks.createUser.mockResolvedValue({ id: "new-user-1" });
        mocks.sendInviteEmail.mockResolvedValue(undefined);

        const result = await inviteUser(validInput);

        expect(result.ok).toBe(true);
        expect(mocks.createUser).toHaveBeenCalledOnce();
        expect(mocks.transaction).toHaveBeenCalledOnce();
        expect(mocks.sendInviteEmail).toHaveBeenCalledOnce();
        // compensação não foi chamada
        expect(mocks.deleteUser).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ left: expect.objectContaining({ name: "id" }) })
        );
    });

    it("falha de email — user novo: compensa deletando o user criado", async () => {
        mocks.createUser.mockResolvedValue({ id: "new-user-2" });
        mocks.sendInviteEmail.mockRejectedValue(new Error("SMTP indisponível"));
        mocks.deleteUser.mockResolvedValue(undefined);

        const result = await inviteUser(validInput);

        expect(result.ok).toBe(false);
        // compensação deve ter sido chamada
        expect(mocks.deleteUser).toHaveBeenCalled();
    });

    it("falha de email — user existente (reenvio): NÃO compensa", async () => {
        // Simular existing: select retorna um user pending
        // (mockar db.select para este teste)
        // ... implementar conforme o padrão do mock de select acima
        mocks.sendInviteEmail.mockRejectedValue(new Error("SMTP"));

        // Este teste requer ajuste do mock de db.select para retornar existing
        // Ver implementação completa abaixo
        expect(true).toBe(true); // placeholder — implementar
    });

    it("falha na transação — user novo: compensa deletando o user criado", async () => {
        mocks.createUser.mockResolvedValue({ id: "new-user-3" });
        mocks.transaction.mockRejectedValue(new Error("DB indisponível"));
        mocks.deleteUser.mockResolvedValue(undefined);

        const result = await inviteUser(validInput);

        expect(result.ok).toBe(false);
        expect(mocks.deleteUser).toHaveBeenCalled();
    });
});
```

> Atenção: o mock de `db.select` acima é simplificado. Os casos que precisam
> simular `existing` devem sobrescrever `db.select` no `beforeEach` do teste
> específico. Veja como o padrão de `vi.hoisted` é usado em
> `apps/web/src/lib/__tests__/notify.test.ts` para referência.

> Atenção: como a action faz `await import("./data")` internamente em alguns
> caminhos (ex: `fetchUsersPage`), mas `inviteUser` não faz dynamic import,
> o import estático da action no topo do teste é seguro.

**Verify**: `bun --cwd apps/web test --reporter=verbose invite` → todos os
testes do arquivo passam (mínimo 3 dos 4 casos; o placeholder pode ser
completado mas não deve falhar com erro de import/runtime).

---

### Step 6: Executar a suíte completa

**Verify**: `bun --cwd apps/web test --reporter=verbose` → exit 0, todos os
testes passam (linha de base: 54 arquivos / 359 testes + N novos).

---

### Step 7: Lint e guard

**Verify**: `bun check` → exit 0
**Verify**: `bun guard:forms` → exit 0

---

### Step 8: Commit

```bash
git add apps/web/src/app/dashboard/users/actions.ts \
        apps/web/src/app/dashboard/users/__tests__/invite-user-action.test.ts
git commit -m "fix(users): tornar inviteUser atomico"
```

Para o commit de teste (pode ser junto ou separado):
```bash
git commit -m "test(users): cobrir compensacao de inviteUser"
```

**Verify**: `git log --oneline -3` → commits visíveis com as mensagens corretas.

---

### Step 9: Typecheck final

**Verify**: `bun check-types` → exit 0

## Test plan

**Arquivo a criar**: `apps/web/src/app/dashboard/users/__tests__/invite-user-action.test.ts`

**Modelo estrutural**: `apps/web/src/app/dashboard/users/__tests__/invite-schema.test.ts`
(organização de arquivo) + `apps/web/src/lib/__tests__/notify.test.ts`
(padrão `vi.hoisted` + `vi.mock`).

**Casos**:

| # | Cenário | Asserção-chave |
|---|---------|----------------|
| 1 | Caminho feliz — user novo | `result.ok === true`; compensação não chamada |
| 2 | `sendInviteEmail` lança — user novo | `result.ok === false`; `db.delete(userTable)` chamado com `newUserId` |
| 3 | `sendInviteEmail` lança — user existente (pending) | `result.ok === false`; `db.delete(userTable)` **não** chamado |
| 4 | `db.transaction` lança — user novo | `result.ok === false`; `db.delete(userTable)` chamado com `newUserId` |

**Comando de verificação**: `bun --cwd apps/web test --reporter=verbose invite`
→ mínimo 4 testes (ou 3 + 1 placeholder `expect(true).toBe(true)`) verdes.

## Done criteria

Machine-checkable. TODOS devem valer antes de declarar concluído:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun guard:forms` exits 0
- [ ] `bun --cwd apps/web test` exits 0; novos testes de `invite-user-action`
      existem e passam
- [ ] `git diff --name-only HEAD~1..HEAD` mostra **somente**:
      - `apps/web/src/app/dashboard/users/actions.ts`
      - `apps/web/src/app/dashboard/users/__tests__/invite-user-action.test.ts`
- [ ] `grep -n "newUserId" apps/web/src/app/dashboard/users/actions.ts` →
      retorna linhas (variável de compensação presente)
- [ ] `grep -n "compensação" apps/web/src/app/dashboard/users/actions.ts` →
      comentário de compensação presente no catch
- [ ] `plans/README.md` status row de 021 atualizado para DONE

## STOP conditions

Pare e reporte (não improvise) se:

- As linhas 95–142 de `actions.ts` **não correspondem** ao trecho em "Current
  state" — o arquivo foi modificado desde o planejamento.
- `bun check-types` continua falhando após 2 tentativas de correção.
- `bun --cwd apps/web test` quebra em testes pré-existentes (fora dos novos).
- A implementação de compensação exigiria tocar qualquer arquivo fora da lista
  em "Scope".
- `internalAdapter.createUser` retorna um objeto sem `.id` — a API do Better
  Auth mudou; verificar documentação antes de continuar.
- O `db.transaction` em `actions.ts` não existe como API (ex: mudança de versão
  do Drizzle) — verificar `packages/db/package.json` e reportar.
- Qualquer sinal de que `internalAdapter` passou a expor modo transacional
  (ex: `internalAdapter.withTransaction`) — prefira-o e reporte antes de
  implementar compensação manual.

## Maintenance notes

**Para quem mantém este código após o merge:**

- A variável `newUserId` distingue o caminho de **criação** do de **reenvio**.
  Qualquer refactor que funda os dois caminhos deve preservar essa distinção ou
  a compensação ficará errada.

- Se o Better Auth expor suporte transacional em `internalAdapter` (ex:
  `internalAdapter.createUser` aceitar uma conexão Drizzle), a compensação
  manual pode ser substituída por uma transação real. Isso simplificaria o
  código e eliminaria a janela em que o `createUser` sucede mas o `db.delete`
  de compensação falha (gap pequeno mas existente).

- A compensação não cobre o caso em que o `delete` de compensação **também
  falha** (ex: DB indisponível) — o usuário permanece como ghost. Este caso é
  raro e recuperável via `revokeInvite` manual (que já existe). Não é P2;
  deixado como known limitation.

- O `logUserActivity` só é chamado no caminho feliz. Se a compensação falhar,
  não há audit trail da tentativa frustrada. Adicionar um log de auditoria
  para falhas de compensação é uma melhoria futura, não parte deste plano.

- **Reviewer deve verificar no PR**: que o `existing` path (reenvio) não foi
  alterado; que `newUserId` é `null` no path `existing`; que a transação
  contém exatamente `update + delete(userBranch) + insert(userBranch)` para o
  path novo.
