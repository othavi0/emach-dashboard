# Plan 040: RESET-PLAN.md não contém PII nem status enganoso

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 03984800..HEAD -- RESET-PLAN.md`
> If RESET-PLAN.md changed since this plan was written, compare the
> "Current state" excerpts against the live file before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `03984800`, 2026-06-19

## Why this matters

`RESET-PLAN.md` is a one-time operational artifact committed to the git
history of the dashboard repo. It contains three pieces of PII/sensitive
data committed in plain text: the super_admin account email, the super_admin
internal user ID (repeated in a SQL snippet), and the Supabase project ref.
The file also still says "aguardando GO explícito" although the reset was
executed at least 29 commits ago, which means the status is actively
misleading to anyone reading the repo. Removing or tombstoning this file
ensures the sensitive data is not surfaced in grep/audit tools and that no
future reader misinterprets the pending-reset status.

## Current state

**File**: `RESET-PLAN.md` (repo root) — one-time reset runbook, fully
executed, now stale.

Key evidence (line numbers verified against the live file at planning time):

- `RESET-PLAN.md:4` — project ref committed in plain text in the Status
  header block (Supabase project ref — treat as sensitive identifier).
- `RESET-PLAN.md:21` — super_admin email and internal user ID committed in
  the "O que MANTÉM" table (both treated as PII).
- `RESET-PLAN.md:84` — user ID repeated verbatim in the SQL snippet for
  `DELETE FROM "user" WHERE id <> '<user-id>'`.
- `RESET-PLAN.md:3` — status line reads `"aguardando GO explícito"`, which
  is false; the reset was executed long before the planning commit.

> HARD RULE 4 enforcement: do NOT paste the actual email, user ID, or
> project ref values anywhere in this plan file or in commit messages.
> Reference them only as "the super_admin email at RESET-PLAN.md:21",
> "the user ID at RESET-PLAN.md:21 and :84", and "the project ref at
> RESET-PLAN.md:4".

**Two fix options** — the executor MUST choose one and document the choice
in the commit message. Default is Option B.

- **Option A (preferred if repo may ever be public/shared)**: Delete
  `RESET-PLAN.md` entirely and purge it from git history using
  `git-filter-repo` (or BFG). This is a destructive history rewrite and
  requires force-push coordination across BOTH repos that share this history:
  the canonical `othavioquiliao/emach-dashboard` and the deploy mirror
  `emach-ferramentas`. Only choose Option A with explicit operator
  confirmation that the history rewrite is approved.

- **Option B (default, non-destructive)**: Replace `RESET-PLAN.md` with a
  short tombstone that strips all PII and corrects the status. The PII
  values will remain in git history but will not appear in the working tree
  or in grep output. Choose this unless the operator explicitly requested
  history purge.

**Repo deploy story** (relevant to Option A only): per `MEMORY.md`
(project_emach_vercel_deploy), there are two GitHub repos: canonical
`othavioquiliao/emach-dashboard` and deploy mirror `emach-ferramentas`.
There is no automatic mirror; pushes are manual and cross-account. A history
rewrite on one repo without the other leaves the PII in the other repo's
history — coordinate both before considering Option A complete.

**Risk assessment**: The user ID alone (without credentials) is low risk.
The email is the higher-sensitivity piece. Rotation is not applicable
(no credential was leaked). Recommend confirming that the super_admin account
referenced at `RESET-PLAN.md:21` is the intended sole bootstrap account and
that no other action is needed on the account itself.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Drift check | `git diff --stat 03984800..HEAD -- RESET-PLAN.md` | shows file or empty |
| Grep for PII (email) | `grep -n "@" RESET-PLAN.md` | no matches (after fix) |
| Grep for project ref | `grep -n "wrx" RESET-PLAN.md` | no matches (after fix) |
| Grep for user ID chars | `grep -n "7SrB2" RESET-PLAN.md` | no matches (after fix) |
| Git status | `git status` | only RESET-PLAN.md modified |
| Confirm tombstone length | `wc -l RESET-PLAN.md` | ≤ 15 lines |

> Note: no build/lint/test gates apply — this is a docs-only plan. The
> commands above are the sole verification surface.

## Scope

**In scope** (the only file you should modify):
- `RESET-PLAN.md` (repo root)

**Out of scope** (do NOT touch, even though they look related):
- `plans/README.md` — update it only to flip the status row for this plan
  to DONE (that is the only allowed change to this file).
- Any source file under `apps/`, `packages/`, `docs/` — this plan is
  docs/ops only.
- `.env` or any credential file — no secret rotation required.
- Git history — Option A (history purge) is out of scope UNLESS the operator
  explicitly confirmed it before you started. If unconfirmed, default to
  Option B and note in the STOP conditions.

## Git workflow

- Branch: `advisor/040-scrub-reset-plan-pii`
- Create with: `git checkout -b advisor/040-scrub-reset-plan-pii`
- Commit the single change with a Conventional Commit in Portuguese, subject
  ≤50 chars. Example:
  `docs(reset-plan): remove PII e atualiza status para executado`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Drift check

Run the drift check command from the executor header:

```
git diff --stat 03984800..HEAD -- RESET-PLAN.md
```

If the output shows the file was modified since planning, open `RESET-PLAN.md`
and compare it against the "Current state" section above. Confirm:
- The super_admin email is still at line 21 (or nearby).
- The user ID is still at lines 21 and 84 (or nearby).
- The project ref is still at line 4 (or nearby).
- The status "aguardando GO explícito" is still at line 3.

If none of those are present anymore (someone already tombstoned the file),
treat this as DONE — verify with the grep commands in "Done criteria" and
stop.

**Verify**: `grep -c "aguardando GO" RESET-PLAN.md` → output is `1` (file
not yet fixed) or `0` (already fixed — skip remaining steps).

### Step 2: Create branch

```
git checkout -b advisor/040-scrub-reset-plan-pii
```

**Verify**: `git branch --show-current` → `advisor/040-scrub-reset-plan-pii`

### Step 3: Apply Option B tombstone (default)

> Skip this step and go to "Option A note" below if the operator explicitly
> confirmed history purge before you started. In all other cases, execute
> this step.

Replace the entire content of `RESET-PLAN.md` with the following tombstone.
Use the `Write` tool (not `echo` or `sed`) to overwrite the file:

```markdown
# RESET-PLAN.md — Executado

> **Status:** Executado. Este arquivo é um artefato operacional de uso único.
> O reset foi realizado antes do commit 03984800 (2026-06-19).
>
> O SQL original, as credenciais de bootstrap e o identificador do projeto
> estavam neste arquivo e permanecem no histórico git (commits anteriores a
> 03984800). O conteúdo foi removido desta working tree para evitar exposição
> de PII em grep/audit.
>
> Se precisar do SQL de referência, consulte o histórico:
> `git show HEAD~<n>:RESET-PLAN.md` (ajuste `<n>` até encontrar o commit
> original).
>
> Checklist pós-reset (itens pendentes ao executar):
> - Completar dados da filial Curitiba pela UI (endereço, CEP, horários).
> - Ao criar admin/user: vincular ≥1 filial em `user_branch`.
> - Cadastrar catálogo do zero.
```

**Verify**: `wc -l RESET-PLAN.md` → ≤15 lines.

### Step 4: Grep for PII

Run all three grep commands to confirm no sensitive values remain:

```
grep -n "@" RESET-PLAN.md
grep -n "7SrB2" RESET-PLAN.md
grep -n "wrx" RESET-PLAN.md
```

All three must return no output (exit 1 with no lines printed is correct
behavior for grep when there are no matches).

**Verify**: all three greps return exit code 1 and zero lines of output.

### Step 5: Confirm only in-scope file changed

```
git status
```

**Verify**: only `RESET-PLAN.md` appears as modified. No other files listed
as modified or untracked (except possibly `plans/README.md` status-row update
which you will add to the commit).

### Step 6: Commit

```
git add RESET-PLAN.md
git add plans/README.md   # only if you updated the status row
git commit -m "docs(reset-plan): remove PII e atualiza status para executado"
```

**Verify**: `git log --oneline -1` → shows the commit message above with a
new SHA.

---

### Option A note (history purge — only if explicitly authorized)

If the operator confirmed history purge before you started, do NOT execute
Step 3. Instead:

1. Install `git-filter-repo` if not available: `pip install git-filter-repo`
   or `brew install git-filter-repo`.
2. Back up the remote URLs: `git remote -v`.
3. Run: `git filter-repo --path RESET-PLAN.md --invert-paths`
   This rewrites all history to exclude the file.
4. Force-push to the canonical repo: `git push --force-with-lease origin main`
   (confirm branch name first with `git branch --show-current`).
5. Coordinate the same force-push on the deploy mirror `emach-ferramentas`
   (manual cross-account push per `MEMORY.md` — do NOT do this without the
   operator present to confirm both repos).
6. Notify any collaborators that they must re-clone or hard-reset their local
   copies.

> STOP: Option A is destructive and irreversible. Do not proceed with Option
> A unless you received explicit written confirmation from the operator in
> this session. If unsure, default to Option B.

## Test plan

This is a docs-only plan. No automated tests apply. The verification suite
is the grep checks in Step 4 and Done criteria below.

## Done criteria

ALL must hold:

- [ ] `grep -n "@" RESET-PLAN.md` → no output (the super_admin email at
      RESET-PLAN.md:21 is gone from the working tree)
- [ ] `grep -n "7SrB2" RESET-PLAN.md` → no output (the user ID at
      RESET-PLAN.md:21 and :84 is gone from the working tree)
- [ ] `grep -n "wrx" RESET-PLAN.md` → no output (the project ref at
      RESET-PLAN.md:4 is gone from the working tree)
- [ ] `grep -n "aguardando GO" RESET-PLAN.md` → no output (stale status
      is gone)
- [ ] `wc -l RESET-PLAN.md` → ≤15 lines (tombstone, not the original runbook)
- [ ] `git status` → only `RESET-PLAN.md` (and optionally `plans/README.md`)
      modified; no other files touched
- [ ] `git log --oneline -1` → commit with message
      `docs(reset-plan): remove PII e atualiza status para executado`
- [ ] `plans/README.md` status row for plan 040 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The current `RESET-PLAN.md` does not contain the PII fields described in
  "Current state" (someone else already fixed it — verify Done criteria and
  close as DONE instead of re-applying changes).
- The drift check shows `RESET-PLAN.md` was modified and the current content
  does not match the description in "Current state" — the file may have been
  partially scrubbed already; compare carefully before overwriting.
- You are about to proceed with Option A (history purge) without having
  received explicit written operator confirmation in this session — stop and
  ask.
- `git status` after Step 3 shows modifications to files outside
  `RESET-PLAN.md` and `plans/README.md` — stop before committing.
- You discover the tombstone template in Step 3 triggers a lint/format
  auto-hook (the repo runs `bun fix` via PostToolUse hook on Write/Edit).
  If the hook reformats the markdown in a way that re-introduces any PII
  substring, re-run the grep checks and fix before committing.

## Maintenance notes

- This is a one-shot cleanup. After DONE, `RESET-PLAN.md` is a permanent
  tombstone and should not be modified further.
- The PII values remain in git history (commits before `03984800`) and will
  be accessible via `git log` to anyone with repo access. This is acceptable
  for a private repo but becomes a problem if the repo is ever made public.
  If public access is planned, revisit Option A with the operator at that time.
- The operator should confirm that the super_admin account referenced at
  `RESET-PLAN.md:21` (before tombstoning) is still the intended sole
  bootstrap account and that no credential associated with that account was
  leaked alongside the email/ID.
- Future operational runbooks (resets, migrations, bootstrap scripts)
  **must not** be committed with PII inline. Use a local-only `.gitignore`d
  file or a private Supabase note, and reference only the account type (not
  email/ID) in committed docs.
