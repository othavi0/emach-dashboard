---
created: "2026-04-15"
last_edited: "2026-04-15"
---

# Impl: Promotions CRUD (Kit 8 — Phase 3)

Build site: context/plans/build-site-phase-3.md
Kit: context/kits/cavekit-promotions-crud.md

## Task Status

| Task | Req | Title | Status | Commit | Files |
|---|---|---|---|---|---|
| T-200 | R1 | Schema delta promotions (drop toolId, add type+code, promotion_tool join) | DONE | 5200ffe | `packages/db/src/schema/promotions.ts` |
| T-201 | R1 | Wire `promotionTool` em `schema/index.ts` barrel + `createDb()` | DONE | abe2358 | `packages/db/src/schema/index.ts` (novo wildcard barrel) + `packages/db/src/index.ts` (imports + schema obj) |
| T-202 | R1 | `db:push` + DB inspection (table, composite PK, columns) | DONE | DB-only (no commit) | Cloud Supabase `db.wrxohbzepoyscsacjzvd`. Manual DROP TABLE promotion CASCADE (0 rows) → `drizzle-kit push --force`. Verified `\d public.promotion` (all cols + unique code), `\d public.promotion_tool` (composite PK + 2 cascade FKs). NO `tool_id` em promotion. |
| T-203 | R2 | Zod `promotionSchema` discriminated union + `createPromotionSchema` wrapper + pt-BR | DONE | da60de7 (+56e56f7 fix) | `apps/web/src/app/dashboard/(inventory)/promotions/_components/promotion-schema.ts` |
| T-204 | R3 | Server actions `listPromotions` + `getPromotion` | DONE | 51f3340 | `apps/web/src/app/dashboard/(inventory)/promotions/actions.ts` (409 linhas, bundle packet) |
| T-205 | R3 | Server actions `createPromotion` + `updatePromotion` (tx, guards, stacking) | DONE | 51f3340 | same file — window-aware stacking guard via INNER JOIN promotion_tool + tool, title-per-type unique, code unique, `db.transaction` delete-and-recreate pattern pra join sync |
| T-206 | R3 | Server action `deletePromotion` | DONE | 51f3340 | same file — FK cascade limpa `promotion_tool` automaticamente, revalidatePath |
| T-207 | R4 | List page `/dashboard/(inventory)/promotions` | DONE | f6df088 (+89ba600 fix) | `page.tsx` (105L) + `promotions-table.tsx` (189L) + `promotions-filters.tsx` (107L). Admin-gated Ações via `requireCurrentSession().user.role`. Window-aware isPromotionActive. 14/14 R4 ACs. |
| T-208 | R5 | Shared `promotion-form.tsx` | DONE | 9b8eb19 (+89ba600 fix) | `promotion-form.tsx` (507L). Inline ToolCombobox ~80L. Mode create=RadioGroup, edit=static text. Conditional code field. Popover+Command multi-select + chips. useState+safeParse pattern. 22/22 R5+R6 form ACs. |
| T-209 | R5 | Create page `new/page.tsx` | DONE | 32a2ad5 | `promotions/new/page.tsx` (32L). requireRole, db.select tools, mode=create. |
| T-210 | R6 | Edit page `[id]/edit/page.tsx` | DONE | 5fb1aad | `promotions/[id]/edit/page.tsx` (61L). getPromotion→notFound, defaultValues+toolIds, mode=edit. |
| T-211 | R7 | Delete confirmation dialog | DONE | 50fd706 | `delete-promotion-dialog.tsx` (87L inline) + wire promotions-table.tsx stub→dialog. AlertDialog pattern. |
| T-212 | R8 | Inventory tab flip | DONE | 6ce68b2 | `inventory-tabs.tsx` — removed disabled/aria-disabled/tabIndex, add PROMOTIONS_HREF const + Link render. resolveActiveTab untouched (already had promotions branch). |
| T-213 | R9 | Sidebar item "Promoções" add | DONE | 6ce68b2 | `app-sidebar.tsx` — append `{label: "Promoções", href: "/dashboard/promotions"}` to "Estoque" group items after "Estoque por Filial". |
| T-214 | R10 | pt-BR audit | DONE | 6ce68b2 | Grep English UI terms (Create/Save/Delete/Name/Title/Code/Edit/Cancel/Filter/Search) in promotions tsx files → 0 matches. ts files only in code comments. |
| T-215 | R11 | Validation gate (ultracite + build + db:push) | DONE | — | ultracite 152 files 0 issues. build exit 0 (16 routes incl 3 promotions). db:push changes applied. |

## Progress

**Phase 3 progress: 16/16 tasks COMPLETE (100%)**

## Fix Notes

- **56e56f7** — pós-T-203: `ZodIssueCode.custom` marcado deprecated em Zod 4.x. Substituído por literal `"custom"` em 3 call sites (`z.ZodIssueCode.custom` → `"custom"`). Funcionalidade idêntica, remove warning TS 6385.
