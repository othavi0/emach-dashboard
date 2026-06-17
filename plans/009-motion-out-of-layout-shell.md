# Plan 009: Remover `motion` do shell do layout (CSS + rAF)

> **Executor instructions**: Follow step by step; run every verification before
> moving on. On any "STOP conditions" item, stop and report. This plan trades a
> JS animation library for CSS/rAF — confirm the visual result looks right before
> claiming done. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- apps/web/src/app/dashboard/_components/nav-group.tsx apps/web/src/app/dashboard/_components/number-ticker.tsx apps/web/src/app/dashboard/_components/app-sidebar.tsx apps/web/src/app/dashboard/_components/motion-provider.tsx`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (visual regression on sidebar entrance + KPI count animations)
- **Depends on**: none (but do 002 first to measure the bundle drop)
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

`motion` (Framer Motion, ~45–60 kB gzipped) is pulled into the **dashboard layout
shell** via the sidebar, so it lands in the client bundle of **every** `/dashboard/*`
route — including lightweight CRUD pages with no animation other than the
sidebar's nav-item slide-in. The only two animations are a staggered fade-in of
nav items and a count-up on KPI numbers; both are achievable with CSS / a tiny
`requestAnimationFrame` tween at zero dependency cost. Removing motion from the
shell shrinks the JS on every dashboard navigation.

## Current state

- `apps/web/src/app/dashboard/_components/app-sidebar.tsx` is `"use client"` and
  imports `MotionProvider` (line ~15), which wraps the sidebar.
- `motion-provider.tsx` (full file):

```tsx
"use client";
import { domAnimation, LazyMotion } from "motion/react";
import type { ReactNode } from "react";
export function MotionProvider({ children }: { children: ReactNode }) {
	return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
```

- `nav-group.tsx` (uses `m.div` for a staggered fade-in-from-left):

```tsx
import { m, useReducedMotion } from "motion/react";
// ...
{group.items.map((item, index) => (
	<m.div
		animate={{ opacity: 1, x: 0 }}
		initial={reduce ? false : { opacity: 0, x: -6 }}
		key={item.href}
		transition={{ duration: 0.18, ease: "easeOut", delay: reduce ? 0 : index * 0.025 }}
	>
		<NavItem badgeCount={...} item={item} />
	</m.div>
))}
```

- `number-ticker.tsx` (count-up via motion value):

```tsx
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
// ...
const mv = useMotionValue(0);
const display = useTransform(mv, (n) => FORMATTERS[format](n));
useEffect(() => {
	if (reduce) { mv.set(value); return; }
	const controls = animate(mv, value, { duration: 0.6, ease: "easeOut" });
	return () => controls.stop();
}, [value, reduce, mv]);
return <motion.span>{display}</motion.span>;
```

- `FORMATTERS` in `number-ticker.tsx` already formats numbers/currency in pt-BR —
  reuse it as-is.
- These three files are the **only** `motion` consumers (verify with
  `grep -rl "motion/react" apps/web/src` before removing the dependency).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Find motion users | `grep -rl "motion/react\|from \"motion\"" apps/web/src` | only the 3 files (before changes) |
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Build/analyze | `ANALYZE=true bun --cwd apps/web run build` | motion gone from layout bundle |
| Dev smoke | `bun dev:web` → any dashboard page | sidebar items fade in; KPIs count up |

## Scope

**In scope**:
- `apps/web/src/app/dashboard/_components/nav-group.tsx` (CSS animation)
- `apps/web/src/app/dashboard/_components/number-ticker.tsx` (rAF tween)
- `apps/web/src/app/dashboard/_components/app-sidebar.tsx` (drop `MotionProvider` wrap)
- `apps/web/src/app/dashboard/_components/motion-provider.tsx` (delete if unused after)
- The global stylesheet for one keyframe — confirm the path during Step 1
  (likely `apps/web/src/app/globals.css` or `packages/ui` global CSS; do NOT
  guess — find where `@theme`/Tailwind base lives).
- `apps/web/package.json` — remove `motion` from dependencies **only after**
  confirming zero remaining importers.

**Out of scope**:
- Any other animation in the app. Do not hunt for motion elsewhere beyond
  confirming the 3 importers.
- The sidebar's own open/close transition (that's `@emach/ui` sidebar CSS, not motion).

## Git workflow

- Branch: `advisor/009-motion-out-of-shell`
- Commit (conventional commits, PT): `perf: troca motion por CSS/rAF no shell`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Locate the global stylesheet and add a keyframe

Find the file where Tailwind v4 base / `@theme` is declared (search for
`@import "tailwindcss"` or `@theme` under `apps/web` and `packages/ui`). Add a
keyframe + utility that mirrors the nav-item entrance (fade + slide 6px from
left), gated by reduced-motion:

```css
@keyframes nav-item-in {
	from { opacity: 0; transform: translateX(-6px); }
	to   { opacity: 1; transform: translateX(0); }
}
.nav-item-animate {
	animation: nav-item-in 0.18s ease-out both;
}
@media (prefers-reduced-motion: reduce) {
	.nav-item-animate { animation: none; }
}
```

**Verify**: the stylesheet compiles (`bun --cwd apps/web run build` reaches CSS
step without error).

### Step 2: Convert `nav-group.tsx` to a plain `<div>` + CSS

Replace `<m.div ...>` with a `<div>` using the class, and pass the stagger delay
as an inline style. Remove the `motion/react` import and `useReducedMotion`
(the CSS media query handles reduced motion):

```tsx
{group.items.map((item, index) => (
	<div
		className="nav-item-animate"
		key={item.href}
		style={{ animationDelay: `${index * 25}ms` }}
	>
		<NavItem badgeCount={item.badgeKey ? badges[item.badgeKey] : undefined} item={item} />
	</div>
))}
```

The component may no longer need `"use client"` if nothing else in it is
client-only — but `NavItem` / sidebar context likely still require it; leave
`"use client"` unless `bun check-types` proves it's removable. Do not over-optimize.

**Verify**: `bun check-types` → exit 0; nav items still render.

### Step 3: Rewrite `number-ticker.tsx` with `requestAnimationFrame`

Replace the motion-based ticker with a dependency-free rAF tween that respects
`prefers-reduced-motion`, reusing `FORMATTERS`:

```tsx
"use client";
import { useEffect, useState } from "react";

export type NumberFormat = "currency" | "number";
const FORMATTERS: Record<NumberFormat, (n: number) => string> = {
	currency: (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
	number: (n) => Math.round(n).toLocaleString("pt-BR"),
};

export function NumberTicker({ value, format = "number" }: { value: number; format?: NumberFormat }) {
	const [display, setDisplay] = useState(0);
	useEffect(() => {
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduce) { setDisplay(value); return; }
		const start = performance.now();
		const duration = 600;
		let raf = 0;
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			const eased = 1 - (1 - t) ** 3; // easeOutCubic
			setDisplay(value * eased);
			if (t < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [value]);
	return <span>{FORMATTERS[format](display)}</span>;
}
```

Note: `performance.now()` is allowed in browser client code. Keep the exported
type `NumberFormat` and the component signature identical so callers
(`kpi-card.tsx`) don't change.

**Verify**: `bun check-types` → exit 0; KPI numbers count up smoothly.

### Step 4: Drop `MotionProvider`

In `app-sidebar.tsx`, remove the `MotionProvider` import and unwrap its children
(render them directly). Then delete `motion-provider.tsx` if nothing else imports
it (`grep -rl motion-provider apps/web/src` → empty).

**Verify**: `bun check-types` → exit 0; sidebar renders.

### Step 5: Remove the `motion` dependency (only if zero importers remain)

Run `grep -rl "motion/react\|from \"motion\"" apps/web/src`. If it returns
nothing, remove `motion` from `apps/web/package.json` dependencies and
`bun install`. If anything still imports motion, STOP and report (do not remove
the dep while it's in use).

**Verify**: `bun --cwd apps/web run build` succeeds; `ANALYZE=true` build shows
motion absent from the dashboard layout chunk.

### Step 6: Visual smoke

`bun dev:web`. Confirm: (a) sidebar nav items fade/slide in on first load,
(b) KPI numbers on `/dashboard` count up then settle on the correct formatted
value (currency/number), (c) with OS "reduce motion" on, both render instantly
without animation.

**Verify**: animations look equivalent to before; reduced-motion shows static.

## Test plan

- No unit tests (presentational/animation). `bun --cwd apps/web test` must stay
  green. Verification is the visual smoke (Step 6) across normal + reduced-motion.

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web run build` succeeds
- [ ] `grep -rl "motion/react" apps/web/src` returns nothing
- [ ] `motion` removed from `apps/web/package.json` (or STOP-reported if still used)
- [ ] Analyzer shows motion out of the dashboard layout bundle
- [ ] Sidebar fade-in + KPI count-up still work; reduced-motion respected (smoke)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Any "Current state" excerpt doesn't match the live code (drift).
- You cannot locate the global stylesheet for the keyframe — report rather than
  scattering inline `<style>`.
- A motion importer remains after Steps 2-4 that this plan didn't anticipate —
  report it; do not remove the dependency.
- The CSS/rAF animations look materially worse than the motion versions (janky,
  wrong easing) after a reasonable attempt — report; a degraded animation may not
  be worth the bundle saving and the maintainer should weigh in.

## Maintenance notes

- This removes the app's only `motion` usage. If a future feature needs rich
  animation, prefer CSS/View Transitions first (see `vercel-react-view-transitions`
  skill) before re-adding a JS animation library to a shared shell.
- A reviewer should A/B the sidebar entrance and KPI count-up against `main` to
  confirm parity, and test with `prefers-reduced-motion`.
