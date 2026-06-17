# Plan 006 — Rollout Notes (spike result)

> Executor: agent-ab78e2b762bc8bbe5 · 2026-06-17 · revisado pelo tech-lead (advisor)

## Rollout decision

**STATUS: STOPPED — flag reverted. Migration is larger than a pilot.**

### (a) Enabling the flag was NOT clean

`cacheComponents: true` fails the build immediately with **21 errors** across 20 route files.
Next 16 / Turbopack rejects `export const dynamic = "force-dynamic"` and `export const runtime`
as incompatible with `cacheComponents`. Every one of the 19 existing `force-dynamic` pages
(plus the cron route) must be converted before the flag can be committed to a passing build.

The plan's STOP condition was "more than ~2 routes need work" — 20 is well beyond that.

### Affected files (all must be migrated before enabling the flag)

| Route file | Segment config |
|---|---|
| `app/api/cron/cancel-stale-orders/route.ts` | `dynamic = "force-dynamic"` + `runtime = "nodejs"` |
| `app/convite/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/branches/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/categories/[id]/edit/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/categories/[id]/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/categories/new/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/categories/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/customers/[id]/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/customers/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/orders/[id]/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/orders/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/promotions/[id]/edit/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/promotions/[id]/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/promotions/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/reviews/[id]/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/reviews/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/site/settings/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/stock/movements/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/suppliers/page.tsx` | `dynamic = "force-dynamic"` |
| `app/dashboard/users/page.tsx` | `dynamic = "force-dynamic"` |

### Root cause of the `force-dynamic` usage

Every `force-dynamic` page calls `requireCapability()` / `requireCurrentSession()` which read
cookies at request time. Under `cacheComponents`, these runtime API calls are perfectly valid
(they just cannot be inside a `use cache` boundary) — the `force-dynamic` export itself is the
problem, not the pattern. With `cacheComponents` enabled, `force-dynamic` is replaced by the
framework's default (dynamic by default; static shell + Suspense for dynamic sections).

So the migration for each page is:
1. **Remove** `export const dynamic = "force-dynamic"` (the flag itself)
2. **Remove** `export const runtime = "nodejs"` on the cron route — it must move to an App
   Router Route Handler without the `runtime` segment config, or use `dynamic = "force-dynamic"`
   replaced by `connection()` from `next/server`
3. Verify the page still serves correctly (the runtime-dynamic behavior is preserved by the
   framework's default when `cacheComponents` is on — pages with any uncached dynamic call
   are automatically server-rendered per-request)
4. Optionally split cacheable reference data (e.g. `getActiveSuppliers()`) into a `use cache`
   sub-component; wrap dynamic sections in `<Suspense>` for streaming

The cron route's `runtime = "nodejs"` is the only case that needs special handling beyond
removing `force-dynamic` — the route uses raw SQL and Drizzle, which require Node.js. Verify
whether Turbopack infers Node.js runtime automatically (likely yes for route handlers using pg)
or whether `connection()` from `next/server` is needed to opt out of static inference.

> **Tech-lead caveat (a verificar no 006-A):** a afirmação "remover `force-dynamic` não muda
> comportamento" vem da skill `next-cache-components` e é plausível (cookie-read → dynamic
> inferido), mas é load-bearing. O gate do 006-A (`build` com `cacheComponents: true` + smoke
> das rotas auth-gated) é o que prova. Tratar o cron `runtime` como o caso de maior risco.

### (b) Warm-read vs cold-read measurement

Deferred — the flag never reached a passing build. Not measurable at this time.

### (c) Ordered rollout plan for a follow-up plan

**Pre-condition for ALL domains:** complete the `force-dynamic` removal pass first (one
dedicated plan, mechanical, low-risk, ~20 files). Once that plan lands and build passes with
`cacheComponents: true`, each domain below can be cached independently.

| Order | Domain | Fetcher(s) to cache | Tag name | Mutations that must call `revalidateTag` |
|---|---|---|---|---|
| 1 | **Suppliers** (stable ref data, low churn) | `getActiveSuppliers()` in `src/lib/suppliers.ts` | `"suppliers"` | `createSupplier`, `updateSupplier`, `setSupplierStatus` (archive/restore) in `suppliers/actions.ts` |
| 2 | **Categories** (tree, rarely changes) | category tree fetcher (used in tool forms + category page) | `"categories"` | create/update/delete category actions in `categories/actions.ts` |
| 3 | **Tool options** (dropdowns: tools, variants) | tool option fetchers used in stock, promotions, orders | `"tools"` | `createTool`, `updateTool`, `archiveTool` in `tools/actions.ts` |
| 4 | **Branches** (ref data, very low churn) | `getBranches()` / branch list fetcher | `"branches"` | `createBranch`, `updateBranch` in `branches/actions.ts` |
| 5 | **Site banners** (moderate churn, public) | banner list fetcher in `site/settings` or similar | `"site-banners"` | create/update/delete banner actions |
| 6 | **Orders** (high churn — cache only aggregates/KPIs, not the list) | dashboard counts, KPI aggregates | `"orders-kpi"` | any order status transition action |
| 7 | **Customers** (read-heavy list) | customer list/search fetcher | `"customers"` | update customer actions |

**For each domain, the mandatory invariant (from CLAUDE.md):**
> Never tag a fetcher without wiring `revalidateTag` in ALL its mutations — stale data is
> worse than uncached.

### Recommended next plan

**Plan 006-A: Remove `force-dynamic` from all 20 routes**

- Mechanical: delete the `export const dynamic = "force-dynamic"` line from each file
- Special case: cron route `cancel-stale-orders` — remove `dynamic` + `runtime`; verify
  Node.js runtime is inferred or use `connection()` from `next/server` to defer to request time
- Gate: `bun check-types` + `cd apps/web && bun run build` with `cacheComponents: true`
- Effort: S (one-liner per file, ~20 files) — can be done by a single implementer in one pass
- Risk: LOW — removing `force-dynamic` under `cacheComponents` does not change behavior for
  pages that call runtime APIs (they remain server-rendered per request)

Once 006-A lands, re-run Plan 006 (suppliers pilot) — it should complete in minutes.
