# Plan 004: Paralelizar round-trips sequenciais nos fetchers de detalhe

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result before moving on. On any "STOP conditions" item,
> stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- apps/web/src/app/dashboard/branches/data.ts apps/web/src/app/dashboard/suppliers/data.ts "apps/web/src/app/dashboard/tools/[id]/page.tsx"`
> If anything changed, compare against "Current state" before proceeding; on a
> mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (pure read parallelization; identical results, fewer round-trips)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

Three detail-page data paths issue independent DB queries **sequentially**,
paying one network round-trip to Postgres per query when they could run
concurrently in a single `Promise.all`. On Vercel→Supabase latency (~50–80ms per
round-trip) this is wasted TTFB on hot detail pages: branch detail pays ~4×,
supplier detail ~2×, and tool detail starts its main fetch only after capability
checks resolve. Parallelizing them is a mechanical, behavior-preserving change
that cuts the blocking latency of each page.

## Current state

### A) `getBranchDetailKpis` — 4 sequential `await db.select()`

`apps/web/src/app/dashboard/branches/data.ts:102-134`:

```ts
export async function getBranchDetailKpis(branchId: string): Promise<BranchDetailKpis> {
	const [skus] = await db.select({ n: sql<number>`count(distinct ${stockLevel.variantId})::int` })
		.from(stockLevel)
		.where(and(eq(stockLevel.branchId, branchId), gt(stockLevel.quantity, 0)));
	const [value] = await db.select({ v: sql<number>`coalesce(sum(${stockLevel.quantity} * coalesce(${toolVariant.priceAmount}, 0)), 0)::float` })
		.from(stockLevel)
		.leftJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
		.where(eq(stockLevel.branchId, branchId));
	const [team] = await db.select({ n: sql<number>`count(*)::int` })
		.from(userBranch)
		.where(eq(userBranch.branchId, branchId));
	const [recent] = await db.select({ n: sql<number>`count(*)::int` })
		.from(order)
		.where(sql`${order.branchId} = ${branchId} and ${order.createdAt} >= now() - interval '30 days'`);
	return {
		skuCount: skus?.n ?? 0,
		stockValue: value?.v ?? 0,
		teamSize: team?.n ?? 0,
		orders30d: recent?.n ?? 0,
	};
}
```

The four queries are independent aggregations over different tables.

### B) `getSupplierDetailKpis` — 2 sequential `await db.execute()`

`apps/web/src/app/dashboard/suppliers/data.ts:85-123`:

```ts
export async function getSupplierDetailKpis(supplierId: string): Promise<SupplierDetailKpis> {
	const countRows = await db.execute<{...}>(sql`SELECT ... FROM tool t WHERE t.id IN (${supplierToolIds(supplierId)})`);
	const catRows = await db.execute<{ n: string }>(sql`SELECT count(DISTINCT tc.category_id)::int AS "n" FROM tool_category tc WHERE tc.tool_id IN (${supplierToolIds(supplierId)})`);
	const counts = countRows.rows[0];
	const cats = catRows.rows[0];
	return { activeTools: ..., inactiveTools: ..., lastToolAddedAt: ..., categoriesCovered: ... };
}
```

The two `db.execute` calls are independent.

### C) `tools/[id]/page.tsx` — main fetch waits for capability checks

`apps/web/src/app/dashboard/tools/[id]/page.tsx:34-42`:

```tsx
const session = await requireCurrentSession();
const [canMutate, canDelete] = await Promise.all([
	can(session, "tools.update"),
	can(session, "tools.delete"),
]);
const { id } = await params;
const { tab } = await searchParams;
const detail = await getToolDetail(id);
```

`getToolDetail(id)` only needs `id` (from `params`) — it does not depend on
`canMutate`/`canDelete`, yet it starts only after those resolve. `getToolDetail`
enforces its own `requireCapability("tools.read")` internally (per
`apps/web/CLAUDE.md`), so starting it concurrently with the `can()` checks does
not bypass authorization.

**Convention note**: `can()` is already wrapped in React `cache()` (request-
scoped) per `apps/web/CLAUDE.md` §Capabilities — calling it alongside other
awaits is safe and does not duplicate work.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Tests | `bun --cwd apps/web test` | all pass |
| Dev smoke | `bun dev:web` → visit branch/supplier/tool detail | KPIs render identical to before |

## Scope

**In scope**:
- `apps/web/src/app/dashboard/branches/data.ts` (function `getBranchDetailKpis` only)
- `apps/web/src/app/dashboard/suppliers/data.ts` (function `getSupplierDetailKpis` only)
- `apps/web/src/app/dashboard/tools/[id]/page.tsx` (the await ordering at the top of the page function only)

**Out of scope**:
- Do NOT merge the queries into single SQL statements (that is a larger change
  with query-plan risk; `Promise.all` is the safe S fix here). Merging is a
  deferred follow-up noted in Maintenance.
- Do NOT change the returned shapes (`BranchDetailKpis`, `SupplierDetailKpis`) —
  consumers (`overview-tab.tsx`, KPI headers) depend on them.
- Do NOT touch other functions in these data files.

## Git workflow

- Branch: `advisor/004-parallel-detail-fetchers`
- Commit (conventional commits, PT): `perf: paraleliza queries de KPI de detalhe`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Parallelize `getBranchDetailKpis`

Rewrite the body so the four queries run concurrently. Keep the exact same query
definitions; wrap them in `Promise.all` and destructure in order:

```ts
const [[skus], [value], [team], [recent]] = await Promise.all([
	db.select({ n: sql<number>`count(distinct ${stockLevel.variantId})::int` })
		.from(stockLevel)
		.where(and(eq(stockLevel.branchId, branchId), gt(stockLevel.quantity, 0))),
	db.select({ v: sql<number>`coalesce(sum(${stockLevel.quantity} * coalesce(${toolVariant.priceAmount}, 0)), 0)::float` })
		.from(stockLevel)
		.leftJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
		.where(eq(stockLevel.branchId, branchId)),
	db.select({ n: sql<number>`count(*)::int` })
		.from(userBranch)
		.where(eq(userBranch.branchId, branchId)),
	db.select({ n: sql<number>`count(*)::int` })
		.from(order)
		.where(sql`${order.branchId} = ${branchId} and ${order.createdAt} >= now() - interval '30 days'`),
]);
return { skuCount: skus?.n ?? 0, stockValue: value?.v ?? 0, teamSize: team?.n ?? 0, orders30d: recent?.n ?? 0 };
```

**Verify**: `bun check-types` → exit 0.

### Step 2: Parallelize `getSupplierDetailKpis`

```ts
const [countRows, catRows] = await Promise.all([
	db.execute<{ active: string; inactive: string; lastEntrada: string | null }>(sql`SELECT ... `),
	db.execute<{ n: string }>(sql`SELECT count(DISTINCT tc.category_id)::int AS "n" FROM tool_category tc WHERE tc.tool_id IN (${supplierToolIds(supplierId)})`),
]);
const counts = countRows.rows[0];
const cats = catRows.rows[0];
// ...return unchanged...
```

Keep the SQL bodies byte-for-byte identical to the current file.

**Verify**: `bun check-types` → exit 0.

### Step 3: Overlap `getToolDetail` with the capability checks

In `tools/[id]/page.tsx`, reorder so `id` is resolved first, then run the caps
and the detail fetch together:

```tsx
const session = await requireCurrentSession();
const [{ id }, { tab }] = await Promise.all([params, searchParams]);
const [canMutate, canDelete, detail] = await Promise.all([
	can(session, "tools.update"),
	can(session, "tools.delete"),
	getToolDetail(id),
]);
if (!detail) {
	notFound();
}
```

The lazy tab fetches below (`reviewsSummary`, `suppliers`) stay exactly as they
are.

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0.

### Step 4: Smoke

`bun dev:web` → visit `/dashboard/branches/<id>`, `/dashboard/suppliers/<id>`,
`/dashboard/tools/<id>`. Confirm the KPI numbers render and match what they
showed before (no NaN, no missing values).

**Verify**: KPIs render identically; no runtime error in `nextjs_call <port>
get_errors` or the dev console.

## Test plan

- These functions are not currently unit-tested. Adding DB-integration tests is
  out of scope (no test DB harness exists for these). The verification is:
  `bun --cwd apps/web test` stays green + the visual smoke confirming identical
  KPI output.
- If you want a cheap guard, you may add a unit test only if a mockable seam
  already exists in `__tests__` for these modules — otherwise skip (do not build
  new mocking infrastructure).

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` passes
- [ ] Branch / supplier / tool detail KPIs render identical values (smoke)
- [ ] Only the three in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Any excerpt in "Current state" does not match the live code (drift).
- `getToolDetail` turns out NOT to enforce its own capability internally (verify
  by reading the function before Step 3) — if it relies on the page-level
  `can()` for authorization, do NOT reorder; report it.
- TypeScript complains the `Promise.all` tuple destructuring loses types — adjust
  destructuring but do not change query logic; if it persists, report.

## Maintenance notes

- Deferred follow-up: `getBranchDetailKpis` and `getSupplierDetailKpis` could be
  collapsed into a single SQL statement (subselect per metric) to go from
  N round-trips to 1 — bigger win, but needs EXPLAIN verification on real data
  volumes. Not done here to keep risk LOW.
- A reviewer should confirm the destructuring order matches the `Promise.all`
  array order (a swap would silently mislabel KPIs).
