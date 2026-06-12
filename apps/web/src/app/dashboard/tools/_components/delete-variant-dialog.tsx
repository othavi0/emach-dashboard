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

import { deleteToolVariant } from "../actions";

interface DeleteVariantDialogProps {
	variantId: string;
	variantSku: string;
}

export function DeleteVariantDialog({
	variantId,
	variantSku,
}: DeleteVariantDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deleteToolVariant({ variantId });
			if (result.ok) {
				const reassigned = result.data.reassignedDefaultSku;
				toast.success(
					reassigned
						? `Variante excluída. Padrão reatribuída para ${reassigned}.`
						: "Variante excluída"
				);
				setOpen(false);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				aria-label={`Excluir variante ${variantSku}`}
				render={<Button size="icon-sm" variant="ghost" />}
			>
				<Trash2 aria-hidden className="size-3.5 text-destructive" />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Excluir variante?</AlertDialogTitle>
					<AlertDialogDescription>
						A variante <strong>{variantSku}</strong> e seus estoques por filial
						serão removidos permanentemente. Esta ação não pode ser desfeita.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending}
						onClick={(e) => {
							e.preventDefault();
							handleConfirm();
						}}
					>
						{isPending ? (
							<>
								<Spinner /> Excluindo…
							</>
						) : (
							"Excluir"
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
