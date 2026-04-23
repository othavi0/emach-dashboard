# Sidebar Logout Design

## Context

The dashboard sidebar in `apps/web/src/app/dashboard/_components/app-sidebar.tsx` already has the right footer location for account actions. The user profile area currently loads from `authClient.useSession()` and should continue to show the authenticated dashboard user in the footer.

The requested change is to replace the placeholder-style footer treatment with a real sidebar-native logout action that fits the existing navigation language.

## Goals

- Keep the logout control in the current sidebar footer area.
- Preserve the user identity block with name and email above the action.
- Make the logout action look and behave like a native sidebar item.
- Sign out immediately on click, without a confirmation step.
- Show pending feedback during logout by changing the label to `Saindo...` and disabling repeated clicks.

## Non-Goals

- No confirmation modal or extra logout flow.
- No auth architecture changes for dashboard vs ecommerce.
- No migration from Better Auth client logout to a server action.
- No broader sidebar refactor beyond the footer section.

## Recommended Approach

Use the existing client-side Better Auth flow in the sidebar component and restyle the footer action as a native sidebar menu item.

This is the smallest correct change because the current dashboard shell already depends on `apps/web/src/lib/auth-client.ts` for session state and already performs the correct post-logout redirect to `/login`. The change stays local to the sidebar and does not introduce new routing or auth boundaries.

## UI Structure

The footer keeps two stacked regions:

1. A user identity block with the current user's name and email.
2. A single logout action rendered with the same visual vocabulary as sidebar navigation items.

The action should align with the sidebar spacing, hover, and typography so it reads as part of the shell rather than as a separate utility button.

## Interaction Design

Default state:

- Show `Sair`.
- The action is enabled.

Pending state after click:

- Disable the action.
- Change the label to `Saindo...`.
- Prevent duplicate requests while the sign-out promise is in flight.

Success state:

- Keep the current redirect behavior: `router.replace("/login")` followed by `router.refresh()`.

Failure handling:

- Do not add new UI for errors in this pass.
- If sign-out fails, the local pending state should be released so the user can try again.

## Component Changes

Scope the implementation to `apps/web/src/app/dashboard/_components/app-sidebar.tsx`.

Expected changes:

- Keep `authClient.useSession()` for loading the authenticated dashboard user.
- Keep the existing footer skeleton while the session is still loading.
- Add local component state for `isSigningOut`.
- Replace the plain footer button styling with sidebar-native structure.
- Use the local pending state to drive the `Sair` → `Saindo...` label change and disabled interaction.

No changes are needed in `packages/auth/src/dashboard.ts` or `apps/web/src/lib/session.ts`.

## Testing And Verification

Implementation verification should stay lightweight:

- Check the sidebar footer in the authenticated dashboard state.
- Confirm the user name and email still render.
- Confirm clicking `Sair` changes the label to `Saindo...` and prevents repeated clicks.
- Confirm successful sign-out returns the user to `/login`.
- Run project formatting and lint checks required by the repo workflow after implementation.

## Open Questions Resolved

- Logout should be immediate: approved.
- The action should match sidebar item styling: approved.
- Name and email remain visible above the action: approved.
- Pending feedback should be shown during logout: approved.
