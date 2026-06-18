# Plan 016: Consolidar actionErrorMessage e corrigir vazamento de SQL no variant de categorias

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 79379ef5..HEAD -- \
>   apps/web/src/lib/action-error.ts \
>   apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts \
>   apps/web/src/app/dashboard/stock/actions.ts \
>   apps/web/src/app/dashboard/suppliers/actions.ts \
>   apps/web/src/app/dashboard/tools/actions.ts \
>   apps/web/src/app/dashboard/site/banners/actions.ts
> ```
> If any of these files changed since commit `79379ef5`, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`errorMessage` is copy-pasted in 5 action files with diverging implementations.
The variant in `categories/_lib/attribute-actions.ts` (lines 19–24) skips
`getPgError` and returns `error.message` directly — for a Drizzle error, that
message is `"Failed query: <full SQL with params>"`, which leaks raw SQL to the
user's toast. This is classified P0 in `apps/web/CLAUDE.md` ("Never detect by
`e.message.includes(…)` — leaks raw SQL"). Centralising into a single
`actionErrorMessage` in `src/lib/action-error.ts` fixes the leak and makes
future callers consistent by default.

## Current state

### Files and their roles

- `apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts` —
  CRUD actions for category attributes. Contains the **buggy** `errorMessage`
  (no `getPgError` call, leaks Drizzle SQL to toast).
- `apps/web/src/app/dashboard/stock/actions.ts` — stock CRUD; contains the
  **canonical** `errorMessage` variant (uses `getPgError` correctly).
- `apps/web/src/app/dashboard/suppliers/actions.ts` — supplier CRUD; has a
  correct copy.
- `apps/web/src/app/dashboard/tools/actions.ts` — tool CRUD; has a correct
  copy.
- `apps/web/src/app/dashboard/site/banners/actions.ts` — banner CRUD; has a
  correct copy.
- `apps/web/src/lib/db-error.ts` — exports `getPgError(error): PgError | null`.
  Do NOT change this file.
- `apps/web/src/lib/action-result.ts` — exports `ActionResult<T>`. Do NOT
  change this file.

### Buggy variant (the SQL-leak site)

`apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts:19-24`:
```ts
function errorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return "Erro inesperado";
}
```
No `getPgError` call. When Drizzle throws, `error.message` is
`"Failed query: delete from \"attribute_definition\" where …"` — full SQL,
shown in the toast.

### Canonical variant (target shape)

`apps/web/src/app/dashboard/stock/actions.ts:53-63`:
```ts
function errorMessage(error: unknown): string {
    // Erro do Postgres (drizzle embrulha em .cause): nunca vazar SQL+params no toast.
    if (getPgError(error)) {
        return "Não foi possível concluir a operação. Tente novamente.";
    }
    // Erros de domínio (ex: "Estoque não pode ficar negativo") são seguros de exibir.
    if (error instanceof Error) {
        return error.message;
    }
    return "Erro desconhecido";
}
```

Note: `suppliers/actions.ts:49-58` and `tools/actions.ts:46-55` differ only in
the fallback string (`"Erro inesperado"` vs `"Erro desconhecido"`). The
canonical form from `stock/actions.ts` uses `"Erro desconhecido"` — use that.
`site/banners/actions.ts:20-28` also uses `"Erro inesperado"`.
All four are functionally correct (all call `getPgError`); the difference is
cosmetic. The new shared function will use `"Erro desconhecido"` (matching
the largest-context action file, stock).

### What `categories/actions.ts` already does (out of scope)

`apps/web/src/app/dashboard/categories/actions.ts` uses `mapWriteError` (not
`errorMessage`) — a domain-specific mapper that handles `P0001` (cycle trigger)
and `23505` (slug dupe) with targeted messages. Do NOT touch this file or
replace `mapWriteError`.

### Repo conventions

- New lib utilities go in `apps/web/src/lib/`.
- Error handling pattern: `getPgError` from `@/lib/db-error` → generic
  friendly message; `instanceof Error` → domain message; fallback string.
  See `apps/web/src/lib/db-error.ts` and its usage in
  `apps/web/src/app/dashboard/stock/actions.ts:53-63`.
- Tests: `vitest`, `environment: node`. New test file at
  `apps/web/src/lib/action-error.test.ts`. No `vi.mock` needed — `getPgError`
  is a pure function (no DB). Model test structure after
  `apps/web/src/lib/db-error.test.ts`.
- TypeScript aliases: `@/` → `apps/web/src/` (configured in
  `apps/web/vitest.config.ts` and `tsconfig.json`).
- Anti-patterns banned: `: any`, `as any`, `@ts-ignore`, `console.*`.

## Commands you will need

| Purpose       | Command                                                     | Expected on success            |
|---------------|-------------------------------------------------------------|--------------------------------|
| Typecheck     | `bun check-types`                                           | exit 0, no errors              |
| Lint          | `bun check`                                                 | exit 0                         |
| Tests         | `bun --cwd apps/web test`                                   | all pass, including new tests  |
| Guard forms   | `bun guard:forms`                                           | exit 0                         |
| Build         | `bun run --cwd apps/web build`                              | exit 0                         |
| Verify dedup  | `grep -rn "function errorMessage" apps/web/src/`            | no matches                     |

## Scope

**In scope** (the only files you should create or modify):
- `apps/web/src/lib/action-error.ts` — create (new shared helper)
- `apps/web/src/lib/action-error.test.ts` — create (unit tests)
- `apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts` — replace local `errorMessage`
- `apps/web/src/app/dashboard/stock/actions.ts` — replace local `errorMessage`
- `apps/web/src/app/dashboard/suppliers/actions.ts` — replace local `errorMessage`
- `apps/web/src/app/dashboard/tools/actions.ts` — replace local `errorMessage`
- `apps/web/src/app/dashboard/site/banners/actions.ts` — replace local `errorMessage`

**Out of scope** (do NOT touch, even though they look related):
- `apps/web/src/lib/db-error.ts` — `getPgError` is correct and stable; this plan builds on top of it.
- `apps/web/src/app/dashboard/categories/actions.ts` — uses `mapWriteError` with intentional SQLSTATE-specific messages; consolidating it would lose that domain knowledge.
- Any other action file not listed above.
- Any change to error message strings used in tests outside this plan's scope.

## Git workflow

- Branch: `advisor/016-consolidate-action-error-message`
- Commit per logical step; message style follows Conventional Commits in PT,
  subject ≤50 chars. Example from repo: `feat(lib): extrair actionErrorMessage compartilhado`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `src/lib/action-error.ts`

Create the file `apps/web/src/lib/action-error.ts` with the following exact
content (read the file first to confirm it does not exist — `Read` on the path
will return an error; that is expected and is the confirmation to proceed):

```ts
import { getPgError } from "@/lib/db-error";

/**
 * Converte qualquer erro capturado em `catch` numa string segura para o toast
 * do usuário.
 *
 * - Erro do Postgres (drizzle embrulha em `.cause`): nunca vazar SQL+params.
 * - Erro de domínio (`instanceof Error`): a mensagem é controlada, segura.
 * - Qualquer outro valor: fallback genérico.
 */
export function actionErrorMessage(error: unknown): string {
	if (getPgError(error)) {
		return "Não foi possível concluir a operação. Tente novamente.";
	}
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro desconhecido";
}
```

**Verify**: `bun check-types` → exit 0

### Step 2: Write unit tests for `actionErrorMessage`

Create `apps/web/src/lib/action-error.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { actionErrorMessage } from "./action-error";

describe("actionErrorMessage", () => {
    it("retorna mensagem genérica para erro Postgres (drizzle wrapper)", () => {
        // Drizzle 0.45.x: DrizzleQueryError com DatabaseError em .cause
        const drizzleError = {
            name: "DrizzleQueryError",
            message: 'Failed query: delete from "attribute_definition" where "id" = $1',
            cause: {
                name: "DatabaseError",
                code: "23503",
                message: 'violates foreign key constraint "fk_example"',
                constraint: "fk_example",
            },
        };
        const msg = actionErrorMessage(drizzleError);
        expect(msg).toBe("Não foi possível concluir a operação. Tente novamente.");
        // Garante que SQL não vaza
        expect(msg).not.toContain("attribute_definition");
        expect(msg).not.toContain("Failed query");
    });

    it("não vaza SQL quando o erro Postgres está no topo (sem wrapper)", () => {
        const pgError = { code: "23505", message: "duplicate key value violates unique constraint" };
        expect(actionErrorMessage(pgError)).toBe(
            "Não foi possível concluir a operação. Tente novamente."
        );
    });

    it("devolve error.message para erros de domínio comuns (instanceof Error)", () => {
        expect(actionErrorMessage(new Error("Estoque não pode ficar negativo"))).toBe(
            "Estoque não pode ficar negativo"
        );
    });

    it("devolve fallback para valores não-Error", () => {
        expect(actionErrorMessage("string solta")).toBe("Erro desconhecido");
        expect(actionErrorMessage(null)).toBe("Erro desconhecido");
        expect(actionErrorMessage(undefined)).toBe("Erro desconhecido");
        expect(actionErrorMessage(42)).toBe("Erro desconhecido");
    });
});
```

**Verify**: `bun --cwd apps/web test -- action-error` → 4 tests pass

### Step 3: Replace `errorMessage` in `attribute-actions.ts` (the SQL-leak file)

In `apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts`:

1. Read the file to confirm the current state matches the "Current state"
   excerpt (lines 19–24, no `getPgError` call).
2. Add the import for `actionErrorMessage`. Insert after the existing imports
   block (after line 17, the last import line `} from "./attribute-schema";`):
   ```ts
   import { actionErrorMessage } from "@/lib/action-error";
   ```
3. Delete the local `function errorMessage` definition (lines 19–24).
4. Replace every call to `errorMessage(` in this file with `actionErrorMessage(`.

The file uses `errorMessage` in:
- `return { ok: false, error: errorMessage(parsed.error) };` (Zod error — safe,
  Zod errors are `instanceof Error` with `message`, not Drizzle errors)
- `return { ok: false, error: errorMessage(error) };` in each `catch` block

All five patterns are safe to replace with `actionErrorMessage`.
There are **5 call sites**: lines 46, 54 (in `createCategoryAttribute`), 75, 83
(in `updateCategoryAttribute`), and 105 (in `deleteCategoryAttribute`).

**Verify**:
```
grep -n "function errorMessage\|import.*errorMessage" \
  apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts
```
Expected: one line matching `import.*actionErrorMessage` from `@/lib/action-error`, zero lines matching `function errorMessage`.

Then: `bun check-types` → exit 0

### Step 4: Replace `errorMessage` in `stock/actions.ts`

In `apps/web/src/app/dashboard/stock/actions.ts`:

1. Read the file to confirm `function errorMessage` exists at lines 53–63.
2. Add import (after the existing `getPgError` import line at line 15):
   ```ts
   import { actionErrorMessage } from "@/lib/action-error";
   ```
3. Delete the local `function errorMessage` definition (lines 53–63).
4. **Remove the now-unused `getPgError` import** (line 15: `import { getPgError }
   from "@/lib/db-error"`). After `errorMessage` is removed, `getPgError` is no
   longer called directly in this file — leaving it causes a lint failure
   (`bun check` treats unused imports as errors).
5. Replace all `errorMessage(` call sites with `actionErrorMessage(`.
   There are **4 call sites** in this file (in `recordStockEntry`, `recordStockWriteOff`,
   `adjustStock`, `updateStockThresholds` — each `catch` block returns
   `{ ok: false, error: errorMessage(error) }`).

**Verify**:
```
grep -n "function errorMessage\|import.*actionErrorMessage" \
  apps/web/src/app/dashboard/stock/actions.ts
```
Expected: one import line, zero `function errorMessage` lines.

Then: `bun check-types` → exit 0

### Step 5: Replace `errorMessage` in `suppliers/actions.ts`

In `apps/web/src/app/dashboard/suppliers/actions.ts`:

1. Read the file to confirm `function errorMessage` exists at lines 49–58.
2. Add import (after the `getPgError` import — already present at line 12):
   ```ts
   import { actionErrorMessage } from "@/lib/action-error";
   ```
3. Delete the local `function errorMessage` definition (lines 49–58).
4. **Remove the now-unused `getPgError` import** (line 12: `import { getPgError }
   from "@/lib/db-error"`). After `errorMessage` is removed, `getPgError` is no
   longer called directly in this file — leaving it causes a lint failure.
5. Replace all `errorMessage(` call sites with `actionErrorMessage(`.
   There are **5 call sites**: 2 in `createSupplier` (parsed.error + catch),
   2 in `updateSupplier` (parsed.error + catch), and 1 in `setSupplierStatus`
   (catch block only).

**Verify**:
```
grep -n "function errorMessage\|import.*actionErrorMessage" \
  apps/web/src/app/dashboard/suppliers/actions.ts
```
Expected: one import line, zero `function errorMessage` lines.

Then: `bun check-types` → exit 0

### Step 6: Replace `errorMessage` in `tools/actions.ts`

In `apps/web/src/app/dashboard/tools/actions.ts`:

1. Read the file to confirm `function errorMessage` exists at lines 46–55.
2. Add import (after the `getPgError` import — already present at line 21):
   ```ts
   import { actionErrorMessage } from "@/lib/action-error";
   ```
3. Delete the local `function errorMessage` definition (lines 46–55).
4. **Do NOT remove the `getPgError` import** — it is still used directly in
   `updateToolVariant` at line 906 (`getPgError(error)?.code === "23505"`).
5. Replace all `errorMessage(` call sites with `actionErrorMessage(`.
   There are **5 call sites**: 2 in `createTool` (parsed.error at line 229 +
   catch at line 318), 2 in `updateTool` (parsed.error at line 339 + catch at
   line 526), and 1 in `deleteTool` (catch at line 588).
   Note: `updateToolVariant`, `setDefaultToolVariant`, `setVariantVisibility`,
   and `deleteToolVariant` use `logger.error` + direct string returns — they
   do NOT call `errorMessage`. Leave those unchanged.

**Verify**:
```
grep -n "function errorMessage\|import.*actionErrorMessage" \
  apps/web/src/app/dashboard/tools/actions.ts
```
Expected: one import line, zero `function errorMessage` lines.

Then: `bun check-types` → exit 0

### Step 7: Replace `errorMessage` in `site/banners/actions.ts`

In `apps/web/src/app/dashboard/site/banners/actions.ts`:

1. Read the file to confirm `function errorMessage` exists at lines 20–28.
2. Add import (after the `getPgError` import — already present at line 9):
   ```ts
   import { actionErrorMessage } from "@/lib/action-error";
   ```
3. Delete the local `function errorMessage` definition (lines 20–28).
4. **Remove the now-unused `getPgError` import** (line 9: `import { getPgError }
   from "@/lib/db-error"`). After `errorMessage` is removed, `getPgError` is no
   longer called directly in this file — leaving it causes a lint failure.
5. Replace all `errorMessage(` call sites with `actionErrorMessage(`.
   There are **5 call sites**: in `createBanner` (line 110), `updateBanner`
   (line 166), `toggleBannerActive` (line 194), `reorderBanners` (line 216),
   and `deleteBanner` (line 253).

**Verify**:
```
grep -n "function errorMessage\|import.*actionErrorMessage" \
  apps/web/src/app/dashboard/site/banners/actions.ts
```
Expected: one import line, zero `function errorMessage` lines.

Then: `bun check-types` → exit 0

### Step 8: Final verification sweep

Run each command and confirm the expected result before moving to the next:

```bash
# 1. No local errorMessage definitions remain in any of the 5 files
grep -rn "function errorMessage" apps/web/src/
# Expected: no output (zero matches)

# 2. Full typecheck
bun check-types
# Expected: exit 0

# 3. Lint
bun check
# Expected: exit 0

# 4. Form guard (unchanged, but confirm no regression)
bun guard:forms
# Expected: exit 0

# 5. All tests pass including new ones
bun --cwd apps/web test
# Expected: all pass; 4 new tests from action-error.test.ts appear in output
```

### Step 9: Commit

```bash
git add \
  apps/web/src/lib/action-error.ts \
  apps/web/src/lib/action-error.test.ts \
  apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts \
  apps/web/src/app/dashboard/stock/actions.ts \
  apps/web/src/app/dashboard/suppliers/actions.ts \
  apps/web/src/app/dashboard/tools/actions.ts \
  apps/web/src/app/dashboard/site/banners/actions.ts

git commit -m "refactor(actions): extrair actionErrorMessage compartilhado"
```

## Test plan

**New file**: `apps/web/src/lib/action-error.test.ts`

Cases to cover (all in the single `describe` block):

1. **Postgres error via Drizzle wrapper** — `DrizzleQueryError` with
   `cause.code = "23503"` → returns generic message; message must NOT contain
   the SQL string (`"Failed query:"`, table names).
2. **Postgres error at top level** (no wrapper) — `{ code: "23505", message: "…" }`
   → returns generic message.
3. **Domain error (instanceof Error)** — `new Error("Estoque não pode ficar negativo")`
   → returns `error.message` verbatim.
4. **Non-Error fallback** — `null`, `undefined`, string literal, number → each
   returns `"Erro desconhecido"`.

Model structure after `apps/web/src/lib/db-error.test.ts` (plain `describe`/`it`
blocks, no mocks needed — `getPgError` is a pure function imported transitively).

**Run**: `bun --cwd apps/web test -- action-error` → 4 tests pass

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "function errorMessage" apps/web/src/` returns no matches
- [ ] `apps/web/src/lib/action-error.ts` exists and exports `actionErrorMessage`
- [ ] `apps/web/src/lib/action-error.test.ts` exists with ≥4 tests
- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun guard:forms` exits 0
- [ ] `bun --cwd apps/web test` exits 0 with the 4 new tests passing
- [ ] `git status` shows only the 7 in-scope files modified/created
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The `errorMessage` function in any of the 5 files does not match the
  "Current state" excerpt (e.g., it has domain-specific SQLSTATE mappings
  beyond the generic `getPgError` check). In that case, do NOT replace it
  blindly — report the divergence and await instructions.
- The `errorMessage` function body in `categories/_lib/attribute-actions.ts`
  already calls `getPgError` (meaning the bug was fixed independently).
  In that case, only the deduplication work remains — still proceed with the
  plan but note it in your report.
- `bun check-types` fails after any step with an error in a file NOT in the
  in-scope list.
- `bun --cwd apps/web test` regresses (test count drops or previously-passing
  test starts failing) after any replacement step.
- Any in-scope file does not exist at the expected path (may indicate a
  directory restructure since this plan was written).

## Maintenance notes

- **Future action files**: import `actionErrorMessage` from `@/lib/action-error`
  instead of defining a local copy. The function signature is intentionally
  minimal — it only handles the generic fallback. Domain-specific SQLSTATE
  mappings (like `mapWriteError` in `categories/actions.ts`) should remain
  local to their file, built on top of `getPgError` directly.
- **If `getPgError` behaviour changes**: `actionErrorMessage` will inherit the
  change automatically. The existing test in `db-error.test.ts` covers the
  Drizzle wrapper format; `action-error.test.ts` covers the end-to-end toast
  message contract.
- **Reviewer focus**: confirm that no call site that previously used a
  domain-specific message was accidentally homogenised to the generic one.
  The only change in observable behaviour is `attribute-actions.ts` — it was
  leaking SQL; it will now return `"Não foi possível concluir a operação.
  Tente novamente."` for Drizzle errors, which is correct.
