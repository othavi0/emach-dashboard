"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Polling leve: router.refresh() em intervalo, só com a aba visível.
 * Usado na fila de separação e no detalhe do pedido (spec 2026-07-06).
 * NÃO usar na execução de picking (o scan já revalida).
 */
export function AutoRefresh({ intervalMs = 45_000 }: { intervalMs?: number }) {
	const router = useRouter();

	useEffect(() => {
		const id = setInterval(() => {
			if (document.visibilityState === "visible") {
				router.refresh();
			}
		}, intervalMs);
		return () => clearInterval(id);
	}, [intervalMs, router]);

	return null;
}
