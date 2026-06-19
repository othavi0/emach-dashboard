# Plan 043: Add `import "server-only"` to data.ts files missing the guard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 03984800..HEAD -- \
>   apps/web/src/app/dashboard/orders/data.ts \
>   apps/web/src/app/dashboard/customers/data.ts \
>   apps/web/src/app/dashboard/reviews/data.ts \
>   apps/web/src/app/dashboard/pending-data.ts \
>   apps/web/src/app/dashboard/orders/pending-data.ts \
>   apps/web/src/app/dashboard/customers/pending-data.ts
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

ADR-0019 mandates that every `data.ts` (or `*-data.ts`) file that imports
`@emach/db` begin with `import "server-only"` so that Next.js's bundler
boundary can prevent the Postgres driver from being dragged into the browser
bundle. Six of the eight dashboard data files are currently missing this guard.
Without it, a future engineer importing a query function (not `import type`)
from one of these modules inside a Client Component will only discover the
mistake at build time (`Module not found: Can't resolve 'net'`); `check-types`,
`bun check`, and vitest are all silent on this class of error. Adding the one
missing import line to each file closes the gap with zero logic changes.

## Current state

### Files missing `import "server-only"` (verified against HEAD `03984800`)

Each file currently opens with an `import { db } from "@emach/db"` at line 1
(no `server-only` guard before it):

| File | Role | LOC (approx) |
|------|------|-------------|
| `apps/web/src/app/dashboard/orders/data.ts` | Order-list queries, KPIs, keyset pagination | 1054 |
| `apps/web/src/app/dashboard/customers/data.ts` | Customer-list queries, KPIs, keyset pagination | 758 |
| `apps/web/src/app/dashboard/reviews/data.ts` | Review-list queries, keyset pagination | ~220 |
| `apps/web/src/app/dashboard/pending-data.ts` | Root dashboard pending/activity counts | ~430 |
| `apps/web/src/app/dashboard/orders/pending-data.ts` | Orders pending panel, activity feed | ~170 |
| `apps/web/src/app/dashboard/customers/pending-data.ts` | Customers pending panel, activity feed | ~170 |

Exact line 1 of each file today (all identical pattern):

```
// orders/data.ts:1
import { db } from "@emach/db";

// customers/data.ts:1
import { db } from "@emach/db";

// reviews/data.ts:1
import { db } from "@emach/db";

// pending-data.ts:1
import { db } from "@emach/db";

// orders/pending-data.ts:1
import { db } from "@emach/db";

// customers/pending-data.ts:1
import { db } from "@emach/db";
```

### What "compliant" looks like (the exemplar)

`apps/web/src/app/dashboard/tools/data.ts` (compliant) opens with:

```ts
import "server-only";

import { db } from "@emach/db";
```

Match this pattern exactly: blank line after the `import "server-only";`, then
the rest of the imports unchanged.

### Existing guard-compliant data files (do NOT touch)

- `apps/web/src/app/dashboard/tools/data.ts` — already has guard (exemplar)
- `apps/web/src/app/dashboard/promotions/data.ts` — already has guard
- `apps/web/src/app/dashboard/users/data.ts` — already has guard (if present; verify with grep)
- `apps/web/src/app/dashboard/suppliers/data.ts` — already has guard
- `apps/web/src/app/dashboard/branches/data.ts` — already has guard

### `app-sidebar.tsx` — safe, no action required

`apps/web/src/app/dashboard/_components/app-sidebar.tsx` is a `"use client"`
component that uses `import type` from `pending-data.ts`. `import type` is
erased at compile time and does not trigger the `server-only` boundary
restriction. No change needed there.

### ADR reference

ADR-0019 (3-layer pattern): layer 1 = `data.ts` — `import "server-only"` at
line 1; reads + types + query builders; NOT an endpoint (guarded by its
caller). Canonical docs: `docs/superpowers/specs/2026-06-18-028-split-god-modules-design.md`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Type-check | `bun check-types` | exit 0, no errors |
| Lint | `bun check` | exit 0, no lint errors |
| Tests | `bun --cwd apps/web test` | all pass (481+ tests) |
| Build (mandatory) | `bun run --cwd apps/web build` | exit 0 |
| Verify guard present | `grep -n "server-only" apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/customers/data.ts apps/web/src/app/dashboard/reviews/data.ts apps/web/src/app/dashboard/pending-data.ts apps/web/src/app/dashboard/orders/pending-data.ts apps/web/src/app/dashboard/customers/pending-data.ts` | 6 lines, each showing `import "server-only";` at line 1 |
| Verify no regressions in other data files | `grep -rn "server-only" apps/web/src/app/dashboard/` | should show ≥ 11 matches (5 already compliant + 6 new) |

## Scope

**In scope** (the ONLY files to modify — no logic changes, no imports added or
removed, only prepend one line + blank line at top):

1. `apps/web/src/app/dashboard/orders/data.ts`
2. `apps/web/src/app/dashboard/customers/data.ts`
3. `apps/web/src/app/dashboard/reviews/data.ts`
4. `apps/web/src/app/dashboard/pending-data.ts`
5. `apps/web/src/app/dashboard/orders/pending-data.ts`
6. `apps/web/src/app/dashboard/customers/pending-data.ts`

**Out of scope** (do NOT touch, even if they appear related):

- `apps/web/src/app/dashboard/stock/branch-stock-data.ts` — owned by plan 042.
- `apps/web/src/app/dashboard/_components/app-sidebar.tsx` — uses `import type`
  only; already safe; no guard needed in a `"use client"` component.
- Any compliant data file (`tools/`, `promotions/`, `users/`, `suppliers/`,
  `branches/`).
- `actions.ts` files — `"use server"` files are handled differently (not
  `server-only`).
- No new test files, no schema changes, no package.json changes.
- Do NOT split, refactor, or add/remove any imports beyond the one guard line.

## Git workflow

- Branch: `advisor/043-normalize-data-layer-server-only`
- One commit for all 6 file edits (they are a single atomic change):
  `feat(web): add import server-only em data files`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Drift check

Run the drift-check command from the executor header. If any of the 6 in-scope
files appears in the diff output, open that file and compare its first 5 lines
against the "Current state" excerpts above. If they differ materially, STOP.

**Verify**: `git diff --stat 03984800..HEAD -- apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/customers/data.ts apps/web/src/app/dashboard/reviews/data.ts apps/web/src/app/dashboard/pending-data.ts apps/web/src/app/dashboard/orders/pending-data.ts apps/web/src/app/dashboard/customers/pending-data.ts`
→ Ideally empty. If non-empty, read the changed file(s) and verify line 1 still
matches the excerpt in "Current state" before continuing.

### Step 1: Create the branch

```bash
git checkout -b advisor/043-normalize-data-layer-server-only
```

**Verify**: `git branch --show-current` → `advisor/043-normalize-data-layer-server-only`

### Step 2: Add `import "server-only"` to all 6 files

For each of the 6 files below, use the `Edit` tool (Read the file first, then
Edit). The change is identical for all: insert `import "server-only";\n\n` at
the very beginning of the file (before the existing line 1). The result must
match the exemplar pattern:

```ts
import "server-only";

import { db } from "@emach/db";
// ... rest of file unchanged ...
```

Files to edit (in order):

1. `apps/web/src/app/dashboard/orders/data.ts`
   - Current line 1: `import { db } from "@emach/db";`
   - Edit: prepend `import "server-only";\n\n`

2. `apps/web/src/app/dashboard/customers/data.ts`
   - Current line 1: `import { db } from "@emach/db";`
   - Edit: prepend `import "server-only";\n\n`

3. `apps/web/src/app/dashboard/reviews/data.ts`
   - Current line 1: `import { db } from "@emach/db";`
   - Edit: prepend `import "server-only";\n\n`

4. `apps/web/src/app/dashboard/pending-data.ts`
   - Current line 1: `import { db } from "@emach/db";`
   - Edit: prepend `import "server-only";\n\n`

5. `apps/web/src/app/dashboard/orders/pending-data.ts`
   - Current line 1: `import { db } from "@emach/db";`
   - Edit: prepend `import "server-only";\n\n`

6. `apps/web/src/app/dashboard/customers/pending-data.ts`
   - Current line 1: `import { db } from "@emach/db";`
   - Edit: prepend `import "server-only";\n\n`

> **Note:** The repo's PostToolUse hook runs `bun fix` (auto-format) after each
> Write/Edit and may reorder imports within an import block. If a subsequent
> Edit fails with `string not found`, re-Read the file before retrying — never
> edit from memory.

**Verify after all 6 edits**:
```bash
grep -n "server-only" \
  apps/web/src/app/dashboard/orders/data.ts \
  apps/web/src/app/dashboard/customers/data.ts \
  apps/web/src/app/dashboard/reviews/data.ts \
  apps/web/src/app/dashboard/pending-data.ts \
  apps/web/src/app/dashboard/orders/pending-data.ts \
  apps/web/src/app/dashboard/customers/pending-data.ts
```
→ Exactly 6 lines, each: `<filename>:1:import "server-only";`

### Step 3: Type-check

```bash
bun check-types
```

**Verify**: exits 0, no errors. A `server-only` import in a file that is
already only consumed in server contexts is a no-op at runtime; type-check
must pass unchanged.

### Step 4: Lint

```bash
bun check
```

**Verify**: exits 0. `server-only` is a side-effect-only import; Biome/Ultracite
may flag it as an "unused import" in some configurations. If it does, check
whether there is an existing lint-ignore pattern for this import in the compliant
exemplar (`tools/data.ts`) and apply the same annotation. Do NOT suppress the
error with `@ts-ignore` or `as any`.

### Step 5: Tests

```bash
bun --cwd apps/web test
```

**Verify**: exits 0, all tests pass. The `server-only` module is aliased to a
stub in `apps/web/vitest.config.ts` (`resolve.alias['server-only']`), so no
test will break from the new import.

### Step 6: Build (mandatory gate)

```bash
bun run --cwd apps/web build
```

**Verify**: exits 0. This is the only gate that catches `server-only` boundary
violations at the consumer side. A clean build confirms the 6 files remain
purely server-side consumed.

### Step 7: Commit

```bash
git add \
  apps/web/src/app/dashboard/orders/data.ts \
  apps/web/src/app/dashboard/customers/data.ts \
  apps/web/src/app/dashboard/reviews/data.ts \
  apps/web/src/app/dashboard/pending-data.ts \
  apps/web/src/app/dashboard/orders/pending-data.ts \
  apps/web/src/app/dashboard/customers/pending-data.ts

git commit -m "feat(web): add import server-only em data files"
```

**Verify**: `git show --stat HEAD` → shows 6 files changed, each +2 insertions
(the `import "server-only";` line + the blank line that follows).

## Test plan

No new test files needed. This plan makes only additive one-liner changes to
module headers; no logic changes, no new functions, no API surface change. The
existing test suite covers all affected modules indirectly.

Regression coverage:
- `bun --cwd apps/web test` (481+ tests) must pass unchanged — confirms the
  `server-only` alias stub in `vitest.config.ts` continues to resolve the
  new import at test time.
- `bun run --cwd apps/web build` must pass — confirms no consumer of the 6
  files is a Client Component performing a non-`type` import.

## Done criteria

Machine-checkable. ALL must hold before considering this plan complete:

- [ ] `grep -c "server-only" apps/web/src/app/dashboard/orders/data.ts` → `1`
- [ ] `grep -c "server-only" apps/web/src/app/dashboard/customers/data.ts` → `1`
- [ ] `grep -c "server-only" apps/web/src/app/dashboard/reviews/data.ts` → `1`
- [ ] `grep -c "server-only" apps/web/src/app/dashboard/pending-data.ts` → `1`
- [ ] `grep -c "server-only" apps/web/src/app/dashboard/orders/pending-data.ts` → `1`
- [ ] `grep -c "server-only" apps/web/src/app/dashboard/customers/pending-data.ts` → `1`
- [ ] `grep -n "server-only" apps/web/src/app/dashboard/orders/data.ts` shows match at **line 1**
- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` exits 0, all tests pass
- [ ] `bun run --cwd apps/web build` exits 0
- [ ] `git diff --name-only HEAD~1 HEAD` lists exactly the 6 in-scope files (no out-of-scope spill)
- [ ] `plans/README.md` status row for plan 043 updated to `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- After the drift check, any in-scope file's line 1 does not read
  `import { db } from "@emach/db";` — the file has changed since this plan
  was written and the edit target must be re-evaluated.
- `bun check` (Step 4) fails with an "unused import" or similar lint error on
  `import "server-only"` and the exemplar `tools/data.ts` does NOT have the
  same error (i.e., this is not a pre-existing pattern) — a lint rule may have
  changed and needs investigation.
- `bun run --cwd apps/web build` (Step 6) fails with
  `Module not found: Can't resolve 'net'` or similar — a consumer of one of the
  6 files is already importing a query function (not `import type`) in a Client
  Component. This would be a pre-existing latent bug surfaced by the guard and
  requires a separate fix beyond this plan's scope.
- The fix requires touching any file outside the 6 in-scope files.
- A step's verify command fails twice after a reasonable corrective attempt.
- `git diff --name-only HEAD~1 HEAD` after the commit shows any file not in
  the 6-file in-scope list.

## Maintenance notes

- **Future enforcement:** A lint rule or `ast-grep` rule that enforces
  `import "server-only"` as line 1 of every `data.ts` / `*-data.ts` file
  that imports `@emach/db` would prevent this class of omission from recurring.
  This is explicitly deferred out of this plan (pure no-logic-change scope).
  File a follow-up issue to add a `tooling/ast-grep/rules/require-server-only-in-data.yaml`
  rule if the team wants automated enforcement.
- **Plan 042** covers `stock/branch-stock-data.ts` — the same class of missing
  guard for the stock module. Plans 042 and 043 are independent and can be
  executed in parallel.
- **Reviewer:** Confirm `git show --stat HEAD` shows exactly 6 files and each
  diff is `+2` lines (the guard line + the blank line separator). Any larger
  diff is a scope violation.
- **`app-sidebar.tsx`** uses `import type` from `pending-data.ts`; this
  continues to be safe after the guard is added (type-only imports are erased
  before the bundler sees them and never trigger `server-only` checks).
