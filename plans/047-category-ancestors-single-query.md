# Plan 047: Substituir loop de ancestrais de categoria por query única com request-cache

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 03984800..HEAD -- apps/web/src/app/dashboard/categories/actions.ts apps/web/src/app/dashboard/categories/[id]/page.tsx apps/web/src/app/dashboard/categories/__tests__/`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/041-*.md if it exists (plan 041 moves category reads to data.ts; if that landed first, edit data.ts instead of actions.ts — check with `ls apps/web/src/app/dashboard/categories/data.ts`)
- **Category**: perf
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

`getCategoryAncestors` walks `parent_id` one hop at a time in a while-loop, issuing up to 5 sequential DB round-trips for a depth-4 category on every `/dashboard/categories/[id]` view. The function is called twice per render: once explicitly in the page's `Promise.all` and once again inside `getCategoryAttributes` — which is NOT request-cached — meaning the ancestor walk executes twice per request. Replacing the loop with a single `WITH RECURSIVE` CTE and wrapping the function in React `cache()` eliminates all redundant round-trips and collapses two ancestor walks into one deduped call per render.

## Current state

### File map

- `apps/web/src/app/dashboard/categories/actions.ts` — monolithic file containing all category server actions and read-functions (plan 041 has not landed; no `data.ts` exists yet). **This is the file to edit.**
- `apps/web/src/app/dashboard/categories/[id]/page.tsx` — detail page; calls `getCategoryAncestors(id)` and `getCategoryAttributes(id)` in the same render.
- `apps/web/src/app/dashboard/categories/__tests__/guards.test.ts` — existing test for auth guards (structural model for new test file).
- `packages/db/src/schema/categories.ts` — defines the `category` table with `parentId`, `path` (slug-based), `depth`.
- `packages/db/src/sql/triggers.sql` — the `prevent_category_cycle` trigger maintains `path` and `depth` on every INSERT/UPDATE.

### Relevant code (verify these excerpts match the real file before editing)

**`actions.ts` line 12** — `cache` is already imported:
```ts
import { cache } from "react";
```

**`actions.ts` lines 228-258** — current while-loop implementation:
```ts
/** Cadeia de ancestrais da raiz até o pai imediato (para o breadcrumb). */
export async function getCategoryAncestors(
	id: string
): Promise<{ id: string; name: string }[]> {
	await requireCapability("categories.read");
	const [self] = await db
		.select({ parentId: category.parentId })
		.from(category)
		.where(eq(category.id, id))
		.limit(1);

	const chain: { id: string; name: string }[] = [];
	let cursor: string | null = self?.parentId ?? null;
	while (cursor) {
		const [row]: { id: string; name: string; parentId: string | null }[] =
			await db
				.select({
					id: category.id,
					name: category.name,
					parentId: category.parentId,
				})
				.from(category)
				.where(eq(category.id, cursor))
				.limit(1);
		if (!row) {
			break;
		}
		chain.push({ id: row.id, name: row.name });
		cursor = row.parentId;
	}
	return chain.reverse();
}
```

**`actions.ts` lines 267-289** — `getCategoryAttributes` calls `getCategoryAncestors` uncached:
```ts
/** Atributos próprios da categoria + herdados da cadeia ancestral. */
export async function getCategoryAttributes(
	categoryId: string
): Promise<CategoryAttributeView[]> {
	await requireCapability("categories.read");
	const ancestors = await getCategoryAncestors(categoryId);
	// ...rest uses ancestors
```

**`[id]/page.tsx` lines 57-68** — double-call pattern:
```ts
const [detail, ancestors] = await Promise.all([
	getCategoryDetail(id),
	getCategoryAncestors(id),
]);
// ...
const attributes = isOverview ? await getCategoryAttributes(id) : [];
```

`getCategoryAttributes` internally calls `getCategoryAncestors(categoryId)` again — two ancestor walks per request when `isOverview` is true.

### Schema facts (do NOT change any schema file)

- `category.path` (text, not null): trigger-maintained, slug-based path (e.g. `/ferramentas/manuais/martelos`). Stores slugs, NOT IDs.
- `category.depth` (integer, not null): trigger-maintained (0 = root, max 5).
- `category.parentId` (text, nullable): FK to `category.id`.
- Index `category_path_idx` exists on `category.path`.

### Return shape contract

`getCategoryAncestors` must return `{ id: string; name: string }[]` ordered **root → immediate parent** (ascending depth), matching the current `chain.reverse()` output. The breadcrumb depends on this order — do NOT change it.

### Conventions that apply

- `"use server"` files may export **only async functions**. `getCategoryAncestors` is already async — wrapping it in `cache()` still yields an async function, so the export is valid. Do not add any sync exports or re-exports of types to `actions.ts`.
- Use `db.execute(sql\`...\`)` with explicit `AS "camelCase"` aliases for raw CTE queries — raw execute returns snake_case column names and timestamps as strings (`packages/db/CLAUDE.md`). For this query we only fetch `id` (text) and `name` (text), so no coercion is needed.
- Use `sql` from `drizzle-orm` for raw SQL template literals (already imported at line 10).
- Auth guard: `await requireCapability("categories.read")` must remain the first statement inside the function body (inside the `cache()` wrapper).
- Logging: use `logger` from `@/lib/logger` — no `console.*`.
- No `: any`, `as any`, `@ts-ignore`.

### Exemplar for test structure

`apps/web/src/app/dashboard/categories/__tests__/guards.test.ts` — minimal pattern for mocking `@/lib/permissions` and testing category actions (the test file to add to).

For a pure-function unit test without DB mocking, see:
`apps/web/src/app/dashboard/promotions/_lib/__tests__/promotion-query-helpers.test.ts`.

For DB-mock pattern (`vi.hoisted` + `vi.mock("@emach/db")`), inspect:
`apps/web/src/app/dashboard/orders/__tests__/assign-branch.test.ts` or any test in `suppliers/__tests__/`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Type-check | `bun check-types` | exit 0, no errors |
| Lint | `bun check` | exit 0, no warnings |
| Run tests (all) | `bun --cwd apps/web test` | all pass (≥68 files) |
| Run tests (filter) | `bun --cwd apps/web test ancestors` | new test file passes |
| Build (mandatory — "use server" gate) | `bun run --cwd apps/web build` | exits 0 |
| Verify old pattern gone | `grep -n "while (cursor)" apps/web/src/app/dashboard/categories/actions.ts` | no output |
| Verify cache wrapping | `grep -n "cache(" apps/web/src/app/dashboard/categories/actions.ts` | ≥2 matches (`listCategories` + `getCategoryAncestors`) |

## Scope

**In scope** (the only files you should modify or create):

- `apps/web/src/app/dashboard/categories/actions.ts` — replace loop, wrap in `cache()`
- `apps/web/src/app/dashboard/categories/__tests__/ancestors.test.ts` — create (new file)

**Out of scope** (do NOT touch, even if they look related):

- `apps/web/src/app/dashboard/categories/[id]/page.tsx` — callers need no change; `cache()` deduplication is transparent.
- `packages/db/src/schema/categories.ts` — schema is correct; no schema change needed.
- `packages/db/src/sql/triggers.sql` — trigger is not changing.
- Any other category file (`_components/`, `_lib/`, `new/`, `schema.ts`).
- Any other feature's actions or data files.
- `getCategoryDetail`, `listCategories`, `getCategoryProducts*`, `getCategoryChildren*`, `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`, `toggleCategoryActive` — do NOT touch these functions.

## Git workflow

- Branch: `advisor/047-category-ancestors-single-query`
- Commit per step; message style: Conventional Commits in Portuguese, subject ≤50 chars.
  - Example from repo: `perf(db): índice composto branch+status+created em order`
  - For this plan: `perf(categories): ancestrais via CTE + request-cache`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Check if plan 041 landed

```bash
ls apps/web/src/app/dashboard/categories/data.ts 2>/dev/null && echo "EXISTS" || echo "NOT FOUND"
```

- If `NOT FOUND`: edit `apps/web/src/app/dashboard/categories/actions.ts` (expected).
- If `EXISTS`: `getCategoryAncestors` may have moved to `data.ts`. Search: `grep -n "getCategoryAncestors" apps/web/src/app/dashboard/categories/data.ts`. Edit whichever file contains the function. Adjust all step references accordingly.

**Verify**: `grep -n "getCategoryAncestors" apps/web/src/app/dashboard/categories/actions.ts` → should show lines 228 and 271 (or nearby, after any drift).

### Step 1: Replace `getCategoryAncestors` with CTE + wrap in `cache()`

Open `apps/web/src/app/dashboard/categories/actions.ts`. Read it first. Locate the current `getCategoryAncestors` function (lines 227-258, starting with the JSDoc comment).

Replace the entire function (from the JSDoc comment through the closing `}`) with:

```ts
/** Cadeia de ancestrais da raiz até o pai imediato (para o breadcrumb). */
export const getCategoryAncestors = cache(
	async (id: string): Promise<{ id: string; name: string }[]> => {
		await requireCapability("categories.read");
		const rows = await db.execute<{ id: string; name: string; depth: number }>(
			sql`
				WITH RECURSIVE ancestors AS (
					SELECT c.id, c.name, c.parent_id, c.depth
					FROM category c
					WHERE c.id = (SELECT parent_id FROM category WHERE id = ${id})
					UNION ALL
					SELECT c.id, c.name, c.parent_id, c.depth
					FROM category c
					JOIN ancestors a ON c.id = a.parent_id
				)
				SELECT id, name, depth
				FROM ancestors
				ORDER BY depth ASC
			`
		);
		return rows.rows.map((r) => ({ id: r.id, name: r.name }));
	}
);
```

**Rationale:**
- The CTE starts from the immediate parent of `id` and walks up via `parent_id`, collecting all ancestors.
- `ORDER BY depth ASC` returns root first (depth 0) → immediate parent last, which matches the existing `chain.reverse()` output contract.
- `db.execute` returns `{ rows: T[] }` in drizzle 0.45. Access via `.rows`.
- `id` and `name` are both `text`, so no timestamp coercion needed.
- Wrapping in `cache()` means the second call within the same render (`getCategoryAttributes`) hits the in-memory cache — zero extra queries.
- `cache` is already imported at line 12; no new import needed.
- `sql` is already imported at line 10; no new import needed.

**Verify**:
```bash
grep -n "while (cursor)" apps/web/src/app/dashboard/categories/actions.ts
```
Expected: **no output** (the loop is gone).

```bash
grep -n "cache(" apps/web/src/app/dashboard/categories/actions.ts
```
Expected: at least 2 matches — `listCategories = cache(` and `getCategoryAncestors = cache(`.

### Step 2: Verify type-check and lint

```bash
bun check-types
```
Expected: exit 0, no errors.

```bash
bun check
```
Expected: exit 0, no lint warnings.

If `bun check-types` reports an error about `db.execute` return type, check: in drizzle 0.45 the return type of `db.execute<T>()` is `QueryResult<T>` which has a `.rows` property of type `T[]`. If the type is inferred differently in this repo, adjust to `(await db.execute<...>(...)).rows`.

### Step 3: Mandatory build gate

```bash
bun run --cwd apps/web build
```
Expected: exits 0 (Turbopack build succeeds). This is required for any change to a `"use server"` file — tsc and lint do not catch "use server" export violations.

**Verify**: build output ends with `✓ Compiled successfully` or equivalent success line, no `Only async functions are allowed to be exported` error.

### Step 4: Write the unit test

Create `apps/web/src/app/dashboard/categories/__tests__/ancestors.test.ts`.

The test should validate two things:
1. **Ancestor order**: ancestors are returned root-first (ascending depth).
2. **Cache deduplication guard**: the function is wrapped in `cache()` — test this by calling it twice with the same argument and asserting `db.execute` was called only once.

The test mocks `@/lib/permissions` (same pattern as `guards.test.ts`) and mocks `@emach/db` via `vi.hoisted` + `vi.mock` to control `db.execute` without a real DB connection.

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	requireCurrentSession: vi.fn(),
	can: vi.fn(),
}));

// Hoist the mock factory so it runs before any import.
const mockExecute = vi.hoisted(() => vi.fn());

vi.mock("@emach/db", () => ({
	db: { execute: mockExecute },
}));

// Import after mocks are registered.
import { requireCapability } from "@/lib/permissions";
import { getCategoryAncestors } from "../actions";

// React.cache() deduplication only works within a single render/request scope.
// In tests, each describe/it block runs without a React rendering context, so
// cache() behaves as a plain identity wrapper (calls the underlying fn every time).
// We test the output shape instead of dedup, and verify the guard fires.

describe("getCategoryAncestors", () => {
	it("retorna ancestrais em ordem raiz-primeiro (depth asc)", async () => {
		vi.mocked(requireCapability).mockResolvedValueOnce(undefined as never);
		mockExecute.mockResolvedValueOnce({
			rows: [
				{ id: "root-id", name: "Raiz", depth: 0 },
				{ id: "mid-id", name: "Meio", depth: 1 },
			],
		});

		const result = await getCategoryAncestors("leaf-id");

		expect(result).toEqual([
			{ id: "root-id", name: "Raiz" },
			{ id: "mid-id", name: "Meio" },
		]);
	});

	it("retorna array vazio quando a categoria não tem pai (raiz)", async () => {
		vi.mocked(requireCapability).mockResolvedValueOnce(undefined as never);
		mockExecute.mockResolvedValueOnce({ rows: [] });

		const result = await getCategoryAncestors("root-only-id");

		expect(result).toEqual([]);
	});

	it("chama requireCapability com categories.read", async () => {
		const FORBIDDEN = new Error("Forbidden: capability categories.read");
		vi.mocked(requireCapability).mockRejectedValueOnce(FORBIDDEN);

		await expect(getCategoryAncestors("any-id")).rejects.toThrow(
			"categories.read"
		);
		expect(vi.mocked(requireCapability)).toHaveBeenCalledWith("categories.read");
	});

	it("emite exatamente 1 query ao DB para qualquer profundidade de ancestral", async () => {
		vi.mocked(requireCapability).mockResolvedValue(undefined as never);
		mockExecute.mockResolvedValue({
			rows: [
				{ id: "a", name: "A", depth: 0 },
				{ id: "b", name: "B", depth: 1 },
				{ id: "c", name: "C", depth: 2 },
				{ id: "d", name: "D", depth: 3 },
			],
		});

		const result = await getCategoryAncestors("deep-leaf-id");

		// Single query regardless of depth — the old loop would have issued 4.
		expect(mockExecute).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(4);
	});
});
```

**Note on `vi.mocked(requireCapability).mockResolvedValue`**: the 4th test uses `mockResolvedValue` (not Once) to cover the `requireCapability` call. If the test order matters, add `beforeEach(() => { mockExecute.mockReset(); vi.mocked(requireCapability).mockReset(); })` at the top of the describe block.

**Verify**:
```bash
bun --cwd apps/web test ancestors
```
Expected: 4 tests pass, 0 failures.

### Step 5: Run full test suite

```bash
bun --cwd apps/web test
```
Expected: all tests pass (≥68 test files, including the 4 new ancestors tests and the existing guards.test.ts).

### Step 6: Commit

```bash
git add apps/web/src/app/dashboard/categories/actions.ts \
        apps/web/src/app/dashboard/categories/__tests__/ancestors.test.ts
git commit -m "perf(categories): ancestrais via CTE + request-cache"
```

**Verify**:
```bash
git show --stat HEAD
```
Expected: shows 2 files changed — `actions.ts` and `ancestors.test.ts`.

## Test plan

**New test file**: `apps/web/src/app/dashboard/categories/__tests__/ancestors.test.ts`

Cases (4 tests):

1. **Ancestor order (happy path)**: DB returns rows with `depth 0` then `depth 1`; assert result is `[{id:"root-id",…}, {id:"mid-id",…}]` — root first.
2. **Empty result (root category)**: DB returns `{ rows: [] }`; assert result is `[]` — no crash.
3. **Auth guard**: `requireCapability` rejects; assert the function rejects and that `requireCapability` was called with `"categories.read"`.
4. **Single query invariant**: DB returns 4 ancestor rows; assert `mockExecute` was called exactly once — proving the loop is gone.

**Structural model**: `apps/web/src/app/dashboard/categories/__tests__/guards.test.ts` for the permission mock pattern; `apps/web/src/app/dashboard/promotions/_lib/__tests__/promotion-query-helpers.test.ts` for pure-function style.

**Run command**:
```bash
bun --cwd apps/web test ancestors
```
→ 4 tests pass.

## Done criteria

All must hold before marking this plan DONE:

- [ ] `grep -n "while (cursor)" apps/web/src/app/dashboard/categories/actions.ts` returns **no output**
- [ ] `grep -n "getCategoryAncestors = cache" apps/web/src/app/dashboard/categories/actions.ts` returns **1 match**
- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun run --cwd apps/web build` exits 0
- [ ] `bun --cwd apps/web test ancestors` exits 0 with 4 tests passing
- [ ] `bun --cwd apps/web test` exits 0 (full suite, including guards.test.ts unchanged)
- [ ] `git status` shows only the 2 in-scope files modified/created
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The `getCategoryAncestors` function body at lines 228-258 does not match the excerpt in "Current state" (the codebase has drifted — plan 041 may have landed).
- `ls apps/web/src/app/dashboard/categories/data.ts` returns a file (plan 041 landed; re-read that file first; `getCategoryAncestors` may have moved there — edit `data.ts` instead).
- `bun run --cwd apps/web build` fails with an `Only async functions are allowed to be exported` error — this means a non-async export leaked into the `"use server"` file during editing.
- `bun check-types` fails on `db.execute` return type — the drizzle version may expose the result differently; stop and report the exact error.
- The CTE query produces a different ancestor order than the old loop in a manual smoke test (navigate to `/dashboard/categories/<id>` in dev and check the breadcrumb matches the expected hierarchy).
- A step's verification fails twice after a reasonable fix attempt.
- Fixing the failing verification would require touching an out-of-scope file.

## Maintenance notes

- **Plan 041 interaction**: if plan 041 (god-module split) lands after this plan, the executor of 041 must move `getCategoryAncestors` (now a `const` wrapped in `cache()`) into `data.ts`. The `cache()` wrapper is valid in a `server-only` module. The `"use server"` constraint (async-only exports) will no longer apply once the function lives in `data.ts`.
- **Depth limit**: the CTE has no explicit depth bound (the trigger enforces `depth <= 5` via the `depth_max_5` CHECK, so unbounded recursion is impossible in practice). If the depth constraint is ever relaxed, consider adding `WHERE a.depth < N` to the CTE.
- **Cache scope**: React `cache()` deduplicates within a single React render tree (one HTTP request). It does NOT persist across requests — each new page load runs the query fresh. This is the intended behavior for breadcrumb data.
- **PR review focus**: verify the CTE output order (`ORDER BY depth ASC`) produces root-first, and that the `.rows` accessor is correct for the drizzle version in use.
- **Follow-up explicitly deferred**: a full god-module split of `actions.ts` into `data.ts` + `actions.ts` (plan 041 scope) — out of scope here. This plan only targets the ancestor query and its cache wrapper.
