"use client";

import {
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@emach/ui/components/sidebar";
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
					<span className="group-data-[collapsible=icon]:hidden">
						{item.label}
					</span>
					<span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wide group-data-[collapsible=icon]:hidden">
						em breve
					</span>
				</div>
			</SidebarMenuItem>
		);
	}

	return (
		<SidebarMenuItem>
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
			{showBadge && <SidebarMenuBadge>{badgeCount}</SidebarMenuBadge>}
		</SidebarMenuItem>
	);
}
