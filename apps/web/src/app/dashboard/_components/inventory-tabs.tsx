"use client";

import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TOOLS_HREF = "/dashboard/tools" as Route;
const STOCK_HREF = "/dashboard/stock" as Route;

function resolveActiveTab(pathname: string): string {
	if (pathname.startsWith("/dashboard/stock")) {
		return "stock";
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
					render={<Link href={STOCK_HREF}>Estoque</Link>}
					value="stock"
				/>
				<TabsTrigger
					aria-disabled="true"
					disabled
					tabIndex={-1}
					value="promotions"
				>
					Promoções
				</TabsTrigger>
			</TabsList>
		</Tabs>
	);
}
