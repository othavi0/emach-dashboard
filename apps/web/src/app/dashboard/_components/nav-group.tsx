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
