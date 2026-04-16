---
created: "2026-04-14"
last_edited: "2026-04-15"
---

# Cavekit Overview — emach-dashboard

**Project:** emach-dashboard — Sistema de gestão de estoque e ecommerce E-mach
**Phase:** 1 (Complete) → 2 (Stock Management, Complete) → 3 (Promotions CRUD)
**Stack:** Bun + Turbo monorepo, Next.js 16.2, React 19, Tailwind v4, shadcn/ui (`base-lyra`), Drizzle ORM (pg), better-auth 1.5.5, Supabase local

---

## Domain Index

| Kit | File | Domain | One-Line Description |
|-----|------|--------|----------------------|
| 1 | `cavekit-design-foundation.md` | UI/Tokens | Rewrite globals.css to the DESIGN.md warm parchment/terracotta dark-only palette; disable rings; configure forced dark mode |
| 2 | `cavekit-data-model.md` | Database | Full Drizzle schema for tools, categories, suppliers, branches, stock levels, promotions (schema only), and API keys (schema only); extend user with role |
| 3 | `cavekit-auth-access.md` | Auth | Extend session type for role, add `requireRole` helper, guard `/dashboard/*`, gate tool mutations to admin |
| 4 | `cavekit-navigation-shell.md` | UI/Shell | Sidebar navigation + contextual inventory tabs for the dashboard subtree; suppress AppHeader on dashboard routes |
| 5 | `cavekit-inventory-tools.md` | Feature | Full tools CRUD: list table with URL filters, create/edit form, Supabase Storage image upload, delete confirm, read-only detail view |
| 6 | `cavekit-branches-crud.md` | Feature | Full branches CRUD: list, create, edit, delete with confirmation; admin-gated mutations; enables the existing disabled "Filiais" item in the "Configurações" sidebar group (placed there by cavekit-navigation-shell R2) |
| 7 | `cavekit-stock-management.md` | Feature | Stock editing per branch with audit trail: `stock_movement` schema, consolidated `/dashboard/stock` page, per-tool edit page with adjustment dialog and history |
| 8 | `cavekit-promotions-crud.md` | Feature | Full promotions CRUD: dual-type (promoção/promocode) with N:N tool join, discriminator column, form with conditional code field, admin-gated, inventory tab + sidebar activation |

---

## Requirement Count per Kit

| Kit | Requirements | Acceptance Criteria (total) | Manual-Check Items |
|-----|-------------|----------------------------|--------------------|
| cavekit-design-foundation.md | R1–R12 (12) | 56 | 8 |
| cavekit-data-model.md | R1–R11 (11) | 69 | 1 |
| cavekit-auth-access.md | R1–R7 (7) | 29 | 3 |
| cavekit-navigation-shell.md | R1–R10 (10) | 49 | 4 |
| cavekit-inventory-tools.md | R1–R13 (13) | 83 | 2 |
| cavekit-branches-crud.md | R1–R9 (9) | 44 | 0 |
| cavekit-stock-management.md | R1–R13 (13) | 95 | 2 |
| cavekit-promotions-crud.md | R1–R11 (11) | 122 | 0 |
| **Total** | **86** | **547** | **20** |

---

## Cross-Reference Map

| Kit | Depends On | Is Depended On By |
|-----|-----------|-------------------|
| `cavekit-design-foundation.md` | — | `cavekit-navigation-shell.md` (sidebar tokens) |
| `cavekit-data-model.md` | — | `cavekit-auth-access.md` (role column), `cavekit-inventory-tools.md` (tool/stock schema), `cavekit-promotions-crud.md` R1 (supersedes R3; R6/R7 gain Phase-3 follow-up ACs) |
| `cavekit-auth-access.md` | `cavekit-data-model.md` (R5, R8) | `cavekit-navigation-shell.md` (session guard), `cavekit-inventory-tools.md` (requireRole) |
| `cavekit-navigation-shell.md` | `cavekit-design-foundation.md` (tokens), `cavekit-auth-access.md` (guard) | `cavekit-inventory-tools.md` (route group host) |
| `cavekit-inventory-tools.md` | `cavekit-data-model.md` (R1, R2, R7), `cavekit-auth-access.md` (R2, R4), `cavekit-navigation-shell.md` (R6) | `cavekit-stock-management.md` (tools list + routes reused) |
| `cavekit-branches-crud.md` | `cavekit-data-model.md` (R2), `cavekit-auth-access.md` (R2, R4), `cavekit-navigation-shell.md` (R2) | `cavekit-stock-management.md` (branches must exist before stock can be adjusted) |
| `cavekit-stock-management.md` | `cavekit-branches-crud.md`, `cavekit-data-model.md` (R1, R2), `cavekit-auth-access.md` (R2, R4), `cavekit-navigation-shell.md` (R2, R6, R7), `cavekit-inventory-tools.md` (R1, R2) | — |
| `cavekit-promotions-crud.md` | `cavekit-data-model.md` R3 (schema base), `cavekit-auth-access.md` R2+R4, `cavekit-navigation-shell.md` R2+R6+R7, `cavekit-inventory-tools.md` R1 | — (nothing yet) |

---

## Dependency Graph — Implementation Order

Kits 1 and 2 have no dependencies and can be implemented in parallel.

```
Kit 1 (Design Foundation) ──┐
                             ↓
Kit 2 (Data Model) ─────────┬──→  Kit 3 (Auth Access) ──→  Kit 4 (Navigation Shell) ──→  Kit 5 (Inventory Tools)
                             └──────────────────────────────────────────────────────────────↗
                                                                                            ↓
                                                             Kit 6 (Branches CRUD) ──→  Kit 7 (Stock Management)

Kit 2 (Data Model) ──→  Kit 8 (Promotions CRUD)  ←──  Kit 3 (Auth Access)
                                    ↑
                         Kit 4 (Navigation Shell)
                         Kit 5 (Inventory Tools)
```

**Recommended implementation order:**

| Step | Kits | Parallelizable? | Notes |
|------|------|-----------------|-------|
| 1 | Kit 1 + Kit 2 | Yes — both independent | Kit 2's `db:push` can run while Kit 1 is in progress |
| 2 | Kit 3 | After Kit 2 R5 + R8 | Needs role column and drizzleAdapter update |
| 3 | Kit 4 | After Kit 1 (tokens) + Kit 3 (guard) | Sidebar shell and layout |
| 4 | Kit 5 | After Kit 2 R1+R2+R7 + Kit 3 R2+R4 + Kit 4 R6 | Full CRUD feature |
| 5 | Kit 6 | After Kit 2 R2 + Kit 3 R2+R4 + Kit 4 R2 | Branches CRUD must ship before stock editing |
| 6 | Kit 7 | After Kit 6 + Kit 2 R1+R2 + Kit 3 R2+R4 + Kit 4 R2+R6+R7 + Kit 5 R1+R2 | Stock editing, audit trail, inventory tabs activation |
| 7 | Kit 8 | After Kit 2 R3 + Kit 3 R2+R4 + Kit 4 R2+R6+R7 + Kit 5 R1 | Promotions CRUD: schema delta, server actions, form, list, sidebar + tab activation |

---

## Phase 2 Deferred Items

These items were explicitly decided to be out of scope for Phase 1. Each should become its own cavekit when Phase 2 begins.

| Deferred Item | Reason Deferred | Suggested Phase 2 Kit |
|---------------|-----------------|----------------------|
| Public REST API endpoints (read tool list, read stock, read promotions) | Infrastructure design pending; API key schema exists | `cavekit-public-api.md` |
| API key validation middleware (verify `X-API-Key` header against `apiKey.keyHash`) | Depends on public API kit | `cavekit-public-api.md` |
| `DISABLE_SIGN_UP` env flag wiring (block new registrations in production) | Low priority; documented in auth kit R5 | `cavekit-auth-access.md` (revision) |
| CSV import/export for tools or stock | Not in user scope for Phase 1 | `cavekit-inventory-tools.md` (revision) |
| Audit log (track mutations with actor, timestamp, before/after) | Requires additional schema and UI; no Phase 1 requirement | `cavekit-audit-log.md` |

---

## Global Constraints (apply to all kits)

1. **NEVER edit `packages/ui/src/components/*`** — shadcn convention. All customization through `globals.css` tokens or per-route `_components/` only.
2. **Dark-mode only.** `forcedTheme="dark"`, `enableSystem={false}`. No light token block.
3. **No rings anywhere.** `--ring` and `--sidebar-ring` are transparent. Focus uses `:focus-visible` CSS outline (2px solid terracotta). No Tailwind `ring-*` utilities on focusable elements.
4. **Per-route components.** Each dashboard route has its own `_components/` folder inside the route directory. Cross-route shared components go in `apps/web/src/components/`.
5. **All visible text in pt-BR.** Technical identifiers (variable names, file names) stay in English.
6. **Conventional Commits in pt-BR.** Commit messages use `feat:`, `fix:`, `refactor:` etc. with Portuguese descriptions.
7. **Lint gate.** `bun x ultracite check` must pass after every kit implementation.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-14 | Initial Phase 1 overview — 6 kits, 60 requirements, 197 acceptance criteria |
| 2026-04-14 | Removed `cavekit-karpathy-skill.md` — karpathy-guidelines already installed as user-level skill. Scope reduced to 5 kits, 53 requirements, 179 acceptance criteria |
| 2026-04-15 | Phase 2 sketch — added `cavekit-branches-crud.md` and `cavekit-stock-management.md`. Total 7 kits, 75 requirements. |
| 2026-04-15 | Codex peer review revisions to Phase 2 kits: (a) `stock_movement` FKs to tool/branch switched from `cascade` to `set null` preserving audit trail; (b) `stock_movement` index reshaped to `(tool_id, created_at DESC)` matching `getStockMovements(toolId)` access pattern; (c) `adjustStock` server action R8 now mandates `db.transaction` + `SELECT ... FOR UPDATE` row locking with concurrent-admin manual-check AC; (d) `stockAdjustmentSchema` R9 adds inverse refinement rejecting stray `reasonNote`; (e) R5 consolidated stock list AC pinned to "popover" (removed "or inline" ambiguity); (f) Kit 6 R7 and Kit 7 R11 rewritten — both sidebar items ("Filiais" and "Estoque por Filial") already exist disabled in `app-sidebar.tsx` from navigation-shell R2; kits only flip `disabled: true` to `false`, no new groups; (g) Kit 6 R2 `deleteBranch` now revalidates `/dashboard/tools` layout to flush per-tool stock pages. |
| 2026-04-15 | Codex round-2 revisions: (h) R8 first-insert race fixed — sequence changed to `INSERT ON CONFLICT DO NOTHING` (materialize row) → `SELECT FOR UPDATE` (lock) → compute previousQty → `UPDATE` → insert movement. Without Step 1, two concurrent transactions both seeing zero rows could race to INSERT and one would crash with unique-key violation; (i) R6 adds explicit ACs rendering "Filial removida" label for movements whose `branchId` is NULL (audit preservation makes this path reachable); (j) R10 switched to LEFT JOIN on `branch` and `user` so movements with deleted parents still appear, and clarifies `toolId` filtering. Totals: 318 AC (was 314). |
| 2026-04-15 | Phase 3 sketch — added `cavekit-promotions-crud.md`. Total 8 kits, 86 requirements, 438 acceptance criteria. |
| 2026-04-15 | Promotions kit review-loop iter 2: (a) R1 adds `createDb()` schema-object AC and DB-level `unique()` on `promotion.code`; (b) R3 stacking guard opening rewritten to explicit window-aware "ativa" definition; (c) `cavekit-data-model.md` R3 marked superseded by promotions-crud R1, R6/R7 gained Phase-3 follow-up ACs; (d) R4 deps list adds navigation-shell R7; (e) R3 listPromotions sort stability AC; (f) AC recount across all kits — Kit 8 corrected from 120 to 122; grand total corrected from 438 to 547 (all kit rows recount-corrected). Cross-reference map updated with backward link from data-model to promotions-crud. |
