"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Região aria-live que anuncia mudanças de rota para leitores de tela.
 * A barra de progresso visual é aria-hidden; este é o equivalente acessível.
 */
export function NavigationAnnouncer() {
	const pathname = usePathname();
	const [message, setMessage] = useState("");

	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname é a trigger intencional; o callback não a captura textualmente mas o effect deve re-executar a cada mudança de rota.
	useEffect(() => {
		// Limpa e re-seta para garantir que o SR releia mesmo navegações
		// repetidas. O clear vai num timeout(0) pra não setar estado síncrono
		// no corpo do effect (lint set-state-in-effect).
		const clearId = window.setTimeout(() => setMessage(""), 0);
		const id = window.setTimeout(() => setMessage("Página carregada"), 100);
		return () => {
			window.clearTimeout(clearId);
			window.clearTimeout(id);
		};
	}, [pathname]);

	return (
		// suppressHydrationWarning: com um Sheet/Dialog SSR-aberto (deep-link
		// ?newBox=1), o base-ui marca os elementos fora do dialog com
		// data-base-ui-inert via DOM ANTES deste boundary <Suspense> hidratar —
		// o atributo de terceiro dispara falso mismatch de hidratação.
		<span
			aria-live="polite"
			className="sr-only"
			role="status"
			suppressHydrationWarning
		>
			{message}
		</span>
	);
}
