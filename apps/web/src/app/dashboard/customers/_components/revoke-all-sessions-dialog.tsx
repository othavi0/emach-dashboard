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
import { useLazyTabReload } from "@/components/entity/lazy-tab";
import { notify } from "@/lib/notify";

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
	// NOTA: renderizado no header (CustomerDetailActions), fora da subárvore do
	// LazyTab da aba "Sessões" — reloadTab() é o no-op default do Context aqui
	// (irmão, não descendente). Mesmo caso de team-link-panel.tsx (branches).
	// router.refresh() já atualiza o KPI eager (sessionsCount); a lista lazy só
	// reflete ao reabrir/retry a aba.
	const reloadTab = useLazyTabReload();
	const [isPending, startTransition] = useTransition();

	function handleRevokeAll() {
		startTransition(async () => {
			const result = await revokeAllClientSessions({ clientId });
			if (result.ok) {
				notify.success(
					`${result.data.count} sessão(ões) revogada(s) com sucesso`
				);
				reloadTab();
				router.refresh();
			} else {
				notify.error(result.error);
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
