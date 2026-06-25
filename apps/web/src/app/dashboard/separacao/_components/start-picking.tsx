"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { notify } from "@/lib/notify";
import { startPicking } from "../actions";

interface StartPickingProps {
	orderId: string;
}

export function StartPicking({ orderId }: StartPickingProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	function handleStart() {
		startTransition(async () => {
			const result = await startPicking(orderId);
			if (result.ok) {
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	}

	return (
		<div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
			<p className="text-muted-foreground text-sm">
				Nenhuma separação em andamento para este pedido.
			</p>
			<button
				className="rounded-lg bg-primary px-6 py-3 font-semibold text-[14px] text-primary-foreground disabled:opacity-50"
				disabled={isPending}
				onClick={handleStart}
				type="button"
			>
				{isPending ? "Iniciando…" : "Iniciar separação"}
			</button>
		</div>
	);
}
