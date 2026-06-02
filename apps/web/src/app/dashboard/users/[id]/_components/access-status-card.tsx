"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DestructiveActionDialog } from "../../_components/destructive-action-dialog";
import { StatusBadge } from "../../_components/status-badge";
import { reactivateUser, suspendUser } from "../../actions";

interface Props {
	user: {
		id: string;
		name: string;
		status: "active" | "pending" | "suspended";
	};
}

export function AccessStatusCard({ user }: Props) {
	const [dialogOpen, setDialogOpen] = useState<"suspend" | "reactivate" | null>(
		null
	);
	const [submitting, startTransition] = useTransition();

	const closeDialog = () => setDialogOpen(null);

	const onSuspend = (reason: string) => {
		startTransition(async () => {
			const res = await suspendUser({ userId: user.id, reason });
			if (res.ok) {
				toast.success("Usuário suspenso");
				closeDialog();
			} else {
				toast.error(res.error);
			}
		});
	};

	const onReactivate = (_reason: string) => {
		startTransition(async () => {
			const res = await reactivateUser({ userId: user.id });
			if (res.ok) {
				toast.success("Usuário reativado");
				closeDialog();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Status de acesso</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<StatusBadge status={user.status} />
					{user.status === "active" && (
						<Button
							className="self-start"
							onClick={() => setDialogOpen("suspend")}
							size="sm"
							variant="outline"
						>
							Suspender
						</Button>
					)}
					{user.status === "suspended" && (
						<Button
							className="self-start"
							onClick={() => setDialogOpen("reactivate")}
							size="sm"
							variant="outline"
						>
							Reativar
						</Button>
					)}
					{user.status === "pending" && (
						<p className="text-muted-foreground text-sm">
							Aguardando aprovação
						</p>
					)}
				</CardContent>
			</Card>
			<DestructiveActionDialog
				confirmLabel="Suspender"
				description={`O usuário ${user.name} perderá acesso imediatamente e todas as sessões ativas serão revogadas.`}
				onCancel={closeDialog}
				onConfirm={onSuspend}
				open={dialogOpen === "suspend"}
				submitting={submitting}
				title="Suspender usuário"
			/>
			<DestructiveActionDialog
				confirmLabel="Reativar"
				description={`O usuário ${user.name} recuperará o acesso. Não precisa de motivo formal.`}
				destructive={false}
				onCancel={closeDialog}
				onConfirm={onReactivate}
				open={dialogOpen === "reactivate"}
				reasonRequired={false}
				submitting={submitting}
				title="Reativar usuário"
			/>
		</>
	);
}
