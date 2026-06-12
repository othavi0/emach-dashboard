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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";

import { deleteTool } from "../actions";

interface DeleteToolDialogProps {
	disabledReason?: string | null;
	toolId: string;
	toolName: string;
	triggerLabel?: string;
}

export function DeleteToolDialog({
	toolId,
	toolName,
	triggerLabel,
	disabledReason,
}: DeleteToolDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await deleteTool(toolId);
			if (result.ok) {
				notify.success("Ferramenta removida");
				setOpen(false);
				router.push("/dashboard/tools");
				router.refresh();
			} else {
				const message =
					"error" in result
						? result.error
						: "Não foi possível remover a ferramenta";
				notify.error(message);
			}
		});
	}

	const triggerContent = triggerLabel ? (
		<>
			<Trash2 aria-hidden className="mr-1.5 size-3.5" />
			{triggerLabel}
		</>
	) : (
		<Trash2 aria-hidden className="size-3.5" />
	);

	if (disabledReason) {
		return (
			<TooltipProvider delay={200}>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button disabled size="sm" variant="outline">
								{triggerContent}
							</Button>
						}
					/>
					<TooltipContent>{disabledReason}</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	const triggerButton = triggerLabel ? (
		<Button size="sm" variant="outline" />
	) : (
		<Button size="icon-sm" variant="destructive" />
	);

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				aria-label={`Remover ferramenta ${toolName}`}
				render={triggerButton}
			>
				{triggerContent}
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
