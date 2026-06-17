# Plan 007: Dedup request-scoped com React `cache()` em fetchers repetidos

> **Executor instructions**: Follow step by step; run every verification before
> moving on. On any "STOP conditions" item, stop and report. When done, update
> this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/promotions/actions.ts apps/web/src/app/dashboard/categories/actions.ts`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (`cache()` is request-scoped React memoization; no cross-request semantics)
- **Depends on**: none (independent of plan 006; this works without Cache Components)
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

Several stable-data fetchers are called more than once within a single render
tree (layout + page, or page + a sub-component), issuing the **same** Postgres
query multiple times per request. React's `cache()` memoizes a function for the
duration of one request, collapsing those duplicate queries into one — with no
cross-request caching and therefore no invalidation concern. This is the safe,
immediate slice of caching that needs no Cache Components flag (it's the exact
pattern `apps/web/CLAUDE.md` documents and that `fetchDashboardCounts` already
uses). It cuts redundant DB round-trips on hot pages today.

## Current state

- **Pattern already in use** — `apps/web/src/app/dashboard/pending-data.ts:302`
  wraps `fetchDashboardCounts` in `cache()` precisely so the layout (badges) and
  the page (`PendingSection`) don't double-query:

```ts
import { cache } from "react";
// ...
export const fetchDashboardCounts = cache(
	async (): Promise<DashboardCounts> => { /* ... */ }
);
```

- **`listOrderBranches` is NOT wrapped** —
  `apps/web/src/app/dashboard/orders/data.ts`:

```ts
export async function listOrderBranches(): Promise<BranchOption[]> {
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);
	const query = db.select({ cepRanges: branch.cepRanges, id: branch.id, name: branch.name })
		.from(branch).orderBy(asc(branch.name));
	if (scope.kind === "all") return query;
	if (scope.branchIds.length === 0) return [];
	return db.select({ ... }).from(branch).where(inArray(branch.id, scope.branchIds)).orderBy(asc(branch.name));
}
```

  Called in `orders/page.tsx:73` AND `orders/[id]/page.tsx:50` (different pages,
  but each render is one request — wrapping still dedups if a page calls it twice,
  and is cheap insurance + documents intent).

- **`getToolOptions` is NOT wrapped** —
  `apps/web/src/app/dashboard/promotions/actions.ts:1011`:

```ts
export async function getToolOptions(): Promise<{ id: string; name: string }[]> {
	await requireCurrentSession();
	return db.select({ id: tool.id, name: tool.name }).from(tool).orderBy(asc(tool.name));
}
```

  Called on the promotions list, `new`, and `[id]/edit` pages.

- **`listCategories` is NOT wrapped** —
  `apps/web/src/app/dashboard/categories/actions.ts:59`:

```ts
export async function listCategories(): Promise<CategoryListItem[]> {
	return await db.select().from(category).orderBy(asc(category.path));
}
```

  Called on multiple form pages; there are also two *inline* copies of this query
  (`tools/page.tsx`, `tools/new/page.tsx`) — those are noted for consolidation in
  Maintenance, not changed here.

**Convention**: `apps/web/CLAUDE.md` §Cache — "Dedup request-scoped sem Cache
Components: fetcher chamado em mais de um lugar no mesmo render → envolver em
`cache()` do `react`."

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Tests | `bun --cwd apps/web test` | all pass |

## Scope

**In scope**:
- `apps/web/src/app/dashboard/orders/data.ts` — wrap `listOrderBranches` in `cache()`
- `apps/web/src/app/dashboard/promotions/actions.ts` — wrap `getToolOptions` in `cache()`
- `apps/web/src/app/dashboard/categories/actions.ts` — wrap `listCategories` in `cache()`

**Out of scope**:
- Do NOT touch the inline category-query copies in `tools/page.tsx` /
  `tools/new/page.tsx` — consolidating those is a separate tech-debt change
  (noted in Maintenance).
- Do NOT add `use cache`/`cacheTag` (that's plan 006 and needs the flag).
- Do NOT change any query logic or return shapes.
- `getToolOptions` and `listOrderBranches` call `requireCurrentSession()` /
  `getUserBranchScope` — those are themselves already `cache()`-wrapped
  (request-scoped), so wrapping the outer fetcher is safe and composes.

## Git workflow

- Branch: `advisor/007-request-dedup`
- Commit (conventional commits, PT): `perf: dedup request-scoped com cache() em fetchers`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Wrap `listOrderBranches`

In `orders/data.ts`, import `cache` from `react` (if not already imported) and
convert the function to a `cache()`-wrapped const, preserving the exact body:

```ts
import { cache } from "react";

export const listOrderBranches = cache(
	async (): Promise<BranchOption[]> => {
		// ...exact current body...
	}
);
```

Confirm all call sites still import `{ listOrderBranches }` by name — a
`cache()`-wrapped const export keeps the same import shape.

**Verify**: `bun check-types` → exit 0.

### Step 2: Wrap `getToolOptions`

Same transformation in `promotions/actions.ts`. Note this file is a server-actions
module (`"use server"`); `cache()` wrapping a non-action helper exported from it
is fine as long as the function isn't also used as a form action. `getToolOptions`
is a data reader, not a form action — safe.

**Verify**: `bun check-types` → exit 0.

### Step 3: Wrap `listCategories`

Same transformation in `categories/actions.ts`.

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0.

### Step 4: Smoke

`bun dev:web` → visit `/dashboard/orders`, `/dashboard/promotions`,
`/dashboard/categories`. Confirm branch options, tool options, and category
lists still render correctly (the dedup is invisible to the UI; you're confirming
no regression).

**Verify**: all three pages render their option/list data; no runtime error via
`nextjs_call <port> get_errors`.

## Test plan

- No new unit tests (request-scoped memoization is React behavior). Run
  `bun --cwd apps/web test` — must stay green. If a test imports one of these
  functions and asserts it's a plain `function` (vs a `cache()` const), update
  the assertion; otherwise no test changes.

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` passes
- [ ] `listOrderBranches`, `getToolOptions`, `listCategories` are `cache()`-wrapped
- [ ] The three pages render correctly (smoke)
- [ ] Only the three in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- A `cache()`-wrapped export breaks a call site's import (shouldn't — report if so).
- `getToolOptions` turns out to be referenced as a `<form action={...}>` handler
  anywhere (then `cache()` wrapping is wrong for it) — verify with a grep for its
  usage before wrapping; if used as an action, skip just that one and report.
- Any "Current state" excerpt doesn't match the live code (drift).

## Maintenance notes

- Deferred tech-debt: `tools/page.tsx` and `tools/new/page.tsx` each inline their
  own `SELECT ... FROM category` query instead of calling `listCategories`.
  Consolidating them onto the now-`cache()`-wrapped `listCategories` would let the
  dedup span the whole render — worth a follow-up tech-debt plan.
- When plan 006 lands, these `cache()` wrappers can be upgraded to
  `use cache` + `cacheTag` for cross-request caching; `cache()` is the
  request-scoped floor, `use cache` the cross-request ceiling. They are
  complementary, not redundant.
