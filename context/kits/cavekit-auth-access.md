---
created: "2026-04-14"
last_edited: "2026-04-14"
---

# Cavekit: Auth & Access Control

## Scope

Extend the session type to surface the `role` field without type casts. Add a `requireRole` server helper that enforces role hierarchy. Guard the `/dashboard/*` route subtree so unauthenticated requests redirect to `/login`. Gate tool-mutating server actions to admin role. Document (but do not implement) the `DISABLE_SIGN_UP` env flag for Phase 2. Expose role on the client session for conditional UI rendering.

**Prerequisite:** `cavekit-data-model.md` R5 must be complete — the `role` column must exist on the `user` table and be known to better-auth's `drizzleAdapter` before this kit's requirements can be met.

## Requirements

### R1: Session Type Includes Role Without `any` Cast
**Description:** TypeScript must resolve `session.user.role` to `string` (or the narrower `UserRole` union type) without the caller needing a type assertion or `any`.
**Acceptance Criteria:**
- [ ] `typeof auth.$Infer.Session['user']['role']` resolves to `string` or `'admin' | 'manager' | 'user'` in the TypeScript compiler — no `unknown` or `any`
- [ ] Running `tsc --noEmit` on `packages/auth` succeeds with no errors referencing `role`
- [ ] Accessing `session.user.role` in `apps/web/src/lib/session.ts` does not require a type assertion (`as string`, `as any`, etc.)

### R2: `requireRole` Helper Exported from `session.ts`
**Description:** A server-side helper function that checks both authentication and role sufficiency. It redirects unauthenticated callers to `/login` and returns a 403-equivalent response for authenticated callers with insufficient role. Role hierarchy: admin > manager > user (admin satisfies any role check; user satisfies only 'user' checks).
**Acceptance Criteria:**
- [ ] `apps/web/src/lib/session.ts` exports a function `requireRole` with signature accepting a role parameter of type `'admin' | 'manager' | 'user'`
- [ ] If the current session is null or has no user, `requireRole` calls Next.js `redirect('/login')` with NO search params — Phase 1 uses a hard-coded post-login target, see R7
- [ ] If the session exists but the user's role does not satisfy the required role, `requireRole` does NOT redirect to `/login`; instead it throws or returns an error boundary response that results in a 403 status (or equivalent — e.g., Next.js `notFound()` is acceptable as a Phase 1 approximation if a dedicated 403 page does not exist)
- [ ] Role hierarchy is encoded: a call `requireRole('user')` passes for roles `'admin'`, `'manager'`, and `'user'`; a call `requireRole('manager')` passes for `'admin'` and `'manager'` only; a call `requireRole('admin')` passes for `'admin'` only
- [ ] `requireRole` returns the full `Session` object on success so callers do not need to call `getCurrentSession` separately

### R3: Dashboard Layout Enforces Authentication AND Hosts Sidebar Shell
**Description:** A single layout file at `apps/web/src/app/dashboard/layout.tsx` is an async Server Component that (1) awaits `requireCurrentSession()` as the first operation, then (2) renders the `SidebarProvider` + `AppSidebar` shell wrapping `{children}`. Guard and shell coexist in one file — guard runs first, shell wraps children afterward.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/layout.tsx` exists and is an async Server Component (no `'use client'` directive)
- [ ] The very first statement inside the component body is `const session = await requireCurrentSession()` (or `await requireRole('user')`)
- [ ] If the session is missing, the user is redirected to `/login` before any JSX is returned — this behavior is inherited from `requireCurrentSession` / `requireRole`
- [ ] After the guard, the component returns `<SidebarProvider>` containing `<AppSidebar />` and `{children}` — the shell is part of this same file, not a separate layout
- [ ] Shell implementation details (nav tree, footer, mobile behavior) are governed by `cavekit-navigation-shell.md` — this kit owns the guard placement and requires the shell render to happen strictly AFTER the guard returns successfully

### R4: Tool Mutation Routes Gated to Admin Role
**Description:** Server actions that create, update, or delete tools must reject callers who are not admins.
**Acceptance Criteria:**
- [ ] `apps/web/src/app/dashboard/tools/actions.ts` — each of `createTool`, `updateTool`, `deleteTool` calls `requireRole('admin')` as the first operation (before reading form data or touching the database)
- [ ] A non-admin authenticated user calling `createTool`, `updateTool`, or `deleteTool` does not result in a database mutation
- [ ] A non-admin authenticated user calling any of these actions receives an error response (thrown error, returned error object, or redirect) — not a silent no-op
- [ ] An unauthenticated caller is redirected to `/login` before any mutation logic runs

### R5: DISABLE_SIGN_UP Flag Documented
**Description:** The kit documents an environment flag intended for Phase 2 that disables self-registration. Phase 1 does not implement it — sign-up remains enabled in development.
**Acceptance Criteria:**
- [ ] This kit (the text you are reading) documents `DISABLE_SIGN_UP=true` as a planned Phase 2 env var for `packages/env/src/server.ts`
- [ ] No code in Phase 1 reads or acts on `DISABLE_SIGN_UP` — the flag does not appear in `packages/env/src/server.ts` or any route handler in Phase 1
- [ ] [manual-check] A new user can register via `/login` in the development environment after Phase 1 is implemented (sign-up is not blocked)

**Phase 2 implementation note (for future kit):** When `DISABLE_SIGN_UP=true`, the sign-up endpoint should return HTTP 403 and the sign-up form should not render.

### R6: Client Session Exposes Role for Conditional Nav
**Description:** The client-side session hook must make `role` available so that shell components can conditionally render nav items based on role.
**Acceptance Criteria:**
- [ ] `authClient.useSession()` in a Client Component returns `data.user.role` as a string without TypeScript errors
- [ ] The sidebar footer component (defined in `cavekit-navigation-shell.md`) can read `session.data?.user?.role` and render a conditional element without a type cast
- [ ] [manual-check] In the running app, logging `session.data?.user?.role` from a client component shows `'admin'`, `'manager'`, or `'user'` (not `undefined`) for an authenticated session

### R7: Unauthorized Dashboard Access Redirects to `/login`, Post-Login Lands on `/dashboard`
**Description:** Any attempt to access `/dashboard/*` while unauthenticated must redirect to `/login` (no search params). After successful sign-in, the user is always redirected to a hard-coded `/dashboard`. Phase 1 does NOT implement `from` param preservation — deferred to Phase 2.
**Acceptance Criteria:**
- [ ] Navigating to `/dashboard/tools` while unauthenticated results in a redirect to `/login` (plain URL, no query string)
- [ ] Navigating to `/dashboard` while unauthenticated results in a redirect to `/login` (plain URL, no query string)
- [ ] The redirect is performed server-side (Next.js `redirect()` in a Server Component) — not client-side after page render
- [ ] `apps/web/src/app/login/page.tsx` does NOT read any `from` search param — no such handling exists in Phase 1 code
- [ ] After a successful sign-in, the user is redirected to `/dashboard` (hard-coded target) — no dynamic redirect based on prior URL
- [ ] [manual-check] Signing in from `/login` (regardless of how the user got there) lands on `/dashboard`

## Out of Scope

- OAuth providers (GitHub, Google, etc.)
- Magic link / passwordless authentication
- Two-factor authentication (2FA)
- Password reset flow
- Rate limiting on auth endpoints
- Audit log of authentication events
- API key validation middleware (Phase 2)
- The `DISABLE_SIGN_UP` implementation (Phase 2)
- Session expiry UI warnings or auto-refresh

## Cross-References

- See also: `cavekit-data-model.md` — R5 of that kit adds the `role` column that this kit depends on; R8 wires the extended user into `drizzleAdapter`
- See also: `cavekit-navigation-shell.md` — the dashboard layout that hosts the session guard also hosts the sidebar shell; R3 of this kit and R1 of the shell kit describe the same `layout.tsx` file from different angles

## Changelog

| Date | Change |
|------|--------|
| 2026-04-14 | Initial draft |
| 2026-04-14 | R2/R3/R7 revised: layout.tsx hosts guard + shell jointly; login redirect hard-coded, no `from` param in Phase 1 |
