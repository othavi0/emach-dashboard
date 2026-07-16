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

	// Separação carrega dois sinais distintos: "a separar" (workload, neutro) e
	// exceção travada (urgência, warning) — badge próprio. Dois pills num único
	// slot posicionado (SidebarMenuBadge é absolute) com a exceção à esquerda.
	if (badgeKey === "picking") {
		const awaiting = counts.picking;
		const exceptions = counts.pickingExceptions;
		if (awaiting <= 0 && exceptions <= 0) {
			return null;
		}
		return (
			<SidebarMenuBadge className="right-1 min-w-0 gap-1 bg-transparent px-0">
				{exceptions > 0 && (
					<span
						className="flex h-5 min-w-5 items-center justify-center rounded-md bg-warning/20 px-1 text-warning"
						title="Exceções na separação"
					>
						{exceptions}
					</span>
				)}
				{awaiting > 0 && (
					<span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 text-secondary-foreground peer-data-active/menu-button:text-secondary-foreground">
						{awaiting}
					</span>
				)}
			</SidebarMenuBadge>
		);
	}

	const value = counts[FIELD_BY_BADGE[badgeKey]];
	if (value <= 0) {
		return null;
	}
	const tone =
		badgeKey === "stock"
			? "bg-warning/20 text-warning"
			: "bg-secondary text-secondary-foreground peer-data-active/menu-button:text-secondary-foreground";
	return <SidebarMenuBadge className={tone}>{value}</SidebarMenuBadge>;
}
