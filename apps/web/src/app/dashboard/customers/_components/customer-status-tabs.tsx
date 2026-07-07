"use client";

import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import type { CustomerStatusCounts } from "../data";

const BASE = "/dashboard/customers";

const TABS = [
	{ key: "active", label: "Ativos" },
	{ key: "inactive_blocked", label: "Inativos / Bloqueados" },
] as const;

interface CustomerStatusTabsProps {
	counts: CustomerStatusCounts;
}

const QUICK_FILTER_KEYS = [
	"missingDoc",
	"openOrderInactive",
	"unverifiedNew",
] as const;

export function CustomerStatusTabs({ counts }: CustomerStatusTabsProps) {
	const searchParams = useSearchParams();
	// Espelha o default do server (page.tsx): sem ?status e sem quick-filter de
	// triagem, a tab "Ativos" é a ativa.
	const hasQuickFilter = QUICK_FILTER_KEYS.some((key) => searchParams.get(key));
	const current =
		searchParams.get("status") ?? (hasQuickFilter ? "" : "active");

	const hrefFor = (key: string) => {
		const next = new URLSearchParams(searchParams.toString());
		next.set("status", key);
		return `${BASE}?${next.toString()}`;
	};

	return (
		<Tabs value={current || "none"}>
			<TabsList>
				{TABS.map((tab) => {
					const count =
						tab.key === "active" ? counts.active : counts.inactiveBlocked;
					const isActive = current === tab.key;
					return (
						<TabsTrigger
							key={tab.key}
							nativeButton={false}
							render={<Link href={hrefFor(tab.key)} />}
							value={tab.key}
						>
							<span>{tab.label}</span>
							{(isActive || count > 0) && <TabsCountBadge value={count} />}
						</TabsTrigger>
					);
				})}
			</TabsList>
		</Tabs>
	);
}
