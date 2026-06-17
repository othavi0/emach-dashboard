# Plan 003: Code-split recharts fora do first-load do `/dashboard`

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result before moving on. On any "STOP conditions" item,
> stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- apps/web/src/app/dashboard/page.tsx apps/web/src/app/dashboard/_components/charts`
> If anything changed, compare against "Current state" before proceeding; on a
> mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (charts already render client-side; lazy-loading defers their JS)
- **Depends on**: 002 (recommended — gives the before/after bundle number; not a hard blocker)
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

`recharts` is the single largest dependency in the app (~150 kB gzipped). All
six chart components are statically imported into `apps/web/src/app/dashboard/page.tsx`
— the most-visited route — so the entire recharts runtime lands in that route's
first-load JS even though the charts are below the fold and already sit inside
`<Suspense>` boundaries (their *data* is deferred, but their *code* is not).
Lazy-loading the charts moves recharts into a separate chunk fetched only when
the chart actually renders, shrinking the initial JS the user downloads before
the dashboard is interactive.

## Current state

- `apps/web/src/app/dashboard/page.tsx:18-23` — six static imports:

```tsx
import { NewClientsLine } from "./_components/charts/new-clients-line";
import { OrderFunnel } from "./_components/charts/order-funnel";
import { RatingBars } from "./_components/charts/rating-bars";
import { RevenueArea } from "./_components/charts/revenue-area";
import { StatusDonut } from "./_components/charts/status-donut";
import { StockFlowArea } from "./_components/charts/stock-flow-area";
```

- Each chart file is a Client Component that imports recharts. Example —
  `apps/web/src/app/dashboard/_components/charts/revenue-area.tsx`:

```tsx
"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

export function RevenueArea({ data }: { data: {...}[] }) { ... }
```

- The charts are rendered inside **async Server Components** in `page.tsx`:
  `TrendsSection` (uses `RevenueArea`, `OrderFunnel`, `RatingBars`) and
  `StrategicSection` (uses `StatusDonut`, `NewClientsLine`, `StockFlowArea`),
  each wrapped in `<Suspense>` in the page body.

- **CRITICAL GOTCHA**: `next/dynamic(..., { ssr: false })` is **not allowed in a
  Server Component** in Next 16. `TrendsSection`/`StrategicSection` are
  `async function` Server Components. Therefore you **cannot** call
  `dynamic(..., { ssr: false })` at the top of `page.tsx`. The correct pattern
  is a thin `"use client"` wrapper module that owns the `dynamic()` calls; the
  server sections import the wrapped components from it. This plan uses that
  pattern. (The audit's original sketch of `ssr:false` directly in `page.tsx`
  was wrong — do not do that; the build will fail.)

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Build | `bun --cwd apps/web run build` | succeeds; recharts no longer in `/dashboard` first-load |
| Analyze | `ANALYZE=true bun --cwd apps/web run build` | recharts appears in a separate async chunk, not the route's first-load |
| Dev smoke | `bun dev:web` → visit `/dashboard` | charts render after a brief skeleton |

## Scope

**In scope**:
- Create `apps/web/src/app/dashboard/_components/charts/lazy.tsx` (new client wrapper)
- `apps/web/src/app/dashboard/page.tsx` (swap the six imports to the lazy versions)

**Out of scope**:
- The six chart component files themselves — do not modify them.
- `packages/ui/src/components/chart.tsx` — leave the shared chart primitives.
- Any other route. Charts are only imported in `page.tsx` (verified: the only
  file importing `./_components/charts/` is `dashboard/page.tsx`).

## Git workflow

- Branch: `advisor/003-recharts-dynamic`
- Commit (conventional commits, PT): `perf: lazy-load charts (recharts) na home`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the client wrapper `charts/lazy.tsx`

Create `apps/web/src/app/dashboard/_components/charts/lazy.tsx`:

```tsx
"use client";

import { Skeleton } from "@emach/ui/components/skeleton";
import dynamic from "next/dynamic";

const chartFallback = () => <Skeleton className="h-64 w-full" />;

export const RevenueArea = dynamic(
	() => import("./revenue-area").then((m) => m.RevenueArea),
	{ ssr: false, loading: chartFallback }
);
export const OrderFunnel = dynamic(
	() => import("./order-funnel").then((m) => m.OrderFunnel),
	{ ssr: false, loading: chartFallback }
);
export const RatingBars = dynamic(
	() => import("./rating-bars").then((m) => m.RatingBars),
	{ ssr: false, loading: chartFallback }
);
export const StatusDonut = dynamic(
	() => import("./status-donut").then((m) => m.StatusDonut),
	{ ssr: false, loading: chartFallback }
);
export const NewClientsLine = dynamic(
	() => import("./new-clients-line").then((m) => m.NewClientsLine),
	{ ssr: false, loading: chartFallback }
);
export const StockFlowArea = dynamic(
	() => import("./stock-flow-area").then((m) => m.StockFlowArea),
	{ ssr: false, loading: chartFallback }
);
```

Confirm each `m.<Name>` matches the actual named export of each chart file (open
each file and check the `export function <Name>`). `StatusDonut` takes a
`config` prop and `data`; the others take `data` — the dynamic wrapper preserves
the prop types automatically via `import()`.

**Verify**: `bun check-types` → exit 0 (types flow through `dynamic`).

### Step 2: Point `page.tsx` at the lazy wrappers

In `apps/web/src/app/dashboard/page.tsx`, replace the six individual chart
imports (lines 18-23) with a single import from the new wrapper:

```tsx
import {
	NewClientsLine,
	OrderFunnel,
	RatingBars,
	RevenueArea,
	StatusDonut,
	StockFlowArea,
} from "./_components/charts/lazy";
```

No other change in `page.tsx` — the JSX usage of `<RevenueArea data={...} />`
etc. stays identical.

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0.

### Step 3: Build and confirm the split

Run `ANALYZE=true bun --cwd apps/web run build`. In the analyzer report, confirm
`recharts` is now in a separate async chunk and **not** part of the `/dashboard`
route's First Load JS. Compare the First Load JS number against the baseline from
plan 002 — it should drop by roughly the recharts gzipped size.

**Verify**: `/dashboard` First Load JS is smaller than the plan-002 baseline;
recharts is in an on-demand chunk.

### Step 4: Visual smoke

`bun dev:web` → open `http://localhost:3001/dashboard`. Confirm the chart cards
show a `Skeleton` momentarily, then the charts render correctly (revenue area,
funnel, donuts, lines). Confirm no console error about `dynamic`/`ssr`.

**Verify**: all charts render; no hydration or dynamic-import error in console.

## Test plan

- No unit tests (presentational). Run `bun --cwd apps/web test` to confirm the
  existing suite stays green.
- Verification is the analyzer split (Step 3) + visual render (Step 4).

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web run build` succeeds
- [ ] Analyzer shows recharts out of `/dashboard` first-load JS
- [ ] All six charts still render on `/dashboard` (visual smoke)
- [ ] Only `charts/lazy.tsx` (new) and `page.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The build errors with a message about `ssr: false` in a Server Component —
  it means a lazy import leaked into a server module incorrectly; the wrappers
  must live only in the `"use client"` `lazy.tsx`.
- A chart's named export differs from the name used in `lazy.tsx` (drift) —
  report the mismatch.
- The charts fail to render or throw a recharts/DOM error under `ssr: false` —
  report it (some recharts setups need `ResponsiveContainer` quirks).
- `page.tsx` does not match the "Current state" import excerpt (drift).

## Maintenance notes

- Any new chart added to the dashboard should be added to `charts/lazy.tsx` and
  imported from there, not statically.
- `ssr: false` means charts are client-only (no SSR HTML for them). That is fine
  here — they are data-viz below the fold inside `<Suspense>`. If a future chart
  needs to be SEO/SSR-visible, do not use this wrapper for it.
- A reviewer should confirm the analyzer before/after numbers are in the PR.
