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
import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { archiveSupplier, restoreSupplier } from "../../actions";

interface Props {
	status: "active" | "archived";
	supplierId: string;
	supplierName: string;
}

export function ArchiveSupplierDialog({
	status,
	supplierId,
	supplierName,
}: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const isArchived = status === "archived";
	const actionLabel = isArchived ? "Restaurar" : "Arquivar";
	const pendingLabel = isArchived ? "Restaurando…" : "Arquivando…";

	function handleConfirm() {
		startTransition(async () => {
			const result = isArchived
				? await restoreSupplier(supplierId)
				: await archiveSupplier(supplierId);
			if (result.ok) {
				toast.success(
					isArchived ? "Fornecedor restaurado" : "Fornecedor arquivado"
				);
				setOpen(false);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				render={
					<Button size="sm" variant={isArchived ? "secondary" : "outline"} />
				}
			>
				{isArchived ? (
					<ArchiveRestore aria-hidden className="mr-1.5 size-3.5" />
				) : (
					<Archive aria-hidden className="mr-1.5 size-3.5" />
				)}
				{isArchived ? "Restaurar" : "Arquivar"}
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{isArchived ? "Restaurar" : "Arquivar"} fornecedor{" "}
						<strong>{supplierName}</strong>?
					</AlertDialogTitle>
					<AlertDialogDescription>
						{isArchived
							? "O fornecedor volta a aparecer como ativo."
							: "Ele deixa de aparecer como ativo; as ferramentas vinculadas continuam intactas. Você pode restaurar depois."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						disabled={isPending}
						onClick={(event) => {
							event.preventDefault();
							handleConfirm();
						}}
					>
						{isPending ? (
							<>
								<Spinner /> {pendingLabel}
							</>
						) : (
							actionLabel
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
