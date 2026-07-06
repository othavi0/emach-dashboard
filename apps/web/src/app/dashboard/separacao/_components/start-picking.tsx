"use client";

import { Button } from "@emach/ui/components/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { notify } from "@/lib/notify";
import { startPicking } from "../actions";

export interface PickingExceptionContext {
	pickerName: string;
	reason: string | null;
}

interface StartPickingProps {
	exceptionContext?: PickingExceptionContext | null;
	orderId: string;
}

function getStartLabel(isPending: boolean, isReopen: boolean): string {
	if (isPending) {
		return isReopen ? "Reabrindo…" : "Iniciando…";
	}
	return isReopen ? "Reabrir separação" : "Iniciar separação";
}

export function StartPicking({ exceptionContext, orderId }: StartPickingProps) {
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
			{exceptionContext && (
				<div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
					<p className="font-medium text-warning">
						Separação anterior terminou com exceção
					</p>
					<p className="mt-1 text-muted-foreground">
						{exceptionContext.reason ?? "Item não encontrado"} — por{" "}
						{exceptionContext.pickerName}. Reabrir cria uma nova sessão do zero;
						para reembolsar, use o detalhe do pedido.
					</p>
				</div>
			)}
			<Button disabled={isPending} onClick={handleStart} size="lg">
				{getStartLabel(isPending, Boolean(exceptionContext))}
			</Button>
		</div>
	);
}
