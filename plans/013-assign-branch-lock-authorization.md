# Plan 013: Travar e autorizar assignBranch pela filial atual do pedido e corrigir ator do audit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/orders/actions.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`assignBranch` autoriza o ator contra a filial **destino** fora da transação,
mas nunca verifica a filial **atual** do pedido. Um admin com escopo na filial
B pode reatribuir para B um pedido que pertence à filial A sem nenhuma
checagem — cross-branch hijack silencioso. Além disso, o update não usa
`SELECT FOR UPDATE`, então um `orderId` inexistente retorna `{ok:true}` em
vez de erro. Por fim, o `orderEvent` de tipo `branch_assigned` grava
`actorUserId: null`, violando o invariante de auditoria (ação humana exige
`actorType:"user"` + `actorUserId = session.user.id`). O padrão correto
(`lockOrderAndAuthorize`) já existe no mesmo arquivo e é usado pelas demais
mutations; aplicá-lo aqui fecha os três problemas de uma vez.

## Current state

**Arquivo em escopo:**
- `apps/web/src/app/dashboard/orders/actions.ts` — todas as server actions de
  pedidos; contém `lockOrderAndAuthorize` (L126–163) e `assignBranch`
  (L399–441) com os três bugs.

**Excerto da função com bug** (`actions.ts:399–441`):

```typescript
// L399-441 (BUG — não tocar antes de corrigir)
export async function assignBranch(
  input: AssignBranchInput
): Promise<ActionResult> {
  const parsed = assignBranchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  const { orderId, branchId } = parsed.data;

  // Branch-scoping: actor must have access to the branch being assigned.
  await requireCapabilityWithContext("orders.update_status", {
    targetBranchIds: [branchId],   // ← valida só o destino, fora da tx
  });

  try {
    await db.transaction(async (tx) => {
      await tx.update(order).set({ branchId }).where(eq(order.id, orderId));
      // ↑ sem SELECT FOR UPDATE; sem checar existência; 0 linhas = {ok:true}

      const [branchRow] = await tx
        .select({ name: branch.name })
        .from(branch)
        .where(eq(branch.id, branchId))
        .limit(1);

      await insertOrderEvent(tx, {
        orderId,
        eventType: "branch_assigned",
        metadata: { branchId, branchName: branchRow?.name ?? branchId },
        actorUserId: null,          // ← BUG: ação humana, deveria ser session.user.id
      });
    });
    ...
  }
}
```

**Excerto de `lockOrderAndAuthorize`** (`actions.ts:126–163`) — função correta a usar:

```typescript
// L126–163
export async function lockOrderAndAuthorize(
  tx: OrderTx,
  cap: Capability,
  orderId: string
): Promise<LockedOrderAuth | null> {
  const [locked] = await tx
    .select({ status: order.status, branchId: order.branchId })
    .from(order)
    .where(eq(order.id, orderId))
    .for("update")          // ← SELECT FOR UPDATE
    .limit(1);

  if (!locked) {
    return null;            // ← pedido inexistente retorna null
  }

  // re-check contra branchId ATUAL do pedido:
  if (locked.branchId === null) {
    session = await requireCapability(cap);
    // ... guarda triagem
  } else {
    session = await requireCapabilityWithContext(cap, {
      targetBranchIds: [locked.branchId],  // ← filial atual, não destino
    });
  }

  return { status: locked.status, branchId: locked.branchId, session };
}
```

**Padrão correto de actorUserId** — ver `updateOrderStatus` (`actions.ts:249–256`):

```typescript
await tx.insert(orderStatusHistory).values({
  ...
  actorType: "user",
  actorUserId: session.user.id,   // ← session vem do lockOrderAndAuthorize
  ...
});
```

E `updateTrackingCode` (`actions.ts:475–480`):

```typescript
await insertOrderEvent(tx, {
  orderId,
  eventType: "tracking_set",
  metadata: { trackingCode },
  actorUserId: locked.session.user.id,  // ← locked vem do lockOrderAndAuthorize
});
```

**Invariante de auditoria** (raiz `CLAUDE.md` / `apps/web/CLAUDE.md` §"Auditoria de mutações DB"):
> Admin user → `actorType: "user"` + FK do ator = `session.user.id`.
> CHECK `actor_coherence` no DB rejeita combinações inválidas.

**Convenção de server actions** (`apps/web/CLAUDE.md` §"Server actions"):
- `"use server"` no topo.
- `ActionResult<T>` = `{ ok: true; data } | { ok: false; error }`.
- Zod `safeParse` na entrada.
- Em catch: `logger.error({ err })` + retornar `{ ok: false, error: "mensagem" }`.
- `revalidatePath`/`revalidateTag` após mutação.
- Erro de capacidade: detectar via `isCapabilityError(error)` (já existe em `actions.ts:108`).

**Anti-patterns banidos** (raiz `CLAUDE.md`):
- `: any`, `as any`, `@ts-ignore` proibidos.
- `console.*` proibido — usar `logger`.

**Testes** (`apps/web/CLAUDE.md` §"Testes"):
- `vitest`, `environment: node`.
- `server-only` resolvido por alias em `vitest.config.ts` — não precisa de `vi.mock`.
- Mock de `@emach/db` via `vi.hoisted` + `vi.mock`.
- Referência de estrutura de mock: `apps/web/src/lib/__tests__/notify.test.ts` (padrão `vi.hoisted`).

## Commands you will need

| Purpose      | Command                                                                             | Expected on success              |
|--------------|-------------------------------------------------------------------------------------|----------------------------------|
| Typecheck    | `bun check-types`                                                                   | exit 0, sem erros                |
| Lint         | `bun check`                                                                         | exit 0 (ultracite/biome)         |
| Testes todos | `bun --cwd apps/web test`                                                           | verde (baseline 54 arq / 359 testes) |
| Testes filtro| `bun --cwd apps/web test src/app/dashboard/orders`                                 | verde                            |
| Guard forms  | `bun guard:forms`                                                                   | exit 0                           |
| Build        | `bun run --cwd apps/web build`                                                      | exit 0                           |
| Drift check  | `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/orders/actions.ts`   | Sem output = sem drift           |

## Scope

**In scope** (únicos arquivos a modificar):
- `apps/web/src/app/dashboard/orders/actions.ts` — corrigir `assignBranch`
- `apps/web/src/app/dashboard/orders/__tests__/assign-branch.test.ts` — criar (novo)

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):
- `lockOrderAndAuthorize` — não alterar a assinatura nem o comportamento
- Qualquer outra action em `actions.ts` além de `assignBranch`
- Schema (`orders/schema.ts`) — sem mudança de tipos ou validações
- Demais arquivos do monorepo

## Git workflow

- Branch: `advisor/013-assign-branch-lock-authorization`
- Um commit após Step 1 (fix), um commit após Step 2 (testes)
- Mensagem style Conventional Commits em PT, subject ≤50 chars:
  - `fix(orders): lockOrderAndAuthorize em assignBranch`
  - `test(orders): cobertura assignBranch cross-branch`
- NÃO fazer push nem abrir PR sem instrução explícita.

## Steps

### Step 1: Corrigir `assignBranch` em `actions.ts`

Substituir o corpo inteiro de `assignBranch` (L399–441) pela versão corrigida
abaixo. A lógica de negócio permanece igual; muda apenas onde a autorização
acontece (dentro da tx), como a existência é verificada, e de onde vem o
`actorUserId`.

**Forma alvo:**

```typescript
export async function assignBranch(
  input: AssignBranchInput
): Promise<ActionResult> {
  const parsed = assignBranchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  const { orderId, branchId } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      // Lock the order row and authorize against the *current* branchId —
      // closes the cross-branch hijack window (SECURITY-02).
      const locked = await lockOrderAndAuthorize(
        tx,
        "orders.update_status",
        orderId
      );

      if (!locked) {
        throw new Error("Pedido não encontrado");
      }

      // After the lock, also assert the actor can write to the *destination*
      // branch (e.g. an admin must have scope there too).
      await requireCapabilityWithContext("orders.update_status", {
        targetBranchIds: [branchId],
      });

      await tx.update(order).set({ branchId }).where(eq(order.id, orderId));

      const [branchRow] = await tx
        .select({ name: branch.name })
        .from(branch)
        .where(eq(branch.id, branchId))
        .limit(1);

      await insertOrderEvent(tx, {
        orderId,
        eventType: "branch_assigned",
        metadata: { branchId, branchName: branchRow?.name ?? branchId },
        actorUserId: locked.session.user.id, // BUG-02 fix: ação humana
      });
    });

    revalidatePath(`${ORDERS_PATH}/${orderId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    logger.error("assignBranch", error);
    if (isCapabilityError(error)) {
      return { ok: false, error: "Sem permissão para alterar este pedido." };
    }
    if (error instanceof Error && error.message === "Pedido não encontrado") {
      return { ok: false, error: "Pedido não encontrado" };
    }
    return { ok: false, error: "Erro ao atribuir filial" };
  }
}
```

Notas de implementação:
- O `requireCapabilityWithContext` de destino **dentro** da tx (após o lock)
  é a checagem da filial destino — mantém a semântica original ("ator deve
  ter acesso à filial para onde está enviando") e adiciona a verificação da
  filial de origem via `lockOrderAndAuthorize`.
- `isCapabilityError` (L108) já detecta `"Forbidden: ..."` — qualquer das
  duas checagens que rejeitar vai cair no mesmo branch do catch.
- Não introduzir `import` novo: `requireCapabilityWithContext` já é importado
  (L24) e `lockOrderAndAuthorize` já está definido no mesmo arquivo (L126).

**Verify**: `bun check-types` → exit 0 sem erros

### Step 2: Criar o arquivo de testes

Criar `apps/web/src/app/dashboard/orders/__tests__/assign-branch.test.ts`.

Estrutura geral do mock: usar `vi.hoisted` para criar os mocks de funções
antes dos `vi.mock`, exatamente como em
`apps/web/src/lib/__tests__/notify.test.ts`.

Os mocks necessários:
1. `@emach/db` — expor `db` com método `.transaction` que invoca o callback
   passado com um objeto `tx` mockado.
2. `@/lib/permissions` — `requireCapabilityWithContext` e `requireCapability`
   controláveis por teste (resolvem por padrão, rejeitam quando configurados).
3. O próprio `lockOrderAndAuthorize` — exportado de `actions.ts`; precisará
   ser mockado via `vi.mock` no mesmo módulo ou via spy para os testes de
   "actor sem escopo na filial atual".

> **Nota sobre mock de `lockOrderAndAuthorize`:** como a função está no mesmo
> arquivo que `assignBranch`, não é possível mocká-la diretamente com
> `vi.mock`. A abordagem correta é:
> - Para o cenário (a) — orderId inexistente: fazer `lockOrderAndAuthorize`
>   retornar `null` simulando o `.select().for("update")` retornando `[]`.
>   Isso é feito mockando o `tx.select` para devolver `[]`.
> - Para o cenário (b) — sem escopo na filial atual: fazer
>   `requireCapabilityWithContext` lançar `new Error("Forbidden: ...")` na
>   primeira chamada (dentro de `lockOrderAndAuthorize`). Isso simula o
>   comportamento real da função quando o ator não tem escopo.
> - Para o cenário (c) — sucesso: fazer `tx.select` devolver uma linha válida,
>   `requireCapabilityWithContext` resolver, e verificar os argumentos passados
>   ao `tx.insert`.

**Casos a cobrir:**

```
describe("assignBranch", () => {
  (a) orderId inexistente → retorna { ok: false, error: "Pedido não encontrado" }
      (tx.select vazio → lockOrderAndAuthorize retorna null → throw → catch)

  (b) ator sem escopo na filial atual → retorna { ok: false, error: "Sem permissão ..." }
      (requireCapabilityWithContext lança "Forbidden: ..." na chamada dentro de
       lockOrderAndAuthorize → isCapabilityError = true)

  (c) sucesso → retorna { ok: true }
      AND orderEvent gravado com actorUserId = session.user.id
      AND actorType resolvido como "user" (derivado de actorUserId não-null
          em insertOrderEvent L179: actorType = actorUserId ? "user" : "system")
```

Para o cenário (c), checar que `tx.insert` recebeu valores com
`actorUserId !== null` e `actorUserId === <id do usuário mockado>`.

Mock mínimo de `db.transaction`:

```typescript
const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
}));
vi.mock("@emach/db", () => ({
  db: { transaction: mockTransaction },
}));
```

No beforeEach de cada teste, configurar `mockTransaction` para invocar o
callback: `mockTransaction.mockImplementation(async (cb) => cb(mockTx))`.

Mock de `@/lib/permissions`:

```typescript
const { mockRequireCapabilityWithContext } = vi.hoisted(() => ({
  mockRequireCapabilityWithContext: vi.fn(),
}));
vi.mock("@/lib/permissions", () => ({
  requireCapability: vi.fn().mockResolvedValue({ user: { id: "usr_1" } }),
  requireCapabilityWithContext: mockRequireCapabilityWithContext,
}));
```

Mock de `next/cache` (evitar erro fora do runtime Next):

```typescript
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
```

**Verify**: `bun --cwd apps/web test src/app/dashboard/orders/__tests__/assign-branch.test.ts` → todos os casos passam

### Step 3: Rodar a suíte completa e lint

Verificar que nada além do esperado quebrou.

**Verify**:
```
bun check-types     → exit 0
bun check           → exit 0
bun --cwd apps/web test → verde; contagem de testes >= baseline + 3 novos
bun guard:forms     → exit 0
```

### Step 4: Commit

```bash
git add apps/web/src/app/dashboard/orders/actions.ts
git commit -m "fix(orders): lockOrderAndAuthorize em assignBranch"

git add apps/web/src/app/dashboard/orders/__tests__/assign-branch.test.ts
git commit -m "test(orders): cobertura assignBranch cross-branch"
```

**Verify**: `git log --oneline -3` → dois novos commits visíveis

## Test plan

Arquivo: `apps/web/src/app/dashboard/orders/__tests__/assign-branch.test.ts`

| Caso | Descrição | Mecanismo de mock | Resultado esperado |
|------|-----------|-------------------|--------------------|
| (a) orderId inexistente | `tx.select` retorna `[]` (nenhum row) | `mockTx.select` encadeado retorna `{ from: () => { where: () => { for: () => { limit: () => [] } } } }` | `{ ok: false, error: "Pedido não encontrado" }` |
| (b) sem escopo filial atual | `requireCapabilityWithContext` lança `new Error("Forbidden: sem acesso à filial")` na primeira chamada | `mockRequireCapabilityWithContext.mockRejectedValueOnce(...)` | `{ ok: false, error: "Sem permissão para alterar este pedido." }` |
| (c) sucesso | `tx.select` retorna row válido; `requireCapabilityWithContext` resolve com session | `mockRequireCapabilityWithContext.mockResolvedValue({ user: { id: "usr_42" } })` | `{ ok: true }` E `tx.insert` chamado com `actorUserId: "usr_42"` |

Modelo estrutural: `apps/web/src/lib/__tests__/notify.test.ts` (padrão `vi.hoisted`).

Comando de verificação: `bun --cwd apps/web test src/app/dashboard/orders` → todos passam.

## Done criteria

Machine-checkable. TODOS devem ser verdadeiros:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` exits 0; pelo menos 3 testes novos em `assign-branch.test.ts`
- [ ] `bun guard:forms` exits 0
- [ ] `grep -n "actorUserId: null" apps/web/src/app/dashboard/orders/actions.ts` — retorna **zero** linhas dentro da função `assignBranch` (a linha pode existir fora dela como comentário histórico; verificar contexto)
- [ ] `grep -n "requireCapabilityWithContext" apps/web/src/app/dashboard/orders/actions.ts` — a chamada com `targetBranchIds: \[branchId\]` existe **dentro** da função `assignBranch` (após o lock)
- [ ] O `requireCapabilityWithContext` externo (fora da transação, L413–415 no código original) **não existe mais** em `assignBranch`
- [ ] `git status` — apenas `apps/web/src/app/dashboard/orders/actions.ts` e `apps/web/src/app/dashboard/orders/__tests__/assign-branch.test.ts` modificados/criados
- [ ] `plans/README.md` status row para plan 013 atualizado para `DONE`

## STOP conditions

Parar e reportar (não improvisar) se:

- O código em `actions.ts:399–441` não corresponde ao excerto em "Current state"
  (codebase drifted — comparar com `git diff 79379ef5 -- apps/web/src/app/dashboard/orders/actions.ts`).
- `lockOrderAndAuthorize` em `actions.ts:126` tem assinatura diferente da
  documentada — pode exigir parâmetro extra (ex: `branchId` destino); se for
  o caso, não adaptar a chamada sem reportar, pois pode ser uma versão mais
  nova que muda o contrato.
- `requireCapabilityWithContext` dentro de `lockOrderAndAuthorize` lança com
  string diferente de `"Forbidden: ..."` — os mocks de teste precisarão ser
  ajustados e `isCapabilityError` verificado.
- Um step de verificação falha duas vezes após tentativa de correção razoável.
- A correção exige tocar algum arquivo fora da lista de escopo.
- O TypeScript aponta erro em algum import não listado nos imports atuais de
  `actions.ts` (L1–53) — não adicionar imports sem entender o motivo.

## Maintenance notes

- **Revisão de PR:** confirmar que o segundo `requireCapabilityWithContext`
  (checagem de destino, dentro da tx) usa `targetBranchIds: [branchId]` e
  **não** `targetBranchIds: [locked.branchId]` — são filiais distintas e
  ambas devem ser checadas.
- **Futuras mutations:** qualquer nova action que mova ou reatribua pedidos
  deve seguir o mesmo padrão: `lockOrderAndAuthorize` primeiro, depois
  checagem adicional do destino se aplicável. O `assignBranch` corrigido
  passa a ser o exemplar para "reatribuição de filial".
- **CHECK `actor_coherence`:** se o banco retornar erro de constraint ao rodar
  os testes de integração no futuro, confirmar que `actorType` e `actorUserId`
  são coerentes — `insertOrderEvent` (L179) deriva `actorType` de
  `actorUserId`, então um `actorUserId` não-null sempre gera `actorType:"user"`.
- **Deferido fora deste plano:** validar que a filial destino (`branchId`) de
  fato existe na tabela `branch` e retornar erro amigável se não existir.
  Hoje o `branchRow?.name ?? branchId` mascara o caso de filial inexistente
  no metadata do event. Não é escopo deste fix (segurança), mas é tech-debt.
