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
import { buttonVariants } from "@emach/ui/components/button";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { revokeClientSession } from "../actions";

interface RevokeSessionDialogProps {
	clientId: string;
	sessionId: string;
	userAgentSummary?: string;
}

export function RevokeSessionDialog({
	clientId,
	sessionId,
	userAgentSummary,
}: RevokeSessionDialogProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	function handleRevoke() {
		startTransition(async () => {
			const result = await revokeClientSession({ clientId, sessionId });
			if (result.ok) {
				toast.success("Sessão revogada com sucesso");
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger
				aria-label="Revogar sessão"
				className={buttonVariants({ size: "icon-sm", variant: "secondary" })}
				render={<button type="button" />}
			>
				<Trash2Icon aria-hidden className="size-3.5 text-destructive" />
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Revogar sessão?</AlertDialogTitle>
					<AlertDialogDescription>
						{userAgentSummary
							? `O cliente será deslogado do dispositivo: ${userAgentSummary}.`
							: "O cliente será deslogado deste dispositivo."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						className={buttonVariants({ variant: "destructive" })}
						disabled={isPending}
						onClick={handleRevoke}
					>
						{isPending ? "Revogando…" : "Revogar"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
