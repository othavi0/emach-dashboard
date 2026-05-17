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
import { toast } from "sonner";
import { updateOrderStatus } from "../actions";

interface RefundDialogProps {
	orderId: string;
}

export function RefundDialog({ orderId }: RefundDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await updateOrderStatus({
				orderId,
				toStatus: "refunded",
				reason: reason.trim() || undefined,
			});
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success("Pedido reembolsado");
			setOpen(false);
			router.refresh();
		});
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger render={<Button variant="outline" />}>
				Marcar como reembolsado
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Reembolsar pedido</DialogTitle>
					<DialogDescription>
						Encerramento financeiro do pedido. Não altera estoque — a devolução
						física é registrada à parte pelo estado "Devolvido".
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="refund-reason"
					>
						Motivo interno
					</label>
					<Textarea
						id="refund-reason"
						onChange={(event) => setReason(event.target.value)}
						placeholder="Ex: estorno integral solicitado pelo cliente."
						value={reason}
					/>
				</div>

				<DialogFooter>
					<Button
						disabled={isPending}
						onClick={() => setOpen(false)}
						variant="ghost"
					>
						Cancelar
					</Button>
					<Button
						disabled={isPending}
						onClick={handleConfirm}
						variant="default"
					>
						{isPending ? (
							<>
								<Spinner /> Salvando…
							</>
						) : (
							"Confirmar reembolso"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
