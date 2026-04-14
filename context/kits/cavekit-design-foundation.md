---
created: "2026-04-14"
last_edited: "2026-04-14"
---

# Cavekit: Design Foundation

## Scope

Rewrite `packages/ui/src/styles/globals.css` to encode the DESIGN.md Anthropic parchment/terracotta palette as OKLCH design tokens. Enforce dark-mode-only rendering. Disable all ring-based shadows on focus and replace with a branded `:focus-visible` CSS outline. Configure `apps/web/src/components/providers.tsx` and `apps/web/src/app/layout.tsx` for forced dark mode. No component files in `packages/ui/src/components/*` are touched.

**User rule:** NEVER edit `packages/ui/src/components/*`. All customization lives in `globals.css` tokens and app-level config files only.

## Requirements

### R1: Single Dark Token Block — No Light `:root` Block
**Description:** The CSS file must define tokens only in the dark context. The original `:root` light-theme block must not exist.
**Acceptance Criteria:**
- [ ] `packages/ui/src/styles/globals.css` contains no `:root` block that sets `--background`, `--foreground`, or any shadcn design token to a light-theme value
- [ ] All shadcn design tokens (`--background`, `--foreground`, `--primary`, `--card`, `--popover`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--sidebar-*`, `--chart-*`) are defined inside a `.dark` selector block (or `:root.dark` equivalent)
- [ ] [manual-check] Loading `/login` in a browser with DevTools open shows the `.dark` class active on `<html>` on first render

### R2: DESIGN.md Palette Encoded as OKLCH Tokens
**Description:** Each token must map to the corresponding DESIGN.md color role (Section 2: Color Palette & Roles). All values use the `oklch()` color function.
**Acceptance Criteria:**
- [ ] `--background` encodes Deep Dark (`#141413`) — approximately `oklch(0.14 0.008 75)` or within ±0.02 L of the reference hex converted to OKLCH
- [ ] `--foreground` encodes Warm Silver (`#b0aea5`) — a warm light gray suitable for primary text on dark surfaces
- [ ] `--primary` encodes Terracotta Brand (`#c96442`) — warm burnt orange-brown
- [ ] `--primary-foreground` encodes Ivory (`#faf9f5`) — near-white warm cream
- [ ] `--secondary` encodes Dark Surface (`#30302e`) — warm charcoal
- [ ] `--secondary-foreground` encodes Ivory (`#faf9f5`)
- [ ] `--muted` encodes Dark Surface (`#30302e`)
- [ ] `--muted-foreground` encodes Stone Gray (`#87867f`) — tertiary warm gray
- [ ] `--accent` encodes Dark Warm (`#3d3d3a`) — elevated interactive surface
- [ ] `--accent-foreground` encodes Ivory (`#faf9f5`)
- [ ] `--card` encodes Dark Surface (`#30302e`)
- [ ] `--card-foreground` encodes Ivory (`#faf9f5`)
- [ ] `--popover` encodes Dark Surface (`#30302e`)
- [ ] `--popover-foreground` encodes Ivory (`#faf9f5`)
- [ ] `--border` encodes Border Dark (`#30302e`) with appropriate OKLCH alpha or solid value
- [ ] `--input` encodes a warm dark input background slightly above `--card`
- [ ] `--destructive` encodes Error Crimson (`#b53333`) — deep warm red
- [ ] All token values use `oklch(L C H)` or `oklch(L C H / A)` syntax — no hex, hsl, or rgb values

### R3: Rings Disabled
**Description:** The ring shadow system must be neutralized globally so that no Tailwind ring utility or CSS custom property produces a visible ring shadow anywhere in the UI (per user rule: NO rings anywhere).
**Acceptance Criteria:**
- [ ] `--ring` is set to `oklch(0 0 0 / 0)` (fully transparent) inside the `.dark` block
- [ ] `--sidebar-ring` is set to `oklch(0 0 0 / 0)` inside the `.dark` block
- [ ] The `@layer base` rule `* { @apply border-border outline-ring/50; }` is either removed or the `outline-ring/50` portion is removed, leaving at most `* { @apply border-border; }`
- [ ] [manual-check] Tab-focusing a `<Button>` component renders no box-shadow ring glow; only the CSS outline defined in R5 is visible

### R4: Chart Tokens Rewritten to Warm Palette
**Description:** The five chart tokens must use warm-toned OKLCH values drawn from the DESIGN.md palette (Section 2). No cool blues (hue 200–280 range) are permitted.
**Acceptance Criteria:**
- [ ] `--chart-1` through `--chart-5` are all redefined within the `.dark` block
- [ ] Each chart token uses OKLCH hue values outside the 200–280 range (i.e., not cool blue)
- [ ] The five chart colors are visually distinct from each other (chroma > 0 for at least three of them, or lightness varies by at least 0.15 between adjacent values)

### R5: Branded `:focus-visible` Outline — Not a Ring
**Description:** Keyboard focus must be visually indicated by a CSS `outline` using `var(--primary)` (Terracotta), not by a Tailwind ring box-shadow. This must be declared in `@layer base`.
**Acceptance Criteria:**
- [ ] `packages/ui/src/styles/globals.css` contains a rule inside `@layer base` that targets `:focus-visible` and sets `outline: 2px solid var(--primary)` and `outline-offset: 2px`
- [ ] The rule does NOT use `box-shadow` or `ring` utilities for the focus indicator
- [ ] [manual-check] Tab-navigating to a Button, Input, or Link renders a 2px solid terracotta-colored outline around the element with a 2px offset gap, visible against the dark background

### R6: Typography Tokens Preserved and Extended
**Description:** Font family tokens must be maintained for Inter Variable (sans) and optionally extended with a serif entry for future editorial headlines per DESIGN.md Section 3.
**Acceptance Criteria:**
- [ ] `@theme inline` block retains `--font-sans: "Inter Variable", sans-serif` (or equivalent Inter fallback)
- [ ] `@theme inline` block contains `--font-serif` pointing to a serif stack (e.g., `Georgia, serif`) as a forward-looking token
- [ ] No font loading infrastructure (e.g., `next/font`, `@font-face`) is added — the token declaration alone satisfies this requirement

### R7: Border Radius Base Set to 8px
**Description:** The base `--radius` token must be set to `0.5rem` (8px) matching DESIGN.md Section 5 "comfortably rounded" baseline.
**Acceptance Criteria:**
- [ ] `--radius` is set to `0.5rem` inside the `.dark` block (or in a separate `:root` block covering radius only, since radius is not theme-dependent)
- [ ] Computed radius-scale tokens in `@theme inline` (`--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`) remain derived from `var(--radius)` via `calc()`

### R8: Sidebar Design Tokens Mapped to Warm Dark Palette
**Description:** Sidebar-specific tokens must align with the dark warm palette so that the navigation shell (cavekit-navigation-shell.md) renders correctly.
**Acceptance Criteria:**
- [ ] `--sidebar` encodes a surface slightly above `--background` — approximately Dark Surface (`#30302e`) or the near-black base
- [ ] `--sidebar-foreground` encodes Ivory or Warm Silver for readable text
- [ ] `--sidebar-primary` encodes Terracotta Brand (`#c96442`)
- [ ] `--sidebar-primary-foreground` encodes Ivory
- [ ] `--sidebar-accent` encodes a slightly lighter dark surface for hover states
- [ ] `--sidebar-accent-foreground` encodes Ivory or near-white warm text
- [ ] `--sidebar-border` encodes Border Dark (`#30302e`) or a subtle warm border value
- [ ] `--sidebar-ring` is `oklch(0 0 0 / 0)` (transparent, per R3)

### R9: Providers Configured for Forced Dark Mode
**Description:** The ThemeProvider in `apps/web/src/components/providers.tsx` must prevent any light-mode rendering by forcing and defaulting to dark.
**Acceptance Criteria:**
- [ ] `ThemeProvider` in `providers.tsx` has prop `defaultTheme="dark"`
- [ ] `ThemeProvider` has prop `forcedTheme="dark"`
- [ ] `ThemeProvider` has prop `enableSystem={false}` (or `enableSystem` prop is absent, defaulting to false)
- [ ] The `enableSystem` prop is not set to `true`

### R10: HTML Element Has Dark Class on Initial Render
**Description:** The `<html>` element in `apps/web/src/app/layout.tsx` must carry `className="dark"` so the dark token block applies before client-side hydration.
**Acceptance Criteria:**
- [ ] `apps/web/src/app/layout.tsx` sets `className="dark"` (or includes "dark" in a multi-class string) on the `<html>` element
- [ ] The existing `suppressHydrationWarning` attribute is retained on `<html>`

### R11: Lint and Build Pass
**Description:** The changed files must not introduce any lint or TypeScript errors.
**Acceptance Criteria:**
- [ ] Running `bun x ultracite check` from the repo root exits with code 0 after the changes
- [ ] Running `bun --filter web run build` exits with code 0 after the changes

### R12: Visual Correctness on Key Routes [manual-check]
**Description:** The two primary routes must visually render on the warm dark surface.
**Acceptance Criteria:**
- [ ] [manual-check] `/login` page renders with background matching Deep Dark (`#141413`) — warm near-black, not cool dark or pure black
- [ ] [manual-check] `/dashboard` page renders with same warm dark background
- [ ] [manual-check] No visible cool-gray tones or blue-gray surfaces appear on either route
- [ ] [manual-check] Interactive elements (buttons, inputs) show the terracotta outline on keyboard focus, not a glow ring

## Out of Scope

- Any edits to `packages/ui/src/components/*` — shadcn convention; NEVER modify these files
- Adding new shadcn components to the UI package
- Font loading infrastructure (`next/font`, CDN imports, `@font-face`) — only token declarations
- Light-mode theme support of any kind
- Animations or transition tokens beyond what is already present (`tw-animate-css`)

## Cross-References

- See also: `cavekit-navigation-shell.md` — sidebar token values defined here are consumed by the shell layout
- See also: `cavekit-inventory-tools.md` — tool list page inherits background and card tokens

## Changelog

| Date | Change |
|------|--------|
| 2026-04-14 | Initial draft |
