"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@emach/ui/components/alert-dialog";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { updateOrderStatus } from "../../actions";

const MIN_REASON_LENGTH = 10;

interface ForceShipDialogProps {
	orderId: string;
	trackingCode: string;
}

export function ForceShipDialog({
	orderId,
	trackingCode,
}: ForceShipDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleConfirm(event: React.MouseEvent) {
		event.preventDefault();
		startTransition(async () => {
			const result = await updateOrderStatus({
				orderId,
				toStatus: "shipped",
				trackingCode: trackingCode || undefined,
				forceShip: true,
				forceReason: reason.trim(),
			});
			if (result.ok) {
				notify.success("Envio forçado registrado");
				setOpen(false);
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger className="text-destructive text-xs underline-offset-4 hover:underline">
				Forçar envio sem separação…
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Forçar envio sem separação</AlertDialogTitle>
					<AlertDialogDescription>
						O pedido será marcado como Enviado sem separação concluída. O motivo
						fica registrado no histórico do pedido. Requer código de rastreio
						preenchido acima.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Textarea
					onChange={(event) => setReason(event.target.value)}
					placeholder="Motivo operacional (mín. 10 caracteres)"
					rows={3}
					value={reason}
				/>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						disabled={
							reason.trim().length < MIN_REASON_LENGTH ||
							!trackingCode.trim() ||
							isPending
						}
						onClick={handleConfirm}
					>
						{isPending ? "Enviando…" : "Forçar envio"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
