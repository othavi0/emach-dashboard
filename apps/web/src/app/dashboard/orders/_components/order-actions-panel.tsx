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
import { StockReturnDialog } from "./stock-return-dialog";

const PRIMARY_TRANSITION: Partial<Record<OrderStatus, OrderStatus>> = {
	pending_payment: "canceled",
	paid: "preparing",
	preparing: "shipped",
	shipped: "delivered",
};

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
	const canDoPrimaryTransition =
		nextStatus === "canceled" ? canCancel : canUpdateStatus;

	function handleAssignBranch() {
		if (!branchId) {
			toast.error("Selecione uma filial");
			return;
		}

		startTransition(async () => {
			const result = await assignBranch({ orderId: order.id, branchId });
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success("Filial atribuída");
			router.refresh();
		});
	}

	function handleTrackingUpdate() {
		if (!trackingCode.trim()) {
			toast.error("Informe um código de rastreio");
			return;
		}

		startTransition(async () => {
			const result = await updateTrackingCode({
				orderId: order.id,
				trackingCode: trackingCode.trim(),
			});
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success("Rastreio atualizado");
			router.refresh();
		});
	}

	function handleAddNote() {
		if (!noteBody.trim()) {
			toast.error("Escreva uma nota");
			return;
		}

		startTransition(async () => {
			const result = await addOrderNote({
				orderId: order.id,
				body: noteBody.trim(),
			});
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			setNoteBody("");
			toast.success("Nota adicionada");
			router.refresh();
		});
	}

	function handlePrimaryStatusUpdate() {
		if (!nextStatus) {
			return;
		}

		startTransition(async () => {
			const result = await updateOrderStatus({
				orderId: order.id,
				toStatus: nextStatus,
				reason: statusReason.trim() || undefined,
				trackingCode:
					nextStatus === "shipped"
						? trackingCode.trim() || undefined
						: undefined,
				branchId:
					nextStatus === "preparing" ? branchId || undefined : undefined,
			});
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			setStatusReason("");
			toast.success(`Pedido movido para ${ORDER_STATUS_LABELS[nextStatus]}`);
			router.refresh();
		});
	}

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle>Próxima ação</CardTitle>
					<CardDescription>
						Fluxo operacional principal do pedido.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{nextStatus ? (
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
												<SelectItem value="__none__">
													Selecionar filial
												</SelectItem>
												{branches.map((branch) => (
													<SelectItem key={branch.id} value={branch.id}>
														{branch.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Button
											disabled={isPending || !branchId}
											onClick={handleAssignBranch}
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
											onClick={handleTrackingUpdate}
											variant="outline"
										>
											Salvar
										</Button>
									</div>
								</div>
							)}

							<Button
								disabled={isPending || !canDoPrimaryTransition}
								onClick={handlePrimaryStatusUpdate}
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
					) : (
						<p className="text-muted-foreground text-sm">
							Este pedido já está em estado final.
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Exceções</CardTitle>
					<CardDescription>
						Cancelamento ou reembolso com devolução semi-manual ao estoque.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-2">
					{canCancel &&
						order.status !== "canceled" &&
						order.status !== "refunded" && (
							<StockReturnDialog
								branches={branches}
								currentBranchId={order.branchId}
								items={order.items}
								orderId={order.id}
								toStatus="canceled"
								triggerLabel="Cancelar pedido"
							/>
						)}
					{canRefund &&
						order.status !== "refunded" &&
						order.status !== "delivered" && (
							<StockReturnDialog
								branches={branches}
								currentBranchId={order.branchId}
								items={order.items}
								orderId={order.id}
								toStatus="refunded"
								triggerLabel="Marcar como reembolsado"
							/>
						)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Nota interna</CardTitle>
					<CardDescription>
						Registro operacional visível apenas no admin.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<Textarea
						disabled={!canAddNote}
						onChange={(event) => setNoteBody(event.target.value)}
						placeholder="Ex: aguardar coleta da transportadora"
						value={noteBody}
					/>
					<Button
						disabled={isPending || !canAddNote || !noteBody.trim()}
						onClick={handleAddNote}
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
		</div>
	);
}
