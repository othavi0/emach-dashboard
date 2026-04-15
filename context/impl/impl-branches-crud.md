---
created: "2026-04-15"
last_edited: "2026-04-15"
---

# Impl: Branches CRUD (Kit 6)

Build site: context/plans/build-site-phase-2.md
Kit: context/kits/cavekit-branches-crud.md

## Task Status

| Task | Req | Title | Status | Commit | Files |
|---|---|---|---|---|---|
| T-100 | R1 | Zod schema `branchSchema` | DONE | 0779412 | `apps/web/src/app/dashboard/branches/_components/branch-schema.ts` |
| T-101 | R2 | Server actions list/get/create/update/delete + requireRole | DONE | (pending) | `apps/web/src/app/dashboard/branches/actions.ts` |
| T-102 | R2 (AC7) | deleteBranch action com triple revalidatePath | DONE | (pending) | `apps/web/src/app/dashboard/branches/actions.ts` (revalidatePath /dashboard/stock + /dashboard/tools layout) |
| T-103 | R3 | Branches list page | DONE | (pending) | `apps/web/src/app/dashboard/branches/page.tsx`, `_components/branches-table.tsx`, `_components/delete-branch-dialog.tsx` (stub para T-106 enhance) |
| T-104 | R4 | Create branch page + shared form | DONE | (pending) | `apps/web/src/app/dashboard/branches/new/page.tsx`, `_components/branch-form.tsx` |
| T-105 | R5 | Edit branch page reusing form | PENDING | — | — |
| T-106 | R6 | Delete confirmation dialog | PENDING | — | — |
| T-107 | R7 | Remove disabled flag from "Filiais" sidebar item | PENDING | — | — |
| T-108 | R8 | pt-BR audit | PENDING | — | — |
| T-109 | R9 | Validation gate | PENDING | — | — |
