"use client";

import { SidebarMenuBadge } from "@emach/ui/components/sidebar";
import { use } from "react";
import type { DashboardCounts } from "../pending-data";
import type { BadgeKey } from "./nav-config";

// Mapeia a chave do badge da nav para o campo de DashboardCounts.
// "users" → pendingUsers; as demais batem 1:1.
const FIELD_BY_BADGE: Record<BadgeKey, keyof DashboardCounts> = {
	orders: "orders",
	picking: "picking",
	reviews: "reviews",
	stock: "stock",
	users: "pendingUsers",
};

// Consome a promise de counts sob <Suspense> (use()): a casca da nav renderiza
// imediatamente e o número do badge aparece quando a query resolve. Fallback do
// Suspense é null — sem badge até resolver, sem layout shift (o pill é inline).
export function NavBadge({
	countsPromise,
	badgeKey,
}: {
	countsPromise: Promise<DashboardCounts>;
	badgeKey: BadgeKey;
}) {
	const counts = use(countsPromise);
	const value = counts[FIELD_BY_BADGE[badgeKey]];
	if (value <= 0) {
		return null;
	}
	return (
		<SidebarMenuBadge className="bg-secondary text-secondary-foreground peer-data-active/menu-button:text-secondary-foreground">
			{value}
		</SidebarMenuBadge>
	);
}
