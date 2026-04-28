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

import { deleteAttribute } from "../actions";

interface DeleteAttributeDialogProps {
	attributeId: string;
	attributeLabel: string;
	usageCount: number;
}

export function DeleteAttributeDialog({
	attributeId,
	attributeLabel,
	usageCount,
}: DeleteAttributeDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deleteAttribute(attributeId);
			if (result.ok) {
				toast.success("Atributo removido");
				setOpen(false);
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível remover o atributo");
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				render={
					<Button
						className="text-destructive hover:bg-destructive/10"
						size="sm"
						variant="ghost"
					/>
				}
			>
				Remover
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Remover atributo?</AlertDialogTitle>
					<AlertDialogDescription>
						O atributo <strong>{attributeLabel}</strong> será removido
						permanentemente.
						{usageCount > 0 ? (
							<>
								{" "}
								<strong>
									{usageCount === 1
										? "1 ferramenta usa este atributo"
										: `${usageCount} ferramentas usam este atributo`}
								</strong>
								. Os valores preenchidos nessas ferramentas também serão
								apagados (cascade).
							</>
						) : (
							" Nenhuma ferramenta usa este atributo no momento."
						)}{" "}
						Esta ação não pode ser desfeita.
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
