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

import { deleteSupplier } from "../actions";

interface DeleteSupplierDialogProps {
	supplierId: string;
	supplierName: string;
}

export function DeleteSupplierDialog({
	supplierId,
	supplierName,
}: DeleteSupplierDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deleteSupplier(supplierId);
			if (result.ok) {
				toast.success("Fornecedor removido");
				setOpen(false);
				router.push("/dashboard/suppliers");
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível remover o fornecedor");
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				aria-label={`Remover fornecedor ${supplierName}`}
				render={<Button size="icon-sm" variant="destructive" />}
			>
				<Trash2 aria-hidden className="size-3.5" />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Remover fornecedor <strong>{supplierName}</strong>?
					</AlertDialogTitle>
					<AlertDialogDescription>
						Esta ação não pode ser desfeita. As ferramentas vinculadas serão
						mantidas, mas ficarão sem fornecedor definido.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending}
						onClick={(event) => {
							event.preventDefault();
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
