"use client";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@emach/ui/components/sidebar";
import { Skeleton } from "@emach/ui/components/skeleton";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

interface NavItem {
	disabled?: boolean;
	exact?: boolean;
	href: Route;
	label: string;
}

interface NavGroup {
	items: NavItem[];
	label: string;
}

const DASHBOARD_HREF = "/dashboard" as Route;

const NAV_GROUPS: NavGroup[] = [
	{
		label: "Estoque",
		items: [
			{
				label: "Estoque Geral",
				href: "/dashboard/stock" as Route,
				exact: true,
			},
			{
				label: "Estoque por Filiais",
				href: "/dashboard/stock/branches" as Route,
			},
		],
	},
	{
		label: "Vendas",
		items: [
			{ label: "Pedidos", href: "/dashboard/orders" as Route },
			{ label: "Avaliações", href: "/dashboard/reviews" as Route },
		],
	},
	{
		label: "Site",
		items: [
			{
				label: "Promoções",
				href: "/dashboard/promotions" as Route,
			},
			{
				label: "Banners",
				href: "/dashboard/site/banners" as Route,
				disabled: true,
			},
			{
				label: "Configurações",
				href: "/dashboard/site/settings" as Route,
				disabled: true,
			},
		],
	},
	{
		label: "Catálogo",
		items: [
			{ label: "Ferramentas", href: "/dashboard/tools" as Route },
			{
				label: "Atributos",
				href: "/dashboard/attributes" as Route,
			},
			{
				label: "Categorias",
				href: "/dashboard/categories" as Route,
			},
			{
				label: "Fornecedores",
				href: "/dashboard/suppliers" as Route,
			},
			{
				label: "Filiais",
				href: "/dashboard/branches" as Route,
			},
		],
	},
];

function isActive(
	pathname: string,
	item: Pick<NavItem, "exact" | "href">
): boolean {
	const href = item.href;
	if (href === DASHBOARD_HREF) {
		return pathname === DASHBOARD_HREF;
	}
	if (item.exact) {
		return pathname === href;
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}

type FooterUser = { name: string; email: string } | null | undefined;

function FooterContent({
	isPending,
	isSigningOut,
	user,
	onSignOut,
}: {
	isPending: boolean;
	isSigningOut: boolean;
	user: FooterUser;
	onSignOut: () => Promise<void>;
}) {
	if (isPending) {
		return (
			<div className="flex flex-col gap-2 px-2 py-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-40" />
			</div>
		);
	}

	if (!user) {
		return null;
	}

	return (
		<div className="flex flex-col gap-3 px-2 py-2">
			<div>
				<p className="font-medium text-sm">{user.name}</p>
				<p className="text-muted-foreground text-xs">{user.email}</p>
			</div>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton
						aria-disabled={isSigningOut}
						disabled={isSigningOut}
						onClick={() => {
							onSignOut().catch(() => undefined);
						}}
						render={
							<button type="button">
								{isSigningOut ? "Saindo..." : "Sair"}
							</button>
						}
					/>
				</SidebarMenuItem>
			</SidebarMenu>
		</div>
	);
}

export function AppSidebar() {
	const pathname = usePathname();
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();
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
		<Sidebar collapsible="offcanvas">
			<SidebarHeader>
				<Link
					aria-label="Emach — ir para o dashboard"
					className="flex items-center justify-center px-2 py-2"
					href={DASHBOARD_HREF}
				>
					<Image
						alt="Emach"
						className="h-7 w-auto"
						height={56}
						priority
						src="/emach-nome-branco.svg"
						width={224}
					/>
				</Link>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isActive(pathname, { href: DASHBOARD_HREF })}
									render={<Link href={DASHBOARD_HREF}>Dashboard</Link>}
								/>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				{NAV_GROUPS.map((group) => (
					<SidebarGroup key={group.label}>
						<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{group.items.map((item) =>
									item.disabled ? (
										<SidebarMenuItem key={item.href}>
											<div
												aria-disabled="true"
												className="flex h-8 w-full items-center gap-2 rounded-md p-2 text-left text-xs opacity-50"
											>
												<span>{item.label}</span>
												<span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wide">
													em breve
												</span>
											</div>
										</SidebarMenuItem>
									) : (
										<SidebarMenuItem key={item.href}>
											<SidebarMenuButton
												isActive={isActive(pathname, item)}
												render={<Link href={item.href}>{item.label}</Link>}
											/>
										</SidebarMenuItem>
									)
								)}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>

			<SidebarFooter>
				<FooterContent
					isPending={isPending}
					isSigningOut={isSigningOut}
					onSignOut={handleSignOut}
					user={session?.user}
				/>
			</SidebarFooter>
		</Sidebar>
	);
}
