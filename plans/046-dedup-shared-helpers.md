# Plan 046: Consolidar 4 helpers duplicados em locais canônicos

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
>   apps/web/src/lib/action-error.ts \
>   apps/web/src/app/dashboard/orders/actions.ts \
>   apps/web/src/app/dashboard/orders/_components/attachment-actions.ts \
>   apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts \
>   apps/web/src/app/dashboard/tools/page.tsx \
>   apps/web/src/app/dashboard/tools/[id]/_components/activity-tab.tsx \
>   apps/web/src/app/dashboard/branches/data.ts \
>   apps/web/src/app/dashboard/tools/data.ts \
>   apps/web/src/lib/branch-scope.ts \
>   packages/db/src/utils.ts \
>   packages/db/src/queries/catalog.ts
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

Four helpers are copy-pasted across unrelated modules: `isCapabilityError`, a
local `fetchActiveBranches`, `buildStockBranchFilter`, and `coerceDates`. Each
copy can drift independently and will diverge when the original semantics
change (e.g., a new `"Forbidden:"` prefix variant, an extra date key, a
branch-scope edge case). Moving each to its canonical home eliminates the drift
surface and makes the correct version discoverable to future authors.

## Current state

### 1 · `isCapabilityError` — duplicated in two orders files

**File A** `apps/web/src/app/dashboard/orders/actions.ts` lines 108–111:
```ts
/** Capability guards throw `Error("Forbidden: ...")` — detect those here. */
function isCapabilityError(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith("Forbidden:");
}
```
Used 7× in the same file (lines 291, 341, 394, 454, 508, 564, 633).

**File B** `apps/web/src/app/dashboard/orders/_components/attachment-actions.ts` lines 40–43:
```ts
/** Capability guards throw `Error("Forbidden: ...")` — detect those here. */
function isCapabilityError(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith("Forbidden:");
}
```
Used 3× in the same file (lines 144, 200, 266).

**File C** `apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts` lines 21–26:
```ts
export function safeRequireRole(error: unknown): ActionResult<never> {
	if (error instanceof Error && error.message.startsWith("Forbidden:")) {
		return { ok: false, error: "Acesso negado" };
	}
	throw error;
}
```
Same guard inline (not extracted), returns `ActionResult<never>`.

**Canonical home** `apps/web/src/lib/action-error.ts` — currently exports only
`actionErrorMessage`. This is where `isCapabilityError` belongs: same lib,
same concern (safe error-to-message mapping in actions).

---

### 2 · `fetchActiveBranches` — duplicated in two tools files

**File A** `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab.tsx` lines 17–23:
```ts
function fetchActiveBranches() {
	return db
		.select({ id: branch.id, name: branch.name })
		.from(branch)
		.where(eq(branch.status, "active"))
		.orderBy(asc(branch.name));
}
```

**File B** `apps/web/src/app/dashboard/tools/page.tsx` lines 52–58:
```ts
async function fetchActiveBranches() {
	return db
		.select({ id: branch.id, name: branch.name })
		.from(branch)
		.where(eq(branch.status, "active"))
		.orderBy(asc(branch.name));
}
```

**Canonical home** `apps/web/src/app/dashboard/branches/data.ts` — already has
`import "server-only"` at line 1 and owns branch-reading functions
(`getBranchDetail`, `getBranchTeam`, etc.). Add `getActiveBranches()` there.
Both callers are Server Components behind route guards — no auth change needed.

---

### 3 · `buildStockBranchFilter` in `tools/data.ts` — reimplements `branchAndFilter` incompletely

`apps/web/src/app/dashboard/tools/data.ts` lines 220–234:
```ts
function buildStockBranchFilter(alias: string): ReturnType<typeof sql> {
	if (filters.branchId) {
		return sql` AND ${sql.raw(alias)}.branch_id = ${filters.branchId}`;
	}
	if (scope.kind === "scoped") {
		if (scope.branchIds.length === 0) {
			return sql` AND false`;
		}
		return sql` AND ${sql.raw(alias)}.branch_id IN (${sql.join(
			scope.branchIds.map((id) => sql`${id}`),
			sql`, `
		)})`;
	}
	return sql``;
}
```
Called as `buildStockBranchFilter("sl")` and `buildStockBranchFilter("sl2")`.

This reimplements `branchAndFilter` from `@/lib/branch-scope` (lines 94–97 of
`apps/web/src/lib/branch-scope.ts`) but **omits the `includeUnassigned` OR
clause** (`${col} IS NULL`). For `stock_level.branch_id` (NOT NULL), the
omission is harmless today, but the local copy will silently diverge if scope
semantics change.

`branchAndFilter` signature:
```ts
export function branchAndFilter(scope: BranchScope, col: SQL): SQL {
	const cond = branchCondForColumn(scope, col);
	return cond ? sql` AND ${cond}` : sql``;
}
```
Correct usage exemplar: `apps/web/src/app/dashboard/suppliers/data.ts` line 165:
```ts
const stockScopeFilter = branchAndFilter(scope, sql`sl.branch_id`);
```

The `filters.branchId` override (explicit user filter, highest priority) must
be preserved — it must run **before** delegating to `branchAndFilter`. The
replacement shape is:

```ts
const branchStockFilter = filters.branchId
  ? sql` AND sl.branch_id = ${filters.branchId}`
  : branchAndFilter(scope, sql`sl.branch_id`);
const branchStockFilter2 = filters.branchId
  ? sql` AND sl2.branch_id = ${filters.branchId}`
  : branchAndFilter(scope, sql`sl2.branch_id`);
```

---

### 4 · `coerceDates` — private in `packages/db/src/queries/catalog.ts`, needed at every `db.execute` boundary

`packages/db/src/queries/catalog.ts` lines 13–21:
```ts
function coerceDates<T extends object>(obj: T, keys: readonly (keyof T)[]): T {
	for (const k of keys) {
		const v = obj[k];
		if (v !== null && v !== undefined && !(v instanceof Date)) {
			(obj as Record<keyof T, unknown>)[k] = new Date(v as string);
		}
	}
	return obj;
}
```
Used 9× within catalog.ts (lines 461, 598, 600, 658, 765, 782, 821, 915, 1087).

`packages/db/src/utils.ts` currently exports only `toDate` (single-value
coercion). `packages/db/CLAUDE.md` explicitly says: "Para reuso fora dali,
mover para `utils.ts` com export."

`apps/web/src/app/dashboard/orders/data.ts` has 6 sequential `toDate()` calls
per row (lines 926–931) because `coerceDates` is unavailable there.

`@emach/db/utils` resolves to `packages/db/src/utils.ts` via the package
wildcard export `"./*": { "default": "./src/*.ts" }`.

**Interaction with plan 044 (catalog split)**: plan 044 has not been written
yet (no `plans/044-*.md` file exists). If it lands before this plan and moves
`coerceDates` to `catalog-helpers.ts` instead, update step 4 accordingly —
check which file holds `coerceDates` during the drift check.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Type-check | `bun check-types` | exit 0, no errors |
| Lint | `bun check` | exit 0, no errors |
| Tests | `bun --cwd apps/web test` | all pass |
| Build (mandatory — "use server" files touched) | `bun run --cwd apps/web build` | exit 0 |

> **Build gate**: `attachment-actions.ts` and `orders/actions.ts` are `"use
> server"` files. Any import/export change there must be followed by
> `bun run --cwd apps/web build`. `check-types`/lint do NOT catch "use server"
> export violations.

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/lib/action-error.ts`
- `apps/web/src/app/dashboard/orders/actions.ts`
- `apps/web/src/app/dashboard/orders/_components/attachment-actions.ts`
- `apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts`
- `apps/web/src/app/dashboard/branches/data.ts`
- `apps/web/src/app/dashboard/tools/page.tsx`
- `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab.tsx`
- `apps/web/src/app/dashboard/tools/data.ts`
- `packages/db/src/utils.ts`
- `packages/db/src/queries/catalog.ts`

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/lib/branch-scope.ts` — no changes needed; `branchAndFilter`
  is already the correct implementation.
- `apps/web/src/lib/permissions.ts` — capability matrix; this plan does not
  change authorization logic.
- `apps/web/src/app/dashboard/suppliers/data.ts` — already uses
  `branchAndFilter` correctly; exemplar only.
- Any file under `packages/db/src/schema/` — schema push-only (ADR-0006).
- `packages/db/src/index.ts` — barrel; only touch if a new export requires it
  (it shouldn't for utils).
- `apps/web/src/app/dashboard/orders/data.ts` — optional migration of 6
  `toDate` calls; defer unless you have time after steps 1–4 pass (see
  "Maintenance notes").

## Git workflow

- Branch: `advisor/046-dedup-shared-helpers`
- One commit per step (steps 1–4 are independent; commit after each step's
  verification passes).
- Conventional Commits in Portuguese, subject ≤50 chars. Examples:
  - `refactor(action-error): exportar isCapabilityError`
  - `refactor(branches): extrair getActiveBranches`
  - `refactor(tools): usar branchAndFilter do lib`
  - `refactor(db): mover coerceDates para utils`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Export `isCapabilityError` from `@/lib/action-error` and import in both orders files

**1a.** In `apps/web/src/lib/action-error.ts`, add the export after the
existing `actionErrorMessage` function:

```ts
/**
 * Capability guards throw `Error("Forbidden: ...")` — detect those here.
 * Use in `catch` blocks after `requireCapability*` calls.
 */
export function isCapabilityError(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith("Forbidden:");
}
```

**1b.** In `apps/web/src/app/dashboard/orders/actions.ts`:

- Add `isCapabilityError` to the import from `@/lib/action-error`. The file
  already imports from that path (check for the `actionErrorMessage` import).
  If `actionErrorMessage` is not yet imported there, add the import line:
  ```ts
  import { isCapabilityError } from "@/lib/action-error";
  ```
- Delete the local `isCapabilityError` function (lines 108–111 per the current
  state). Confirm the function body matches the excerpt before deleting.

**1c.** In `apps/web/src/app/dashboard/orders/_components/attachment-actions.ts`:

- Add import:
  ```ts
  import { isCapabilityError } from "@/lib/action-error";
  ```
- Delete the local `isCapabilityError` function (lines 40–43). Confirm the
  body matches before deleting.

**1d.** In `apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts`:

Make `safeRequireRole` a thin wrapper around `isCapabilityError`:

```ts
import { isCapabilityError } from "@/lib/action-error";

export function safeRequireRole(error: unknown): ActionResult<never> {
	if (isCapabilityError(error)) {
		return { ok: false, error: "Acesso negado" };
	}
	throw error;
}
```

Remove the inline `instanceof Error && startsWith("Forbidden:")` guard from
`safeRequireRole`. Keep the existing `import type { ActionResult }` import.

**Verify**:
```
bun check-types && bun check && bun run --cwd apps/web build
```
Expected: exit 0 for all three. The build gate is required because
`orders/actions.ts` and `orders/_components/attachment-actions.ts` are `"use
server"` files.

---

### Step 2: Add `getActiveBranches()` to `branches/data.ts` and import in tools files

**2a.** In `apps/web/src/app/dashboard/branches/data.ts`, add a new exported
function **at the end of the file** (after `getBranchTableAggregates`):

```ts
export interface ActiveBranchOption {
	id: string;
	name: string;
}

export function getActiveBranches(): Promise<ActiveBranchOption[]> {
	return db
		.select({ id: branch.id, name: branch.name })
		.from(branch)
		.where(eq(branch.status, "active"))
		.orderBy(asc(branch.name));
}
```

`branch`, `eq`, and `asc` are already imported in the file. Verify by reading
the import block at lines 1–13.

**2b.** In `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab.tsx`:

- Replace the local `function fetchActiveBranches()` (lines 17–23) with an
  import:
  ```ts
  import { getActiveBranches } from "@/app/dashboard/branches/data";
  ```
- Update the `Promise.all` call on line 30 to use `getActiveBranches()`:
  ```ts
  const [first, branches] = await Promise.all([
      fetchToolActivityPage(...),
      getActiveBranches(),
  ]);
  ```
- Remove the now-unused `db`, `branch`, `asc`, `eq` imports if they were only
  used by the deleted local function.

**2c.** In `apps/web/src/app/dashboard/tools/page.tsx`:

- Replace the local `async function fetchActiveBranches()` (lines 52–58) with
  an import:
  ```ts
  import { getActiveBranches } from "@/app/dashboard/branches/data";
  ```
- Update all call-sites of `fetchActiveBranches()` to `getActiveBranches()`.
  Search for `fetchActiveBranches` in the file — there should be one call site.
- Remove the now-unused `db`, `branch`, `asc`, `eq` imports if they were only
  used by the deleted local function. Note: `branch` is already imported from
  `@emach/db/schema/inventory` at the top of `tools/page.tsx` — only remove
  it if no other code in the file uses it.

**Verify**:
```
bun check-types && bun check
```
Expected: exit 0 for both. (No `"use server"` files touched — build gate not
required for this step, but running it is harmless.)

---

### Step 3: Replace `buildStockBranchFilter` in `tools/data.ts` with `branchAndFilter`

In `apps/web/src/app/dashboard/tools/data.ts`:

**3a.** Add `branchAndFilter` to the import from `@/lib/branch-scope` (already
imported in the file — check the existing import and add `branchAndFilter` to
it).

**3b.** Delete the local `buildStockBranchFilter` closure (lines 220–234 in
current state). Confirm the body matches the excerpt in "Current state" before
deleting.

**3c.** Replace the two call-sites:

Current:
```ts
const branchStockFilter = buildStockBranchFilter("sl");
const branchStockFilter2 = buildStockBranchFilter("sl2");
```

Replace with:
```ts
const branchStockFilter = filters.branchId
    ? sql` AND sl.branch_id = ${filters.branchId}`
    : branchAndFilter(scope, sql`sl.branch_id`);
const branchStockFilter2 = filters.branchId
    ? sql` AND sl2.branch_id = ${filters.branchId}`
    : branchAndFilter(scope, sql`sl2.branch_id`);
```

This preserves the `filters.branchId` override (highest priority) and
delegates the scope logic — including the `includeUnassigned` OR clause — to
the canonical implementation.

**Verify**:
```
bun check-types && bun check
```
Expected: exit 0 for both.

> **Smoke note**: `tools/data.ts` is used in SSR. After committing, run
> `bun dev:web` and open `/dashboard/tools` as an admin user to confirm the
> branch filter still works. `check-types` does NOT catch SQL template errors.

---

### Step 4: Move `coerceDates` to `packages/db/src/utils.ts` and export it

**4a.** Read `packages/db/src/queries/catalog.ts` lines 13–21 to confirm the
function body matches the "Current state" excerpt before proceeding.

**4b.** In `packages/db/src/utils.ts`, append `coerceDates` after `toDate`:

```ts
/**
 * Coerce multiple timestamp-typed keys on a raw `db.execute` result object
 * from string to Date. Mutates `obj` in place and returns it.
 *
 * Background: `db.execute()` bypasses Drizzle's column mapper and returns
 * timestamps as raw strings from the Postgres driver. Use this at every
 * `db.execute` boundary where the shape type declares Date fields.
 * See `packages/db/CLAUDE.md` — "Armadilha: db.execute() raw devolve
 * timestamp como string".
 */
export function coerceDates<T extends object>(
	obj: T,
	keys: readonly (keyof T)[]
): T {
	for (const k of keys) {
		const v = obj[k];
		if (v !== null && v !== undefined && !(v instanceof Date)) {
			(obj as Record<keyof T, unknown>)[k] = new Date(v as string);
		}
	}
	return obj;
}
```

**4c.** In `packages/db/src/queries/catalog.ts`:

- Delete the private `coerceDates` function (lines 13–21). Confirm body
  matches before deleting.
- Add an import at the top of the file:
  ```ts
  import { coerceDates } from "../utils";
  ```
  Place it alongside any existing imports from `../*`.

**Verify**:
```
bun check-types && bun check
```
Expected: exit 0 for both.

> `catalog.ts` is in the ADR-0009 CI-sync surface
> (`packages/db/src/queries/`). The new import `from "../utils"` is safe
> because `packages/db/src/utils.ts` is at the `src/` root (not the
> `queries/` subtree), and the ecommerce repo does NOT receive the `queries/`
> directory (only the `schema/` directory, `queries/` itself, and
> `sql/triggers.sql`, `sql/rls.sql` are synced). The `catalog.ts` file
> already imports from `../schema/*`, so `../utils` follows the same pattern.

## Test plan

These are pure refactors — no behavior changes. The goal is to confirm
existing behavior is preserved after extraction.

**No new tests are required.** The existing test suite covers the callers:

- `bun --cwd apps/web test` — runs vitest (68 files / 481 tests baseline).
  Confirm all existing tests continue to pass after each step.

If you want to add a smoke test for `isCapabilityError`, model after
`apps/web/src/__tests__/activity.test.ts` (vi.hoisted + vi.mock pattern) —
but this is optional for a P3 plan.

**Verification**:
```
bun --cwd apps/web test
```
Expected: all pass; no new failures.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` exits 0, all tests pass
- [ ] `bun run --cwd apps/web build` exits 0 (required — "use server" files touched in step 1)
- [ ] `grep -rn "function isCapabilityError" apps/web/src/` returns **exactly one match** (in `action-error.ts`)
- [ ] `grep -rn "function fetchActiveBranches" apps/web/src/` returns **zero matches**
- [ ] `grep -rn "function buildStockBranchFilter" apps/web/src/` returns **zero matches**
- [ ] `grep -n "function coerceDates" packages/db/src/queries/catalog.ts` returns **zero matches**
- [ ] `grep -n "export function coerceDates" packages/db/src/utils.ts` returns **one match**
- [ ] `git diff --name-only` lists only in-scope files (no out-of-scope spill)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Any file in the "Current state" section doesn't match the excerpts (drift
  since plan was written — run the drift-check command at the top first).
- `bun run --cwd apps/web build` fails after step 1 with `"Only async
  functions are allowed to be exported in a 'use server' file"` — this means
  a non-async symbol leaked into a `"use server"` export. Do not patch around
  it; identify and remove the offending export.
- `bun check-types` introduces new errors in files outside the in-scope list
  (indicates an unexpected import cycle or broken re-export).
- Step 3 (`buildStockBranchFilter` → `branchAndFilter`) causes the tools
  listing to show wrong branch-scoped results in a smoke run — the
  `includeUnassigned` semantics differ from the old local copy. Stop and
  verify the expected behavior with the product owner before proceeding.
- `catalog.ts` import `from "../utils"` triggers a CI-sync error on the
  ecommerce repo (import outside the `schema/` surface). This should NOT
  happen (utils is at `src/` root, same level as `queries/`), but if it does,
  revert step 4 and report.
- plan 044 (catalog split) exists and has moved `coerceDates` to a different
  file — update step 4 accordingly rather than creating a duplicate.

## Maintenance notes

- **`isCapabilityError` in `action-error.ts`**: future capability error
  variants (e.g., a richer `CapabilityError` class) should extend this
  function, not add new local copies. The jsdoc on the exported function names
  the `"Forbidden:"` prefix contract — keep it updated if the prefix changes.

- **`getActiveBranches` in `branches/data.ts`**: if filtering requirements
  grow (e.g., filter by region, exclude certain statuses), update this single
  canonical location. Both callers will benefit automatically.

- **`branchAndFilter` in step 3**: `buildStockBranchFilter` previously omitted
  the `includeUnassigned` (OR IS NULL) clause for stock subqueries because
  `stock_level.branch_id` is NOT NULL. `branchAndFilter` will generate that
  clause for `admin` users — it becomes a harmless dead branch for NOT NULL
  columns (Postgres will optimize it out). If this causes a query plan
  regression (unlikely), revisit and add a dedicated `branchAndFilterNotNull`
  variant to `@/lib/branch-scope`.

- **Optional follow-up (deferred)**: migrate the 6 sequential `toDate()` calls
  in `apps/web/src/app/dashboard/orders/data.ts` lines 926–931 to a single
  `coerceDates(row, ["created_at","paid_at","preparing_at","shipped_at","delivered_at","canceled_at"])`.
  Note: the keys use `snake_case` (raw `db.execute` column names) there, while
  the exported shape uses camelCase — confirm key names before migrating.
  Deferred because it adds scope to a P3 plan with no behavior change.
