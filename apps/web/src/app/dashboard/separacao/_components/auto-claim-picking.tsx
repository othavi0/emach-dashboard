"use client";

import { buttonVariants } from "@emach/ui/components/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { notify } from "@/lib/notify";
import { startPicking } from "../actions";

export interface PickingExceptionContext {
	pickerName: string;
	reason: string | null;
}

interface AutoClaimPickingProps {
	canStart: boolean;
	exceptionContext?: PickingExceptionContext | null;
	orderId: string;
}

/**
 * Substitui a tela legada "Iniciar separação": claima no mount (1×) e deixa o
 * RSC re-renderizar em PickingExecution. Bloqueio de posse de exceção só
 * mostra mensagem — sem botão e sem loop.
 */
export function AutoClaimPicking({
	canStart,
	exceptionContext,
	orderId,
}: AutoClaimPickingProps) {
	const router = useRouter();
	const firedRef = useRef(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!canStart || firedRef.current) {
			return;
		}
		firedRef.current = true;

		// fire-and-forget no mount; firedRef evita double-fire do Strict Mode
		async function claim() {
			const result = await startPicking(orderId);
			if (result.ok) {
				router.refresh();
				return;
			}
			setError(result.error);
			notify.error(result.error);
		}
		claim();
	}, [canStart, orderId, router]);

	if (!canStart) {
		return (
			<div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
				{exceptionContext && (
					<div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
						<p className="font-medium text-warning">
							Separação anterior terminou com exceção
						</p>
						<p className="mt-1 text-muted-foreground">
							{exceptionContext.reason ?? "Item não encontrado"} — por{" "}
							{exceptionContext.pickerName}. Para reembolsar, use o detalhe do
							pedido.
						</p>
					</div>
				)}
				<p className="text-muted-foreground text-sm">
					Somente {exceptionContext?.pickerName ?? "o operador original"} ou um
					admin pode reabrir esta separação.
				</p>
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					Voltar à fila
				</Link>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
				<p className="text-destructive text-sm">{error}</p>
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					Voltar à fila
				</Link>
			</div>
		);
	}

	return (
		<div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
			<p className="font-medium text-sm">
				{exceptionContext ? "Reabrindo separação…" : "Iniciando separação…"}
			</p>
			{exceptionContext && (
				<p className="max-w-md text-center text-muted-foreground text-sm">
					Exceção anterior: {exceptionContext.reason ?? "Item não encontrado"} —
					por {exceptionContext.pickerName}.
				</p>
			)}
		</div>
	);
}
