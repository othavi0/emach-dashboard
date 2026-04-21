"use client";

import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TOOLS_HREF = "/dashboard/tools" as Route;
const STOCK_HREF = "/dashboard/stock" as Route;
const BRANCH_STOCK_HREF = "/dashboard/stock/branches" as Route;
const PROMOTIONS_HREF = "/dashboard/promotions" as Route;

function resolveActiveTab(pathname: string): string {
	if (pathname.startsWith("/dashboard/stock/branches")) {
		return "branch-stock";
	}
	if (pathname.startsWith("/dashboard/stock")) {
		return "stock-general";
	}
	if (pathname.startsWith("/dashboard/tools/") && pathname.endsWith("/stock")) {
		return "stock-general";
	}
	if (pathname.startsWith("/dashboard/promotions")) {
		return "promotions";
	}
	return "tools";
}

export function InventoryTabs() {
	const pathname = usePathname();
	const activeTab = resolveActiveTab(pathname);

	return (
		<Tabs value={activeTab}>
			<TabsList>
				<TabsTrigger
					nativeButton={false}
					render={<Link href={TOOLS_HREF}>Ferramentas</Link>}
					value="tools"
				/>
				<TabsTrigger
					nativeButton={false}
					render={<Link href={STOCK_HREF}>Estoque Geral</Link>}
					value="stock-general"
				/>
				<TabsTrigger
					nativeButton={false}
					render={<Link href={BRANCH_STOCK_HREF}>Estoque por Filiais</Link>}
					value="branch-stock"
				/>
				<TabsTrigger
					nativeButton={false}
					render={<Link href={PROMOTIONS_HREF}>Promoções</Link>}
					value="promotions"
				/>
			</TabsList>
		</Tabs>
	);
}
