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
