"use client";

import type { ReactNode } from "react";
import { useSetActiveTab } from "./entity-client-tabs";

interface SwitchTabButtonProps {
	children: ReactNode;
	className?: string;
	tab: string;
}

/**
 * Atalho in-content que troca a tab ativa do EntityClientTabs client-side (via
 * useSetActiveTab → history.replaceState), sem disparar RSC como faria um
 * <Link href="?tab=...">. Serve tanto para "Ver tudo →" em cards de overview
 * quanto para envolver cards de KPI clicáveis.
 */
export function SwitchTabButton({
	children,
	className,
	tab,
}: SwitchTabButtonProps) {
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
