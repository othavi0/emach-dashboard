"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button, buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { ClockIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STATUS_BADGE_CAPS } from "@/components/status-visual";
import { formatRelative, formatTime } from "@/lib/format/datetime";
import { notify } from "@/lib/notify";
import type { FulfillmentState } from "../../../separacao/_lib/picking-logic";
import { isPickingStale } from "../../../separacao/_lib/picking-logic";
import { cancelPicking, takeoverPicking } from "../../../separacao/actions";
import { FULFILLMENT_STATE_META } from "../../../separacao/fulfillment-meta";
import type { OrderFulfillment, OrderStatus } from "../../data";

// Estados de order.status em que o fluxo de fulfillment é relevante — antes de
// "paid" não há separação ainda; estados finais (canceled/refunded/etc) não
// entram aqui.
const FULFILLMENT_RELEVANT_STATUSES: OrderStatus[] = [
	"paid",
	"preparing",
	"shipped",
	"delivered",
];

type Confirming = "cancel" | "takeover";

function confirmButtonLabel(
	confirming: Confirming,
	isPending: boolean
): string {
	if (confirming === "takeover") {
		return isPending ? "Assumindo…" : "Confirmar takeover";
	}
	return isPending ? "Cancelando…" : "Confirmar cancelamento";
}

function PostShipSummary({
	fulfillment,
}: {
	fulfillment: OrderFulfillment | null;
}) {
	if (!fulfillment) {
		return (
			<p className="text-muted-foreground text-sm">
				Sem sessão de separação registrada (envio forçado — ver histórico).
			</p>
		);
	}
	return (
		<p className="text-muted-foreground text-sm">
			Separado por {fulfillment.pickerName}
			{fulfillment.completedAt &&
				` · concluído às ${formatTime(fulfillment.completedAt)}`}
		</p>
	);
}

function AwaitingPickingSection({
	canPick,
	orderId,
	orderStatus,
}: {
	canPick: boolean;
	orderId: string;
	orderStatus: OrderStatus;
}) {
	return (
		<>
			<p className="text-muted-foreground text-sm">
				Nenhuma separação em andamento.
			</p>
			{canPick && orderStatus === "preparing" && (
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href={`/dashboard/separacao/${orderId}`}
				>
					Iniciar separação
				</Link>
			)}
			{orderStatus === "paid" && (
				<p className="text-muted-foreground text-xs">
					Atribua a filial responsável para liberar a separação.
				</p>
			)}
		</>
	);
}

function InProgressSection({
	canManageSession,
	fulfillment,
	isPending,
	onRequestCancel,
	onRequestTakeover,
	orderId,
	progressPct,
	stale,
}: {
	canManageSession: boolean;
	fulfillment: OrderFulfillment;
	isPending: boolean;
	onRequestCancel: () => void;
	onRequestTakeover: () => void;
	orderId: string;
	progressPct: number;
	stale: boolean;
}) {
	return (
		<>
			<p className="text-sm">
				{fulfillment.pickerName} · desde {formatTime(fulfillment.startedAt)}
			</p>
			<div className="h-2 overflow-hidden rounded-full bg-muted">
				<div
					className="h-full bg-primary"
					style={{ width: `${progressPct}%` }}
				/>
			</div>
			<p className="text-muted-foreground text-xs">
				{fulfillment.pickedUnits} de {fulfillment.totalUnits} unidades
			</p>
			{stale && (
				<p className="flex items-center gap-1.5 font-medium text-warning text-xs">
					<ClockIcon aria-hidden className="size-3.5" />
					Parada{" "}
					{formatRelative(fulfillment.lastScannedAt ?? fulfillment.startedAt)}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href={`/dashboard/separacao/${orderId}`}
				>
					Abrir separação
				</Link>
				{canManageSession && (
					<>
						<Button
							disabled={isPending}
							onClick={onRequestTakeover}
							size="sm"
							variant="secondary"
						>
							Assumir
						</Button>
						<Button
							className="text-destructive hover:bg-destructive/10 hover:text-destructive"
							disabled={isPending}
							onClick={onRequestCancel}
							size="sm"
							variant="ghost"
						>
							Cancelar sessão
						</Button>
					</>
				)}
			</div>
		</>
	);
}

function ExceptionSection({
	canPick,
	fulfillment,
	orderId,
}: {
	canPick: boolean;
	fulfillment: OrderFulfillment;
	orderId: string;
}) {
	return (
		<>
			<p className="flex items-start gap-1.5 text-sm text-warning">
				<TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
				{fulfillment.exceptionReason ?? "Item não encontrado na separação"}
			</p>
			<p className="text-muted-foreground text-xs">
				Reponha o estoque e reabra a separação, ou encaminhe o reembolso no
				painel de exceções abaixo.
			</p>
			{canPick && (
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href={`/dashboard/separacao/${orderId}`}
				>
					Reabrir separação
				</Link>
			)}
		</>
	);
}

function PickedSummary({
	fulfillment,
	orderId,
}: {
	fulfillment: OrderFulfillment;
	orderId: string;
}) {
	return (
		<>
			<p className="text-sm">
				{fulfillment.pickerName} · {formatTime(fulfillment.startedAt)}
				{fulfillment.completedAt && ` – ${formatTime(fulfillment.completedAt)}`}{" "}
				· {fulfillment.totalUnits} unidades conferidas
			</p>
			<Link
				className={buttonVariants({ size: "sm", variant: "outline" })}
				href={`/dashboard/orders/shipping-doc?ids=${orderId}`}
				rel="noopener noreferrer"
				target="_blank"
			>
				Dados de envio
			</Link>
		</>
	);
}

// Cancelar e assumir são ambos irreversíveis (descartam a sessão/bipagens
// atuais), então os dois passam pelo mesmo painel de confirmação inline
// (DESIGN.md §4 — nenhuma ação destrutiva dispara sem confirmação).
function ConfirmPanel({
	confirming,
	fulfillment,
	isPending,
	onBack,
	onConfirm,
}: {
	confirming: Confirming;
	fulfillment: OrderFulfillment | null;
	isPending: boolean;
	onBack: () => void;
	onConfirm: () => void;
}) {
	return (
		<CardContent className="border-border border-t pt-3">
			<p className="mb-2 text-muted-foreground text-xs">
				{confirming === "takeover"
					? `A sessão de ${fulfillment?.pickerName} será cancelada e uma nova começa do zero no seu nome. Continuar?`
					: "As bipagens desta sessão serão descartadas e a separação volta para a fila. Continuar?"}
			</p>
			<div className="flex gap-2">
				<Button
					disabled={isPending}
					onClick={onConfirm}
					size="sm"
					variant="warning"
				>
					{confirmButtonLabel(confirming, isPending)}
				</Button>
				<Button disabled={isPending} onClick={onBack} size="sm" variant="ghost">
					Voltar
				</Button>
			</div>
		</CardContent>
	);
}

interface PickingStatusCardProps {
	canManageSession: boolean; // admin/super_admin
	canPick: boolean;
	fulfillment: OrderFulfillment | null;
	orderId: string;
	orderStatus: OrderStatus;
}

export function PickingStatusCard({
	canManageSession,
	canPick,
	fulfillment,
	orderId,
	orderStatus,
}: PickingStatusCardProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [confirming, setConfirming] = useState<Confirming | null>(null);

	// Só aparece no fluxo de fulfillment; pós-envio vira resumo (render abaixo).
	if (!FULFILLMENT_RELEVANT_STATUSES.includes(orderStatus)) {
		return null;
	}

	const state: FulfillmentState = fulfillment?.state ?? "awaiting_picking";
	const meta = FULFILLMENT_STATE_META[state];
	const isPostShip = orderStatus !== "paid" && orderStatus !== "preparing";
	const stale =
		state === "picking_in_progress" &&
		fulfillment != null &&
		isPickingStale({
			lastScannedAt: fulfillment.lastScannedAt,
			startedAt: fulfillment.startedAt,
		});
	const progressPct =
		fulfillment && fulfillment.totalUnits > 0
			? Math.round((fulfillment.pickedUnits / fulfillment.totalUnits) * 100)
			: 0;

	function handleCancel() {
		if (!fulfillment) {
			return;
		}
		startTransition(async () => {
			const result = await cancelPicking(
				fulfillment.pickingId,
				"Cancelada pelo painel do pedido"
			);
			if (result.ok) {
				notify.success("Separação cancelada");
			} else {
				notify.error(result.error);
			}
			setConfirming(null);
			router.refresh();
		});
	}

	function handleTakeover() {
		if (!fulfillment) {
			return;
		}
		startTransition(async () => {
			const result = await takeoverPicking(fulfillment.pickingId);
			if (result.ok) {
				notify.success("Separação assumida");
				setConfirming(null);
				router.push(`/dashboard/separacao/${orderId}`);
			} else {
				notify.error(result.error);
				setConfirming(null);
				router.refresh();
			}
		});
	}

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<CardTitle>Separação</CardTitle>
				<Badge className={STATUS_BADGE_CAPS} variant={meta.badgeVariant}>
					{meta.label}
				</Badge>
			</CardHeader>
			<CardContent className="space-y-3">
				{isPostShip && <PostShipSummary fulfillment={fulfillment} />}

				{!isPostShip && state === "awaiting_picking" && (
					<AwaitingPickingSection
						canPick={canPick}
						orderId={orderId}
						orderStatus={orderStatus}
					/>
				)}

				{!isPostShip && state === "picking_in_progress" && fulfillment && (
					<InProgressSection
						canManageSession={canManageSession}
						fulfillment={fulfillment}
						isPending={isPending}
						onRequestCancel={() => setConfirming("cancel")}
						onRequestTakeover={() => setConfirming("takeover")}
						orderId={orderId}
						progressPct={progressPct}
						stale={stale}
					/>
				)}

				{!isPostShip && state === "picking_exception" && fulfillment && (
					<ExceptionSection
						canPick={canPick}
						fulfillment={fulfillment}
						orderId={orderId}
					/>
				)}

				{!isPostShip && state === "picked" && fulfillment && (
					<PickedSummary fulfillment={fulfillment} orderId={orderId} />
				)}
			</CardContent>

			{confirming && (
				<ConfirmPanel
					confirming={confirming}
					fulfillment={fulfillment}
					isPending={isPending}
					onBack={() => setConfirming(null)}
					onConfirm={confirming === "takeover" ? handleTakeover : handleCancel}
				/>
			)}
		</Card>
	);
}
