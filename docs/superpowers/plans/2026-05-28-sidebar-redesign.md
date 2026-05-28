# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar a sidebar do dashboard admin com nova IA (5 grupos por workflow), ícones, modo icon-only colapsável persistido em cookie, command palette (Cmd+K), footer com avatar+dropdown, e animações sutis via motion.

**Architecture:** O componente monolítico `app-sidebar.tsx` é quebrado em `nav-config.ts` (config tipada) + `nav-group.tsx` + `nav-item.tsx` + `sidebar-footer-user.tsx` + `command-palette.tsx`. O `SidebarProvider` (packages/ui) passa a persistir estado em cookie (lido no server → sem flash). `motion` entra como dependência compartilhada com `LazyMotion` + `useReducedMotion`.

**Tech Stack:** Next 16 App Router, React 19 (+ React Compiler), shadcn sidebar/command/dropdown/avatar/tooltip (já instalados), motion, lucide-react, drizzle.

**Pré-requisito de leitura:** spec em `docs/superpowers/specs/2026-05-28-sidebar-dashboard-redesign-design.md`. Convenções em `apps/web/CLAUDE.md` (server actions = `"use server"` + `requireCurrentSession()` + `ActionResult<T>`; anti-patterns banidos: `console.*`, `any`, `key={index}`, `useMemo`/`useCallback` manual com React Compiler, `forwardRef`).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `packages/ui/src/components/sidebar.tsx` (modify) | Persistência por cookie em vez de localStorage |
| `apps/web/src/lib/sidebar-cookie.ts` (create) | Helper de leitura/escrita do cookie `sidebar_state` (server + client) |
| `apps/web/src/app/dashboard/_components/nav-config.ts` (create) | Config tipada de grupos/itens (ícone, href, badgeKey, disabled, requiresManageUsers) + `isActive` |
| `apps/web/src/app/dashboard/_components/nav-item.tsx` (create) | Render de 1 item: ícone, label, badge, tooltip em icon-only, motion |
| `apps/web/src/app/dashboard/_components/nav-group.tsx` (create) | Render de 1 grupo com label e stagger |
| `apps/web/src/app/dashboard/_components/sidebar-footer-user.tsx` (create) | Avatar + nome + role + dropdown (Perfil, Sair) |
| `apps/web/src/app/dashboard/_components/app-sidebar.tsx` (rewrite) | Orquestra header (logo + toggle + busca), grupos, footer |
| `apps/web/src/app/dashboard/_components/command-palette.tsx` (create) | Cmd+K: navegação + busca + ações |
| `apps/web/src/app/dashboard/_components/motion-provider.tsx` (create) | `LazyMotion features={domAnimation}` wrapper client |
| `apps/web/src/app/dashboard/search-actions.ts` (create) | Server action `globalSearch(query)` → `ActionResult<SearchResults>` |
| `apps/web/src/app/dashboard/_lib/global-search.ts` (create) | Lógica de busca (queries) + tipos, testável |
| `apps/web/src/app/dashboard/layout.tsx` (modify) | Buscar e passar `orderCount`/`reviewCount` para a sidebar |

---

## Task 1: Instalar motion e provider de animação

**Files:**
- Modify: `package.json` (catalog) ou `apps/web/package.json`
- Create: `apps/web/src/app/dashboard/_components/motion-provider.tsx`

- [ ] **Step 1: Adicionar dependência**

Verificar versão atual nas docs antes (find-docs `motion`). Instalar na app:

```bash
cd apps/web && bun add motion
```

Expected: `motion` aparece em `apps/web/package.json` dependencies.

- [ ] **Step 2: Criar o MotionProvider (LazyMotion)**

```tsx
// apps/web/src/app/dashboard/_components/motion-provider.tsx
"use client";

import { domAnimation, LazyMotion } from "motion/react";
import type { ReactNode } from "react";

export function MotionProvider({ children }: { children: ReactNode }) {
	return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
```

- [ ] **Step 3: Verificar build de tipos**

Run: `bun check-types`
Expected: PASS (sem erros de import de `motion/react`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/src/app/dashboard/_components/motion-provider.tsx
git commit -m "build: adicionar motion + MotionProvider (LazyMotion)"
```

---

## Task 2: Persistência da sidebar por cookie

> **Por quê:** o `SidebarProvider` lê `localStorage` num `useState` initializer. No SSR isso retorna `defaultOpen`, causando flash/hydration mismatch quando o usuário deixou colapsado. Cookie é lido no server e passado como `defaultOpen` — zero flash.

**Files:**
- Create: `apps/web/src/lib/sidebar-cookie.ts`
- Test: `apps/web/src/lib/__tests__/sidebar-cookie.test.ts`
- Modify: `packages/ui/src/components/sidebar.tsx:80-105` (state + setOpen)
- Modify: `apps/web/src/app/dashboard/layout.tsx` (ler cookie → `defaultOpen`)

- [ ] **Step 1: Teste do helper de cookie (client write + parse)**

```ts
// apps/web/src/lib/__tests__/sidebar-cookie.test.ts
import { describe, expect, it } from "vitest";
import { parseSidebarCookie, SIDEBAR_COOKIE_NAME } from "../sidebar-cookie";

describe("parseSidebarCookie", () => {
	it("retorna true quando cookie ausente (default aberto)", () => {
		expect(parseSidebarCookie(undefined)).toBe(true);
	});
	it("retorna false quando cookie = 'false'", () => {
		expect(parseSidebarCookie(`${SIDEBAR_COOKIE_NAME}=false`)).toBe(false);
	});
	it("retorna true quando cookie = 'true'", () => {
		expect(parseSidebarCookie(`x=1; ${SIDEBAR_COOKIE_NAME}=true; y=2`)).toBe(true);
	});
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `cd apps/web && bun test sidebar-cookie`
Expected: FAIL ("Cannot find module ../sidebar-cookie").

- [ ] **Step 3: Implementar o helper**

```ts
// apps/web/src/lib/sidebar-cookie.ts
export const SIDEBAR_COOKIE_NAME = "sidebar_state";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

/** Parse do header Cookie (server) ou document.cookie (client). */
export function parseSidebarCookie(cookieHeader: string | undefined): boolean {
	if (!cookieHeader) {
		return true;
	}
	const match = cookieHeader
		.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith(`${SIDEBAR_COOKIE_NAME}=`));
	if (!match) {
		return true;
	}
	return match.split("=")[1] !== "false";
}

/** Escreve o cookie no client. */
export function writeSidebarCookie(open: boolean): void {
	if (typeof document === "undefined") {
		return;
	}
	document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `cd apps/web && bun test sidebar-cookie`
Expected: PASS (3 testes).

- [ ] **Step 5: Trocar persistência no SidebarProvider**

Em `packages/ui/src/components/sidebar.tsx`, o provider deve aceitar `defaultOpen` (já aceita) e escrever cookie em vez de localStorage. Substituir o `useState` initializer (linhas ~80-91) e o `setOpen` (linhas ~93-105):

```tsx
// initializer: usar só defaultOpen (cookie é lido no server e passado como defaultOpen)
const [_open, _setOpen] = useState(defaultOpen);

const setOpen = useCallback(
	(value: boolean | ((value: boolean) => boolean)) => {
		const openState = typeof value === "function" ? value(open) : value;
		if (setOpenProp) {
			setOpenProp(openState);
		} else {
			_setOpen(openState);
		}
		// cookie em vez de localStorage: lido no server → sem flash de hydration
		document.cookie = `sidebar_state=${openState}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
	},
	[setOpenProp, open]
);
```

Remover a constante `SIDEBAR_STORAGE_KEY` e qualquer leitura de `window.localStorage`.

- [ ] **Step 6: Ler cookie no layout e passar como defaultOpen**

Em `apps/web/src/app/dashboard/layout.tsx`, importar `cookies` de `next/headers` e o helper:

```tsx
import { cookies } from "next/headers";
import { parseSidebarCookie, SIDEBAR_COOKIE_NAME } from "@/lib/sidebar-cookie";

// dentro da função, antes do return:
const cookieStore = await cookies();
const sidebarOpen = parseSidebarCookie(
	`${SIDEBAR_COOKIE_NAME}=${cookieStore.get(SIDEBAR_COOKIE_NAME)?.value ?? ""}`
);

// no JSX:
<SidebarProvider defaultOpen={sidebarOpen}>
```

- [ ] **Step 7: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/sidebar.tsx apps/web/src/lib/sidebar-cookie.ts apps/web/src/lib/__tests__/sidebar-cookie.test.ts apps/web/src/app/dashboard/layout.tsx
git commit -m "refactor: persistir estado da sidebar em cookie (sem flash SSR)"
```

---

## Task 3: Config tipada de navegação + isActive

**Files:**
- Create: `apps/web/src/app/dashboard/_components/nav-config.ts`
- Test: `apps/web/src/app/dashboard/_components/__tests__/nav-config.test.ts`

- [ ] **Step 1: Teste de isActive**

```ts
// apps/web/src/app/dashboard/_components/__tests__/nav-config.test.ts
import { describe, expect, it } from "vitest";
import { isNavItemActive } from "../nav-config";

describe("isNavItemActive", () => {
	it("dashboard só ativo no path exato", () => {
		expect(isNavItemActive("/dashboard", "/dashboard")).toBe(true);
		expect(isNavItemActive("/dashboard/orders", "/dashboard")).toBe(false);
	});
	it("item normal ativo no path e em sub-rotas", () => {
		expect(isNavItemActive("/dashboard/orders", "/dashboard/orders")).toBe(true);
		expect(isNavItemActive("/dashboard/orders/123", "/dashboard/orders")).toBe(true);
	});
	it("não casa prefixo parcial de segmento", () => {
		expect(isNavItemActive("/dashboard/orders-x", "/dashboard/orders")).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `cd apps/web && bun test nav-config`
Expected: FAIL ("Cannot find module ../nav-config").

- [ ] **Step 3: Implementar config + isActive**

```ts
// apps/web/src/app/dashboard/_components/nav-config.ts
import type { Route } from "next";
import {
	Boxes,
	Building2,
	FolderTree,
	Image as ImageIcon,
	LayoutDashboard,
	type LucideIcon,
	Megaphone,
	Bell,
	Package,
	ShoppingCart,
	Star,
	Truck,
	Users,
	Wrench,
} from "lucide-react";

export type BadgeKey = "orders" | "stock" | "reviews" | "users";

export interface NavItemConfig {
	label: string;
	href: Route;
	icon: LucideIcon;
	exact?: boolean;
	disabled?: boolean;
	badgeKey?: BadgeKey;
	requiresManageUsers?: boolean;
}

export interface NavGroupConfig {
	label: string;
	items: NavItemConfig[];
}

export const DASHBOARD_HREF = "/dashboard" as Route;

export const NAV_GROUPS: NavGroupConfig[] = [
	{
		label: "Visão",
		items: [
			{ label: "Dashboard", href: DASHBOARD_HREF, icon: LayoutDashboard, exact: true },
		],
	},
	{
		label: "Operação",
		items: [
			{ label: "Pedidos", href: "/dashboard/orders" as Route, icon: ShoppingCart, badgeKey: "orders" },
			{ label: "Estoque", href: "/dashboard/stock" as Route, icon: Boxes, badgeKey: "stock" },
			{ label: "Filiais", href: "/dashboard/branches" as Route, icon: Building2 },
		],
	},
	{
		label: "Catálogo",
		items: [
			{ label: "Ferramentas", href: "/dashboard/tools" as Route, icon: Wrench },
			{ label: "Categorias", href: "/dashboard/categories" as Route, icon: FolderTree },
			{ label: "Fornecedores", href: "/dashboard/suppliers" as Route, icon: Truck },
		],
	},
	{
		label: "Relacionamento",
		items: [
			{ label: "Clientes", href: "/dashboard/customers" as Route, icon: Users },
			{ label: "Avaliações", href: "/dashboard/reviews" as Route, icon: Star, badgeKey: "reviews" },
			{ label: "Promoções", href: "/dashboard/promotions" as Route, icon: Megaphone },
			{ label: "Banners", href: "/dashboard/site/banners" as Route, icon: ImageIcon, disabled: true },
			{ label: "Notificações", href: "/dashboard/site/notifications" as Route, icon: Bell, disabled: true },
		],
	},
	{
		label: "Administração",
		items: [
			{ label: "Usuários", href: "/dashboard/users" as Route, icon: Users, badgeKey: "users", requiresManageUsers: true },
		],
	},
];

export function isNavItemActive(pathname: string, href: string, exact?: boolean): boolean {
	if (href === DASHBOARD_HREF || exact) {
		return pathname === href;
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}
```

> Nota: `Package` está importado para uso futuro (ex.: variante de ícone); remover se o linter reclamar de import não usado. Ajustar `Users` repetido se preferir ícone distinto para Administração (ex.: `ShieldCheck`).

- [ ] **Step 4: Rodar — deve passar**

Run: `cd apps/web && bun test nav-config`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-config.ts apps/web/src/app/dashboard/_components/__tests__/nav-config.test.ts
git commit -m "feat: config tipada de navegação da sidebar com ícones"
```

---

## Task 4: NavItem (ícone + badge + tooltip icon-only + motion)

**Files:**
- Create: `apps/web/src/app/dashboard/_components/nav-item.tsx`

- [ ] **Step 1: Implementar o componente**

```tsx
// apps/web/src/app/dashboard/_components/nav-item.tsx
"use client";

import {
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@emach/ui/components/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive, type NavItemConfig } from "./nav-config";

export function NavItem({
	item,
	badgeCount,
}: {
	item: NavItemConfig;
	badgeCount?: number;
}) {
	const pathname = usePathname();
	const { state } = useSidebar();
	const active = isNavItemActive(pathname, item.href, item.exact);
	const Icon = item.icon;
	const showBadge = typeof badgeCount === "number" && badgeCount > 0;

	if (item.disabled) {
		return (
			<SidebarMenuItem>
				<div
					aria-disabled="true"
					className="flex h-8 w-full items-center gap-2 rounded-md p-2 text-left text-sm opacity-50"
				>
					<Icon className="size-4 shrink-0" aria-hidden />
					<span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
					<span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wide group-data-[collapsible=icon]:hidden">
						em breve
					</span>
				</div>
			</SidebarMenuItem>
		);
	}

	const button = (
		<SidebarMenuButton
			isActive={active}
			tooltip={item.label}
			render={
				<Link href={item.href}>
					<Icon className="size-4 shrink-0" aria-hidden />
					<span>{item.label}</span>
				</Link>
			}
		/>
	);

	return (
		<SidebarMenuItem>
			{button}
			{showBadge && <SidebarMenuBadge>{badgeCount}</SidebarMenuBadge>}
		</SidebarMenuItem>
	);
}
```

> O primitivo `SidebarMenuButton` já aceita prop `tooltip` que só aparece em modo icon-only — não precisamos montar Tooltip manual. Os imports de Tooltip ficam disponíveis caso o badge precise de tooltip próprio em icon-only (badge fica escondido nesse modo por padrão do shadcn; se quiser mostrar contagem no ícone, adicionar dot indicator — ver Task 7 nota).

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-item.tsx
git commit -m "feat: NavItem com ícone, badge e tooltip em icon-only"
```

---

## Task 5: NavGroup (label + stagger sutil)

**Files:**
- Create: `apps/web/src/app/dashboard/_components/nav-group.tsx`

- [ ] **Step 1: Implementar**

```tsx
// apps/web/src/app/dashboard/_components/nav-group.tsx
"use client";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
} from "@emach/ui/components/sidebar";
import { m, useReducedMotion } from "motion/react";
import type { BadgeKey, NavGroupConfig } from "./nav-config";
import { NavItem } from "./nav-item";

export function NavGroup({
	group,
	badges,
}: {
	group: NavGroupConfig;
	badges: Partial<Record<BadgeKey, number>>;
}) {
	const reduce = useReducedMotion();

	return (
		<SidebarGroup>
			<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{group.items.map((item, index) => (
						<m.div
							key={item.href}
							initial={reduce ? false : { opacity: 0, x: -6 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.18, ease: "easeOut", delay: reduce ? 0 : index * 0.025 }}
						>
							<NavItem
								item={item}
								badgeCount={item.badgeKey ? badges[item.badgeKey] : undefined}
							/>
						</m.div>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-group.tsx
git commit -m "feat: NavGroup com stagger sutil (respeita reduced-motion)"
```

---

## Task 6: Footer com avatar + dropdown

**Files:**
- Create: `apps/web/src/app/dashboard/_components/sidebar-footer-user.tsx`

- [ ] **Step 1: Implementar**

Reaproveitar a lógica de signOut do `app-sidebar.tsx` atual (linhas ~184-203). Usar `Avatar`, `DropdownMenu`, `RoleBadge` existentes.

```tsx
// apps/web/src/app/dashboard/_components/sidebar-footer-user.tsx
"use client";

import { Avatar, AvatarFallback } from "@emach/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@emach/ui/components/sidebar";
import { ChevronsUpDown, LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export type FooterUser = { email: string; name: string; role?: string | null };

function initials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase() ?? "")
		.join("");
}

export function SidebarFooterUser({ user }: { user: FooterUser }) {
	const router = useRouter();
	const [isSigningOut, setIsSigningOut] = useState(false);

	const handleSignOut = async () => {
		if (isSigningOut) {
			return;
		}
		setIsSigningOut(true);
		try {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						router.replace("/login");
						router.refresh();
					},
				},
			});
		} finally {
			setIsSigningOut(false);
		}
	};

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
								<Avatar className="size-8 rounded-md">
									<AvatarFallback className="rounded-md text-xs">
										{initials(user.name)}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{user.name}</span>
									<span className="truncate text-muted-foreground text-xs">{user.email}</span>
								</div>
								<ChevronsUpDown className="ml-auto size-4" aria-hidden />
							</SidebarMenuButton>
						}
					/>
					<DropdownMenuContent side="top" align="start" className="w-56">
						<DropdownMenuItem render={<Link href="/dashboard/users"><UserIcon className="size-4" /> Perfil</Link>} />
						<DropdownMenuSeparator />
						<DropdownMenuItem
							disabled={isSigningOut}
							onClick={() => {
								handleSignOut().catch(() => undefined);
							}}
						>
							<LogOut className="size-4" /> {isSigningOut ? "Saindo..." : "Sair"}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
```

> Verificar a API exata de `DropdownMenuTrigger`/`DropdownMenuItem` no projeto (usa base-ui `render` prop, igual ao `SidebarMenuButton`). Se a rota de Perfil dedicada não existir, apontar para `/dashboard/users` (lista) por ora — criar rota `/dashboard/profile` é follow-up fora deste plano.

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/_components/sidebar-footer-user.tsx
git commit -m "feat: footer da sidebar com avatar + dropdown"
```

---

## Task 7: Reescrever app-sidebar (icon mode + toggle + busca + active indicator)

**Files:**
- Rewrite: `apps/web/src/app/dashboard/_components/app-sidebar.tsx`

- [ ] **Step 1: Reescrever o componente**

```tsx
// apps/web/src/app/dashboard/_components/app-sidebar.tsx
"use client";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "@emach/ui/components/sidebar";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { CommandPalette } from "./command-palette";
import { MotionProvider } from "./motion-provider";
import { DASHBOARD_HREF, NAV_GROUPS } from "./nav-config";
import { NavGroup } from "./nav-group";
import { SidebarFooterUser, type FooterUser } from "./sidebar-footer-user";

interface AppSidebarProps {
	canManageUsers: boolean;
	orderCount: number;
	reviewCount: number;
	pendingCount: number;
	stockCount: number;
	user: FooterUser | null | undefined;
}

export function AppSidebar({
	canManageUsers,
	orderCount,
	reviewCount,
	pendingCount,
	stockCount,
	user,
}: AppSidebarProps) {
	const [commandOpen, setCommandOpen] = useState(false);
	const badges = {
		orders: orderCount,
		reviews: reviewCount,
		users: pendingCount,
		stock: stockCount,
	} as const;

	const groups = NAV_GROUPS.filter(
		(g) => g.label !== "Administração" || canManageUsers
	);

	return (
		<MotionProvider>
			<Sidebar collapsible="icon">
				<SidebarHeader>
					<Link
						aria-label="Emach — ir para o dashboard"
						className="flex items-center justify-center px-2 py-2 group-data-[collapsible=icon]:px-0"
						href={DASHBOARD_HREF}
					>
						<Image
							alt="Emach"
							className="h-7 w-auto group-data-[collapsible=icon]:hidden"
							height={56}
							priority
							src="/emach-nome-branco.svg"
							width={224}
						/>
					</Link>
					<CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
				</SidebarHeader>

				<SidebarContent>
					{groups.map((group) => (
						<NavGroup badges={badges} group={group} key={group.label} />
					))}
				</SidebarContent>

				<SidebarFooter>{user && <SidebarFooterUser user={user} />}</SidebarFooter>
				<SidebarRail />
			</Sidebar>
		</MotionProvider>
	);
}
```

> O `SidebarRail` dá a área de click/drag pra colapsar. O `SidebarTrigger` (botão hambúrguer) já existe no header mobile do `layout.tsx`; para desktop, o `CommandPalette` inclui o botão de busca e o rail cobre o toggle. Se quiser um botão de toggle explícito no header da sidebar, adicionar `<SidebarTrigger />` no `SidebarHeader`.
>
> **Badge em icon-only:** `SidebarMenuBadge` é escondido no modo icon pelo shadcn. Para sinalizar pendências com a sidebar colapsada, adicionar um dot: no `NavItem`, quando `state === "collapsed"` e `showBadge`, renderizar `<span className="absolute right-1 top-1 size-2 rounded-full bg-primary" />` dentro do botão. (Incremento opcional.)

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS (vai acusar `layout.tsx` faltando props novas — corrigido na Task 8).

- [ ] **Step 3: Commit (após Task 8 compilar)**

Agrupar com a Task 8.

---

## Task 8: Layout busca e passa counts de orders/reviews/stock

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx`

- [ ] **Step 1: Adicionar fetch dos counts e passar props**

Reusar `fetchDashboardCounts` de `./pending-data` (já retorna `{ orders, reviews, stock }`). Importar e somar ao `Promise.all`:

```tsx
import { fetchDashboardCounts } from "./pending-data";

// dentro de DashboardLayout, ampliar o Promise.all:
const [pendingCountRow, reporCount, counts] = await Promise.all([
	canManageUsers
		? db.select({ value: count() }).from(userTable).where(eq(userTable.status, "pending")).then((rows) => rows[0])
		: Promise.resolve(undefined),
	getReporCount(branchScope),
	fetchDashboardCounts(),
]);

const pendingCount = Number(pendingCountRow?.value ?? 0);

// no JSX <AppSidebar ...>:
<AppSidebar
	canManageUsers={canManageUsers}
	orderCount={counts.orders}
	reviewCount={counts.reviews}
	stockCount={counts.stock}
	pendingCount={pendingCount}
	user={{ name: session.user.name, email: session.user.email, role: session.user.role }}
/>
```

> `reporCount` continua alimentando o link de Ferramentas com `?mode=repor` se desejado, mas o badge de reposição agora vive em Estoque (`stockCount`). Decidir se `reporCount` ainda é necessário; se não, remover `getReporCount` daqui.

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Smoke run visual**

Run: `bun dev:web` e abrir `http://localhost:3001/dashboard`. Verificar:
- 5 grupos com ícones na ordem Visão/Operação/Catálogo/Relacionamento/Administração
- Badges em Pedidos/Estoque/Avaliações/Usuários (se houver pendências)
- Toggle colapsa para icon-only com tooltips no hover, e o estado persiste após F5 (cookie)
- Footer com avatar + dropdown (Perfil, Sair)
- Banners e Notificações aparecem como "em breve"

Stack trace de erro SSR: `nextjs_call 3001 get_errors` (MCP next-devtools).

- [ ] **Step 4: Commit (Tasks 7+8)**

```bash
git add apps/web/src/app/dashboard/_components/app-sidebar.tsx apps/web/src/app/dashboard/layout.tsx
git commit -m "feat: sidebar reagrupada com icon-mode e badges operacionais"
```

---

## Task 9: Lógica de busca global (testável)

**Files:**
- Create: `apps/web/src/app/dashboard/_lib/global-search.ts`
- Test: `apps/web/src/app/dashboard/_lib/__tests__/global-search.test.ts`

- [ ] **Step 1: Teste da normalização da query**

```ts
// apps/web/src/app/dashboard/_lib/__tests__/global-search.test.ts
import { describe, expect, it } from "vitest";
import { buildSearchPattern, isSearchable } from "../global-search";

describe("global-search", () => {
	it("isSearchable exige >= 2 chars não-espaço", () => {
		expect(isSearchable("a")).toBe(false);
		expect(isSearchable("  ")).toBe(false);
		expect(isSearchable("ab")).toBe(true);
	});
	it("buildSearchPattern faz lower + wrap ILIKE", () => {
		expect(buildSearchPattern(" Furadeira ")).toBe("%furadeira%");
	});
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `cd apps/web && bun test global-search`
Expected: FAIL.

- [ ] **Step 3: Implementar a lógica e as queries**

```ts
// apps/web/src/app/dashboard/_lib/global-search.ts
import { db } from "@emach/db";
import { sql } from "drizzle-orm";

export interface SearchHit {
	id: string;
	label: string;
	sublabel?: string;
	href: string;
	group: "Ferramentas" | "Pedidos" | "Clientes";
}

export interface SearchResults {
	tools: SearchHit[];
	orders: SearchHit[];
	clients: SearchHit[];
}

export function isSearchable(query: string): boolean {
	return query.trim().length >= 2;
}

export function buildSearchPattern(query: string): string {
	return `%${query.trim().toLowerCase()}%`;
}

const LIMIT = 5;

export async function runGlobalSearch(query: string): Promise<SearchResults> {
	if (!isSearchable(query)) {
		return { tools: [], orders: [], clients: [] };
	}
	const pattern = buildSearchPattern(query);

	const [tools, orders, clients] = await Promise.all([
		db.execute<{ id: string; name: string; model: string | null }>(sql`
			SELECT id, name, model FROM tool
			WHERE lower(name) LIKE ${pattern} OR lower(coalesce(model, '')) LIKE ${pattern}
			ORDER BY name ASC LIMIT ${LIMIT}
		`),
		db.execute<{ id: string; number: string; client_name: string }>(sql`
			SELECT o.id, o.number, c.name AS client_name
			FROM "order" o JOIN client c ON c.id = o.client_id
			WHERE lower(o.number) LIKE ${pattern} OR lower(c.name) LIKE ${pattern}
			ORDER BY o.created_at DESC LIMIT ${LIMIT}
		`),
		db.execute<{ id: string; name: string; document: string | null }>(sql`
			SELECT id, name, document FROM client
			WHERE lower(name) LIKE ${pattern} OR coalesce(document, '') LIKE ${pattern}
			ORDER BY name ASC LIMIT ${LIMIT}
		`),
	]);

	return {
		tools: tools.rows.map((r) => ({
			id: r.id,
			label: r.name,
			sublabel: r.model ?? undefined,
			href: `/dashboard/tools/${r.id}`,
			group: "Ferramentas",
		})),
		orders: orders.rows.map((r) => ({
			id: r.id,
			label: `#${r.number}`,
			sublabel: r.client_name,
			href: `/dashboard/orders/${r.id}`,
			group: "Pedidos",
		})),
		clients: clients.rows.map((r) => ({
			id: r.id,
			label: r.name,
			sublabel: r.document ?? undefined,
			href: `/dashboard/customers/${r.id}`,
			group: "Clientes",
		})),
	};
}
```

> Nota anti-pattern: usar `db.execute` com colunas explícitas (não `select *`) e alias snake→camel onde o tipo exigir; aqui os campos são lidos como vêm (snake_case `client_name`). Pattern já validado em `pending-data.ts`.

- [ ] **Step 4: Rodar — deve passar**

Run: `cd apps/web && bun test global-search`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_lib/global-search.ts apps/web/src/app/dashboard/_lib/__tests__/global-search.test.ts
git commit -m "feat: lógica de busca global (tools/orders/clients)"
```

---

## Task 10: Server action + Command Palette (Cmd+K)

**Files:**
- Create: `apps/web/src/app/dashboard/search-actions.ts`
- Create: `apps/web/src/app/dashboard/_components/command-palette.tsx`

- [ ] **Step 1: Server action**

```ts
// apps/web/src/app/dashboard/search-actions.ts
"use server";

import { requireCurrentSession } from "@/lib/session";
import { logger } from "@/lib/logger";
import { runGlobalSearch, type SearchResults } from "./_lib/global-search";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function globalSearch(query: string): Promise<ActionResult<SearchResults>> {
	await requireCurrentSession();
	try {
		const data = await runGlobalSearch(query);
		return { ok: true, data };
	} catch (err) {
		logger.error("globalSearch", { err });
		return { ok: false, error: "Falha na busca" };
	}
}
```

> Confirmar caminho do `logger` e do tipo `ActionResult` já existente no projeto (provável `@/lib/action-result` ou similar) e reusar em vez de redeclarar.

- [ ] **Step 2: Command Palette**

```tsx
// apps/web/src/app/dashboard/_components/command-palette.tsx
"use client";

import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@emach/ui/components/command";
import { SidebarMenuButton } from "@emach/ui/components/sidebar";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { NAV_GROUPS } from "./nav-config";
import { globalSearch } from "../search-actions";
import type { SearchResults } from "../_lib/global-search";

const EMPTY: SearchResults = { tools: [], orders: [], clients: [] };

export function CommandPalette({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResults>(EMPTY);
	const [, startTransition] = useTransition();

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				onOpenChange(true);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onOpenChange]);

	useEffect(() => {
		if (query.trim().length < 2) {
			setResults(EMPTY);
			return;
		}
		const id = setTimeout(() => {
			startTransition(async () => {
				const res = await globalSearch(query);
				if (res.ok) {
					setResults(res.data);
				}
			});
		}, 250);
		return () => clearTimeout(id);
	}, [query]);

	const go = (href: string) => {
		onOpenChange(false);
		setQuery("");
		router.push(href);
	};

	const allHits = [...results.tools, ...results.orders, ...results.clients];

	return (
		<>
			<SidebarMenuButton
				onClick={() => onOpenChange(true)}
				className="text-muted-foreground"
			>
				<Search className="size-4" aria-hidden />
				<span>Buscar…</span>
				<kbd className="ml-auto text-[10px] group-data-[collapsible=icon]:hidden">⌘K</kbd>
			</SidebarMenuButton>

			<CommandDialog open={open} onOpenChange={onOpenChange}>
				<CommandInput
					placeholder="Buscar rotas, ferramentas, pedidos, clientes…"
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList>
					<CommandEmpty>Nada encontrado.</CommandEmpty>
					<CommandGroup heading="Navegação">
						{NAV_GROUPS.flatMap((g) => g.items)
							.filter((i) => !i.disabled)
							.map((item) => (
								<CommandItem key={item.href} onSelect={() => go(item.href)}>
									<item.icon className="size-4" aria-hidden />
									{item.label}
								</CommandItem>
							))}
					</CommandGroup>
					{allHits.length > 0 && (
						<CommandGroup heading="Resultados">
							{allHits.map((hit) => (
								<CommandItem key={`${hit.group}-${hit.id}`} onSelect={() => go(hit.href)}>
									<span>{hit.label}</span>
									{hit.sublabel && (
										<span className="ml-2 text-muted-foreground text-xs">{hit.sublabel}</span>
									)}
									<span className="ml-auto text-muted-foreground text-[10px]">{hit.group}</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
```

> Confirmar API do `command.tsx` do projeto: nomes `CommandDialog`, `CommandInput` (prop `onValueChange` vs `onInput`), `CommandItem onSelect`. Ajustar conforme o wrapper (base-ui vs cmdk). Se `CommandDialog` não existir, compor `Dialog` + `Command`.

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 4: Smoke run visual**

`bun dev:web` → `Cmd/Ctrl+K` abre o palette; digitar nome de ferramenta retorna resultado; Enter navega; grupo Navegação salta entre rotas.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/search-actions.ts apps/web/src/app/dashboard/_components/command-palette.tsx
git commit -m "feat: command palette Cmd+K (navegação + busca de entidades)"
```

---

## Task 11: Limpeza e code review

- [ ] **Step 1: Remover código morto**

Conferir que o antigo `app-sidebar.tsx` não tem mais `NAV_GROUPS` inline, `FooterContent`, `isActive` duplicado. Remover imports não usados.

- [ ] **Step 2: Rodar suite e tipos**

```bash
cd apps/web && bun test && bun check-types
```
Expected: testes verdes, tipos OK.

- [ ] **Step 3: Code review do diff**

Run: `/code-review` (effort medium). Aplicar findings de simplificação inline.

- [ ] **Step 4: Verificação visual final + reduced-motion**

Testar com `prefers-reduced-motion` ativo (DevTools → Rendering → Emulate CSS) — stagger deve sumir, sem animação de posição.

- [ ] **Step 5: Commit final**

```bash
git add -A && git commit -m "chore: limpeza pós-refactor da sidebar"
```

---

## Self-Review (preenchido pelo autor do plano)

**Spec coverage:**
- IA 5 grupos → Task 3 ✅ · icon-mode/cookie → Tasks 2,7 ✅ · ícones → Tasks 3,4 ✅ · badges orders/stock/reviews/users → Tasks 4,8 ✅ · Cmd+K completo → Tasks 9,10 ✅ · footer avatar+dropdown sem tema → Task 6 ✅ · motion sutil + reduced-motion → Tasks 1,5 ✅ · Banners/Notificações disabled → Task 3 ✅
- **Gap consciente:** badge em icon-only (dot) marcado como incremento opcional na Task 7, não bloqueante.

**Placeholders:** nenhum "TBD"; pontos marcados com "confirmar API" são verificações de assinatura de componente base-ui a fazer na execução (não placeholders de lógica).

**Type consistency:** `BadgeKey`, `NavItemConfig`, `SearchResults`, `SearchHit`, `FooterUser` definidos uma vez e reusados. `isNavItemActive` mesma assinatura em config/item.
