---
created: "2026-04-15"
last_edited: "2026-04-15"
---

# Cavekit: Branches CRUD

## Scope

CRUD de filiais (branch). Cria, edita, lista e deleta filiais. Rota `/dashboard/branches` fora do route group `(inventory)`. O sidebar ja contem um item disabled "Filiais" no grupo "Configurações" (colocado la por `cavekit-navigation-shell.md` R2) — este kit apenas habilita esse link existente, nao cria novo grupo. Usa o schema `branch` que ja existe em `cavekit-data-model.md` R2 — nenhuma mudanca de schema.

**Prerequisite:** `cavekit-data-model.md` R2 (branch table) must exist. `cavekit-auth-access.md` R2, R4 (`requireRole` helper and admin guard) must be complete. `cavekit-navigation-shell.md` R2 (sidebar nav tree pattern) must be complete.

## Requirements

### R1: Branch Input Validation Schema
**Description:** An input validation schema exists for branch create and update operations with rules for `name` and `address`.
**Acceptance Criteria:**
- [ ] A Zod schema is exported from the branches feature folder (under the `(admin)` or top-level `/dashboard/branches/_components/` directory — implementation chooses exact folder following existing tools convention from `cavekit-inventory-tools.md`)
- [ ] `name` field: required string, minimum 2 characters, maximum 120 characters, trimmed
- [ ] `address` field: optional string, maximum 500 characters, trimmed, empty string coerced to undefined
- [ ] Schema rejects empty `name` with pt-BR error message "Nome obrigatorio"
- [ ] Schema rejects `name` shorter than 2 chars with pt-BR error message "Nome muito curto"

### R2: Branch CRUD Server Actions
**Description:** Server-side mutation and query functions expose list/create/update/delete/get-by-id operations for branches. All mutations require admin role. Read queries require any authenticated user.
**Acceptance Criteria:**
- [ ] A file `apps/web/src/app/dashboard/branches/actions.ts` exports async functions `listBranches`, `getBranch(id)`, `createBranch(input)`, `updateBranch(id, input)`, `deleteBranch(id)`
- [ ] `createBranch`, `updateBranch`, `deleteBranch` each call `requireRole('admin')` at the top of the function body
- [ ] `listBranches` orders results by `name` ascending
- [ ] `getBranch` returns `null` for non-existent ids — does NOT throw
- [ ] All mutations generate branch `id` using `nanoid()` (create) and pass `new Date()` to `updatedAt` where needed
- [ ] `createBranch` and `updateBranch` validate input against the schema from R1 before touching the database
- [ ] `deleteBranch` cascades to `stock_level` rows automatically via the existing FK. Movement history rows (`stock_movement`) are NOT destroyed — their `branchId` is set to `NULL` per `cavekit-stock-management.md` R1. The action MUST call `revalidatePath('/dashboard/branches')`, `revalidatePath('/dashboard/stock')`, AND `revalidatePath('/dashboard/tools', 'layout')` (second argument `'layout'` purges the entire `/dashboard/tools/*` subtree, including all per-tool `/dashboard/tools/[id]/stock` pages which show branch rows) after deletion
- [ ] Server actions return `{ ok: true, data? }` or `{ ok: false, error: string }` — no throwing to the client except for `requireRole` guard failures

### R3: Branches List Page
**Description:** A read-only dashboard page lists all branches in a table.
**Acceptance Criteria:**
- [ ] Route `/dashboard/branches` renders a page that lists every branch
- [ ] Table columns: Nome (branch name), Endereco (address or em dash if empty), Criado em (createdAt formatted `dd/MM/yyyy`), Acoes (edit + delete buttons)
- [ ] A "Nova filial" button in the page header navigates to `/dashboard/branches/new`
- [ ] If there are zero branches, an empty state message displays: "Nenhuma filial cadastrada"
- [ ] The page is a Server Component that calls `listBranches()` directly — no client-side fetch

### R4: Create Branch Page
**Description:** A form page creates a new branch.
**Acceptance Criteria:**
- [ ] Route `/dashboard/branches/new` renders a form with fields `Nome` (required) and `Endereco` (optional, textarea)
- [ ] On submit, `createBranch` is called; on success, the user is redirected to `/dashboard/branches`
- [ ] Validation errors from the R1 schema display inline below each field in pt-BR
- [ ] A "Cancelar" button returns to `/dashboard/branches` without submitting

### R5: Edit Branch Page
**Description:** A form page pre-populated with an existing branch's data allows updating its fields.
**Acceptance Criteria:**
- [ ] Route `/dashboard/branches/[id]/edit` loads the branch via `getBranch(id)` in a Server Component
- [ ] If `getBranch` returns `null`, the page renders a Next.js `notFound()` response
- [ ] The form component is the SAME component used in R4 (shared under `_components/branch-form.tsx`), receiving optional `defaultValues` and `mode: 'create' | 'edit'` props
- [ ] On submit, `updateBranch(id, input)` is called; on success, user redirects to `/dashboard/branches`
- [ ] The page displays the branch name in its header/title

### R6: Delete Branch Confirmation Dialog
**Description:** A delete action prompts the user to confirm before destructive deletion.
**Acceptance Criteria:**
- [ ] A confirmation dialog component is triggered from the Acoes column in R3
- [ ] The dialog title includes the branch name
- [ ] The dialog body warns: "Esta acao nao pode ser desfeita. Todos os niveis de estoque desta filial serao removidos. O historico de movimentacoes sera preservado mas a filial aparecera como 'filial removida' nos registros antigos."
- [ ] Buttons: "Cancelar" (closes dialog) and "Deletar" (calls `deleteBranch` and refreshes the list)
- [ ] On success, a toast or inline message confirms: "Filial removida"
- [ ] On error, the dialog shows the error message and stays open

### R7: Sidebar Nav — Filiais Item Enabled
**Description:** The sidebar already contains a disabled item "Filiais" in the "Configurações" group (placed there by `cavekit-navigation-shell.md` R2, rendered in `app-sidebar.tsx`). This requirement enables that existing item — it does NOT create a new group or new nav entry.
**Acceptance Criteria:**
- [ ] In `apps/web/src/app/dashboard/_components/app-sidebar.tsx`, the `NAV_GROUPS` entry for the "Configurações" group already contains an item with `label: "Filiais"` and `href: "/dashboard/branches"` — this kit REMOVES the `disabled: true` flag from that item
- [ ] The item's label stays `"Filiais"` (pt-BR, matching existing sidebar convention)
- [ ] The item's `href` stays `/dashboard/branches`
- [ ] The existing `isActive()` helper in `app-sidebar.tsx` already handles active-state highlighting for any pathname starting with `/dashboard/branches` — no change to that helper is needed
- [ ] No new sidebar groups are created; no other nav items are touched; no icons are added (the existing sidebar does not use per-item icons per `cavekit-navigation-shell.md`)
- [ ] After enabling, clicking "Filiais" in the sidebar navigates to `/dashboard/branches` without redirect or 404

### R8: All Visible Text in pt-BR
**Description:** Every user-facing label on the branches pages and dialogs is in Brazilian Portuguese.
**Acceptance Criteria:**
- [ ] Form labels, buttons, column headers, empty states, and error messages are all pt-BR
- [ ] English leakage is zero — search for common English UI words like "Create", "Save", "Name", "Address", "Delete" returns zero matches in the branches route files
- [ ] Validation error messages follow the same pt-BR tone as the tools CRUD (from `cavekit-inventory-tools.md`)

### R9: Validation Gate Clean
**Description:** After implementation, the standard project validation commands pass without errors.
**Acceptance Criteria:**
- [ ] `bun x ultracite check` exits with code 0
- [ ] `bun --filter=web run build` exits with code 0 with the new branches routes registered

## Out of Scope

- Manager/responsavel por filial (per-branch user assignment)
- Structured address fields (street, city, state, zip, cep)
- Operating hours / schedule
- Geolocation / geocoding
- Automated branch seed (operator creates manually via UI after deploy)
- Bulk import / CSV
- Branch-level metrics or dashboards
- Soft delete (`deletedAt`)

## Cross-References

- See also: `cavekit-data-model.md` R2 — the `branch` table schema consumed here
- See also: `cavekit-auth-access.md` R2, R4 — `requireRole` helper used by mutations
- See also: `cavekit-navigation-shell.md` R2 — sidebar tree pattern extended here
- See also: `cavekit-stock-management.md` — depends on branches existing

## Changelog

| Date | Change |
|------|--------|
| 2026-04-15 | Initial draft |
| 2026-04-15 | Codex peer-review revisions: (1) R7 rewritten — the sidebar already contains a disabled "Filiais" item in the "Configurações" group from `cavekit-navigation-shell.md` R2, so this kit only removes the `disabled: true` flag; no new group "Organizacao" is created; (2) R6 dialog warning updated to explain that `stock_movement` history is preserved via `set null` on `branchId` (per `cavekit-stock-management.md` R1 revision); (3) R2 `deleteBranch` now also calls `revalidatePath('/dashboard/tools', 'layout')` to purge all per-tool `/dashboard/tools/[id]/stock` pages whose branch rows go stale after deletion |
