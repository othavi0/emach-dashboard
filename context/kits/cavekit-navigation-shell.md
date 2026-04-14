---
created: "2026-04-14"
last_edited: "2026-04-14"
---

# Cavekit: Navigation Shell

## Scope

Build the sidebar navigation and contextual inventory tabs for the `/dashboard/*` route subtree. The sidebar is rendered via shadcn `SidebarProvider` + a custom `AppSidebar` component. The root `AppHeader` must not appear on dashboard routes. An inventory route group gets a contextual top tab bar. All shell components live in `apps/web/src/app/dashboard/_components/` (per-route convention). No files in `packages/ui/src/components/*` are modified.

**User rule:** NEVER edit `packages/ui/src/components/*`. Use shadcn primitives from `@emach/ui/*` as-is.

## Requirements

### R1: Dashboard Layout Hosts Sidebar Shell
**Description:** `apps/web/src/app/dashboard/layout.tsx` wraps the dashboard subtree in a `SidebarProvider` and renders the `AppSidebar` alongside `children`. The authentication guard (`requireCurrentSession`) runs before any shell rendering.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/layout.tsx` exists and is the only layout file at this level
- [ ] The component imports and renders `SidebarProvider` from `@emach/ui/components/sidebar`
- [ ] The component renders `AppSidebar` (imported from `./_components/app-sidebar`) inside `SidebarProvider`
- [ ] The component renders a `{children}` slot inside `SidebarProvider`, positioned adjacent to `AppSidebar`
- [ ] `requireCurrentSession()` is awaited before any JSX is returned — unauthenticated requests are redirected before the shell renders
- [ ] The file is an async Server Component (no `'use client'` directive at the top level)

### R2: AppSidebar Navigation Tree
**Description:** The `AppSidebar` component renders the full navigation tree in Portuguese with correct route links.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/_components/app-sidebar.tsx` exists
- [ ] Sidebar contains a top-level link: label "Dashboard" → href `/dashboard`
- [ ] Sidebar contains a group labeled "Estoque" (pt-BR) containing:
  - Link: "Ferramentas" → `/dashboard/tools`
  - Link: "Estoque por Filial" → `/dashboard/stock`
- [ ] Sidebar contains a group labeled "Configurações" (pt-BR) containing:
  - Link: "Categorias" → `/dashboard/categories`
  - Link: "Fornecedores" → `/dashboard/suppliers`
  - Link: "Filiais" → `/dashboard/branches`
- [ ] All nav items use appropriate shadcn sidebar primitives (`SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, or equivalents from `@emach/ui/components/sidebar`)
- [ ] No hardcoded style values (colors, sizes) are used — all styling comes from shadcn sidebar tokens defined in `globals.css`

### R3: Active Route Highlight
**Description:** The currently active route must be visually distinguished from inactive items.
**Acceptance Criteria:**
- [ ] `AppSidebar` uses `usePathname()` from `next/navigation` to determine the current path
- [ ] The nav item whose href exactly matches or is a prefix of `usePathname()` receives the shadcn `isActive` prop or equivalent active state class
- [ ] Only one nav item is marked active at a time — the most specific match wins (e.g., on `/dashboard/tools`, "Ferramentas" is active, not "Dashboard")
- [ ] [manual-check] Navigating to `/dashboard/tools` in the browser shows "Ferramentas" visually highlighted; navigating to `/dashboard` shows "Dashboard" highlighted

### R4: Sidebar Footer with User Info and Sign-Out
**Description:** The sidebar footer area renders the authenticated user's display name, email, and a sign-out button.
**Acceptance Criteria:**
- [ ] `AppSidebar` includes a `SidebarFooter` section (or equivalent shadcn primitive)
- [ ] The footer renders `session.data?.user?.name` and `session.data?.user?.email` from `authClient.useSession()`
- [ ] A sign-out button is present in the footer; clicking it calls `authClient.signOut()` and redirects to `/login`
- [ ] The footer component is a Client Component (has `'use client'` directive) since it uses client-side hooks
- [ ] User name and email are not rendered if the session is loading (show skeleton or empty state during `isPending`)

### R5: AppHeader Absent on Dashboard Routes
**Description:** The root `AppHeader` component must not appear within the `/dashboard/*` subtree. The header's own current implementation already checks `pathname.startsWith('/dashboard')` — this requirement enforces that the check exists and the header returns `null` on dashboard routes.
**Acceptance Criteria:**
- [ ] On any `/dashboard/*` route, the `<header>` element rendered by `AppHeader` is NOT present in the DOM
- [ ] `apps/web/src/components/app-header.tsx` either: (a) already contains a `pathname.startsWith('/dashboard')` guard that returns `null`, OR (b) `apps/web/src/app/layout.tsx` is split into a public layout (with header) and a dashboard layout (without header) using Next.js route group nesting
- [ ] The root `layout.tsx` change (if approach b is taken) does NOT remove the header from `/login` or `/` — those routes must still show the header
- [ ] [manual-check] Navigating to `/dashboard` shows no top header bar above the sidebar; navigating to `/login` shows the `AppHeader`

### R6: Inventory Route Group with Contextual Top Tabs
**Description:** Routes under the inventory group (`/dashboard/tools`, `/dashboard/stock`, and eventually `/dashboard/promotions`) share a contextual tab bar rendered at the top of the content area.
**Acceptance Criteria:**
- [ ] Directory `apps/web/src/app/dashboard/(inventory)/` exists as a Next.js route group (parenthesized name, no URL segment)
- [ ] File `apps/web/src/app/dashboard/(inventory)/layout.tsx` exists and renders `InventoryTabs` above `{children}`
- [ ] Routes `/dashboard/tools` and `/dashboard/stock` are moved inside `(inventory)/` so they share the group layout
- [ ] The tab bar renders three tabs with pt-BR labels: "Ferramentas", "Estoque", "Promoções"
- [ ] The "Promoções" tab is rendered as a shadcn `<TabsTrigger>` element with the `disabled` prop set — the underlying `<button>` has `disabled` attribute AND `aria-disabled="true"`, `tabIndex={-1}`, is NOT wrapped in a `<Link>` or `<a>` (no `href`), and clicking or activating via keyboard has NO navigation effect. It must NOT be rendered as a plain `<span>`, bare `<div>`, or anchor with `pointer-events: none`.
- [ ] The active tab is derived from `usePathname()` — "Ferramentas" active when path starts with `/dashboard/tools`, "Estoque" active when path starts with `/dashboard/stock`
- [ ] [manual-check] Clicking "Ferramentas" tab navigates to `/dashboard/tools`; clicking "Estoque" tab navigates to `/dashboard/stock`; clicking "Promoções" tab does nothing

### R7: InventoryTabs Component Location
**Description:** The tab bar component lives inside the per-route `_components/` folder, not in `packages/ui`.
**Acceptance Criteria:**
- [ ] File `apps/web/src/app/dashboard/_components/inventory-tabs.tsx` exists
- [ ] The component uses shadcn `Tabs`/`TabsList`/`TabsTrigger` primitives from `@emach/ui/components/tabs`
- [ ] No new component is added to `packages/ui/src/components/` — NEVER edit that directory
- [ ] The component is a Client Component (has `'use client'` directive) to enable `usePathname()` usage
- [ ] Tab labels and group labels use pt-BR strings

### R8: Mobile Sidebar Collapses to Sheet/Drawer
**Description:** On viewports narrower than 768px, the sidebar must collapse and be accessible via a trigger button.
**Acceptance Criteria:**
- [ ] The layout renders a `SidebarTrigger` (from `@emach/ui/components/sidebar`) that is visible on narrow viewports
- [ ] At 375px viewport width, the sidebar is not open by default — it is collapsed or hidden
- [ ] Clicking `SidebarTrigger` opens the sidebar as a sheet or drawer overlay
- [ ] [manual-check] At 375px viewport, the sidebar is collapsed on page load; tapping the trigger opens it; tapping outside or pressing Escape closes it

### R9: Shell Uses Only shadcn Primitives from @emach/ui
**Description:** No component file in `packages/ui/src/components/*` is created or edited. Shell components use the shadcn primitives already installed.
**Acceptance Criteria:**
- [ ] `git diff packages/ui/src/components/` shows no changes after implementing this kit
- [ ] All sidebar-related imports in shell components use the `@emach/ui/components/sidebar` alias
- [ ] All tab-related imports use `@emach/ui/components/tabs` alias
- [ ] No new shadcn components are added via `shadcn add` as part of this kit (if sidebar and tabs components are already installed — verify with `ls packages/ui/src/components/`)

### R10: All Labels in pt-BR
**Description:** All visible text in the navigation shell — group headings, nav item labels, tab labels, button labels — must be in Brazilian Portuguese.
**Acceptance Criteria:**
- [ ] No English nav item labels appear in `AppSidebar` (e.g., "Tools" → "Ferramentas", "Stock" → "Estoque", "Settings" → "Configurações")
- [ ] The sign-out button label is "Sair" (not "Sign out" or "Logout")
- [ ] Tab bar labels are "Ferramentas", "Estoque", "Promoções"
- [ ] Group headers are "Estoque" and "Configurações"

## Out of Scope

- Breadcrumb navigation component
- Notification center or badge indicators on nav items
- User avatar dropdown menu (sidebar footer shows only name, email, and sign-out)
- Theme toggle control (dark-only per design foundation kit)
- Global command palette or search modal
- Collapsed sidebar icon-only mode (beyond the mobile sheet behavior)
- Any content pages under `/dashboard/stock`, `/dashboard/categories`, `/dashboard/suppliers`, `/dashboard/branches` — only their nav links are wired

## Cross-References

- See also: `cavekit-design-foundation.md` — sidebar token values (`--sidebar-*`) defined there are consumed by shadcn sidebar primitives rendered here
- See also: `cavekit-auth-access.md` — `requireCurrentSession()` called in R1 of this kit is defined there (R3); role exposure on client (R6 there) is used by sidebar footer (R4 here)
- See also: `cavekit-inventory-tools.md` — tools CRUD pages are hosted inside the `(inventory)` route group shell defined here

## Changelog

| Date | Change |
|------|--------|
| 2026-04-14 | Initial draft |
| 2026-04-14 | R6: Promoções tab DOM element specified — `<TabsTrigger disabled>` with explicit aria/tab-index rules |
