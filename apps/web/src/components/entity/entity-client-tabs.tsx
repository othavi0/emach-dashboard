"use client";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { usePathname, useSearchParams } from "next/navigation";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { buildTabHref } from "./tab-url";

const TabActiveContext = createContext<string>("");
const TabSetActiveContext = createContext<(tab: string) => void>(() => {
	// no-op fora do provider (ex: render isolado em teste)
});

export function useActiveTab(): string {
	return useContext(TabActiveContext);
}

/**
 * Setter da tab ativa exposto pelo shell client. Atalhos in-content (ex: "Ver
 * aba →" no overview) usam isto para trocar de tab sem disparar RSC.
 */
export function useSetActiveTab(): (tab: string) => void {
	return useContext(TabSetActiveContext);
}

export interface EntityClientTab {
	badge?: ReactNode;
	content: ReactNode;
	icon?: ReactNode;
	label: ReactNode;
	lazy?: boolean;
	value: string;
}

interface Props {
	clearParams?: string[];
	defaultValue: string;
	header: ReactNode;
	initialTab: string;
	paramName?: string;
	tabs: EntityClientTab[];
}

export function EntityClientTabs({
	clearParams,
	defaultValue,
	header,
	initialTab,
	paramName = "tab",
	tabs,
}: Props) {
	const pathname = usePathname();
	const params = useSearchParams();
	const [active, setActive] = useState(initialTab);
	const [activated, setActivated] = useState<Set<string>>(
		() => new Set([initialTab])
	);

	const activate = (next: string) => {
		setActivated((prev) => {
			if (prev.has(next)) {
				return prev;
			}
			const updated = new Set(prev);
			updated.add(next);
			return updated;
		});
	};

	const handleChange = (next: string) => {
		setActive(next);
		activate(next);
		const href = buildTabHref(
			pathname,
			new URLSearchParams(params),
			next,
			defaultValue,
			paramName,
			clearParams
		);
		window.history.replaceState(null, "", href);
	};

	useEffect(() => {
		const onPop = () => {
			const tab =
				new URLSearchParams(window.location.search).get(paramName) ??
				defaultValue;
			setActive(tab);
			activate(tab);
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, [defaultValue, paramName]);

	return (
		<TabActiveContext.Provider value={active}>
			<TabSetActiveContext.Provider value={handleChange}>
				<div className="flex flex-col gap-4">
					{header}
					<Tabs className="w-full" onValueChange={handleChange} value={active}>
						<TabsList className="w-full justify-start" scrollable>
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
								className="mt-4"
								keepMounted
								key={tab.value}
								value={tab.value}
							>
								{tab.lazy && !activated.has(tab.value) ? null : tab.content}
							</TabsContent>
						))}
					</Tabs>
				</div>
			</TabSetActiveContext.Provider>
		</TabActiveContext.Provider>
	);
}
