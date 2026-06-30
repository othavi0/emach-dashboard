"use client";

import type { ReactNode } from "react";
import { useSetActiveTab } from "./entity-client-tabs";

interface Props {
	children: ReactNode;
	className?: string;
	tab: string;
}

/**
 * Envolve um card de KPI num botão que troca a tab ativa do EntityClientTabs
 * client-side (via useSetActiveTab → history.replaceState), sem disparar RSC.
 */
export function KpiSwitchTabLink({ children, className, tab }: Props) {
	const setActiveTab = useSetActiveTab();
	return (
		<button
			className={className}
			onClick={() => setActiveTab(tab)}
			type="button"
		>
			{children}
		</button>
	);
}
