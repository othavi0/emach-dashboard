"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteBranch } from "../actions";

interface DeleteBranchDialogProps {
	branchId: string;
	branchName: string;
}

export function DeleteBranchDialog({
	branchId,
	branchName,
}: DeleteBranchDialogProps) {
	const [isPending, startTransition] = useTransition();
	const [isOpen, setIsOpen] = useState(false);

	function handleDelete() {
		startTransition(async () => {
			const result = await deleteBranch(branchId);
			if (result.ok) {
				toast.success("Filial removida");
				setIsOpen(false);
			} else {
				toast.error(result.error || "Não foi possível remover a filial");
			}
		});
	}

	if (!isOpen) {
		return (
			<Button onClick={() => setIsOpen(true)} size="sm" variant="ghost">
				Remover
			</Button>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<Button
				disabled={isPending}
				onClick={handleDelete}
				size="sm"
				variant="destructive"
			>
				{isPending ? <Spinner /> : `Confirmar "${branchName}"`}
			</Button>
			<Button
				disabled={isPending}
				onClick={() => setIsOpen(false)}
				size="sm"
				variant="ghost"
			>
				Cancelar
			</Button>
		</div>
	);
}
