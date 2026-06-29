# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a sidebar do dashboard — remover a busca global, reorganizar a IA (esquema "por fluxo"), dar peso visual funcional ao chrome e trocar o dropdown do footer por ações diretas.

**Architecture:** A sidebar é client-side (`apps/web/src/app/dashboard/_components/*`) sobre o shadcn `Sidebar collapsible="icon"` (`@emach/ui`). Dados de sessão vêm de `DashboardChrome` (Server Component) → `AppSidebar`. Badges consomem `countsPromise` sob `<Suspense>`. As mudanças são localizadas nesses componentes + remoção de tokens de animação em `packages/ui/src/styles/globals.css`.

**Tech Stack:** Next 16 / React 19, shadcn (base-ui), Tailwind v4 (tokens OKLCH em globals.css), Better Auth (`authClient`), vitest (env `node`).

## Global Constraints

- Sem `console.*` — usar `logger` de `apps/web/src/lib/logger.ts` (não há logging novo aqui, mas vale a regra).
- Sem `: any`, `as any`, `@ts-ignore`, `@ts-expect-error`.
- Sem `key={index}` em `.map()` — usar `item.href` (estável).
- `<img>` proibido — logo já usa `next/image`.
- React 19: sem `forwardRef`, sem `useMemo`/`useCallback` manuais (React Compiler ativo).
- Cormorant/`font-serif` **proibido** no chrome da sidebar — toda tipografia aqui é Inter (sans).
- Gates de capability **nunca** removidos; a filtragem por `capability`/`canManageUsers` no `AppSidebar` é preservada.
- Verificação UI: `bun check-types` **não** detecta hook client em Server Component nem layout quebrado → smoke visual obrigatório em `/dashboard`.
- Antes de PR: `bun check-types && bun check && bun --cwd apps/web test` (atalho `bun verify`). `bun run build` é gate quando se mexe em `"use server"` (Task 2 deleta um arquivo `"use server"` — rodar build no fim).

---

### Task 1: Reorganizar a IA (`nav-config.ts`) + teste de estrutura

Reescreve `NAV_GROUPS` para o esquema "por fluxo": Dashboard solto no topo (grupo de rótulo vazio), `Vendas`, `Catálogo`, `Loja & Clientes`, `Configuração`, `Administração`. Remove o campo `requiresManageUsers` (só era consumido pela busca, que será deletada) e o item `Notificações` (disabled).

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/nav-config.ts`
- Test: `apps/web/src/app/dashboard/_components/__tests__/nav-config.test.ts`

**Interfaces:**
- Produces: `NAV_GROUPS: NavGroupConfig[]` (primeiro grupo com `label: ""` contendo só Dashboard); `NavItemConfig` sem `requiresManageUsers`; `DASHBOARD_HREF`, `isNavItemActive`, `BadgeKey` inalterados.

- [ ] **Step 1: Escrever o teste de estrutura (falhando)**

Adicionar ao fim de `apps/web/src/app/dashboard/_components/__tests__/nav-config.test.ts` (manter o `describe` existente de `isNavItemActive`):

```ts
import { NAV_GROUPS } from "../nav-config";

describe("NAV_GROUPS — esquema por fluxo", () => {
	it("Dashboard é o único item do grupo sem rótulo, no topo", () => {
		expect(NAV_GROUPS[0].label).toBe("");
		expect(NAV_GROUPS[0].items.map((i) => i.label)).toEqual(["Dashboard"]);
	});

	it("grupos na ordem esperada", () => {
		expect(NAV_GROUPS.map((g) => g.label)).toEqual([
			"",
			"Vendas",
			"Catálogo",
			"Loja & Clientes",
			"Configuração",
			"Administração",
		]);
	});

	it("Movimentações em Vendas; Filiais em Configuração", () => {
		const groupOf = (label: string) =>
			NAV_GROUPS.find((g) => g.items.some((i) => i.label === label))?.label;
		expect(groupOf("Movimentações")).toBe("Vendas");
		expect(groupOf("Filiais")).toBe("Configuração");
	});

	it("não há item Notificações", () => {
		const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
		expect(all).not.toContain("Notificações");
	});
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun --cwd apps/web test nav-config`
Expected: FAIL (a estrutura atual tem grupos "Visão"/"Operação"/... e item Notificações).

- [ ] **Step 3: Reescrever `nav-config.ts`**

Substituir o conteúdo de `apps/web/src/app/dashboard/_components/nav-config.ts` por:

```ts
import {
	ArrowLeftRight,
	Building2,
	FolderTree,
	Image as ImageIcon,
	LayoutDashboard,
	type LucideIcon,
	Megaphone,
	PackageCheck,
	Settings,
	ShieldCheck,
	ShoppingCart,
	Star,
	Truck,
	Users,
	Wrench,
} from "lucide-react";
import type { Route } from "next";
import type { Capability } from "@/lib/permissions";

export type BadgeKey = "orders" | "picking" | "stock" | "reviews" | "users";

export interface NavItemConfig {
	badgeKey?: BadgeKey;
	capability?: Capability;
	disabled?: boolean;
	exact?: boolean;
	href: Route;
	icon: LucideIcon;
	label: string;
}

export interface NavGroupConfig {
	items: NavItemConfig[];
	label: string;
}

export const DASHBOARD_HREF = "/dashboard" as Route;

export const NAV_GROUPS: NavGroupConfig[] = [
	{
		label: "",
		items: [
			{
				label: "Dashboard",
				href: DASHBOARD_HREF,
				icon: LayoutDashboard,
				exact: true,
			},
		],
	},
	{
		label: "Vendas",
		items: [
			{
				label: "Pedidos",
				href: "/dashboard/orders" as Route,
				icon: ShoppingCart,
				badgeKey: "orders",
			},
			{
				label: "Separação",
				href: "/dashboard/separacao" as Route,
				icon: PackageCheck,
				capability: "orders.pick",
				badgeKey: "picking",
			},
			{
				label: "Movimentações",
				href: "/dashboard/stock/movements" as Route,
				icon: ArrowLeftRight,
			},
		],
	},
	{
		label: "Catálogo",
		items: [
			{
				label: "Ferramentas",
				href: "/dashboard/tools" as Route,
				icon: Wrench,
				badgeKey: "stock",
			},
			{
				label: "Categorias",
				href: "/dashboard/categories" as Route,
				icon: FolderTree,
			},
			{
				label: "Fornecedores",
				href: "/dashboard/suppliers" as Route,
				icon: Truck,
			},
		],
	},
	{
		label: "Loja & Clientes",
		items: [
			{
				label: "Promoções",
				href: "/dashboard/promotions" as Route,
				icon: Megaphone,
				capability: "promotions.read",
			},
			{
				label: "Banners",
				href: "/dashboard/site/banners" as Route,
				icon: ImageIcon,
				capability: "site.update_banners",
			},
			{
				label: "Clientes",
				href: "/dashboard/customers" as Route,
				icon: Users,
				capability: "customers.read",
			},
			{
				label: "Avaliações",
				href: "/dashboard/reviews" as Route,
				icon: Star,
				badgeKey: "reviews",
				capability: "reviews.read",
			},
		],
	},
	{
		label: "Configuração",
		items: [
			{
				label: "Filiais",
				href: "/dashboard/branches" as Route,
				icon: Building2,
			},
			{
				label: "Frete",
				href: "/dashboard/shipping" as Route,
				icon: Truck,
				capability: "shipping.read",
			},
			{
				label: "Configurações",
				href: "/dashboard/site/settings" as Route,
				icon: Settings,
				capability: "site.update_settings",
			},
		],
	},
	{
		label: "Administração",
		items: [
			{
				label: "Usuários",
				href: "/dashboard/users" as Route,
				icon: ShieldCheck,
				badgeKey: "users",
			},
		],
	},
];

export function isNavItemActive(
	pathname: string,
	href: string,
	exact?: boolean
): boolean {
	if (href === DASHBOARD_HREF || exact) {
		return pathname === href;
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}
```

Notas: `Bell` removido dos imports (Notificações sai); `requiresManageUsers` removido da interface e do item Usuários (o gate de Administração é por `g.label === "Administração"` + `canManageUsers` no `AppSidebar`).

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bun --cwd apps/web test nav-config`
Expected: PASS (todos os `describe`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-config.ts apps/web/src/app/dashboard/_components/__tests__/nav-config.test.ts
git commit -m "feat(sidebar): reorganiza nav por fluxo de trabalho"
```

---

### Task 2: Remover a busca global + novo header (`app-sidebar.tsx`)

Deleta o `CommandPalette` e toda a cadeia de busca, e reescreve o `AppSidebar`: header com logo à esquerda + tag "admin" + stamp coral no modo recolhido. Esta task concentra **todas** as edições do `app-sidebar.tsx`.

**Files:**
- Delete: `apps/web/src/app/dashboard/_components/command-palette.tsx`
- Delete: `apps/web/src/app/dashboard/search-actions.ts`
- Delete: `apps/web/src/app/dashboard/_lib/global-search.ts`
- Delete: `apps/web/src/app/dashboard/_lib/global-search.server.ts`
- Delete: `apps/web/src/app/dashboard/_lib/__tests__/global-search.test.ts`
- Modify: `apps/web/src/app/dashboard/_components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `NAV_GROUPS`, `DASHBOARD_HREF` (Task 1); `SidebarFooterUser`, `FooterUser` (inalterado neste ponto).
- Produces: `AppSidebar` com a mesma assinatura de props (`canManageUsers`, `capabilities`, `countsPromise`, `user`).

- [ ] **Step 1: Deletar os arquivos da busca**

```bash
git rm apps/web/src/app/dashboard/_components/command-palette.tsx \
  apps/web/src/app/dashboard/search-actions.ts \
  apps/web/src/app/dashboard/_lib/global-search.ts \
  apps/web/src/app/dashboard/_lib/global-search.server.ts \
  apps/web/src/app/dashboard/_lib/__tests__/global-search.test.ts
```

- [ ] **Step 2: Reescrever `app-sidebar.tsx`**

Substituir o conteúdo de `apps/web/src/app/dashboard/_components/app-sidebar.tsx` por:

```tsx
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

import type { Capability } from "@/lib/permissions";
import type { DashboardCounts } from "../pending-data";
import { DASHBOARD_HREF, NAV_GROUPS } from "./nav-config";
import { NavGroup } from "./nav-group";
import { type FooterUser, SidebarFooterUser } from "./sidebar-footer-user";

interface AppSidebarProps {
	canManageUsers: boolean;
	capabilities: Capability[];
	countsPromise: Promise<DashboardCounts>;
	user: FooterUser | null | undefined;
}

export function AppSidebar({
	canManageUsers,
	capabilities,
	countsPromise,
	user,
}: AppSidebarProps) {
	const capSet = new Set(capabilities);

	const groups = NAV_GROUPS.filter(
		(g) => g.label !== "Administração" || canManageUsers
	)
		.map((g) => ({
			...g,
			items: g.items.filter(
				(item) => !item.capability || capSet.has(item.capability)
			),
		}))
		.filter((g) => g.items.some((item) => !item.disabled));

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<Link
					aria-label="Emach — ir para o dashboard"
					className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
					href={DASHBOARD_HREF}
				>
					<span
						aria-hidden
						className="hidden size-7 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground text-sm group-data-[collapsible=icon]:flex"
					>
						E
					</span>
					<Image
						alt="Emach"
						className="h-7 w-auto group-data-[collapsible=icon]:hidden"
						height={56}
						priority
						src="/emach-nome-branco.svg"
						width={224}
					/>
					<span className="ml-auto rounded border border-sidebar-border px-1.5 py-0.5 font-medium text-[9px] text-muted-foreground uppercase tracking-widest group-data-[collapsible=icon]:hidden">
						admin
					</span>
				</Link>
			</SidebarHeader>

			<SidebarContent>
				{groups.map((group) => (
					<NavGroup
						countsPromise={countsPromise}
						group={group}
						key={group.label || "root"}
					/>
				))}
			</SidebarContent>

			<SidebarFooter>{user && <SidebarFooterUser user={user} />}</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
```

Mudanças vs. atual: removidos `useState`, `CommandPalette`; header passa de centralizado para esquerda + stamp "E" (só no recolhido) + tag "admin"; `key={group.label || "root"}` (o grupo do Dashboard tem label "").

- [ ] **Step 3: Confirmar que não restou referência órfã à busca**

Run: `grep -rn "global-search\|command-palette\|globalSearch\|CommandPalette\|commandOpen" apps/web/src`
Expected: sem resultados.

- [ ] **Step 4: check-types**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/app/dashboard
git commit -m "feat(sidebar): remove busca global e redesenha header"
```

---

### Task 3: Estado ativo em pill coral (`nav-item.tsx`)

Reforça o estado ativo: além do ícone coral, o item ganha fundo coral-tint (`bg-primary/15`) e texto claro, sobrescrevendo o `data-active:bg-sidebar-accent` padrão via `twMerge`.

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/nav-item.tsx:45-59`

**Interfaces:**
- Consumes: `NavItemConfig`, `isNavItemActive` (Task 1); `cn` de `@emach/ui/lib/utils` (já importado).

- [ ] **Step 1: Aplicar o className do ativo**

Em `apps/web/src/app/dashboard/_components/nav-item.tsx`, no bloco `return` (caso não-disabled), substituir o `<SidebarMenuButton ...>` por:

```tsx
<SidebarMenuButton
	className={cn(
		active &&
			"hover:bg-primary/15 hover:text-sidebar-foreground data-active:bg-primary/15 data-active:text-sidebar-foreground"
	)}
	isActive={active}
	render={
		<Link href={item.href}>
			<Icon
				aria-hidden
				className={cn("size-4 shrink-0", active && "text-primary")}
			/>
			<span>{item.label}</span>
		</Link>
	}
	tooltip={item.label}
/>
```

(`cn` já está importado no arquivo. O `className` é aplicado por último no `cn()` interno do componente, então `twMerge` faz o coral vencer o `data-active:bg-sidebar-accent` do variant.)

- [ ] **Step 2: check-types**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 3: Smoke visual**

Subir `bun dev:web` (se ainda não estiver no ar) e visitar `/dashboard`. Confirmar: o item da rota atual tem fundo coral-tint + ícone coral; itens inativos seguem neutros; hover não apaga o ativo.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-item.tsx
git commit -m "feat(sidebar): estado ativo em pill coral"
```

---

### Task 4: Remover o stagger de entrada + label como section marker

Remove a animação decorativa de entrada (`nav-item-animate`) do `nav-group.tsx` e os tokens correspondentes no CSS, e renderiza o `SidebarGroupLabel` só quando há rótulo (Dashboard fica sem label).

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/nav-group.tsx`
- Modify: `packages/ui/src/styles/globals.css:303-323`

**Interfaces:**
- Consumes: `NavGroupConfig` (Task 1), `NavItem` (Task 3).

- [ ] **Step 1: Reescrever `nav-group.tsx`**

Substituir o conteúdo de `apps/web/src/app/dashboard/_components/nav-group.tsx` por:

```tsx
"use client";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
} from "@emach/ui/components/sidebar";
import type { DashboardCounts } from "../pending-data";
import type { NavGroupConfig } from "./nav-config";
import { NavItem } from "./nav-item";

export function NavGroup({
	group,
	countsPromise,
}: {
	group: NavGroupConfig;
	countsPromise: Promise<DashboardCounts>;
}) {
	return (
		<SidebarGroup>
			{group.label ? (
				<SidebarGroupLabel className="text-[11px] uppercase tracking-wider">
					{group.label}
				</SidebarGroupLabel>
			) : null}
			<SidebarGroupContent>
				<SidebarMenu>
					{group.items.map((item) => (
						<NavItem
							countsPromise={countsPromise}
							item={item}
							key={item.href}
						/>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
```

(Removido o `<div className="nav-item-animate" style={{ animationDelay }}>` que envolvia cada item; `key` passa pro `NavItem`.)

- [ ] **Step 2: Remover os tokens de animação do CSS**

Em `packages/ui/src/styles/globals.css`, remover o bloco (comentário + keyframes + classe + media query) que define `nav-item-in` / `.nav-item-animate` (atualmente ~linhas 303-323):

```css
/* === Nav item entrance animation (sidebar shell) ===
 * Replaces motion/react m.div stagger — zero JS dependency.
 */
@keyframes nav-item-in { ... }
.nav-item-animate { ... }
@media (prefers-reduced-motion: reduce) {
	.nav-item-animate { animation: none; }
}
```

- [ ] **Step 3: Confirmar que `nav-item-animate` ficou sem referências**

Run: `grep -rn "nav-item-animate\|nav-item-in" apps packages`
Expected: sem resultados.

- [ ] **Step 4: check-types + smoke visual**

Run: `bun --cwd apps/web check-types` → sem erros.
Smoke: recarregar `/dashboard` — sem animação de entrada em cascata; grupos renderizam direto; o grupo do Dashboard não mostra rótulo; demais grupos com label em caps.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-group.tsx packages/ui/src/styles/globals.css
git commit -m "refactor(sidebar): remove stagger de entrada e ajusta labels de grupo"
```

---

### Task 5: Badge de estoque com cor de warning (`nav-badge.tsx`)

O contador do item Ferramentas (`badgeKey: "stock"`, estoque baixo) passa a usar a role `warning` (mustard); os demais badges mantêm o tom secundário atual.

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/nav-badge.tsx:30-38`

**Interfaces:**
- Consumes: `DashboardCounts`, `BadgeKey` (Task 1).

- [ ] **Step 1: Aplicar a cor condicional**

Em `apps/web/src/app/dashboard/_components/nav-badge.tsx`, substituir o trecho final (do `if (value <= 0)` até o `return`) por:

```tsx
	if (value <= 0) {
		return null;
	}
	const tone =
		badgeKey === "stock"
			? "bg-warning/20 text-warning"
			: "bg-secondary text-secondary-foreground peer-data-active/menu-button:text-secondary-foreground";
	return <SidebarMenuBadge className={tone}>{value}</SidebarMenuBadge>;
```

- [ ] **Step 2: check-types + smoke**

Run: `bun --cwd apps/web check-types` → sem erros.
Smoke: com estoque baixo (`stock > 0`), o badge de Ferramentas aparece em mustard; Pedidos/Avaliações/Usuários seguem no tom secundário.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-badge.tsx
git commit -m "feat(sidebar): badge de estoque em warning"
```

---

### Task 6: Footer barra de identidade (`sidebar-footer-user.tsx`)

Reescreve o footer: na sidebar expandida, avatar + nome + role (coral) + dois botões de ícone diretos (Perfil, Sair) — sem dropdown. No modo recolhido (sem espaço), o avatar abre um menu pequeno com as duas ações. Mantém `getSidebarProfileHref` (coberto por teste) e o fluxo de `signOut`.

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/sidebar-footer-user.tsx`

**Interfaces:**
- Consumes: `useSidebar` de `@emach/ui/components/sidebar` (expõe `state: "expanded" | "collapsed"`); `authClient`, `getInitials`.
- Produces: `SidebarFooterUser`, `FooterUser`, `getSidebarProfileHref` (assinaturas inalteradas).

- [ ] **Step 1: Verificar que `getSidebarProfileHref` segue coberto**

Run: `bun --cwd apps/web test sidebar-footer-user`
Expected: PASS (o teste existente importa `getSidebarProfileHref`; ele será mantido).

- [ ] **Step 2: Reescrever `sidebar-footer-user.tsx`**

Substituir o conteúdo por:

```tsx
"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
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
	useSidebar,
} from "@emach/ui/components/sidebar";
import { LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { getInitials } from "@/lib/format/name";

export interface FooterUser {
	email: string;
	id: string;
	image?: string | null;
	name: string;
	role?: string | null;
}

export function getSidebarProfileHref(userId: string): string {
	return `/dashboard/users/${userId}`;
}

const ROLE_LABEL: Record<string, string> = {
	super_admin: "Super admin",
	admin: "Admin",
	user: "Usuário",
};

export function SidebarFooterUser({ user }: { user: FooterUser }) {
	const router = useRouter();
	const { state } = useSidebar();
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

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

	const profileHref = getSidebarProfileHref(user.id);
	const roleLabel = user.role
		? (ROLE_LABEL[user.role] ?? user.role)
		: null;

	const avatar = (
		<Avatar size="default">
			{user.image ? <AvatarImage alt="" src={user.image} /> : null}
			<AvatarFallback className="text-xs">
				{getInitials(user.name)}
			</AvatarFallback>
		</Avatar>
	);

	// Modo recolhido: sem espaço pros ícones inline — avatar abre menu pequeno.
	if (state === "collapsed") {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
						<DropdownMenuTrigger
							render={
								<SidebarMenuButton
									className="data-[state=open]:bg-sidebar-accent"
									size="lg"
								>
									{avatar}
								</SidebarMenuButton>
							}
						/>
						<DropdownMenuContent
							align="start"
							className="shadow-xl ring-1 ring-foreground/25"
							side="right"
						>
							<DropdownMenuItem onClick={() => router.push(profileHref)}>
								<UserIcon className="size-4" />
								Perfil
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								disabled={isSigningOut}
								onClick={() => {
									handleSignOut().catch(() => undefined);
								}}
							>
								<LogOut className="size-4" />
								{isSigningOut ? "Saindo..." : "Sair"}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			</SidebarMenu>
		);
	}

	// Expandido: barra de identidade com ações diretas (sem dropdown).
	return (
		<SidebarMenu>
			<SidebarMenuItem className="flex items-center gap-2 p-1">
				{avatar}
				<div className="grid min-w-0 flex-1 text-left leading-tight">
					<span className="truncate font-medium text-sm">{user.name}</span>
					{roleLabel ? (
						<span className="truncate text-[10px] text-primary uppercase tracking-wide">
							{roleLabel}
						</span>
					) : (
						<span className="truncate text-muted-foreground text-xs">
							{user.email}
						</span>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Link
						aria-label="Ver meu perfil"
						className="flex size-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
						href={profileHref}
					>
						<UserIcon aria-hidden className="size-4" />
					</Link>
					<button
						aria-label="Sair"
						className="flex size-8 items-center justify-center rounded-md border border-sidebar-border text-primary hover:bg-sidebar-accent disabled:opacity-50"
						disabled={isSigningOut}
						onClick={() => {
							handleSignOut().catch(() => undefined);
						}}
						type="button"
					>
						<LogOut aria-hidden className="size-4" />
					</button>
				</div>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
```

- [ ] **Step 3: Rodar o teste do footer + check-types**

Run: `bun --cwd apps/web test sidebar-footer-user`
Expected: PASS.
Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 4: Smoke visual (os dois modos)**

Em `/dashboard`: footer expandido mostra avatar (foto real; iniciais quando sem `image`), nome, role em coral, e os botões Perfil/Sair. Clicar Perfil navega pra `/dashboard/users/<id>`; Sair desloga e leva pro `/login`. Recolher a sidebar → avatar abre o menu com as 2 ações (fecha no `Esc`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/sidebar-footer-user.tsx
git commit -m "feat(sidebar): footer como barra de identidade com acoes diretas"
```

---

### Task 7: Verificação final (skeleton, suíte, build, smoke completo)

Sanidade do skeleton, e o gate completo de qualidade — incluindo `build` (a Task 2 deletou um arquivo `"use server"`).

**Files:**
- Modify (se necessário): `apps/web/src/app/dashboard/_components/sidebar-skeleton.tsx`

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Conferir o skeleton**

Abrir `apps/web/src/app/dashboard/_components/sidebar-skeleton.tsx`. Ele não referencia busca nem itens deletados (header skeleton + linhas de nav + footer skeleton). Confirmar que o fallback ainda é coerente com a nova sidebar (footer ~`h-12`). Ajuste opcional: trocar `h-10` por `h-12` no `Skeleton` do footer pra casar com a nova barra de identidade. Se nada destoar, seguir sem mudar.

- [ ] **Step 2: Gate de tipos + lint + testes**

Run: `bun verify`
(equivale a `bun check-types && bun check && bun --cwd apps/web test`)
Expected: tudo verde.

- [ ] **Step 3: Build (gate de `"use server"`)**

Run: `bun run build`
Expected: build conclui sem `Only async functions are allowed to be exported in a "use server" file` nem `Module not found`.

- [ ] **Step 4: Smoke visual completo em `/dashboard`**

`bun dev:web` + visitar `/dashboard`. Checklist:
- header sem busca; logo à esquerda + tag "admin";
- grupos na ordem do esquema 2 (Dashboard solto → Vendas → Catálogo → Loja & Clientes → Configuração → Administração);
- estado ativo em pill coral na rota atual; badge de estoque em mustard;
- footer: avatar com foto + fallback iniciais; Perfil e Sair funcionando;
- recolher a sidebar (rail): ícones + stamp "E" no topo + avatar com menu de 2 ações;
- logar como `admin`/`user` (não-super_admin) → grupo Administração some e itens sem capability somem (fail-closed).

- [ ] **Step 5: Commit (se houve ajuste de skeleton)**

```bash
git add apps/web/src/app/dashboard/_components/sidebar-skeleton.tsx
git commit -m "chore(sidebar): ajusta skeleton para o novo footer"
```

---

## Self-Review

**Spec coverage:**
- Remoção da busca → Task 2 (delete 5 arquivos + limpeza de `app-sidebar`; ⌘K morre com o `command-palette`). ✓
- Visual A (pill ativo, badges cor-de-sistema, header esquerda + tag + stamp) → Tasks 3, 5, 2. ✓
- Footer barra de identidade (inline + popover recolhido, role coral) → Task 6. ✓
- IA esquema 2 → Task 1. ✓
- Remover stagger → Task 4. ✓
- `requiresManageUsers` removido / Notificações omitido → Task 1. ✓
- Verificação (check-types/check/test/build/smoke) → Task 7 + steps por task. ✓

**Placeholder scan:** sem TBD/TODO; todo step de código tem o código real. ✓

**Type consistency:** `NavItemConfig` sem `requiresManageUsers` (Task 1) é consumido por `NavItem`/`NavGroup`/`AppSidebar` que não usam esse campo. `useSidebar().state` (Task 6) confere com o export verificado em `sidebar.tsx`. `BadgeKey`/`DashboardCounts` inalterados. `getSidebarProfileHref`/`FooterUser` preservados. ✓
