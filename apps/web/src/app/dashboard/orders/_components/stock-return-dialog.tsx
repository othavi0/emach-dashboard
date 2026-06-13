"use client";

import { Button } from "@emach/ui/components/button";
import { Checkbox } from "@emach/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@emach/ui/components/dialog";
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
import { notify } from "@/lib/notify";
import { updateOrderStatus } from "../actions";
import type { BranchOption, OrderDetailItem, OrderStatus } from "../data";

interface StockReturnDialogProps {
	branches: BranchOption[];
	currentBranchId: string | null;
	items: OrderDetailItem[];
	orderId: string;
	toStatus: Extract<OrderStatus, "canceled" | "returned">;
	triggerLabel: string;
	triggerVariant?: "destructive" | "warning" | "outline";
}

export function StockReturnDialog({
	branches,
	currentBranchId,
	items,
	orderId,
	toStatus,
	triggerLabel,
	triggerVariant = "outline",
}: StockReturnDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");

	// Item picker state — only used when toStatus === "returned"
	const [selected, setSelected] = useState<
		Record<string, { branchId: string; checked: boolean }>
	>(() =>
		Object.fromEntries(
			items.map((item) => [
				item.id,
				{
					checked: Boolean(currentBranchId),
					branchId: currentBranchId ?? "",
				},
			])
		)
	);
	const [isPending, startTransition] = useTransition();

	const showItemPicker = toStatus === "returned";

	// Reason is mandatory for both flows. For "returned" additionally every
	// checked item must have a branchId selected.
	const hasReason = reason.trim().length > 0;
	const canSubmit = showItemPicker
		? hasReason &&
			Object.values(selected).every(
				(entry) => !entry.checked || Boolean(entry.branchId)
			)
		: hasReason;

	function toggleItem(itemId: string, checked: boolean) {
		setSelected((current) => ({
			...current,
			[itemId]: {
				branchId: current[itemId]?.branchId ?? currentBranchId ?? "",
				checked,
			},
		}));
	}

	function updateBranch(itemId: string, branchId: string) {
		setSelected((current) => ({
			...current,
			[itemId]: {
				branchId,
				checked: current[itemId]?.checked ?? false,
			},
		}));
	}

	function handleConfirm() {
		startTransition(async () => {
			// Build returnItems only for the "returned" flow
			const returnItems = showItemPicker
				? items
						.filter((item) => selected[item.id]?.checked)
						.map((item) => ({
							orderItemId: item.id,
							branchId: selected[item.id]?.branchId ?? "",
						}))
						.filter((item) => item.branchId)
				: undefined;

			try {
				const result = await updateOrderStatus({
					orderId,
					toStatus,
					reason: reason.trim() || undefined,
					returnItems,
				});

				if (!result.ok) {
					notify.error(result.error);
					return;
				}

				notify.success(
					toStatus === "canceled" ? "Pedido cancelado" : "Devolução registrada"
				);
				setOpen(false);
				router.refresh();
			} catch {
				notify.error("Não foi possível atualizar o pedido");
			}
		});
	}

	const dialogDescription = showItemPicker
		? "Escolha quais itens voltam ao estoque e em qual filial a devolução deve ser creditada. O motivo é obrigatório."
		: "O cancelamento não devolve itens ao estoque. Informe o motivo interno para o registro.";

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger render={<Button variant={triggerVariant} />}>
				{triggerLabel}
			</DialogTrigger>
			<DialogContent
				className={showItemPicker ? "sm:max-w-2xl" : "sm:max-w-md"}
			>
				<DialogHeader>
					<DialogTitle>{triggerLabel}</DialogTitle>
					<DialogDescription>{dialogDescription}</DialogDescription>
				</DialogHeader>

				{/* Item picker — only for "returned" */}
				{showItemPicker && (
					<div className="space-y-3">
						{items.map((item) => {
							const state = selected[item.id];
							const checkboxId = `return-item-${item.id}`;
							const branchSelectId = `return-branch-${item.id}`;
							return (
								<div
									className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_10rem]"
									key={item.id}
								>
									<label
										className="flex items-start gap-3"
										htmlFor={checkboxId}
									>
										<Checkbox
											checked={state?.checked ?? false}
											id={checkboxId}
											onCheckedChange={(value) =>
												toggleItem(item.id, value === true)
											}
										/>
										<span className="flex flex-col gap-1">
											<span className="font-medium text-sm">{item.name}</span>
											<span className="text-muted-foreground text-xs">
												{item.sku ?? "Sem SKU"} • qtd {item.quantity}
											</span>
										</span>
									</label>

									<div className="flex flex-col gap-1">
										<label
											className="text-muted-foreground text-xs"
											htmlFor={branchSelectId}
										>
											Filial de retorno
										</label>
										<Select
											disabled={!state?.checked}
											onValueChange={(v) =>
												updateBranch(item.id, !v || v === "__none__" ? "" : v)
											}
											value={state?.branchId || "__none__"}
										>
											<SelectTrigger id={branchSelectId}>
												<SelectValue>
													{(v: string) =>
														v === "__none__"
															? "Selecionar"
															: (branches.find((b) => b.id === v)?.name ??
																"Selecionar")
													}
												</SelectValue>
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													<SelectItem value="__none__">Selecionar</SelectItem>
													{branches.map((branch) => (
														<SelectItem key={branch.id} value={branch.id}>
															{branch.name}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
									</div>
								</div>
							);
						})}
					</div>
				)}

				<div className="space-y-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="return-reason"
					>
						Motivo interno
					</label>
					<Textarea
						id="return-reason"
						onChange={(event) => setReason(event.target.value)}
						placeholder={
							toStatus === "canceled"
								? "Ex: cliente desistiu, pagamento não confirmado..."
								: "Ex: embalagem danificada, produto com defeito..."
						}
						value={reason}
					/>
				</div>

				<DialogFooter>
					<Button
						disabled={isPending}
						onClick={() => setOpen(false)}
						variant="ghost"
					>
						Fechar
					</Button>
					<Button
						disabled={isPending || !canSubmit}
						onClick={handleConfirm}
						variant={toStatus === "canceled" ? "destructive" : "warning"}
					>
						{isPending ? (
							<>
								<Spinner /> Salvando…
							</>
						) : (
							"Confirmar"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
