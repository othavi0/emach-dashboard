"use client";

import { cn } from "@emach/ui/lib/utils";
import { stagger, useAnimate, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect } from "react";

// Entrada em cascata dos KPIs — roda UMA vez por sessão do navegador.
// Os filhos são renderizados visíveis por padrão (sem gatear opacity no SSR):
// se o JS não rodar, os KPIs aparecem normalmente. Na 1ª visita da sessão o
// reveal dispara via `animate`; nas seguintes (e sob prefers-reduced-motion)
// não há animação.
const SESSION_KEY = "dashboard-kpis-entered";

export function StaggerGrid({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const [scope, animate] = useAnimate();
	const reduce = useReducedMotion();

	useEffect(() => {
		if (sessionStorage.getItem(SESSION_KEY)) {
			return;
		}
		sessionStorage.setItem(SESSION_KEY, "1");
		if (reduce) {
			return;
		}
		const items = scope.current?.querySelectorAll("[data-stagger-item]");
		if (!items || items.length === 0) {
			return;
		}
		animate(
			items,
			{ opacity: [0, 1], y: [8, 0] },
			{ duration: 0.25, ease: "easeOut", delay: stagger(0.05) }
		);
	}, [animate, reduce, scope]);

	return (
		<div className={cn(className)} ref={scope}>
			{children}
		</div>
	);
}

export function StaggerItem({ children }: { children: ReactNode }) {
	return <div data-stagger-item>{children}</div>;
}
