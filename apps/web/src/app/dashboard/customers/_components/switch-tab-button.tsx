"use client";

import type { ReactNode } from "react";
import { useSetActiveTab } from "@/components/entity/entity-client-tabs";

interface SwitchTabButtonProps {
	children: ReactNode;
	className?: string;
	tab: string;
}

/**
 * Atalho in-content que troca a tab ativa do EntityClientTabs client-side (via
 * useSetActiveTab → history.replaceState), sem disparar RSC como faria um
 * <Link href="?tab=...">. Usado no "Ver tudo" do card de últimos pedidos.
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
