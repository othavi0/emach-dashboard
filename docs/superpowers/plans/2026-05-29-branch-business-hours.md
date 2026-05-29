# Branch Business Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and edit structured business hours for dashboard branches.

**Architecture:** Store hours in `branch.business_hours` JSONB with three categories: weekdays, saturday, holidays. Reuse the existing branch create/edit form pipeline: Zod schema → `normalizePayload` → Drizzle insert/update → detail edit sheet hydration.

**Tech Stack:** Drizzle 0.45, Supabase Postgres JSONB, Next.js 16 App Router, React 19, Zod.

---

### Task 1: Add branch business hours type and column

**Files:**
- Modify: `packages/db/src/schema/inventory.ts`

- [x] Add exported `BranchBusinessHours` / `BranchBusinessHoursPeriod` types.
- [x] Add nullable `businessHours: jsonb("business_hours").$type<BranchBusinessHours>()` to `branch`.

### Task 2: Validate and normalize business hours in branch form schema

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-schema.ts`

- [x] Add `businessHoursSchema` with `weekdays`, `saturday`, `holidays`.
- [x] Validate `HH:mm`; require times only when open; require close after open.
- [x] Export `defaultBusinessHours` for create/edit initial state.

### Task 3: Wire create/update and edit hydration

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts`
- Modify: `apps/web/src/app/dashboard/branches/data.ts`
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form.tsx`
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/branch-edit-sheet.tsx`

- [x] Include `businessHours` in `normalizePayload`.
- [x] Select `branch.businessHours` in branch detail.
- [x] Use `defaultBusinessHours` for new branch forms and fallback on edit.

### Task 4: Add business hours fields to UI

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx`

- [x] Add a "Horário de funcionamento" section.
- [x] Render rows for weekdays, saturday, holidays with open/closed select and time inputs.
- [x] Clear times when a row is marked closed.

### Task 5: Verify

**Commands:**
- [ ] `bun check-types`
- [x] If schema push is allowed in the current environment: `bun db:sync`
