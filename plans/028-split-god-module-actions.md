# Plan 028: Quebrar os módulos-deus de actions (tools/promotions) em data/_lib

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 79379ef5..HEAD -- \
>   apps/web/src/app/dashboard/tools/actions.ts \
>   apps/web/src/app/dashboard/promotions/actions.ts \
>   apps/web/src/app/dashboard/orders/data.ts
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (but no characterization tests exist for these modules today — follow the test-first note in Step 1 carefully)
- **Category**: tech-debt
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

The three largest files in `apps/web` are `tools/actions.ts` (1 084 lines), `promotions/actions.ts` (1 020 lines), and `orders/data.ts` (1 017 lines). A repo-wide median is ~114 lines. The tools and promotions files mix "use server" wrappers, pure query helpers, read-side fetchers, and mutation logic in a single unit, which makes every edit a navigability risk and characterization tests impractical to write. The existing `stock/` module already demonstrates the clean split: `movements-data.ts` (server-only read fetcher), `actions.ts` (thin "use server" wrappers), and `_lib/movements-shared.ts` (pure helpers shared between both). Applying that pattern to `tools` and `promotions` shrinks each leaf file to a maintainable ~300 lines and unlocks isolated unit-testing of pure helpers like `buildToolsWhereClause` and `attributeValueRow`. `orders/data.ts` is already a data module (no `"use server"`) but at 1 017 lines is a candidate for a follow-up subdomain split — it is explicitly **out of scope** here.

## Current state

### Relevant files

- `apps/web/src/app/dashboard/tools/actions.ts` — 1 084 lines; `"use server"` at top; contains 8 exported actions + 9 private helpers. Confirmed at lines below.
- `apps/web/src/app/dashboard/promotions/actions.ts` — 1 020 lines; `"use server"` at top; contains 3 read fetchers + 6 mutation actions + 7 private helpers.
- `apps/web/src/app/dashboard/orders/data.ts` — 1 017 lines; no `"use server"`; already a data module; **not touched in this plan**.
- `apps/web/src/app/dashboard/stock/movements-data.ts` — **target pattern** exemplar; begins with `import "server-only";` (not `"use server"`); contains only read queries and exports types.
- `apps/web/src/app/dashboard/stock/actions.ts` — `"use server"` at top; imports from `./_lib/movements-shared` and delegates read side to `movements-data.ts` via a thin `fetchLedgerPageAction` wrapper (see `apps/web/CLAUDE.md`: "Canônico: `stock/movements/actions.ts` (`fetchLedgerPageAction`) envolvendo `movements-data.ts`").
- `apps/web/src/app/dashboard/stock/_lib/movements-shared.ts` — pure helpers; no `"use server"` or `server-only`; 56 lines; exports `computePeriodCutoff`, `movementKeysetCondition`, `encodeMovementCursor`.

### tools/actions.ts — helpers that are candidates for extraction

All of the following are **private** (not exported), and **none** call `requireCapability` or `requireCurrentSession` directly:

| Helper | Lines | Pure? | Note |
|--------|-------|-------|------|
| `errorMessage` | 46–55 | yes | also exists in promotions; can be local copy in each `_lib` file |
| `toNumericString` | 57–62 | yes | numeric coercion |
| `toInt` | 64–69 | yes | numeric coercion |
| `nullableText` | 71–74 | yes | string coercion |
| `normalizeToolPayload` | 107–128 | yes | uses `toNumericString`/`toInt`/`nullableText` |
| `normalizeVariantValues` | 130–140 | yes | pure transform |
| `fetchDefinitionsBySlug` | 142–153 | impure (DB) | reads `attributeDefinition`; no auth call — safe to move to `tools/data.ts` |
| `attributeValueRow` | 155–221 | yes | large switch; ideal unit-test target |
| `buildToolsWhereClause` | 653–733 | yes (sql builder) | no auth call; uses `decodeCursor`; ideal unit-test target |
| `buildToolsNextCursor` | 735–748 | yes | trivial; can stay in `data.ts` |

The two **async** helpers that call `requireCapability`-adjacent domain logic but **not** auth directly:

| Helper | Lines | Note |
|--------|-------|------|
| `primaryCategoryIncompleteError` | 83–91 | DB read + domain check; no auth; safe to move to `tools/data.ts` |
| `currentPrimaryCategoryId` | 94–105 | DB read; no auth; safe to move to `tools/data.ts` |

### promotions/actions.ts — helpers that are candidates for extraction

| Helper | Lines | Pure? | Note |
|--------|-------|-------|------|
| `dbErrorMessage` | 98–101 | yes (logs side effect) | calls `logger.error` — keep in `_lib`; logger is server-safe |
| `safeRequireRole` | 103–108 | yes | no DB/auth import needed |
| `conflict` | 110–112 | yes | pure throw helper |
| `assertTitleUnique` | 116–135 | impure (DB/tx) | takes `Tx` param; no auth; safe to move to `_lib/promotion-query-helpers.ts` |
| `assertCodeUnique` | 137–151 | impure (DB/tx) | same |
| `buildCouponFields` | 200–212 | yes | pure transform |
| `computeStatus` | 214–230 | yes | ideal unit-test target |
| `assertFeaturedSlotFree` | 237–260 | impure (DB/tx) | no auth; safe to move |
| `promotionStatusCondition` | 272–287 | yes | SQL fragment builder; used in both list-query and count-query |
| `makePromotionCursor` | 314–360 | yes | cursor builder |

Read functions that have **no** `requireCapability` (only `requireCurrentSession`) and thus are safe in a `data.ts`-style file:

- `fetchPromotionsPage` (line 362) — reads only; `await requireCurrentSession()` at line 369
- `getPromotion` (line 552) — reads only; `await requireCurrentSession()` at line 555
- `getPromotionStatusCounts` (line 990) — reads only; `await requireCurrentSession()` at line 991
- `getToolOptions` (line 1012) — reads only; `await requireCurrentSession()` at line 1014
- `countToolsWithActivePromotion` (line 159) — reads only; no auth check at all (called from Client Component via server action boundary — see import at `_components/promotion-form-fields.tsx:33`)

### fetchToolsPage in tools/actions.ts (read function)

`fetchToolsPage` (line 750) calls `requireCapability("tools.read")` — this is an auth-bearing read, so it must stay in a `"use server"` context. It can move to `tools/data.ts` **if** that file carries `"use server"` at its top (making it a server action file, not a `server-only` module). Alternatively, wrap it as a thin action like the stock ledger pattern. The simpler approach: tools `data.ts` is also `"use server"` since it's called from components that need server actions anyway. See current call chain: `tools-infinite.tsx:8` imports `fetchToolsPage` from `../actions`.

### Current callers of tools/actions.ts

```
apps/web/src/app/dashboard/tools/page.tsx:25               → fetchToolsPage, ToolsFiltersInput, ToolSort, ToolsListMode
apps/web/src/app/dashboard/tools/_components/tools-infinite.tsx:8  → fetchToolsPage, ToolsFiltersInput
apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx:27  → deleteTool
apps/web/src/app/dashboard/tools/_components/delete-variant-dialog.tsx:21 → deleteToolVariant
apps/web/src/app/dashboard/tools/_components/tool-submit.ts:4  → createTool, updateTool
apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx:39  → updateToolVariant, setDefaultToolVariant, setVariantVisibility
```

### Current callers of promotions/actions.ts

> Note: the re-export shim strategy (Steps 7–8) means **none** of these callers need to change. This table is for audit purposes only — to confirm no symbol is accidentally left unexported after the split.

```
apps/web/src/app/dashboard/promotions/page.tsx:29                                        → multiple reads + types
apps/web/src/app/dashboard/promotions/_components/promotion-status-badge.tsx:6            → PromotionStatus (type)
apps/web/src/app/dashboard/promotions/_components/promotions-filters.tsx:34               → PromotionSort (type)
apps/web/src/app/dashboard/promotions/_components/promotions-grid.tsx:12                  → multiple types
apps/web/src/app/dashboard/promotions/_components/promotion-card.tsx:4                    → PromotionListItem (type)
apps/web/src/app/dashboard/promotions/_components/delete-promotion-dialog.tsx:21          → deletePromotion
apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx:10                   → createPromotion, updatePromotion
apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx:33            → countToolsWithActivePromotion
apps/web/src/app/dashboard/promotions/_components/_lib/format.ts:2                        → PromotionStatus (type)
apps/web/src/app/dashboard/promotions/new/page.tsx:5                                      → getToolOptions
apps/web/src/app/dashboard/promotions/[id]/page.tsx:10                                    → getPromotion
apps/web/src/app/dashboard/promotions/[id]/edit/page.tsx:7                                → getPromotion, getToolOptions
apps/web/src/app/dashboard/promotions/[id]/_components/promotion-identity.tsx:7           → PromotionDetail (type)
apps/web/src/app/dashboard/promotions/[id]/_components/tools-tab.tsx:13                   → PromotionDetail (type)
apps/web/src/app/dashboard/promotions/[id]/_components/overview-tab.tsx:20                → PromotionDetail, PromotionStatus (types)
apps/web/src/app/dashboard/promotions/[id]/_components/promotion-header-actions.tsx:14    → multiple symbols
```

### Repo conventions that apply here

- `"use server"` is a **file-level** directive in Next.js App Router — it goes on line 1 of any file that exports server actions callable from the client. Query helpers wrapped in `"use server"` files are fine; they simply become callable via the server action boundary.
- `import "server-only"` (not `"use server"`) is for pure read modules that must never be bundled by the client but are not callable server actions. The `movements-data.ts` exemplar uses this form.
- `fetchToolsPage` calls `requireCapability` (auth), so it cannot live in a plain `server-only` data file unless that file also handles auth. The simplest safe choice: `tools/data.ts` carries `"use server"` at the top.
- **Anti-patterns** (from root `CLAUDE.md`): no barrel files; no `async function` in Client Components; no `console.*`; no `: any`/`as any`. The new files must honour these.
- **Error handling convention** (`apps/web/CLAUDE.md`): `getPgError(e)` from `src/lib/db-error.ts` for DB errors; `logger.error(...)` not `console.error`.
- **ActionResult** pattern: `{ ok: true; data } | { ok: false; error }` (import from `@/lib/action-result`).
- **Re-export shim (this plan's approach)**: `tools/actions.ts` and `promotions/actions.ts` will re-export the symbols moved to `data.ts`, so **no caller file needs to change**. This is NOT a barrel file (the re-export lives alongside the remaining mutation wrappers in an already-`"use server"` file). A follow-up cleanup plan may migrate callers to import directly from `./data` and remove the shims.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` | exit 0, no errors |
| Lint | `bun check` | exit 0 |
| Tests | `bun --cwd apps/web test` | all pass (baseline 54 files / 359 tests) |
| Form guard | `bun guard:forms` | exit 0 |
| Build | `bun run --cwd apps/web build` | exit 0 |
| Drift check | `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/tools/actions.ts apps/web/src/app/dashboard/promotions/actions.ts apps/web/src/app/dashboard/orders/data.ts` | verify before starting |

## Scope

**In scope** (only these files may be modified or created):

- `apps/web/src/app/dashboard/tools/actions.ts` (reduce to mutation wrappers + add re-export shims)
- `apps/web/src/app/dashboard/tools/data.ts` (create — read fetchers + exported types)
- `apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts` (create — pure helpers; directory does not exist yet, create it)
- `apps/web/src/app/dashboard/promotions/actions.ts` (reduce to mutation wrappers + add re-export shims)
- `apps/web/src/app/dashboard/promotions/data.ts` (create — read fetchers + types)
- `apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts` (create — `_lib/` directory already exists; just create the file)

**No caller files need to change** — re-export shims in `actions.ts` keep all existing import paths working (see "Repo conventions" above and Maintenance notes).

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/app/dashboard/orders/data.ts` — already a data module; subdomain split is a separate follow-up
- `apps/web/src/app/dashboard/orders/actions.ts` — not a god module (~300 lines); no change needed
- Any file outside `dashboard/tools/` or `dashboard/promotions/` hierarchies
- Any logic change — this is a pure move-and-re-import; **zero behavioral changes**
- Public type/function signatures — callers must continue to work with only an import-path update

## Git workflow

- Branch: `advisor/028-split-god-module-actions`
- One commit per module (tools first, then promotions); optional test commit before each
- Message style: `refactor: extrair helpers puros de tools/actions em data/_lib` (Conventional Commits PT, ≤50 chars subject)
- Do NOT push or open a PR unless the operator instructs it

## Steps

### Step 0: Drift check and branch setup

Run the drift check command from the Commands table. If any of the three in-scope files changed since commit `79379ef5`, read the changed sections and verify that the line numbers in "Current state" still hold before proceeding.

Create the branch:
```bash
git checkout -b advisor/028-split-god-module-actions
```

**Verify**: `git branch --show-current` → `advisor/028-split-god-module-actions`

---

### Step 1 (optional but strongly recommended): Characterization tests for pure helpers

No tests exist for `tools/actions.ts` or `promotions/actions.ts` today. Before moving code, add minimal characterization tests for the two most-testable pure helpers. This is the insurance policy that catches "move broke something subtle".

**Test file to create**: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-query-helpers.test.ts`

Model the test file after `apps/web/src/app/dashboard/tools/_components/__tests__/variant-deletion.test.ts` — it uses `import { describe, expect, it } from "vitest"` with no mocks needed (pure functions).

Test `attributeValueRow` (currently at `tools/actions.ts:155–221`):
- `text` input with non-empty string → returns `{ valueText: "foo", valueNumeric: null, valueNumericMax: null, valueBool: null }`
- `text` input with empty/whitespace → returns `null`
- `boolean` input with `true` → returns `{ valueBool: true, ... }`
- `number` input with `NaN` → returns `null`
- `numeric_range` with both min and max → both `valueNumeric` and `valueNumericMax` set

Note: `attributeValueRow` takes `(def: AttributeDefinition, input: AttributeValueInput)`. Import `AttributeDefinition` type from `@emach/db/schema/attributes`. Since `attributeValueRow` is currently **private**, you will need to temporarily export it (add `export` keyword) before the test file will compile — do this on the same commit as the test file. The export will be permanent once the function lives in `tools/_lib/tool-query-helpers.ts`.

Test file for `buildToolsWhereClause` is **not recommended at this stage** — it depends on Drizzle's `sql` tag which requires DB imports; the ROI is lower. Skip it.

**Verify**: `bun --cwd apps/web test -- tool-query-helpers` → new tests pass; existing suite still green

---

### Step 2: Create `tools/_lib/tool-query-helpers.ts`

Create file `apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts`.

This file contains all **pure** helpers that have zero auth or session calls. It does **not** need `"use server"` or `import "server-only"` — it is a plain TypeScript utility module.

Move these from `tools/actions.ts` (keeping the same function bodies verbatim):

1. `errorMessage(error: unknown): string` (lines 46–55) — rename to `toolErrorMessage` to avoid future collisions, OR keep as `errorMessage` since the file is scoped. Either is fine; prefer keeping the name as-is for minimal diff.
2. `toNumericString(value: number | null | undefined): string | null` (lines 57–62)
3. `toInt(value: number | undefined): number | null` (lines 64–69)
4. `nullableText(value: string | undefined): string | null` (lines 71–74)
5. `normalizeToolPayload(input: ToolFormValues)` (lines 107–128) — depends on `toNumericString`/`toInt`/`nullableText`; include those imports from the same file
6. `normalizeVariantValues(v: ToolVariantInput)` (lines 130–140) — depends on `toolVariant.$inferInsert` type from `@emach/db/schema/tools`
7. `attributeValueRow(def: AttributeDefinition, input: AttributeValueInput)` (lines 155–221) — depends on `AttributeDefinition` from `@emach/db/schema/attributes` and `AttributeValueInput` from the tool schema

All seven must be **exported** from the new file (they were private before; now the `tools/actions.ts` and `tools/data.ts` callers import them).

Required imports for the new file (no DB client, no auth):
```ts
import type { AttributeDefinition } from "@emach/db/schema/attributes";
import type { toolVariant } from "@emach/db/schema/tools";
import type { AttributeValueInput, ToolFormValues, ToolVariantInput } from "../_components/tool-schema";
```

**Do not** move `buildToolsWhereClause` or `buildToolsNextCursor` here — those go in `tools/data.ts` (Step 3) alongside `fetchToolsPage` since they use Drizzle's `sql` tag and the `ToolPageRow` interface that is only relevant to the fetch.

**Verify after creating the new file**: `bun check-types` → exit 0 (the file itself compiles; `tools/actions.ts` still has its own copies until Step 3)

---

### Step 3: Create `tools/data.ts` (read fetcher + query builders)

Create file `apps/web/src/app/dashboard/tools/data.ts`.

This file contains the read-side of the module. Add `"use server"` at the top line because `fetchToolsPage` calls `requireCapability` and must be callable as a server action from `tools-infinite.tsx`.

Move from `tools/actions.ts`:

1. **Exported types** (copy, not move — callers still import from `actions.ts` until Step 4): `ToolSort`, `ToolsListMode`, `ToolsFiltersInput`, and the private `ToolPageRow` interface.
2. `fetchDefinitionsBySlug(slugs: string[]): Promise<Map<string, AttributeDefinition>>` (lines 142–153) — DB read, no auth.
3. `primaryCategoryIncompleteError(primaryCategoryId: string): Promise<string | null>` (lines 83–91) — DB read, no auth.
4. `currentPrimaryCategoryId(toolId: string): Promise<string | null>` (lines 94–105) — DB read, no auth.
5. `buildToolsWhereClause(filters, decoded)` (lines 652–733) — SQL builder; private, but exported for testability.
6. `buildToolsNextCursor(sort, last)` (lines 735–748) — cursor encoder; private, but exported for testability.
7. `fetchToolsPage({ filters, cursor })` (lines 750–850) — full function; exported.

Necessary imports for `tools/data.ts` (DB client + schema + auth):
```ts
"use server";
import { db } from "@emach/db";
import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { attributeDefinition } from "@emach/db/schema/attributes";
import { toolCategory } from "@emach/db/schema/categories";
import { tool, toolVariant } from "@emach/db/schema/tools";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { getUserBranchScope } from "@/lib/branch-scope";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import type { ToolStatusValue } from "./_components/tool-schema";
```

Also import from the `_lib` file you just created:
```ts
import { } from "./_lib/tool-query-helpers"; // (unused here, but fetchDefinitionsBySlug was inline)
```

Actually `fetchDefinitionsBySlug` and the category helpers only need `@emach/db` — no `_lib` import needed.

The `isCategoryComplete` / `getEffectiveAttributeCount` / `MIN_CATEGORY_ATTRIBUTES` imports come from:
```ts
import {
  isCategoryComplete,
  MIN_CATEGORY_ATTRIBUTES,
} from "../categories/_lib/category-completeness";
import { getEffectiveAttributeCount } from "../categories/_lib/effective-attributes";
```

**Verify**: `bun check-types` → exit 0

---

### Step 4: Slim down `tools/actions.ts` to mutation wrappers

Now that `tools/data.ts` exists with the read side, update `tools/actions.ts`:

1. Remove the private helpers that were moved to `_lib` (lines 46–74: `errorMessage`, `toNumericString`, `toInt`, `nullableText`) and replace with `import { errorMessage, toNumericString, toInt, nullableText, normalizeToolPayload, normalizeVariantValues, attributeValueRow } from "./_lib/tool-query-helpers"`.
2. Remove `normalizeToolPayload` (line 107) and `normalizeVariantValues` (line 130) — now imported.
3. Remove `attributeValueRow` (line 155) — now imported.
4. Remove `fetchDefinitionsBySlug` (line 142) — now imported from `./data`.
5. Remove `primaryCategoryIncompleteError` (line 83) and `currentPrimaryCategoryId` (line 94) — now imported from `./data`.
6. Remove `buildToolsWhereClause` (line 653), `buildToolsNextCursor` (line 735), and `fetchToolsPage` (line 750) — now live in `./data`.
7. Remove `ToolSort`, `ToolsListMode`, `ToolsFiltersInput` type declarations (lines 615–627) — re-export them from `./data`:
   ```ts
   export type { ToolSort, ToolsListMode, ToolsFiltersInput } from "./data";
   ```
   This avoids breaking the callers `tools/page.tsx` and `tools-infinite.tsx` which import these types from `../actions` today.
8. Similarly re-export `fetchToolsPage`:
   ```ts
   export { fetchToolsPage } from "./data";
   ```

After this step, `tools/actions.ts` should be ~300 lines containing only:
- `"use server"` directive
- Imports
- `createTool` (line 223)
- `updateTool` (line 332)
- `deleteTool` (line 553)
- `updateToolVariant` (line 852)
- `setDefaultToolVariant` (line 918)
- `setVariantVisibility` (line 957)
- `deleteToolVariant` (line 1000)
- Re-exports for `fetchToolsPage` + types

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0; `bun --cwd apps/web test` → all pass

---

### Step 5: Commit tools split

```
git add apps/web/src/app/dashboard/tools/
git commit -m "refactor: extrair helpers puros de tools/actions em data/_lib"
```

**Verify**: `git log --oneline -1` → shows the commit

---

### Step 6: Create `promotions/_lib/promotion-query-helpers.ts`

Create file `apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts`.

This file contains pure and transaction-scoped helpers from `promotions/actions.ts`. No `"use server"` needed. However, `assertTitleUnique`, `assertCodeUnique`, and `assertFeaturedSlotFree` take a `Tx` parameter (the Drizzle transaction object) — they do need the DB schema imports. They do **not** call `requireCapability`.

Move these (all must be **exported**):

1. `dbErrorMessage(error: unknown): string` (lines 98–101) — needs `logger` import: `import { logger } from "@/lib/logger"`.
2. `safeRequireRole(error: unknown): ActionResult<never>` (lines 103–108) — needs `ActionResult` from `@/lib/action-result`.
3. `conflict(message: string): never` (lines 110–112) — pure.
4. `type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]` (line 114) — needs `db` import for the type only (`import type { db } from "@emach/db"` or just derive from the schema — use `import { db } from "@emach/db"` since the tx helpers need schema).
5. `assertTitleUnique(tx: Tx, type: string, title: string, excludeId?: string)` (lines 116–135) — needs `promotion` schema + `and`, `eq`, `ne` from drizzle-orm.
6. `assertCodeUnique(tx: Tx, code: string, excludeId?: string)` (lines 137–151) — needs `promotion` + drizzle.
7. `buildCouponFields(data: PromotionFormValues)` (lines 200–212) — pure; needs `PromotionFormValues` type from `./_components/promotion-schema`.
8. `computeStatus(p: { active: boolean; startsAt: Date | null; endsAt: Date | null }): PromotionStatus` (lines 214–230) — needs `PromotionStatus` type (currently declared in `actions.ts`; move it here or keep in `data.ts` — keep in `data.ts` since it's a public read type).
9. `assertFeaturedSlotFree(tx: Tx, excludeId?: string)` (lines 237–260) — needs `promotion` + drizzle + `computeStatus`.
10. `promotionStatusCondition(cols: PromotionStatusCols, status: PromotionStatus, sqlTag: typeof sql)` (lines 272–287) — needs `AnyColumn` from drizzle-orm; export `PromotionStatusCols` interface too.
11. `makePromotionCursor(sort: PromotionSort, last: {...}): Cursor` (lines 314–360) — needs `Cursor` from `@/lib/cursor` and `PromotionSort` type.

**Verify**: `bun check-types` → exit 0

---

### Step 7: Create `promotions/data.ts` (read fetchers + exported types)

Create file `apps/web/src/app/dashboard/promotions/data.ts`.

This file contains the read functions and exported public types. Unlike `tools/data.ts`, these read functions only call `requireCurrentSession()` (not `requireCapability`). However they still run on the server. Options:

- Add `"use server"` at the top — safe and consistent with `tools/data.ts`
- Use `import "server-only"` — also valid since these are never called from Client Components directly (all callers are Server Components or Server Actions)

Use `"use server"` for consistency with the tools split.

Move from `promotions/actions.ts`:

1. **Exported types** (move, then re-export from `actions.ts` for backward compat):
   - `PromotionStatus` (line 48)
   - `PromotionStatusCounts` (line 50)
   - `PromotionToolItem` (line 58)
   - `PromotionListItem` (line 66)
   - `PromotionDetail` (line 90)
   - `PromotionSort` (line 293)
   - `ListPromotionsOptions` (line 300)

2. Move functions:
   - `countToolsWithActivePromotion(toolIds: string[], excludeId?: string): Promise<number>` (lines 159–196)
   - `fetchPromotionsPage({ filters, cursor }): Promise<InfiniteResult<PromotionListItem>>` (lines 362–546)
   - `getPromotion(id: string): Promise<PromotionDetail | null>` (lines 552–627)
   - `getPromotionStatusCounts(): Promise<PromotionStatusCounts>` (lines 990–1006)
   - `getToolOptions: cache(async ()): Promise<{id, name}[]>` (lines 1012–1020)

3. Import from `_lib`:
   ```ts
   import { computeStatus, makePromotionCursor, promotionStatusCondition } from "./_lib/promotion-query-helpers";
   import type { PromotionStatusCols } from "./_lib/promotion-query-helpers";
   ```

**Verify**: `bun check-types` → exit 0

---

### Step 8: Slim down `promotions/actions.ts` to mutation wrappers

1. Remove all private helpers now in `_lib` (lines 98–260, 272–360) — replace with import from `./promotion-query-helpers` (re-exported via `_lib`).
2. Remove all read functions moved to `data.ts` (lines 159–196, 362–546, 552–627, 990–1020).
3. Remove type declarations moved to `data.ts`.
4. Add re-exports for backward compatibility (callers import from `../actions` today):
   ```ts
   export type {
     PromotionStatus,
     PromotionStatusCounts,
     PromotionToolItem,
     PromotionListItem,
     PromotionDetail,
     PromotionSort,
     ListPromotionsOptions,
   } from "./data";
   export {
     countToolsWithActivePromotion,
     fetchPromotionsPage,
     getPromotion,
     getPromotionStatusCounts,
     getToolOptions,
   } from "./data";
   ```

After this step, `promotions/actions.ts` should be ~300 lines containing only:
- `"use server"` directive
- Imports
- `createPromotion` (line 633)
- `updatePromotion` (line 717)
- `deletePromotion` (line 808)
- `togglePromotionActive` (line 835)
- `duplicatePromotion` (line 889)
- Re-exports for read functions + types

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0; `bun --cwd apps/web test` → all pass

---

### Step 9: Commit promotions split

```
git add apps/web/src/app/dashboard/promotions/
git commit -m "refactor: extrair helpers puros de promotions/actions em data/_lib"
```

**Verify**: `git log --oneline -3` → shows both refactor commits

---

### Step 10: Final verification gate

Run all checks in sequence:

```bash
bun check-types && bun check && bun guard:forms && bun --cwd apps/web test
```

**Verify**: all four exit 0 with no new errors or failures

Also confirm file sizes are now reasonable:
```bash
wc -l \
  apps/web/src/app/dashboard/tools/actions.ts \
  apps/web/src/app/dashboard/tools/data.ts \
  apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts \
  apps/web/src/app/dashboard/promotions/actions.ts \
  apps/web/src/app/dashboard/promotions/data.ts \
  apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts
```

**Verify**: No file above ~400 lines. The two original god modules should each be under 350 lines after the split.

---

### Step 11: Smoke visual check

Start the dev server and visit the two routes that exercise the moved code:

```bash
bun dev:web
```

- Visit `/dashboard/tools` — list should load; infinite scroll should work
- Visit `/dashboard/tools/[any-id]` (edit a tool) — form save should work
- Visit `/dashboard/promotions` — list should load
- Visit `/dashboard/promotions/[any-id]` — detail/edit should work

Use `npx mcp__next-devtools__nextjs_call <port> get_errors` to check for runtime errors if available.

**Verify**: No runtime errors, no blank pages.

## Test plan

### New tests to add (Step 1)

**File**: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-query-helpers.test.ts`

Model after: `apps/web/src/app/dashboard/tools/_components/__tests__/variant-deletion.test.ts` — pure `describe`/`it`/`expect` with no mocks.

Cover `attributeValueRow`:
1. `text` type, non-empty value → correct shape with `valueText` set
2. `text` type, empty string → `null`
3. `text` type, whitespace-only → `null`
4. `boolean` type, `true` → `{ valueBool: true, valueText: null, valueNumeric: null, valueNumericMax: null }`
5. `number` type, `NaN` → `null`
6. `number` type, valid number → `{ valueNumeric: "42", ... }`
7. `numeric_range` type with both values → both `valueNumeric` and `valueNumericMax` set
8. `numeric_range` type with `NaN` min → `null`

Cover `computeStatus` (from promotions, once it is in `_lib`):
1. Expired (endsAt in past) → `"expired"`
2. Scheduled (active=true, startsAt in future) → `"scheduled"`
3. Active (active=true, no startsAt, no endsAt) → `"active"`
4. Inactive (active=false, not expired) → `"inactive"`

Add `computeStatus` tests to a new file: `apps/web/src/app/dashboard/promotions/_lib/__tests__/promotion-query-helpers.test.ts`

**Verification**: `bun --cwd apps/web test` → passes including new tests

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun guard:forms` exits 0
- [ ] `bun --cwd apps/web test` exits 0; new `tool-query-helpers.test.ts` and `promotion-query-helpers.test.ts` exist and pass
- [ ] `wc -l apps/web/src/app/dashboard/tools/actions.ts` < 400 lines
- [ ] `wc -l apps/web/src/app/dashboard/promotions/actions.ts` < 400 lines
- [ ] `apps/web/src/app/dashboard/tools/data.ts` exists
- [ ] `apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts` exists
- [ ] `apps/web/src/app/dashboard/promotions/data.ts` exists
- [ ] `apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts` exists
- [ ] `grep -n "requireCapability\|requireCurrentSession" apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts` returns no matches (pure file must have zero auth calls)
- [ ] `grep -n "requireCapability\|requireCurrentSession" apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts` returns no matches
- [ ] No files outside the in-scope list are modified (`git diff --name-only $(git merge-base HEAD main)..HEAD | grep -v "dashboard/tools\|dashboard/promotions\|plans/"` returns empty)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- **Drift detected**: the function lines in "Current state" don't match the code you see (the codebase changed since 79379ef5).
- **"use server" boundary violation**: a helper you planned to move to `_lib` turns out to import `requireCapability` or `requireCurrentSession` — it is NOT pure and must stay in `actions.ts`.
- **Circular import**: `tools/data.ts` importing from `tools/actions.ts` or vice versa — stop and redesign the split boundary.
- **A step's verification fails twice** after a reasonable fix attempt.
- **The fix requires touching a file outside the in-scope list** (e.g. a shared lib, a package, or an unrelated feature module).
- **Re-export causes a "use server" boundary error**: if placing `export { fetchToolsPage } from "./data"` inside `tools/actions.ts` triggers a Next.js "cannot export a server action from a 'use server' file that also has client-only code" error — stop and report.
- **Type `Tx` extraction fails**: Drizzle's transaction type may need the live `db` instance to be derivable. If `import type { db } from "@emach/db"` produces a type cycle or `Tx` cannot be derived without importing `db`, keep all `assert*` helpers in `promotions/actions.ts` and adjust the split boundary to exclude them.

## Maintenance notes

- **Future additions**: new helper functions in `tools/actions.ts` or `promotions/actions.ts` that have no auth calls should go into the corresponding `_lib` or `data.ts` file. The convention is now established — keep it consistent.
- **orders/data.ts split** (deferred): `orders/data.ts` at 1 017 lines is a candidate for a subdomain split (e.g. `orders/order-list-data.ts` + `orders/order-detail-data.ts` + `orders/order-kpi-data.ts`). This was explicitly excluded here because (a) it is already a data module and (b) it requires careful analysis of the 12+ callers. Open a separate plan when that becomes a churn hotspot.
- **Re-export layer**: The re-exports added to `tools/actions.ts` and `promotions/actions.ts` in Steps 4 and 8 are a deliberate backward-compat shim. A subsequent cleanup plan could migrate all callers to import directly from `./data` and remove the re-exports. Do NOT do that in this plan — keep the diff minimal.
- **Reviewer focus areas in PR**: (1) confirm no logic was accidentally dropped during the move; (2) confirm `"use server"` is absent from `_lib` files; (3) confirm re-export shims in `actions.ts` match the moved symbols exactly; (4) smoke test on the tools list and promotions list routes.
- **Baseline test count**: as of this plan, 54 files / 359 tests pass. The new test files should add at least 10 tests. If the final count is lower, the test step was skipped — which is acceptable but noted as a risk.
