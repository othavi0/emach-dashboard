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
	/** Para onde navegar após excluir. Default: refresh na rota atual. */
	redirectTo?: string;
	/** "icon" = botão ícone (lista); "button" = botão com texto (detalhe). */
	variant?: "button" | "icon";
}

export function DeleteCategoryDialog({
	categoryId,
	categoryName,
	variant = "icon",
	redirectTo,
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
				if (redirectTo) {
					router.push(redirectTo);
				} else {
					router.refresh();
				}
			} else {
				toast.error(result.error || "Não foi possível remover a categoria");
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				aria-label={`Remover categoria ${categoryName}`}
				render={
					variant === "button" ? (
						<Button className="w-full" variant="destructive" />
					) : (
						<Button size="icon-sm" variant="destructive" />
					)
				}
			>
				{variant === "button" ? (
					<>
						<Trash2 aria-hidden className="size-3.5" /> Excluir categoria
					</>
				) : (
					<Trash2 aria-hidden className="size-3.5" />
				)}
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
