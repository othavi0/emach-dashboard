"use client";

import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
import type { Route } from "next";
import Link from "next/link";

const TOOLS_HREF = "/dashboard/tools" as Route;

export function InventoryTabs() {
	return (
		<Tabs value="tools">
			<TabsList>
				<TabsTrigger
					nativeButton={false}
					render={<Link href={TOOLS_HREF}>Ferramentas</Link>}
					value="tools"
				/>
				<TabsTrigger aria-disabled="true" disabled tabIndex={-1} value="stock">
					Estoque
				</TabsTrigger>
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
