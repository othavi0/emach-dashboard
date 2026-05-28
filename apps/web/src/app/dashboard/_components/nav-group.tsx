"use client";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
} from "@emach/ui/components/sidebar";
import { m, useReducedMotion } from "motion/react";
import type { BadgeKey, NavGroupConfig } from "./nav-config";
import { NavItem } from "./nav-item";

export function NavGroup({
	group,
	badges,
}: {
	group: NavGroupConfig;
	badges: Partial<Record<BadgeKey, number>>;
}) {
	const reduce = useReducedMotion();

	return (
		<SidebarGroup>
			<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
			<SidebarGroupContent>
				<SidebarMenu>
					{group.items.map((item, index) => (
						<m.div
							key={item.href}
							initial={reduce ? false : { opacity: 0, x: -6 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{
								duration: 0.18,
								ease: "easeOut",
								delay: reduce ? 0 : index * 0.025,
							}}
						>
							<NavItem
								item={item}
								badgeCount={item.badgeKey ? badges[item.badgeKey] : undefined}
							/>
						</m.div>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
