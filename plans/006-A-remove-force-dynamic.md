# Plan 006-A: Remover `force-dynamic`/`runtime` e habilitar Cache Components (fundação)

> **Executor instructions**: Follow step by step; run every verification before
> moving on. On any "STOP conditions" item, stop and report. This is the
> PREREQUISITE foundation for the suppliers cache pilot (Plan 006) — its
> deliverable is a **passing build with `cacheComponents: true`** and every
> dashboard route still rendering per-request. It adds **no caching yet**
> (`use cache` is Plan 006). SKIP updating `plans/README.md` — the reviewer
> maintains it.
>
> **Run ALL commands from the repo root** (`/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard`) — the grep paths below are relative and return a false "0" from anywhere else (monorepo CWD gotcha).
>
> **Drift check (run first)**: `grep -rln 'export const dynamic = "force-dynamic"' apps/web/src/app | wc -l` must be **20**, and `grep -rln "export const runtime" apps/web/src/app` must be exactly `apps/web/src/app/api/cron/cancel-stale-orders/route.ts`. On a mismatch with the list below, STOP and report.

## Status

- **Priority**: P2
- **Effort**: S–M (mechanical removal of 21 config lines; the risk is whether the build then demands Suspense boundaries)
- **Risk**: MED — enabling `cacheComponents: true` changes rendering semantics app-wide; the build may surface a *second* class of errors (top-level `await cookies()` needing `<Suspense>`) that the 006 spike did NOT test (it reverted after the 21 config errors).
- **Depends on**: none (unblocks Plan 006 — suppliers pilot)
- **Category**: perf / migration
- **Planned at**: commit `db5d1c23` (main, pós-merge #216), 2026-06-17

## Why this matters

The 006 spike proved `cacheComponents: true` cannot be enabled today: the build
fails with **21 errors** — 20 routes export `dynamic = "force-dynamic"` and 1 cron
route also exports `runtime = "nodejs"`, both incompatible with `cacheComponents`.
Per the `next-cache-components` skill, the official migration for
`dynamic = "force-dynamic"` is simply **Remove (default behavior)** — under
`cacheComponents`, a route that reads `cookies()`/session at request time
(`requireCapability`/`requireCurrentSession`) is automatically rendered
dynamically, so removing the flag is behavior-preserving. This plan removes the 21
config lines and enables the flag, establishing the foundation on which Plan 006
(and the per-domain rollout in `plans/006-rollout-notes.md`) can add `use cache`.

## Current state (verified at db5d1c23)

20 files export `dynamic = "force-dynamic"`:

```
apps/web/src/app/api/cron/cancel-stale-orders/route.ts   (+ export const runtime = "nodejs")
apps/web/src/app/convite/page.tsx
apps/web/src/app/dashboard/branches/page.tsx
apps/web/src/app/dashboard/categories/[id]/edit/page.tsx
apps/web/src/app/dashboard/categories/[id]/page.tsx
apps/web/src/app/dashboard/categories/new/page.tsx
apps/web/src/app/dashboard/categories/page.tsx
apps/web/src/app/dashboard/customers/[id]/page.tsx
apps/web/src/app/dashboard/customers/page.tsx
apps/web/src/app/dashboard/orders/[id]/page.tsx
apps/web/src/app/dashboard/orders/page.tsx
apps/web/src/app/dashboard/promotions/[id]/edit/page.tsx
apps/web/src/app/dashboard/promotions/[id]/page.tsx
apps/web/src/app/dashboard/promotions/page.tsx
apps/web/src/app/dashboard/reviews/[id]/page.tsx
apps/web/src/app/dashboard/reviews/page.tsx
apps/web/src/app/dashboard/site/settings/page.tsx
apps/web/src/app/dashboard/stock/movements/page.tsx
apps/web/src/app/dashboard/suppliers/page.tsx
apps/web/src/app/dashboard/users/page.tsx
```

- `apps/web/next.config.ts` does NOT have `cacheComponents` (has `optimizePackageImports`, `reactCompiler`, bundle-analyzer wrapper from earlier waves).
- The cron route uses raw SQL + Drizzle (needs Node.js); the skill confirms Node.js is the ONLY supported runtime under `cacheComponents` (edge unsupported), so the explicit `runtime = "nodejs"` export is redundant once the flag is on.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Drift | `grep -rln 'export const dynamic = "force-dynamic"' apps/web/src/app \| wc -l` | `20` |
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` (+ `npx ultracite check` on touched files) | exit 0 |
| Build (THE gate) | `bun --cwd apps/web run build` | succeeds with `cacheComponents: true` |
| Dev smoke | `bun dev:web` → dashboard routes (port 3001) | every route renders per-request, no cache/runtime errors |

## Suggested executor toolkit

- **Invoke the `next-cache-components` skill** before Step 3 — confirm the current
  flag name (`cacheComponents: true`) and the migration guidance for
  `force-dynamic` and `runtime`. Use `connection()` from `next/server` only if the
  cron route needs an explicit request-time opt-out.

## Scope

**In scope**:
- The 20 route files above — remove `export const dynamic = "force-dynamic"`.
- `apps/web/src/app/api/cron/cancel-stale-orders/route.ts` — ALSO remove
  `export const runtime = "nodejs"` (see Step 2 for the special handling).
- `apps/web/next.config.ts` — add `cacheComponents: true` (keep ALL existing keys).

**Out of scope (do NOT do here)**:
- Do NOT add any `use cache` / `cacheTag` / `revalidateTag` anywhere. Caching is
  Plan 006 (suppliers pilot) and the per-domain rollout — this plan only lays the
  foundation and proves the build.
- Do NOT add `<Suspense>` boundaries unless the build explicitly requires them to
  pass — and if MORE than ~3 routes need them, STOP (see STOP conditions; that is
  a separate plan, 006-B).
- Do NOT touch `revalidatePath` calls or any data fetcher.

## Git workflow

- Branch: stay on the worktree's branch (do NOT create a new branch).
- Commit (conventional commits, PT): `perf: remove force-dynamic e habilita Cache Components (fundação)`
- Do NOT push or open a PR.

## Steps

### Step 1: Remove `force-dynamic` from the 20 routes

For each file in the list, delete the `export const dynamic = "force-dynamic";`
line (and any now-orphaned blank line). Do not change anything else in the files.
Read each file before editing.

**Verify**: `grep -rln 'export const dynamic = "force-dynamic"' apps/web/src/app` →
empty. `bun check-types` → exit 0.

### Step 2: Handle the cron route's `runtime`

In `apps/web/src/app/api/cron/cancel-stale-orders/route.ts`, also remove
`export const runtime = "nodejs"`. The route reads `Authorization` headers and
runs Drizzle/pg, so it is inherently dynamic and Node-only; under `cacheComponents`
Node.js is the default and the explicit export conflicts. If the build later
complains that the route is being statically analyzed / needs request-time
deferral, add `await connection()` (from `next/server`) at the top of the handler
BEFORE any work — but try without it first.

**Verify**: `grep -rln "export const runtime" apps/web/src/app` → empty.
`bun check-types` → exit 0.

### Step 3: Enable Cache Components

Invoke the `next-cache-components` skill to confirm syntax. Add
`cacheComponents: true` to `apps/web/next.config.ts`, keeping every existing key
(`typedRoutes`, `reactCompiler`, the `withBundleAnalyzer` wrapper,
`experimental.serverActions.bodySizeLimit`, `experimental.optimizePackageImports`,
`images.remotePatterns`). **Do NOT re-type any existing value** — preserve them
exactly from the file (e.g. `bodySizeLimit` is `"8mb"`, NOT the `"5mb"` the root
CLAUDE.md mentions; only ADD the new `cacheComponents` key).

**Verify**: `bun check-types` → exit 0.

### Step 4: Build — THE gate

Run `bun --cwd apps/web run build`.

**Verify / decision point**:
- **PASS** → foundation is laid. Proceed to Step 5.
- **HIGHEST-RISK CASE — the error points to `apps/web/src/app/dashboard/layout.tsx`**:
  this layout calls `requireCurrentSession()`, `await cookies()`, and DB queries
  (`fetchDashboardCounts`, a pending-count select) at the TOP LEVEL with no
  `<Suspense>` boundary, and it wraps EVERY dashboard route. Under `cacheComponents`
  a top-level `cookies()`/dynamic read with no static shell to prerender around it
  triggers the "Suspense boundary required" error. If the build error originates
  in the layout, the failure will look like ALL ~19 dashboard routes failing at
  once. **STOP immediately, regardless of route count** — do NOT try to wrap 19
  pages. This is a layout-level migration (refactor the layout's dynamic reads
  behind a `<Suspense>` boundary / split the static shell from the dynamic
  session+counts section) and belongs in a separate plan (006-B). Report the exact
  layout error text.
- **FAILS with a NEW class of error** on more than **3** routes (page-level, not
  the layout) → **STOP**. Record exactly which routes and the error text. Larger
  migration → its own plan (006-B). Do NOT wrap pages in Suspense in this plan.
- **FAILS on 3 or fewer routes** with a clear, local Suspense requirement → you MAY
  wrap just those dynamic sections in `<Suspense>` with a sensible fallback (a
  skeleton matching the existing `loading.tsx` pattern), then re-build. Document
  each in NOTES. If it grows beyond 3 routes, STOP.

Leave the changes in place on STOP (do NOT revert) so the reviewer can inspect the
exact failure; the worktree is disposable.

### Step 5: Lint

`bun check` + `npx ultracite check` on every touched file.

**Verify**: exit 0 / no fixes needed.

### Step 6: Visual smoke (reviewer will also verify)

`bun dev:web`. Confirm a representative set of the auth-gated routes still render
correctly and per-request (data is fresh): `/dashboard` (KPIs), `/dashboard/orders`,
`/dashboard/orders/[id]`, `/dashboard/categories`, `/dashboard/users`. Confirm no
runtime errors about caching/runtime in the console or the Next overlay.

**Verify**: routes render with live data; no cache/runtime runtime errors. If you
have no browser, boot the dev server, confirm it compiles the routes without
runtime errors, and DEFER the visual confirmation to the reviewer (state this in
NOTES).

## Done criteria (ALL must hold)

- [ ] `grep -rln 'export const dynamic = "force-dynamic"' apps/web/src/app` → empty
- [ ] `grep -rln "export const runtime" apps/web/src/app` → empty
- [ ] `apps/web/next.config.ts` has `cacheComponents: true`, all prior keys intact
- [ ] `bun check-types` exit 0
- [ ] `bun check` exit 0
- [ ] `bun --cwd apps/web run build` succeeds with the flag enabled
- [ ] `bun --cwd apps/web test` stays green — capture the count BEFORE Step 1 and confirm it's unchanged at the end (current baseline is 359; the apps/web CLAUDE.md "183" figure is stale)
- [ ] Only in-scope files modified (`git status`)
- [ ] No `use cache`/`cacheTag`/`revalidateTag` added (this plan is foundation only)

## STOP conditions

Stop and report if:
- The build (Step 4) surfaces a NEW class of error (Suspense-boundary / uncached
  dynamic data) on more than ~3 routes — that is Plan 006-B (add boundaries), not
  this plan. Report the exact route list + error text.
- Removing `runtime` from the cron route breaks the route's build even with
  `connection()` — report; the cron may need a different handling.
- The drift check fails (file count ≠ 20, or an unexpected `dynamic`/`runtime`
  export) — report.
- `bun --cwd apps/web test` regresses below 359.

## Maintenance notes

- This plan deliberately ships **zero caching** — it only flips the framework into
  Cache Components mode and removes the incompatible legacy configs. Until Plan 006
  adds `use cache`, every route remains dynamic-per-request (same behavior as
  before, now via auto-detection instead of `force-dynamic`).
- A reviewer must confirm via build + smoke that no route accidentally became
  static (cached) — a route showing stale data after a mutation would mean it was
  prerendered when it shouldn't be. None should, since none gain `use cache` here.
- Next step after this lands: re-run **Plan 006** (suppliers pilot — `use cache` +
  `cacheTag("suppliers")` + `revalidateTag`), then the per-domain rollout in
  `plans/006-rollout-notes.md`.
