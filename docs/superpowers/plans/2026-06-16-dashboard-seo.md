# Dashboard SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete Next.js metadata for the Emach dashboard, including the browser tab icon, canonical URL, Open Graph/Twitter metadata, route titles, and safe robots directives.

**Architecture:** Use Next.js App Router metadata exports in existing layouts and pages. Keep global brand metadata in `apps/web/src/app/layout.tsx`, private robots in authenticated/technical route boundaries, and page-level titles in the existing route files.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `Metadata` from `next`.

---

### Task 1: Global brand metadata and favicon

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Replace the current metadata object**

Use `logo.jpg` from `apps/web/public` via `/logo.jpg`, set canonical URL to `https://dashboard.emachferramentas.com.br`, and define title templates, Open Graph, and Twitter metadata.

- [ ] **Step 2: Keep layout rendering unchanged**

Do not alter providers, fonts, `AppHeader`, or the children tree.

### Task 2: Route-specific titles and robots

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/convite/page.tsx`
- Modify: `apps/web/src/app/esqueci-senha/page.tsx`
- Modify: `apps/web/src/app/redefinir-senha/page.tsx`
- Modify: `apps/web/src/app/pending/page.tsx`
- Modify: `apps/web/src/app/suspended/page.tsx`
- Modify: `apps/web/src/app/design/page.tsx`
- Modify: `apps/web/src/app/design/preview/page.tsx`
- Modify: `apps/web/src/app/dashboard/layout.tsx`
- Modify dashboard `page.tsx` files under `apps/web/src/app/dashboard/**`

- [ ] **Step 1: Add page titles to public account flows**

Add `import type { Metadata } from "next";` only where the file does not already import it, then export metadata with concise `title` and `description`. Add `robots: { index: false, follow: false }` to token/account-state pages.

- [ ] **Step 2: Add private robots to dashboard layout**

In `apps/web/src/app/dashboard/layout.tsx`, export metadata with title template and `noindex/nofollow` for all authenticated routes.

- [ ] **Step 3: Add concise titles to dashboard pages**

Add `export const metadata: Metadata = { title: "..." }` to high-traffic dashboard route pages. For dynamic detail pages, use generic entity titles instead of adding queries.

- [ ] **Step 4: Mark technical design routes private**

Add metadata with `noindex/nofollow` to design and preview pages.

### Task 3: Verification

**Files:**
- Inspect changed files only.

- [ ] **Step 1: Run type/lint verification**

Run: `bun check-types`
Expected: exits 0.

Run: `bun check`
Expected: exits 0, or report existing unrelated failures if any.

- [ ] **Step 2: Inspect diff for scope**

Run: `git diff -- apps/web/src/app docs/superpowers/plans/2026-06-16-dashboard-seo.md`
Expected: metadata-only app changes plus this plan.
