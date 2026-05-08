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
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deletePromotion } from "../actions";

interface DeletePromotionDialogProps {
	controlled?: { open: boolean; onOpenChange: (next: boolean) => void };
	promotionId: string;
	promotionTitle: string;
}

export function DeletePromotionDialog({
	promotionId,
	promotionTitle,
	controlled,
}: DeletePromotionDialogProps) {
	const router = useRouter();
	const [internalOpen, setInternalOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const open = controlled ? controlled.open : internalOpen;
	const setOpen = controlled ? controlled.onOpenChange : setInternalOpen;

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
			{!controlled && (
				<AlertDialogTrigger
					aria-label={`Remover promoção ${promotionTitle}`}
					render={<Button size="icon-sm" variant="destructive" />}
				>
					<Trash2 aria-hidden className="size-3.5" />
				</AlertDialogTrigger>
			)}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Remover &lsquo;{promotionTitle}&rsquo;?
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
							"Remover"
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
