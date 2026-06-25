"use client";

import { Button } from "@emach/ui/components/button";
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
			<Button disabled={isPending} onClick={handleStart} size="lg">
				{isPending ? "Iniciando…" : "Iniciar separação"}
			</Button>
		</div>
	);
}
