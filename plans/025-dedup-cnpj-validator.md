# Plan 025: Consolidar os dois validadores de CNPJ em uma única fonte canônica

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
>   apps/web/src/lib/cpf-cnpj.ts \
>   apps/web/src/lib/validation/cnpj.ts \
>   apps/web/src/app/dashboard/suppliers/_components/supplier-schema.ts \
>   apps/web/src/app/dashboard/suppliers/actions.ts \
>   apps/web/src/lib/__tests__/
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/023-*.md (characterization tests for cpf-cnpj.ts must be green before refactoring)
- **Category**: tech-debt
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`isValidCnpj` exists in two files with distinct implementations: one in
`apps/web/src/lib/cpf-cnpj.ts` (the broader CPF/CNPJ/document module, used by
`documentZodRefine`) and another in `apps/web/src/lib/validation/cnpj.ts` (with
a helper `normalizeCnpj`, covered by test). Two independent implementations can
diverge silently over time — a future bugfix in one would leave the other stale.
Additionally, `cpf-cnpj.ts` has no direct tests for its `isValidCnpj`, making
regressions invisible. Consolidating to a single canonical file eliminates the
drift vector and ensures every call site uses the same validated code path.

## Current state

### Files and their roles

- `apps/web/src/lib/cpf-cnpj.ts` — **canonical target**: contains `normalizeDocument`,
  `formatDocument`, `isValidCpf`, `isValidCnpj`, `isValidDocument`,
  `documentZodRefine`. Used by `customer-profile-form.tsx` (formatDocument) and
  `customers/export/route.ts` (formatDocument). `documentZodRefine` calls
  `isValidCnpj` at the client-boundary Zod schema level.

- `apps/web/src/lib/validation/cnpj.ts` — **to be replaced with re-export**:
  exports `normalizeCnpj` and `isValidCnpj`. Imported by:
  - `apps/web/src/app/dashboard/suppliers/_components/supplier-schema.ts:3`
    (`isValidCnpj`)
  - `apps/web/src/app/dashboard/suppliers/actions.ts:15` (`normalizeCnpj`)

### Relevant code excerpts (confirm these before proceeding)

**`apps/web/src/lib/cpf-cnpj.ts:6-11`** — `normalizeDocument` (strips non-digits):
```ts
export function normalizeDocument(input: string | null | undefined): string {
    if (!input) {
        return "";
    }
    return input.replace(/\D+/g, "");
}
```

**`apps/web/src/lib/cpf-cnpj.ts:61-88`** — `isValidCnpj`:
```ts
export function isValidCnpj(input: string | null | undefined): boolean {
    const d = normalizeDocument(input);
    if (d.length !== 14 || allSameDigit(d)) {
        return false;
    }
    // ...weights w1/w2, mod-11 check digits...
}
```
Note: accepts `null | undefined` (returns `false`), unlike `validation/cnpj.ts`
which only accepts `string`. This is a **signature difference** — the canonical
accepts wider input, which is strictly more permissive to callers.

**`apps/web/src/lib/validation/cnpj.ts:6-8`** — `normalizeCnpj` (strips non-digits):
```ts
export function normalizeCnpj(input: string): string {
    return input.replace(NON_DIGIT_RE, "");
}
```
`normalizeCnpj` is functionally equivalent to `normalizeDocument` when called on
a non-null string. After consolidation, callers of `normalizeCnpj` will use
`normalizeDocument` (already exported from `cpf-cnpj.ts`) or a re-exported alias.

**`apps/web/src/lib/validation/cnpj.ts:19-33`** — `isValidCnpj` in validation module:
identical algorithm to `cpf-cnpj.ts` (confirmed: same weights, same mod-11
formula, same check-digit thresholds — verified in recon by running both against
the same inputs).

**`apps/web/src/app/dashboard/suppliers/_components/supplier-schema.ts:3,38`**:
```ts
import { isValidCnpj } from "@/lib/validation/cnpj";
// ...
.refine((v) => !v || isValidCnpj(v), "CNPJ inválido")
```

**`apps/web/src/app/dashboard/suppliers/actions.ts:15,36`**:
```ts
import { normalizeCnpj } from "@/lib/validation/cnpj";
// ...
const cnpjDigits = input.cnpj ? normalizeCnpj(input.cnpj) : "";
```

### Tests

There is **no existing test file** for `cpf-cnpj.ts` or `validation/cnpj.ts` as
of `79379ef5`. The plan depends on **plan 023** adding characterization tests for
`cpf-cnpj.ts:isValidCnpj` first — those tests are the regression safety net for
this consolidation. Do not proceed until plan 023 is DONE and `bun --cwd apps/web
test` is green.

Structural pattern for new tests: mirror
`apps/web/src/lib/__tests__/discount-format.test.ts` — simple `describe` +
`it` blocks, no DB mocking required (pure functions).

### Conventions that apply

- **No barrel files** (root `CLAUDE.md` anti-patterns): `validation/cnpj.ts` will
  be converted to a pure re-export shim temporarily, then deleted — not kept as a
  barrel. The shim is an intermediate state only during migration.
- **No `: any` / `as any`** — stay strictly typed throughout.
- **`normalizeCnpj` alias**: `cpf-cnpj.ts` already exports `normalizeDocument`
  which does the same job. We will **also export `normalizeCnpj`** from
  `cpf-cnpj.ts` as an alias (one line: `export const normalizeCnpj =
  normalizeDocument;`) so callers need only update the import path, not the
  call site.

## Commands you will need

| Purpose         | Command                                                          | Expected on success        |
|-----------------|------------------------------------------------------------------|----------------------------|
| Typecheck       | `bun check-types`                                                | exit 0, no errors          |
| Lint            | `bun check`                                                      | exit 0 (ultracite/biome)   |
| Tests (all)     | `bun --cwd apps/web test`                                        | all pass (green)           |
| Tests (filter)  | `bun --cwd apps/web test cpf-cnpj`                               | target tests pass          |
| Guard forms     | `bun guard:forms`                                                | exit 0                     |
| Grep importers  | `grep -rn "validation/cnpj" apps/web/src/`                       | 0 matches (after step 4)   |
| Grep normCnpj   | `grep -rn "normalizeCnpj" apps/web/src/`                         | only cpf-cnpj.ts (step 4+) |

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/lib/cpf-cnpj.ts` — add `normalizeCnpj` alias export
- `apps/web/src/lib/validation/cnpj.ts` — replace with re-export shim (step 2), then delete (step 4)
- `apps/web/src/app/dashboard/suppliers/_components/supplier-schema.ts` — update import path
- `apps/web/src/app/dashboard/suppliers/actions.ts` — update import path
- `apps/web/src/lib/__tests__/cpf-cnpj.test.ts` — create (if plan 023 placed it
  elsewhere, update the import inside that file to use the canonical path)

**Out of scope** (do NOT touch):

- Any algorithm change — this plan only moves code, never alters logic.
- `apps/web/src/lib/validation/phone-br.ts` — sibling file in `validation/`, leave untouched.
- Any file outside `apps/web/src/lib/` and `apps/web/src/app/dashboard/suppliers/`.
- `packages/` — no changes to shared packages.

## Git workflow

- Branch: `advisor/025-dedup-cnpj-validator`
- Commit per logical step (steps 1, 3, and 4 each get a commit)
- Message style: Conventional Commits in PT, subject ≤50 chars. Examples:
  - `refactor(lib): exporta normalizeCnpj de cpf-cnpj`
  - `refactor(suppliers): migra imports p/ cpf-cnpj canônico`
  - `chore(lib): remove validation/cnpj.ts redundante`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Pre-flight — confirm plan 023 is done

Verify that plan 023 (characterization tests) is DONE and that tests are green:

```
bun --cwd apps/web test
```

Expected: all tests pass. If plan 023 is not yet DONE, **stop here** — this plan
depends on those tests being in place before any file is modified.

Also confirm the two algorithms are equivalent by running the drift check (top of
this document). If `validation/cnpj.ts` has changed since `79379ef5`, re-read
both files and compare algorithms manually before proceeding.

**Verify**: `bun --cwd apps/web test` → exit 0, green.

### Step 1: Add `normalizeCnpj` alias to `cpf-cnpj.ts`

Read `apps/web/src/lib/cpf-cnpj.ts` (required before Edit). Then add one export
at the bottom of the file, after `documentZodRefine`:

```ts
/**
 * Alias de normalizeDocument restrito a CNPJ.
 * Mantido para compatibilidade com importadores de validation/cnpj.
 * Prefer normalizeDocument para uso genérico.
 */
export const normalizeCnpj = normalizeDocument;
```

Do NOT alter any existing function — only append this alias.

**Verify**:
- `bun check-types` → exit 0
- `grep -n "normalizeCnpj" apps/web/src/lib/cpf-cnpj.ts` → shows the new alias line

Commit: `refactor(lib): exporta normalizeCnpj de cpf-cnpj`

### Step 2: Convert `validation/cnpj.ts` to a re-export shim

Read `apps/web/src/lib/validation/cnpj.ts` before editing. Replace the entire
file content with:

```ts
/**
 * @deprecated Importar de "@/lib/cpf-cnpj" diretamente.
 * Este shim será removido após migração de todos os importers.
 */
export { isValidCnpj, normalizeCnpj } from "@/lib/cpf-cnpj";
```

This keeps existing importers working while making the canonical source clear.

**Verify**:
- `bun check-types` → exit 0
- `bun --cwd apps/web test` → still green (no regressions)

No commit yet — steps 2 and 3 are bundled into one logical unit.

### Step 3: Update all importers to use the canonical path

There are exactly two files to update:

**File A**: `apps/web/src/app/dashboard/suppliers/_components/supplier-schema.ts`

Read the file first. Change line 3:
```ts
// before
import { isValidCnpj } from "@/lib/validation/cnpj";
// after
import { isValidCnpj } from "@/lib/cpf-cnpj";
```

**File B**: `apps/web/src/app/dashboard/suppliers/actions.ts`

Read the file first. Change line 15:
```ts
// before
import { normalizeCnpj } from "@/lib/validation/cnpj";
// after
import { normalizeCnpj } from "@/lib/cpf-cnpj";
```

After both edits:

**Verify**:
- `bun check-types` → exit 0
- `grep -rn "validation/cnpj" apps/web/src/` → 0 matches (only the shim itself may appear if grep includes it; verify it returns 0 matches for files OTHER than `validation/cnpj.ts`)
- `bun --cwd apps/web test` → green

Commit: `refactor(suppliers): migra imports p/ cpf-cnpj canônico`

### Step 4: Delete `validation/cnpj.ts`

Now that all importers point to `cpf-cnpj.ts` and the shim is no longer needed:

```bash
rm apps/web/src/lib/validation/cnpj.ts
```

**Verify** immediately after deletion:
- `bun check-types` → exit 0 (confirms no importer still references the deleted file)
- `bun check` → exit 0 (lint clean)
- `bun --cwd apps/web test` → green
- `grep -rn "validation/cnpj" apps/web/src/` → 0 matches
- `bun guard:forms` → exit 0

Commit: `chore(lib): remove validation/cnpj.ts redundante`

## Test plan

Plan 023 creates `apps/web/src/lib/__tests__/cpf-cnpj.test.ts` with
characterization tests for `isValidCnpj` (and likely `isValidCpf`,
`documentZodRefine`, `formatDocument`). These tests serve as the regression net
for this consolidation.

After step 4, verify that the test file imports from `@/lib/cpf-cnpj` (not from
the deleted `validation/cnpj`). If plan 023 placed the test with an import from
`validation/cnpj`, update it to `@/lib/cpf-cnpj` as part of step 3.

No new tests need to be written in this plan — the characterization tests from
023 are sufficient. The test command to confirm:

```
bun --cwd apps/web test cpf-cnpj
```

Expected: all `cpf-cnpj` tests pass (count established by plan 023).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0 (lint)
- [ ] `bun --cwd apps/web test` exits 0, green
- [ ] `bun guard:forms` exits 0
- [ ] `grep -rn "validation/cnpj" apps/web/src/` returns 0 matches
- [ ] `grep -n "normalizeCnpj" apps/web/src/lib/cpf-cnpj.ts` returns 1 match (the alias)
- [ ] `apps/web/src/lib/validation/cnpj.ts` does not exist (`ls` returns "No such file")
- [ ] `git diff --name-only HEAD~3` (or `git log --name-only`) shows only the 4 in-scope files modified + the deleted file
- [ ] `plans/README.md` status row for plan 025 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 023 is not DONE — do not begin any file edits until characterization tests exist and pass.
- The code at the locations in "Current state" doesn't match the excerpts (drift since `79379ef5`).
- After deletion in step 4, `bun check-types` reports a missing module — a third importer of `validation/cnpj` exists that this plan did not account for. Re-add the shim, find the importer, update it, then delete again.
- The two algorithms produce different results for any input (run the verification below before step 1):
  ```bash
  node -e "
  // --- canonical (cpf-cnpj.ts) ---
  function normalizeDocument(input) { return !input ? '' : input.replace(/\D+/g, ''); }
  const ALL_SAME = /^(\d)\1+$/;
  function isValidCnpjCanonical(input) {
    const d = normalizeDocument(input);
    if (d.length !== 14 || ALL_SAME.test(d)) return false;
    const w1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    const w2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(d[i], 10) * w1[i];
    let dv1 = sum % 11; dv1 = dv1 < 2 ? 0 : 11 - dv1;
    if (dv1 !== parseInt(d[12], 10)) return false;
    sum = 0;
    for (let i = 0; i < 13; i++) sum += parseInt(d[i], 10) * w2[i];
    let dv2 = sum % 11; dv2 = dv2 < 2 ? 0 : 11 - dv2;
    return dv2 === parseInt(d[13], 10);
  }
  // --- validation/cnpj.ts ---
  const NON_DIGIT_RE = /\D/g;
  const REPEATED_DIGITS_RE = /^(\d)\1{13}$/;
  function normalizeCnpj(input) { return input.replace(NON_DIGIT_RE, ''); }
  function calcCheckDigit(digits, weights) {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += Number(digits[i]) * (weights[i] ?? 0);
    const rem = sum % 11; return rem < 2 ? 0 : 11 - rem;
  }
  function isValidCnpjValidation(input) {
    const cnpj = normalizeCnpj(input);
    if (cnpj.length !== 14) return false;
    if (REPEATED_DIGITS_RE.test(cnpj)) return false;
    const d1 = calcCheckDigit(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
    if (d1 !== Number(cnpj[12])) return false;
    const d2 = calcCheckDigit(cnpj.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]);
    return d2 === Number(cnpj[13]);
  }
  const inputs = ['11.222.333/0001-81','00.000.000/0000-00','11111111111111','12.345.678/0001-95','invalid','',null];
  let ok = true;
  for (const v of inputs) {
    const a = isValidCnpjCanonical(v);
    const b = v == null ? null : isValidCnpjValidation(v);
    if (b !== null && a !== b) { console.error('DIVERGE', v, a, b); ok = false; }
  }
  if (ok) console.log('OK — algorithms equivalent');
  "
  ```
  Expected: `OK — algorithms equivalent`. If any `DIVERGE` line appears, **do not proceed** — report the divergence and the specific input.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file (e.g., a third importer in `packages/`).

## Maintenance notes

- `normalizeCnpj` is now an alias for `normalizeDocument` in `cpf-cnpj.ts`. If a
  future developer wants to remove it, they only need to verify no caller uses it
  (one grep). Prefer `normalizeDocument` for new code — it handles CPF too.
- `cpf-cnpj.ts` is now the single source for all document validation
  (CPF, CNPJ, combined). Any algorithm fix must happen here only.
- The `validation/` directory still contains `phone-br.ts` — it remains untouched.
  If a future audit finds `phone-br.ts` has a duplicate elsewhere, a separate plan
  should be created following the same pattern.
- A reviewer should confirm: (1) the `normalizeCnpj` alias is append-only (no
  existing lines changed), (2) the two supplier files have exactly one import
  line changed each, (3) no other file was modified.
