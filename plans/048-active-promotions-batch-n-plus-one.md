# Plan 048: Batch the promotion_tool lookup in getActivePromotions to eliminate the 1+2N query pattern

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 03984800..HEAD -- packages/db/src/queries/catalog.ts`
> If that file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/044-catalog-split.md (if landed, edit `promotions.ts`; if not, edit `catalog.ts` directly — see Step 0)
- **Category**: perf
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

`getActivePromotions` is a **storefront-facing** function (read by the ecommerce
site via the ADR-0009 sync surface). For each non-`applies_to_all` promotion it
issues two sequential round-trips inside a `Promise.all`: one to fetch the list
of `tool_id`s from `promotion_tool`, and one to fetch the full tool records. With
`DEFAULT_PROMO_LIMIT = 4` targeted promotions that is **9 Postgres round-trips**
(1 promo SELECT + 4×2 tool-scope queries) on every storefront homepage load.
Batching the `promotion_tool` lookups into one query collapses the cost to
**1 + 1 + N** (promo SELECT + one `promotion_tool` batch + N tool SELECTs), which
is the minimum achievable without merging tool queries (acceptable tradeoff — tool
SELECTs carry discount-calculation params that are per-promotion). The output
shape and ordering are preserved exactly so the ecommerce integration is
unaffected.

## Current state

### File locations

- `packages/db/src/queries/catalog.ts` — the only file to modify if plan 044
  has **not** landed. Contains `getActivePromotions` (lines 793–879) and
  `getFeaturedPromotion` (lines 885–972). This plan targets `getActivePromotions`
  only; `getFeaturedPromotion` is capped at 1 result (zero fan-out) and is
  explicitly out of scope.
- `packages/db/src/queries/` — if plan 044 has landed, `catalog.ts` will have
  been split and the promotion functions will live in a new `promotions.ts` in the
  same directory. In that case, edit `promotions.ts` instead (same logic applies).
- `packages/db/src/queries/__tests__/` — home for the new test file.

### Key constants and helpers (catalog.ts, verified at planned commit)

```ts
// line 45
const DEFAULT_PROMO_LIMIT = 4;
// line 46
const TOOLS_PER_PROMO = 4;

// line 193-198: how to build a Postgres ARRAY literal safe for ANY()
function arrayLiteral<T>(values: T[], castType: string) {
    return sql`ARRAY[${sql.join(
        values.map((v) => sql`${v}`),
        sql`, `
    )}]::${sql.raw(castType)}`;
}

// line 35
type AnyDb = NodePgDatabase<Record<string, unknown>>;
// line 203
const STOREFRONT_STATUS_SQL = sql`t.status IN ('active','discontinued')`;
// line 42
const APPROVED = "approved" as const;
```

### The N+1 pattern (catalog.ts lines 819–876, verified)

```ts
// lines 819-876 — THE CURRENT PROBLEMATIC PATTERN
const result = await Promise.all(
    promosRes.rows.map(async (promo): Promise<PromotionWithTools> => {
        coerceDates(promo, PROMOTION_DATE_KEYS);

        let toolScope = sql`true`;
        if (!promo.appliesToAll) {
            // QUERY 1 per promo (the one we are batching away):
            const toolIdsRes = await db.execute<{ tool_id: string }>(sql`
                SELECT tool_id FROM promotion_tool WHERE promotion_id = ${promo.id}
            `);
            const toolIds = toolIdsRes.rows.map((r) => r.tool_id);
            if (toolIds.length === 0) {
                return { ...promo, tools: [] };
            }
            toolScope = sql`t.id = ANY(${arrayLiteral(toolIds, "text[]")})`;
        }

        // QUERY 2 per promo (tool fetch — keep this, one per promo is necessary):
        const toolsRes = await db.execute<ToolListRow>(sql`
            SELECT ...
            WHERE ${toolScope}
              AND t.visible_on_site = true
              AND ${STOREFRONT_STATUS_SQL}
            ORDER BY t.created_at DESC
            LIMIT ${TOOLS_PER_PROMO}
        `);

        return { ...promo, tools: toolsRes.rows.map(rowToToolListItem) };
    })
);
```

Total cost today: **1 + 2N** round-trips (minimum 1 promo list + up to 2 per
promo). With `DEFAULT_PROMO_LIMIT = 4` and all targeted = 9 queries.

### Public types (must not change shape)

```ts
// catalog.ts line 133
export type PromotionWithTools = Promotion & {
    tools: ToolListItem[];
};
```

`ToolListItem` (lines 52–71) and `ToolListRow` (lines 210–229) must not change.

### ADR-0009 sync surface constraint

`packages/db/src/queries/` is CI-synced to the ecommerce repo. A file inside
that directory **must not import anything outside** `packages/db/src/queries/` or
`packages/db/src/schema/`. The fix in this plan only adds SQL + Map operations
— no new imports needed.

### Relevant exemplar

The pattern of batching IDs into `ANY(ARRAY[...])` already exists in this file
(see `getCategoryTree`, lines 778–782):

```ts
// catalog.ts lines 778-782
const ancestorsRes = await db.execute<Category>(sql`
    SELECT id, slug, name, path, depth, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM category
    WHERE id = ANY(${arrayLiteral(ancestorIds, "text[]")})
`);
```

Use the same `arrayLiteral(ids, "text[]")` call pattern for the batch.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Type-check | `bun check-types` | exit 0, no errors |
| Lint | `bun check` | exit 0 |
| Tests (db package) | `bun --cwd packages/db test` | exit 0, all pass |
| Tests (web) | `bun --cwd apps/web test` | exit 0, all pass |
| Full verify | `bun verify` | chains check-types + check + test; exit 0 |
| Build (sanity) | `bun run --cwd apps/web build` | exit 0 (no "use server" in scope — skip if slow) |

> Note: `bun verify` chains `check-types && check && test`. The apps/web build is
> not strictly required here (no "use server" file is touched), but run it if you
> want full confidence.

## Scope

**In scope** (the ONLY files you should modify or create):

- `packages/db/src/queries/catalog.ts` — modify `getActivePromotions` (or
  `packages/db/src/queries/promotions.ts` if plan 044 has already landed)
- `packages/db/src/queries/__tests__/catalog-promotions.test.ts` — create (new
  test file)

**Out of scope** (do NOT touch, even if they look related):

- `getFeaturedPromotion` — capped at 1 result, zero query fan-out; no change needed.
- Any file in `apps/web/` — the change is purely in the DB queries package.
- `packages/db/src/schema/` — no schema changes.
- `packages/db/src/queries/__tests__/dashboard-helpers.test.ts` — unrelated.
- Any `actions.ts`, `data.ts`, or other consumer of `getActivePromotions` — the
  function signature and return type do not change.
- The correlated subqueries inside the per-promotion tool SELECT (the `review`,
  `stock_level`, `tool_image`, `tool_variant` subqueries) — those are per-row
  within a single query, already optimally indexed (see rejected plan 008).
- The catalog split itself (plan 044) — this plan executes on the current file
  layout and notes how to adapt.

## Git workflow

- Branch: `advisor/048-active-promotions-batch-n-plus-one`
  ```
  git checkout -b advisor/048-active-promotions-batch-n-plus-one
  ```
- Commit per logical unit; Conventional Commits in Portuguese, subject ≤50 chars.
  Example from repo: `perf(db): elimina queries seriais em getActivePromotions`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Determine which file to edit

Check whether plan 044 has landed:

```bash
ls packages/db/src/queries/promotions.ts 2>/dev/null && echo "044 LANDED" || echo "edit catalog.ts"
```

- If output is `edit catalog.ts` → all edits in this plan target
  `packages/db/src/queries/catalog.ts`.
- If output is `044 LANDED` → all edits target
  `packages/db/src/queries/promotions.ts`. The logic and line-number references
  in steps below describe `catalog.ts`; find the equivalent locations in
  `promotions.ts` by searching for the same function names.

**Verify**: Run the command above and note which file you will edit. Do not
proceed until you know.

---

### Step 1: Read the target file before any edit

Open the target file (`catalog.ts` or `promotions.ts`) with your Read tool. Do
not edit from memory. Confirm:

1. `getActivePromotions` still matches the excerpt in "Current state" (the
   `Promise.all` with the per-promo `promotion_tool` SELECT inside).
2. `arrayLiteral` function is present and accessible from the same file.
3. `coerceDates`, `PROMOTION_DATE_KEYS`, `rowToToolListItem`, `ToolListRow`,
   `TOOLS_PER_PROMO`, and `STOREFRONT_STATUS_SQL` are all in scope.

**Verify**: Confirm all six symbols are visible in the file. If any is missing,
STOP — the file has diverged beyond what this plan anticipated.

---

### Step 2: Replace the `getActivePromotions` body with the batched version

Replace the body of `getActivePromotions` (everything inside the function braces,
keeping the signature identical) with the batched implementation below.

**Target signature (must not change):**
```ts
export async function getActivePromotions(
    db: AnyDb,
    limit: number = DEFAULT_PROMO_LIMIT
): Promise<PromotionWithTools[]>
```

**New body:**

```ts
    const promosRes = await db.execute<Promotion>(sql`
        SELECT id, title, description, type, code,
               discount_type AS "discountType",
               discount_value AS "discountValue",
               applies_to_all AS "appliesToAll",
               max_redemptions AS "maxRedemptions",
               redemption_count AS "redemptionCount",
               min_order_amount AS "minOrderAmount",
               active,
               starts_at AS "startsAt",
               ends_at AS "endsAt",
               created_at AS "createdAt",
               updated_at AS "updatedAt"
        FROM promotion
        WHERE type = 'promotion'
          AND active = true
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at > now())
        ORDER BY created_at DESC
        LIMIT ${limit}
    `);

    const promos = promosRes.rows;
    for (const promo of promos) {
        coerceDates(promo, PROMOTION_DATE_KEYS);
    }

    // Batch-fetch all promotion_tool rows in ONE query instead of N.
    // Promotions with applies_to_all = true need no lookup.
    const targetedPromoIds = promos
        .filter((p) => !p.appliesToAll)
        .map((p) => p.id);

    // Map<promotionId, toolId[]> — empty array means "no linked tools" (promo is inert).
    const toolIdMap = new Map<string, string[]>();
    if (targetedPromoIds.length > 0) {
        const ptRes = await db.execute<{ promotion_id: string; tool_id: string }>(sql`
            SELECT promotion_id, tool_id
            FROM promotion_tool
            WHERE promotion_id = ANY(${arrayLiteral(targetedPromoIds, "text[]")})
        `);
        for (const row of ptRes.rows) {
            const existing = toolIdMap.get(row.promotion_id);
            if (existing) {
                existing.push(row.tool_id);
            } else {
                toolIdMap.set(row.promotion_id, [row.tool_id]);
            }
        }
    }

    // Now fetch tools per promotion (N queries — necessary because each carries
    // its own discount params). Cost is now 1 + 1 + N, not 1 + 2N.
    const result = await Promise.all(
        promos.map(async (promo): Promise<PromotionWithTools> => {
            let toolScope = sql`true`;
            if (!promo.appliesToAll) {
                const toolIds = toolIdMap.get(promo.id) ?? [];
                if (toolIds.length === 0) {
                    return { ...promo, tools: [] };
                }
                toolScope = sql`t.id = ANY(${arrayLiteral(toolIds, "text[]")})`;
            }

            const toolsRes = await db.execute<ToolListRow>(sql`
                SELECT
                    t.id, t.slug, t.name, t.status,
                    dv.id AS variant_id,
                    dv.sku AS variant_sku,
                    dv.voltage AS variant_voltage,
                    dv.price_amount::text AS variant_price,
                    CASE
                        WHEN ${promo.discountType}::text = 'fixed'
                            THEN GREATEST(dv.price_amount - ${promo.discountValue}::numeric, 0)::text
                        ELSE ROUND(dv.price_amount * (1 - ${promo.discountValue}::numeric / 100), 2)::text
                    END AS discounted_amount,
                    ${promo.id}::text AS active_promotion_id,
                    (SELECT COUNT(*) > 1 FROM tool_variant tv2 WHERE tv2.tool_id = t.id) AS has_other_variants,
                    (SELECT url FROM tool_image WHERE tool_id = t.id ORDER BY sort_order ASC LIMIT 1) AS primary_image_url,
                    COALESCE((
                        SELECT SUM(sl.quantity) > 0
                        FROM stock_level sl
                        JOIN tool_variant tv ON tv.id = sl.variant_id
                        WHERE tv.tool_id = t.id
                    ), false) AS in_stock,
                    (SELECT AVG(r.rating)::numeric(3,2)::text FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS avg_rating,
                    (SELECT COUNT(*)::int FROM review r WHERE r.tool_id = t.id AND r.status = ${APPROVED}) AS review_count,
                    pc.id AS cat_id,
                    pc.slug AS cat_slug,
                    pc.name AS cat_name
                FROM tool t
                INNER JOIN tool_variant dv ON dv.tool_id = t.id AND dv.is_default = true
                LEFT JOIN tool_category tc ON tc.tool_id = t.id AND tc.is_primary = true
                LEFT JOIN category pc ON pc.id = tc.category_id
                WHERE ${toolScope}
                  AND t.visible_on_site = true
                  AND ${STOREFRONT_STATUS_SQL}
                ORDER BY t.created_at DESC
                LIMIT ${TOOLS_PER_PROMO}
            `);

            return { ...promo, tools: toolsRes.rows.map(rowToToolListItem) };
        })
    );

    return result;
```

**Important implementation notes:**

1. The `coerceDates` loop is now a plain `for...of` (not inside the `Promise.all`
   map) because dates must be coerced before reading `promo.appliesToAll` in the
   filter. This is equivalent — the previous code coerced inside the map before
   using `promo.appliesToAll`.

2. The `Map` is populated with a `for...of` loop (not `.forEach` — repo
   anti-pattern). The order of tool IDs within a promotion is the natural DB
   order, which is consistent with the old code.

3. The tool SELECT body is **identical** to the original (same columns, same
   WHERE predicates, same ORDER BY, same LIMIT). Copy it exactly from the current
   file to avoid drift. Re-Read the file before copying if you are unsure.

4. `getFeaturedPromotion` (lines 885–972 in the original `catalog.ts`) is
   **not changed**. It issues a single `promotion_tool` lookup for at most one
   promo and has no fan-out.

**Verify**: After the edit, run:
```bash
bun check-types
```
Expected: exit 0, no type errors.

---

### Step 3: Write the test file

Create `packages/db/src/queries/__tests__/catalog-promotions.test.ts` with unit
tests for `getActivePromotions`. The test must mock `db.execute` — no real
Postgres connection.

Use `packages/db/src/queries/__tests__/dashboard-helpers.test.ts` as the
structural template for a pure-function test with no mocking. However, because
`getActivePromotions` calls `db.execute`, you need to pass a stub `db` object
(duck-typed `AnyDb`) with a mocked `execute` method.

**Test cases to cover:**

1. **All `applies_to_all = true`**: zero calls to `promotion_tool`; each promo
   returns tools from the tool SELECT.
2. **All targeted (none `applies_to_all`)**: exactly ONE `promotion_tool` batch
   query is issued (verify the mock is called once for it, not N times).
3. **Mixed**: 2 promos (1 `applies_to_all`, 1 targeted); still only 1
   `promotion_tool` query (for the targeted one only).
4. **Targeted promo with no rows in `promotion_tool`**: returns `{ ...promo, tools: [] }` without issuing a tool SELECT.
5. **`limit = 0`** (edge case): returns empty array; no `promotion_tool` or tool
   queries issued.

**Suggested structure:**

```ts
import { describe, expect, it, vi } from "vitest";

// We cannot import the function directly because it imports from drizzle-orm
// and the db package triggers env validation. Instead, test the logic by
// importing the compiled module with a mock execute:
//
// Option A (preferred if env is available in CI): import directly.
// Option B: extract the batch helper into a separate testable pure function.
//
// For this plan, use Option A — the CI already provides dummy env vars
// (see apps/web/CLAUDE.md §Testes and the ci.yml env block).

import { getActivePromotions } from "../catalog"; // or "../promotions" if 044 landed

function makeDb(responses: unknown[][]): { execute: ReturnType<typeof vi.fn> } {
    let call = 0;
    const execute = vi.fn().mockImplementation(() => {
        const rows = responses[call] ?? [];
        call++;
        return Promise.resolve({ rows });
    });
    return { execute } as unknown as Parameters<typeof getActivePromotions>[0];
}

describe("getActivePromotions", () => {
    it("zero promos → returns []", async () => {
        const db = makeDb([[]]); // promo SELECT returns empty
        expect(await getActivePromotions(db as any, 4)).toEqual([]);
        expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it("applies_to_all promos → no promotion_tool query", async () => {
        const promo = {
            id: "p1", title: "All", description: null, type: "promotion", code: null,
            discountType: "percent", discountValue: "10", appliesToAll: true,
            maxRedemptions: null, redemptionCount: 0, minOrderAmount: null,
            active: true, startsAt: null, endsAt: null,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        const db = makeDb(
            [[promo],   // promo SELECT
             /* NO promotion_tool call */
             []         // tool SELECT (empty tools)
            ]
        );
        const result = await getActivePromotions(db as any, 4);
        expect(result).toHaveLength(1);
        expect(result[0]?.tools).toEqual([]);
        // Only 2 queries: promo SELECT + 1 tool SELECT (no promotion_tool batch)
        expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it("targeted promos → exactly ONE promotion_tool batch query", async () => {
        const makePromo = (id: string) => ({
            id, title: id, description: null, type: "promotion", code: null,
            discountType: "percent", discountValue: "5", appliesToAll: false,
            maxRedemptions: null, redemptionCount: 0, minOrderAmount: null,
            active: true, startsAt: null, endsAt: null,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        const db = makeDb([
            [makePromo("p1"), makePromo("p2")],    // promo SELECT
            [{ promotion_id: "p1", tool_id: "t1" },
             { promotion_id: "p2", tool_id: "t2" }], // ONE promotion_tool batch
            [],  // tool SELECT for p1
            [],  // tool SELECT for p2
        ]);
        const result = await getActivePromotions(db as any, 4);
        expect(result).toHaveLength(2);
        // 1 promo SELECT + 1 promotion_tool batch + 2 tool SELECTs = 4 total
        expect(db.execute).toHaveBeenCalledTimes(4);
    });

    it("targeted promo with no promotion_tool rows → tools: []", async () => {
        const promo = {
            id: "p1", title: "Empty", description: null, type: "promotion", code: null,
            discountType: "fixed", discountValue: "20", appliesToAll: false,
            maxRedemptions: null, redemptionCount: 0, minOrderAmount: null,
            active: true, startsAt: null, endsAt: null,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        const db = makeDb([
            [promo],    // promo SELECT
            [],         // promotion_tool batch returns empty
            // No tool SELECT issued (early return with tools: [])
        ]);
        const result = await getActivePromotions(db as any, 4);
        expect(result).toHaveLength(1);
        expect(result[0]?.tools).toEqual([]);
        // 1 promo SELECT + 1 promotion_tool batch = 2; no tool SELECT
        expect(db.execute).toHaveBeenCalledTimes(2);
    });
});
```

> **Note on the mock shape**: `makeDb` returns an object with only `execute`.
> Cast it with `as any` when calling `getActivePromotions` — the full `AnyDb`
> type includes many Drizzle methods we don't exercise here. This is acceptable
> in tests.

> **If the test file cannot import `getActivePromotions` because `@emach/env`
> validation fails** (missing env vars in your shell): add the minimum dummy env
> vars before running — the same ones used in CI. Check `packages/env/src/server.ts`
> for the required keys and provide dummy values. Do not commit env values.

**Verify**: Run:
```bash
bun --cwd packages/db test
```
Expected: exit 0; the new `catalog-promotions.test.ts` tests pass; no existing
tests regress.

---

### Step 4: Run the full verify gate

```bash
bun verify
```

Expected: exit 0, all three gates pass (check-types, check/lint, test).

If lint fails with a `noForEach` or similar: ensure the `promotion_tool` row
population loop uses `for...of` (as shown in Step 2), not `.forEach`.

If `check` fails on an unused variable: the `toolIdMap` is populated then read
in the `Promise.all`; if the linter complains about the empty `if (targetedPromoIds.length > 0)` guard variable check your placement — the Map is declared outside the `if` block
and used outside it.

**Verify**: `bun verify` → exit 0.

---

### Step 5: Commit

```bash
git add packages/db/src/queries/catalog.ts \
        packages/db/src/queries/__tests__/catalog-promotions.test.ts
git commit -m "perf(db): batch promotion_tool lookup em getActivePromotions"
```

(If you edited `promotions.ts` instead of `catalog.ts`, adjust the path above.)

**Verify**:
```bash
git log --oneline -1
```
Expected: shows the commit above as HEAD.

---

## Test plan

New test file: `packages/db/src/queries/__tests__/catalog-promotions.test.ts`

Cases (listed in Step 3):

| # | Case | What it proves |
|---|------|---------------|
| 1 | Zero promos | Empty input → empty output; only 1 query |
| 2 | All `applies_to_all` | No `promotion_tool` query at all (count = promo+tools only) |
| 3 | All targeted, 2 promos | Exactly 1 `promotion_tool` batch (not 2) |
| 4 | Targeted, no rows | Early return `tools: []`; no tool SELECT |

Structural pattern: `packages/db/src/queries/__tests__/dashboard-helpers.test.ts`
(pure vitest, no network, no DB connection) adapted to use a stub `db.execute`.

Run: `bun --cwd packages/db test` → all pass, including 4 new tests.

## Done criteria

All must hold before marking this plan DONE:

- [ ] `bun check-types` exits 0 with no new errors
- [ ] `bun check` exits 0 with no new lint errors
- [ ] `bun --cwd packages/db test` exits 0; `catalog-promotions.test.ts` exists
      and contains ≥4 tests all passing
- [ ] `bun --cwd apps/web test` exits 0 (no regression in web tests)
- [ ] The `promotion_tool` SELECT inside `getActivePromotions` is no longer inside
      the `Promise.all` map:
      ```bash
      grep -n "promotion_tool" packages/db/src/queries/catalog.ts
      ```
      Expected: the `promotion_tool` reference appears **above** the `Promise.all`
      block (in the batch query), not inside it.
- [ ] `getFeaturedPromotion` is unchanged (no accidental edit):
      ```bash
      git diff HEAD -- packages/db/src/queries/catalog.ts | grep "^[+-]" | grep -i "getFeaturedPromotion" | head -5
      ```
      Expected: no lines added or removed touching `getFeaturedPromotion` itself.
- [ ] No files outside the in-scope list are modified:
      ```bash
      git status --short
      ```
      Expected: only `packages/db/src/queries/catalog.ts` (or `promotions.ts`)
      and `packages/db/src/queries/__tests__/catalog-promotions.test.ts` appear.
- [ ] `plans/README.md` status row updated to DONE for plan 048.

## STOP conditions

Stop and report back (do not improvise) if:

- The `getActivePromotions` function body in the live file does not match the
  excerpt in "Current state" — for example, if the per-promo `promotion_tool`
  SELECT is already gone (meaning a similar optimization landed independently).
- `ls packages/db/src/queries/promotions.ts` returns a file that exists but does
  NOT contain `getActivePromotions` — it may have been split differently than
  anticipated by plan 044.
- `bun check-types` fails after Step 2 with a type error not caused by the edit
  itself (indicates underlying drift in the codebase).
- The test file cannot import `getActivePromotions` even after providing dummy
  env vars — indicates a module graph issue that needs investigation.
- Any in-scope edit requires touching a file in `apps/web/` or
  `packages/db/src/schema/`.
- The fix appears to require changing the public return type `PromotionWithTools`
  or the `ToolListItem` shape.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

**If `DEFAULT_PROMO_LIMIT` grows significantly** (e.g. >10): the batch fetch
already scales linearly and `ANY(ARRAY[...])` with 10 IDs remains efficient. No
change needed for reasonable limits.

**If a UNION ALL approach is later desired** (collapsing N tool SELECTs into 1):
that is a follow-up optimization. It requires either (a) injecting the
discount-calculation CASE per promotion via a lateral subquery, or (b) building
dynamic SQL with N CONCATs — both are higher complexity and higher risk. The
current N-tool-selects-in-`Promise.all` is correct and significantly faster than
the old 1+2N pattern. Defer unless profiling reveals it as a bottleneck.

**If plan 044 lands after this plan**: the merge will need to reconcile the
`getActivePromotions` body. If 044 moves the function to `promotions.ts` via a
copy and this plan's change was made to `catalog.ts`, the executor of 044 must
apply the batched body to `promotions.ts` instead of the original N+1 body.
Add a note to plan 044 to check whether 048 landed first.

**Review checklist for the PR**:

- Confirm `promotion_tool` SELECT appears exactly once, outside the
  `Promise.all`, with `WHERE promotion_id = ANY(...)`.
- Confirm the `for...of` loop builds the `Map` correctly (check empty-array
  initialization on the `else` branch).
- Confirm `getFeaturedPromotion` is byte-for-byte identical to before.
- Confirm test case 3 asserts `execute` was called exactly 4 times (1+1+2), not
  the old 5 (1+2×2).
