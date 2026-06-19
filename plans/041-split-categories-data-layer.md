# Plan 041: Extrair categories/data.ts e relocar attribute-actions do _lib (ADR-0019)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 03984800..HEAD -- \
>   apps/web/src/app/dashboard/categories/actions.ts \
>   apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts \
>   apps/web/src/app/dashboard/categories/page.tsx \
>   apps/web/src/app/dashboard/categories/new/page.tsx \
>   apps/web/src/app/dashboard/categories/[id]/page.tsx \
>   apps/web/src/app/dashboard/categories/[id]/edit/page.tsx \
>   apps/web/src/app/dashboard/categories/[id]/_components/products-infinite.tsx \
>   apps/web/src/app/dashboard/categories/[id]/_components/subcategories-infinite.tsx \
>   apps/web/src/app/dashboard/categories/_components/attribute-form.tsx \
>   apps/web/src/app/dashboard/categories/_components/delete-attribute-dialog.tsx
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

`categories/actions.ts` is a 627-line `"use server"` god-module with 8 full
read implementations (not thin wrappers), 6 exported types/interfaces, and 6
mutations — all in the same file. The `"use server"` directive turns every
export into an HTTP POST endpoint, meaning types and the `listCategories`
`const` export are latent build risks. ADR-0019 mandates a 3-layer split:
`data.ts` (server-only reads + types), `_lib/` (pure helpers), and `actions.ts`
("use server" mutations + thin wrappers). Additionally, `_lib/attribute-actions.ts`
contains `"use server"` mutations, which violates ADR-0019 (\_lib must be pure
helpers only). Fixing this makes the surface area of the RPC boundary explicit,
eliminates the const-export build risk, and matches the pattern already
established by `tools/` and `promotions/`.

## Current state

### Directory layout (as of planned-at SHA)

```
apps/web/src/app/dashboard/categories/
  actions.ts              ← 627-line "use server" god-module (TARGET)
  schema.ts               ← Zod schema + CategoryInput type (untouched)
  page.tsx                ← Server Component; imports listCategoriesForTree
  new/page.tsx            ← Server Component; imports listCategories
  [id]/page.tsx           ← Server Component; imports getCategoryDetail,
                             getCategoryAncestors, getCategoryAttributes
  [id]/edit/page.tsx      ← Server Component; imports getCategory, listCategories
  [id]/_components/
    products-infinite.tsx ← "use client"; imports getCategoryProductsPage,
                             CategoryProductItem from ../../actions
    subcategories-infinite.tsx ← "use client"; imports getCategoryChildrenPage,
                                  CategoryChildItem from ../../actions
  _lib/
    attribute-actions.ts  ← "use server" mutations (WRONG PLACE; TARGET)
    attribute-schema.ts   ← Zod schema + helpers (pure; untouched)
    category-completeness.ts  ← pure helper (untouched)
    category-tree.ts      ← pure helper (untouched)
    effective-attributes.ts   ← db reads, no auth (untouched)
  _components/
    attribute-form.tsx    ← "use client"; imports createCategoryAttribute,
                             updateCategoryAttribute from ../_lib/attribute-actions
    delete-attribute-dialog.tsx ← "use client"; imports deleteCategoryAttribute
                                   from ../_lib/attribute-actions
```

### Current actions.ts structure (lines verified against live file)

**Header (lines 1–23)**: `"use server"` + all imports (db, drizzle-orm, next/cache,
react.cache, zod, @/lib/*)

**Exported const — latent build risk (lines 60–66)**:
```ts
// actions.ts:60-66
export const listCategories = cache(
  async (): Promise<CategoryListItem[]> => {
    await requireCapability("categories.read");
    return await db.select().from(category).orderBy(asc(category.path));
  }
);
```
A `const` export from a `"use server"` file is a latent build break — Next.js
only allows async function exports from `"use server"`.

**Read functions (lines 68–450)**:
- `getCategory` (lines 68–78)
- `listCategoriesForTree` (lines 93–129) — 3-query implementation
- `getCategoryDetail` (lines 141–221) — 5 sequential queries
- `getCategoryAncestors` (lines 228–258) — while-loop walk
- `getCategoryAttributes` (lines 267–289) — delegates to getCategoryAncestors internally
- `getCategoryProductsPage` (lines 303–377) — keyset paginated + 2-step image enrichment
- `getCategoryChildrenPage` (lines 386–450) — keyset paginated + count enrichment

**Exported types (lines 26, 80–91, 131–139, 260–264, 291–297, 379–383)**:
```ts
export type CategoryListItem = typeof category.$inferSelect;
export interface CategoryTreeItem { ... }
export interface CategoryDetailData { ... }
export interface CategoryAttributeView { ... }
export interface CategoryProductItem { ... }
export interface CategoryChildItem { ... }
```

**Mutations (lines 452–627)**:
- `createCategory` (452–488)
- `updateCategory` (490–527)
- `toggleCategoryActive` (529–552)
- `reorderCategories` (559–592)
- `deleteCategory` (594–627)

**Private helpers (lines 28–58)**: `zodErrorMessage`, `mapWriteError`,
`revalidateCategoryTrees` — these belong in the new `data.ts` or stay in
`actions.ts` depending on usage (see Steps).

### Current _lib/attribute-actions.ts structure (lines 1–119)

Line 1: `"use server"` — violates ADR-0019 (_lib must be pure helpers, no auth).
Exports: `createCategoryAttribute` (33–59), `updateCategoryAttribute` (61–88),
`deleteCategoryAttribute` (90–110), `getAttributeUsage` (112–118).

`getAttributeUsage` is exported but has **zero callers** in the codebase (confirmed
by `grep -rn "getAttributeUsage"`). It can be moved to `data.ts` as a non-guarded
read (callers can add their own guard if needed) or included in the relocated file.

### Two client-called read functions (must become thin wrappers)

`products-infinite.tsx` (line 12–13):
```ts
import {
  type CategoryProductItem,
  getCategoryProductsPage,
} from "../../actions";
```
It calls `getCategoryProductsPage` directly — the function is used as a
server action (`fetchPage` callback in `useInfiniteList`).

`subcategories-infinite.tsx` (line 9):
```ts
import { type CategoryChildItem, getCategoryChildrenPage } from "../../actions";
```
Same pattern — called from client as a server action.

These two reads MUST remain in `actions.ts` as thin wrappers that delegate to
`data.ts`. Types are imported with `import type` from `data.ts` to avoid
bundling the server module on the client.

### Repo conventions that apply here

**3-layer pattern (ADR-0019)**:
1. `data.ts` — `import "server-only"` at line 1; reads + types; NOT an endpoint
2. `_lib/*.ts` — pure helpers, no auth, no "use server"
3. `actions.ts` — `"use server"` mutations + thin read wrappers with `requireCapability`

**Exemplar to mimic**: `apps/web/src/app/dashboard/tools/data.ts` (reads + types,
`import "server-only"` at line 1) and `apps/web/src/app/dashboard/tools/actions.ts`
lines 45–51 (thin wrapper pattern):
```ts
// tools/actions.ts:45-51
export async function fetchToolsPageAction(args: {
  filters: ToolsFiltersInput;
  cursor: string | null;
}): Promise<InfiniteResult<ToolCardData>> {
  await requireCapability("tools.read");
  return fetchToolsPage(args);
}
```

**promotions thin-wrapper without explicit guard** (guard is inside `fetchPromotionsPage`
inside `data.ts` via `requireCurrentSession`). For categories, the guard
(`requireCapability("categories.read")`) goes in the `actions.ts` wrapper, not in
`data.ts`, because `data.ts` is a server-only boundary guarded by its callers
(Server Components call it directly; clients go through the action wrapper).

> **🔒 SECURITY — caller guard is MANDATORY (revisão 2026-06-19):** dropping
> `requireCapability` from the data.ts reads ONLY stays safe if every caller
> enforces it. The list/detail pages today call `requireCurrentSession()` (active
> session only) — that is INSUFFICIENT once the reads no longer self-guard, because
> `categories.read` would stop being enforced (a regression: any active session,
> or one with `categories.read` revoked via an ADR-0017 override, could read
> categories). Therefore, when updating the Server Component pages that call the
> moved reads — specifically `categories/page.tsx` (calls `listCategoriesForTree`)
> and `categories/[id]/page.tsx` (calls `getCategoryDetail`/`getCategoryAncestors`/
> `getCategoryAttributes`) — you MUST replace `const session = await requireCurrentSession()`
> with `const session = await requireCapability("categories.read")` (it returns the
> same `DashboardSession` and also runs `ensureActive`). `new/page.tsx` and
> `[id]/edit/page.tsx` already guard with `requireCapabilityOrRedirect("categories.manage")`
> (manage ⊇ read) — leave those as-is. Verify post-change: `rg "requireCapability\\(\"categories.read\"\\)" categories/page.tsx categories/[id]/page.tsx` returns ≥1 each.

**`revalidateTag` 2nd arg**: Next 16 requires `revalidateTag(tag, "max")`. Not
applicable in this refactor (categories use `revalidatePath`), but do not change
the revalidation pattern.

**Return type**: `ActionResult<T>` = `{ ok: true; data } | { ok: false; error }`.

**Logger**: `import { logger } from "@/lib/logger"` — never `console.*`.

**Imports**: `import type` for types-only from server modules in client files.

## Commands you will need

| Purpose        | Command                              | Expected on success            |
|----------------|--------------------------------------|-------------------------------|
| Typecheck      | `bun check-types`                    | exit 0, no errors             |
| Lint           | `bun check`                          | exit 0, no warnings           |
| Tests          | `bun --cwd apps/web test`            | all pass (481+ tests)         |
| **Build gate** | `bun run --cwd apps/web build`       | exit 0 — MANDATORY after step 4 |
| Verify imports | `grep -rn "from.*categories/actions" apps/web/src/` | only action imports remain |

> **CRITICAL**: Run `bun run --cwd apps/web build` after step 4 (when all
> consumers are updated). This is the only gate that catches the "use server"
> export rule violations. `check-types` alone does NOT catch them.

## Scope

**In scope** (the only files you should create or modify):

- `apps/web/src/app/dashboard/categories/data.ts` ← CREATE (new file)
- `apps/web/src/app/dashboard/categories/actions.ts` ← MODIFY
- `apps/web/src/app/dashboard/categories/attribute-actions.ts` ← CREATE (relocated from _lib)
- `apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts` ← DELETE
- `apps/web/src/app/dashboard/categories/page.tsx` ← UPDATE imports
- `apps/web/src/app/dashboard/categories/new/page.tsx` ← UPDATE imports
- `apps/web/src/app/dashboard/categories/[id]/page.tsx` ← UPDATE imports
- `apps/web/src/app/dashboard/categories/[id]/edit/page.tsx` ← UPDATE imports
- `apps/web/src/app/dashboard/categories/[id]/_components/products-infinite.tsx` ← UPDATE imports
- `apps/web/src/app/dashboard/categories/[id]/_components/subcategories-infinite.tsx` ← UPDATE imports
- `apps/web/src/app/dashboard/categories/_components/attribute-form.tsx` ← UPDATE imports
- `apps/web/src/app/dashboard/categories/_components/delete-attribute-dialog.tsx` ← UPDATE imports

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/app/dashboard/categories/schema.ts` — Zod schema, untouched
- `apps/web/src/app/dashboard/categories/_lib/attribute-schema.ts` — pure helpers, correct placement
- `apps/web/src/app/dashboard/categories/_lib/category-completeness.ts` — pure helper, correct
- `apps/web/src/app/dashboard/categories/_lib/category-tree.ts` — pure helper, correct
- `apps/web/src/app/dashboard/categories/_lib/effective-attributes.ts` — db read helper, correct
- `apps/web/src/app/dashboard/categories/_lib/category-tree.test.ts` — test file, untouched
- `apps/web/src/app/dashboard/categories/__tests__/guards.test.ts` — untouched
- `apps/web/src/app/dashboard/categories/[id]/_components/*.tsx` other than products-infinite and subcategories-infinite
- `apps/web/src/app/dashboard/categories/_components/*.tsx` other than attribute-form and delete-attribute-dialog
- Any file outside `apps/web/src/app/dashboard/categories/`
- Query behavior — do NOT change any query logic, only move code
- `getCategoryAncestors` while-loop — keep as-is (query optimization is plan 047)
- `tools/` and `promotions/` feature directories

## Git workflow

- Branch: `advisor/041-split-categories-data-layer`
- Commit per step (or group steps 1+2 if they have no build break between them)
- Message style (Conventional Commits, PT, ≤50 chars):
  ```
  refactor(categories): extrai data.ts (leituras + tipos)
  refactor(categories): thin wrappers em actions.ts
  refactor(categories): reloca attribute-actions do _lib
  refactor(categories): atualiza consumers para data.ts
  ```
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 0: Drift check and branch setup

Run the drift check command from the executor header. Then create the branch:
```bash
git checkout -b advisor/041-split-categories-data-layer
```

**Verify**: `git branch --show-current` → `advisor/041-split-categories-data-layer`

---

### Step 1: Create categories/data.ts with all reads, types, and private helpers

Create the file
`apps/web/src/app/dashboard/categories/data.ts`.

The file must start with `import "server-only"` at line 1. It contains:

1. All exported **types and interfaces** from `actions.ts`:
   - `CategoryListItem` (type alias)
   - `CategoryTreeItem` (interface)
   - `CategoryDetailData` (interface)
   - `CategoryAttributeView` (interface)
   - `CategoryProductItem` (interface)
   - `CategoryChildItem` (interface)

2. All **read functions**, converted to plain `async function` (not `const cache(...)`):
   - `listCategories` — drop the `cache()` wrapper and the `requireCapability` guard;
     callers that need dedup can wrap in `cache()` themselves or the action wrapper
     handles the guard. **Do NOT export the const form.**
   - `getCategory`
   - `listCategoriesForTree`
   - `getCategoryDetail` — internally calls `getCategory`; that call is fine since
     both are in the same file
   - `getCategoryAncestors`
   - `getCategoryAttributes` — internally calls `getCategoryAncestors`; also fine
   - `getCategoryProductsPage`
   - `getCategoryChildrenPage`
   - `getAttributeUsage` — moved from `_lib/attribute-actions.ts` (zero callers,
     include here for completeness)

3. **Private helpers** used by the mutations (keep in data.ts so actions.ts can import):
   - `zodErrorMessage`
   - `mapWriteError`
   - `revalidateCategoryTrees`

   Export all three so `actions.ts` can import them, or keep private and duplicate
   in actions.ts. **Preferred**: export them from `data.ts` — it avoids duplication
   and they contain no side effects that make them dangerous as server-only exports.

4. None of the read functions in `data.ts` should call `requireCapability` — they
   are NOT endpoints; they are guarded by their callers.

**Important**: The `getCategoryDetail` function currently calls `getCategory(id)`
internally (line 145 of actions.ts). Since both are now in `data.ts`, this is fine.
`getCategoryAttributes` internally calls `getCategoryAncestors` — also fine.

**Template skeleton** (match the style of `tools/data.ts`):

```ts
import "server-only";

import { db } from "@emach/db";
import {
  type AttributeDefinition,
  attributeDefinition,
} from "@emach/db/schema/attributes";
import { category, toolCategory } from "@emach/db/schema/categories";
import { tool, toolImage, toolVariant } from "@emach/db/schema/tools";
import { and, asc, count, eq, inArray, like, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decodeCursorAs } from "@/lib/cursor";
import { getPgError } from "@/lib/db-error";
import { BATCH_SIZE, type InfiniteResult, paginate } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { buildEffectiveAttributeCounts } from "./_lib/effective-attributes";

const CATEGORIES_PATH = "/dashboard/categories";

// ── Types ──────────────────────────────────────────────────────────────────

export type CategoryListItem = typeof category.$inferSelect;

export interface CategoryTreeItem { ... }
// ... (copy verbatim from actions.ts)

// ── Private helpers ────────────────────────────────────────────────────────

export function zodErrorMessage(error: unknown): string { ... }
export function mapWriteError(e: unknown): string { ... }
export function revalidateCategoryTrees() { ... }

// ── Read functions ─────────────────────────────────────────────────────────

export async function listCategories(): Promise<CategoryListItem[]> {
  // No requireCapability here — guarded by callers
  return await db.select().from(category).orderBy(asc(category.path));
}

// ... remaining reads (copy bodies verbatim from actions.ts, removing
// the requireCapability() call from each)
```

> **Note on `z` import**: `reorderSchema` (a Zod schema) is used only in the
> `reorderCategories` mutation — keep it in `actions.ts`, not `data.ts`. Do not
> import `z` in `data.ts` unless needed.

**Verify**:
```bash
bun check-types
```
Expected: exit 0. (The old `actions.ts` still exists unchanged at this point,
so the only errors should be from `data.ts` itself if any — fix before moving on.)

---

### Step 2: Rewrite categories/actions.ts to mutations + thin wrappers

Open `apps/web/src/app/dashboard/categories/actions.ts` and replace its entire
content. The new file must:

1. Keep `"use server"` at line 1.
2. Import types with `import type` from `./data` (never import the runtime exports
   from `data.ts` in a way that drags DB code into the client bundle — but since
   `actions.ts` is itself server-only via `"use server"`, runtime imports are fine).
3. Import helper functions (`zodErrorMessage`, `mapWriteError`, `revalidateCategoryTrees`)
   from `./data`.
4. Keep all 6 mutations verbatim: `createCategory`, `updateCategory`,
   `toggleCategoryActive`, `reorderCategories`, `deleteCategory`.
5. Add thin wrappers for the two client-called reads:

   ```ts
   // Thin wrappers — called from "use client" components via useInfiniteList.
   // Guard here; implementation delegates to data.ts.

   export async function getCategoryProductsPage(args: {
     categoryId: string;
     cursor: string | null;
   }): Promise<InfiniteResult<CategoryProductItem>> {
     await requireCapability("categories.read");
     return _getCategoryProductsPage(args);
   }

   export async function getCategoryChildrenPage(args: {
     categoryId: string;
     cursor: string | null;
   }): Promise<InfiniteResult<CategoryChildItem>> {
     await requireCapability("categories.read");
     return _getCategoryChildrenPage(args);
   }
   ```

   Import the implementations from `./data` with aliased names to avoid name
   collision (e.g., `import { getCategoryProductsPage as _getCategoryProductsPage } from "./data"`).

6. Do NOT re-export types, interfaces, or any `const` from `actions.ts`. Types
   needed by client components must be imported from `./data` with `import type`.

7. Remove all other read functions (`listCategories`, `getCategory`,
   `listCategoriesForTree`, `getCategoryDetail`, `getCategoryAncestors`,
   `getCategoryAttributes`) — they must NOT appear in `actions.ts`.

8. Remove `reorderSchema` const and put it above the `reorderCategories` function
   (it can stay in `actions.ts` since it's used only by the mutation). The `z` import
   stays in `actions.ts` for this schema.

9. Remove `import { cache } from "react"` — no longer needed in `actions.ts`.

**Verify** (types only — build comes after consumers are updated):
```bash
bun check-types
```
Expected: errors only in consumer files that still import reads from `./actions`
(expected at this stage — consumer updates happen in step 3). Zero errors in
`data.ts` and the mutations in `actions.ts`.

---

### Step 3: Update Server Component consumers to import from data.ts

Update the 4 Server Component page files. For each, change the import path from
`./actions` (or `../actions`) to `./data` (or `../data`).

**3a. `categories/page.tsx`** (imports `listCategoriesForTree`):
- Change: `import { listCategoriesForTree } from "./actions"` →
  `import { listCategoriesForTree } from "./data"`

**3b. `categories/new/page.tsx`** (imports `listCategories`):
- Change: `import { listCategories } from "../actions"` →
  `import { listCategories } from "../data"`

**3c. `categories/[id]/page.tsx`** (imports `getCategoryDetail`, `getCategoryAncestors`,
`getCategoryAttributes`):
- Change: `import { getCategoryDetail, getCategoryAncestors, getCategoryAttributes } from "../actions"` →
  `import { getCategoryDetail, getCategoryAncestors, getCategoryAttributes } from "../data"`

**3d. `categories/[id]/edit/page.tsx`** (imports `getCategory`, `listCategories`):
- Change: `import { getCategory, listCategories } from "../../actions"` →
  `import { getCategory, listCategories } from "../../data"`

**Verify**:
```bash
bun check-types
```
Expected: errors only in the two client components (`products-infinite.tsx`,
`subcategories-infinite.tsx`) which are updated in step 4.

---

### Step 4: Update client component consumers — import type from data.ts; keep action call via actions.ts

The two `"use client"` components call the paginated reads as server actions.
They need two changes:
1. `import type` the types from `data.ts` (or `../../data`)
2. Keep calling the functions (which are now thin wrappers) from `../../actions`

**4a. `[id]/_components/products-infinite.tsx`** (current lines 9–13):
```ts
// BEFORE:
import {
  type CategoryProductItem,
  getCategoryProductsPage,
} from "../../actions";

// AFTER:
import type { CategoryProductItem } from "../../data";
import { getCategoryProductsPage } from "../../actions";
```

**4b. `[id]/_components/subcategories-infinite.tsx`** (current line 9):
```ts
// BEFORE:
import { type CategoryChildItem, getCategoryChildrenPage } from "../../actions";

// AFTER:
import type { CategoryChildItem } from "../../data";
import { getCategoryChildrenPage } from "../../actions";
```

> **Why keep the function import from actions?** `getCategoryProductsPage` and
> `getCategoryChildrenPage` remain exported from `actions.ts` as thin wrappers
> (step 2). The client component must call them via the `"use server"` boundary.
> Calling from `data.ts` directly would pull `server-only` into the client bundle.

**Verify after this step — run the full build gate**:
```bash
bun run --cwd apps/web build
```
Expected: exit 0. This is the mandatory gate for "use server" compliance. Fix any
remaining errors before continuing.

Then run typecheck and lint:
```bash
bun check-types && bun check
```
Expected: both exit 0.

---

### Step 5: Create categories/attribute-actions.ts (relocated from _lib)

Create a NEW file `apps/web/src/app/dashboard/categories/attribute-actions.ts`
(feature-root level, NOT inside `_lib`).

Copy the entire content of `_lib/attribute-actions.ts` verbatim. The file keeps
`"use server"` at line 1. The only change needed is the import path for
`attribute-schema`:

```ts
// BEFORE (in _lib/attribute-actions.ts):
import {
  type AttributeFormValues,
  attributeFormSchema,
  buildOptionsField,
} from "./attribute-schema";

// AFTER (in categories/attribute-actions.ts):
import {
  type AttributeFormValues,
  attributeFormSchema,
  buildOptionsField,
} from "./_lib/attribute-schema";
```

All other imports stay the same.

**Verify**:
```bash
bun check-types
```
Expected: exit 0. (Both `_lib/attribute-actions.ts` and the new
`attribute-actions.ts` exist simultaneously at this point — that is fine.)

---

### Step 6: Update _components consumers to import from the new location

**6a. `_components/attribute-form.tsx`** (lines 24–27):
```ts
// BEFORE:
import {
  createCategoryAttribute,
  updateCategoryAttribute,
} from "../_lib/attribute-actions";

// AFTER:
import {
  createCategoryAttribute,
  updateCategoryAttribute,
} from "../attribute-actions";
```

**6b. `_components/delete-attribute-dialog.tsx`** (line 20):
```ts
// BEFORE:
import { deleteCategoryAttribute } from "../_lib/attribute-actions";

// AFTER:
import { deleteCategoryAttribute } from "../attribute-actions";
```

**Verify**:
```bash
bun check-types
```
Expected: exit 0.

---

### Step 7: Delete _lib/attribute-actions.ts

Now that all consumers are updated, delete the old file:
```bash
rm apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts
```

**Verify**: File no longer exists AND no dangling imports:
```bash
grep -rn "_lib/attribute-actions" apps/web/src/
```
Expected: no output (zero matches).

Then re-run typecheck to confirm nothing broke:
```bash
bun check-types
```
Expected: exit 0.

---

### Step 8: Final verification suite

Run all checks in sequence:

```bash
# 1. No reads left in actions.ts (only thin wrappers for the 2 paginated reads are allowed)
grep -n "^export async function get\|^export async function list\|^export const list" \
  apps/web/src/app/dashboard/categories/actions.ts
```
Expected: only `getCategoryProductsPage` and `getCategoryChildrenPage` appear.
`listCategories`, `getCategory`, `listCategoriesForTree`, `getCategoryDetail`,
`getCategoryAncestors`, `getCategoryAttributes` must NOT appear.

```bash
# 2. No type/interface exports from actions.ts
grep -n "^export type\|^export interface" \
  apps/web/src/app/dashboard/categories/actions.ts
```
Expected: no output (zero matches).

```bash
# 3. No "use server" or requireCapability in data.ts
grep -n '"use server"\|requireCapability' \
  apps/web/src/app/dashboard/categories/data.ts
```
Expected: no output.

```bash
# 4. No "use server" in _lib/attribute-actions.ts (file deleted)
ls apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts 2>&1
```
Expected: `No such file or directory`.

```bash
# 5. server-only at line 1 of data.ts
head -1 apps/web/src/app/dashboard/categories/data.ts
```
Expected: `import "server-only";`

```bash
# 6. Full build
bun run --cwd apps/web build
```
Expected: exit 0.

```bash
# 7. All gates
bun verify
```
Expected: exit 0 (check-types + check + test all pass).

---

### Step 9: Commit

Commit the work in logical units. Suggested grouping:

```bash
git add apps/web/src/app/dashboard/categories/data.ts
git commit -m "refactor(categories): extrai data.ts (leituras + tipos)"

git add apps/web/src/app/dashboard/categories/actions.ts
git commit -m "refactor(categories): thin wrappers em actions.ts"

git add apps/web/src/app/dashboard/categories/attribute-actions.ts
git add apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts  # deleted
git add apps/web/src/app/dashboard/categories/_components/attribute-form.tsx
git add apps/web/src/app/dashboard/categories/_components/delete-attribute-dialog.tsx
git commit -m "refactor(categories): reloca attribute-actions do _lib"

git add apps/web/src/app/dashboard/categories/page.tsx
git add apps/web/src/app/dashboard/categories/new/page.tsx
git add "apps/web/src/app/dashboard/categories/[id]/page.tsx"
git add "apps/web/src/app/dashboard/categories/[id]/edit/page.tsx"
git add "apps/web/src/app/dashboard/categories/[id]/_components/products-infinite.tsx"
git add "apps/web/src/app/dashboard/categories/[id]/_components/subcategories-infinite.tsx"
git commit -m "refactor(categories): consumers importam de data.ts"
```

**Verify**: `git log --oneline -4` shows 4 commits on `advisor/041-split-categories-data-layer`.

## Test plan

No new tests need to be written for this refactor — it is a pure mechanical code
movement with no logic changes. The existing test suite covers the guarded behavior.

Existing tests to confirm still pass:
- `apps/web/src/app/dashboard/categories/__tests__/guards.test.ts`
- `apps/web/src/app/dashboard/categories/_lib/category-tree.test.ts`
- Full suite: `bun --cwd apps/web test` → all pass (481+ tests, no regressions)

If you add `getAttributeUsage` to `data.ts`, no test exists for it — that is
acceptable since the function has zero callers. Do not write a test for it now.

## Done criteria

Machine-checkable. ALL must hold before marking complete:

- [ ] `bun run --cwd apps/web build` exits 0
- [ ] `bun verify` exits 0 (chains check-types + check + test)
- [ ] `grep -n "^export type\|^export interface" apps/web/src/app/dashboard/categories/actions.ts` → no output
- [ ] `grep -n '"use server"\|requireCapability' apps/web/src/app/dashboard/categories/data.ts` → no output
- [ ] `head -1 apps/web/src/app/dashboard/categories/data.ts` → `import "server-only";`
- [ ] `ls apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts` → No such file
- [ ] `grep -rn "_lib/attribute-actions" apps/web/src/` → no output
- [ ] `grep -n "^export async function get\|^export async function list\|^export const list" apps/web/src/app/dashboard/categories/actions.ts` → only `getCategoryProductsPage` and `getCategoryChildrenPage`
- [ ] `plans/README.md` status row for plan 041 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpt at `actions.ts:60-66` (`export const listCategories = cache(...)`) does
  not match the live file — the god-module has already been partially split.
- After step 2, `bun check-types` reports errors in `actions.ts` itself (not in
  consumer files) — a mutation or helper is missing something.
- After step 4, `bun run --cwd apps/web build` fails with
  `Only async functions are allowed to be exported in a "use server" file` —
  there is a non-async export left in `actions.ts` that is not a thin wrapper.
- The file `apps/web/src/app/dashboard/categories/data.ts` already exists
  (drift: someone partially applied this plan).
- `bun verify` fails after the build passes — a test is importing from a path
  that no longer exists.
- Touching a file that is in the out-of-scope list is required to make typecheck
  pass — stop and report the unexpected dependency.
- The build fails with `Module not found: Can't resolve 'net'` or similar —
  a client component is importing from `data.ts` directly instead of going through
  the `actions.ts` wrapper.

## Maintenance notes

- **plan 047** (deferred): `getCategoryAncestors` uses a while-loop N+1 walk.
  The body was intentionally left unchanged here. Plan 047 covers that optimization
  (single recursive-CTE query). The move to `data.ts` in this plan makes that
  future optimization mechanical: touch only `data.ts`.
- **Future reads**: any new category read function should go in `data.ts` first,
  then get a thin wrapper in `actions.ts` only if called from a client component.
  Server Components import `data.ts` directly.
- **`getAttributeUsage`**: moved to `data.ts` with zero callers. If it is ever
  needed from a client component, add a thin wrapper in `actions.ts` or
  `attribute-actions.ts` following the same `requireCapability` + delegate pattern.
- **Reviewer**: verify that no `export const` or `export interface` appears in
  `actions.ts` in the final diff — those are build-time hazards under `"use server"`.
- **PR smoke**: visit `/dashboard/categories` (tree loads), `/dashboard/categories/[any-id]`
  (overview + produtos + subcategorias tabs), and the edit page. Verify the category
  form loads, that infinite scroll on produtos and subcategorias tabs still works.
  `check-types` does not catch SSR query errors or client-bundle pollution.
