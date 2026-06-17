# Plan 011: Assinar URLs de anexos sob demanda (fora do SSR do pedido)

> **Executor instructions**: Follow step by step; run every verification before
> moving on. On any "STOP conditions" item, stop and report. This change touches
> a private-bucket signed-URL flow — be careful with authorization. When done,
> update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4c63a64..HEAD -- apps/web/src/app/dashboard/orders/data.ts "apps/web/src/app/dashboard/orders/[id]"`
> On a mismatch with "Current state", STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (changes how attachment URLs reach the client; auth-sensitive)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b4c63a64`, 2026-06-17

## Why this matters

`getOrderDetail` signs a Supabase Storage URL for **every** order attachment on
the server, on every order-detail page load — each `createSignedUrl` is a
separate outbound HTTPS round-trip to Supabase that blocks SSR. An order with 5
attachments adds ~5 sequential-ish signing calls to TTFB before any HTML streams.
Attachments are only shown in one tab (Pagamento & Fiscal) and are usually opened
on demand, so signing them eagerly at render time is wasted latency on the hot
path. Moving signing to an on-demand server action removes it from the blocking
render.

## Current state

`apps/web/src/app/dashboard/orders/data.ts:848-861` (inside `getOrderDetail`):

```ts
// Private bucket: persist storage paths, sign on read (1-hour TTL).
const attachments: OrderAttachmentItem[] = await Promise.all(
	attachmentRows.map(async (att) => ({
		id: att.id,
		fileName: att.fileName,
		fileSize: att.fileSize,
		mimeType: att.mimeType,
		label: att.label,
		description: att.description,
		createdAt: att.createdAt,
		uploaderName: att.uploaderName ?? "Sistema",
		url: await createSignedUrl(ORDER_DOCUMENTS_BUCKET, att.fileUrl),
	}))
);
```

- `att.fileUrl` is the **storage path** (not a URL); `createSignedUrl` turns it
  into a 1-hour signed URL. The bucket is private (`ORDER_DOCUMENTS_BUCKET`).
- The attachments are consumed in the Pagamento & Fiscal tab
  (`orders/[id]/_components/tabs/payment-fiscal-tab.tsx`) — confirm by reading it.
- Authorization for orders is enforced via branch-scoping (`getOrderDetail`
  already checks `orderInScope` before returning); any new signing action must
  re-apply the same capability + scope check so a user can't sign an attachment
  for an order outside their scope (IDOR risk).
- Existing pattern for attachment actions:
  `orders/_components/attachment-actions.ts` (per `apps/web/CLAUDE.md` §Imagens) —
  reuse its capability/scope checks as the template.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Tests | `bun --cwd apps/web test` | all pass |
| Dev smoke | `bun dev:web` → order with attachments, Fiscal tab | attachments open/download |

## Scope

**In scope**:
- `apps/web/src/app/dashboard/orders/data.ts` — stop signing in `getOrderDetail`;
  return the storage path + metadata instead of a signed `url`.
- A server action to sign one attachment on demand — extend the existing
  `orders/_components/attachment-actions.ts` (preferred) or add a sibling action
  file. It MUST re-apply order capability + branch-scope authorization.
- `orders/[id]/_components/tabs/payment-fiscal-tab.tsx` (and any attachment list
  component it uses) — call the signing action when the user opens/downloads an
  attachment, with a loading state.
- The `OrderAttachmentItem` type definition — `url` becomes optional / replaced by
  a `storagePath` the client passes back to the action.

**Out of scope**:
- The 7-query `Promise.all` inside `getOrderDetail` is already parallel — leave it.
- Other tabs / other order data.
- Do NOT make the bucket public or change its TTL.

## Git workflow

- Branch: `advisor/011-lazy-attachment-signing`
- Commit (conventional commits, PT): `perf: assina anexos sob demanda (fora do SSR)`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Read the consumers and the auth template

Open `orders/[id]/_components/tabs/payment-fiscal-tab.tsx` and whatever component
renders the attachment list, plus `orders/_components/attachment-actions.ts`.
Identify: how `attachment.url` is used (an `<a href>` download? an `<img>`?), and
the exact capability + scope check the existing attachment actions apply.

**Verify**: you can state which capability gates order attachments and how branch
scope is checked. If attachments are rendered as eager `<img src>` (needing the
URL at first paint), STOP and report — on-demand signing changes the UX and the
maintainer should confirm (a download link is fine; an inline preview needs a
different approach).

### Step 2: Add the on-demand signing action

In `attachment-actions.ts`, add a `"use server"` action, e.g.
`signOrderAttachment(orderId: string, attachmentId: string)` that:
1. `await requireCapability("orders.read")` (or whatever Step 1 found),
2. re-validates the order is in the actor's branch scope (reuse
   `lockOrderAndAuthorize` / `getUserBranchScope` pattern — do NOT trust the
   client's `orderId`/`attachmentId` without re-checking ownership),
3. looks up the attachment's `fileUrl` (storage path) by `attachmentId` **scoped
   to that order**,
4. returns `createSignedUrl(ORDER_DOCUMENTS_BUCKET, fileUrl)` as an
   `ActionResult<{ url: string }>`.

Follow the `ActionResult<T>` return convention and `getPgError` error handling
from `apps/web/CLAUDE.md`.

**Verify**: `bun check-types` → exit 0. The action re-checks authorization (a
reviewer can read it and confirm no IDOR).

### Step 3: Stop signing in `getOrderDetail`

Change the `attachments` mapping to return metadata + the storage path (e.g.
`storagePath: att.fileUrl`) instead of awaiting `createSignedUrl`. Update the
`OrderAttachmentItem` type accordingly (`url` removed or optional;
`storagePath` added).

**Verify**: `bun check-types` → exit 0 (fix all type errors at consumer sites).

### Step 4: Wire on-demand signing in the Fiscal tab

In the attachment UI, replace the direct `url` usage with a click handler that
calls `signOrderAttachment(orderId, attachmentId)`, shows a brief loading state,
then opens/downloads the returned URL (e.g. `window.open(res.data.url)` or sets an
`<a href>` and clicks it). Pass `orderId` down to the tab/component if it isn't
already available.

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0.

### Step 5: Smoke

`bun dev:web` → open an order that has attachments → Pagamento & Fiscal tab →
click an attachment. Confirm it signs on demand and opens/downloads correctly.
Confirm a user scoped to a different branch cannot sign an attachment for an
out-of-scope order (test with a non-super_admin if the data allows, or at least
read the action to confirm the scope check).

**Verify**: attachment opens via the action; out-of-scope access is rejected by
the action's auth check.

## Test plan

- Add a unit test for `signOrderAttachment` if the existing
  `orders` test setup supports mocking `@emach/db` (model after
  `apps/web/src/app/dashboard/users/__tests__` or the `activity.test.ts` mock
  pattern in `apps/web/CLAUDE.md` §Testes): cover (a) happy path returns a URL,
  (b) out-of-scope order is rejected. If no mockable seam exists without building
  new infrastructure, document that and rely on the smoke — do not build a new
  harness.
- `bun --cwd apps/web test` stays green.

## Done criteria

ALL must hold:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun --cwd apps/web test` passes
- [ ] `getOrderDetail` no longer calls `createSignedUrl` (grep confirms)
- [ ] `signOrderAttachment` action exists and re-checks capability + branch scope
- [ ] Attachment opens on demand from the Fiscal tab (smoke)
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Attachments are rendered as eager inline previews (not download links) — the
  on-demand model changes UX; get maintainer confirmation first.
- You cannot re-establish the branch-scope check in the new action (auth is
  non-negotiable — better to keep eager signing than ship an IDOR).
- Any "Current state" excerpt doesn't match the live code (drift).

## Maintenance notes

- The signing action is the new authorization choke point for order attachments —
  a reviewer must confirm it re-validates scope/capability and never signs by raw
  `attachmentId` without ownership.
- If a future feature needs inline attachment previews (thumbnails in the tab),
  reconsider: batch-sign only the visible ones in a Suspense-wrapped sub-component
  rather than reverting to eager signing in `getOrderDetail`.
- Signed URLs have a 1-hour TTL; on-demand signing means the URL is always fresh
  when the user clicks (better than a URL signed at page load that may expire
  before use).
