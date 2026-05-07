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

import { deleteCategory } from "../actions";

interface DeleteCategoryDialogProps {
	categoryId: string;
	categoryName: string;
}

export function DeleteCategoryDialog({
	categoryId,
	categoryName,
}: DeleteCategoryDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deleteCategory(categoryId);
			if (result.ok) {
				toast.success("Categoria removida");
				setOpen(false);
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível remover a categoria");
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				aria-label={`Remover categoria ${categoryName}`}
				render={<Button size="icon-sm" variant="destructive" />}
			>
				<Trash2 aria-hidden className="size-3.5" />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Remover categoria <strong>{categoryName}</strong>?
					</AlertDialogTitle>
					<AlertDialogDescription>
						Esta ação não pode ser desfeita. Categorias com subcategorias ou
						ferramentas vinculadas não podem ser removidas.
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
