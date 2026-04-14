"use client";

import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TOOLS_HREF = "/dashboard/tools" as Route;
const STOCK_HREF = "/dashboard/stock" as Route;

function getActiveTab(pathname: string): "tools" | "stock" {
	if (pathname.startsWith(STOCK_HREF)) {
		return "stock";
	}
	return "tools";
}

export function InventoryTabs() {
	const pathname = usePathname();
	const active = getActiveTab(pathname);

	return (
		<Tabs value={active}>
			<TabsList>
				<TabsTrigger
					render={<Link href={TOOLS_HREF}>Ferramentas</Link>}
					value="tools"
				/>
				<TabsTrigger
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
