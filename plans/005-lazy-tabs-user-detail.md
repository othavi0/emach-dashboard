# Plan 005: Carregar tabs Atividade/Sessões de `users/[id]` lazy

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result before moving on. On any "STOP conditions" item,
> stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- "apps/web/src/app/dashboard/users/[id]/page.tsx"`
> If it changed, compare against "Current state" before proceeding; on a
> mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (matches the lazy-tab pattern already used elsewhere)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

The user detail page (`/dashboard/users/[id]`) renders the **Atividade** and
**Sessões** tabs' content unconditionally on every load — including the default
"Perfil" tab, which is by far the most common view. Each of those tabs is an
async Server Component that fires DB queries: `ActivityTab` runs two activity-log
fetches, `SessionsTab` runs a session-table scan — **3 extra queries on every
profile view** that the user usually never sees. The rest of the codebase loads
inner entity tabs lazily (only when `sp.tab` matches — see `branches/[id]/page.tsx`),
and this page already does it for its `Filiais` and `Permissões` tabs. This plan
makes Atividade/Sessões consistent, removing the wasted queries.

## Current state

`apps/web/src/app/dashboard/users/[id]/page.tsx`:

- The page already guards the **Filiais** tab data (line ~64) and the
  **Permissões** tab content (line ~85-99) on `sp.tab`:

```tsx
const onBranchesTab = sp.tab === "branches";
const [user, kpis, linkedBranches, availableBranches, recentActivity] =
	await Promise.all([
		getUserDetail(id),
		getUserDetailKpis(id),
		getUserLinkedBranchesWithStats(id),
		onBranchesTab ? db.select(...).from(branch)... : Promise.resolve([]),
		getUserAffectedActivity(id, null, 5),
	]);
```

- But the **Atividade** and **Sessões** tabs render their async components with
  no guard (lines ~144-155):

```tsx
{
	value: "activity",
	label: "Atividade",
	icon: <Activity aria-hidden className="size-3.5" />,
	content: <ActivityTab userId={user.id} />,
},
{
	value: "sessions",
	label: "Sessões",
	icon: <Monitor aria-hidden className="size-3.5" />,
	content: <SessionsTab userId={user.id} />,
},
```

- `ActivityTab` (`apps/web/src/app/dashboard/users/[id]/_components/activity-tab.tsx`)
  is an async RSC that runs `Promise.all([getUserActivity(...), getUserAffectedActivity(...)])`
  — 2 queries. `SessionsTab` (`.../sessions-tab.tsx`) runs `getUserSessions(userId)`
  — 1 query. Because `content: <ActivityTab .../>` creates the element in the
  tree, the async component is resolved server-side regardless of the active tab.
- **Canonical pattern to match** — `apps/web/src/app/dashboard/branches/[id]/page.tsx:85`
  guards tab content as `sp.tab === "team" ? <TeamTab .../> : null`. `EntityTab.content`
  accepts `null` (the Permissões tab in this same file already passes `null`).
- The `sp` searchParams object is already in scope where the tabs array is built
  (it is used at the `onBranchesTab` line above). Confirm the variable name is
  `sp` when you open the file; if it differs, use whatever the file uses.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Dev smoke | `bun dev:web` → user detail, switch tabs | Atividade/Sessões load only when opened |

## Scope

**In scope**:
- `apps/web/src/app/dashboard/users/[id]/page.tsx` — only the `content` values of
  the `activity` and `sessions` tab entries.

**Out of scope**:
- `activity-tab.tsx` / `sessions-tab.tsx` — do not modify; they are correct, they
  just shouldn't be invoked eagerly.
- The Perfil, Filiais, Permissões, Segurança tabs — already correct.
- Do NOT change which tab is the default (Perfil stays default).

## Git workflow

- Branch: `advisor/005-lazy-user-tabs`
- Commit (conventional commits, PT): `perf: carrega tabs atividade/sessoes lazy`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Guard the Atividade tab content

Change the `activity` tab entry's `content` to render only when its tab is
active:

```tsx
{
	value: "activity",
	label: "Atividade",
	icon: <Activity aria-hidden className="size-3.5" />,
	content: sp.tab === "activity" ? <ActivityTab userId={user.id} /> : null,
},
```

### Step 2: Guard the Sessões tab content

```tsx
{
	value: "sessions",
	label: "Sessões",
	icon: <Monitor aria-hidden className="size-3.5" />,
	content: sp.tab === "sessions" ? <SessionsTab userId={user.id} /> : null,
},
```

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0.

### Step 3: Smoke — confirm lazy load

`bun dev:web` → open a user detail page on the default Perfil tab. Then click the
**Atividade** tab and the **Sessões** tab. Confirm:
- The Perfil tab loads without firing activity/session queries (the content for
  those tabs is `null` until selected).
- Clicking Atividade/Sessões loads their content correctly (the activity feed and
  session list appear).

Tip: watch the server logs / `nextjs_call <port> get_errors` while switching — no
errors, and the activity/session queries only appear when their tab is opened.

**Verify**: both tabs render their data when opened; Perfil view does not trigger
their queries.

## Test plan

- No new unit test (the change is a render guard mirroring an established
  pattern). Run `bun --cwd apps/web test` to confirm the suite stays green; note
  `apps/web/src/app/dashboard/users/__tests__` exists — if a test asserts the
  tabs array shape, update it to expect `null` content for inactive tabs (only if
  such a test exists and fails).

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` passes
- [ ] Atividade and Sessões render only when their tab is active (smoke)
- [ ] Only `users/[id]/page.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The searchParams variable is not named `sp` or the tab `value`s are not
  `"activity"`/`"sessions"` (drift — use the file's actual names, but if the tab
  values differ, report before guessing).
- `EntityTab.content` does not accept `null` (it should — the Permissões tab
  already passes `null` in this file); if TypeScript rejects `null`, report.
- A `users/__tests__` test fails in a way that suggests the tabs must render
  eagerly for some reason — report instead of forcing.

## Maintenance notes

- This is the same lazy-tab discipline documented in `apps/web/CLAUDE.md`
  (entity/CRUD pattern, "Tabs internas … carregam lazy"). Any new tab whose
  content fetches data should follow the `sp.tab === "x" ? <Tab/> : null` guard.
- A reviewer should confirm no tab badge/count depends on the now-lazy content
  having rendered (badges here come from already-fetched `linkedBranches`/`kpis`,
  not from ActivityTab/SessionsTab — so this is safe).
- Once plan 001 lands, this page also gets a `loading.tsx`; the two compose
  (instant skeleton + fewer queries = snappier profile open).
