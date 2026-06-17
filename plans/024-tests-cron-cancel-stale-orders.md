# Plan 024: Cobertura de testes do handler cron cancel-stale-orders (auth + idempotência)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- apps/web/src/app/api/cron/cancel-stale-orders/route.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

O handler `cancel-stale-orders` roda diariamente em produção (04:00 UTC via Vercel Cron) e é o único mecanismo que fecha pedidos travados em `pending_payment`. Suas três garantias críticas — gate de auth, idempotência por `SELECT FOR UPDATE` + re-check de estado, e isolamento de erro por item — não têm cobertura de teste. Uma regressão nessas garantias pode vazar acesso não autenticado ao endpoint, cancelar pedidos duplamente em disparo concorrente, ou silenciar uma falha de item que impede os demais de serem cancelados. Os testes documentam o contrato e criam um ponto de regressão automático.

## Current state

### Arquivo do handler

`apps/web/src/app/api/cron/cancel-stale-orders/route.ts` — Route handler GET do Vercel Cron. Não há `__tests__/` no diretório hoje.

Conteúdo atual relevante (confirmado em `route.ts`):

```ts
// route.ts:1-11 — imports
import { db } from "@emach/db";
import { orderStatusHistory, order as orderTable } from "@emach/db/schema/orders";
import { env } from "@emach/env/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// route.ts:12-13
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// route.ts:19-23 — gate de auth (L21: comparação exata)
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

// route.ts:25-35 — select de pedidos stale
  let canceled = 0;
  try {
    const staleOrders = await db
      .select({ id: orderTable.id })
      .from(orderTable)
      .where(
        and(
          eq(orderTable.status, "pending_payment"),
          lt(orderTable.createdAt, sql`now() - ${STALE_INTERVAL}`)
        )
      );

// route.ts:37-69 — loop item-a-item com transação individual
    for (const { id } of staleOrders) {
      try {
        await db.transaction(async (tx) => {
          const [current] = await tx
            .select({ status: orderTable.status })
            .from(orderTable)
            .where(eq(orderTable.id, id))
            .for("update");                       // L44: SELECT FOR UPDATE

          if (!current || current.status !== "pending_payment") {
            return; // L46: re-check — idempotência contra race condition
          }

          await tx.update(orderTable).set({ status: "canceled", canceledAt: new Date() }).where(eq(orderTable.id, id));

          await tx.insert(orderStatusHistory).values({
            id: crypto.randomUUID(),
            orderId: id,
            fromStatus: "pending_payment",
            toStatus: "canceled",
            actorType: "system",      // L60: actorType = "system"
            actorUserId: null,        // L61: FK null
            reason: REASON,
          });

          canceled++;
        });
      } catch (perOrderErr) {
        logger.error("cancelStaleOrder", { orderId: id, err: perOrderErr }); // L67-68: erro isolado, não relança
      }
    }

    return NextResponse.json({ ok: true, canceled }); // L72: shape de resposta sucesso
  } catch (err) {
    logger.error("cancelStaleOrdersCron", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 }); // L74-77: fallback 500
  }
}
```

Shape de resposta confirmado (route.ts:72):
- Sucesso: `{ ok: true, canceled: number }`
- Auth fail: `{ error: "Unauthorized" }` com status 401
- Erro geral: `{ ok: false, error: "Internal error" }` com status 500

### Convenções de mock do projeto

O padrão de mock de `@emach/db` no projeto usa `vi.hoisted` + `vi.mock` com fns `vi.fn()` encadeadas.
Exemplar canônico para o padrão `vi.hoisted` + `vi.mock`: `apps/web/__tests__/activity.test.ts` (lines 3-17).
Exemplar para helpers de mock de query encadeada (`.from().where().limit()`): `apps/web/__tests__/permissions.test.ts` (lines 94-111, helpers `mockTargetLookup`/`mockCountQuery`):

```ts
vi.mock("@emach/db", () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));
```

Para o query builder encadeado `db.select().from().where()`, cada método retorna um objeto com o próximo:
```ts
function mockSelectQuery(result: unknown[]) {
  const where = vi.fn(() => Promise.resolve(result));
  const from = vi.fn(() => ({ where }));
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}
```

O `db.transaction` recebe um callback `(tx) => Promise`. Para mockar: capturar o callback e chamá-lo com um `tx` mockado.

### Mock de `@emach/env/server`

`packages/env/src/server.ts` usa `@t3-oss/env-core` que valida `process.env` na importação — se `CRON_SECRET` não estiver setado, o import falha com erro de validação. Para testes, mockar o módulo inteiro:

```ts
vi.mock("@emach/env/server", () => ({
  env: { CRON_SECRET: "test-secret-32-chars-minimum-ok" },
}));
```

O mock deve vir **antes** do import do `route.ts` (exigência do hoisting do vitest).

### Config do vitest

`apps/web/vitest.config.ts` (lines 1-22):
- `environment: "node"`
- `include`: `src/**/*.test.ts` e `__tests__/**/*.test.ts`
- alias `server-only` → stub vazio (testes de código que usa `server-only` não precisam de `vi.mock` extra)

### Onde criar o arquivo

Diretório destino: `apps/web/src/app/api/cron/cancel-stale-orders/__tests__/route.test.ts`

O padrão `src/**/*.test.ts` do `vitest.config.ts` cobre esse caminho.

## Commands you will need

| Purpose       | Command                                                   | Expected on success                |
|---------------|-----------------------------------------------------------|------------------------------------|
| Instalar deps | `bun install` (na raiz)                                   | exit 0                             |
| Typecheck     | `bun check-types`                                         | exit 0, sem erros                  |
| Lint          | `bun check`                                               | exit 0                             |
| Testes (todos)| `bun --cwd apps/web test`                                 | verde, inclui os 4 novos           |
| Testes (filtro)| `bun --cwd apps/web test cancel-stale`                   | verde, só os 4 novos               |
| Guard forms   | `bun guard:forms`                                         | exit 0                             |

## Scope

**In scope** (único arquivo a criar):
- `apps/web/src/app/api/cron/cancel-stale-orders/__tests__/route.test.ts` (criar)

**Out of scope** (não tocar, mesmo que pareça relacionado):
- `apps/web/src/app/api/cron/cancel-stale-orders/route.ts` — o handler **não deve ser modificado**; se o mock exigir mudança estrutural, ajuste o mock (ver STOP conditions).
- `packages/env/src/server.ts` — mockar via `vi.mock`, não editar.
- `packages/db/src/index.ts` — mockar via `vi.mock`, não editar.
- Qualquer outro arquivo de teste existente.
- `plans/README.md` — atualizar o status ao concluir, mas não editar outras linhas.

## Git workflow

- Branch: `advisor/024-tests-cron-cancel-stale-orders`
- 1 commit após os testes estarem verdes e o typecheck/lint passando.
- Mensagem de commit: `testes: cobertura do cron cancel-stale-orders`
- NÃO fazer push, NÃO abrir PR sem instrução explícita.

## Steps

### Step 1: Criar o diretório e o arquivo de teste

Criar `apps/web/src/app/api/cron/cancel-stale-orders/__tests__/route.test.ts` com o seguinte conteúdo:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (devem vir antes dos imports do código sob teste) ---

vi.mock("@emach/env/server", () => ({
  env: { CRON_SECRET: "test-secret-32-chars-minimum-ok" },
}));

const { mockDbSelect, mockDbTransaction } = vi.hoisted(() => {
  const mockDbSelect = vi.fn();
  const mockDbTransaction = vi.fn();
  return { mockDbSelect, mockDbTransaction };
});

vi.mock("@emach/db", () => ({
  db: {
    select: mockDbSelect,
    transaction: mockDbTransaction,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

// --- imports do código sob teste ---

import { GET } from "../route";
import { logger } from "@/lib/logger";

// --- helpers ---

/** Monta um Request com o header de auth correto. */
function makeRequest(token = "test-secret-32-chars-minimum-ok") {
  return new Request("http://localhost/api/cron/cancel-stale-orders", {
    headers: { authorization: `Bearer ${token}` },
  });
}

/**
 * Moca o SELECT de pedidos stale (lista de IDs).
 * Corresponde a: db.select({ id }).from(orderTable).where(and(...))
 */
function mockStaleOrders(ids: string[]) {
  const where = vi.fn(() => Promise.resolve(ids.map((id) => ({ id }))));
  const from = vi.fn(() => ({ where }));
  mockDbSelect.mockReturnValueOnce({ from });
}

/**
 * Moca db.transaction para executar o callback com um tx mockado.
 * `txSelects` é uma lista de resultados que tx.select retorna em sequência.
 * `insertOk` controla se tx.insert resolve ou rejeita.
 */
function mockTransaction(
  txSelects: ({ status: string } | null)[],
  opts: { insertOk?: boolean; updateOk?: boolean } = {}
) {
  const { insertOk = true, updateOk = true } = opts;

  mockDbTransaction.mockImplementationOnce(
    async (callback: (tx: unknown) => Promise<void>) => {
      let selectCallIdx = 0;
      const tx = {
        select: vi.fn(() => {
          const result = txSelects[selectCallIdx++];
          const forUpdate = vi.fn(() =>
            Promise.resolve(result ? [result] : [])
          );
          const where = vi.fn(() => ({ for: forUpdate }));
          const from = vi.fn(() => ({ where }));
          return { from };
        }),
        update: vi.fn(() => {
          const where = vi.fn(() =>
            updateOk ? Promise.resolve() : Promise.reject(new Error("DB error"))
          );
          const set = vi.fn(() => ({ where }));
          return { set };
        }),
        insert: vi.fn(() => ({
          values: vi.fn(() =>
            insertOk
              ? Promise.resolve()
              : Promise.reject(new Error("Insert error"))
          ),
        })),
      };
      return callback(tx);
    }
  );
}

// --- testes ---

describe("GET /api/cron/cancel-stale-orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("gate de autenticação", () => {
    it("retorna 401 quando o header Authorization está ausente", async () => {
      const req = new Request(
        "http://localhost/api/cron/cancel-stale-orders"
      );
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("retorna 401 quando o Bearer token está errado", async () => {
      const req = makeRequest("token-errado");
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });
  });

  describe("sem pedidos stale", () => {
    it("retorna { ok: true, canceled: 0 } sem nenhuma transação", async () => {
      mockStaleOrders([]);

      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, canceled: 0 });
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });
  });

  describe("pedidos stale cancelados", () => {
    it("cancela N pedidos e retorna { ok: true, canceled: N }", async () => {
      mockStaleOrders(["order-1", "order-2", "order-3"]);
      mockTransaction([{ status: "pending_payment" }]);
      mockTransaction([{ status: "pending_payment" }]);
      mockTransaction([{ status: "pending_payment" }]);

      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, canceled: 3 });
    });

    it("cada transação usa SELECT FOR UPDATE antes de cancelar (idempotência)", async () => {
      mockStaleOrders(["order-idempotent"]);
      mockTransaction([{ status: "pending_payment" }]);

      await GET(makeRequest());

      // A transação foi chamada uma vez para o pedido
      expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    });

    it("pula pedido cujo status mudou entre o SELECT e o lock (re-check)", async () => {
      // Dois pedidos: o primeiro mudou de status (não deve ser cancelado),
      // o segundo está pending_payment (deve ser cancelado).
      mockStaleOrders(["order-changed", "order-still-pending"]);
      // Pedido 1: status mudou para "canceled" antes do lock
      mockTransaction([{ status: "canceled" }]);
      // Pedido 2: ainda pending_payment
      mockTransaction([{ status: "pending_payment" }]);

      const res = await GET(makeRequest());
      const body = await res.json();
      // Só o pedido-2 incrementa o contador
      expect(body).toEqual({ ok: true, canceled: 1 });
    });

    it("pula pedido não encontrado no SELECT FOR UPDATE (current = undefined)", async () => {
      mockStaleOrders(["order-gone"]);
      // Simula linha não encontrada: txSelects = [null]
      mockTransaction([null]);

      const res = await GET(makeRequest());
      const body = await res.json();
      expect(body).toEqual({ ok: true, canceled: 0 });
    });
  });

  describe("isolamento de erro por item", () => {
    it("continua processando os demais quando um item falha na transação", async () => {
      mockStaleOrders(["order-fail", "order-ok"]);

      // Primeiro pedido: transação lança erro
      mockDbTransaction.mockImplementationOnce(async () => {
        throw new Error("Simulated DB failure");
      });
      // Segundo pedido: transação normal
      mockTransaction([{ status: "pending_payment" }]);

      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      // order-fail não incrementa; order-ok sim
      expect(body).toEqual({ ok: true, canceled: 1 });
      // O erro do item isolado deve ter sido logado
      expect(logger.error).toHaveBeenCalledWith(
        "cancelStaleOrder",
        expect.objectContaining({ orderId: "order-fail" })
      );
    });
  });
});
```

**Notas de implementação do arquivo:**

1. O mock de `@emach/env/server` usa valor fixo `"test-secret-32-chars-minimum-ok"` (32 chars — passa a validação `z.string().min(32)` de `packages/env/src/server.ts:26`). Não usar valor real do `.env`.

2. O `vi.hoisted` é necessário porque o vitest eleva os `vi.mock(...)` para antes de qualquer import. Sem `vi.hoisted`, as variáveis `mockDbSelect`/`mockDbTransaction` seriam `undefined` no momento em que a factory do `vi.mock` for executada.

3. O helper `mockTransaction` simula o padrão do handler: `db.transaction(async (tx) => { ... })`. O `tx.select().from().where().for("update")` deve retornar o array de `{ status }` (ou `[]` quando o pedido sumiu).

4. O campo `actorType: "system"` e `actorUserId: null` são escritos pelo handler no `tx.insert(orderStatusHistory).values({...})`. Os testes não verificam os argumentos do insert diretamente (exceto indiretamente pelo `canceled` count), o que é intencional — o contrato crítico testado é auth + idempotência + isolamento.

**Verify**: `bun --cwd apps/web test cancel-stale` → 8 testes passando (2 auth + 1 sem pedidos + 3 cancelamento + 1 isolamento de erro + 1 pedido gone).

> Contagem: `authorization ausente`, `token errado`, `sem pedidos`, `cancela N=3`, `usa SELECT FOR UPDATE`, `pula status mudado`, `pula pedido gone`, `isola erro` = 8 testes.

### Step 2: Typecheck e lint

Após o arquivo estar criado e os testes passando:

**Verify typecheck**: `bun check-types` → exit 0

**Verify lint**: `bun check` → exit 0

Se o typecheck apontar erro de tipo nos mocks (ex: `vi.fn()` não atribuível ao tipo do Drizzle), adicionar `as ReturnType<typeof vi.fn>` na chamada de `mockReturnValueOnce`, espelhando o padrão de `apps/web/__tests__/permissions.test.ts:98`.

### Step 3: Rodar a suíte completa e commitar

**Verify**: `bun --cwd apps/web test` → exit 0, baseline anterior + 8 novos testes.

**Verify**: `bun guard:forms` → exit 0

Após verificação completa:

```
git add apps/web/src/app/api/cron/cancel-stale-orders/__tests__/route.test.ts
git commit -m "testes: cobertura do cron cancel-stale-orders"
```

## Test plan

Arquivo a criar: `apps/web/src/app/api/cron/cancel-stale-orders/__tests__/route.test.ts`

Casos cobertos:

| # | Caso | Descrição |
|---|------|-----------|
| 1 | Auth ausente → 401 | `Authorization` header não enviado |
| 2 | Token errado → 401 | Bearer token diverge do `CRON_SECRET` |
| 3 | Sem pedidos stale → `{ok:true, canceled:0}` | SELECT retorna `[]`, nenhuma transação chamada |
| 4 | N pedidos stale → `{ok:true, canceled:N}` | Todos com status `pending_payment` no re-check |
| 5 | SELECT FOR UPDATE chamado | Idempotência: lock por item antes de cancelar |
| 6 | Status mudou entre list e lock → pula | Re-check retorna status diferente de `pending_payment` |
| 7 | Pedido desapareceu → pula | `SELECT FOR UPDATE` retorna array vazio |
| 8 | Um item falha → demais processam | Erro isolado, `logger.error` chamado com `orderId` |

Padrão estrutural de referência: `apps/web/__tests__/activity.test.ts` (vi.hoisted + vi.mock de @emach/db, linhas 3-17) e `apps/web/__tests__/permissions.test.ts` (helpers de mock encadeado `mockTargetLookup`/`mockCountQuery`, linhas 94-111; `beforeEach` + `vi.clearAllMocks`).

**Verificação final**: `bun --cwd apps/web test cancel-stale` → 8 testes passando.

## Done criteria

Machine-checkable. TODOS devem valer:

- [ ] `bun check-types` sai 0
- [ ] `bun check` sai 0
- [ ] `bun guard:forms` sai 0
- [ ] `bun --cwd apps/web test` sai 0; `cancel-stale` aparece na saída com 8 testes passando
- [ ] Apenas `apps/web/src/app/api/cron/cancel-stale-orders/__tests__/route.test.ts` aparece em `git status` (somente arquivo novo)
- [ ] `apps/web/src/app/api/cron/cancel-stale-orders/route.ts` **não** aparece em `git diff`
- [ ] `plans/README.md` atualizado com status DONE para o plan 024

## STOP conditions

Parar e reportar (não improvisar) se:

- O trecho em `route.ts:19-23` (gate de auth) ou `route.ts:37-69` (loop com transação) não corresponder ao excerpt da seção "Current state" — o handler pode ter sido modificado desde este plano.
- Os testes do `vi.mock("@emach/db")` falham com `Cannot find module '@emach/db'` — verificar se o alias está resolvido no `vitest.config.ts` e se o pacote está listado em `apps/web/package.json`.
- O mock de `@emach/env/server` não é suficiente (o módulo valida `process.env` antes do `vi.mock` ser elevado) — investigar se o env package usa `import.meta.env` ou lazy-init antes de propor ajuste.
- O `vi.hoisted` não está disponível na versão do vitest instalada — verificar versão com `bun --cwd apps/web x vitest --version`.
- O helper `mockTransaction` não consegue simular `tx.select().from().where().for("update")` com a API atual do Drizzle mock — ajustar a cadeia, mas **nunca modificar o `route.ts`**.
- Qualquer step com verificação falha duas vezes após tentativa de fix razoável.
- A coverage dos 8 testes exige tocar em arquivo fora do escopo declarado.

## Maintenance notes

- **Se o handler mudar:** qualquer alteração na cadeia `db.select().from().where()` ou na assinatura do `db.transaction` quebrará os mocks deste teste — atualizar o helper de mock correspondente.
- **Se `CRON_SECRET` for rotacionado:** o valor mock `"test-secret-32-chars-minimum-ok"` é sintético (nunca expõe o secret real) — nenhuma atualização necessária nos testes.
- **Se um novo cron job for adicionado:** criar `__tests__/route.test.ts` análogo no novo diretório, usando este arquivo como referência estrutural.
- **Reviewer:** verificar que `logger.error` é de fato chamado com `{ orderId, err }` no teste de isolamento (caso 8) — essa asserção garante que o handler não swallowa silenciosamente o erro sem logar.
- **Follow-up explicitamente adiado:** teste de resposta 500 (erro no SELECT inicial de stale orders) não está neste plano por ser menos crítico; pode ser adicionado como caso 9 se desejado.
