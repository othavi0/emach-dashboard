"use client";

import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
} from "@emach/ui/components/sidebar";

export function AppSidebar() {
	return (
		<Sidebar collapsible="offcanvas">
			<SidebarHeader>
				<span className="px-2 font-serif text-lg">emach</span>
			</SidebarHeader>
			<SidebarContent />
		</Sidebar>
	);
}
