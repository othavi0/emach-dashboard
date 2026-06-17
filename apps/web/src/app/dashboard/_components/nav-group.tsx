"use client";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
} from "@emach/ui/components/sidebar";
import type { BadgeKey, NavGroupConfig } from "./nav-config";
import { NavItem } from "./nav-item";

export function NavGroup({
	group,
	badges,
}: {
	group: NavGroupConfig;
	badges: Partial<Record<BadgeKey, number>>;
}) {
	return (
		<SidebarGroup>
			<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{group.items.map((item, index) => (
						<div
							className="nav-item-animate"
							key={item.href}
							style={{ animationDelay: `${index * 25}ms` }}
						>
							<NavItem
								badgeCount={item.badgeKey ? badges[item.badgeKey] : undefined}
								item={item}
							/>
						</div>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
