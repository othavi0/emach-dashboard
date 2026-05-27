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
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	addOrderNote,
	assignBranch,
	updateOrderStatus,
	updateTrackingCode,
} from "../actions";
import type { BranchOption, OrderDetail, OrderStatus } from "../data";
import { ORDER_STATUS_LABELS } from "../status-meta";
import { CancelOrderDialog } from "./cancel-order-dialog";
import { RefundDialog } from "./refund-dialog";
import { StockReturnDialog } from "./stock-return-dialog";

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
		toast.error(result.error);
		return;
	}
	toast.success("Filial atribuída");
	refresh();
}

async function runTrackingUpdate(
	orderId: string,
	trackingCode: string,
	refresh: Refresh
) {
	const result = await updateTrackingCode({ orderId, trackingCode });
	if (!result.ok) {
		toast.error(result.error);
		return;
	}
	toast.success("Rastreio atualizado");
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
		toast.error(result.error);
		return;
	}
	setNoteBody("");
	toast.success("Nota adicionada");
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
		toast.error(result.error);
		return;
	}
	setStatusReason("");
	toast.success(`Pedido movido para ${ORDER_STATUS_LABELS[nextStatus]}`);
	refresh();
}

interface PrimaryActionContentProps {
	branches: BranchOption[];
	branchId: string;
	canDoPrimaryTransition: boolean;
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
	statusReason: string;
	trackingCode: string;
}

function PrimaryActionContent({
	branches,
	branchId,
	canDoPrimaryTransition,
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
		</>
	);
}

interface OrderActionsPanelProps {
	branches: BranchOption[];
	canAddNote: boolean;
	canCancel: boolean;
	canRefund: boolean;
	canUpdateStatus: boolean;
	order: OrderDetail;
}

export function OrderActionsPanel({
	branches,
	canAddNote,
	canCancel,
	canRefund,
	canUpdateStatus,
	order,
}: OrderActionsPanelProps) {
	const router = useRouter();
	const [branchId, setBranchId] = useState(order.branchId ?? "");
	const [trackingCode, setTrackingCode] = useState(
		order.shippingTrackingCode ?? ""
	);
	const [noteBody, setNoteBody] = useState("");
	const [statusReason, setStatusReason] = useState("");
	const [isPending, startTransition] = useTransition();
	const nextStatus = PRIMARY_TRANSITION[order.status];
	const isTerminal = order.status === "canceled" || order.status === "refunded";
	const canDoPrimaryTransition =
		nextStatus === "canceled" ? canCancel : canUpdateStatus;
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
			toast.error("Selecione uma filial");
			return;
		}
		startTransition(() => runAssignBranch(order.id, branchId, router.refresh));
	}

	function handleTrackingUpdate() {
		if (!trackingCode.trim()) {
			toast.error("Informe um código de rastreio");
			return;
		}
		startTransition(() =>
			runTrackingUpdate(order.id, trackingCode.trim(), router.refresh)
		);
	}

	function handleAddNote() {
		if (!noteBody.trim()) {
			toast.error("Escreva uma nota");
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
		<Card>
			{/* ── Próxima ação ── */}
			<CardHeader>
				<CardTitle>Ações</CardTitle>
				<CardDescription>
					Fluxo principal, exceções e notas internas do pedido.
				</CardDescription>
			</CardHeader>

			<CardContent className="space-y-3">
				<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest">
					Próxima ação
				</p>
				<PrimaryActionContent
					branches={branches}
					branchId={branchId}
					canDoPrimaryTransition={canDoPrimaryTransition}
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
					statusReason={statusReason}
					trackingCode={trackingCode}
				/>
			</CardContent>

			{/* ── Exceções ── */}
			{hasExceptions && (
				<>
					<div className="mx-6 border-border border-t" />
					<CardContent className="space-y-3 pt-4">
						<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest">
							Exceções
						</p>
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
				</>
			)}

			{/* ── Nota interna ── */}
			{canAddNote && (
				<>
					<div className="mx-6 border-border border-t" />
					<CardContent className="space-y-3 pt-4">
						<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest">
							Nota interna
						</p>
						<Textarea
							onChange={(event) => setNoteBody(event.target.value)}
							placeholder="Ex: aguardar coleta da transportadora"
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
				</>
			)}
		</Card>
	);
}
