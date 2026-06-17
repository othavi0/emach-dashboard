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

import type { Capability } from "@/lib/permissions";
import { CommandPalette } from "./command-palette";
import { DASHBOARD_HREF, NAV_GROUPS } from "./nav-config";
import { NavGroup } from "./nav-group";
import { type FooterUser, SidebarFooterUser } from "./sidebar-footer-user";

interface AppSidebarProps {
	canManageUsers: boolean;
	capabilities: Capability[];
	orderCount: number;
	pendingCount: number;
	reviewCount: number;
	stockCount: number;
	user: FooterUser | null | undefined;
}

export function AppSidebar({
	canManageUsers,
	capabilities,
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
		// Não renderiza grupo cujos itens visíveis são todos inacessíveis
		// (vazio) ou meros placeholders desabilitados (ex: "Notificações").
		.filter((g) => g.items.some((item) => !item.disabled));

	return (
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
				<CommandPalette
					canManageUsers={canManageUsers}
					onOpenChange={setCommandOpen}
					open={commandOpen}
				/>
			</SidebarHeader>

			<SidebarContent>
				{groups.map((group) => (
					<NavGroup badges={badges} group={group} key={group.label} />
				))}
			</SidebarContent>

			<SidebarFooter>{user && <SidebarFooterUser user={user} />}</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
