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
import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deletePromotion } from "../actions";

interface DeletePromotionDialogProps {
	promotionId: string;
	promotionTitle: string;
}

export function DeletePromotionDialog({
	promotionId,
	promotionTitle,
}: DeletePromotionDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deletePromotion(promotionId);
			if (result.ok) {
				toast.success("Promoção removida");
				setOpen(false);
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível remover a promoção");
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>
				Deletar
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Deletar &lsquo;{promotionTitle}&rsquo;?
					</AlertDialogTitle>
					<AlertDialogDescription>
						Esta ação não pode ser desfeita.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending}
						onClick={(e: React.MouseEvent) => {
							e.preventDefault();
							handleConfirm();
						}}
					>
						{isPending ? (
							<>
								<Spinner /> Removendo…
							</>
						) : (
							"Deletar"
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
