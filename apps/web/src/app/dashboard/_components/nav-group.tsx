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
			<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{group.items.map((item, index) => (
						<div
							className="nav-item-animate"
							key={item.href}
							style={{ animationDelay: `${index * 25}ms` }}
						>
							<NavItem countsPromise={countsPromise} item={item} />
						</div>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
