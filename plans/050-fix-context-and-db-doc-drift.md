# Plan 050: Fix CONTEXT.md ADR index, packages/db/CLAUDE.md trigger contradiction, and money-boundary inconsistency in branches

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 03984800..HEAD -- CONTEXT.md packages/db/CLAUDE.md apps/web/src/app/dashboard/branches/data.ts apps/web/src/app/dashboard/branches/\[id\]/_components/order-card.tsx`
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

Three drifts have been accumulating. First, `CONTEXT.md` ends its ADR index at ADR-0017 but four shipped ADRs (0018–0021) exist in `docs/adr/` — any agent or engineer reading the index to understand architecture will miss the most consequential one (ADR-0019, the 3-layer pattern that governs every new feature). Second, `packages/db/CLAUDE.md` line 23 falsely claims `triggers.sql` handles "idempotência de débito de venda em `stock_movement`" — it does not (the real idempotency is a Drizzle `uniqueIndex` in the schema, not a trigger); the contradiction invites someone to look for a trigger that isn't there, or worse, to add one. Third, `branches/data.ts` types `BranchOrderRow.totalAmount` as `string` (raw Drizzle `numeric`) while the render site does `Number.parseFloat(order.totalAmount)` — every other feature (`customers/data.ts:468`, `orders/data.ts:366,480,919-921`) coerces to `number` in the data layer, making the `branches` inconsistency a latent footgun (one schema change could make the field nullable and silently produce `NaN`).

## Current state

### File roles

- `CONTEXT.md` — domain glossary + ADR index for the monorepo. ADR index lives at lines 152–173.
- `packages/db/CLAUDE.md` — schema-workflow gotchas and team conventions for the `packages/db` package. Triggers section is lines 21–27.
- `packages/db/src/sql/triggers.sql` — the actual PL/pgSQL triggers applied by `bun db:apply-sql`. Contains 5 triggers; no stock_movement trigger.
- `packages/db/src/schema/stock-movements.ts:76–78` — the real idempotency: `uniqueIndex("stock_movement_sale_idempotency")`.
- `apps/web/src/app/dashboard/branches/data.ts` — server-only data layer for the branches feature. `BranchOrderRow` interface at lines 171–177; `getBranchRecentOrders` at lines 179–195.
- `apps/web/src/app/dashboard/branches/[id]/_components/order-card.tsx` — renders a single order card. `BRL.format(Number.parseFloat(order.totalAmount))` at line 37.

### Excerpts confirming current state

**CONTEXT.md lines 152–173 (ADR index ends at 0017):**
```
## ADRs

Decisões arquiteturais ficam em `docs/adr/`:

- **ADR-0001** — Orders são criados apenas pelo site e-commerce.
...
- **ADR-0017** — Overrides de capability por usuário: registry declarativo (`capabilities.ts`), ...

Se um output contradiz um ADR existente, sinalize explicitamente em vez de sobrescrever em silêncio.
```

**packages/db/CLAUDE.md lines 21–27 (contradiction):**
```
## Triggers PL/pgSQL

`src/sql/triggers.sql` contém triggers que Drizzle Kit **não consegue gerar** (anti-ciclo de categoria
com path/depth materializados, idempotência de débito de venda em `stock_movement`). Incluídos no
`bun db:sync`; aplicados via `bun db:apply-sql` (idempotente), que roda `triggers.sql` + `rls.sql` em ordem.
...
Índices de cursor-based pagination e o partial unique `stock_movement_sale_idempotency` vivem no schema
Drizzle (declarados nas tabelas) — `drizzle-kit push` os mantém.
```

Line 23 claims the trigger file handles `stock_movement` idempotency. Line 27 correctly says `stock_movement_sale_idempotency` is a Drizzle `uniqueIndex`. The actual `triggers.sql` has 5 triggers: `prevent_category_cycle`, `cascade_category_path`, `update_client_last_seen`, `derive_client_type`, `order_nfe_cancelled_note` — none touches `stock_movement`.

**branches/data.ts lines 171–195 (string type + no coercion):**
```ts
export interface BranchOrderRow {
    createdAt: Date;
    id: string;
    number: string;
    status: string;
    totalAmount: string;  // ← raw Drizzle numeric string
}

export async function getBranchRecentOrders(
    branchId: string,
    limit = 20
): Promise<BranchOrderRow[]> {
    return await db
        .select({
            id: order.id,
            number: order.number,
            status: order.status,
            totalAmount: order.totalAmount,  // ← no Number() coercion
            createdAt: order.createdAt,
        })
        .from(order)
        .where(eq(order.branchId, branchId))
        .orderBy(desc(order.createdAt))
        .limit(limit);
}
```

**order-card.tsx line 37 (parseFloat at render site):**
```tsx
{BRL.format(Number.parseFloat(order.totalAmount))}
```

**Pattern to match (customers/data.ts:468, orders/data.ts:366):**
```ts
// customers/data.ts
totalAmount: Number(r.total_amount),

// orders/data.ts
totalAmount: Number(row.total_amount),
```
Both features type `totalAmount: number` in their row interfaces and coerce in the data layer, not the render.

**ADR titles from docs/adr/ (exact phrasing for the new index entries):**
- `docs/adr/0018-read-actions-enforçam-capability.md` title: "Read server actions enforçam capability (não só mutations)"
- `docs/adr/0019-split-god-module-data-lib.md` title: "Split de god-module em `data.ts` (server-only) + `_lib` + `actions.ts` enxuto"
- `docs/adr/0020-cookie-cache-sessao-dashboard.md` title: "`cookieCache` na sessão do dashboard (staleness de gate aceita)" — Status: ⚠️ Superseded por ADR-0021
- `docs/adr/0021-remocao-cookie-cache-sessao-dashboard.md` title: "Remoção do `cookieCache` da sessão do dashboard" — Status: Aceito — substitui 0020

**triggers.sql actual trigger names (5 total):**
1. `trg_prevent_category_cycle` — anti-ciclo de categoria + materializa `path`/`depth`
2. `trg_cascade_category_path` — propaga path/depth para descendentes
3. `trg_update_client_last_seen` — throttle 5 min em `client.last_seen_at`
4. `trg_derive_client_type` — deriva `client_type` de `document` (CPF→b2c, CNPJ→b2b)
5. `trg_order_nfe_cancelled` — insere `order_note` quando `nfe_status` muda para `cancelled`

### Repo conventions that apply

- `CONTEXT.md` style for each ADR entry: `- **ADR-XXXX** — <one-line description>` (see existing lines 156–172).
- Superseded entries follow the pattern: `- **ADR-XXXX** — ~~<original description>~~ **Superado por ADR-YYYY.**` (see lines 165, 167 in CONTEXT.md for ADR-0010 and ADR-0012).
- No barrel files, no `console`, no `: any` — not relevant here (docs + data-layer coercion only).
- Money coercion pattern: `Number(raw_sql_value)` in the data layer, `number` type in the row interface. The render site uses `BRL.format(amount)` directly without any `parseFloat`. Canonical: `apps/web/src/app/dashboard/orders/data.ts:366`.
- `db.select()` (query builder) returns Drizzle-mapped values, so `order.totalAmount` from `db.select()` returns a `string` (raw numeric). `Number()` coerces it correctly. Column is `notNull()` so `Number("")` / NaN is not a current risk, but coercing in the data layer is the convention.

## Commands you will need

| Purpose         | Command                                                          | Expected on success             |
|-----------------|------------------------------------------------------------------|---------------------------------|
| Typecheck       | `bun check-types`                                                | exit 0, no errors               |
| Lint            | `bun check`                                                      | exit 0                          |
| Tests           | `bun --cwd apps/web test`                                        | all pass (no new/changed tests) |
| Full verify     | `bun verify`                                                     | exit 0 (chains check-types + check + test) |
| Git status      | `git status`                                                     | only in-scope files modified    |

> Note: no `bun run build` gate required here — no `"use server"` files are touched.
> `branches/data.ts` starts with `import "server-only"` (not `"use server"`), so the async-only export restriction does not apply.

## Scope

**In scope** (the only files you should modify):
- `CONTEXT.md` — append four ADR entries (lines after current line 172)
- `packages/db/CLAUDE.md` — fix line 23 (remove false claim about `stock_movement` trigger)
- `apps/web/src/app/dashboard/branches/data.ts` — coerce `totalAmount` to `number` in `BranchOrderRow` and `getBranchRecentOrders`
- `apps/web/src/app/dashboard/branches/actions.ts` — **SECOND producer of `BranchOrderRow`** (revisão 2026-06-19): `fetchBranchOrdersPage` (return type `InfiniteResult<BranchOrderRow>`) has its own `db.select()` at ~lines 188–199 with `totalAmount: order.totalAmount` (string). Once `BranchOrderRow.totalAmount` becomes `number`, this file fails `check-types` (TS2322). Apply the SAME `Number(...)` coercion in its row mapping. (This consumer was missed in the first dispatch; it is required for the interface change to typecheck.)
- `apps/web/src/app/dashboard/branches/[id]/_components/order-card.tsx` — drop `Number.parseFloat()` wrapper (render receives `number` directly)

**Out of scope** (do NOT touch, even though they look related):
- `packages/db/src/sql/triggers.sql` — no trigger to add or remove; the doc fix is in `CLAUDE.md` only.
- `packages/db/src/schema/stock-movements.ts` — the `uniqueIndex` is correct and present; no change needed.
- `docs/adr/0018-*.md` through `docs/adr/0021-*.md` — the ADR files themselves are correct; only the index in `CONTEXT.md` is missing entries.
- Any other `data.ts` or render component — only `branches/data.ts`, `branches/actions.ts`, and `branches/[id]/_components/order-card.tsx` are touched for the money boundary.
- `orders/data.ts`, `customers/data.ts` — already correct; not touched.
- `plans/README.md` — update the status row for this plan after completing the steps below.

## Git workflow

- Branch: `advisor/050-fix-context-and-db-doc-drift`
- Commit per step; Conventional Commits in Portuguese, subject ≤50 chars.
- Example commit style (from repo history): `docs: adiciona ADRs 0018–0021 ao CONTEXT.md`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create branch

```bash
git checkout -b advisor/050-fix-context-and-db-doc-drift
```

**Verify**: `git branch --show-current` → `advisor/050-fix-context-and-db-doc-drift`

---

### Step 2: Append ADR-0018 through ADR-0021 to CONTEXT.md

Open `CONTEXT.md`. Find the ADR section. It currently ends with:

```markdown
- **ADR-0017** — Overrides de capability por usuário: registry declarativo (`capabilities.ts`), tabela `user_capability_override` (text livre, não pgEnum), `can()` async com request-cache, anti-escalada em grant, auditoria em `userActivityLog`. Estende ADR-0016.

Se um output contradiz um ADR existente, sinalize explicitamente em vez de sobrescrever em silêncio.
```

Insert four new bullet lines **between** the ADR-0017 line and the closing note ("Se um output..."). The exact text to insert:

```markdown
- **ADR-0018** — Read server actions enforçam capability (não só mutations): toda fn exportada de `actions.ts` recebe `requireCapability(<recurso>.read)` como primeira instrução; funções em `data.ts`/`*-data.ts` são `server-only` (não-endpoint) — o caller é responsável pelo guard. Estende ADR-0016.
- **ADR-0019** — Split de god-module em `data.ts` (server-only) + `_lib` + `actions.ts` enxuto: 3 camadas — `data.ts` (`import "server-only"`, reads+tipos+builders) + `_lib/*` (helpers puros, sem auth) + `actions.ts` (`"use server"`, só mutations + thin wrappers com guard). `bun run build` é gate obrigatório após refatorar `"use server"`. Estende ADR-0018.
- **ADR-0020** — ~~`cookieCache` na sessão do dashboard (staleness de gate aceita).~~ **Superado por ADR-0021.**
- **ADR-0021** — Remoção do `cookieCache` da sessão do dashboard: RSC não propaga `Set-Cookie` no App Router, então o cache nunca era renovado em SSR; a liability de staleness P0 superou o ganho medido (~dezenas de ms). Sessão volta a ler o Postgres em todo request. Substitui ADR-0020.
```

After the edit, the closing note ("Se um output contradiz...") must remain as the last line of the section.

**Verify**:
```bash
grep -c "ADR-0018\|ADR-0019\|ADR-0020\|ADR-0021" CONTEXT.md
```
Expected output: `4` (each ADR appears exactly once)

---

### Step 3: Fix the trigger contradiction in packages/db/CLAUDE.md

Open `packages/db/CLAUDE.md`. Find line 23 (the Triggers section intro). The current text is:

```
`src/sql/triggers.sql` contém triggers que Drizzle Kit **não consegue gerar** (anti-ciclo de categoria com path/depth materializados, idempotência de débito de venda em `stock_movement`). Incluídos no `bun db:sync`; aplicados via `bun db:apply-sql` (idempotente), que roda `triggers.sql` + `rls.sql` em ordem.
```

Replace with (remove the false `stock_movement` claim; list the actual triggers):

```
`src/sql/triggers.sql` contém triggers que Drizzle Kit **não consegue gerar**: anti-ciclo de categoria (com materialização de `path`/`depth`), throttle de `client.last_seen_at` a cada 5 min, derivação automática de `client_type` (CPF→b2c, CNPJ→b2b) e inserção de `order_note` ao cancelar NF-e. Incluídos no `bun db:sync`; aplicados via `bun db:apply-sql` (idempotente), que roda `triggers.sql` + `rls.sql` em ordem.
```

> The `stock_movement_sale_idempotency` idempotency is a Drizzle `uniqueIndex` in
> `packages/db/src/schema/stock-movements.ts:76–78`, not a trigger. Line 27 already
> documents this correctly — do not change line 27.

**Verify**:
```bash
grep "idempotência de débito de venda" packages/db/CLAUDE.md
```
Expected output: no output (the false claim is gone)

```bash
grep "stock_movement_sale_idempotency" packages/db/CLAUDE.md
```
Expected output: the existing line 27 (unchanged), e.g.:
```
Índices de cursor-based pagination e o partial unique `stock_movement_sale_idempotency` vivem no schema Drizzle (declarados nas tabelas) — `drizzle-kit push` os mantém.
```

---

### Step 4: Coerce totalAmount to number in branches/data.ts

Open `apps/web/src/app/dashboard/branches/data.ts`.

**Change 1 — Update the interface** (currently lines 171–177):

Old:
```ts
export interface BranchOrderRow {
	createdAt: Date;
	id: string;
	number: string;
	status: string;
	totalAmount: string;
}
```

New:
```ts
export interface BranchOrderRow {
	createdAt: Date;
	id: string;
	number: string;
	status: string;
	totalAmount: number;
}
```

**Change 2 — Coerce in the select mapping** (currently lines 179–195):

Old (the `.select({...})` block):
```ts
	return await db
		.select({
			id: order.id,
			number: order.number,
			status: order.status,
			totalAmount: order.totalAmount,
			createdAt: order.createdAt,
		})
		.from(order)
		.where(eq(order.branchId, branchId))
		.orderBy(desc(order.createdAt))
		.limit(limit);
```

New (add explicit mapping with `Number()` coercion):
```ts
	const rows = await db
		.select({
			id: order.id,
			number: order.number,
			status: order.status,
			totalAmount: order.totalAmount,
			createdAt: order.createdAt,
		})
		.from(order)
		.where(eq(order.branchId, branchId))
		.orderBy(desc(order.createdAt))
		.limit(limit);

	return rows.map((row) => ({
		...row,
		totalAmount: Number(row.totalAmount),
	}));
```

> Rationale: `db.select()` (query builder) returns Drizzle-typed values; for `numeric` columns
> Drizzle returns a `string`. `Number()` converts it to a JS `number`, matching the pattern in
> `customers/data.ts:468` and `orders/data.ts:366`.

**Verify**:
```bash
grep "totalAmount: string" apps/web/src/app/dashboard/branches/data.ts
```
Expected output: no output (the `string` type is gone)

```bash
grep "totalAmount: number" apps/web/src/app/dashboard/branches/data.ts
```
Expected output: the updated interface line

---

### Step 5: Drop parseFloat at the render site in order-card.tsx

Open `apps/web/src/app/dashboard/branches/[id]/_components/order-card.tsx`.

At line 37, the current code is:
```tsx
{BRL.format(Number.parseFloat(order.totalAmount))}
```

Replace with:
```tsx
{BRL.format(order.totalAmount)}
```

> `order.totalAmount` is now `number` (coerced in the data layer). `Intl.NumberFormat.format()`
> accepts `number` directly — no `parseFloat` needed.

**Verify**:
```bash
grep "parseFloat" apps/web/src/app/dashboard/branches/\[id\]/_components/order-card.tsx
```
Expected output: no output (no `parseFloat` in the file)

---

### Step 6: Run type check and lint

```bash
bun check-types
```
Expected: exit 0, no errors.

```bash
bun check
```
Expected: exit 0, no lint errors.

**Verify**: both commands exit 0.

---

### Step 7: Run tests

```bash
bun --cwd apps/web test
```
Expected: all tests pass (green). No new tests are added by this plan (docs edits + type coercion in a non-tested path). Existing tests must not regress.

**Verify**: `All tests passed` (or equivalent vitest output with 0 failures).

---

### Step 8: Confirm only in-scope files are modified

```bash
git status
```
Expected: modified files are limited to:
- `CONTEXT.md`
- `packages/db/CLAUDE.md`
- `apps/web/src/app/dashboard/branches/data.ts`
- `apps/web/src/app/dashboard/branches/[id]/_components/order-card.tsx`

No other files should appear as modified or untracked.

---

### Step 9: Commit

One commit per logical unit:

```bash
git add CONTEXT.md
git commit -m "docs: adiciona ADRs 0018–0021 ao CONTEXT.md"

git add packages/db/CLAUDE.md
git commit -m "docs: corrige menção a trigger inexistente em db/CLAUDE.md"

git add apps/web/src/app/dashboard/branches/data.ts \
        "apps/web/src/app/dashboard/branches/[id]/_components/order-card.tsx"
git commit -m "fix: coerce totalAmount para number em branches/data"
```

**Verify**: `git log --oneline -3` shows three commits with the messages above.

---

### Step 10: Update plans/README.md

Find the row for plan 050 in `plans/README.md` and change its status from `TODO` to `DONE`.

**Verify**:
```bash
grep "050" plans/README.md
```
Expected: the row contains `DONE`.

## Test plan

No new tests are required for this plan:

- Steps 1–3 are docs-only edits. They do not change runtime behavior.
- Steps 4–5 change a type annotation and add a `Number()` coercion. The `BranchOrderRow.totalAmount` field is consumed only by `BranchOrderCard` (render) — no existing unit tests cover this component or `getBranchRecentOrders`. Adding tests is explicitly deferred (out of scope for this S-effort docs+consistency plan).
- **Smoke**: after `bun dev:web`, visit `/dashboard/branches/<some-id>` and open the "Pedidos" tab. Confirm that order total amounts render as BRL currency (e.g., `R$ 1.250,00`) without `NaN` or `undefined`. This is the runtime check that `Number()` coercion is working.

Existing tests must pass unchanged: `bun --cwd apps/web test` → all pass.

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` exits 0; no regressions
- [ ] `grep -c "ADR-0018\|ADR-0019\|ADR-0020\|ADR-0021" CONTEXT.md` returns `4`
- [ ] `grep "idempotência de débito de venda" packages/db/CLAUDE.md` returns no output
- [ ] `grep "totalAmount: string" apps/web/src/app/dashboard/branches/data.ts` returns no output
- [ ] `grep "parseFloat" "apps/web/src/app/dashboard/branches/[id]/_components/order-card.tsx"` returns no output
- [ ] `git status` shows only the four in-scope files modified
- [ ] `plans/README.md` status row for plan 050 updated to `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (codebase has drifted since this plan was written — run the drift-check command at the top first).
- `bun check-types` fails after Step 4–5 with a type error in `branches/data.ts` or `order-card.tsx` (may indicate a consumer of `BranchOrderRow.totalAmount` as `string` that was missed — check all imports of `BranchOrderRow`).
- `bun check` fails with a new lint warning in the modified files (do not silence with `biome-ignore` without understanding the rule).
- Any file outside the four in-scope files appears in `git status` as modified.
- The trigger section in `packages/db/CLAUDE.md` after the edit still mentions any claim about `stock_movement` (should be zero after Step 3).
- You discover that `order.totalAmount` in the schema is **nullable** (would make `Number(null)` → `0` silently). Confirm it is `notNull()` in `packages/db/src/schema/orders.ts:122-125` before committing Step 4.

## Maintenance notes

- **If a new `BranchOrderRow`-like shape is added** (e.g., a second query in `branches/data.ts` that returns order amounts), apply the same `Number()` coercion at the data layer — never at the render site.
- **If ADRs 0022+ are shipped**, append them to the `CONTEXT.md` ADR index following the same one-line-entry style. The closing note ("Se um output contradiz...") must always be the last line of the section.
- **The `packages/db/CLAUDE.md` Triggers section** now accurately lists 5 triggers. If a new PL/pgSQL trigger is added to `triggers.sql`, update the description in `CLAUDE.md` to keep them in sync.
- No follow-up deferred from this plan: all three drifts are fully resolved here.
