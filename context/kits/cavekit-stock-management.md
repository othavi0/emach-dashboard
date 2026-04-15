---
created: "2026-04-15"
last_edited: "2026-04-15"
---

# Cavekit: Stock Management

## Scope

Edicao de estoque por filial com historico de movimentacoes. Adiciona nova tabela `stock_movement` para trilha de auditoria de ajustes. Pagina consolidada `/dashboard/stock` lista todas as ferramentas com total agregado. Pagina per-tool `/dashboard/tools/[id]/stock` mostra por-filial, permite ajuste e exibe historico. Habilita a aba "Estoque" em `inventory-tabs.tsx`. Phase 2 — depende de branches existirem via `cavekit-branches-crud.md`.

**Prerequisite:** `cavekit-branches-crud.md` must be complete (branches can be created via UI). `cavekit-data-model.md` R1, R2 (tool, branch, stockLevel tables) must be in place. `cavekit-auth-access.md` R2, R4 (`requireRole('admin')` for mutations) must be complete. `cavekit-navigation-shell.md` R2, R6, R7 (sidebar tree, inventory route group, inventory tabs) must be complete.

## Column Specification — stock_movement

```
stock_movement:
  id             text PK (nanoid, application-generated)
  toolId         text FK -> tool.id, onDelete set null, nullable    (preserves audit when tool deleted)
  branchId       text FK -> branch.id, onDelete set null, nullable  (preserves audit when branch deleted)
  previousQty    integer notNull
  newQty         integer notNull
  delta          integer notNull (computed server-side as newQty - previousQty, may be negative)
  reason         text nullable (application-level enum: 'entrada_compra' | 'saida_venda' | 'ajuste_inventario' | 'perda' | 'outro')
  reasonNote     text nullable (free text, max 500 chars, required when reason = 'outro', must be null when reason != 'outro')
  actorId        text FK -> user.id, onDelete set null, nullable
  createdAt      timestamp defaultNow notNull

indexes:
  stock_movement_tool_created_idx ON (tool_id, created_at DESC)   (serves getStockMovements(toolId) query)
  stock_movement_actor_id_idx ON (actor_id)
```

**Audit trail preservation:** Movement rows outlive their parent tool or branch. When a tool or branch is deleted, the corresponding FK column on `stock_movement` is set to `NULL` rather than cascading the delete. The history UI (R6) MUST render null `toolId`/`branchId` as "ferramenta removida" / "filial removida" labels. Query joins (R10) MUST left-join branch and user tables and tolerate nulls.

## Requirements

### R1: Stock Movement Schema File
**Description:** A new schema module defines the `stock_movement` table with the columns and indexes specified above, plus Drizzle relation definitions to tool, branch, and user.
**Acceptance Criteria:**
- [ ] File `packages/db/src/schema/stock-movements.ts` exists
- [ ] Exports named `stockMovement` as a Drizzle `pgTable` instance
- [ ] All columns from the Column Specification above match exactly (names, types, nullability, defaults)
- [ ] `toolId` declares `references(() => tool.id, { onDelete: 'set null' })` and is nullable
- [ ] `branchId` declares `references(() => branch.id, { onDelete: 'set null' })` and is nullable
- [ ] `actorId` declares `references(() => user.id, { onDelete: 'set null' })` and is nullable
- [ ] The id column uses `text` type (NOT `serial` or Drizzle `uuid`) — consistent with cavekit-data-model R11
- [ ] `createdAt` uses `timestamp('created_at').defaultNow().notNull()`
- [ ] A composite index on `(tool_id, created_at)` descending is defined (named `stock_movement_tool_created_idx`) — sized to the `getStockMovements(toolId)` query access pattern
- [ ] A separate index on `(actor_id)` is defined
- [ ] Drizzle `relations()` exported for `stockMovementRelations` with `tool`, `branch`, and `actor` relations
- [ ] A type alias `StockMovement = typeof stockMovement.$inferSelect` is exported

### R2: Schema Barrel Re-Export
**Description:** The schema barrel at `packages/db/src/schema/index.ts` re-exports the new module so it participates in the `createDb()` schema object.
**Acceptance Criteria:**
- [ ] `packages/db/src/schema/index.ts` re-exports everything from `./stock-movements`
- [ ] `packages/db/src/index.ts` — the schema object passed to `drizzle()` in `createDb()` includes `stockMovement`
- [ ] `bun --filter=@emach/db run build` (or equivalent) compiles without errors

### R3: Schema Applied to Local Database
**Description:** Running db push applies the new table cleanly.
**Acceptance Criteria:**
- [ ] `bun --cwd packages/db run db:push` exits with code 0 against a running local Supabase instance
- [ ] The table `stock_movement` exists in the public schema after the push
- [ ] Both indexes exist on the table
- [ ] No destructive migration warnings are emitted for existing tables

### R4: Estoque Tab Enabled in Inventory Tabs
**Description:** The previously disabled Estoque tab in the inventory tab bar becomes an active navigation link.
**Acceptance Criteria:**
- [ ] The file `apps/web/src/app/dashboard/_components/inventory-tabs.tsx` no longer has `disabled` or `aria-disabled="true"` on the Estoque tab trigger
- [ ] The Estoque tab renders as a `<Link>` targeting `/dashboard/stock` following the same pattern as the Ferramentas tab
- [ ] `tabIndex={-1}` is removed from the Estoque tab trigger
- [ ] The tab's `value` prop is `stock`
- [ ] The Tabs parent component's `value` prop resolves from `usePathname()` — `tools` when pathname starts with `/dashboard/tools`, `stock` when pathname starts with `/dashboard/stock`, `promotions` when pathname starts with `/dashboard/promotions` (still disabled)
- [ ] The Promocoes tab remains disabled

### R5: Consolidated Stock List Page
**Description:** A read-only consolidated page lists every tool with aggregate stock across all branches.
**Acceptance Criteria:**
- [ ] Route `/dashboard/stock` renders a page listing all tools
- [ ] Each row shows: imagem (thumb), Nome, SKU, Total (sum of quantity across all stockLevel rows for the tool), Filiais (popover trigger showing per-branch breakdown with quantities on hover/click — NOT inline)
- [ ] A search input filters tools by name (case-insensitive) via URL query param `?q=`
- [ ] A category filter via URL query param `?categoria=`
- [ ] A sort selector (options: Nome, Maior estoque, Menor estoque) via URL query param `?ordem=`
- [ ] Clicking a row navigates to `/dashboard/tools/[id]/stock`
- [ ] Empty state: "Nenhuma ferramenta cadastrada. Crie ferramentas em /dashboard/tools."
- [ ] If a tool has zero stockLevel rows, its Total displays as 0 and Filiais shows "Nenhuma filial com estoque"
- [ ] The page is a Server Component that queries the data directly
- [ ] No client-side editing on this page — any attempt to change qty redirects to the per-tool edit page

### R6: Per-Tool Stock Edit Page
**Description:** A per-tool dashboard page displays the tool's stock across branches, allows per-(tool, branch) adjustment, and shows the recent movement history.
**Acceptance Criteria:**
- [ ] Route `/dashboard/tools/[id]/stock` renders if the tool exists, otherwise returns Next.js `notFound()`
- [ ] Page header shows tool name, SKU, and a link back to `/dashboard/stock`
- [ ] A "Estoque por filial" table lists every branch from `listBranches()` — EVEN IF a `stock_level` row does NOT yet exist for that (tool, branch) pair (in which case quantity is displayed as 0 and the updatedAt column shows em dash)
- [ ] Each row shows: Filial, Quantidade atual, Ultima atualizacao (dd/MM/yyyy HH:mm or em dash), Acoes (botao "Ajustar")
- [ ] A "Historico de movimentacoes" section below the table shows the last 50 movements for this tool across all branches, newest first
- [ ] Movement history columns: Data (dd/MM/yyyy HH:mm), Filial, Qtd anterior, Qtd nova, Delta (green if positive, red if negative, gray if zero), Motivo (pt-BR label from enum), Usuario (actor name or em dash if null), Nota (reasonNote or em dash)
- [ ] When a movement row's `branchId` is NULL (branch was deleted after the movement was recorded), the Filial column MUST render the literal pt-BR text "Filial removida" in muted styling — NOT an em dash and NOT a crash
- [ ] When a movement row's `toolId` is NULL (tool was deleted after the movement was recorded), the history row MUST still render. Since the per-tool page filters by `toolId = [id]`, this case only arises if the current tool's own id was nulled — which is impossible while the page resolves from that tool. Therefore this AC is observationally a no-op on the per-tool page, but is still required so that any other consumer of the same movement query does not crash
- [ ] If there are zero movements, the history section shows: "Nenhuma movimentacao registrada"
- [ ] The page is a Server Component

### R7: Stock Adjustment Dialog
**Description:** A client component dialog captures a new absolute quantity for a given (tool, branch) pair along with optional reason metadata.
**Acceptance Criteria:**
- [ ] The dialog is triggered from the "Ajustar" button in R6's Estoque por filial table
- [ ] Dialog title: "Ajustar estoque — {branchName}"
- [ ] Dialog body shows: current quantity in a read-only display, a number input for "Nova quantidade" (min 0, integer), a Select for "Motivo" (optional) with pt-BR enum labels, a textarea for "Observacao" (only visible when Motivo = "Outro")
- [ ] The Select options (pt-BR labels paired with enum values): "Entrada de compra" → `entrada_compra`, "Saida de venda" → `saida_venda`, "Ajuste de inventario" → `ajuste_inventario`, "Perda" → `perda`, "Outro" → `outro`. The Select also has an empty default meaning "sem motivo"
- [ ] When Motivo is `outro`, the Observacao textarea is required and shows a validation error "Observacao obrigatoria quando motivo e 'Outro'" if empty on submit
- [ ] Submit button label: "Salvar ajuste". Cancel button: "Cancelar"
- [ ] After a successful submit, the dialog closes, the table row quantity updates, the history table re-renders with the new movement at the top, and a toast confirms "Estoque atualizado"
- [ ] On server error, the dialog stays open and displays the error inline

### R8: Adjust Stock Server Action
**Description:** A server action atomically updates a stock level and records a new stock movement, with row-level locking to prevent concurrent read-modify-write races on the same `(toolId, branchId)` pair. Because `SELECT ... FOR UPDATE` does not prevent two concurrent transactions that both see zero rows from racing to INSERT, the sequence uses `INSERT ... ON CONFLICT DO NOTHING` first to materialize the row (if missing), THEN `SELECT ... FOR UPDATE` to lock it. This is the canonical Postgres upsert-under-lock pattern.
**Acceptance Criteria:**
- [ ] A server action `adjustStock(input: { toolId, branchId, newQty, reason?, reasonNote? })` is exported from a feature folder (implementation chooses location, e.g., `apps/web/src/app/dashboard/stock/actions.ts` or nested under the tool stock route)
- [ ] The action calls `requireRole('admin')` at the top and reads `session.user.id` for `actorId`
- [ ] The action validates input against the Zod schema from R9 before opening the database transaction — Zod failure returns `{ ok: false, error }` without touching the DB
- [ ] **All database reads and writes happen inside a single `db.transaction(async (tx) => { ... })` callback** — the action MUST NOT read outside the transaction and then write inside it
- [ ] **Step 1 inside tx:** The action issues `INSERT INTO stock_level (tool_id, branch_id, quantity, updated_at) VALUES (?, ?, 0, NOW()) ON CONFLICT (tool_id, branch_id) DO NOTHING`. This materializes a row with quantity 0 if the (tool, branch) pair is new, or is a no-op if the row already exists. The `ON CONFLICT` target MUST explicitly name the composite key columns `(tool_id, branch_id)` — do NOT rely on an implicit constraint target
- [ ] **Step 2 inside tx:** The action issues `SELECT quantity FROM stock_level WHERE tool_id = ? AND branch_id = ? FOR UPDATE` (Drizzle `.for('update')`). After Step 1, the row is guaranteed to exist. This SELECT acquires a row-level lock. If a concurrent transaction is inside its own Step 1–3, this SELECT blocks until that transaction commits, then reads the newly-committed `quantity`
- [ ] **Step 3 inside tx:** The action computes `previousQty = result.quantity` (from Step 2) and `delta = newQty - previousQty` in application code — NOT via a DB-side subquery or CTE
- [ ] **Step 4 inside tx:** The action issues `UPDATE stock_level SET quantity = ?, updated_at = NOW() WHERE tool_id = ? AND branch_id = ?` with the caller's `newQty`. Because the row is locked from Step 2, this UPDATE cannot race with another transaction's write to the same row
- [ ] **Step 5 inside tx:** The action issues `INSERT INTO stock_movement` with `id` (nanoid), `toolId`, `branchId`, `previousQty` (from Step 3), `newQty`, `delta` (from Step 3), `reason`, `reasonNote`, `actorId = session.user.id`. Exactly one movement row per action call
- [ ] If any statement inside the transaction throws, the entire transaction rolls back (Drizzle `db.transaction` default behavior) — no partial `stock_level` update or orphan `stock_movement` row can persist
- [ ] After a successful commit (outside the transaction callback), the action calls `revalidatePath('/dashboard/stock')` and `revalidatePath(\`/dashboard/tools/${toolId}/stock\`)`
- [ ] Returns `{ ok: true, data: { previousQty, newQty, delta, movementId } }` on success, `{ ok: false, error }` on Zod failure or transaction rollback
- [ ] [manual-check] Concurrency verification: with two admin sessions open, submitting adjustments to the same `(toolId, branchId)` pair within 1 second of each other produces two sequential `stock_movement` rows whose `previousQty` and `delta` values correctly chain — the second movement's `previousQty` equals the first movement's `newQty`. Neither submission returns an error; neither produces a duplicate-key exception

### R9: Stock Adjustment Validation Schema
**Description:** An input validation schema constrains the adjust-stock action input.
**Acceptance Criteria:**
- [ ] A Zod schema `stockAdjustmentSchema` is exported from the same folder as R8's action (or a sibling `_schemas/` folder)
- [ ] `toolId` and `branchId` fields are required non-empty strings
- [ ] `newQty` field is an integer, min 0, max 999999
- [ ] `reason` field is an optional enum with values `entrada_compra`, `saida_venda`, `ajuste_inventario`, `perda`, `outro`
- [ ] `reasonNote` field is an optional string, max 500 characters
- [ ] A refinement enforces: if `reason === 'outro'`, `reasonNote` MUST be a non-empty string — pt-BR error message "Observacao obrigatoria quando motivo e 'Outro'"
- [ ] A second refinement enforces: if `reason` is undefined OR not `'outro'`, `reasonNote` MUST be undefined/null/empty — pt-BR error message "Observacao so pode ser preenchida quando motivo e 'Outro'". This prevents clean audit data from being polluted by stray notes when the Motivo dropdown is cleared after text was typed
- [ ] All validation error messages are in pt-BR

### R10: Stock Movements Query
**Description:** A read-side helper returns the most recent movements for a given tool, joined with branch name and actor name. All foreign keys are nullable per R1 (audit preservation), so the query must use LEFT JOINs and return sentinel values for nulls instead of crashing.
**Acceptance Criteria:**
- [ ] A query function `getStockMovements(toolId: string, limit = 50)` is exported from the same folder as R8's action
- [ ] Returns an array of objects shaped as `{ id, createdAt, branchId, branchName, previousQty, newQty, delta, reason, reasonNote, actorId, actorName }`
- [ ] Results are ordered by `createdAt` descending
- [ ] The query uses LEFT JOIN on `stock_movement.branch_id = branch.id` so movements whose branch was deleted (branchId now NULL) still appear in results — `branchName` comes back as `null` in that case
- [ ] The query uses LEFT JOIN on `stock_movement.actor_id = user.id` so movements whose actor was deleted (actorId now NULL) still appear — `actorName` comes back as `null` in that case
- [ ] The query filters by `stock_movement.tool_id = ?` — movements whose `toolId` was nulled by a tool delete are NOT returned by this function (they are archived but unreachable via per-tool page)
- [ ] The query does NOT call `requireRole` — read access is available to any authenticated dashboard user
- [ ] The query is implemented as a single round-trip (no N+1 — join happens in SQL, not in application code)

### R11: Sidebar Nav — Estoque por Filial Item Enabled
**Description:** The sidebar already contains a disabled item "Estoque por Filial" in the "Estoque" group (placed there by `cavekit-navigation-shell.md` R2, rendered in `app-sidebar.tsx`). This requirement enables that existing item — it does NOT add a new group or new nav entry.
**Acceptance Criteria:**
- [ ] In `apps/web/src/app/dashboard/_components/app-sidebar.tsx`, the `NAV_GROUPS` entry for the "Estoque" group already contains an item with `label: "Estoque por Filial"` and `href: "/dashboard/stock"` — this kit REMOVES the `disabled: true` flag from that item
- [ ] The item's label stays `"Estoque por Filial"` (pt-BR, matching existing sidebar convention — do NOT rename to just "Estoque")
- [ ] The item's `href` stays `/dashboard/stock`
- [ ] The existing `isActive()` helper in `app-sidebar.tsx` handles the active state because `/dashboard/tools/[id]/stock` starts with `/dashboard/tools`, not `/dashboard/stock` — therefore the per-tool stock edit page will NOT highlight "Estoque por Filial" but WILL highlight "Ferramentas" (acceptable since the user navigated from a tool context)
- [ ] No new sidebar groups are created; no other nav items are touched
- [ ] After enabling, clicking "Estoque por Filial" in the sidebar navigates to `/dashboard/stock` without redirect or 404

### R12: All Visible Text in pt-BR
**Description:** Every user-facing label on the stock pages, dialog, and history is in Brazilian Portuguese.
**Acceptance Criteria:**
- [ ] Reason enum labels map exactly to: `entrada_compra` → "Entrada de compra", `saida_venda` → "Saida de venda", `ajuste_inventario` → "Ajuste de inventario", `perda` → "Perda", `outro` → "Outro"
- [ ] Form labels, buttons, column headers, empty states, toasts, and error messages are all pt-BR
- [ ] English leakage check: "Create", "Save", "Stock", "Quantity", "Reason" return zero matches in the stock route files
- [ ] Section headers: "Estoque por filial", "Historico de movimentacoes"

### R13: Validation Gate Clean
**Description:** After implementation, the standard project validation commands pass.
**Acceptance Criteria:**
- [ ] `bun x ultracite check` exits with code 0
- [ ] `bun --filter=web run build` exits with code 0 with `/dashboard/stock`, `/dashboard/tools/[id]/stock`, and `/dashboard/branches/*` routes all registered
- [ ] [manual-check] Running `bun dev` and navigating through: create branch → adjust stock on a tool for that branch → see history row appear — completes without runtime errors

## Out of Scope

- Atomic transfer between branches (deferred to `cavekit-stock-transfer.md`)
- Negative quantities / backorder / pre-sale
- CSV import/export for stock
- Low-stock alerts / notifications
- Movement reversal (undo)
- Aggregate reports (top movers, stockouts, projections, turnover)
- Bulk editing across multiple (tool, branch) pairs
- Generic audit log across all mutations (deferred to `cavekit-audit-log.md`)
- Per-branch permissions (regional managers)
- Stock reservation / holds

## Cross-References

- See also: `cavekit-branches-crud.md` — branches must exist before stock can be adjusted
- See also: `cavekit-data-model.md` R1, R2 — `tool`, `stock_level`, `branch` tables this kit builds on
- See also: `cavekit-auth-access.md` R2, R4 — `requireRole('admin')` for mutations
- See also: `cavekit-navigation-shell.md` R2, R6, R7 — sidebar and inventory-tabs extended here
- See also: `cavekit-inventory-tools.md` R1, R2 — tools list and routes reused

## Changelog

| Date | Change |
|------|--------|
| 2026-04-15 | Initial draft |
| 2026-04-15 | Codex peer-review revisions: (1) `stock_movement.toolId` and `branchId` switched from `cascade` to `set null` to preserve audit trail; (2) index reshaped to `(tool_id, created_at DESC)` to match `getStockMovements(toolId)` access pattern; (3) R5 AC2 pinned to "popover" (removed "or inline" ambiguity); (4) R8 adds `db.transaction` + `SELECT ... FOR UPDATE` row locking requirement with concurrent-admin manual-check; (5) R9 adds inverse refinement rejecting stray `reasonNote` when `reason != 'outro'`; (6) R11 rewritten — the sidebar already contains a disabled "Estoque por Filial" item in the "Estoque" group from cavekit-navigation-shell R2, so this kit only removes the `disabled: true` flag rather than creating a new group |
| 2026-04-15 | Codex round-2 revisions: (7) R8 first-insert race fixed — sequence changed to INSERT ON CONFLICT DO NOTHING (materialize row with quantity 0) → SELECT FOR UPDATE (lock the now-existing row) → app-side compute previousQty/delta from locked value → UPDATE stock_level → INSERT stock_movement. Without Step 1, two concurrent transactions both seeing zero rows could race to INSERT and one would crash with unique-key violation. The ON CONFLICT target is explicit `(tool_id, branch_id)`; (8) R6 adds two ACs rendering "Filial removida" pt-BR label for movements whose `branchId` is NULL (preserved via `set null`); (9) R10 rewritten to use LEFT JOIN on `branch` and `user`, and exposes `branchId`, `branchName`, `actorId`, `actorName` in the return shape so R6's UI can discriminate null parents. Also clarifies that `toolId` filtering ignores movements whose `toolId` was nulled |
