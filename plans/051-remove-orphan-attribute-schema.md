# Plan 051: Remover funções órfãs buildAttributeValuesSchema/buildOneAttributeSchema

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 03984800..HEAD -- apps/web/src/app/dashboard/tools/_components/tool-schema.ts apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts`
>
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

`tool-schema.ts` exports `buildAttributeValuesSchema` and its two private
callees (`resolveOptionValues`, `buildOneAttributeSchema`) — 83 lines that are
typechecked, compiled, and bundled on every build but never called at runtime.
They implement per-attribute `isRequired` enforcement that was intentionally
turned off (documented in `apps/web/CLAUDE.md`: "a obrigatoriedade individual
por atributo (`isRequired` / `buildAttributeValuesSchema`) segue desligada
(função órfã) — religar é decisão à parte"). Removing them eliminates dead
weight from the bundle and the maintenance surface; git history preserves the
implementation if the feature is ever re-enabled.

## Current state

**Relevant file:**
- `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` — Zod schema
  module for the tool form; contains the active form schema, helpers
  (`countFilledSpecs`, `slugify`) and the three orphan functions at lines
  234–316.

**Orphan block (lines 234–316 as of plan SHA `03984800`):**

```ts
// line 234 — JSDoc comment block (6 lines)
/**
 * Builds a Zod object schema for attributeValues based on the active definitions.
 * Each definition contributes a field keyed by `slug` whose validator follows `inputType`.
 * Required fields fail validation when value is missing/empty.
 */
// line 239
export function buildAttributeValuesSchema(
    definitions: Pick<
        AttributeDefinition,
        "slug" | "inputType" | "isRequired" | "options"
    >[]
) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const def of definitions) {
        shape[def.slug] = buildOneAttributeSchema(def);
    }
    return z.object(shape);
}

// line 252
function resolveOptionValues(opts: AttributeOptions | null): string[] { … }

// line 265
function buildOneAttributeSchema(
    def: Pick<AttributeDefinition, "inputType" | "isRequired" | "options">
): z.ZodTypeAny { … }
// line 316 — end of file
```

**Confirmed zero callers:** `rg "buildAttributeValuesSchema|buildOneAttributeSchema|resolveOptionValues"` across all `.ts`/`.tsx` returns 0 matches outside the file itself. The test file `__tests__/tool-schema.test.ts` imports only `countFilledSpecs`, `MIN_SPECS_ACTIVE`, and `toolFormSchema` — none of the orphan symbols.

**Import that may become unused after removal:** `AttributeOptions` from
`@emach/db/schema/attributes` is used only by `resolveOptionValues`. After
deleting the orphan block, check whether `AttributeOptions` is still imported
at line 2 and remove it from the import if so.

**Repo conventions that apply:**
- No `console.log` — not relevant here (pure deletion).
- No `@ts-ignore`/`as any` — not present in the block being removed.
- This file is a pure `_components` helper (no `"use server"`, no `server-only`).
  The build gate for `"use server"` files does NOT apply. `bun check-types` +
  `bun check` + `bun --cwd apps/web test` are sufficient.
- `AttributeDefinition` is still used by the live `attributeValueInputSchema`
  callers — keep it in the import if referenced elsewhere; remove only
  `AttributeOptions` if it becomes unused.

## Commands you will need

| Purpose        | Command                                                          | Expected on success                     |
|----------------|------------------------------------------------------------------|-----------------------------------------|
| Grep callers   | `rg "buildAttributeValuesSchema\|buildOneAttributeSchema\|resolveOptionValues" apps/ packages/ --include="*.ts" --include="*.tsx"` | 0 matches |
| Typecheck      | `bun check-types`                                               | exit 0, no errors                       |
| Lint           | `bun check`                                                     | exit 0, no errors                       |
| Tests          | `bun --cwd apps/web test`                                       | all pass (no new/removed tests needed)  |
| Full verify    | `bun verify`                                                    | exit 0 (chains check-types + check + test) |

## Scope

**In scope** (the only files you should modify):
- `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`

**Out of scope** (do NOT touch, even though they look related):
- `apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts`
  — existing tests cover the live functions and need no change; no new tests
  are needed for a pure deletion.
- Any file that references `isRequired` in the DB schema or renders `isRequired`
  badges in the UI — those are informational and intentional; this plan does
  not disable or hide the `isRequired` field.
- `packages/db/src/schema/attributes.ts` — the `isRequired` column stays;
  removing it is a separate product decision.
- Any ADR or documentation update beyond the single CLAUDE.md note below.

## Git workflow

- Branch: `advisor/051-remove-orphan-attribute-schema`
- One commit covering the deletion:
  `refactor(tools): remove funções órfãs buildAttributeValuesSchema`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Drift check

Run the drift-check command from the executor header block:

```bash
git diff --stat 03984800..HEAD -- \
  apps/web/src/app/dashboard/tools/_components/tool-schema.ts \
  apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts
```

**Verify**: Output shows 0 changed files, OR you have manually compared every
excerpt in "Current state" against the live code and confirmed they still match.
If anything in the orphan block (lines 234–316) has changed, STOP and report.

### Step 1: Confirm zero callers

```bash
rg "buildAttributeValuesSchema|buildOneAttributeSchema|resolveOptionValues" \
  apps/ packages/ --include="*.ts" --include="*.tsx"
```

**Verify**: Command exits with no output (0 matches). If any match appears
outside `tool-schema.ts` itself, STOP — the function has a caller and this
plan's premise is wrong.

### Step 2: Create the branch

```bash
git checkout -b advisor/051-remove-orphan-attribute-schema
```

**Verify**: `git branch --show-current` prints
`advisor/051-remove-orphan-attribute-schema`.

### Step 3: Delete the orphan block from tool-schema.ts

Open `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`.

Delete the entire block from the JSDoc comment through the end of the file:
lines 234–316. That is, remove everything from the line starting with `/**`
(the `Builds a Zod object schema...` comment) through the closing `}` of
`buildOneAttributeSchema`.

The file should end after line 233 (the closing `}` of `countFilledSpecs`'s
`return count;` block, specifically the closing brace at line 232) and line 233
(`return count;` → actually the final `}` of `countFilledSpecs`).

Concretely, after deletion the last export in the file should be `slugify`
(currently lines 224–232). Everything from line 234 onward is removed.

**Also check the import at the top of the file.** Read lines 1–5:

```ts
import type {
	AttributeDefinition,
	AttributeOptions,
} from "@emach/db/schema/attributes";
```

After removing the orphan block, `AttributeOptions` is no longer used anywhere
in the file. Remove it from the import so the import becomes:

```ts
import type { AttributeDefinition } from "@emach/db/schema/attributes";
```

`AttributeDefinition` is still used by `attributeValueInputSchema` and
`countFilledSpecs`, so it must stay.

**Verify**: Read the file after editing. Confirm:
1. The file ends with the closing `}` of `slugify`.
2. No occurrence of `buildAttributeValuesSchema`, `buildOneAttributeSchema`,
   `resolveOptionValues`, or `AttributeOptions` remains in the file.

```bash
rg "buildAttributeValuesSchema|buildOneAttributeSchema|resolveOptionValues|AttributeOptions" \
  apps/web/src/app/dashboard/tools/_components/tool-schema.ts
```

Expected: 0 matches.

### Step 4: Run verification gate

```bash
bun verify
```

**Verify**: Exits 0. All three chains pass (check-types, check, test). The
existing test suite (`tool-schema.test.ts`) covers `countFilledSpecs`,
`toolFormSchema`, and `MIN_SPECS_ACTIVE` — these are untouched and should all
still pass.

If `bun check` reports an unused-import lint error for `AttributeDefinition`
(unlikely — it is used), re-read the file and remove only the truly unused
import.

### Step 5: Commit

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-schema.ts
git commit -m "refactor(tools): remove funções órfãs buildAttributeValuesSchema"
```

**Verify**: `git show --stat HEAD` shows exactly 1 file changed
(`tool-schema.ts`) with deletions only (no additions beyond removal of the
import line). No other file appears in the diff.

### Step 6: Update plans/README.md

Mark this plan's row as DONE in `plans/README.md`.

**Verify**: `grep "051" plans/README.md` shows the row with status `DONE`.

## Test plan

No new tests are needed. This is a pure deletion of dead code with zero callers.
The existing suite in `__tests__/tool-schema.test.ts` (which does NOT import
any of the removed symbols) continues to cover the live functions and will
serve as the regression check.

Regression verification: `bun --cwd apps/web test` — all tests pass, same
count as before (no tests added or removed).

## Done criteria

All must hold before declaring this plan done:

- [ ] `rg "buildAttributeValuesSchema|buildOneAttributeSchema|resolveOptionValues" apps/ packages/ --include="*.ts" --include="*.tsx"` returns 0 matches
- [ ] `rg "AttributeOptions" apps/web/src/app/dashboard/tools/_components/tool-schema.ts` returns 0 matches
- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` exits 0, same test count as before
- [ ] `git diff --name-only HEAD~1..HEAD` shows only `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`
- [ ] `plans/README.md` status row for plan 051 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The code at lines 234–316 of `tool-schema.ts` does not match the excerpts in
  "Current state" (file has drifted since this plan was written).
- Step 1 (caller grep) returns any match outside `tool-schema.ts` — the
  function is actually called somewhere and must NOT be deleted without the
  caller's call site being handled first.
- `bun verify` fails after the deletion for any reason other than the expected
  unused-import warning.
- The import block at lines 1–4 differs from the excerpt shown in Step 3 (e.g.
  `AttributeOptions` is used elsewhere in the file by a symbol not visible in
  this plan's excerpt).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching any file outside the in-scope list.

## Maintenance notes

- **Re-enabling per-attribute required validation** is a deliberate future
  product decision. The implementation lives in git history (commit that
  introduced it can be found via
  `git log --all -S "buildAttributeValuesSchema" -- apps/web/src/app/dashboard/tools/_components/tool-schema.ts`).
  When re-enabling, rebuild from ADR context + the `attributeValueInputSchema`
  shape; the old implementation assumed a flat Zod object keyed by slug, which
  may or may not match the form's current nested structure.
- **`isRequired` DB column and UI badges are intentionally kept.** The column
  in `packages/db/src/schema/attributes.ts` and the badge rendering in
  attribute UI components are informational and must not be removed as part of
  this plan or any follow-up without an explicit product decision.
- **`apps/web/CLAUDE.md` line ~57** documents the off-state; no update needed
  after this deletion (the note correctly says "função órfã, religar é decisão
  à parte" — remains true now that the function is gone; the note serves as the
  re-enable reminder).
