---
created: "2026-04-14"
last_edited: "2026-04-14"
---

# Implementation Tracking: Navigation Shell

Build site: context/plans/build-site.md

| Task  | Status | Notes |
|-------|--------|-------|
| T-030 | DONE   | `dashboard/layout.tsx` wraps children in `<SidebarProvider><AppSidebar /><SidebarInset>...</SidebarInset></SidebarProvider>` after guard |
| T-031 | DONE   | `AppSidebar` — full nav tree: Dashboard link + "Estoque" group (Ferramentas, Estoque por Filial) + "Configurações" group (Categorias, Fornecedores, Filiais). pt-BR labels. Uses `SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton` primitives |
| T-032 | DONE   | `usePathname()` + `isActive(pathname, href)` helper; special-case for `/dashboard` exact match, prefix match for children |
| T-033 | DONE   | `SidebarFooter` with `FooterContent` helper — renders user.name + user.email + "Sair" button. `Skeleton` placeholders during `isPending`. `authClient.signOut()` callback redirects to `/login` |
| T-034 | DONE   | `apps/web/src/components/app-header.tsx` early returns `null` when `pathname.startsWith('/dashboard')` |
| T-035 | DONE   | `apps/web/src/app/dashboard/(inventory)/layout.tsx` renders `<InventoryTabs />` above children inside padded container |
| T-036 | DONE   | `apps/web/src/app/dashboard/_components/inventory-tabs.tsx` client component uses base-ui `Tabs`/`TabsList`/`TabsTrigger` from `@emach/ui/components/tabs`. Promoções tab: `disabled` + `aria-disabled="true"` + `tabIndex={-1}`, plain text child (no Link), no href — matches cavekit R6 strict DOM spec |
| T-037 | DONE   | `SidebarTrigger` rendered in a mobile-only header (`md:hidden`) inside `SidebarInset`. `<Sidebar collapsible="offcanvas">` handles drawer open/close |
| T-038 | DONE   | `git diff packages/ui/src/components/` shows no modifications. All shell imports use `@emach/ui/components/*` aliases |
| T-039 | DONE   | All visible labels pt-BR: "Dashboard", "Estoque", "Ferramentas", "Estoque por Filial", "Configurações", "Categorias", "Fornecedores", "Filiais", "Sair", "Ferramentas" / "Estoque" / "Promoções" tab labels |

## Files

- `apps/web/src/app/dashboard/layout.tsx` (modified — added `SidebarTrigger` mobile header inside `SidebarInset`)
- `apps/web/src/app/dashboard/_components/app-sidebar.tsx` (full rewrite — nav tree, active state, footer)
- `apps/web/src/app/dashboard/_components/inventory-tabs.tsx` (new)
- `apps/web/src/app/dashboard/(inventory)/layout.tsx` (new)
- `apps/web/src/components/app-header.tsx` (modified — early return on `/dashboard/*`)

## Architectural Notes

- **`render` prop instead of `asChild`**: shadcn `base-lyra` registry uses `@base-ui/react` primitives via the `useRender` pattern, NOT Radix `Slot`. `SidebarMenuButton` and `TabsTrigger` accept a `render` prop (e.g., `render={<Link href=... />}`) to compose with Next.js `Link`.
- **Next.js typed routes**: placeholder nav links (`/dashboard/tools`, `/dashboard/stock`, etc.) are cast `as Route` because the page files do not yet exist in the route graph at TS-compile time (they land in Tier 3). This keeps Next 16 `typedRoutes` happy.
- **Pages not yet created**: Per cavekit R-out-of-scope, content pages under `/dashboard/stock|categories|suppliers|branches` are NOT included in Phase 1 — only their nav links. Clicking these links in the running app will 404 until Phase 2 adds content pages.
- **`FooterContent` helper function** extracted to satisfy biome `noNestedTernary` rule — `isPending ? skeleton : user ? info : null` flattened into early-return chain.
