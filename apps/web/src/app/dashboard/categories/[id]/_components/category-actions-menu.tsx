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
} from "@emach/ui/components/alert-dialog";
import { Button } from "@emach/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import { Spinner } from "@emach/ui/components/spinner";
import { MoreHorizontal, Power, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { notify } from "@/lib/notify";
import { deleteCategory, toggleCategoryActive } from "../../actions";

interface Props {
	categoryId: string;
	categoryName: string;
	isActive: boolean;
}

export function CategoryActionsMenu({
	categoryId,
	categoryName,
	isActive,
}: Props) {
	const router = useRouter();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [togglePending, startToggle] = useTransition();
	const [deletePending, startDelete] = useTransition();

	function handleToggle() {
		startToggle(async () => {
			const result = await toggleCategoryActive(categoryId, !isActive);
			if (result.ok) {
				notify.success(isActive ? "Categoria desativada" : "Categoria ativada");
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	}

	function handleDelete() {
		startDelete(async () => {
			const result = await deleteCategory(categoryId);
			if (result.ok) {
				notify.success("Categoria removida");
				setConfirmOpen(false);
				router.push("/dashboard/categories");
			} else {
				notify.error(result.error || "Não foi possível remover a categoria");
			}
		});
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							aria-label="Mais ações"
							disabled={togglePending}
							size="icon"
							variant="outline"
						/>
					}
				>
					<MoreHorizontal aria-hidden className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-44">
					<DropdownMenuItem onClick={handleToggle}>
						<Power aria-hidden />
						{isActive ? "Desativar" : "Ativar"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="whitespace-nowrap"
						onClick={() => setConfirmOpen(true)}
						variant="destructive"
					>
						<Trash2 aria-hidden />
						Excluir categoria
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
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
						<AlertDialogCancel disabled={deletePending}>
							Cancelar
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={deletePending}
							onClick={(e) => {
								e.preventDefault();
								handleDelete();
							}}
						>
							{deletePending ? (
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
		</>
	);
}
