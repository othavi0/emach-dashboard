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
import { Archive, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { resolveToolDeletion } from "../_lib/tool-deletion";
import { archiveTool, deleteTool } from "../actions";
import type { ToolDeletionFacts } from "../data";

interface DeleteToolDialogProps {
	facts: ToolDeletionFacts;
	isArchived: boolean;
	toolId: string;
	toolName: string;
}

export function DeleteToolDialog({
	facts,
	isArchived,
	toolId,
	toolName,
}: DeleteToolDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const decision = resolveToolDeletion(facts);

	function handleDelete() {
		startTransition(async () => {
			const result = await deleteTool(toolId);
			if (result.ok) {
				notify.success("Ferramenta removida");
				setOpen(false);
				router.push("/dashboard/tools");
				router.refresh();
				return;
			}
			notify.error(result.error);
		});
	}

	function handleArchive() {
		startTransition(async () => {
			const result = await archiveTool(toolId);
			if (result.ok) {
				notify.success("Ferramenta arquivada");
				setOpen(false);
				router.refresh();
				return;
			}
			notify.error(result.error);
		});
	}

	const stockNote =
		facts.stockQty > 0
			? `Ainda há ${facts.stockQty} un em ${facts.stockBranchCount} ${
					facts.stockBranchCount > 1 ? "filiais" : "filial"
				} — o estoque não será alterado.`
			: null;

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				aria-label={`Excluir ferramenta ${toolName}`}
				render={<Button size="sm" variant="outline" />}
			>
				<Trash2 aria-hidden className="mr-1.5 size-3.5" />
				Excluir ferramenta
			</AlertDialogTrigger>
			<AlertDialogContent>
				{decision.allowed ? (
					<>
						<AlertDialogHeader>
							<AlertDialogTitle>Remover ferramenta?</AlertDialogTitle>
							<AlertDialogDescription>
								Esta ação não pode ser desfeita. A ferramenta{" "}
								<strong>{toolName}</strong> será removida permanentemente do
								sistema.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={isPending}>
								Cancelar
							</AlertDialogCancel>
							<AlertDialogAction
								disabled={isPending}
								onClick={(e) => {
									e.preventDefault();
									handleDelete();
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
					</>
				) : (
					<>
						<AlertDialogHeader>
							<AlertDialogTitle>Não é possível excluir</AlertDialogTitle>
							<AlertDialogDescription>
								{decision.reason}
								{isArchived
									? " Esta ferramenta já está arquivada."
									: " Você pode arquivá-la: ela sai da listagem e do site, e nada é perdido."}
								{stockNote ? ` ${stockNote}` : ""}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={isPending}>Fechar</AlertDialogCancel>
							{decision.suggestArchive && !isArchived ? (
								<AlertDialogAction
									disabled={isPending}
									onClick={(e) => {
										e.preventDefault();
										handleArchive();
									}}
								>
									{isPending ? (
										<>
											<Spinner /> Arquivando…
										</>
									) : (
										<>
											<Archive aria-hidden className="mr-1.5 size-3.5" />
											Arquivar ferramenta
										</>
									)}
								</AlertDialogAction>
							) : null}
						</AlertDialogFooter>
					</>
				)}
			</AlertDialogContent>
		</AlertDialog>
	);
}
