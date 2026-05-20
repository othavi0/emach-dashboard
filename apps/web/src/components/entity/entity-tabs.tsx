"use client";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { cn } from "@emach/ui/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export interface EntityTab {
	badge?: ReactNode;
	content: ReactNode;
	icon?: ReactNode;
	label: ReactNode;
	value: string;
}

interface Props {
	className?: string;
	defaultValue: string;
	paramName?: string;
	tabs: EntityTab[];
}

export function EntityTabs({
	tabs,
	defaultValue,
	paramName = "tab",
	className,
}: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const current = params.get(paramName) ?? defaultValue;

	const handleChange = (next: string) => {
		const sp = new URLSearchParams(params);
		if (next === defaultValue) {
			sp.delete(paramName);
		} else {
			sp.set(paramName, next);
		}
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	return (
		<Tabs
			className={cn("w-full", className)}
			onValueChange={handleChange}
			value={current}
		>
			<TabsList className="w-full justify-start overflow-x-auto">
				{tabs.map((tab) => (
					<TabsTrigger
						className="flex items-center gap-1.5"
						key={tab.value}
						value={tab.value}
					>
						{tab.icon}
						{tab.label}
						{tab.badge}
					</TabsTrigger>
				))}
			</TabsList>
			{tabs.map((tab) => (
				<TabsContent
					className="mt-4 focus-visible:outline-none"
					key={tab.value}
					value={tab.value}
				>
					{tab.content}
				</TabsContent>
			))}
		</Tabs>
	);
}
