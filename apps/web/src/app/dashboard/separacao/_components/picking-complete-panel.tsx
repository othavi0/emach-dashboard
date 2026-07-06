"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { updateOrderStatus } from "../../orders/actions";

interface PickingCompletePanelProps {
	canShip: boolean;
	orderId: string;
	pickedUnits: number;
	totalUnits: number;
}

export function PickingCompletePanel({
	canShip,
	orderId,
	pickedUnits,
	totalUnits,
}: PickingCompletePanelProps) {
	const router = useRouter();
	const [trackingCode, setTrackingCode] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleShip() {
		startTransition(async () => {
			const result = await updateOrderStatus({
				orderId,
				toStatus: "shipped",
				trackingCode: trackingCode.trim(),
			});
			if (result.ok) {
				notify.success("Pedido despachado");
				router.push("/dashboard/separacao");
			} else {
				notify.error(result.error);
			}
		});
	}

	return (
		<div className="rounded-xl border border-success/40 bg-card p-6">
			<p className="flex items-center gap-2 font-medium text-lg text-success">
				<CheckIcon aria-hidden className="size-5" strokeWidth={2.6} />
				Separação concluída
			</p>
			<p className="mt-1 text-[13px] text-muted-foreground">
				{pickedUnits} de {totalUnits} unidades conferidas. O pedido está
				&quot;Separado — pronto pra envio&quot;.
			</p>

			{canShip && (
				<div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
					<p className="font-medium text-sm">Despachar agora (opcional)</p>
					<div className="mt-2 flex gap-2">
						<Input
							onChange={(e) => setTrackingCode(e.target.value)}
							placeholder="Código de rastreio — ex: BR123456789"
							value={trackingCode}
						/>
						<Button
							disabled={isPending || !trackingCode.trim()}
							onClick={handleShip}
						>
							{isPending ? "Enviando…" : "Marcar como Enviado"}
						</Button>
					</div>
				</div>
			)}

			<div className="mt-4 flex items-center gap-3">
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					Voltar à fila
				</Link>
				<span className="text-muted-foreground text-xs">
					dá pra despachar depois pelo detalhe do pedido
				</span>
			</div>
		</div>
	);
}
