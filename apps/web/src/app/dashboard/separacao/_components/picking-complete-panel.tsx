"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { CheckIcon } from "lucide-react";
import Link from "next/link";

interface PickingCompletePanelProps {
	orderId: string;
	pickedUnits: number;
	totalUnits: number;
}

export function PickingCompletePanel({
	orderId,
	pickedUnits,
	totalUnits,
}: PickingCompletePanelProps) {
	return (
		<div className="rounded-xl border border-success/40 bg-card p-6">
			<p className="flex items-center gap-2 font-medium text-lg text-success">
				<CheckIcon aria-hidden className="size-5" strokeWidth={2.6} />
				Separação concluída
			</p>
			<p className="mt-1 text-[13px] text-muted-foreground">
				{`${pickedUnits} de ${totalUnits} unidades conferidas. O pedido está "Pronto para enviar".`}
			</p>

			<div className="mt-4 flex items-center gap-3">
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					Voltar à fila
				</Link>
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href={`/dashboard/orders/${orderId}`}
				>
					Ver pedido
				</Link>
			</div>
		</div>
	);
}
