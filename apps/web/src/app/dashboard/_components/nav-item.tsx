"use client";

import {
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@emach/ui/components/sidebar";
import { cn } from "@emach/ui/lib/utils";
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
					<Icon aria-hidden className="size-4 shrink-0" />
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
			{showBadge && (
				<SidebarMenuBadge className="bg-secondary text-secondary-foreground peer-data-active/menu-button:text-secondary-foreground">
					{badgeCount}
				</SidebarMenuBadge>
			)}
		</SidebarMenuItem>
	);
}
