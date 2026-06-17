# Plan 001: Toda rota do dashboard transmite (streaming) com skeleton imediato

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- apps/web/src/app/dashboard`
> If any in-scope route file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (mechanical but touches ~36 routes — one small file each)
- **Risk**: LOW (purely additive; `loading.tsx` cannot break existing render)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

Every navigation to a dashboard list or detail page currently blocks on the
slowest server query before sending **any** HTML — the user stares at a frozen
previous page (or a blank screen) for 100–600ms with no feedback. Only one
route (`tools/[id]`) has a `loading.tsx`. Next.js App Router streams a route's
`loading.tsx` instantly while the page's async work runs, turning "frozen →
content" into "instant skeleton → content". This is the single biggest
*perceived* navigation-speed win in the app, and it is purely additive: adding
`loading.tsx` changes no data-fetching logic and cannot break a working page.

The home page (`apps/web/src/app/dashboard/page.tsx`) already demonstrates the
streaming philosophy with per-section `<Suspense>`; this plan extends the same
benefit to the 36 routes that lack it, via the simpler `loading.tsx` mechanism.

## Current state

- **The canonical pattern already exists** — `apps/web/src/app/dashboard/tools/[id]/loading.tsx`:

```tsx
import { Skeleton } from "@emach/ui/components/skeleton";

export default function ToolDetailLoading() {
	return (
		<div className="flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-center justify-between gap-4">
				<div className="flex min-w-0 items-center gap-3">
					<Skeleton className="size-12 shrink-0 rounded-full" />
					<div className="flex flex-col gap-1.5">
						<Skeleton className="h-5 w-56" />
						<Skeleton className="h-4 w-40" />
						{/* ...badges... */}
					</div>
				</div>
				<div className="flex gap-1.5">
					<Skeleton className="size-8 rounded-md" />
					<Skeleton className="h-8 w-20 rounded-md" />
				</div>
			</div>
			{/* Tabs */}
			<Skeleton className="h-9 w-full rounded-md" />
			{/* body... */}
		</div>
	);
}
```

- **`Skeleton`** is imported from `@emach/ui/components/skeleton`. Reuse it; do
  not invent a new spinner.
- A `loading.tsx` placed in a route segment folder is rendered by Next.js as the
  Suspense fallback for that segment's `page.tsx` automatically — **no import or
  wiring is needed**, just the file.
- The routes split into **three shells**. Match the skeleton to the shell so the
  layout doesn't jump when content arrives:
  - **List pages** — `PageHeader` + filter row + a vertical stack of cards/rows.
    Exemplar of the real shell: `apps/web/src/app/dashboard/orders/page.tsx`
    (`<PageHeader>` then sections then an infinite list).
  - **Detail pages (`[id]`)** — `EntityIdentityHeader`/identity block + `EntityTabs`.
    Exemplar skeleton already exists: `tools/[id]/loading.tsx` (copy + adapt).
  - **Form pages (`/new`, `/edit`)** — `PageHeader` + a vertical form of fields.

- **In-scope routes** (each gets a sibling `loading.tsx`; grouped by shell):

  **List shell:**
  - `apps/web/src/app/dashboard/branches/loading.tsx`
  - `apps/web/src/app/dashboard/categories/loading.tsx`
  - `apps/web/src/app/dashboard/customers/loading.tsx`
  - `apps/web/src/app/dashboard/orders/loading.tsx`
  - `apps/web/src/app/dashboard/promotions/loading.tsx`
  - `apps/web/src/app/dashboard/reviews/loading.tsx`
  - `apps/web/src/app/dashboard/suppliers/loading.tsx`
  - `apps/web/src/app/dashboard/tools/loading.tsx`
  - `apps/web/src/app/dashboard/users/loading.tsx`
  - `apps/web/src/app/dashboard/stock/branches/loading.tsx`
  - `apps/web/src/app/dashboard/stock/movements/loading.tsx`
  - `apps/web/src/app/dashboard/site/banners/loading.tsx`

  **Detail shell (`EntityTabs`):**
  - `apps/web/src/app/dashboard/branches/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/categories/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/customers/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/orders/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/promotions/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/reviews/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/suppliers/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/users/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/branches/[id]/stock/loading.tsx`
  - `apps/web/src/app/dashboard/tools/[id]/stock/loading.tsx`

  **Form shell (`/new`, `/edit`, settings):**
  - `apps/web/src/app/dashboard/branches/new/loading.tsx`
  - `apps/web/src/app/dashboard/categories/new/loading.tsx`
  - `apps/web/src/app/dashboard/categories/[id]/edit/loading.tsx`
  - `apps/web/src/app/dashboard/promotions/new/loading.tsx`
  - `apps/web/src/app/dashboard/promotions/[id]/edit/loading.tsx`
  - `apps/web/src/app/dashboard/suppliers/new/loading.tsx`
  - `apps/web/src/app/dashboard/suppliers/[id]/edit/loading.tsx`
  - `apps/web/src/app/dashboard/tools/new/loading.tsx`
  - `apps/web/src/app/dashboard/tools/[id]/edit/loading.tsx`
  - `apps/web/src/app/dashboard/site/banners/new/loading.tsx`
  - `apps/web/src/app/dashboard/site/banners/[id]/edit/loading.tsx`
  - `apps/web/src/app/dashboard/site/settings/loading.tsx`

  Before creating each file, run the per-route check in Step 1 — **skip any
  route that already has a `loading.tsx`** (`tools/[id]` already does; do not
  overwrite it).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` (from repo root) | exit 0, no errors |
| Lint | `bun check` (from repo root, ultracite) | exit 0 |
| List routes missing loading.tsx | see Step 1 | the route list |
| Dev smoke | `bun dev:web` then visit routes on `:3001` | skeleton flashes on navigation |

## Suggested executor toolkit

- Skill `next-best-practices` — confirm the `loading.tsx` convention if unsure.
- Reference: the only file you need as a structural template is
  `apps/web/src/app/dashboard/tools/[id]/loading.tsx`.

## Scope

**In scope** (create one `loading.tsx` per route folder listed above):
- The ~31 `loading.tsx` files enumerated in "Current state".

**Out of scope** (do NOT touch):
- `apps/web/src/app/dashboard/page.tsx` — the home already streams via
  `<Suspense>`; adding a `loading.tsx` on top is redundant and out of scope.
- `apps/web/src/app/dashboard/tools/[id]/loading.tsx` — already exists; do not
  modify.
- Any `page.tsx`, `data.ts`, or component — this plan adds files only, it does
  **not** refactor data fetching (that is plans 004, 007, 008). Do not move
  queries, add `<Suspense>` inside pages, or touch `export const dynamic`.
- `apps/web/src/app/dashboard/dev-preview/**` and `app/design/**` — internal
  preview routes, not user navigation.

## Git workflow

- Branch: `advisor/001-streaming-loading-states`
- Commit message style (conventional commits, PT, subject ≤50 chars — match
  `git log`): e.g. `perf: add loading.tsx streaming a rotas do dashboard`
- One commit is fine (all files are independent additions). Do NOT push or open
  a PR unless instructed.

## Steps

### Step 1: Enumerate routes that still lack a `loading.tsx`

From the repo root, list every dashboard `page.tsx` whose folder has no
`loading.tsx` sibling:

```bash
for p in $(find apps/web/src/app/dashboard -name page.tsx); do
  d=$(dirname "$p")
  [ -f "$d/loading.tsx" ] || echo "$d"
done
```

This is your authoritative work list. Cross-check it against the "In scope"
list above. If a route appears in the command output but **not** in the
in-scope list (a new route added since this plan was written), STOP and report —
do not guess its shell.

**Verify**: the command prints the folders to fill; `tools/[id]` is absent
(already has one).

### Step 2: Create the detail-shell skeletons

For each **detail** route, copy `tools/[id]/loading.tsx` into the route folder
and rename the default export function to match the route (e.g.
`OrderDetailLoading`, `BranchDetailLoading`). The header + tabs skeleton shape
is correct for all `EntityTabs` detail pages; adjust the body grid only if the
real page's body is obviously a single column (then drop the `lg:grid-cols-…`
sidebar block).

Keep each file tiny — a default-exported function returning `Skeleton`
placeholders. No data, no hooks, no `"use client"`.

**Verify**: `bun check-types` → exit 0. `bun check` → exit 0.

### Step 3: Create the list-shell skeletons

For each **list** route, create a `loading.tsx` matching a `PageHeader` + filter
+ stacked rows:

```tsx
import { Skeleton } from "@emach/ui/components/skeleton";

export default function <Name>Loading() {
	return (
		<div className="flex flex-col gap-6">
			{/* PageHeader */}
			<div className="flex flex-col gap-1.5">
				<Skeleton className="h-7 w-48" />
				<Skeleton className="h-4 w-80" />
			</div>
			{/* filter row */}
			<Skeleton className="h-9 w-full rounded-md" />
			{/* list rows */}
			<div className="flex flex-col gap-3">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<Skeleton className="h-20 w-full rounded-xl" key={i} />
				))}
			</div>
		</div>
	);
}
```

**Verify**: `bun check-types` → exit 0.

### Step 4: Create the form-shell skeletons

For each **form** route, create a `loading.tsx` matching `PageHeader` + a
vertical stack of field skeletons:

```tsx
import { Skeleton } from "@emach/ui/components/skeleton";

export default function <Name>Loading() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1.5">
				<Skeleton className="h-7 w-56" />
				<Skeleton className="h-4 w-72" />
			</div>
			<div className="flex max-w-2xl flex-col gap-5">
				{[0, 1, 2, 3, 4].map((i) => (
					<div className="flex flex-col gap-2" key={i}>
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-9 w-full rounded-md" />
					</div>
				))}
			</div>
		</div>
	);
}
```

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0.

### Step 5: Visual smoke

Run `bun dev:web`. In a browser at `http://localhost:3001`, navigate between
several dashboard routes (e.g. `/dashboard/orders` → an order detail →
`/dashboard/users` → a user detail). Confirm a skeleton flashes on each
navigation instead of a frozen/blank screen, and that the skeleton's layout
roughly matches where the real content lands (no large jump).

**Verify**: each navigated route shows a skeleton during load. If a skeleton's
shape is wildly off from the loaded content (e.g. detail skeleton on a list
page), fix that one file's shell.

## Test plan

- No unit tests — `loading.tsx` files are static presentational components with
  no logic. The project's existing suite (`bun --cwd apps/web test`) must stay
  green (it does not test these files, but run it to confirm no accidental
  breakage).
- Verification is the visual smoke in Step 5 plus `check-types`/`check`.

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] Every route folder from Step 1's command output now has a `loading.tsx`
      (re-run the Step 1 command — it should print nothing, except intentionally
      out-of-scope folders like `dev-preview`)
- [ ] `bun --cwd apps/web test` still passes (30 files / 183 tests baseline)
- [ ] No `page.tsx`, `data.ts`, or component file was modified
      (`git status` shows only new `loading.tsx` files)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's command lists a route folder not in the in-scope list (new route —
  you cannot know its shell without reading it; report it).
- `tools/[id]/loading.tsx` does not match the excerpt in "Current state" (the
  template drifted).
- `bun check-types` or `bun check` fails twice after a reasonable fix and the
  failure traces to a `loading.tsx` you created.
- A route's `page.tsx` exports `export const dynamic` interactions that make the
  skeleton never appear — note it; do NOT change the page config (that is a
  caching concern handled in plan 006).

## Maintenance notes

- Every new dashboard route from now on should ship with a `loading.tsx` —
  consider adding this to `apps/web/CLAUDE.md` under the entity/CRUD pattern
  section (the "Verificação" bullet) as a follow-up (not in this plan's scope).
- Skeletons are intentionally approximate. A reviewer should check that no
  skeleton causes a *layout shift* worse than the blank screen it replaces — if
  a skeleton is taller/shorter than real content by a lot, tighten it.
- These `loading.tsx` files become more effective once routes are cached (plan
  006); together they make warm navigations feel instant. They are independent
  and can land first.
