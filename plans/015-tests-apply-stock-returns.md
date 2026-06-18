# Plan 015: applyStockReturns coberta por testes de unidade

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/orders/_lib/stock-returns.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`applyStockReturns` é a única função do sistema que reverte uma venda de estoque:
ela credita `stock_level` de volta e insere um `stock_movement` de auditoria.
Está no caminho crítico de transições `returned` e `refunded` em
`orders/actions.ts` (chamada na linha ~272). Zero cobertura de testes significa
que um sinal de delta errado, um `variantId` trocado ou uma FK `orderId`
faltando silenciosamente corrompe o estoque sem nenhum alarme. Este plano cria
a cobertura mínima: happy path (1 item), item desconhecido ignorado sem erro,
e múltiplos itens produzindo múltiplos movimentos.

## Current state

### Arquivo a testar

`apps/web/src/app/dashboard/orders/_lib/stock-returns.ts`

Assinatura verificada na linha 20–26:

```ts
// stock-returns.ts:20-26
export async function applyStockReturns(
    tx: StockReturnTx,
    orderId: string,
    returnItems: ReturnItemInput[],
    userId: string,
    reasonNote: string
): Promise<void>
```

Tipo do `tx` (linha 7):

```ts
// stock-returns.ts:7
export type StockReturnTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

### Lógica relevante (stock-returns.ts:27–83)

Por item do array `returnItems`:

1. **SELECT em `orderItem`** (linhas 28–36): busca `{ quantity, variantId }` filtrando
   `orderItem.id = item.orderItemId AND orderItem.orderId = orderId`.
   Se não encontrar (`!oi`), **faz `continue`** — sem erro.

2. **SELECT em `stockLevel`** (linhas 42–51): busca `{ quantity }` por
   `variantId + branchId` com `.for("update")`.
   `previousQty = sl?.quantity ?? 0`.

3. **INSERT/UPSERT em `stockLevel`** (linhas 56–67):
   `.insert(stockLevel).values({ variantId, branchId, quantity: newQty, updatedAt: new Date() })`
   `.onConflictDoUpdate({ target: [stockLevel.variantId, stockLevel.branchId], set: { quantity: newQty, updatedAt: new Date() } })`.

4. **INSERT em `stockMovement`** (linhas 69–82):
   ```ts
   {
     id: crypto.randomUUID(),
     variantId: oi.variantId,
     branchId: item.branchId,
     previousQty,
     newQty,
     delta: oi.quantity,        // sempre positivo (crédito)
     reason: "ajuste_inventario",
     reasonNote,
     orderId,
     orderItemId: item.orderItemId,
     actorType: "user",
     actorId: userId,
   }
   ```

### Onde é chamada

`apps/web/src/app/dashboard/orders/actions.ts` linha ~272:

```ts
if (toStatus === "returned" && returnItems && returnItems.length > 0) {
    await applyStockReturns(
        tx,
        orderId,
        returnItems,
        session.user.id,
        "Devolução ao estoque — pedido devolvido"
    );
}
```

### Convenções de teste do projeto

- **vitest**, `environment: node` — `apps/web/vitest.config.ts:5`
- Alias `server-only → src/__mocks__/server-only.ts` já configurado (stub vazio) —
  `apps/web/vitest.config.ts:17-20`; sem `vi.mock("server-only")`.
- `@emach/db` **não tem** alias automático: precisa ser mockado com `vi.mock("@emach/db")`.
- Padrão `vi.hoisted + vi.mock` para hoisting de fns: exemplar em
  `apps/web/src/lib/__tests__/notify.test.ts:3-7`.
- A função a testar **não** importa `@emach/db` diretamente — ela recebe `tx` como
  argumento. Portanto `vi.mock("@emach/db")` **não é necessário**; basta construir
  um `tx` mock manual.

### Estrutura do mock de `tx`

O `tx` precisa suportar dois padrões de chain:

**Chain de SELECT:**
```
tx.select(shape).from(table).where(cond)           → Promise<row[]>
tx.select(shape).from(table).where(cond).for("update") → Promise<row[]>
```
Cada `.select()` deve retornar valor diferente dependendo da tabela.

**Chain de INSERT:**
```
tx.insert(table).values(data)                        → Promise<void>
tx.insert(table).values(data).onConflictDoUpdate(…)  → Promise<void>
```

A forma mais simples: usar um `selectCallIndex` compartilhado (ou inspecionar
`table` no `.from()`) para retornar o resultado correto por chamada.

### Arquivo de teste a criar

`apps/web/src/app/dashboard/orders/_lib/__tests__/stock-returns.test.ts`
(diretório `__tests__` deve ser criado).

## Commands you will need

| Purpose    | Command                                                                                        | Expected on success          |
|------------|-----------------------------------------------------------------------------------------------|------------------------------|
| Testes     | `bun --cwd apps/web test src/app/dashboard/orders/_lib/__tests__/stock-returns.test.ts`       | 3 testes passando            |
| Testes all | `bun --cwd apps/web test`                                                                     | verde (≥ 54 arquivos / ≥ 359 testes + 3 novos) |
| Typecheck  | `bun check-types`                                                                             | exit 0                       |
| Lint       | `bun check`                                                                                   | exit 0                       |

## Scope

**In scope** (único arquivo a criar):
- `apps/web/src/app/dashboard/orders/_lib/__tests__/stock-returns.test.ts` (criar)

**Out of scope** (NÃO tocar):
- `apps/web/src/app/dashboard/orders/_lib/stock-returns.ts` — o teste deve
  adaptar-se ao código, não o inverso.
- Qualquer outro arquivo do repo.

## Git workflow

- Branch: `advisor/015-tests-apply-stock-returns`
- Commit único ao finalizar o step 1: `test(orders): cobertura de applyStockReturns`
- Não fazer push nem abrir PR.

## Steps

### Step 1: Criar o arquivo de teste

Criar o diretório e arquivo
`apps/web/src/app/dashboard/orders/_lib/__tests__/stock-returns.test.ts`
com o seguinte conteúdo. Leia o arquivo `stock-returns.ts` antes de escrever
para confirmar que as assinaturas e valores conferem com as excerpts acima.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyStockReturns,
  type ReturnItemInput,
} from "../stock-returns";

// ---------------------------------------------------------------------------
// Mock manual do `tx` do Drizzle.
// applyStockReturns recebe `tx` como argumento — não importa @emach/db,
// então vi.mock("@emach/db") não é necessário.
// ---------------------------------------------------------------------------

function makeTx(
  /**
   * Resultados que .select().from().where()[.for()] vai resolver, em ordem de
   * chamada. O primeiro call é o SELECT de orderItem; o segundo é o SELECT de
   * stockLevel. Para itens desconhecidos (skip), passe [] como primeiro item.
   */
  selectResults: unknown[][]
) {
  let callIdx = 0;

  // Builder de SELECT: encadeia .from/.where/.for e resolve ao final.
  const makeSelectChain = (result: unknown[]) => {
    const chain = {
      from: () => chain,
      where: () => chain,
      for: () => Promise.resolve(result),
      // sem .for() o vitest vai awaitar o objeto chain — então também precisamos
      // que o chain seja thenable quando não há .for()
      then: (
        resolve: (v: unknown[]) => void,
        _reject?: (e: unknown) => void
      ) => Promise.resolve(result).then(resolve, _reject),
    };
    return chain;
  };

  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insertOnConflict = vi.fn().mockResolvedValue(undefined);

  const makeInsertChain = () => ({
    values: (data: unknown) => {
      insertValues(data);
      return {
        onConflictDoUpdate: (opts: unknown) => {
          insertOnConflict(opts);
          return Promise.resolve(undefined);
        },
        // INSERT sem onConflictDoUpdate também é thenable
        then: (
          resolve: (v: undefined) => void,
          _reject?: (e: unknown) => void
        ) => Promise.resolve(undefined).then(resolve, _reject),
      };
    },
  });

  const tx = {
    select: vi.fn((_shape: unknown) => {
      const result = selectResults[callIdx++] ?? [];
      return makeSelectChain(result);
    }),
    insert: vi.fn((_table: unknown) => makeInsertChain()),
    // expor para assertions
    _insertValues: insertValues,
    _insertOnConflict: insertOnConflict,
  };

  return tx;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORDER_ID = "order-abc";
const USER_ID = "user-xyz";
const REASON_NOTE = "Devolução ao estoque — pedido devolvido";

const ITEM_INPUT: ReturnItemInput = {
  branchId: "branch-1",
  orderItemId: "oi-1",
};

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("applyStockReturns", () => {
  beforeEach(() => {
    // Limpar o spy global de crypto.randomUUID entre testes para não vazar estado.
    vi.restoreAllMocks();
  });

  it("(1) retorno normal: credita stock_level e insere stock_movement com delta positivo", async () => {
    // SELECT orderItem → 1 item com quantity=2, variantId="var-1"
    // SELECT stockLevel → 1 registro com quantity=10
    const tx = makeTx([
      [{ quantity: 2, variantId: "var-1" }], // orderItem
      [{ quantity: 10 }],                     // stockLevel
    ]);

    vi.spyOn(crypto, "randomUUID").mockReturnValue("mock-uuid-1" as ReturnType<typeof crypto.randomUUID>);

    await applyStockReturns(
      tx as unknown as Parameters<typeof applyStockReturns>[0],
      ORDER_ID,
      [ITEM_INPUT],
      USER_ID,
      REASON_NOTE
    );

    // Deve ter feito 2 SELECTs
    expect(tx.select).toHaveBeenCalledTimes(2);

    // INSERT em stockLevel (upsert)
    const stockLevelInsertArg = tx._insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(stockLevelInsertArg).toMatchObject({
      variantId: "var-1",
      branchId: "branch-1",
      quantity: 12, // 10 anterior + 2 devolvidos
    });
    expect(tx._insertOnConflict).toHaveBeenCalledOnce();

    // INSERT em stockMovement
    const movementArg = tx._insertValues.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(movementArg).toMatchObject({
      id: "mock-uuid-1",
      variantId: "var-1",
      branchId: "branch-1",
      previousQty: 10,
      newQty: 12,
      delta: 2,
      reason: "ajuste_inventario",
      reasonNote: REASON_NOTE,
      orderId: ORDER_ID,
      orderItemId: ITEM_INPUT.orderItemId,
      actorType: "user",
      actorId: USER_ID,
    });
  });

  it("(2) orderItem desconhecido: pulado sem erro, sem INSERT", async () => {
    // SELECT orderItem → vazio (item não pertence a este pedido)
    const tx = makeTx([
      [], // orderItem não encontrado
    ]);

    await expect(
      applyStockReturns(
        tx as unknown as Parameters<typeof applyStockReturns>[0],
        ORDER_ID,
        [ITEM_INPUT],
        USER_ID,
        REASON_NOTE
      )
    ).resolves.toBeUndefined();

    // Apenas 1 SELECT (orderItem) — não chega ao SELECT de stockLevel
    expect(tx.select).toHaveBeenCalledTimes(1);
    // Nenhum INSERT
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("(3) 2 itens: 2 movimentos de estoque inseridos", async () => {
    const item2: ReturnItemInput = { branchId: "branch-2", orderItemId: "oi-2" };

    // Por item: SELECT orderItem, SELECT stockLevel — 4 SELECTs no total
    const tx = makeTx([
      [{ quantity: 3, variantId: "var-1" }], // orderItem item 1
      [{ quantity: 5 }],                      // stockLevel item 1
      [{ quantity: 1, variantId: "var-2" }], // orderItem item 2
      [],                                     // stockLevel item 2 — não existe ainda (previousQty=0)
    ]);

    await applyStockReturns(
      tx as unknown as Parameters<typeof applyStockReturns>[0],
      ORDER_ID,
      [ITEM_INPUT, item2],
      USER_ID,
      REASON_NOTE
    );

    expect(tx.select).toHaveBeenCalledTimes(4);
    // 2 upserts em stockLevel + 2 inserts em stockMovement = 4 calls a insertValues
    expect(tx._insertValues).toHaveBeenCalledTimes(4);

    // Verificar o movimento do item 2 especificamente (previousQty=0, newQty=1)
    const movement2 = tx._insertValues.mock.calls[3]?.[0] as Record<string, unknown>;
    expect(movement2).toMatchObject({
      variantId: "var-2",
      branchId: "branch-2",
      previousQty: 0,
      newQty: 1,
      delta: 1,
      orderId: ORDER_ID,
      orderItemId: item2.orderItemId,
    });
  });
});
```

**Notas de implementação para o executor:**

- O `makeSelectChain` retorna um objeto com `.then()` para ser awaitable diretamente
  (caso 1 — sem `.for()`) e também implementa `.for()` (caso 2 — stockLevel). A
  função `applyStockReturns` usa `await tx.select(...).from(...).where(...)` sem `.for()`
  no primeiro SELECT, e com `.for("update")` no segundo. Ambos os casos são cobertos.
- Se o vitest lançar `TypeError: tx.select(...).from(...).where(...).then is not a function`,
  significa que o chain não está sendo awaited corretamente — confirme que `makeSelectChain`
  expõe `.then` e que o `callIdx` está incrementando na chamada `.select()`, não no `.from()`.
- Se `tx._insertValues.mock.calls[0]` for `undefined` no teste 1, o `insertValues` spy não
  está sendo chamado — verifique se `makeInsertChain().values` invoca `insertValues(data)`.
- `vi.spyOn(crypto, "randomUUID")` pode requerer `"@types/node"` estar instalado (já está
  neste projeto). Se falhar, use `vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("mock-uuid-1") })`.

**Verify**: `bun --cwd apps/web test src/app/dashboard/orders/_lib/__tests__/stock-returns.test.ts`
→ 3 testes passando, exit 0.

### Step 2: Typecheck e lint

**Verify typecheck**: `bun check-types` → exit 0, sem erros novos.

**Verify lint**: `bun check` → exit 0, sem erros novos.

### Step 3: Rodar a suíte completa

**Verify**: `bun --cwd apps/web test` → verde; contagem de arquivos ≥ 55 (54 baseline + 1
novo), contagem de testes ≥ 362 (359 baseline + 3 novos).

### Step 4: Commit

```
git add apps/web/src/app/dashboard/orders/_lib/__tests__/stock-returns.test.ts
git commit -m "test(orders): cobertura de applyStockReturns"
```

**Verify**: `git status` → working tree limpa; `git log --oneline -1` mostra o commit.

## Test plan

Arquivo: `apps/web/src/app/dashboard/orders/_lib/__tests__/stock-returns.test.ts`

| # | Caso                             | Assertivas-chave                                                                     |
|---|----------------------------------|--------------------------------------------------------------------------------------|
| 1 | 1 item — retorno normal          | delta = oi.quantity (+2); previousQty correto; reason = "ajuste_inventario"; actorId = userId; onConflictDoUpdate chamado |
| 2 | orderItem desconhecido           | resolve sem erro; nenhum INSERT; apenas 1 SELECT                                     |
| 3 | 2 itens                          | 4 SELECTs; 4 INSERTs (2 upserts + 2 movimentos); item 2 com previousQty=0 (stockLevel vazia) |

Padrão estrutural: mock manual de `tx` (sem `vi.mock("@emach/db")`) com builder
fluent thenable. Não há exemplar de Drizzle tx mock existente no repo — este é o
primeiro. Referência de `vi.hoisted + vi.fn`: `apps/web/src/lib/__tests__/notify.test.ts`.

Comando de execução: `bun --cwd apps/web test src/app/dashboard/orders/_lib/__tests__/stock-returns.test.ts`

## Done criteria

Machine-checkable. TODOS devem ser verdadeiros:

- [ ] `bun --cwd apps/web test src/app/dashboard/orders/_lib/__tests__/stock-returns.test.ts` → exit 0, 3 testes passando
- [ ] `bun --cwd apps/web test` → exit 0, ≥ 55 arquivos de teste, ≥ 362 testes
- [ ] `bun check-types` → exit 0
- [ ] `bun check` → exit 0
- [ ] `git diff --name-only HEAD~1 HEAD` lista exatamente um arquivo:
  `apps/web/src/app/dashboard/orders/_lib/__tests__/stock-returns.test.ts`
- [ ] `git status` → working tree limpa
- [ ] `plans/README.md` atualizado com status DONE para o plan 015

## STOP conditions

Para e reporta (não improvise) se:

- O arquivo `stock-returns.ts` diverge dos excerpts em "Current state" (assinatura,
  campos do INSERT, valor de `reason`) — use o valor real do arquivo, mas sinalize
  que o plano tem drift.
- `TypeError: ... is not a function` no chain do mock após 2 tentativas de ajuste —
  a forma do builder pode ter mudado; reporte a cadeia exata que falha.
- O teste 1 falha com `insertValues.mock.calls[0] === undefined` após confirmar que
  `makeInsertChain().values` invoca o spy — pode ser problema de binding de closure;
  reporte o shape do mock atual.
- `bun check-types` falha com erro em arquivo fora do escopo — stop; não tocar
  arquivos fora da lista de escopo para corrigir.
- `bun check` reprovado por regra de lint **no arquivo de teste** que não tem
  solução óbvia dentro do escopo — reporte a regra e o trecho.

## Maintenance notes

- Este é o **primeiro teste que mocka `tx` do Drizzle** no repo. Se outros testes
  precisarem de padrão similar (ex: testar funções que recebem `tx` como argumento),
  extrair `makeTx` para um helper compartilhado em
  `apps/web/src/app/dashboard/__tests__/helpers/mock-tx.ts`.
- Se `applyStockReturns` ganhar suporte a `refunded` (com lógica diferente de reason
  ou delta negativo), adicionar um caso 4 aqui.
- O teste usa `vi.spyOn(crypto, "randomUUID")` — se o projeto migrar para um gerador
  de ID diferente (`nanoid`, ULID), este spy precisará ser atualizado. A raiz CLAUDE.md
  determina `crypto.randomUUID()` como padrão.
- O reviewer deve verificar que o campo `actorId` (não `actorUserId`) é assertado
  corretamente — `stockMovement` usa `actorId`; as demais tabelas de auditoria usam
  `actorUserId` (armadilha documentada em `apps/web/CLAUDE.md`, seção "Auditoria de mutações DB").
