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

import { deleteBranch } from "../actions";

interface DeleteBranchDialogProps {
	branchId: string;
	branchName: string;
}

export function DeleteBranchDialog({
	branchId,
	branchName,
}: DeleteBranchDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deleteBranch(branchId);
			if (result.ok) {
				toast.success("Filial removida");
				setOpen(false);
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível remover a filial");
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				aria-label={`Remover filial ${branchName}`}
				render={<Button size="icon-sm" variant="destructive" />}
			>
				<Trash2 aria-hidden className="size-3.5" />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Remover filial <strong>{branchName}</strong>?
					</AlertDialogTitle>
					<AlertDialogDescription>
						Esta ação não pode ser desfeita. Todos os níveis de estoque desta
						filial serão removidos. O histórico de movimentações será
						preservado, mas a filial aparecerá como "filial removida" nos
						registros antigos.
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
