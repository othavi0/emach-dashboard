---
created: "2026-04-15"
last_edited: "2026-04-15"
---

# Impl: Stock Management (Kit 7)

Build site: context/plans/build-site-phase-2.md
Kit: context/kits/cavekit-stock-management.md

## Task Status

| Task | Req | Title | Status | Commit | Files |
|---|---|---|---|---|---|
| T-110 | R1 | stock_movement schema file | DONE | 0779412 | `packages/db/src/schema/stock-movements.ts` |
| T-111 | R2 | Barrel re-export + createDb schema | DONE | (pending) | `packages/db/src/index.ts` (stockMovement added to schema object via direct import — no barrel per Phase 1 T-017 noBarrelFile convention) |
| T-112 | R3 | db:push apply | DONE | (pending) | `bun --cwd packages/db run db:push` → `[✓] Changes applied` contra Supabase remota (db.wrxohbzepoyscsacjzvd.supabase.co). stock_movement + 2 indexes criados. |
| T-113 | R9 | stockAdjustmentSchema Zod | DONE | 0779412 | `apps/web/src/app/dashboard/stock/_components/stock-adjustment-schema.ts` |
| T-114 | R8 | adjustStock server action (5-step transactional) | DONE | (pending) | `apps/web/src/app/dashboard/stock/actions.ts` (db.transaction + INSERT ON CONFLICT DO NOTHING + SELECT FOR UPDATE + UPDATE + INSERT movement) |
| T-115 | R10 | getStockMovements query with LEFT JOINs | DONE | (pending) | `apps/web/src/app/dashboard/stock/actions.ts` (LEFT JOIN branch + LEFT JOIN user, ordenado desc) |
| T-116 | R5 (AC1-2,6-10) | Consolidated stock list page | DONE | (pending) | `apps/web/src/app/dashboard/stock/page.tsx`, `_components/stock-table.tsx` (raw SQL com json_agg, popover filiais, empty state) |
| T-117 | R5 (AC3-5) | URL query param filters | PENDING | — | — |
| T-118 | R6 (AC1-4,10) | Per-tool stock page header + filiais table | PENDING | — | — |
| T-119 | R6 (AC5-9) | History section + null branch labels | PENDING | — | — |
| T-120 | R7 | Adjust stock dialog | PENDING | — | — |
| T-121 | R4 | Enable Estoque tab in inventory-tabs | PENDING | — | — |
| T-122 | R11 | Remove disabled flag from Estoque por Filial sidebar | PENDING | — | — |
| T-123 | R12 | pt-BR audit | PENDING | — | — |
| T-124 | R8 AC14 + R13 | Validation gate + 2 manual checks | PENDING | — | — |

## Dead Ends Avoided

- **R1 `onDelete: 'cascade'` (initial draft)** — Codex flagged destruction of audit trail on tool/branch delete. Switched to `set null` with nullable FKs. History preserved via LEFT JOIN in R10 queries.
- **R1 index `(tool_id, branch_id, created_at)`** — Codex flagged wasted middle column for `getStockMovements(toolId)` query pattern. Reshaped to `(tool_id, created_at DESC)`.
- **R8 `SELECT FOR UPDATE` without prior INSERT** — Codex round 2 flagged first-insert race: 2 tx that both see zero rows race to INSERT and one crashes. Fixed with `INSERT ON CONFLICT (tool_id, branch_id) DO NOTHING` → `SELECT FOR UPDATE` sequence.
