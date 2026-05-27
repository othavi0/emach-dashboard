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
import { AlertTriangleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { refundOrder } from "../actions";
import type { BranchOption, OrderDetailItem, OrderStatus } from "../data";

interface RefundDialogProps {
	branches: BranchOption[];
	currentBranchId: string | null;
	currentStatus: OrderStatus;
	items: OrderDetailItem[];
	orderId: string;
}

export function RefundDialog({
	branches,
	currentBranchId,
	currentStatus,
	items,
	orderId,
}: RefundDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [creditStock, setCreditStock] = useState(currentStatus !== "shipped");
	const [selected, setSelected] = useState<
		Record<string, { branchId: string; checked: boolean }>
	>(() =>
		Object.fromEntries(
			items.map((item) => [
				item.id,
				{
					checked: true,
					branchId: currentBranchId ?? "",
				},
			])
		)
	);
	const [isPending, startTransition] = useTransition();

	const hasReason = reason.trim().length > 0;
	const checkedItems = items.filter((it) => selected[it.id]?.checked);
	const allBranchesPicked = checkedItems.every((it) =>
		Boolean(selected[it.id]?.branchId)
	);
	const canSubmit = creditStock
		? hasReason && checkedItems.length > 0 && allBranchesPicked
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
			const returnItems = creditStock
				? checkedItems
						.map((item) => ({
							orderItemId: item.id,
							branchId: selected[item.id]?.branchId ?? "",
						}))
						.filter((it) => it.branchId)
				: undefined;

			const result = await refundOrder({
				orderId,
				reason: reason.trim(),
				creditStock,
				returnItems,
			});
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success("Pedido reembolsado");
			setOpen(false);
			router.refresh();
		});
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger render={<Button variant="outline" />}>
				Marcar como reembolsado
			</DialogTrigger>
			<DialogContent className={creditStock ? "sm:max-w-2xl" : "sm:max-w-md"}>
				<DialogHeader>
					<DialogTitle>Reembolsar pedido</DialogTitle>
					<DialogDescription>
						Encerramento financeiro. Decida se os itens voltam ao estoque.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<label className="flex items-start gap-3">
						<Checkbox
							checked={creditStock}
							onCheckedChange={(v) => setCreditStock(v === true)}
						/>
						<span className="flex flex-col gap-0.5">
							<span className="font-medium text-sm">
								Devolver itens ao estoque
							</span>
							<span className="text-muted-foreground text-xs">
								Marque se os itens estão fisicamente disponíveis (não foram
								despachados ou voltaram da entrega).
							</span>
						</span>
					</label>

					{creditStock && currentStatus === "shipped" && (
						<div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-amber-950 text-xs dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
							<AlertTriangleIcon
								aria-hidden="true"
								className="mt-0.5 size-3.5 shrink-0"
							/>
							<p>
								Pedido está em <strong>shipped</strong>. Confirme que os itens
								voltaram fisicamente à filial selecionada antes de creditar.
							</p>
						</div>
					)}

					{creditStock && (
						<div className="space-y-3">
							{items.map((item) => {
								const state = selected[item.id];
								const checkboxId = `refund-item-${item.id}`;
								const branchSelectId = `refund-branch-${item.id}`;
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
							htmlFor="refund-reason"
						>
							Motivo interno (obrigatório)
						</label>
						<Textarea
							id="refund-reason"
							onChange={(event) => setReason(event.target.value)}
							placeholder="Ex: estorno integral solicitado pelo cliente."
							value={reason}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						disabled={isPending}
						onClick={() => setOpen(false)}
						variant="ghost"
					>
						Cancelar
					</Button>
					<Button
						disabled={isPending || !canSubmit}
						onClick={handleConfirm}
						variant="default"
					>
						{isPending ? (
							<>
								<Spinner /> Salvando…
							</>
						) : (
							"Confirmar reembolso"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
