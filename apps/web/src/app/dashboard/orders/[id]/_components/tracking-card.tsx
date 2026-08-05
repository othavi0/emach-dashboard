"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import { Spinner } from "@emach/ui/components/spinner";
import { TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STATUS_BADGE_CAPS } from "@/components/status-visual";
import { notify } from "@/lib/notify";
import { updateTrackingCode } from "../../actions";

interface TrackingCardProps {
	canUpdateStatus: boolean;
	orderId: string;
	trackingCode: string | null;
}

/**
 * Rastreio pós-envio (spec D3): a operação posta no balcão dos Correios e o
 * código chega DEPOIS do "Marcar como Enviado". Sem código → pendente (warning)
 * com input direto; com código → leitura + "Corrigir". Auditado via
 * tracking_set (updateTrackingCode).
 */
export function TrackingCard({
	canUpdateStatus,
	orderId,
	trackingCode,
}: TrackingCardProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(trackingCode ?? "");
	const hasCode = Boolean(trackingCode);
	const showInput = !hasCode || editing;
	const showRead = hasCode && !(showInput && canUpdateStatus);

	function handleSave() {
		const code = draft.trim();
		if (!code) {
			notify.error("Informe um código de rastreio");
			return;
		}
		startTransition(async () => {
			const result = await updateTrackingCode({ orderId, trackingCode: code });
			if (!result.ok) {
				notify.error(result.error);
				return;
			}
			notify.success("Rastreio atualizado");
			setEditing(false);
			router.refresh();
		});
	}

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<CardTitle>Rastreio</CardTitle>
				{!hasCode && (
					<Badge className={STATUS_BADGE_CAPS} variant="warning">
						<TriangleAlertIcon aria-hidden />
						Pendente
					</Badge>
				)}
			</CardHeader>
			<CardContent className="space-y-3">
				{!hasCode && (
					<p className="text-muted-foreground text-xs">
						Pedido despachado sem código de rastreio. Registre assim que os
						Correios devolverem o comprovante.
					</p>
				)}
				{showInput && canUpdateStatus ? (
					<div className="flex gap-2">
						<Input
							onChange={(event) => setDraft(event.target.value)}
							placeholder="Ex: NL123456789BR"
							value={draft}
						/>
						<Button
							disabled={isPending || !draft.trim()}
							onClick={handleSave}
							variant="secondary"
						>
							{isPending ? (
								<>
									<Spinner /> Salvando…
								</>
							) : (
								"Salvar"
							)}
						</Button>
						{editing && (
							<Button
								disabled={isPending}
								onClick={() => {
									setEditing(false);
									setDraft(trackingCode ?? "");
								}}
								variant="ghost"
							>
								Cancelar
							</Button>
						)}
					</div>
				) : null}
				{showRead && (
					<div className="flex items-center justify-between gap-2">
						<span className="font-mono text-sm">{trackingCode}</span>
						{canUpdateStatus && (
							<Button
								onClick={() => setEditing(true)}
								size="sm"
								variant="ghost"
							>
								Corrigir
							</Button>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
