# Plan 049: Finish branch-stock-edit-sheet decomposition and fix order-action-column @emach/db import

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
>   apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx \
>   apps/web/src/app/dashboard/orders/\[id\]/_components/order-action-column.tsx \
>   packages/db/src/queries/branch-cep.ts \
>   apps/web/src/lib/
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/029-decompose-branch-stock-edit-sheet.md (predecessor); coordinate with plan 042 (stock reads — if 042 landed, `StockMovementRow` may have moved)
- **Category**: tech-debt
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

Plan 029 (marked DONE) set a Done criterion of ≤ 450 LOC for `branch-stock-edit-sheet.tsx`, but
the file currently sits at **616 LOC** because three inline sub-components were never extracted.
`MovementsCard` owns its own `useState`/`useTransition`/infinite-scroll and is independently
testable but is invisible to search and tooling.

`order-action-column.tsx` (530 LOC, `"use client"`) imports `matchBranchByCep` directly from
`@emach/db/queries/branch-cep`. The function is pure (no DB call), so it does not break the build
today, but the import pulls drizzle-orm/pg-core schema objects into the browser bundle and is
fragile if `branch-cep.ts` ever gains a real server import. Moving the pure helper to a shared util
file inside `apps/web/src/lib/` fixes the violation with zero behavior change.

## Current state

### File inventory

- `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` — **616 LOC**, `"use client"`. Contains four inline sub-components that should be separate files: `MovementsCard` (lines 123–204), `SheetHead` (lines 207–289), `StatsPanel` (lines 293–338), `StatCard` (lines 595–616).
- `apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx` — **530 LOC**, `"use client"`. Imports `matchBranchByCep` from `@emach/db/queries/branch-cep` at line 3; uses it at lines 310–315.
- `packages/db/src/queries/branch-cep.ts` — 78 LOC. Exports: `normalizeCep` (pure), `matchBranchByCep` (pure), `getBranchByCep` (async, uses `NodePgDatabase`). Only `matchBranchByCep` is used by the client component.
- `apps/web/src/app/dashboard/stock/actions.ts` — `"use server"`. Exports `StockMovementRow` interface at line 326 and `fetchVariantBranchMovementsPage` at line 419. These are the imports used by `MovementsCard`.

### Relevant excerpts

**branch-stock-edit-sheet.tsx — MovementsCard signature (lines 124–128):**
```ts
interface MovementsCardProps {
  branchId: string;
  toolId: string;
  variantId: string;
}
```

**branch-stock-edit-sheet.tsx — SheetHead signature (lines 208–214):**
```ts
interface SheetHeadProps {
  branchName: string;
  lead: "branch" | "tool";
  row: BranchStockRow;
  status: StockStatus;
  statusLabel: string | null;
}
```

**branch-stock-edit-sheet.tsx — StatsPanel signature (lines 293–298):**
```ts
interface StatsPanelProps {
  available: number | null;
  quantityColor: string;
  reservedQty: number | null;
  row: BranchStockRow;
}
```

**branch-stock-edit-sheet.tsx — StatCard signature (lines 596–603):**
```ts
function StatCard({
  label,
  value,
  colorClass = "text-foreground",
}: {
  colorClass?: string;
  label: string;
  value: number | string;
})
```

**order-action-column.tsx — offending import (line 3):**
```ts
import { matchBranchByCep } from "@emach/db/queries/branch-cep";
```

**order-action-column.tsx — usage (lines 309–316):**
```ts
if (order.status === "paid") {
  const suggested = matchBranchByCep(
    order.shippingAddress.zipCode ?? "",
    branches.map((b) => ({ id: b.id, cepRanges: b.cepRanges ?? null }))
  );
  return suggested ?? "";
}
```

**packages/db/src/queries/branch-cep.ts — pure functions to move (lines 16–55):**
```ts
const CEP_DIGITS = /^\d{8}$/;

export function normalizeCep(raw: string | null | undefined): string | null { ... }

function cepInRange(cep: string, range: CepRange): boolean { ... }

export function matchBranchByCep(
  cep: string,
  branches: BranchWithCepRanges[]
): string | null { ... }
```

### Repo conventions that apply

- **"use client" never imports from `@emach/db`** (CLAUDE.md root, "Client Component nunca importa fn de @emach/db"). Even if a function is pure, the import traverses through `@emach/db/queries/branch-cep` which imports from `../schema/inventory` (drizzle-orm schema objects) → bundled into client.
- **No barrel files** (CLAUDE.md root). Do not create an `index.ts` re-export file; import from the leaf file directly.
- **No `useMemo`/`useCallback`** — React Compiler is active (`next.config.ts: reactCompiler: true`).
- **File decomposition pattern**: new files are co-located in the same `_components/` directory as the parent. See `tools/_components/` or `stock/_components/` for examples.
- **Imports**: `@/...` resolves to `src/...`.
- `StockMovementRow` is currently exported from `apps/web/src/app/dashboard/stock/actions.ts` line 326. If plan 042 has landed and moved it, import from its new location instead (check with `grep -rn "export interface StockMovementRow" apps/web/src/`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Type check | `bun check-types` | exit 0, no errors |
| Lint | `bun check` | exit 0, no errors |
| Tests | `bun --cwd apps/web test` | all pass (≥481 tests) |
| Build (mandatory — "use client" boundary) | `bun run --cwd apps/web build` | exit 0 |
| Verify LOC after split | `wc -l apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` | < 450 |
| Verify no @emach/db import in client component | `grep -n "@emach/db" apps/web/src/app/dashboard/orders/\[id\]/_components/order-action-column.tsx` | no output |
| Verify new util file exists | `ls apps/web/src/lib/cep-match.ts` | file listed |

## Scope

**In scope** (the only files you should modify or create):

- `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` — remove inline sub-components; import from new files
- `apps/web/src/app/dashboard/stock/_components/branch-stock-movements-card.tsx` — **create**
- `apps/web/src/app/dashboard/stock/_components/branch-stock-sheet-head.tsx` — **create**
- `apps/web/src/app/dashboard/stock/_components/branch-stock-stats-panel.tsx` — **create** (includes `StatCard`)
- `apps/web/src/lib/cep-match.ts` — **create** (pure util extracted from `packages/db/src/queries/branch-cep.ts`)
- `apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx` — update import from `@emach/db/queries/branch-cep` to `@/lib/cep-match`
- `packages/db/src/queries/branch-cep.ts` — optionally import from or re-export from the new `cep-match.ts` (see Step 4); do NOT remove `normalizeCep`/`matchBranchByCep` if `getBranchByCep` uses them internally

**Out of scope** (do NOT touch, even if they look related):

- `apps/web/src/app/dashboard/stock/actions.ts` — stock reads extraction is plan 042
- `apps/web/src/app/dashboard/stock/_components/stock-entry-form.tsx`, `stock-recount-form.tsx`, `stock-write-off-form.tsx` — already extracted in plan 029
- Any other file not listed above
- `packages/db/src/queries/branch-cep.ts` exports used by server-side consumers — do not remove `getBranchByCep` or break its callers
- `apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx` beyond the one import change (the optional `PrimaryActionContent` extraction is noted, not required)

## Git workflow

- Branch: `advisor/049-decompose-large-components`
- Commit style: Conventional Commits in Portuguese, subject ≤ 50 chars
- Example commits:
  - `refactor(stock): extrai MovementsCard p/ arquivo próprio`
  - `refactor(stock): extrai SheetHead e StatsPanel`
  - `refactor(orders): move matchBranchByCep p/ lib/cep-match`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Confirm StockMovementRow location

Before extracting `MovementsCard`, confirm where `StockMovementRow` is currently exported (plan 042 may have moved it).

```bash
grep -rn "export interface StockMovementRow" apps/web/src/
```

**Verify**: Command outputs one match. Note the file path — use it as the `StockMovementRow` import source in the extracted `MovementsCard` file.

If 042 has NOT landed: it's in `apps/web/src/app/dashboard/stock/actions.ts:326`.
If 042 HAS landed: use whatever path the grep shows.

---

### Step 1: Create `branch-stock-movements-card.tsx`

Read `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` lines 1–204 to confirm the exact code.

Create `apps/web/src/app/dashboard/stock/_components/branch-stock-movements-card.tsx` with the following structure:

```ts
"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import {
  fetchVariantBranchMovementsPage,
  type StockMovementRow,   // <-- or the new path from Step 0
} from "../actions";        // <-- or new path if 042 landed
import { STOCK_MOVEMENT_REASON_LABELS } from "./stock-movement-schema";

// Copy the RELATIVE and formatRelative helpers verbatim from lines 59–79 of
// branch-stock-edit-sheet.tsx. These are only used by MovementRow.

// Copy the MovementRow function (lines 83–120) verbatim.

// Copy the MovementsCard interface + function (lines 124–204) verbatim.
// Export the function: change `function MovementsCard` to `export function MovementsCard`.
```

After creating the file, confirm it compiles:

```bash
bun check-types
```

**Verify**: `bun check-types` exits 0, no errors.

---

### Step 2: Create `branch-stock-sheet-head.tsx`

Read `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` lines 207–289 to confirm the exact code.

Create `apps/web/src/app/dashboard/stock/_components/branch-stock-sheet-head.tsx`:

```ts
"use client";

import {
  SheetHeader,
  SheetTitle,
} from "@emach/ui/components/sheet";
import { ExternalLink, Wrench } from "lucide-react";
import type { BranchStockRow } from "../branch-stock-data";
import { type StockStatus } from "./stock-status";

// Copy STATUS_CLASS constant verbatim from branch-stock-edit-sheet.tsx (lines 46–52).
// Copy the SheetHeadProps interface and SheetHead function (lines 208–289) verbatim.
// Export: change `function SheetHead` to `export function SheetHead`.
// Export: change `interface SheetHeadProps` to `export interface SheetHeadProps`.
```

**Verify**: `bun check-types` exits 0, no errors.

---

### Step 3: Create `branch-stock-stats-panel.tsx`

Read `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` lines 293–338 and 595–616 to confirm the exact code.

Create `apps/web/src/app/dashboard/stock/_components/branch-stock-stats-panel.tsx`:

```ts
import type { BranchStockRow } from "../branch-stock-data";

// StatCard is internal to StatsPanel — export it too so callers can reuse.
export function StatCard({ label, value, colorClass = "text-foreground" }: {
  colorClass?: string;
  label: string;
  value: number | string;
}) { /* copy verbatim from lines 595-616 */ }

// Copy StatsPanelProps interface and StatsPanel function verbatim (lines 293-338).
// Export: change `function StatsPanel` to `export function StatsPanel`.
// Export: change `interface StatsPanelProps` to `export interface StatsPanelProps`.
```

Note: `StatsPanel` uses `StatCard` internally. Placing both in the same file keeps the dependency obvious. No `"use client"` directive is needed here if the component contains no hooks — if `StatsPanel` JSX is rendered inside a `"use client"` parent it inherits the client boundary. However, to be explicit and safe, add `"use client"` at the top since `StatsPanel` renders UI under a client root.

**Verify**: `bun check-types` exits 0, no errors.

---

### Step 4: Update `branch-stock-edit-sheet.tsx`

Now replace the inline sub-components in `branch-stock-edit-sheet.tsx` with imports from the new files. Read the current file first.

Changes to make:
1. **Remove** the `RELATIVE`, `formatRelative` constants/functions (lines 59–79) — moved to `branch-stock-movements-card.tsx`.
2. **Remove** the `MovementRow` function (lines 83–120).
3. **Remove** the `MovementsCardProps` interface and `MovementsCard` function (lines 123–204).
4. **Remove** the `SheetHeadProps` interface and `SheetHead` function (lines 207–289).
5. **Remove** `STATUS_CLASS` constant (lines 46–52) — moved to `branch-stock-sheet-head.tsx`. Keep `STATUS_LABEL` (lines 39–44) if it is still used in `BranchStockEditSheet`.
6. **Remove** the `StatsPanelProps` interface and `StatsPanel` function (lines 293–338).
7. **Remove** the `StatCard` function (lines 595–616).
8. **Add** imports at the top:
   ```ts
   import { MovementsCard } from "./branch-stock-movements-card";
   import { SheetHead } from "./branch-stock-sheet-head";
   import { StatsPanel } from "./branch-stock-stats-panel";
   ```
9. Verify `STATUS_LABEL` remains in the file (it's used by `BranchStockEditSheet` at `const statusLabel = STATUS_LABEL[status]`).

**Verify**:
```bash
bun check-types
wc -l apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx
```

Expected: `check-types` exits 0; line count < 450.

---

### Step 5: Create `apps/web/src/lib/cep-match.ts`

Read `packages/db/src/queries/branch-cep.ts` first to confirm the exact code.

Create `apps/web/src/lib/cep-match.ts` with the pure functions extracted (no DB dependencies):

```ts
/**
 * Pure CEP-matching utilities — usable in both server and client contexts.
 * No DB imports. No server-only dependencies.
 *
 * Server-side convenience wrapper (getBranchByCep) stays in
 * packages/db/src/queries/branch-cep.ts.
 */

export interface CepRange {
  from: string;
  label?: string;
  to: string;
}

export interface BranchWithCepRanges {
  cepRanges: CepRange[] | null | undefined;
  id: string;
}

const CEP_DIGITS = /^\d{8}$/;

export function normalizeCep(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const digits = raw.replace(/\D/g, "");
  return CEP_DIGITS.test(digits) ? digits : null;
}

function cepInRange(cep: string, range: CepRange): boolean {
  const from = normalizeCep(range.from);
  const to = normalizeCep(range.to);
  if (!(from && to)) {
    return false;
  }
  return cep >= from && cep <= to;
}

/**
 * Em sobreposição de faixas entre filiais, retorna a PRIMEIRA filial cujo range
 * cobre o CEP (ordem do array). Sugestão não-autoritativa.
 */
export function matchBranchByCep(
  cep: string,
  branches: BranchWithCepRanges[]
): string | null {
  const normalized = normalizeCep(cep);
  if (!normalized) {
    return null;
  }
  for (const b of branches) {
    if (!b.cepRanges || b.cepRanges.length === 0) {
      continue;
    }
    if (b.cepRanges.some((range) => cepInRange(normalized, range))) {
      return b.id;
    }
  }
  return null;
}
```

**Verify**: `ls apps/web/src/lib/cep-match.ts` shows the file; `bun check-types` exits 0.

---

### Step 6: Update `packages/db/src/queries/branch-cep.ts` to import from the new util

Now that the pure logic lives in `apps/web/src/lib/cep-match.ts`, update `branch-cep.ts` so it does not duplicate the pure functions. However, `branch-cep.ts` is in the **ADR-0009 sync surface** (CI-synced dashboard → ecommerce), which means it **cannot import from outside `packages/db/src/{schema,queries,sql/}`**.

Therefore: **leave `packages/db/src/queries/branch-cep.ts` unchanged**. The duplication (same pure logic in two places) is intentional — it's the only way to satisfy both constraints:
- Client component cannot import from `@emach/db`
- `branch-cep.ts` cannot import from `apps/web/src/lib/`

Add a comment at the top of `packages/db/src/queries/branch-cep.ts` only if you want to note the duplication:

```ts
// NOTE: normalizeCep + matchBranchByCep are also duplicated in
// apps/web/src/lib/cep-match.ts for use in client components.
// The duplication is intentional: branch-cep.ts is in the ADR-0009
// sync surface and cannot import from apps/web.
```

This comment is optional. Do NOT attempt to deduplicate by importing across this boundary.

**Verify**: `bun check-types` exits 0; `packages/db/src/queries/branch-cep.ts` still exports `getBranchByCep` unchanged.

---

### Step 7: Update `order-action-column.tsx`

Replace the offending import on line 3:

```ts
// Remove:
import { matchBranchByCep } from "@emach/db/queries/branch-cep";

// Add:
import { matchBranchByCep } from "@/lib/cep-match";
```

No other changes to this file.

**Verify**:
```bash
grep -n "@emach/db" apps/web/src/app/dashboard/orders/\[id\]/_components/order-action-column.tsx
bun check-types
```

Expected: `grep` returns no output (zero matches); `check-types` exits 0.

---

### Step 8: Full gate

Run all verification gates in sequence:

```bash
bun check-types && bun check && bun --cwd apps/web test && bun run --cwd apps/web build
```

**Verify**: All four commands exit 0. Build must succeed — this validates the client import boundary (Item 2) which `check-types`/lint/test cannot catch.

---

### Step 9: Commit

```bash
git checkout -b advisor/049-decompose-large-components
git add apps/web/src/app/dashboard/stock/_components/branch-stock-movements-card.tsx \
        apps/web/src/app/dashboard/stock/_components/branch-stock-sheet-head.tsx \
        apps/web/src/app/dashboard/stock/_components/branch-stock-stats-panel.tsx \
        apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx
git commit -m "refactor(stock): extrai sub-componentes do sheet de estoque"

git add apps/web/src/lib/cep-match.ts \
        apps/web/src/app/dashboard/orders/\[id\]/_components/order-action-column.tsx
git commit -m "refactor(orders): move matchBranchByCep p/ lib/cep-match"
```

**Verify**: `git status` shows clean working tree; `git log --oneline -3` shows two new commits on `advisor/049-decompose-large-components`.

## Test plan

No new tests are required for this plan — it is a pure structural refactor with zero behavior change. All existing tests must continue to pass.

However, **smoke the UI manually** after running the build:

1. Start the dev server: `bun dev:web`
2. Navigate to a branch stock page and open the stock edit sheet — confirm it renders with movements, stats, and the header.
3. Navigate to an order detail page — confirm the action column renders and the branch pre-fill by CEP still works (open a `paid` order with a shipping address that has a matching branch CEP range).

There are no existing tests for these components in `apps/web/src/app/dashboard/stock/_components/__tests__/`. If tests are added in the future, the new extracted files (`branch-stock-movements-card.tsx`, `branch-stock-sheet-head.tsx`, `branch-stock-stats-panel.tsx`) are now independently testable.

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` exits 0 (all existing tests pass)
- [ ] `bun run --cwd apps/web build` exits 0
- [ ] `wc -l apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` prints < 450
- [ ] `grep -n "@emach/db" apps/web/src/app/dashboard/orders/\[id\]/_components/order-action-column.tsx` returns no output
- [ ] Three new files exist: `branch-stock-movements-card.tsx`, `branch-stock-sheet-head.tsx`, `branch-stock-stats-panel.tsx` in `apps/web/src/app/dashboard/stock/_components/`
- [ ] `apps/web/src/lib/cep-match.ts` exists
- [ ] No files outside the in-scope list are modified (`git diff --name-only HEAD~2`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- **Drift**: The code at any location in "Current state" does not match the excerpts — the codebase has changed since this plan was written. Run the drift check at the top and compare line-by-line.
- **Plan 042 landed and moved `StockMovementRow`**: The grep in Step 0 shows a path other than `apps/web/src/app/dashboard/stock/actions.ts`. Proceed with the new path — this is expected. If the type has been removed or renamed, STOP.
- **Build break**: `bun run --cwd apps/web build` fails after Step 7/8. This is the critical gate for client import boundary violations. Do not work around with `// @ts-ignore` or similar — investigate the root cause.
- **`STATUS_CLASS` still used in `branch-stock-edit-sheet.tsx`**: If the orchestrator references `STATUS_CLASS` directly (not via `SheetHead`), the constant must stay in the file or be re-imported. Check with `grep -n "STATUS_CLASS" apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` after Step 4.
- **A step's verification fails twice** after a reasonable fix attempt.
- **Any in-scope change requires touching an out-of-scope file** — report instead of touching it.
- **`packages/db/src/queries/branch-cep.ts` import chain breaks**: If removing/duplicating the pure functions breaks the server-side `getBranchByCep` (e.g., because of type mismatches between `BranchWithCepRanges` in `branch-cep.ts` vs `cep-match.ts`), do NOT attempt to reconcile by importing across the ADR-0009 boundary — report.

## Maintenance notes

- **Future: unify CepRange types.** There are now three `CepRange`-like types in the codebase: `packages/db/src/queries/branch-cep.ts`, `apps/web/src/lib/cep-match.ts` (new), and `apps/web/src/app/dashboard/branches/_components/cep-presets.ts`. Consolidating them into a shared package (e.g., `packages/shared`) would be a follow-up but is out of scope here — it requires careful ADR-0009 surface analysis.
- **Future: optional `PrimaryActionContent` extraction.** The lead noted that `order-action-column.tsx` at 530 LOC also has an extractable `PrimaryActionContent` sub-component (~lines 152–294). This is not required by this plan but is a natural follow-up.
- **Reviewer focus**: Confirm the `STATUS_CLASS` constant is not duplicated across `branch-stock-edit-sheet.tsx` and `branch-stock-sheet-head.tsx`. It should exist only in `branch-stock-sheet-head.tsx` after this plan lands.
- **ADR-0009 note**: `packages/db/src/queries/branch-cep.ts` remains in the CI sync surface. `apps/web/src/lib/cep-match.ts` is NOT in the sync surface and is dashboard-only.
