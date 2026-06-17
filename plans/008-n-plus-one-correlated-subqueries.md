# Plan 008: Eliminar subqueries correlacionadas por linha em listas

> **Executor instructions**: Follow step by step; run every verification before
> moving on. On any "STOP conditions" item, stop and report. When done, update
> this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- apps/web/src/app/dashboard/stock/branch-stock-data.ts apps/web/src/app/dashboard/orders/data.ts`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (rewriting SQL changes the query plan — must verify with EXPLAIN)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

Two list queries embed a **correlated scalar subquery per result row**, so a page
of 20 items runs 20 extra sub-plans inside Postgres. The branch stock list signs
one image lookup per row; the orders list counts order items per row. Rewriting
these as a single `LEFT JOIN LATERAL` (image) and a grouped `LEFT JOIN`
(items count) lets Postgres plan one join instead of N subplans, which scales
better under load and makes the plan explicit. **This is architectural insurance**
— if the underlying columns are well-indexed the current cost is modest, so the
plan requires confirming the win with `EXPLAIN ANALYZE` before and after.

## Current state

### A) Branch stock list — image lookup per row

`apps/web/src/app/dashboard/stock/branch-stock-data.ts:209-229`:

```sql
SELECT
	t.id AS tool_id,
	t.name AS tool_name,
	tv.id AS variant_id,
	tv.sku,
	tv.voltage::text AS voltage,
	(
		SELECT ti.url FROM tool_image ti
		WHERE ti.tool_id = t.id
		ORDER BY ti.sort_order ASC
		LIMIT 1
	) AS image_url,
	COALESCE(sl.quantity, 0)::int AS quantity,
	COALESCE(sl.min_qty, 0)::int AS min_qty,
	COALESCE(sl.reorder_point, 0)::int AS reorder_point
FROM tool t
JOIN tool_variant tv ON tv.tool_id = t.id
LEFT JOIN stock_level sl ON sl.variant_id = tv.id AND sl.branch_id = ${filters.branchId}
${whereClause}
${orderClause}
```

The `image_url` scalar subquery runs once per row.

### B) Orders list — items count per row

`apps/web/src/app/dashboard/orders/data.ts:353` (inside `fetchOrdersPage`) and
the same pattern at line ~461 (inside `listOrders`):

```sql
	(SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.id)::int AS items_count
FROM "order" o
JOIN client c ON c.id = o.client_id
LEFT JOIN branch b ON b.id = o.branch_id
${whereClause}
ORDER BY o.created_at DESC, o.id DESC
LIMIT ${BATCH_SIZE + 1}
```

The `items_count` scalar subquery runs once per row.

**Schema/conventions**: queries use Drizzle's `sql` template (`db.execute<...>`).
DB triggers/denormalization patterns live in `packages/db` (see
`packages/db/CLAUDE.md`) — but this plan uses **query rewrites only**, no schema
changes, to keep blast radius contained.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Tests | `bun --cwd apps/web test` | all pass |
| Dev smoke | `bun dev:web` → branch stock + orders list | rows render identical (image, count) |
| EXPLAIN | via `mcp__supabase__execute_sql` with `EXPLAIN ANALYZE <query>` (read-only) | before/after plan comparison |

## Suggested executor toolkit

- `supabase-postgres-best-practices` skill — for LATERAL join and `EXPLAIN`
  interpretation.
- You may run read-only `EXPLAIN ANALYZE` via the Supabase MCP `execute_sql`
  tool. Do NOT run mutations.

## Scope

**In scope**:
- `apps/web/src/app/dashboard/stock/branch-stock-data.ts` — the `image_url`
  subquery in the branch stock SELECT only.
- `apps/web/src/app/dashboard/orders/data.ts` — the `items_count` subquery in
  `fetchOrdersPage` (line ~353) and `listOrders` (line ~461).

**Out of scope**:
- No schema changes — do NOT add a denormalized `items_count` column or triggers
  (bigger change, eventual-consistency risk; deferred to Maintenance).
- Do NOT change pagination, `whereClause`, `orderClause`, or the result row
  shapes (`image_url`, `items_count` must remain the same field names/types).
- Other queries in these files.

## Git workflow

- Branch: `advisor/008-n-plus-one`
- Commit (conventional commits, PT): `perf: troca subqueries correlacionadas por join`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Confirm there's a win (EXPLAIN before)

Before changing anything, run `EXPLAIN ANALYZE` (read-only, via Supabase MCP) on
the current branch-stock and orders-list queries against a realistic data volume.
Record the plan and timing. Check whether `tool_image.tool_id` and
`order_item.order_id` are indexed (`SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('tool_image','order_item');`).

**Verify**: you have a baseline plan + timing. If both columns are already
indexed AND the subplan cost is negligible (sub-millisecond), STOP and report —
the rewrite may not be worth the MED risk; let the maintainer decide.

### Step 1: Rewrite the branch-stock image lookup as LATERAL

Replace the `image_url` scalar subquery with a `LEFT JOIN LATERAL`:

```sql
FROM tool t
JOIN tool_variant tv ON tv.tool_id = t.id
LEFT JOIN stock_level sl ON sl.variant_id = tv.id AND sl.branch_id = ${filters.branchId}
LEFT JOIN LATERAL (
	SELECT ti.url FROM tool_image ti
	WHERE ti.tool_id = t.id
	ORDER BY ti.sort_order ASC
	LIMIT 1
) img ON true
```

and select `img.url AS image_url` instead of the inline subquery. Semantics are
identical (still the first image by `sort_order`, NULL if none).

**Verify**: `bun check-types` → exit 0. Run `EXPLAIN ANALYZE` on the new query —
plan should show one lateral join, no per-row subplan; timing ≤ baseline.

### Step 2: Rewrite the orders `items_count` as a grouped join

In both `fetchOrdersPage` and `listOrders`, replace the per-row count subquery
with a pre-aggregated join:

```sql
FROM "order" o
JOIN client c ON c.id = o.client_id
LEFT JOIN branch b ON b.id = o.branch_id
LEFT JOIN (
	SELECT order_id, COUNT(*)::int AS cnt FROM order_item GROUP BY order_id
) ic ON ic.order_id = o.id
```

and select `COALESCE(ic.cnt, 0)::int AS items_count`.

**Note**: a full `GROUP BY` over `order_item` may be *worse* than the correlated
subquery if the order table is large and the page is small (it aggregates all
orders, not just the page). If EXPLAIN shows that, prefer `LEFT JOIN LATERAL
(SELECT COUNT(*) ... WHERE oi.order_id = o.id) ic ON true` instead, which is
bounded to the page. Choose whichever EXPLAIN says is faster and record why.

**Verify**: `bun check-types` → exit 0. `EXPLAIN ANALYZE` on the chosen rewrite ≤
baseline timing.

### Step 3: Smoke parity

`bun dev:web` → `/dashboard/branches/<id>/stock` (or the branch stock view) and
`/dashboard/orders`. Confirm thumbnails appear for tools that have images and the
items-count column shows the same numbers as before.

**Verify**: image thumbnails + item counts render identical to current behavior.

## Test plan

- These raw-SQL functions are not unit-tested (no test DB harness). Verification
  is: EXPLAIN before/after (timing not worse), visual parity smoke, and
  `bun --cwd apps/web test` staying green.
- Record the before/after EXPLAIN plans in the PR description.

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` passes
- [ ] EXPLAIN ANALYZE shows the rewrite is not slower than baseline (attach plans)
- [ ] Branch stock thumbnails + orders item-counts render identical (smoke)
- [ ] Only the two in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Step 0 shows the columns are indexed and the subplan cost is negligible — the
  rewrite isn't worth MED risk; report for a maintainer decision.
- The `GROUP BY` rewrite is slower than the subquery in EXPLAIN and the LATERAL
  fallback is also not clearly better — report; do not ship a regression.
- The rewritten query returns a different row count or different
  image/count values than the original (parity broken) — STOP.
- Any "Current state" excerpt doesn't match the live SQL (drift).

## Maintenance notes

- Deferred bigger win: a denormalized `order.items_count` column maintained by a
  trigger (matching the `packages/db` trigger pattern) removes the count entirely
  from read queries — but carries eventual-consistency risk on concurrent writes.
  Evaluate only if the join rewrite proves insufficient under load.
- A reviewer should require the EXPLAIN before/after in the PR — this is the only
  evidence the change is a win and not a regression.
- The same `image_url`-per-row pattern may exist in other list queries
  (`orders/data.ts` review overview was flagged) — sweep for it as a follow-up.
