# Plan 010: Carregar deps pesadas de editor sob demanda

> **Executor instructions**: Follow step by step; run every verification before
> moving on. On any "STOP conditions" item, stop and report. When done, update
> this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- apps/web/src/lib/image-compression.ts apps/web/src/app/dashboard/categories/page.tsx apps/web/src/app/dashboard/site/banners/page.tsx`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED (lazy boundaries; verify the editors still work)
- **Depends on**: 002 (to measure the bundle drop)
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

Two heavy client dependencies load eagerly on editor routes that don't always
need them:

1. `browser-image-compression` (~80 kB min) is statically imported at the top of
   `lib/image-compression.ts`, so it lands in the tool wizard / edit bundle even
   for users who never upload an image.
2. `@dnd-kit/*` (3 packages, ~40 kB gz) loads with the categories tree and the
   banner list, which are interactive client components rendered eagerly inside
   their (server) pages.

Loading these on demand — the compression lib inside the upload callback, the
dnd-kit components via `next/dynamic` — removes their cost from the initial JS of
those routes.

> **Note**: an earlier audit also flagged `react-markdown` in
> `components/tool-description.tsx`. That was a **false positive** — its consumers
> (`tools/[id]/_components/overview-tab.tsx`, `suppliers/[id]/_components/overview-tab.tsx`)
> are **Server Components** (no `"use client"`), so react-markdown renders on the
> server and never ships to the client bundle. Do **not** lazy-load it. (Recorded
> in `plans/README.md` "considered and rejected".)

## Current state

### A) `browser-image-compression` — static top-level import

`apps/web/src/lib/image-compression.ts`:

```ts
import imageCompression from "browser-image-compression";

const SKIP_THRESHOLD_BYTES = 800 * 1024;
const EXTENSION_RE = /\.[^.]+$/;
const COMPRESSION_OPTS = { fileType: "image/webp", initialQuality: 0.82, maxSizeMB: 1, maxWidthOrHeight: 2000, useWebWorker: true } as const;

export async function compressImageForUpload(file: File): Promise<File> {
	const isAlreadySmall = file.size <= SKIP_THRESHOLD_BYTES;
	const isWebFriendly = file.type === "image/jpeg" || file.type === "image/webp";
	if (isAlreadySmall && isWebFriendly) {
		return file;
	}
	const blob = await imageCompression(file, COMPRESSION_OPTS);
	const baseName = file.name.replace(EXTENSION_RE, "");
	return new File([blob], `${baseName}.webp`, { lastModified: Date.now(), type: "image/webp" });
}
```

Consumer: `tools/_components/tool-image-gallery.tsx:24` imports
`compressImageForUpload`, called at line 197 inside an async upload handler.
Note the early-return path (`isAlreadySmall && isWebFriendly`) skips compression
entirely — so the library is often not even needed at runtime.

### B) `@dnd-kit/*` — eager in categories + banners pages

- `apps/web/src/app/dashboard/categories/page.tsx:16` — `import { CategoriesTree } from "./_components/categories-tree";` (used at line 74). The page is a **Server Component** (no `"use client"`); `CategoriesTree` is a client component importing `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- `apps/web/src/app/dashboard/site/banners/page.tsx:12` — `import { BannerList } from "./_components/banner-list";` (used at line 54). Same shape: server page, client list with dnd-kit.

Because the pages are Server Components, `next/dynamic` **without** `ssr: false`
is allowed and will code-split the dnd-kit-bearing component into its own chunk.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Build/analyze | `ANALYZE=true bun --cwd apps/web run build` | dnd-kit + image-compression in on-demand chunks |
| Dev smoke | `bun dev:web` → tool wizard upload, categories DnD, banners DnD | all still work |

## Scope

**In scope**:
- `apps/web/src/lib/image-compression.ts` — move the import inside the function.
- `apps/web/src/app/dashboard/categories/page.tsx` — `next/dynamic` for `CategoriesTree`.
- `apps/web/src/app/dashboard/site/banners/page.tsx` — `next/dynamic` for `BannerList`.

**Out of scope**:
- `components/tool-description.tsx` and react-markdown — false positive, do NOT touch.
- The tool wizard step-lazy-loading (`tool-sections.ts` loading all 6 step
  components, one of which carries dnd-kit) — bigger refactor with stepper-state
  risk; deferred to Maintenance.
- The dnd-kit component internals (`categories-tree.tsx`, `banner-list.tsx`) — do
  not modify; only change how they're imported.

## Git workflow

- Branch: `advisor/010-lazy-editor-deps`
- Commit (conventional commits, PT): `perf: carrega deps de editor sob demanda`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Dynamic-import `browser-image-compression` inside the function

In `lib/image-compression.ts`, remove the top-level
`import imageCompression from "browser-image-compression"` and load it inside
`compressImageForUpload`, after the early-return (so the skip path never loads
the library):

```ts
export async function compressImageForUpload(file: File): Promise<File> {
	const isAlreadySmall = file.size <= SKIP_THRESHOLD_BYTES;
	const isWebFriendly = file.type === "image/jpeg" || file.type === "image/webp";
	if (isAlreadySmall && isWebFriendly) {
		return file;
	}
	const { default: imageCompression } = await import("browser-image-compression");
	const blob = await imageCompression(file, COMPRESSION_OPTS);
	const baseName = file.name.replace(EXTENSION_RE, "");
	return new File([blob], `${baseName}.webp`, { lastModified: Date.now(), type: "image/webp" });
}
```

**Verify**: `bun check-types` → exit 0.

### Step 2: Lazy-load `CategoriesTree`

In `categories/page.tsx`, replace the static import with `next/dynamic` (no
`ssr: false` — the page is a Server Component; the component can still SSR, it's
just code-split):

```tsx
import dynamic from "next/dynamic";
import { Skeleton } from "@emach/ui/components/skeleton";

const CategoriesTree = dynamic(
	() => import("./_components/categories-tree").then((m) => m.CategoriesTree),
	{ loading: () => <Skeleton className="h-64 w-full" /> }
);
```

Usage at line ~74 stays the same (`<CategoriesTree ... />`).

**Verify**: `bun check-types` → exit 0.

### Step 3: Lazy-load `BannerList`

Same transformation in `site/banners/page.tsx`:

```tsx
import dynamic from "next/dynamic";
import { Skeleton } from "@emach/ui/components/skeleton";

const BannerList = dynamic(
	() => import("./_components/banner-list").then((m) => m.BannerList),
	{ loading: () => <Skeleton className="h-64 w-full" /> }
);
```

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0.

### Step 4: Build + analyze

`ANALYZE=true bun --cwd apps/web run build`. Confirm `browser-image-compression`
and `@dnd-kit/*` are in on-demand chunks, not in the first-load JS of the tool
wizard / categories / banners routes.

**Verify**: the three libs are code-split; route first-load JS drops vs plan-002
baseline.

### Step 5: Functional smoke (critical — these are interactive)

`bun dev:web`:
- Tool wizard / edit: upload an image larger than 800 KB and confirm it still
  compresses to webp and uploads (exercises the dynamic import path). Also upload
  a small jpeg/webp and confirm it skips compression (early return).
- `/dashboard/categories`: drag to reorder a category — DnD still works.
- `/dashboard/site/banners`: drag to reorder a banner — DnD still works.

**Verify**: image upload+compress works; both drag-reorder interactions work; no
console error about dynamic import or dnd-kit.

## Test plan

- No new unit tests (lazy boundaries + an existing async function). Run
  `bun --cwd apps/web test` — must stay green. The real gate is the functional
  smoke in Step 5, because these are interactive editors.

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web run build` succeeds
- [ ] Analyzer shows image-compression + dnd-kit code-split out of first-load
- [ ] Image upload (large → compress; small → skip) works; categories + banners
      drag-reorder work (smoke)
- [ ] Only the three in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The build errors about `ssr: false` — you should NOT have used `ssr: false`
  here (these pages are Server Components and the components can SSR).
- Image compression throws after the dynamic import change (e.g. the default
  export shape differs) — report; the library's default export is the function.
- Drag-reorder breaks after lazy-loading (dnd-kit context/hydration issue) —
  report; do not ship broken DnD.
- Any "Current state" excerpt doesn't match the live code (drift).

## Maintenance notes

- Deferred follow-up: `tools/_components/tool-sections.ts` statically imports all
  six wizard step components at module load, so the "Publicar" step's dnd-kit
  image gallery loads even before the user reaches that step. Converting the step
  map to `React.lazy` per step is a larger change (stepper state +
  `focusFirstError` interaction) — plan it separately if wizard load is still
  heavy after this.
- A reviewer should specifically exercise the upload + both DnD flows, since
  these lazy boundaries can break interactivity in ways typecheck won't catch.
