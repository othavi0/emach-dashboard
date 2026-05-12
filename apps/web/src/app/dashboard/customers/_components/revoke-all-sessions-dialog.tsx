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
import { Button, buttonVariants } from "@emach/ui/components/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { revokeAllClientSessions } from "../actions";

interface RevokeAllSessionsDialogProps {
	clientId: string;
	sessionCount: number;
}

export function RevokeAllSessionsDialog({
	clientId,
	sessionCount,
}: RevokeAllSessionsDialogProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	function handleRevokeAll() {
		startTransition(async () => {
			const result = await revokeAllClientSessions({ clientId });
			if (result.ok) {
				toast.success(
					`${result.data.count} sessão(ões) revogada(s) com sucesso`
				);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
				Revogar todas ({sessionCount})
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Revogar todas as sessões?</AlertDialogTitle>
					<AlertDialogDescription>
						O cliente será deslogado em todos os {sessionCount} dispositivo(s).
						Esta ação não pode ser desfeita.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						className={buttonVariants({ variant: "destructive" })}
						disabled={isPending}
						onClick={handleRevokeAll}
					>
						{isPending ? "Revogando…" : "Revogar Todas"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
