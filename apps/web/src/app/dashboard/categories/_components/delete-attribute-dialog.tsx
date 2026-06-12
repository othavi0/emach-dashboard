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
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";

import { deleteCategoryAttribute } from "../_lib/attribute-actions";

interface DeleteAttributeDialogProps {
	attributeId: string;
	attributeLabel: string;
	categoryId: string;
	usageCount: number;
}

export function DeleteAttributeDialog({
	attributeId,
	attributeLabel,
	categoryId,
	usageCount,
}: DeleteAttributeDialogProps) {
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deleteCategoryAttribute(attributeId, categoryId);
			if (result.ok) {
				notify.success("Atributo removido");
				setOpen(false);
			} else {
				notify.error(result.error || "Não foi possível remover o atributo");
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				aria-label={`Remover atributo ${attributeLabel}`}
				render={<Button size="icon-sm" variant="destructive" />}
			>
				<Trash2 aria-hidden className="size-3.5" />
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
