---
created: "2026-04-14"
last_edited: "2026-04-14"
---

# Implementation Tracking: Auth Access

Build site: context/plans/build-site.md

| Task  | Status | Notes |
|-------|--------|-------|
| T-023 | DONE   | `Session['user']['role']` resolves via better-auth `additionalFields.role` config + drizzle schema role column. Build + TS pass. |
| T-024 | DONE   | `requireRole(role)` helper added to `apps/web/src/lib/session.ts`. Hierarchy: admin(3) > manager(2) > user(1) via `ROLE_WEIGHT` map. Throws Error if insufficient; redirects to `/login` via `requireCurrentSession` if unauth. |
| T-025 | DONE   | `apps/web/src/app/dashboard/layout.tsx` — async Server Component, `await requireCurrentSession()` first, then `<SidebarProvider><AppSidebar /><SidebarInset>{children}</SidebarInset></SidebarProvider>`. Uses minimal `AppSidebar` stub (filled in T-031). |
| T-026 | DONE   | `apps/web/src/app/dashboard/(inventory)/tools/actions.ts` — scaffolds `createTool`, `updateTool`, `deleteTool` each with `await requireRole('admin')` as first statement, empty bodies throwing "not yet implemented (T-050)". |
| T-027 | DONE   | `packages/env/src/server.ts` confirmed has NO `DISABLE_SIGN_UP` entry. Phase 2 flag deferred as documented in cavekit-auth-access.md R5. Sign-up stays enabled. |
| T-028 | DONE   | `authClient.useSession()` client-side TS inference picks up `role` field via the same `additionalFields` declaration. Build passed with zero TS errors. |
| T-029 | DONE   | `dashboard/layout.tsx` Server Component guard causes unauthenticated `/dashboard/*` to redirect via `redirect('/login')` (plain URL, no `from` param per cavekit R7). Behavioral verification deferred to T-064 manual-check. |

## Files

- `apps/web/src/lib/session.ts` (modified — added `UserRole` type, `ROLE_WEIGHT`, `requireRole`)
- `apps/web/src/app/dashboard/layout.tsx` (new)
- `apps/web/src/app/dashboard/_components/app-sidebar.tsx` (new — stub, T-031 fills)
- `apps/web/src/app/dashboard/(inventory)/tools/actions.ts` (new — scaffolded, T-050 fills bodies)
- `packages/auth/src/index.ts` (modified — added `user.additionalFields.role` config)

## Deviations from cavekit

- **Better-auth `additionalFields`**: cavekit R1 says "`Session['user']['role']` resolves without `any`". Adding the column to the drizzle schema alone is NOT sufficient — better-auth requires explicit `user.additionalFields.role` declaration in the `betterAuth()` config for type inference. Added `input: false` so role cannot be set via sign-up form.
- **Role hierarchy error shape**: cavekit R2 says "throw or returns an error boundary response that results in a 403". Phase 1 throws a plain `Error` — Next.js renders this via error boundary. A dedicated 403 page can be added later.
- **`AppSidebar` minimal stub**: T-025 requires the shell to wrap children, but `AppSidebar` full tree is owned by T-031 (Tier 2). Stub renders empty Sidebar with header only; T-031 replaces content.
