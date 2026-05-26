"use client";

import { Button } from "@emach/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import { MoreVertical, Pause, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DestructiveActionDialog } from "../../_components/destructive-action-dialog";
import { reactivateUser, suspendUser } from "../../actions";

interface Props {
	user: {
		id: string;
		name: string;
		status: "active" | "pending" | "suspended";
	};
}

export function UserActionsMenu({ user }: Props) {
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
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button aria-label="Mais ações" size="sm" variant="outline">
							<MoreVertical aria-hidden className="size-3.5" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end" side="bottom">
					{user.status === "active" ? (
						<DropdownMenuItem onClick={() => setDialogOpen("suspend")}>
							<Pause className="mr-2 size-3.5" />
							Suspender
						</DropdownMenuItem>
					) : null}
					{user.status === "suspended" ? (
						<DropdownMenuItem onClick={() => setDialogOpen("reactivate")}>
							<Play className="mr-2 size-3.5" />
							Reativar
						</DropdownMenuItem>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
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
