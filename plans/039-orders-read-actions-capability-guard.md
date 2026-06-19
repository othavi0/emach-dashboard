# Plan 039: Add requireCapability("orders.read") to the 5 orders read server-actions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 03984800..HEAD -- apps/web/src/app/dashboard/orders/actions.ts apps/web/src/app/dashboard/orders/__tests__/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

Five read wrappers exported from `orders/actions.ts` are POST-callable server actions reachable by any authenticated client. They currently skip the `requireCapability("orders.read")` guard and delegate directly to impls that only run `requireCurrentSession()` (active-session check). ADR-0018 established that all read wrappers in `actions.ts` must carry a capability guard because they are endpoints, not internal functions. The gap only fires when a per-user override explicitly revokes `orders.read` (ADR-0017), but that is precisely the scenario ADR-0018 was designed to close — as it did for branches, suppliers, stock, and categories in plan 012. Closing this makes orders consistent with the rest of the dashboard's security posture.

## Current state

### Relevant files

- `apps/web/src/app/dashboard/orders/actions.ts` — `"use server"` file; contains 5 read wrappers (lines 58–94) plus guarded mutations below. `requireCapability` is already imported at line 23 but unused for the read wrappers.
- `apps/web/src/app/dashboard/orders/data.ts` — `server-only` module; `fetchOrdersPage` impl calls `requireCurrentSession()` at line 281 (branch-scope guard; must remain untouched).
- `apps/web/src/app/dashboard/orders/pending-data.ts` — `server-only` module; `fetchPendingOrdersPage` impl calls `requireCurrentSession()` at line 36; `fetchOrderActivityPage` at line 116. Both must remain untouched.
- `apps/web/src/app/dashboard/orders/__tests__/assign-branch.test.ts` — existing test file; structural exemplar for mocking pattern (use as reference when writing guards test).
- `apps/web/src/app/dashboard/branches/__tests__/guards.test.ts` — canonical exemplar for read-capability guard tests; model the new test file after this one.
- `apps/web/src/lib/capabilities.ts:169` — `"orders.read"` is defined with `defaultRoles: SAU` (all three roles). The capability key is the string literal `"orders.read"`.

### Current code — 5 read wrappers in `actions.ts` (lines 58–94, confirmed)

```typescript
// actions.ts line 58 — NO guard before delegation
export async function fetchOrdersPage(args: {
  filters: OrdersPageFiltersInput;
  cursor: string | null;
}): Promise<InfiniteResult<OrderListItem>> {
  return await fetchOrdersPageImpl(args);
}

export async function fetchPendingOrdersPage(args: {
  statuses: OrderStatus[];
  cursor: string | null;
}): Promise<InfiniteResult<PendingRow>> {
  return await fetchPendingOrdersPageImpl(args);
}

export async function fetchPendingAwaitingOrdersPage(
  cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
  return await fetchPendingOrdersPageImpl({
    statuses: ["paid", "pending_payment"],
    cursor,
  });
}

export async function fetchPendingFlowOrdersPage(
  cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
  return await fetchPendingOrdersPageImpl({
    statuses: ["preparing", "shipped"],
    cursor,
  });
}

export async function fetchOrderActivityPage(
  cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
  return await fetchOrderActivityPageImpl(cursor);
}
```

### Pattern to produce (thin-wrapper shape — match branches exemplar)

Add `await requireCapability("orders.read");` as the **first** statement inside each of the 5 wrappers, before any delegation. `requireCapability` is already imported at line 23 — no import change needed.

```typescript
export async function fetchOrdersPage(args: {
  filters: OrdersPageFiltersInput;
  cursor: string | null;
}): Promise<InfiniteResult<OrderListItem>> {
  await requireCapability("orders.read");
  return await fetchOrdersPageImpl(args);
}
```

Apply the same one-line addition to the remaining four wrappers (`fetchPendingOrdersPage`, `fetchPendingAwaitingOrdersPage`, `fetchPendingFlowOrdersPage`, `fetchOrderActivityPage`).

### Conventions that apply

- `requireCapability` throws `Error("Forbidden: ...")` when the guard fails. The read wrappers are allowed to propagate this throw (callers handle it) — no try/catch wrapping needed.
- `requireCurrentSession()` inside the data-layer impls (`data.ts`, `pending-data.ts`) must be preserved; it powers branch-scoping logic. The capability guard in the wrapper is a separate pre-flight.
- `"use server"` constraint: only async functions may be exported. The wrappers are already async; the guard line does not change the export shape.
- ADR-0018 mandates: every read wrapper in `actions.ts` calls `requireCapability` as its first statement. This plan brings orders into conformance.

## Commands you will need

| Purpose       | Command                                              | Expected on success         |
|---------------|------------------------------------------------------|-----------------------------|
| Typecheck     | `bun check-types`                                    | exit 0, no errors           |
| Lint          | `bun check`                                          | exit 0, no errors           |
| Tests         | `bun --cwd apps/web test orders`                     | all pass, incl. 5 new tests |
| Full verify   | `bun verify`                                         | exit 0 (chains all three)   |
| Build (gate)  | `bun run --cwd apps/web build`                       | exit 0, no build errors     |

> **Build gate note**: `bun run --cwd apps/web build` is mandatory after editing a `"use server"` file. `check-types` and lint do NOT catch "only async functions" violations — only the build does.

## Scope

**In scope** (the only files you should modify or create):
- `apps/web/src/app/dashboard/orders/actions.ts` — add `await requireCapability("orders.read");` as first line of 5 wrappers
- `apps/web/src/app/dashboard/orders/__tests__/orders-read-guards.test.ts` — create new test file

**Out of scope** (do NOT touch, even if they look related):
- `apps/web/src/app/dashboard/orders/data.ts` — internal `server-only` impl; `requireCurrentSession()` here is branch-scope logic, not a duplicate of the capability guard.
- `apps/web/src/app/dashboard/orders/pending-data.ts` — same as above; must not be modified.
- `apps/web/src/app/dashboard/orders/__tests__/assign-branch.test.ts` — existing passing test; do not touch.
- Any mutation function in `actions.ts` (`updateOrderStatus`, `addOrderNote`, `togglePinNote`, `assignBranch`, `updateTrackingCode`, `markShippingReviewed`, `refundOrder`, `lockOrderAndAuthorize`) — already guarded differently; out of scope.
- `apps/web/src/lib/capabilities.ts` — `orders.read` is already defined; no change needed.

## Git workflow

- Branch: `advisor/039-orders-read-actions-capability-guard`
- One commit per step is fine; or combine both steps into a single commit if preferred.
- Commit message style (Conventional Commits, PT, subject ≤50 chars):
  `feat(orders): guards orders.read nas 5 read actions`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `await requireCapability("orders.read")` to the 5 read wrappers in `actions.ts`

Read `apps/web/src/app/dashboard/orders/actions.ts` before editing.

Add `await requireCapability("orders.read");` as the **first** statement in each of the following 5 functions (lines 58–94). `requireCapability` is already imported at line 23 — no import change is needed.

Functions to edit (exact names, in order):
1. `fetchOrdersPage` (line 58) — add guard before `return await fetchOrdersPageImpl(args);`
2. `fetchPendingOrdersPage` (line 65) — add guard before `return await fetchPendingOrdersPageImpl(args);`
3. `fetchPendingAwaitingOrdersPage` (line 72) — add guard before the `return await fetchPendingOrdersPageImpl({...})` call
4. `fetchPendingFlowOrdersPage` (line 81) — add guard before the `return await fetchPendingOrdersPageImpl({...})` call
5. `fetchOrderActivityPage` (line 90) — add guard before `return await fetchOrderActivityPageImpl(cursor);`

Target shape (same for all five — only the inner delegation differs):
```typescript
export async function fetchOrdersPage(args: {
  filters: OrdersPageFiltersInput;
  cursor: string | null;
}): Promise<InfiniteResult<OrderListItem>> {
  await requireCapability("orders.read");
  return await fetchOrdersPageImpl(args);
}
```

**Verify**: `bun check-types` → exit 0, no errors.

### Step 2: Create the guards test file

Create `apps/web/src/app/dashboard/orders/__tests__/orders-read-guards.test.ts`.

Model this file after `apps/web/src/app/dashboard/branches/__tests__/guards.test.ts` (the canonical exemplar for read-capability guard tests). Read that file first for the exact structure.

The test file must:
1. Mock `@/lib/permissions` at the top (before any imports of the SUT), providing at minimum `requireCapability` as a `vi.fn()`.
2. Also mock `../data` and `../pending-data` so the tests don't attempt real DB calls.
3. Import all 5 wrappers from `../actions` after the mocks.
4. For each wrapper, write one `describe` block with one test: "rejeita quando requireCapability lança" — make `requireCapability` throw `new Error('Forbidden: capability "orders.read" requerida')`, call the wrapper, and assert the rejection includes `"orders.read"`.

Minimum content (expand to cover all 5):
```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
  requireCapability: vi.fn(),
  requireCapabilityWithContext: vi.fn(),
  getUserCapabilities: vi.fn().mockResolvedValue([]),
  roleHasCapability: vi.fn().mockReturnValue(true),
  can: vi.fn().mockResolvedValue(true),
}));

vi.mock("../data", () => ({
  fetchOrdersPage: vi.fn(),
  ORDERS_COUNTS_TAG: "orders-counts",
}));

vi.mock("../pending-data", () => ({
  fetchPendingOrdersPage: vi.fn(),
  fetchOrderActivityPage: vi.fn(),
}));

// Also mock next/cache and @emach/db to avoid runtime errors
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@emach/db", () => ({ db: {}, createDb: vi.fn(() => ({})) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/session", () => ({
  requireCurrentSession: vi.fn(),
  ROLE_WEIGHT: { super_admin: 3, admin: 2, user: 1 },
}));

import { requireCapability } from "@/lib/permissions";
import {
  fetchOrdersPage,
  fetchPendingOrdersPage,
  fetchPendingAwaitingOrdersPage,
  fetchPendingFlowOrdersPage,
  fetchOrderActivityPage,
} from "../actions";

const FORBIDDEN = new Error('Forbidden: capability "orders.read" requerida');

describe("fetchOrdersPage — guard", () => {
  it("rejeita quando requireCapability lança", async () => {
    vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
    await expect(
      fetchOrdersPage({ filters: { tab: undefined }, cursor: null })
    ).rejects.toThrow("orders.read");
  });
});

describe("fetchPendingOrdersPage — guard", () => {
  it("rejeita quando requireCapability lança", async () => {
    vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
    await expect(
      fetchPendingOrdersPage({ statuses: ["paid"], cursor: null })
    ).rejects.toThrow("orders.read");
  });
});

describe("fetchPendingAwaitingOrdersPage — guard", () => {
  it("rejeita quando requireCapability lança", async () => {
    vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
    await expect(fetchPendingAwaitingOrdersPage(null)).rejects.toThrow(
      "orders.read"
    );
  });
});

describe("fetchPendingFlowOrdersPage — guard", () => {
  it("rejeita quando requireCapability lança", async () => {
    vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
    await expect(fetchPendingFlowOrdersPage(null)).rejects.toThrow("orders.read");
  });
});

describe("fetchOrderActivityPage — guard", () => {
  it("rejeita quando requireCapability lança", async () => {
    vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);
    await expect(fetchOrderActivityPage(null)).rejects.toThrow("orders.read");
  });
});
```

> **Note on `fetchOrdersPage` call shape**: the exact `filters` type is `OrdersPageFiltersInput` — check `data.ts` for the exported type if the test throws a TypeScript error on `{ tab: undefined }` and adjust the arg accordingly (e.g., `{ filters: {} as OrdersPageFiltersInput, cursor: null }`). Since `requireCapability` throws before delegation, the exact filter value does not matter for these tests.

**Verify**: `bun --cwd apps/web test orders` → exit 0, all tests pass including 5 new ones in `orders-read-guards.test.ts`.

### Step 3: Run the full build gate

**Verify**: `bun run --cwd apps/web build` → exit 0, no build errors.

This confirms no `"use server"` export constraint was violated.

### Step 4: Run the full verify suite

**Verify**: `bun verify` → exit 0 (chains `check-types && check && test`).

## Test plan

**New test file**: `apps/web/src/app/dashboard/orders/__tests__/orders-read-guards.test.ts`

Cases (one per wrapper, 5 total):
- `fetchOrdersPage` — guard rejects when `requireCapability` throws `Forbidden`
- `fetchPendingOrdersPage` — same
- `fetchPendingAwaitingOrdersPage` — same
- `fetchPendingFlowOrdersPage` — same
- `fetchOrderActivityPage` — same

Structural pattern: `apps/web/src/app/dashboard/branches/__tests__/guards.test.ts` (read that file before writing — it is the canonical exemplar for this test style in the codebase).

Verification: `bun --cwd apps/web test orders` → all pass, 5 new tests present.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test orders` exits 0; 5 new tests in `orders-read-guards.test.ts` pass
- [ ] `bun run --cwd apps/web build` exits 0
- [ ] `grep -n "await requireCapability" apps/web/src/app/dashboard/orders/actions.ts` shows at least 5 occurrences of `"orders.read"` in the read wrappers (lines ~58–94)
- [ ] `git diff --name-only` shows only `apps/web/src/app/dashboard/orders/actions.ts` and `apps/web/src/app/dashboard/orders/__tests__/orders-read-guards.test.ts`
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The 5 read wrappers in `actions.ts` (lines 58–94) don't match the excerpts in "Current state" — the file has drifted since this plan was written.
- `requireCapability` is NOT already imported at line 23 of `actions.ts` — do not add a new import without verifying the existing import list (an import change touching a "use server" file requires extra care).
- The build step (Step 3) fails with a "use server" export error — stop; do not attempt a workaround. Report the exact error.
- A step's verification fails twice after a reasonable fix attempt.
- Fixing the test requires touching `data.ts` or `pending-data.ts` — those are out of scope; stop and report.
- The `OrdersPageFiltersInput` type mismatch in tests cannot be resolved without importing from `data.ts` inside the test file in a way that pulls in `@emach/db` (which would require additional mocking) — stop and report the exact TypeScript error.

## Maintenance notes

- ADR-0018 requires all read wrappers in `actions.ts` to carry a `requireCapability` guard. When adding a new read wrapper to `orders/actions.ts` in the future, always add `await requireCapability("orders.read")` as the first line and add a corresponding test case to `orders-read-guards.test.ts`.
- The reviewer should verify that `requireCapability("orders.read")` is the **first** statement in each of the 5 wrappers — not after any other `await` or conditional.
- The `requireCurrentSession()` calls inside `data.ts` and `pending-data.ts` are intentionally preserved — they gate branch-scoping and are independent of the capability check in the wrapper layer.
- If `orders.read` is ever split into finer-grained capabilities (e.g., `orders.read_pending` vs `orders.read_list`), update both `actions.ts` guards and the corresponding tests.
