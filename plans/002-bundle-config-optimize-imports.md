# Plan 002: Configurar `optimizePackageImports` + bundle-analyzer no Next

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report — do not improvise. When done,
> update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- apps/web/next.config.ts apps/web/package.json`
> If either file changed since this plan was written, compare against the
> "Current state" excerpts before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (`optimizePackageImports` is additive/safe; analyzer is gated behind an env var)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

The app ships heavyweight client libraries (recharts, motion, lucide-react,
@dnd-kit) but `next.config.ts` does not declare `optimizePackageImports`, so
Next cannot prune their barrel exports at the module-graph level — dead exports
leak into route bundles. Separately, there is **no bundle-analysis tooling**, so
the team has zero visibility into first-load JS size and no signal when a future
change regresses it. This plan adds both: a safe tree-shaking hint that shrinks
bundles immediately, and an opt-in analyzer (`ANALYZE=true bun --cwd apps/web run
build`) that makes the gains in plans 003/009/010 measurable.

## Current state

- `apps/web/next.config.ts` (full file today):

```ts
import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
	? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
	: null;

const nextConfig: NextConfig = {
	typedRoutes: false,
	reactCompiler: true,
	experimental: {
		serverActions: {
			bodySizeLimit: "8mb",
		},
	},
	images: supabaseHostname
		? {
				remotePatterns: [
					{
						protocol: "https",
						hostname: supabaseHostname,
						pathname: "/storage/v1/object/public/**",
					},
				],
			}
		: undefined,
};

export default nextConfig;
```

- `apps/web/package.json` `devDependencies` has no `@next/bundle-analyzer`.
- Package manager is **bun** (`"packageManager": "bun@1.3.11"` in root
  `package.json`). Build script: `apps/web/package.json` → `"build": "next build"`.
- Heavy client deps confirmed in `apps/web/package.json` dependencies:
  `recharts`, `motion`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`,
  `lucide-react`, `react-markdown`, `recharts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Add dev dep | `bun add -D -F web @next/bundle-analyzer` (from repo root) | dep added to `apps/web/package.json` |
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Build (plain) | `bun --cwd apps/web run build` | build succeeds |
| Build + analyze | `ANALYZE=true bun --cwd apps/web run build` | opens/writes analyzer report under `.next/analyze` |

## Scope

**In scope**:
- `apps/web/next.config.ts`
- `apps/web/package.json` (only the `@next/bundle-analyzer` devDependency added by the install command)
- `bun.lock` (updated automatically by `bun add`)

**Out of scope**:
- Do NOT change `typedRoutes`, `reactCompiler`, `serverActions.bodySizeLimit`,
  or `images` — they are deliberate (see comments in the file and root
  `CLAUDE.md`).
- Do NOT add packages to `optimizePackageImports` that aren't actually
  barrel-exported heavy deps — over-listing adds build cost. Stick to the list
  in Step 1.

## Git workflow

- Branch: `advisor/002-bundle-config`
- Commit (conventional commits, PT): `perf: optimizePackageImports + bundle-analyzer`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add `optimizePackageImports`

In `apps/web/next.config.ts`, add `optimizePackageImports` inside the existing
`experimental` object (keep `serverActions` as-is):

```ts
	experimental: {
		serverActions: {
			bodySizeLimit: "8mb",
		},
		optimizePackageImports: [
			"recharts",
			"motion",
			"lucide-react",
			"@dnd-kit/core",
			"@dnd-kit/sortable",
			"@dnd-kit/utilities",
		],
	},
```

**Verify**: `bun check-types` → exit 0. `bun --cwd apps/web run build` → build
succeeds with no new errors.

### Step 2: Install `@next/bundle-analyzer`

From the repo root:

```bash
bun add -D -F web @next/bundle-analyzer
```

**Verify**: `apps/web/package.json` now lists `@next/bundle-analyzer` under
`devDependencies`; `bun.lock` updated.

### Step 3: Wrap the config with the analyzer (env-gated)

In `apps/web/next.config.ts`, wrap the exported config:

```ts
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

// ...nextConfig unchanged...

export default withBundleAnalyzer(nextConfig);
```

The analyzer is a no-op unless `ANALYZE=true` — normal builds are unaffected.

**Verify**:
- `bun check-types` → exit 0
- `bun --cwd apps/web run build` (without `ANALYZE`) → builds normally, no
  analyzer output
- `ANALYZE=true bun --cwd apps/web run build` → writes report files under
  `apps/web/.next/analyze/` (or opens browser tabs). Record the **First Load JS**
  size for the `/dashboard` route from the build output table — this is the
  baseline that plans 003/009/010 will reduce.

### Step 4: Capture the baseline

Copy the route-size table from the `bun --cwd apps/web run build` output (the
"Route (app)" / "First Load JS" table Next prints) into the PR description or a
comment, so plans 003/009/010 can show before/after. Do not commit build
artifacts (`.next/` is gitignored — confirm with `git status`).

**Verify**: `git status` shows only `next.config.ts`, `package.json`, `bun.lock`
modified — no `.next/` files staged.

## Test plan

- No unit tests; this is build configuration. The gate is a successful
  `bun --cwd apps/web run build` and unchanged `bun --cwd apps/web test`.

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web run build` succeeds
- [ ] `ANALYZE=true bun --cwd apps/web run build` produces an analyzer report
- [ ] `apps/web/next.config.ts` has `optimizePackageImports` with the 6 packages
      and is wrapped in `withBundleAnalyzer`
- [ ] `git status` shows no `.next/` artifacts staged
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The build fails after adding `optimizePackageImports` and the error names one
  of the listed packages (that package may not support modular imports — remove
  just that entry and report).
- `next.config.ts` does not match the "Current state" excerpt (drift).
- `@next/bundle-analyzer`'s peer-dependency demands a Next version different from
  the installed `next ^16.2.0` — report the version conflict instead of forcing.

## Maintenance notes

- When adding a new heavy barrel-exported dependency, add it to
  `optimizePackageImports`.
- A reviewer should confirm the baseline First Load JS number is recorded so
  plans 003/009/010 are measurable.
- Consider wiring `ANALYZE=true` into a CI job later to catch bundle regressions
  automatically (deferred — not in this plan).
