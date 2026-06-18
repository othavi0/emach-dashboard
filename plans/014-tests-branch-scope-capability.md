# Plan 014: Cobrir branch-scoping com testes (assertBranchScope / getUserBranchScope / requireCapabilityWithContext)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- apps/web/src/lib/permissions.ts apps/web/src/lib/branch-scope.ts apps/web/__tests__/permissions.test.ts apps/web/__tests__/branch-scope.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (habilita plans/012 e 013 com segurança)
- **Category**: tests
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`assertBranchScope` é o único mecanismo que impede um admin de operar em filiais fora do seu
escopo. Uma regressão aqui liberaria operações cross-branch silenciosamente — sem throw, sem
log, sem auditoria. ADR-0016 é recente e de alta-churn (ligado em 2026-06-15). O suite
`permissions.test.ts` já existe e cobre os outros guards, mas `targetBranchIds` **nunca é
passado** em nenhuma das ~11 chamadas a `requireCapabilityWithContext` — o caminho de
branch-scoping está completamente descoberto. `getUserBranchScope` também não tem testes que
exercitem o mapeamento de role → escopo com DB mockado; o `branch-scope.test.ts` existente
testa apenas as funções puras (`inScope`, `isBlindScope`).

## Current state

### Arquivos relevantes

- `apps/web/src/lib/permissions.ts` — função `assertBranchScope` (L218-L232) chamada por
  `requireCapabilityWithContext` (L260-L263) quando `ctx.targetBranchIds` está definido.
- `apps/web/src/lib/branch-scope.ts` — `getUserBranchScope` (L12-L28): super_admin → `{kind:"all"}`; admin/user → `{kind:"scoped", branchIds, includeUnassigned: role==="admin"}`.
- `apps/web/__tests__/permissions.test.ts` — suite existente, **sem nenhum caso com `targetBranchIds`**.
- `apps/web/__tests__/branch-scope.test.ts` — testa só `inScope`/`isBlindScope` (funções puras, sem DB).

### Trechos críticos confirmados

**`permissions.ts` L218-L232** — `assertBranchScope`:
```ts
// Branch-scoping: non-super_admin só age sobre filiais no próprio escopo.
async function assertBranchScope(
  session: DashboardSession,
  targetBranchIds: string[]
): Promise<void> {
  if (session.user.role === "super_admin") {
    return;
  }
  const scope = await getUserBranchScope(session);
  for (const targetId of targetBranchIds) {
    if (!inScope(scope, targetId)) {
      throw new Error(`Filial fora do seu escopo: ${targetId}`);
    }
  }
}
```
A **string exata** do erro é: `Filial fora do seu escopo: ${targetId}` (i.e., inclui o ID).
O teste deve fazer `.toThrow("Filial fora do seu escopo: b-rj")` ou
`.toThrow(/Filial fora do seu escopo/)`.

**`permissions.ts` L260-L263** — gate de branch em `requireCapabilityWithContext`:
```ts
if (ctx.targetBranchIds) {
  await assertBranchScope(session, ctx.targetBranchIds);
}
```

**`branch-scope.ts` L12-L28** — `getUserBranchScope`:
```ts
export const getUserBranchScope = cache(
  async (session: DashboardSession): Promise<BranchScope> => {
    const role = (session.user.role ?? "user") as UserRole;
    if (role === "super_admin") {
      return { kind: "all" };
    }
    const rows = await db
      .select({ branchId: userBranch.branchId })
      .from(userBranch)
      .where(eq(userBranch.userId, session.user.id));
    return {
      kind: "scoped",
      branchIds: rows.map((r) => r.branchId),
      includeUnassigned: role === "admin",
    };
  }
);
```
Super_admin → `{kind:"all"}` (sem query). Admin → `{kind:"scoped", ..., includeUnassigned: true}`.
User → `{kind:"scoped", ..., includeUnassigned: false}`.

### Padrão de mock existente (referência obrigatória)

O suite `apps/web/__tests__/permissions.test.ts` já mocka `@emach/db`, `@/lib/session`, e
`next/navigation` exatamente como novos testes devem fazer. O helper `mockOverrides` (L107-L111)
demonstra o padrão de chain de Drizzle:

```ts
function mockOverrides(rows: { capability: string; effect: string }[]) {
  const where = vi.fn(() => Promise.resolve(rows));
  const from = vi.fn(() => ({ where }));
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}
```

O `db.select` é compartilhado entre `getUserCapabilities` (overrides) e `getUserBranchScope`
(userBranch). A ordem das chamadas importa: dentro de `requireCapabilityWithContext`, capabilities
são resolvidas **antes** de `assertBranchScope`. Portanto:
- Para testes de admin (não super_admin): `mockOverrides([])` PRIMEIRO, depois o mock de branches.
- Para super_admin: `getUserCapabilities` tem early-return → `db.select` não é chamado para
  overrides. O mock de branches deve ser o PRIMEIRO (e único) `mockReturnValueOnce`.

### Mock de branches (helper a criar)

```ts
function mockBranchRows(branchIds: string[]) {
  const where = vi.fn(() =>
    Promise.resolve(branchIds.map((branchId) => ({ branchId })))
  );
  const from = vi.fn(() => ({ where }));
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}
```

Este padrão espelha `mockTargetBranches` em `apps/web/__tests__/set-user-capability.test.ts`
(L31-L37) e usa o mesmo chain `.select().from().where()` que `getUserBranchScope` executa.

### Convenções do repo que se aplicam aqui

- Vitest com `environment: node` (ver `apps/web/vitest.config.ts` L6).
- `vi.mock` no topo do arquivo, antes de qualquer `import` não-vitest.
- `server-only` já é resolvido pelo alias do vitest (não precisa mockar separado).
- `getUserBranchScope` usa `React.cache` — em testes, cada sessão com `id` diferente garante
  cache miss (mesmo padrão de `getUserCapabilities` em L291-L296 de `permissions.test.ts`).
- IDs de sessão únicos por caso de teste para evitar colisão de cache entre testes.
- `beforeEach(() => { vi.clearAllMocks(); ... })` para resetar mocks de `requireCurrentSession`.

## Commands you will need

| Purpose         | Command                                                                                      | Expected on success          |
|-----------------|----------------------------------------------------------------------------------------------|------------------------------|
| Typecheck       | `bun check-types`                                                                            | exit 0, sem erros            |
| Lint            | `bun check`                                                                                  | exit 0 (ultracite/biome)     |
| Testes (todos)  | `bun --cwd apps/web test`                                                                    | verde (baseline ≥54 arquivos / ≥359 testes) |
| Testes filtrado | `bun --cwd apps/web test --reporter=verbose permissions`                                     | verde, novos casos visíveis  |
| Testes filtrado | `bun --cwd apps/web test --reporter=verbose branch-scope`                                   | verde, novos casos visíveis  |
| Guard forms     | `bun guard:forms`                                                                            | exit 0                       |
| Grep done crit  | `grep -n "assertBranchScope\|targetBranchIds" apps/web/__tests__/permissions.test.ts`        | ≥4 matches (1 por caso novo) |

## Scope

**In scope** (os únicos arquivos a modificar):
- `apps/web/__tests__/permissions.test.ts` — adicionar `describe` de branch-scoping com ≥4 casos.
- `apps/web/__tests__/branch-scope.test.ts` — adicionar `describe` de `getUserBranchScope` com ≥4 casos (DB mockado).

**Out of scope** (NÃO tocar):
- `apps/web/src/lib/permissions.ts` — código de produção; este plano não muda comportamento.
- `apps/web/src/lib/branch-scope.ts` — idem.
- Qualquer outro arquivo fora de `apps/web/__tests__/`.
- `plans/README.md` — não editar; um agente dedicado atualiza o índice.

## Git workflow

- Branch: `advisor/014-tests-branch-scope-capability`
- Commits em Conventional Commits PT, subject ≤50 chars. Exemplo do repo:
  `git log --oneline -5` (confirmar no repo). Sugestões:
  - `test(permissions): cobrir assertBranchScope/targetBranchIds`
  - `test(branch-scope): cobrir getUserBranchScope com DB mockado`
- **Não** fazer push nem abrir PR sem instrução explícita do operador.

## Steps

### Step 1: Verificar baseline dos testes

Confirmar que o suite atual passa sem modificações.

```
bun --cwd apps/web test
```

**Verify**: exit 0, todos os testes verdes. Anotar contagem atual (ex: "54 arquivos, 359 testes").
Se falhar, STOP — há regressão pré-existente que não é responsabilidade deste plano.

---

### Step 2: Adicionar testes de branch-scoping em `permissions.test.ts`

Ler o arquivo atual antes de editar (`Read apps/web/__tests__/permissions.test.ts`) para
confirmar o estado real — o hook auto-format pode ter reordenado campos.

Adicionar um novo `describe` **no final** do arquivo, após o bloco `getUserCapabilities`:

```ts
describe("requireCapabilityWithContext — branch-scoping (assertBranchScope)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin com targetBranchIds fora do escopo → rejeita", async () => {
    // ID único = cache miss em getUserBranchScope (React.cache).
    const s = {
      user: { id: "bs-admin-1", status: "active", role: "admin" },
    } as never;
    (requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
    // 1º db.select: overrides (admin não tem early-return em getUserCapabilities).
    mockOverrides([]);
    // 2º db.select: userBranch rows → admin tem só b-sp.
    mockBranchRows(["b-sp"]);
    await expect(
      requireCapabilityWithContext("orders.update_status", {
        targetBranchIds: ["b-rj"],
      })
    ).rejects.toThrow("Filial fora do seu escopo: b-rj");
  });

  it("admin com targetBranchIds dentro do escopo → resolve", async () => {
    const s = {
      user: { id: "bs-admin-2", status: "active", role: "admin" },
    } as never;
    (requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
    mockOverrides([]);
    mockBranchRows(["b-sp"]);
    await expect(
      requireCapabilityWithContext("orders.update_status", {
        targetBranchIds: ["b-sp"],
      })
    ).resolves.toBe(s);
  });

  it("super_admin resolve para qualquer branch sem consultar escopo", async () => {
    const s = {
      user: { id: "bs-sa-1", status: "active", role: "super_admin" },
    } as never;
    (requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
    // super_admin: early-return em getUserCapabilities E em assertBranchScope.
    // db.select NÃO deve ser chamado.
    await expect(
      requireCapabilityWithContext("orders.update_status", {
        targetBranchIds: ["b-rj", "b-sp", "b-bh"],
      })
    ).resolves.toBe(s);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("user sem vínculo (fail-closed) → rejeita para qualquer branch", async () => {
    // Fail-closed: getUserBranchScope retorna branchIds:[] + includeUnassigned:false.
    // Qualquer targetBranchIds → "Filial fora do seu escopo".
    const s = {
      user: { id: "bs-user-blind-1", status: "active", role: "user" },
    } as never;
    (requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
    mockOverrides([]);
    // Sem vínculo: DB retorna 0 rows.
    mockBranchRows([]);
    await expect(
      requireCapabilityWithContext("orders.update_status", {
        targetBranchIds: ["b-sp"],
      })
    ).rejects.toThrow("Filial fora do seu escopo: b-sp");
  });
});
```

O helper `mockBranchRows` deve ser inserido junto com os outros helpers existentes (após
`mockOverrides`, antes do primeiro `describe`). Conferir que `mockOverrides` já existe no
arquivo — ele é necessário para os casos de admin.

**Nota sobre ordem de `db.select`**: `getUserCapabilities` (que resolve overrides) é chamado
ANTES de `assertBranchScope` dentro de `requireCapabilityWithContext`. Para role `admin`,
`mockReturnValueOnce` precisa ser chamado na ordem: overrides primeiro, branches depois.
Para `super_admin`, `getUserCapabilities` tem early-return (sem DB) — branches seriam o
único call, mas `assertBranchScope` também tem early-return para super_admin — portanto
`db.select` não é chamado, e o teste deve afirmar `expect(db.select).not.toHaveBeenCalled()`.

**Verify**:
```
bun --cwd apps/web test --reporter=verbose permissions
```
Esperado: todos os testes do arquivo verdes, incluindo os 4 novos casos de branch-scoping.

---

### Step 3: Adicionar testes de `getUserBranchScope` em `branch-scope.test.ts`

Este arquivo hoje **não** mocka `@emach/db` — testa apenas funções puras. É necessário
adicionar mocks e um novo `describe` que testa o comportamento com DB.

Ler o arquivo atual antes de editar (`Read apps/web/__tests__/branch-scope.test.ts`).

Substituir o conteúdo do arquivo adicionando os mocks e o novo describe. O arquivo deve
ficar assim (preservar o conteúdo existente de `inScope` / `isBlindScope`, adicionar os
mocks e o novo describe depois):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@emach/db", () => ({
  db: { select: vi.fn() },
}));
vi.mock("@emach/db/schema/inventory", () => ({
  userBranch: { __table: "user_branch" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(),
}));

import { db } from "@emach/db";
import { type BranchScope, getUserBranchScope, inScope, isBlindScope } from "@/lib/branch-scope";

// Helper: mocka a query SELECT branchId FROM user_branch WHERE userId = ?
function mockBranchRows(branchIds: string[]) {
  const where = vi.fn(() =>
    Promise.resolve(branchIds.map((branchId) => ({ branchId })))
  );
  const from = vi.fn(() => ({ where }));
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}

// --- testes das funções puras (preservados) ---

const all: BranchScope = { kind: "all" };
const sp: BranchScope = {
  kind: "scoped",
  branchIds: ["b-sp"],
  includeUnassigned: true,
};
const userSp: BranchScope = {
  kind: "scoped",
  branchIds: ["b-sp"],
  includeUnassigned: false,
};
const blind: BranchScope = {
  kind: "scoped",
  branchIds: [],
  includeUnassigned: false,
};

describe("inScope", () => {
  it("all → sempre true", () => expect(inScope(all, "qualquer")).toBe(true));
  it("scoped → só filiais da lista", () => {
    expect(inScope(sp, "b-sp")).toBe(true);
    expect(inScope(sp, "b-rj")).toBe(false);
  });
});

describe("isBlindScope", () => {
  it("user sem filial → cego", () => expect(isBlindScope(blind)).toBe(true));
  it("admin sem filial mas com triagem → não cego", () =>
    expect(
      isBlindScope({ kind: "scoped", branchIds: [], includeUnassigned: true })
    ).toBe(false));
  it("all → nunca cego", () => expect(isBlindScope(all)).toBe(false));
  it("user com filial → não cego", () =>
    expect(isBlindScope(userSp)).toBe(false));
});

// --- testes de getUserBranchScope (com DB mockado) ---

describe("getUserBranchScope — mapeamento role → escopo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("super_admin → {kind:'all'} sem consultar o banco", async () => {
    const s = {
      user: { id: "gs-sa-1", role: "super_admin", status: "active" },
    } as never;
    const scope = await getUserBranchScope(s);
    expect(scope.kind).toBe("all");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("admin com filiais → scoped + includeUnassigned:true", async () => {
    const s = {
      user: { id: "gs-admin-1", role: "admin", status: "active" },
    } as never;
    mockBranchRows(["b-sp", "b-rj"]);
    const scope = await getUserBranchScope(s);
    expect(scope.kind).toBe("scoped");
    if (scope.kind === "scoped") {
      expect(scope.branchIds).toEqual(["b-sp", "b-rj"]);
      expect(scope.includeUnassigned).toBe(true);
    }
  });

  it("user com filial → scoped + includeUnassigned:false", async () => {
    const s = {
      user: { id: "gs-user-1", role: "user", status: "active" },
    } as never;
    mockBranchRows(["b-sp"]);
    const scope = await getUserBranchScope(s);
    expect(scope.kind).toBe("scoped");
    if (scope.kind === "scoped") {
      expect(scope.branchIds).toEqual(["b-sp"]);
      expect(scope.includeUnassigned).toBe(false);
    }
  });

  it("user sem vínculo (fail-closed) → scoped com branchIds:[] + includeUnassigned:false", async () => {
    const s = {
      user: { id: "gs-user-blind-1", role: "user", status: "active" },
    } as never;
    mockBranchRows([]);
    const scope = await getUserBranchScope(s);
    expect(scope.kind).toBe("scoped");
    if (scope.kind === "scoped") {
      expect(scope.branchIds).toEqual([]);
      expect(scope.includeUnassigned).toBe(false);
    }
  });
});
```

**Nota importante**: `getUserBranchScope` usa `React.cache`. Cada sessão com `id` único
garante cache miss. Os IDs `gs-sa-1`, `gs-admin-1`, `gs-user-1`, `gs-user-blind-1` são
únicos entre si e distintos dos IDs usados em `permissions.test.ts`.

**Nota sobre `drizzle-orm` mock**: o mock inclui `eq: vi.fn()` (usado no `.where(eq(...))` em
`branch-scope.ts` L4) e `sql: vi.fn()` (`sql` é importado em L4 e usado nas funções de
condição SQL do módulo — sem o mock o import quebraria). O `cache` é importado de `"react"`,
não de `"drizzle-orm"` — não mockar `react` (o vitest resolve normalmente).

**Verify**:
```
bun --cwd apps/web test --reporter=verbose branch-scope
```
Esperado: todos os testes do arquivo verdes, incluindo os 4 novos casos de `getUserBranchScope`.

---

### Step 4: Typecheck e lint

```
bun check-types
bun check
```

**Verify**: ambos saem com exit 0, sem erros novos.

Se `bun check` reportar erros de lint nos testes novos (ex: `noExplicitAny`, `useAwait`,
`noNestedTernary`), corrija antes de continuar. Os erros mais prováveis:
- `as never` para sessions: padrão existente no suite (L86 de `permissions.test.ts`) — permitido.
- `as ReturnType<typeof vi.fn>`: padrão existente (L98 de `permissions.test.ts`) — permitido.

---

### Step 5: Suite completo e done-criteria grep

```
bun --cwd apps/web test
bun guard:forms
grep -n "assertBranchScope\|targetBranchIds" apps/web/__tests__/permissions.test.ts
grep -n "getUserBranchScope\|includeUnassigned" apps/web/__tests__/branch-scope.test.ts
```

**Verify**:
- `bun --cwd apps/web test`: exit 0, todos os testes verdes, contagem ≥ baseline + 8 novos testes.
- `bun guard:forms`: exit 0.
- Primeiro `grep`: ≥4 linhas com `targetBranchIds` (uma por caso novo em `permissions.test.ts`).
- Segundo `grep`: ≥4 linhas com `getUserBranchScope` ou `includeUnassigned` em `branch-scope.test.ts`.

---

### Step 6: Commit

```
git add apps/web/__tests__/permissions.test.ts apps/web/__tests__/branch-scope.test.ts
git commit -m "test(permissions): cobrir assertBranchScope/targetBranchIds"
```

Se os dois arquivos tiverem alterações distintas logicamente (o que é o caso), dois commits
são aceitáveis:
```
git add apps/web/__tests__/permissions.test.ts
git commit -m "test(permissions): cobrir assertBranchScope/targetBranchIds"

git add apps/web/__tests__/branch-scope.test.ts
git commit -m "test(branch-scope): cobrir getUserBranchScope com DB mockado"
```

**Verify**: `git log --oneline -3` mostra os commits novos com subjects ≤50 chars.

## Test plan

### Novos testes em `apps/web/__tests__/permissions.test.ts`

Novo `describe("requireCapabilityWithContext — branch-scoping (assertBranchScope)", ...)` com 4 casos:

1. **admin fora do escopo → throw**: ator admin com `branchIds:["b-sp"]`, `targetBranchIds:["b-rj"]` → rejeita com `"Filial fora do seu escopo: b-rj"`.
2. **admin dentro do escopo → resolve**: mesmo ator, `targetBranchIds:["b-sp"]` → resolve com a session.
3. **super_admin → resolve sem DB**: `targetBranchIds:["b-rj","b-sp","b-bh"]` → resolve; `db.select` não chamado.
4. **fail-closed: user sem vínculo → throw**: `branchIds:[]`, `targetBranchIds:["b-sp"]` → rejeita com `"Filial fora do seu escopo: b-sp"`.

Estrutural: modelar após os guards existentes no mesmo arquivo (L113-L270 de `permissions.test.ts`).

### Novos testes em `apps/web/__tests__/branch-scope.test.ts`

Novo `describe("getUserBranchScope — mapeamento role → escopo", ...)` com 4 casos:

1. **super_admin → `{kind:"all"}` sem DB**: `db.select` não chamado.
2. **admin → scoped + `includeUnassigned:true`**: rows `["b-sp","b-rj"]` → `branchIds:["b-sp","b-rj"]`, `includeUnassigned:true`.
3. **user → scoped + `includeUnassigned:false`**: rows `["b-sp"]` → `includeUnassigned:false`.
4. **user sem vínculo → scoped cego**: rows `[]` → `branchIds:[]`, `includeUnassigned:false`.

Estrutural: adicionar `vi.mock("@emach/db", ...)` + helper `mockBranchRows` ao arquivo existente.

**Comando de verificação**: `bun --cwd apps/web test --reporter=verbose` → todos verdes.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0 (lint ultracite/biome)
- [ ] `bun --cwd apps/web test` exits 0; contagem de testes ≥ baseline + 8
- [ ] `grep -c "targetBranchIds" apps/web/__tests__/permissions.test.ts` retorna ≥4
- [ ] `grep -c "getUserBranchScope" apps/web/__tests__/branch-scope.test.ts` retorna ≥1
- [ ] `grep -c "includeUnassigned" apps/web/__tests__/branch-scope.test.ts` retorna ≥2
- [ ] `bun guard:forms` exits 0
- [ ] `git status` mostra apenas `apps/web/__tests__/permissions.test.ts` e `apps/web/__tests__/branch-scope.test.ts` modificados (+ nenhum outro arquivo)

## STOP conditions

Stop e reportar (não improvisar) se:

- O código em `permissions.ts` L218-L232 ou L260-L263 não corresponder aos trechos em "Current state" (codebase sofreu drift).
- A string exata do erro em `assertBranchScope` difere de `"Filial fora do seu escopo: ${targetId}"` — ajuste o teste para a string real encontrada no código (NÃO altere `permissions.ts`).
- `getUserBranchScope` em `branch-scope.ts` L12-L28 não usa `db.select().from().where()` — o helper `mockBranchRows` precisaria de chain diferente.
- O suite falha com `Cannot mock module "@emach/db"` ou similar — inspecionar `vitest.config.ts` e o pattern de mocks existentes antes de improvisar.
- Qualquer step de verificação falhar duas vezes após tentativa razoável de correção.
- A correção exige tocar arquivo fora do escopo (ex: `permissions.ts`, `branch-scope.ts`, `vitest.config.ts`).
- `bun check` reporta erro novo em arquivo fora do escopo que o plano causou indiretamente.

## Maintenance notes

- **Alta-churn esperada**: ADR-0016 foi ligado em 2026-06-15. Novos guards ou alterações em `assertBranchScope` (ex: suporte a multi-branch) devem ser acompanhados de testes correspondentes neste suite.
- **React.cache e IDs únicos**: `getUserBranchScope` usa `React.cache` keyed por identidade da sessão. Em ambiente de testes vitest, `beforeEach` + `vi.clearAllMocks()` reseta os mocks de `db.select`, mas o cache do React pode persistir entre testes se o mesmo objeto de sessão for reutilizado. Sempre criar objetos de sessão novos com IDs distintos entre cases — padrão já adotado em `permissions.test.ts` (L291-L327).
- **Dois arquivos, dois describes separados**: a cobertura de `assertBranchScope` (via `requireCapabilityWithContext`) em `permissions.test.ts` testa a integração (orquestração + ordem de DB calls); a cobertura de `getUserBranchScope` em `branch-scope.test.ts` testa a unidade (mapeamento role→scope). São complementares — não consolidar em um único arquivo.
- **plans/012 e 013**: este plano (014) não tem dependências, mas habilita 012/013 com segurança ao garantir que o mecanismo de branch-scoping está coberto antes de qualquer refatoração que toque esses paths.
