---
created: "2026-04-14"
last_edited: "2026-04-14"
---

# Cavekit: Inventory — Tools CRUD

## Scope

Full create/read/update/delete interface for tools under `/dashboard/tools`. Includes a server-rendered list table with URL-driven filters, a create/edit form (Sheet or dedicated page), delete confirmation dialog, a read-only detail view with per-branch stock summary, and Supabase Storage image upload. All per-route components live in `apps/web/src/app/dashboard/tools/_components/`. Admin-only mutations enforced via `requireRole('admin')`. No component files in `packages/ui/src/components/*` are modified.

**User rule:** NEVER edit `packages/ui/src/components/*`. Use shadcn primitives from `@emach/ui/*` as-is.

**Prerequisite:** `cavekit-data-model.md` R1, R2, R7 must be complete (tool, category, supplier, stockLevel tables available via Drizzle). `cavekit-auth-access.md` R2, R4 must be complete (`requireRole` helper and action guards exist). `cavekit-navigation-shell.md` R6 must be complete (tools page lives inside `(inventory)` route group).

## Requirements

### R1: Tool List Page — Server-Rendered with Columns
**Description:** The tool list page is a Next.js Server Component that queries all tools directly via Drizzle and renders a data table.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/(inventory)/tools/page.tsx` exists (inside the inventory route group) — or `apps/web/src/app/dashboard/tools/page.tsx` if tools was not moved into `(inventory)/`, but must be consistent with R6 of `cavekit-navigation-shell.md`
- [ ] The page is an async Server Component (no `'use client'` at file top level)
- [ ] The Drizzle query joins `tool` with `category` and `supplier` and does a LEFT JOIN aggregate (or subquery) to compute total stock across all branches
- [ ] The rendered table contains the following columns for each tool: image thumbnail, name, category name, supplier name, `visibleOnSite` badge ("Visível" / "Oculto"), total stock quantity (sum across branches), actions menu
- [ ] `apps/web/src/app/dashboard/tools/_components/tools-table.tsx` exists and receives pre-fetched data as props from the page — the table component itself is a Client Component to support interactivity
- [ ] The actions menu per row contains at minimum: "Editar" (navigates to edit), "Excluir" (triggers delete dialog) — BOTH items are conditionally rendered only when `session.data?.user?.role === 'admin'`; for non-admin roles these items MUST NOT appear in the menu (omit from DOM entirely, do NOT show them disabled)

### R2: URL-Driven Filters
**Description:** Filters are encoded in the URL as search params so that the filter state survives page refresh and can be bookmarked.
**Acceptance Criteria:**
- [ ] Search param `q` drives text search filtering by tool name (case-insensitive, partial match)
- [ ] Search param `category` drives filtering by `categoryId`
- [ ] Search param `visible` drives filtering by `visibleOnSite` (`true`, `false`, or absent = show all)
- [ ] All three filters are applied server-side in the Drizzle query on the page (not client-side after fetch)
- [ ] `apps/web/src/app/dashboard/tools/_components/tool-filters.tsx` exists as a Client Component that reads current search params via `useSearchParams()` and updates the URL via `useRouter().push()` or `next/navigation` router
- [ ] Text input uses client-side debounce (300ms minimum) before updating the URL — not immediate on every keystroke
- [ ] Category filter uses a shadcn `Combobox` or `Select` populated with all categories fetched server-side and passed as props
- [ ] Visibility toggle uses a shadcn `Select` or toggle group with options: "Todos", "Visível", "Oculto"

### R3: Create Tool Flow — Sheet or Dedicated Page
**Description:** A "Nova ferramenta" action opens a creation form containing all tool fields.
**Acceptance Criteria:**
- [ ] A "Nova ferramenta" button is conditionally rendered on the tool list page ONLY when `session.data?.user?.role === 'admin'` — for non-admin roles the button MUST NOT be rendered in the DOM at all (do NOT use `disabled` attribute or CSS hiding; omit the element entirely)
- [ ] The create form contains fields for: name, slug, description (textarea), sku, voltage (select with options: "127V", "220V", "Bivolt", "380V"), price (numeric input), cost (numeric input), categoryId (combobox with category options), supplierId (combobox with supplier options, optional), visibleOnSite (switch or checkbox), image upload
- [ ] The form is rendered either: (a) inside a shadcn `Sheet` opened from the list page, OR (b) at a dedicated route `/dashboard/tools/new/page.tsx` — both approaches are acceptable; whichever is chosen must be consistent between create and edit
- [ ] `apps/web/src/app/dashboard/tools/_components/tool-form.tsx` exists and is the shared form component used for both create and edit
- [ ] On successful creation, the user is redirected to `/dashboard/tools` and sees a success toast

### R4: Zod Validation Schema
**Description:** A Zod schema colocated with the form validates all tool fields before submission.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` exists
- [ ] The Zod schema validates: `name` (non-empty string), `slug` (matches regex `^[a-z0-9-]+$`), `sku` (non-empty string), `voltage` (optional string), `price` (non-negative number or undefined/null), `cost` (non-negative number or undefined/null), `categoryId` (non-empty string), `supplierId` (optional string), `visibleOnSite` (boolean), `imageUrl` (optional string, URL format if present)
- [ ] `slug` field that fails the `^[a-z0-9-]+$` pattern produces a validation error message in pt-BR
- [ ] `price` and `cost` that are negative produce a validation error in pt-BR
- [ ] The Zod schema is used by both the client-side form (`tool-form.tsx`) and the server actions (`actions.ts`) — single source of truth
- [ ] `description` is optional — no validation error if empty

### R5: Image Upload to Supabase Storage
**Description:** A file input component uploads the tool image to the `tool-images` Supabase Storage bucket and stores the resulting public URL on the tool record.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/tools/_components/tool-image-upload.tsx` exists as a Client Component
- [ ] The component renders a file input that accepts `.jpg`, `.jpeg`, `.png`, `.webp` MIME types only
- [ ] Files larger than 5MB are rejected client-side before upload with an error message in pt-BR
- [ ] On file selection, the component uploads the file to Supabase Storage bucket `tool-images` using `@supabase/supabase-js` browser client
- [ ] After a successful upload, the component receives the public URL from Supabase and updates the form's `imageUrl` field value
- [ ] An image preview is rendered immediately after a successful upload (the preview URL is the Supabase public URL)
- [ ] Upload errors display a user-visible error message in pt-BR (e.g., "Falha ao enviar imagem. Tente novamente.")
- [ ] While uploading, the component shows a loading state (spinner or disabled input)
- [ ] No image is uploaded to a general `/api` route or stored as base64 — the upload goes directly to Supabase Storage from the client

### R6: Edit Tool Route
**Description:** The edit form reuses `tool-form.tsx` with pre-populated values.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/tools/[id]/edit/page.tsx` exists
- [ ] The page is an async Server Component that fetches the tool by `id` from the database and passes data to `tool-form.tsx`
- [ ] If the tool `id` does not exist in the database, the page calls Next.js `notFound()`
- [ ] All tool fields are pre-populated in the form on load
- [ ] The existing `imageUrl` is shown as a preview image if present
- [ ] On successful update, the user is redirected to `/dashboard/tools` and a success toast appears
- [ ] The edit page is accessible only to admin users — `requireRole('admin')` is called server-side on the page

### R7: Delete Confirmation Flow
**Description:** Deleting a tool requires explicit confirmation via a dialog.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx` exists
- [ ] The component renders a shadcn `AlertDialog` with a confirmation message that includes the tool name
- [ ] Confirming the dialog calls the `deleteTool(id)` server action
- [ ] After deletion, a success toast is shown and the tool list refreshes (via `router.refresh()` or revalidation)
- [ ] Cancelling the dialog closes it without any side effects
- [ ] [manual-check] After deletion, the deleted tool no longer appears in the list on the next render

### R8: Server Actions Gated by Admin Role
**Description:** All mutating server actions live in one file and call `requireRole('admin')` before any logic.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/tools/actions.ts` exists
- [ ] The file exports three named async functions: `createTool`, `updateTool`, `deleteTool`
- [ ] Each function begins with `await requireRole('admin')` (or `requireRole` equivalent) as the first statement
- [ ] `createTool` accepts validated tool data and inserts a new row into the `tool` table via Drizzle
- [ ] `updateTool` accepts a tool `id` and validated partial data and updates the matching row
- [ ] `deleteTool` accepts a tool `id` and deletes the matching row (and cascades to stock levels via FK)
- [ ] All three functions use the server-side Drizzle client from `@emach/db` — no direct SQL
- [ ] Each action calls `revalidatePath('/dashboard/tools')` after a successful mutation so the list refreshes

### R9: Tool Detail View with Stock Summary
**Description:** A read-only detail page shows all tool data plus a per-branch stock levels table.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/tools/[id]/page.tsx` exists
- [ ] The page is an async Server Component that queries the tool with its `category`, `supplier`, and `stockLevels` (joined with `branch` name)
- [ ] Displayed fields: name, slug, sku, description, voltage, price, cost, visibleOnSite, imageUrl (rendered as `<img>` or Next.js `<Image>`), category name, supplier name
- [ ] A table shows each branch name and its current stock quantity for this tool
- [ ] If no stock levels exist for the tool, an appropriate empty state is shown
- [ ] Stock levels are read-only in Phase 1 — no editing controls are rendered on this page

### R10: Component File Locations
**Description:** All per-route components are colocated in the tools `_components/` folder following the per-route convention.
**Acceptance Criteria:**
- [ ] `apps/web/src/app/dashboard/tools/_components/tools-table.tsx` exists
- [ ] `apps/web/src/app/dashboard/tools/_components/tool-filters.tsx` exists
- [ ] `apps/web/src/app/dashboard/tools/_components/tool-form.tsx` exists
- [ ] `apps/web/src/app/dashboard/tools/_components/tool-image-upload.tsx` exists
- [ ] `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` exists
- [ ] `apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx` exists
- [ ] None of these files exist inside `packages/ui/src/components/` — NEVER add component files there
- [ ] None of these files are placed in `apps/web/src/components/` (the shared app-level components folder is reserved for cross-route components like `providers.tsx` and `app-header.tsx`)

### R11: Empty State for No Tools
**Description:** When no tools exist (or no tools match the active filters), the page shows a centered empty state with a CTA.
**Acceptance Criteria:**
- [ ] When the tool list query returns zero results, the table is replaced by an empty state UI
- [ ] The empty state includes a message explaining there are no tools (pt-BR, e.g., "Nenhuma ferramenta encontrada")
- [ ] If the empty state is due to zero tools total (not a filtered result), a "Nova ferramenta" CTA button is conditionally rendered ONLY when `session.data?.user?.role === 'admin'` — for non-admin roles the CTA MUST NOT appear in the DOM at all (omit element entirely, never show it disabled)
- [ ] If the empty state is due to active filters returning no results, a "Limpar filtros" link or button is shown instead of the "Nova ferramenta" CTA
- [ ] The empty state uses the shadcn empty state pattern or an equivalent centered layout — it does NOT use a third-party component outside `@emach/ui`

### R12: Lint and Build Pass
**Description:** The tools CRUD implementation must not introduce any lint or build errors.
**Acceptance Criteria:**
- [ ] `bun x ultracite check` exits with code 0 after all tools files are created
- [ ] `bun --filter web run build` exits with code 0 after all tools files are created
- [ ] No TypeScript errors (`tsc --noEmit`) on `apps/web` after implementation

### R13: Toasts for All Mutations
**Description:** Every successful or failed mutation shows a user-visible toast notification using the `sonner` Toaster already configured in Providers.
**Acceptance Criteria:**
- [ ] Successful tool creation shows a toast: "Ferramenta criada com sucesso" (or equivalent pt-BR)
- [ ] Successful tool update shows a toast: "Ferramenta atualizada com sucesso" (or equivalent pt-BR)
- [ ] Successful tool deletion shows a toast: "Ferramenta excluída" (or equivalent pt-BR)
- [ ] Any server action error (database failure, validation failure) shows an error toast in pt-BR
- [ ] All toasts are triggered via `sonner`'s `toast()` function — no `alert()`, `confirm()`, or custom modal
- [ ] [manual-check] Creating, editing, and deleting a tool each produce the corresponding toast in the bottom-right of the screen

## Out of Scope

- Bulk CSV import or export
- Stock level editing on any tools page — stock editing is a separate "Estoque por Filial" page (Phase 2 UI)
- Linking promotions to tools in the UI (Phase 2)
- Inline cell editing in the list table
- Column sorting in the list table (Phase 2)
- Audit log or version history for tool changes
- Print views or PDF export
- Duplicate/clone tool action
- Drag-and-drop image upload (file input only in Phase 1)

## Cross-References

- See also: `cavekit-data-model.md` — `tool`, `category`, `supplier`, `stockLevel` schemas queried here; R1 and R2 of that kit are prerequisites
- See also: `cavekit-auth-access.md` — `requireRole('admin')` used in R6 (edit page) and R8 (server actions); R4 of that kit gates mutations
- See also: `cavekit-navigation-shell.md` — tools pages are hosted inside the `(inventory)` route group shell defined there; R6 of that kit is a prerequisite

## Changelog

| Date | Change |
|------|--------|
| 2026-04-14 | Initial draft |
| 2026-04-14 | R1/R3/R11: non-admin mutation CTAs must be omitted from DOM entirely (no `disabled` state) |
