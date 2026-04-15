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
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

interface NavItem {
	disabled?: boolean;
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
			{ label: "Ferramentas", href: "/dashboard/tools" as Route },
			{
				label: "Estoque por Filial",
				href: "/dashboard/stock" as Route,
				disabled: true,
			},
		],
	},
	{
		label: "Configurações",
		items: [
			{
				label: "Categorias",
				href: "/dashboard/categories" as Route,
				disabled: true,
			},
			{
				label: "Fornecedores",
				href: "/dashboard/suppliers" as Route,
				disabled: true,
			},
			{
				label: "Filiais",
				href: "/dashboard/branches" as Route,
			},
		],
	},
];

function isActive(pathname: string, href: string): boolean {
	if (href === DASHBOARD_HREF) {
		return pathname === DASHBOARD_HREF;
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}

type FooterUser = { name: string; email: string } | null | undefined;

function FooterContent({
	isPending,
	user,
	onSignOut,
}: {
	isPending: boolean;
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
		<div className="flex flex-col gap-2 px-2 py-2">
			<div>
				<p className="font-medium text-sm">{user.name}</p>
				<p className="text-muted-foreground text-xs">{user.email}</p>
			</div>
			<button
				className="w-full rounded bg-secondary px-3 py-1.5 text-left text-secondary-foreground text-sm hover:bg-accent"
				onClick={onSignOut}
				type="button"
			>
				Sair
			</button>
		</div>
	);
}

export function AppSidebar() {
	const pathname = usePathname();
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();

	const handleSignOut = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					router.replace("/login");
					router.refresh();
				},
			},
		});
	};

	return (
		<Sidebar collapsible="offcanvas">
			<SidebarHeader>
				<Link className="px-2 py-2 font-serif text-lg" href={DASHBOARD_HREF}>
					emach
				</Link>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isActive(pathname, DASHBOARD_HREF)}
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
												className="flex h-8 w-full items-center gap-2 rounded-none p-2 text-left text-xs opacity-50"
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
												isActive={isActive(pathname, item.href)}
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
					onSignOut={handleSignOut}
					user={session?.user}
				/>
			</SidebarFooter>
		</Sidebar>
	);
}
