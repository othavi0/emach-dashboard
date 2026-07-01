"use client";

import { Button } from "@emach/ui/components/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DestructiveActionDialog } from "@/app/dashboard/users/_components/destructive-action-dialog";
import type { ActionResult } from "@/lib/action-result";
import { notify } from "@/lib/notify";
import { approveRefund, rejectRefund, reviewRefund } from "../../actions";

interface RefundActionsProps {
	refundId: string;
	status: string;
}

const TERMINAL = new Set(["refunded", "rejected"]);

// Botões de workflow da solicitação de reembolso (ADR-0025). A execução final
// (→ refunded) fica no botão "Reembolsar" do pedido; aqui: analisar/aprovar/rejeitar.
export function RefundActions({ refundId, status }: RefundActionsProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [rejectOpen, setRejectOpen] = useState(false);

	if (TERMINAL.has(status)) {
		return null;
	}

	function run(action: () => Promise<ActionResult>) {
		startTransition(async () => {
			const result = await action();
			if (result.ok) {
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	}

	return (
		<div className="flex flex-wrap items-center gap-2 pt-1">
			{status === "requested" && (
				<Button
					disabled={isPending}
					onClick={() => run(() => reviewRefund(refundId))}
					size="sm"
					variant="outline"
				>
					Analisar
				</Button>
			)}
			{status === "under_review" && (
				<Button
					disabled={isPending}
					onClick={() => run(() => approveRefund(refundId))}
					size="sm"
				>
					Aprovar
				</Button>
			)}
			{status === "approved" && (
				<p className="text-muted-foreground text-xs">
					Aprovado — execute o reembolso pelo botão <b>Reembolsar</b> do pedido.
				</p>
			)}
			<Button
				disabled={isPending}
				onClick={() => setRejectOpen(true)}
				size="sm"
				variant="ghost"
			>
				Rejeitar
			</Button>

			<DestructiveActionDialog
				confirmLabel="Rejeitar reembolso"
				description="Informe o motivo da recusa. O cliente poderá ver esta justificativa."
				onCancel={() => setRejectOpen(false)}
				onConfirm={(reason) => {
					setRejectOpen(false);
					run(() => rejectRefund(refundId, reason));
				}}
				open={rejectOpen}
				reasonRequired
				submitting={isPending}
				title="Rejeitar solicitação de reembolso"
			/>
		</div>
	);
}
