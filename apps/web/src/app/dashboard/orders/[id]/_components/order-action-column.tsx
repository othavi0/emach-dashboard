"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { matchBranchByCep } from "@/lib/cep-match";
import { notify } from "@/lib/notify";
import { FULFILLMENT_STATE_META } from "../../../separacao/fulfillment-meta";
import { CancelOrderDialog } from "../../_components/cancel-order-dialog";
import { RefundDialog } from "../../_components/refund-dialog";
import { StockReturnDialog } from "../../_components/stock-return-dialog";
import {
	addOrderNote,
	assignBranch,
	markShippingReviewed,
	updateOrderStatus,
	updateTrackingCode,
} from "../../actions";
import type {
	BranchOption,
	OrderDetail,
	OrderFulfillment,
	OrderStatus,
} from "../../data";
import { ORDER_STATUS_LABELS } from "../../status-meta";
import { ForceShipDialog } from "./force-ship-dialog";
import { OrderProgress } from "./order-progress";
import { PickingStatusCard } from "./picking-status-card";

const PRIMARY_TRANSITION: Partial<Record<OrderStatus, OrderStatus>> = {
	pending_payment: "canceled",
	payment_failed: "canceled",
	paid: "preparing",
	preparing: "shipped",
	shipped: "delivered",
};

type Refresh = () => void;

async function runAssignBranch(
	orderId: string,
	branchId: string,
	refresh: Refresh
) {
	const result = await assignBranch({ orderId, branchId });
	if (!result.ok) {
		notify.error(result.error);
		return;
	}
	notify.success("Filial atribuída");
	refresh();
}

async function runTrackingUpdate(
	orderId: string,
	trackingCode: string,
	refresh: Refresh
) {
	const result = await updateTrackingCode({ orderId, trackingCode });
	if (!result.ok) {
		notify.error(result.error);
		return;
	}
	notify.success("Rastreio atualizado");
	refresh();
}

async function runMarkShippingReviewed(orderId: string, refresh: Refresh) {
	const result = await markShippingReviewed({ orderId });
	if (!result.ok) {
		notify.error(result.error);
		return;
	}
	notify.success("Frete marcado como revisado");
	refresh();
}

async function runAddNote(
	orderId: string,
	body: string,
	setNoteBody: (v: string) => void,
	refresh: Refresh
) {
	const result = await addOrderNote({ orderId, body });
	if (!result.ok) {
		notify.error(result.error);
		return;
	}
	setNoteBody("");
	notify.success("Nota adicionada");
	refresh();
}

async function runPrimaryStatusUpdate(
	orderId: string,
	nextStatus: OrderStatus,
	reason: string,
	trackingCode: string,
	branchId: string,
	setStatusReason: (v: string) => void,
	refresh: Refresh
) {
	const transitionTracking =
		nextStatus === "shipped" ? trackingCode || undefined : undefined;
	const transitionBranch =
		nextStatus === "preparing" ? branchId || undefined : undefined;
	const result = await updateOrderStatus({
		orderId,
		toStatus: nextStatus,
		reason: reason || undefined,
		trackingCode: transitionTracking,
		branchId: transitionBranch,
	});
	if (!result.ok) {
		notify.error(result.error);
		return;
	}
	setStatusReason("");
	notify.success(`Pedido movido para ${ORDER_STATUS_LABELS[nextStatus]}`);
	refresh();
}

interface ShipGateResult {
	forceShipSlot: React.ReactNode;
	label: string | null;
	shipBlocked: boolean;
}

/**
 * Espelho client-side do gate de `enforceShipGate` (orders/actions.ts): sem
 * separação concluída, o botão "Marcar como Enviado" trava — só super_admin
 * destrava via ForceShipDialog (forceShip audita em order_event "ship_forced").
 * Extraído do componente para manter a complexidade cognitiva de
 * `OrderActionColumn` sob controle.
 */
function computeShipGate({
	fulfillment,
	isSuperAdmin,
	nextStatus,
	order,
	trackingCode,
}: {
	fulfillment: OrderFulfillment | null;
	isSuperAdmin: boolean;
	nextStatus: OrderStatus | undefined;
	order: OrderDetail;
	trackingCode: string;
}): ShipGateResult {
	const shipBlocked =
		nextStatus === "shipped" && fulfillment?.state !== "picked";
	if (!(shipBlocked && order.status === "preparing")) {
		return { forceShipSlot: null, label: null, shipBlocked };
	}
	const state = fulfillment?.state ?? "awaiting_picking";
	return {
		forceShipSlot: isSuperAdmin ? (
			<ForceShipDialog orderId={order.id} trackingCode={trackingCode.trim()} />
		) : null,
		label: `${FULFILLMENT_STATE_META[state].label} — o envio libera quando a separação estiver concluída.`,
		shipBlocked,
	};
}

/** Sub-label do step "Em preparação" no `OrderProgress` (Task 7). */
function computeProgressFulfillmentLabel(
	order: OrderDetail,
	fulfillment: OrderFulfillment | null
): string | null {
	if (order.status !== "preparing" || !fulfillment) {
		return null;
	}
	return FULFILLMENT_STATE_META[fulfillment.state].label;
}

interface PrimaryActionContentProps {
	branches: BranchOption[];
	branchId: string;
	canDoPrimaryTransition: boolean;
	forceShipSlot: React.ReactNode;
	isPending: boolean;
	isTerminal: boolean;
	nextStatus: OrderStatus | undefined;
	onAssignBranch: () => void;
	onPrimaryStatusUpdate: () => void;
	onTrackingUpdate: () => void;
	order: OrderDetail;
	setBranchId: (v: string) => void;
	setStatusReason: (v: string) => void;
	setTrackingCode: (v: string) => void;
	shipBlockedLabel: string | null;
	statusReason: string;
	trackingCode: string;
}

function PrimaryActionContent({
	branches,
	branchId,
	canDoPrimaryTransition,
	forceShipSlot,
	isPending,
	isTerminal,
	nextStatus,
	order,
	onAssignBranch,
	onPrimaryStatusUpdate,
	onTrackingUpdate,
	setBranchId,
	setStatusReason,
	setTrackingCode,
	shipBlockedLabel,
	statusReason,
	trackingCode,
}: PrimaryActionContentProps) {
	if (!nextStatus) {
		return (
			<p className="text-muted-foreground text-sm">
				{isTerminal
					? "Este pedido já está em estado final."
					: "Sem ação primária — use o painel de exceções abaixo."}
			</p>
		);
	}

	return (
		<>
			<div className="space-y-1">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="status-reason"
				>
					Observação da transição
				</label>
				<Textarea
					id="status-reason"
					onChange={(event) => setStatusReason(event.target.value)}
					placeholder="Opcional. Motivo operacional visível na timeline."
					value={statusReason}
				/>
			</div>

			{order.status === "paid" && (
				<div className="space-y-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="branch-assign"
					>
						Filial responsável
					</label>
					<div className="flex gap-2">
						<Select
							onValueChange={(v) =>
								setBranchId(!v || v === "__none__" ? "" : v)
							}
							value={branchId || "__none__"}
						>
							<SelectTrigger id="branch-assign">
								<SelectValue>
									{(v: string) =>
										v === "__none__"
											? "Selecionar filial"
											: (branches.find((b) => b.id === v)?.name ??
												"Selecionar filial")
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__none__">Selecionar filial</SelectItem>
									{branches.map((branch) => (
										<SelectItem key={branch.id} value={branch.id}>
											{branch.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<Button
							disabled={isPending || !branchId}
							onClick={onAssignBranch}
							variant="outline"
						>
							Salvar
						</Button>
					</div>
				</div>
			)}

			{order.status === "preparing" && (
				<div className="space-y-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="tracking-code"
					>
						Código de rastreio
					</label>
					<div className="flex gap-2">
						<Input
							id="tracking-code"
							onChange={(event) => setTrackingCode(event.target.value)}
							placeholder="Ex: BR123456789"
							value={trackingCode}
						/>
						<Button
							disabled={isPending || !trackingCode.trim()}
							onClick={onTrackingUpdate}
							variant="outline"
						>
							Salvar
						</Button>
					</div>
				</div>
			)}

			<Button
				disabled={isPending || !canDoPrimaryTransition}
				onClick={onPrimaryStatusUpdate}
				variant="default"
			>
				{isPending ? (
					<>
						<Spinner /> Salvando…
					</>
				) : (
					`Marcar como ${ORDER_STATUS_LABELS[nextStatus]}`
				)}
			</Button>
			{shipBlockedLabel && (
				<p className="text-muted-foreground text-xs">{shipBlockedLabel}</p>
			)}
			{forceShipSlot}
		</>
	);
}

interface OrderActionColumnProps {
	branches: BranchOption[];
	canAddNote: boolean;
	canCancel: boolean;
	canManageSession: boolean;
	canPick: boolean;
	canRefund: boolean;
	canUpdateStatus: boolean;
	fulfillment: OrderFulfillment | null;
	isSuperAdmin: boolean;
	order: OrderDetail;
}

export function OrderActionColumn({
	branches,
	canAddNote,
	canCancel,
	canManageSession,
	canPick,
	canRefund,
	canUpdateStatus,
	fulfillment,
	isSuperAdmin,
	order,
}: OrderActionColumnProps) {
	const router = useRouter();
	const [branchId, setBranchId] = useState(() => {
		if (order.branchId) {
			return order.branchId;
		}
		// Pre-fill com sugestão por CEP apenas em paid (próxima ação = preparing)
		if (order.status === "paid") {
			const suggested = matchBranchByCep(
				order.shippingAddress.zipCode ?? "",
				branches.map((b) => ({ id: b.id, cepRanges: b.cepRanges ?? null }))
			);
			return suggested ?? "";
		}
		return "";
	});
	const [trackingCode, setTrackingCode] = useState(
		order.shippingTrackingCode ?? ""
	);
	const [noteBody, setNoteBody] = useState("");
	const [statusReason, setStatusReason] = useState("");
	const [isPending, startTransition] = useTransition();
	const nextStatus = PRIMARY_TRANSITION[order.status];
	const isTerminal = order.status === "canceled" || order.status === "refunded";
	const shipGate = computeShipGate({
		fulfillment,
		isSuperAdmin,
		nextStatus,
		order,
		trackingCode,
	});
	const canDoPrimaryTransition =
		(nextStatus === "canceled" ? canCancel : canUpdateStatus) &&
		!shipGate.shipBlocked;
	const showCancelException =
		canCancel &&
		(order.status === "pending_payment" || order.status === "payment_failed");
	// returned cobre devolução do cliente (delivered) e falha de entrega (shipped).
	const showReturnException =
		canUpdateStatus &&
		(order.status === "delivered" || order.status === "shipped");
	const showRefundException =
		canRefund &&
		(order.status === "paid" ||
			order.status === "preparing" ||
			order.status === "shipped" ||
			order.status === "returned");

	function handleAssignBranch() {
		if (!branchId) {
			notify.error("Selecione uma filial");
			return;
		}
		startTransition(() => runAssignBranch(order.id, branchId, router.refresh));
	}

	function handleTrackingUpdate() {
		if (!trackingCode.trim()) {
			notify.error("Informe um código de rastreio");
			return;
		}
		startTransition(() =>
			runTrackingUpdate(order.id, trackingCode.trim(), router.refresh)
		);
	}

	function handleMarkShippingReviewed() {
		startTransition(() => runMarkShippingReviewed(order.id, router.refresh));
	}

	function handleAddNote() {
		if (!noteBody.trim()) {
			notify.error("Escreva uma nota");
			return;
		}
		startTransition(() =>
			runAddNote(order.id, noteBody.trim(), setNoteBody, router.refresh)
		);
	}

	function handlePrimaryStatusUpdate() {
		if (!nextStatus) {
			return;
		}
		startTransition(() =>
			runPrimaryStatusUpdate(
				order.id,
				nextStatus,
				statusReason.trim(),
				trackingCode.trim(),
				branchId,
				setStatusReason,
				router.refresh
			)
		);
	}

	const hasExceptions =
		showCancelException || showReturnException || showRefundException;

	return (
		<div className="flex flex-col gap-4">
			{/* ── Frete a revisar (fail-open do checkout) ── */}
			{order.shippingUnverified && canUpdateStatus && (
				<Card className="border-warning/40 bg-warning/5">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-warning">
							<TriangleAlertIcon aria-hidden="true" className="size-4" />
							Frete não verificado
						</CardTitle>
						<CardDescription>
							O frete deste pedido não pôde ser revalidado no checkout. Confira
							o valor antes de faturar e marque como revisado.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button
							disabled={isPending}
							onClick={handleMarkShippingReviewed}
							size="sm"
							variant="warning"
						>
							{isPending ? (
								<>
									<Spinner /> Salvando…
								</>
							) : (
								"Marcar frete como revisado"
							)}
						</Button>
					</CardContent>
				</Card>
			)}

			{/* ── Progresso ── */}
			<OrderProgress
				fulfillmentLabel={computeProgressFulfillmentLabel(order, fulfillment)}
				order={order}
			/>

			{/* ── Separação ── */}
			<PickingStatusCard
				canManageSession={canManageSession}
				canPick={canPick}
				fulfillment={fulfillment}
				orderId={order.id}
				orderStatus={order.status}
			/>

			{/* ── Próxima ação ── */}
			<Card>
				<CardHeader>
					<CardTitle>Próxima ação</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<PrimaryActionContent
						branches={branches}
						branchId={branchId}
						canDoPrimaryTransition={canDoPrimaryTransition}
						forceShipSlot={shipGate.forceShipSlot}
						isPending={isPending}
						isTerminal={isTerminal}
						nextStatus={nextStatus}
						onAssignBranch={handleAssignBranch}
						onPrimaryStatusUpdate={handlePrimaryStatusUpdate}
						onTrackingUpdate={handleTrackingUpdate}
						order={order}
						setBranchId={setBranchId}
						setStatusReason={setStatusReason}
						setTrackingCode={setTrackingCode}
						shipBlockedLabel={shipGate.label}
						statusReason={statusReason}
						trackingCode={trackingCode}
					/>
				</CardContent>
			</Card>

			{/* ── Exceções ── */}
			{hasExceptions && (
				<Card>
					<CardHeader>
						<CardTitle>Exceções</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<p className="text-muted-foreground text-xs">
							Cancelamento, devolução e reembolso fora do fluxo principal.
						</p>
						<div className="flex flex-wrap gap-2">
							{showCancelException && <CancelOrderDialog orderId={order.id} />}
							{showReturnException && (
								<StockReturnDialog
									branches={branches}
									currentBranchId={order.branchId}
									items={order.items}
									orderId={order.id}
									toStatus="returned"
									triggerLabel="Registrar devolução"
									triggerVariant="warning"
								/>
							)}
							{showRefundException && (
								<RefundDialog
									branches={branches}
									currentBranchId={order.branchId}
									currentStatus={order.status}
									items={order.items}
									orderId={order.id}
								/>
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{/* ── Nota interna ── */}
			{canAddNote && (
				<Card>
					<CardHeader>
						<CardTitle>Nota interna</CardTitle>
						<CardDescription>
							Anotação avulsa sobre o pedido, visível em qualquer status. Para
							justificar uma mudança de status, use a Observação da transição
							acima.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<Textarea
							onChange={(event) => setNoteBody(event.target.value)}
							placeholder="Ex: cliente pediu urgência na entrega"
							value={noteBody}
						/>
						<Button
							disabled={isPending || !noteBody.trim()}
							onClick={handleAddNote}
							size="sm"
							variant="secondary"
						>
							{isPending ? (
								<>
									<Spinner /> Salvando…
								</>
							) : (
								"Adicionar nota"
							)}
						</Button>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
