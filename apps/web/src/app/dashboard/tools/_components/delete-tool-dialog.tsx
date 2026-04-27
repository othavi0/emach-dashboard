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

import { deleteTool } from "../actions";

interface DeleteToolDialogProps {
	toolId: string;
	toolName: string;
}

export function DeleteToolDialog({ toolId, toolName }: DeleteToolDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deleteTool(toolId);
			if (result.ok) {
				toast.success("Ferramenta removida");
				setOpen(false);
				router.push("/dashboard/tools");
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível remover a ferramenta");
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>
				Remover
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remover ferramenta?</AlertDialogTitle>
					<AlertDialogDescription>
						Esta ação não pode ser desfeita. A ferramenta{" "}
						<strong>{toolName}</strong> será removida permanentemente do sistema
						e seus estoques por filial também.
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
