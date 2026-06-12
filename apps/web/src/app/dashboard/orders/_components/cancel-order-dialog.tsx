"use client";

import { Button } from "@emach/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@emach/ui/components/dialog";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { updateOrderStatus } from "../actions";

interface CancelOrderDialogProps {
	orderId: string;
}

export function CancelOrderDialog({ orderId }: CancelOrderDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		const trimmed = reason.trim();
		if (!trimmed) {
			notify.error("Informe o motivo do cancelamento");
			return;
		}
		startTransition(async () => {
			const result = await updateOrderStatus({
				orderId,
				toStatus: "canceled",
				reason: trimmed,
			});
			if (!result.ok) {
				notify.error(result.error);
				return;
			}
			notify.success("Pedido cancelado");
			setOpen(false);
			router.refresh();
		});
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger render={<Button variant="destructive" />}>
				Cancelar pedido
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Cancelar pedido</DialogTitle>
					<DialogDescription>
						O cancelamento é definitivo. Não há estoque a devolver — pedidos não
						pagos nunca consomem estoque.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="cancel-reason"
					>
						Motivo interno (obrigatório)
					</label>
					<Textarea
						id="cancel-reason"
						onChange={(event) => setReason(event.target.value)}
						placeholder="Ex: cliente desistiu, pagamento não confirmado…"
						value={reason}
					/>
				</div>

				<DialogFooter>
					<Button
						disabled={isPending}
						onClick={() => setOpen(false)}
						variant="ghost"
					>
						Fechar
					</Button>
					<Button
						disabled={isPending || !reason.trim()}
						onClick={handleConfirm}
						variant="destructive"
					>
						{isPending ? (
							<>
								<Spinner /> Salvando…
							</>
						) : (
							"Confirmar cancelamento"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
