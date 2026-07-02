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
import { Button, buttonVariants } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useActiveTab } from "@/components/entity/entity-client-tabs";
import { notify } from "@/lib/notify";
import { deleteCategory, toggleCategoryActive } from "../../actions";

interface Props {
	canDelete: boolean;
	canManage: boolean;
	categoryId: string;
	categoryName: string;
	isActive: boolean;
}

/**
 * Ação primária (Editar / Nova subcategoria) muda conforme a tab ativa —
 * vem do contexto client do EntityClientTabs (sem re-render do servidor).
 * Ativar/desativar e excluir seguem visíveis em qualquer tab.
 */
export function CategoryDetailActions({
	canDelete,
	canManage,
	categoryId,
	categoryName,
	isActive,
}: Props) {
	const router = useRouter();
	const tab = useActiveTab();
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
			{canManage && tab === "subcategorias" && (
				<Link
					className={buttonVariants({ variant: "default" })}
					href={`/dashboard/categories/new?parent=${categoryId}`}
				>
					<Plus aria-hidden className="size-4" />
					Nova subcategoria
				</Link>
			)}
			{canManage && tab === "visao-geral" && (
				<Link
					className={buttonVariants({ variant: "default" })}
					href={`/dashboard/categories/${categoryId}/edit`}
				>
					<Pencil aria-hidden className="size-4" />
					Editar
				</Link>
			)}
			{canManage && (
				<Button
					disabled={togglePending}
					onClick={handleToggle}
					type="button"
					variant="outline"
				>
					{togglePending ? (
						<Spinner />
					) : (
						<Power aria-hidden className="size-4" />
					)}
					{isActive ? "Desativar" : "Ativar"}
				</Button>
			)}
			{canDelete && (
				<Button
					onClick={() => setConfirmOpen(true)}
					type="button"
					variant="destructive"
				>
					<Trash2 aria-hidden className="size-4" />
					Excluir
				</Button>
			)}

			{canDelete && (
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
			)}
		</>
	);
}
