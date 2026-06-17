# Plan 006: Habilitar Next 16 Cache Components e cachear dados estáveis (spike + piloto)

> **Executor instructions**: This is a **spike/pilot** plan, not a mechanical
> change. Follow it, but its deliverable is a *working pilot on one domain plus a
> written rollout decision* — not a blind app-wide migration. Run every
> verification. On any "STOP conditions" item, stop and report. When done, update
> this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- apps/web/next.config.ts apps/web/src/lib/suppliers.ts apps/web/src/app/dashboard/suppliers/actions.ts`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P2
- **Effort**: L (flag migration + invalidation contract; pilot is the deliverable)
- **Risk**: MED (enabling Cache Components changes caching semantics app-wide)
- **Depends on**: 007 (do the safe request-dedup first), 002 (analyzer for measuring)
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

Today the dashboard caches **nothing across requests**: 19 pages export
`dynamic = "force-dynamic"`, there are **zero `use cache` directives**, and the
six existing `revalidateTag(...)` calls are **no-ops** because no `cacheTag(...)`
exists to invalidate. Every navigation re-queries Postgres from scratch, even for
data that almost never changes (categories, branches, suppliers, tool-name
options). The big win is real cross-request caching of stable reference data —
but in Next 16 that requires enabling **Cache Components** (the `use cache`
directive), which changes caching semantics for the whole app and must be done
with care, measured, and rolled out per-domain. This plan enables the flag,
proves it on **one low-churn domain (suppliers)** end-to-end (cache + tag +
invalidation), and produces a written rollout decision for the rest — instead of
flipping a global flag blindly.

## Current state

- `apps/web/next.config.ts` does **not** enable Cache Components (no
  `cacheComponents`/`dynamicIO` key). `use cache` is therefore unavailable today.
- `apps/web/CLAUDE.md` §"Cache (Next 16)" documents the intended pattern:
  "`cacheTag` por feature (`'orders'`, `'customers'`, `'site-banners'`...).
  `revalidateTag` em mutations. Ver skill `next-cache-components`." — the
  convention exists on paper; the machinery is not enabled.
- Example of a stable reference fetcher with no caching —
  `apps/web/src/lib/suppliers.ts`:

```ts
import "server-only";
import { db } from "@emach/db";
import { supplier } from "@emach/db/schema/tools";
import { asc, eq } from "drizzle-orm";

export async function getActiveSuppliers(): Promise<ActiveSupplierOption[]> {
	return await db
		.select({ id: supplier.id, name: supplier.name })
		.from(supplier)
		.where(eq(supplier.status, "active"))
		.orderBy(asc(supplier.name));
}
```

  Called on three hot screens (tool detail stock tab, branch detail stock tab,
  stock movements page).
- Supplier mutations already call `revalidatePath(SUPPLIERS_PATH)` (in
  `apps/web/src/app/dashboard/suppliers/actions.ts`) — so an invalidation point
  exists; it needs a `revalidateTag("suppliers")` counterpart once the fetcher is
  tagged.
- The six current no-op tags live in mutation actions (e.g.
  `banners/actions.ts` calls `revalidateTag("site-banners")` with no
  `cacheTag("site-banners")` anywhere).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Build | `bun --cwd apps/web run build` | succeeds with Cache Components enabled |
| Dev | `bun dev:web` | app boots; cached fetcher serves warm |
| Errors | `nextjs_call <port> get_errors` (MCP next-devtools) | no cache-related runtime errors |

## Suggested executor toolkit

- **Invoke the `next-cache-components` skill** before starting — it covers `use
  cache`, `cacheLife`, `cacheTag`, `updateTag`, PPR, and the `cacheComponents`
  flag for Next 16. This plan assumes you follow that skill's current guidance
  for exact syntax (do not rely on memory — the API is new).
- `next-best-practices` skill for the RSC/dynamic boundary rules.

## Scope

**In scope (pilot)**:
- `apps/web/next.config.ts` — enable Cache Components per the skill.
- `apps/web/src/lib/suppliers.ts` — add `use cache` + `cacheTag("suppliers")` to
  `getActiveSuppliers`.
- `apps/web/src/app/dashboard/suppliers/actions.ts` — add
  `revalidateTag("suppliers")` alongside existing `revalidatePath` in
  create/update/delete supplier actions.
- A short written rollout note appended to `plans/006-cache-components-spike.md`
  (a "## Rollout decision" section) **or** a new `plans/006-rollout-notes.md`.

**Out of scope (this plan)**:
- Do NOT tag/cache every fetcher in the app in this plan. The rollout list
  (categories, branches, tool options, orders, customers, banners) is produced as
  a *decision document*, executed in follow-up plans only after the pilot proves
  out.
- Do NOT remove `force-dynamic` from pages in this plan — enabling Cache
  Components interacts with route config; decide that per-route in the rollout,
  not blanket here.
- Do NOT change `revalidatePath` calls to `revalidateTag` anywhere except the
  supplier pilot.

## Git workflow

- Branch: `advisor/006-cache-components-spike`
- Commit (conventional commits, PT): `perf: habilita Cache Components (piloto suppliers)`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Read the skill and confirm the flag

Invoke `next-cache-components`. Identify the exact `next.config.ts` key to enable
Cache Components in Next 16 (`cacheComponents: true` under the appropriate
config section, per the skill's current guidance). Note any prerequisites the
skill lists (e.g. all uncached dynamic data must be inside `<Suspense>` or marked
dynamic).

**Verify**: you can state, from the skill, the exact flag and its preconditions.
If the skill says enabling it requires changes this plan doesn't scope (e.g.
every page needs a Suspense boundary), STOP and report — that expands the spike.

### Step 2: Enable the flag and confirm a clean build

Add the flag to `apps/web/next.config.ts` (keep all existing keys —
`optimizePackageImports` from plan 002, `reactCompiler`, etc.). Run a full build.

**Verify**: `bun --cwd apps/web run build` succeeds. If it fails with errors about
uncached/dynamic data on specific routes, record which routes — do NOT fix them
all; if more than ~2 routes need Suspense wrapping to build, STOP and report (the
migration is larger than a pilot and needs its own plan; revert the flag).

### Step 3: Cache the supplier fetcher

In `apps/web/src/lib/suppliers.ts`, add the `use cache` directive and
`cacheTag("suppliers")` to `getActiveSuppliers` per the skill's syntax. Keep the
query identical.

**Verify**: `bun check-types` → exit 0; `bun --cwd apps/web run build` → succeeds.

### Step 4: Wire invalidation in supplier mutations

In `apps/web/src/app/dashboard/suppliers/actions.ts`, add
`revalidateTag("suppliers")` next to each existing `revalidatePath(SUPPLIERS_PATH)`
in the create/update/delete/status actions. Do not remove the `revalidatePath`
calls (keep them as belt-and-suspenders for the list page until rollout).

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0.

### Step 5: Prove the cache + invalidation end-to-end

`bun dev:web`. Then:
1. Open `/dashboard/stock/movements` (uses `getActiveSuppliers`) — note the
   supplier list in the entry form.
2. Reload — confirm the page serves warm (the supplier query should not re-run;
   verify via server logs or query timing).
3. Create or rename a supplier in `/dashboard/suppliers`, then revisit the stock
   movements page — the new/renamed supplier appears (invalidation worked).

**Verify**: warm reads serve from cache; a supplier mutation makes the change
visible on the consuming page (tag invalidation works). If the change is NOT
visible after mutation, the tag wiring is wrong — fix before proceeding.

### Step 6: Write the rollout decision

Append a "## Rollout decision" section to this plan file (or
`plans/006-rollout-notes.md`) recording: (a) whether enabling the flag was clean
or required per-route Suspense work, (b) the measured warm-vs-cold difference,
(c) the ordered list of next domains to cache (suggest: categories → tool options
→ branches → banners → orders), each with its tag name and the mutations that must
call `revalidateTag`. This becomes the input for follow-up plans.

**Verify**: the decision section exists and names concrete tags + invalidation
sites per domain.

## Test plan

- No unit tests for caching (it's framework behavior). Verification is the build
  (Step 2), the warm-read + invalidation smoke (Step 5), and `bun --cwd apps/web
  test` staying green.

## Done criteria

ALL must hold:

- [ ] `next-cache-components` skill consulted; flag + preconditions known
- [ ] `bun --cwd apps/web run build` succeeds with Cache Components enabled
- [ ] `getActiveSuppliers` is cached with `cacheTag("suppliers")`
- [ ] Supplier mutations call `revalidateTag("suppliers")`
- [ ] Smoke proves warm read + invalidation on supplier change
- [ ] Rollout decision section written
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Enabling the flag breaks the build on more than ~2 routes (the migration is
  bigger than a pilot — revert and report which routes need Suspense).
- The skill's current Cache Components API differs materially from the
  `use cache`/`cacheTag` shape assumed here — follow the skill, and if that
  changes the scope, report.
- Tag invalidation does not make a supplier change visible after mutation —
  report the wiring problem rather than papering over with `revalidatePath`.
- Any excerpt in "Current state" doesn't match the live code (drift).

## Maintenance notes

- This pilot is the template for caching every stable reference domain. Each
  follow-up domain plan should: tag its fetcher, wire `revalidateTag` in ALL its
  mutations, and smoke the invalidation — never tag without wiring invalidation
  (stale data is worse than uncached).
- Once a domain is cached, its pages' `force-dynamic` can often be removed —
  decide per route, verify the page still shows fresh data after mutation.
- A reviewer must scrutinize invalidation completeness: a missed
  `revalidateTag` site = users see stale data. List every mutation per domain.
