---
created: "2026-04-14"
last_edited: "2026-04-14"
---

# Implementation Tracking: Design Foundation

Build site: context/plans/build-site.md

| Task  | Status | Notes |
|-------|--------|-------|
| T-001 | DONE   | `:root` light block removed; only `.dark` tokens remain |
| T-002 | DONE   | OKLCH palette derived from DESIGN.md §2 hex values (Parchment/Terracotta/Olive/Stone/Warm Sand/Dark Surface/Near Black/Ivory/Warm Silver/Border Cream) |
| T-003 | DONE   | `--ring: oklch(0 0 0 / 0)`, `--sidebar-ring: oklch(0 0 0 / 0)`; `outline-ring/50` removed from `@layer base *` |
| T-004 | DONE   | `--chart-1..5` rewritten to warm palette (terracotta, stone gray, olive gray, warm sand, dark surface) — no cool blues |
| T-005 | DONE   | `@layer base { :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px } }` |
| T-006 | DONE   | `--font-sans: "Inter Variable", sans-serif` preserved; `--font-serif: "Georgia", serif` added |
| T-007 | DONE   | `--radius: 0.5rem`; `--radius-sm/md/lg/xl/2xl/3xl/4xl` calc tokens preserved |
| T-008 | DONE   | `--sidebar-*` tokens written to warm dark palette, `--sidebar-ring` transparent |
| T-009 | DONE   | `ThemeProvider`: `defaultTheme="dark"`, `forcedTheme="dark"`, `enableSystem={false}` |
| T-010 | DONE   | `<html className="dark">` in `apps/web/src/app/layout.tsx` |
| T-011 | DONE   | `bun x ultracite check` clean; `bun --filter=web run build` exited 0 |

## Files

- `packages/ui/src/styles/globals.css` (full rewrite)
- `apps/web/src/components/providers.tsx` (ThemeProvider forced dark)
- `apps/web/src/app/layout.tsx` (html className="dark")

## Notes

- Preserved `@import "shadcn/tailwind.css"` and `@source` directives (Tailwind v4 content scanning)
- Preserved `disableTransitionOnChange` in ThemeProvider (better-t-stack default)
- `@layer base html` rule kept with `@apply font-sans` — since `.dark` class is forced on `<html>` via layout.tsx, CSS variable inheritance from `.dark {}` propagates to all descendants
- OKLCH hex conversions are approximate; Tier 4 T-056/T-057/T-058 [manual-check] tasks verify visual correctness in browser
