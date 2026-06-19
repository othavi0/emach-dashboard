# Plan 042: Extract stock read implementations from actions.ts to data modules; fix branch-stock-data.ts directive

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 03984800..HEAD -- apps/web/src/app/dashboard/stock/actions.ts apps/web/src/app/dashboard/stock/branch-stock-data.ts apps/web/src/app/dashboard/stock/movements-data.ts apps/web/src/app/dashboard/tools/\[id\]/_components/activity-tab.tsx apps/web/src/app/dashboard/tools/\[id\]/_components/activity-tab-client.tsx apps/web/src/app/dashboard/tools/\[id\]/_components/activity-timeline.tsx apps/web/src/app/dashboard/tools/\[id\]/_components/activity-filters.tsx apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx apps/web/src/app/dashboard/stock/__tests__/guards.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

`apps/web/src/app/dashboard/stock/actions.ts` is a `"use server"` file that exports
**interfaces and sync data** alongside mutations — this violates Next.js 16's rule
that `"use server"` files may only export async functions. The file currently holds
6 full read implementations (611 LOC) even though `movements-data.ts` and
`branch-stock-data.ts` exist as partial prior splits. Client components that import
types from a `"use server"` file are pulling the module into the wrong bundle
boundary: while type-only imports are erased at compile time, any accidental
non-type import would drag `@emach/db` into the browser bundle, breaking the build
with a `Module not found: Can't resolve 'net'` error. Additionally,
`branch-stock-data.ts` carries `"use server"` at line 1 instead of
`import "server-only"`, making it an unintended RPC endpoint. Completing this split
brings the stock module to the same clean 3-layer pattern (ADR-0019) already
established in `tools/`, `promotions/`, and `stock/movements/`.

## Current state

### Files and their roles

- `apps/web/src/app/dashboard/stock/actions.ts` — `"use server"` (611 LOC); holds mutations AND 6 full read implementations AND 3 exported interfaces. **This is the file being split.**
- `apps/web/src/app/dashboard/stock/movements-data.ts` — `import "server-only"` (exists, correct); holds `fetchLedgerPage` + types for the global ledger. **Extend this file with movement reads.**
- `apps/web/src/app/dashboard/stock/branch-stock-data.ts` — line 1 is `"use server"` (wrong); should be `import "server-only"`. Contains `getBranchStockKpis` which has zero callers — confirmed dead via grep.
- `apps/web/src/app/dashboard/stock/_lib/movements-shared.ts` — pure helpers (`computePeriodCutoff`, `movementKeysetCondition`, `encodeMovementCursor`, `PeriodPreset`). No auth, no `"use server"`. Already correct.
- `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` — `"use client"` component that imports `fetchVariantBranchMovementsPage`, `getReservedQtyByVariantBranch`, and `type StockMovementRow` directly from `../actions`. These must be redirected to thin `"use server"` wrappers that delegate to the new data module.
- `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab.tsx` — Server Component that imports `fetchToolActivityPage` from `@/app/dashboard/stock/actions` (line 5) and calls it directly at render time.
- `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-client.tsx` — `"use client"` component that imports `fetchToolActivityPage`, `type PeriodPreset`, `type ToolActivityFilters`, `type ToolActivityRow` from `@/app/dashboard/stock/actions` (lines 8–12).
- `apps/web/src/app/dashboard/tools/[id]/_components/activity-filters.tsx` — `"use client"` component that imports `type PeriodPreset` from `@/app/dashboard/stock/actions` (line 16).
- `apps/web/src/app/dashboard/tools/[id]/_components/activity-timeline.tsx` — imports `type ToolActivityRow` from `@/app/dashboard/stock/actions` (line 3).
- `apps/web/src/app/dashboard/stock/__tests__/guards.test.ts` — tests `getStockMovements` and `getToolActivity` imported from `../actions`. Must be updated to import from the new data module (both functions move there and keep their own `requireCapability` guard).

### Verified excerpts from `stock/actions.ts` (commit `03984800`)

**Interfaces to move (must NOT stay exported from `"use server"`)**

```ts
// lines 326–340
export interface StockMovementRow {
  actorId: string | null;
  actorName: string | null;
  branchId: string | null;
  branchName: string | null;
  createdAt: Date;
  delta: number;
  id: string;
  newQty: number;
  previousQty: number;
  reason: string | null;
  reasonNote: string | null;
  supplierId: string | null;
  supplierName: string | null;
}
```

```ts
// lines 488–504
export interface ToolActivityRow {
  actorId: string | null;
  actorName: string | null;
  branchId: string | null;
  branchName: string | null;
  createdAt: Date;
  delta: number;
  id: string;
  newQty: number;
  previousQty: number;
  reason: string | null;
  reasonNote: string | null;
  supplierId: string | null;
  supplierName: string | null;
  variantSku: string;
  variantVoltage: string | null;
}
```

```ts
// lines 542–547
export interface ToolActivityFilters {
  branchId?: string;
  period: PeriodPreset;
  reasons?: string[];
  toolId: string;
}
```

**Read functions to move (lines in `actions.ts`)**

| Function | Lines | Auth guard | Where it moves |
|---|---|---|---|
| `getStockMovements` | 345–374 | `requireCapability("stock.read")` | `movements-data.ts` |
| `getStockMovementsByVariantBranch` | 379–413 | `requireCurrentSession()` | `movements-data.ts` |
| `fetchVariantBranchMovementsPage` | 419–465 | `requireCurrentSession()` | `movements-data.ts` |
| `getReservedQtyByVariantBranch` | 467–486 | `requireCurrentSession()` | `movements-data.ts` |
| `getToolActivity` | 506–537 | `requireCapability("stock.read")` | new `stock/tool-activity-data.ts` |
| `fetchToolActivityPage` | 549–611 | `requireCapability("stock.read")` | new `stock/tool-activity-data.ts` |

**Note — near-duplicate query builder opportunity**: `getStockMovements` (lines 345–374) and `getToolActivity` (lines 506–537) share the same 4-table join (`stockMovement → toolVariant → branch → user → supplier`) with `getToolActivity` adding `variantSku` and `variantVoltage`. You MAY extract a shared `buildMovementSelect()` helper in `stock/tool-activity-data.ts` to avoid duplication, but this is optional. If you do, keep it unexported (internal to the file).

**Hand-rolled pagination in `actions.ts` (note for plan 045)**:
- `fetchVariantBranchMovementsPage` lines 460–462: `const hasMore = rows.length > BATCH_SIZE; const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;`
- `fetchToolActivityPage` lines 606–608: `const hasMore = rows.length > BATCH_SIZE; const items = hasMore ? rows.slice(0, BATCH_SIZE) : rows;`
Both are hand-rolled equivalents of `paginate()` from `@/lib/infinite`. Do NOT convert them in this plan (that is plan 045's scope) — preserve as-is when moving.

**`branch-stock-data.ts` line 1 (wrong directive)**

```ts
// line 1 — CURRENT (wrong)
"use server";
```

Change to:
```ts
// line 1 — TARGET
import "server-only";
```

**`getBranchStockKpis` dead code (lines 122–160 of `branch-stock-data.ts`)**

`getBranchStockKpis` and interface `BranchStockKpis` / `BranchStockKpisDbRow` have
zero callers confirmed by grep. Remove all three: the function, and both interfaces
(`BranchStockKpis` lines 109–114, `BranchStockKpisDbRow` lines 116–121,
`getBranchStockKpis` function lines 122–160).

### Repo conventions that apply

**ADR-0019 — 3-layer pattern:**
1. `data.ts` / `*-data.ts` — `import "server-only"` at line 1; reads + types; NOT a `"use server"` endpoint; guarded by caller.
2. `_lib/*.ts` — pure helpers, no auth, no `"use server"`.
3. `actions.ts` — `"use server"`; mutations + **thin read wrappers** (one line: `await requireCapability(cap)` then delegate).

**Thin wrapper pattern** (from `stock/movements/actions.ts` and `tools/actions.ts`):
```ts
// stock/movements/actions.ts — canonical thin wrapper
"use server";
import type { InfiniteResult } from "@/lib/infinite";
import { fetchLedgerPage, type LedgerFilters, type LedgerRow } from "../movements-data";

export async function fetchLedgerPageAction(
  filters: LedgerFilters,
  cursor: string | null
): Promise<InfiniteResult<LedgerRow>> {
  return await fetchLedgerPage(filters, cursor);
}
```

Note: the auth guard lives in `movements-data.ts::fetchLedgerPage` itself (calls `requireCapability("stock.read")`). The wrapper just delegates — it does NOT add a second guard. Same pattern here: the guard stays in the data function.

**Server Component calling a data function directly (no wrapper needed)**:
`activity-tab.tsx` is a Server Component (`async function ActivityTab`). Server
Components may import from `server-only` data modules directly. After the move,
`activity-tab.tsx` should import `fetchToolActivityPage` from
`@/app/dashboard/stock/tool-activity-data` (not the wrapper in actions.ts).

**Client Component calling a read (wrapper needed)**:
`activity-tab-client.tsx` is `"use client"`. It must NOT import from
`tool-activity-data.ts` (server-only). Instead add a thin `"use server"` wrapper
in `stock/actions.ts` (since `fetchVariantBranchMovementsPage` and
`getReservedQtyByVariantBranch` are client-called, they also need wrappers in
`actions.ts`).

**`import type` for type-only consumers**: after the move, files like
`activity-filters.tsx`, `activity-timeline.tsx` that only need a type can use
`import type { PeriodPreset } from "@/app/dashboard/stock/tool-activity-data"` —
type imports are erased at compile time and do not trigger the bundle-drag issue.

**Error handling in `actions.ts`**: mutations use `try/catch` + `logger.error` +
`actionErrorMessage`. The thin read wrappers do NOT need try/catch — they just
re-throw (the data function throws on auth failure; the caller handles it).

**`revalidateTag` 2nd arg**: Next 16 requires `revalidateTag(tag, "max")` — but
this plan only touches reads, not mutations. No `revalidateTag` calls in scope.

**Test mock pattern**: vitest; `@emach/db` mocked via `vi.hoisted` + `vi.mock`;
`server-only` aliased to stub in `vitest.config.ts`. Model after
`apps/web/src/app/dashboard/stock/__tests__/guards.test.ts` for the guard tests
being relocated.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun check-types` | exit 0, no errors |
| Lint | `bun check` | exit 0, no lint errors |
| Tests | `bun --cwd apps/web test` | all pass (currently 68 files / 481 tests) |
| **Build (mandatory)** | `bun run --cwd apps/web build` | exit 0 — MUST run after every `"use server"` file change |
| Verify dead code | `grep -rn "getBranchStockKpis" apps/web/src/` | no matches after removal |
| Verify no reads in actions.ts | `grep -n "getStockMovements\|getToolActivity\|getReservedQty\|getStockMovementsByVariant\|fetchVariantBranchMovements\|fetchToolActivityPage" apps/web/src/app/dashboard/stock/actions.ts` | only wrapper function names (no implementations) |
| Verify no interfaces in actions.ts | `grep -n "^export interface" apps/web/src/app/dashboard/stock/actions.ts` | no matches |
| Verify branch-stock-data directive | `head -1 apps/web/src/app/dashboard/stock/branch-stock-data.ts` | `import "server-only";` |

## Scope

**In scope** (the only files you should create or modify):

- `apps/web/src/app/dashboard/stock/actions.ts` — remove 6 read implementations + 3 interfaces; add thin `"use server"` wrappers for the 3 client-called reads
- `apps/web/src/app/dashboard/stock/movements-data.ts` — add `StockMovementRow`, `getStockMovements`, `getStockMovementsByVariantBranch`, `fetchVariantBranchMovementsPage`, `getReservedQtyByVariantBranch`
- `apps/web/src/app/dashboard/stock/tool-activity-data.ts` — CREATE NEW; `import "server-only"`; holds `ToolActivityRow`, `ToolActivityFilters`, `getToolActivity`, `fetchToolActivityPage`
- `apps/web/src/app/dashboard/stock/branch-stock-data.ts` — fix directive line 1; remove `getBranchStockKpis` + `BranchStockKpis` + `BranchStockKpisDbRow`
- `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` — update import: `fetchVariantBranchMovementsPage`, `getReservedQtyByVariantBranch` from `../actions` (thin wrappers stay there); `import type { StockMovementRow }` from `../movements-data`
- `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab.tsx` — update import: `fetchToolActivityPage` from `@/app/dashboard/stock/tool-activity-data`
- `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-client.tsx` — update imports: function from the new `"use server"` wrapper in `stock/actions.ts`; types via `import type` from `@/app/dashboard/stock/tool-activity-data`
- `apps/web/src/app/dashboard/tools/[id]/_components/activity-filters.tsx` — update `import type { PeriodPreset }` from `@/app/dashboard/stock/tool-activity-data` (or `movements-data` — it re-exports from `_lib/movements-shared`)
- `apps/web/src/app/dashboard/tools/[id]/_components/activity-timeline.tsx` — update `import type { ToolActivityRow }` from `@/app/dashboard/stock/tool-activity-data`
- `apps/web/src/app/dashboard/stock/__tests__/guards.test.ts` — update imports; add guard tests for the moved functions' new locations

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/app/dashboard/stock/movements/actions.ts` — already a correct thin wrapper; do not touch
- `apps/web/src/app/dashboard/stock/_lib/movements-shared.ts` — already correct pure helpers; do not touch
- `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`, `branch-stock-card-grid.tsx`, `branch-stock-filters.tsx`, `branch-stock-infinite.tsx` — these import from `branch-stock-data.ts` but only use `fetchBranchStockPage` and types that are NOT being removed; no import path changes needed
- `apps/web/src/app/dashboard/branches/[id]/_components/stock-tab.tsx` — imports from `branch-stock-data.ts`; the types it uses (`BranchStockRow`, `BranchStockFiltersInput`, `BranchStockSort`, `BranchStockStatus`, `fetchBranchStockPage`) are NOT being removed; no changes needed
- `apps/web/src/app/dashboard/stock/_components/stock-entry-form.tsx`, `stock-recount-form.tsx`, `stock-write-off-form.tsx` — import mutations from `../actions`; mutations do not move
- `apps/web/src/app/dashboard/tools/[id]/_components/tool-stock-branch-card.tsx`, `estoque-tab.tsx` — do not import stock reads
- Any mutation functions in `actions.ts` (`recordStockEntry`, `recordStockWriteOff`, `adjustStock`, `updateStockThresholds`, `applyMovement`, `revalidateStockPaths`)
- `packages/db/` schema files — no schema changes
- Pagination helper migration (hand-rolled `hasMore`/`slice` → `paginate()`) — deferred to plan 045

## Git workflow

- Branch: `advisor/042-extract-stock-reads-data-layer`
- Create branch: `git checkout -b advisor/042-extract-stock-reads-data-layer`
- Commit style: Conventional Commits em PT, subject ≤50 chars. Examples from this repo: `refactor: mover reads de estoque p/ camada data`, `fix: corrigir diretiva branch-stock-data`, `test: atualizar guards para novo local`
- One commit per logical step is fine; squash is not required
- Do NOT push or open a PR unless instructed

## Steps

### Step 1: Fix `branch-stock-data.ts` directive and remove dead code

Read `apps/web/src/app/dashboard/stock/branch-stock-data.ts` (Read tool, not cat).

Make two changes in one Edit:
1. Replace line 1 `"use server";` with `import "server-only";`
2. Remove lines 109–160: interface `BranchStockKpis` (lines 109–114), interface `BranchStockKpisDbRow` (lines 116–121), and function `getBranchStockKpis` (lines 122–160).
   Also remove the import `{ getUserBranchScope, inScope }` from `@/lib/branch-scope` if `getBranchStockKpis` is the only consumer (it is — the other functions don't use it; confirm before removing).

Also verify `requireCurrentSession` is still used by `fetchBranchStockPage` (line 169); keep that import.

**Verify**:
```bash
head -1 apps/web/src/app/dashboard/stock/branch-stock-data.ts
```
Expected: `import "server-only";`

```bash
grep -n "getBranchStockKpis\|BranchStockKpis\|BranchStockKpisDbRow\|getUserBranchScope" apps/web/src/app/dashboard/stock/branch-stock-data.ts
```
Expected: no matches (all removed).

```bash
bun check-types
```
Expected: exit 0. If typecheck finds `getUserBranchScope` missing (still referenced elsewhere in the file), keep the import.

### Step 2: Add movement reads + types to `movements-data.ts`

Read `apps/web/src/app/dashboard/stock/movements-data.ts` (Read tool).
Read `apps/web/src/app/dashboard/stock/actions.ts` lines 1–50 and 326–486 to copy exact code.

Append to `movements-data.ts` after the existing `fetchLedgerPage` function:

1. **Add missing imports** at the top of the file: `order`, `orderItem` from `@emach/db/schema/orders`; `inArray`, `sql` from `drizzle-orm` (check what is already imported to avoid duplicates).

2. **Add `StockMovementRow` interface** (exact copy from `actions.ts` lines 326–340):
```ts
export interface StockMovementRow {
  actorId: string | null;
  actorName: string | null;
  branchId: string | null;
  branchName: string | null;
  createdAt: Date;
  delta: number;
  id: string;
  newQty: number;
  previousQty: number;
  reason: string | null;
  reasonNote: string | null;
  supplierId: string | null;
  supplierName: string | null;
}
```

3. **Add `getStockMovements`** (exact copy from `actions.ts` lines 345–374; keep `requireCapability("stock.read")` guard).

4. **Add `getStockMovementsByVariantBranch`** (exact copy from `actions.ts` lines 379–413; keep `requireCurrentSession()` guard).

5. **Add `fetchVariantBranchMovementsPage`** (exact copy from `actions.ts` lines 419–465; keep `requireCurrentSession()` guard; preserve the hand-rolled `hasMore`/`slice` at lines 460–462 — do NOT convert to `paginate()`).

6. **Add `getReservedQtyByVariantBranch`** (exact copy from `actions.ts` lines 467–486; keep `requireCurrentSession()` guard). This function uses `order`, `orderItem` from `@emach/db/schema/orders` and `inArray`, `sql` from `drizzle-orm` — ensure those are in the imports.

Check that `movements-data.ts` already imports `requireCurrentSession` from `@/lib/session`; it currently imports only `requireCapability` from `@/lib/permissions`. Add `requireCurrentSession` if missing.

**Verify**:
```bash
grep -n "export.*getStockMovements\|export.*getStockMovementsByVariantBranch\|export.*fetchVariantBranchMovementsPage\|export.*getReservedQtyByVariantBranch\|export interface StockMovementRow" apps/web/src/app/dashboard/stock/movements-data.ts
```
Expected: 5 matches.

```bash
bun check-types
```
Expected: exit 0.

### Step 3: Create `stock/tool-activity-data.ts`

Create `apps/web/src/app/dashboard/stock/tool-activity-data.ts` (new file).

The file must begin with `import "server-only";` at line 1. It holds:

1. **Imports**: `db` from `@emach/db`; `user` from `@emach/db/schema/auth`; `branch` from `@emach/db/schema/inventory`; `stockMovement` from `@emach/db/schema/stock-movements`; `supplier`, `toolVariant` from `@emach/db/schema/tools`; `and`, `desc`, `eq`, `gte`, `inArray` from `drizzle-orm`; `BATCH_SIZE`, `type InfiniteResult` from `@/lib/infinite`; `requireCapability` from `@/lib/permissions`; and from `./_lib/movements-shared`: `computePeriodCutoff`, `encodeMovementCursor`, `movementKeysetCondition`, `type PeriodPreset`.

2. **Re-export** `PeriodPreset` for consumer convenience:
```ts
export type { PeriodPreset } from "./_lib/movements-shared";
```

3. **`ToolActivityRow` interface** (exact copy from `actions.ts` lines 488–504).

4. **`ToolActivityFilters` interface** (exact copy from `actions.ts` lines 542–547).

5. **`getToolActivity` function** (exact copy from `actions.ts` lines 506–537; keep `requireCapability("stock.read")` guard).

6. **`fetchToolActivityPage` function** (exact copy from `actions.ts` lines 549–611; keep `requireCapability("stock.read")` guard; preserve the hand-rolled `hasMore`/`slice` at lines 606–608 — do NOT convert to `paginate()`).

Note on the `STOCK_MOVEMENT_REASONS` reference in `fetchToolActivityPage` (line 564):
```ts
filters.reasons as (typeof STOCK_MOVEMENT_REASONS)[number][]
```
`STOCK_MOVEMENT_REASONS` is imported in `actions.ts` from `./_components/stock-movement-schema` via `type STOCK_MOVEMENT_REASONS`. Add this type import to `tool-activity-data.ts`:
```ts
import type { STOCK_MOVEMENT_REASONS } from "./_components/stock-movement-schema";
```

**Verify**:
```bash
grep -n "^export" apps/web/src/app/dashboard/stock/tool-activity-data.ts
```
Expected: lines for `export type { PeriodPreset }`, `export interface ToolActivityRow`, `export interface ToolActivityFilters`, `export async function getToolActivity`, `export async function fetchToolActivityPage`.

```bash
bun check-types
```
Expected: exit 0.

### Step 4: Replace read implementations in `stock/actions.ts` with thin wrappers

Read `apps/web/src/app/dashboard/stock/actions.ts` (Read tool).

**4a. Add import at the top of `actions.ts`** (after existing imports block, before the export block):
```ts
import type { InfiniteResult } from "@/lib/infinite";
import {
  fetchVariantBranchMovementsPage as _fetchVariantBranchMovementsPage,
  getReservedQtyByVariantBranch as _getReservedQtyByVariantBranch,
} from "./movements-data";
import {
  fetchToolActivityPage as _fetchToolActivityPage,
  type ToolActivityFilters,
  type ToolActivityRow,
} from "./tool-activity-data";
```

Also add the re-exports so consumers that import types from `actions.ts` still compile during the transition:
```ts
export type { StockMovementRow } from "./movements-data";
export type { ToolActivityFilters, ToolActivityRow } from "./tool-activity-data";
export type { PeriodPreset } from "./_lib/movements-shared";
```

**4b. Remove the 6 read implementations and 3 interfaces** from `actions.ts` (lines 324–611 — the entire section from the `// ─── Tipos de leitura` comment to EOF). Also remove the `// export type { PeriodPreset }` re-export at line 43 (it will be replaced by the one above).

**4c. Add thin `"use server"` wrappers** for the 3 client-called reads. Append at the end of `actions.ts`:

```ts
// ─── Wrappers de leitura para Client Components ───────────────────────────────
// Estas funções são "use server" endpoints que delegam à camada data (server-only).
// Client Components chamam estas; Server Components importam direto de movements-data
// ou tool-activity-data.

export async function fetchVariantBranchMovementsPageAction(
  variantId: string,
  branchId: string,
  cursor: string | null
): Promise<InfiniteResult<StockMovementRow>> {
  return await _fetchVariantBranchMovementsPage(variantId, branchId, cursor);
}

export async function getReservedQtyByVariantBranchAction(
  variantId: string,
  branchId: string
): Promise<number> {
  return await _getReservedQtyByVariantBranch(variantId, branchId);
}

export async function fetchToolActivityPageAction(
  filters: ToolActivityFilters,
  cursor: string | null
): Promise<InfiniteResult<ToolActivityRow>> {
  return await _fetchToolActivityPage(filters, cursor);
}
```

Note on naming: the wrappers are named `*Action` to be consistent with the pattern in `stock/movements/actions.ts` (`fetchLedgerPageAction`). The old names (`fetchVariantBranchMovementsPage`, `getReservedQtyByVariantBranch`, `fetchToolActivityPage`) are removed from `actions.ts` entirely — consumers must update to the new names.

Also update the imports at the top of `actions.ts` to remove the imports that were only needed by the read functions now moved:
- Remove: `order`, `orderItem` from `@emach/db/schema/orders` (if only used by `getReservedQtyByVariantBranch`)
- Remove: `inArray`, `sql` from `drizzle-orm` (if only used by read functions — check mutations first)
- Remove: `desc` from `drizzle-orm` (if only used by read functions)
- Remove: `BATCH_SIZE`, `type InfiniteResult` from `@/lib/infinite` (these are re-imported in the new wrapper section via the import you added above — or import once at top)
- Remove: `computePeriodCutoff`, `encodeMovementCursor`, `movementKeysetCondition`, `type PeriodPreset` from `./_lib/movements-shared` (only used by moved reads)
- Remove: `requireCurrentSession` from `@/lib/session` (only used by moved reads; mutations use `requireCapabilityWithContext`)
- Keep: `requireCapabilityWithContext` (used by mutations), `requireCapability` (check if any mutation uses it)

**IMPORTANT**: Check each import against the mutation functions before removing. The safest approach: after the edit, run `bun check-types` and fix any "imported but unused" or "cannot find name" errors before proceeding.

**Verify**:
```bash
grep -n "^export interface\|^export async function.*Movements\|^export async function.*Activity\|^export async function.*Reserved" apps/web/src/app/dashboard/stock/actions.ts
```
Expected: only the 3 thin wrapper functions appear (no interface exports, no read implementations).

```bash
bun check-types
```
Expected: exit 0.

```bash
bun run --cwd apps/web build
```
Expected: exit 0. **This is the mandatory build gate for `"use server"` changes.**

### Step 5: Update consumers of the renamed/relocated functions

Read each consumer file before editing (Read tool, not cat).

**5a. `branch-stock-edit-sheet.tsx`** — update the import block (lines 22–28):

Change:
```ts
import {
  fetchVariantBranchMovementsPage,
  getReservedQtyByVariantBranch,
  type StockMovementRow,
  updateStockThresholds,
} from "../actions";
```

To:
```ts
import {
  fetchVariantBranchMovementsPageAction,
  getReservedQtyByVariantBranchAction,
  updateStockThresholds,
} from "../actions";
import type { StockMovementRow } from "../movements-data";
```

Update call sites in the file:
- Replace `fetchVariantBranchMovementsPage(` → `fetchVariantBranchMovementsPageAction(`  (appears at lines 140 and 157)
- Replace `getReservedQtyByVariantBranch(` → `getReservedQtyByVariantBranchAction(`  (appears at line 388)

**5b. `activity-tab.tsx`** (Server Component — can import from `server-only` directly):

Change line 5:
```ts
import { fetchToolActivityPage } from "@/app/dashboard/stock/actions";
```
To:
```ts
import { fetchToolActivityPage } from "@/app/dashboard/stock/tool-activity-data";
```
No call-site changes needed (function name unchanged in `tool-activity-data.ts`).

**5c. `activity-tab-client.tsx`** (`"use client"` — must use the `"use server"` wrapper):

Change:
```ts
import {
  fetchToolActivityPage,
  type PeriodPreset,
  type ToolActivityFilters,
  type ToolActivityRow,
} from "@/app/dashboard/stock/actions";
```
To:
```ts
import { fetchToolActivityPageAction } from "@/app/dashboard/stock/actions";
import type {
  PeriodPreset,
  ToolActivityFilters,
  ToolActivityRow,
} from "@/app/dashboard/stock/tool-activity-data";
```

Update the call site at line 53:
```ts
fetchPage: (cursor) => fetchToolActivityPage(filters, cursor),
```
To:
```ts
fetchPage: (cursor) => fetchToolActivityPageAction(filters, cursor),
```

**5d. `activity-filters.tsx`** (`"use client"`):

Change line 16:
```ts
import type { PeriodPreset } from "@/app/dashboard/stock/actions";
```
To:
```ts
import type { PeriodPreset } from "@/app/dashboard/stock/tool-activity-data";
```

**5e. `activity-timeline.tsx`**:

Change line 3:
```ts
import type { ToolActivityRow } from "@/app/dashboard/stock/actions";
```
To:
```ts
import type { ToolActivityRow } from "@/app/dashboard/stock/tool-activity-data";
```

**Verify after all 5 consumer edits**:
```bash
bun check-types
```
Expected: exit 0.

```bash
bun run --cwd apps/web build
```
Expected: exit 0.

### Step 6: Update guards test file

Read `apps/web/src/app/dashboard/stock/__tests__/guards.test.ts` (Read tool).

The test currently imports `getStockMovements` and `getToolActivity` from `"../actions"`. Both functions have moved. Update the file:

```ts
// Change:
import { getStockMovements, getToolActivity } from "../actions";
// To:
import { getStockMovements } from "../movements-data";
import { getToolActivity } from "../tool-activity-data";
```

Also add guard tests for the other 2 functions that now have guards in `movements-data.ts`:
- `getStockMovementsByVariantBranch` — guard is `requireCurrentSession()`
- `fetchVariantBranchMovementsPage` — guard is `requireCurrentSession()`
- `getReservedQtyByVariantBranch` — guard is `requireCurrentSession()`

The mock at the top already mocks `@/lib/permissions` (including `requireCurrentSession`). Extend the describe blocks:

```ts
describe("getStockMovementsByVariantBranch — guard", () => {
  it("rejeita quando requireCurrentSession lança", async () => {
    vi.mocked(requireCurrentSession).mockRejectedValueOnce(new Error("Unauthenticated"));
    await expect(
      getStockMovementsByVariantBranch("variant-id", "branch-id")
    ).rejects.toThrow("Unauthenticated");
  });
});

describe("getReservedQtyByVariantBranch — guard", () => {
  it("rejeita quando requireCurrentSession lança", async () => {
    vi.mocked(requireCurrentSession).mockRejectedValueOnce(new Error("Unauthenticated"));
    await expect(
      getReservedQtyByVariantBranch("variant-id", "branch-id")
    ).rejects.toThrow("Unauthenticated");
  });
});
```

Note: `requireCurrentSession` must be added to the `vi.mock` return at the top of the test file (it is already listed there — verify).

**Verify**:
```bash
bun --cwd apps/web test -- --reporter=verbose 2>&1 | grep -E "stock/__tests__|PASS|FAIL"
```
Expected: `guards.test.ts` passes, all tests pass.

### Step 7: Final full verification

Run the complete verification suite in order:

```bash
bun check-types && echo "TYPES OK"
```
Expected: `TYPES OK`

```bash
bun check && echo "LINT OK"
```
Expected: `LINT OK`

```bash
bun --cwd apps/web test && echo "TESTS OK"
```
Expected: `TESTS OK`; all prior tests still pass; new guard tests for moved functions pass.

```bash
bun run --cwd apps/web build && echo "BUILD OK"
```
Expected: `BUILD OK` — this is the definitive gate.

```bash
grep -rn "getBranchStockKpis\|BranchStockKpis" apps/web/src/
```
Expected: no matches.

```bash
grep -n "^export interface" apps/web/src/app/dashboard/stock/actions.ts
```
Expected: no matches (all interfaces exported from `actions.ts` have been moved and replaced with `export type { ... }` re-exports).

### Step 8: Commit

```bash
git add apps/web/src/app/dashboard/stock/actions.ts \
  apps/web/src/app/dashboard/stock/movements-data.ts \
  apps/web/src/app/dashboard/stock/tool-activity-data.ts \
  apps/web/src/app/dashboard/stock/branch-stock-data.ts \
  apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx \
  apps/web/src/app/dashboard/tools/\[id\]/_components/activity-tab.tsx \
  apps/web/src/app/dashboard/tools/\[id\]/_components/activity-tab-client.tsx \
  apps/web/src/app/dashboard/tools/\[id\]/_components/activity-filters.tsx \
  apps/web/src/app/dashboard/tools/\[id\]/_components/activity-timeline.tsx \
  apps/web/src/app/dashboard/stock/__tests__/guards.test.ts

git commit -m "refactor: mover reads de estoque p/ camada data"
```

## Test plan

The existing `guards.test.ts` file tests that `getStockMovements` and `getToolActivity` reject unauthenticated calls. After this plan:

- **Update existing tests** to import from `movements-data` and `tool-activity-data` (Step 6 above).
- **Add new guard tests** for `getStockMovementsByVariantBranch`, `fetchVariantBranchMovementsPage`, and `getReservedQtyByVariantBranch` (all guard with `requireCurrentSession`).
- **Model after** `apps/web/src/app/dashboard/stock/__tests__/guards.test.ts` — same mock pattern.

Verification: `bun --cwd apps/web test` → all pass, including the new guard tests (3 new describe blocks, ~4 new `it` cases).

No new data-correctness tests are needed: this is a pure move with no logic changes. The build gate (`bun run --cwd apps/web build`) is the authoritative correctness check for the `"use server"` boundary.

## Done criteria

ALL must hold before marking this plan DONE:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` exits 0 (all tests pass, including new guard tests)
- [ ] `bun run --cwd apps/web build` exits 0
- [ ] `grep -n "^export interface" apps/web/src/app/dashboard/stock/actions.ts` returns no matches
- [ ] `grep -rn "getBranchStockKpis\|BranchStockKpis" apps/web/src/` returns no matches
- [ ] `head -1 apps/web/src/app/dashboard/stock/branch-stock-data.ts` outputs `import "server-only";`
- [ ] `grep -n "export.*getStockMovements\|export.*getStockMovementsByVariantBranch\|export.*fetchVariantBranchMovementsPage\|export.*getReservedQtyByVariantBranch\|export interface StockMovementRow" apps/web/src/app/dashboard/stock/movements-data.ts` returns 5 matches
- [ ] `grep -n "export.*getToolActivity\|export.*fetchToolActivityPage\|export interface ToolActivityRow\|export interface ToolActivityFilters" apps/web/src/app/dashboard/stock/tool-activity-data.ts` returns 4 matches
- [ ] No files outside the in-scope list are modified (`git diff --name-only HEAD`)
- [ ] `plans/README.md` status row for plan 042 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations described in "Current state" does not match the excerpts — the codebase has drifted since this plan was written at SHA `03984800`.
- `bun run --cwd apps/web build` fails after Step 4 with an error other than "Only async functions are allowed…" — that specific error means a non-async export remains in `actions.ts`; fix it. Any other build error is unexpected and needs human review.
- `bun check-types` produces errors in files outside the in-scope list — this means the import changes had wider blast radius than anticipated.
- You find that `getStockMovementsByVariantBranch` is called from outside `branch-stock-edit-sheet.tsx` and `actions.ts` — grep for it; if you find an unaccounted caller, stop and report.
- The guards test file structure differs materially from what is described (e.g. the mock at the top doesn't include `requireCurrentSession`) — do not guess; stop and report.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching `packages/db/` or `packages/auth/` — those are out of scope.

## Maintenance notes

- **Plan 045 (pagination helpers)** should migrate the two hand-rolled `hasMore`/`slice` patterns in `fetchVariantBranchMovementsPage` and `fetchToolActivityPage` to `paginate()` from `@/lib/infinite`. They are preserved as-is intentionally in this plan to keep the diff minimal. A comment `// TODO plan 045: migrar para paginate()` can be added at those sites.
- **`branch-stock-data.ts` directive change** is guarded by the build gate. The file already worked correctly at runtime (Next.js ignores functions that aren't called via POST), but correcting it prevents future contributors from accidentally exporting a non-async from it.
- **A reviewer should verify** that the 3 thin wrappers in `actions.ts` (Step 4c) do not add a redundant second auth guard — the guard lives in the data function; the wrapper just delegates. Double-guarding is not harmful but is noise.
- **`useMemo` in `activity-tab-client.tsx`** (line 43): the file currently uses `useMemo` for the `filters` object. React Compiler is ON in this project (`next.config.ts: reactCompiler: true`), so this `useMemo` is technically redundant (CLAUDE.md anti-pattern). Do NOT remove it in this plan — that's a separate concern; leave it as found to keep the diff minimal.
