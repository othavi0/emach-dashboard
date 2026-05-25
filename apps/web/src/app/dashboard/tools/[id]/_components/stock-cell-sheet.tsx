"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Separator } from "@emach/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
	adjustStock,
	getStockMovementsByVariantBranch,
	updateStockThresholds,
} from "@/app/dashboard/stock/actions";

interface InitialData {
	minQty: number;
	quantity: number;
	reorderPoint: number;
}

interface StockCellSheetProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	initial: InitialData | undefined;
	onClose: () => void;
	toolId: string;
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
}

type Reason = "entrada_compra" | "ajuste_inventario" | "perda" | "outro";

const REASON_LABEL: Record<Reason, string> = {
	entrada_compra: "Entrada compra",
	ajuste_inventario: "Ajuste inventário",
	perda: "Perda",
	outro: "Outro",
};

interface Movement {
	createdAt: Date;
	delta: number;
	reason: string | null;
	reasonNote: string | null;
}

export function StockCellSheet({
	variantId,
	variantSku,
	variantVoltage,
	branchId,
	branchName,
	initial,
	onClose,
	canMutate,
}: StockCellSheetProps) {
	const currentQty = initial?.quantity ?? 0;
	const [newQty, setNewQty] = useState(String(currentQty));
	const [reason, setReason] = useState<Reason>("entrada_compra");
	const [reasonNote, setReasonNote] = useState("");
	const [minQty, setMinQty] = useState(String(initial?.minQty ?? 0));
	const [reorderPoint, setReorderPoint] = useState(
		String(initial?.reorderPoint ?? 0)
	);
	const [movements, setMovements] = useState<Movement[]>([]);
	const [pendingAdjust, startAdjust] = useTransition();
	const [pendingLimits, startLimits] = useTransition();

	useEffect(() => {
		let cancelled = false;
		// positional args: (variantId, branchId, limit) — returns StockMovementRow[] directly
		getStockMovementsByVariantBranch(variantId, branchId, 5)
			.then((rows) => {
				if (!cancelled) {
					setMovements(
						rows.map((m) => ({
							createdAt: new Date(m.createdAt),
							delta: m.delta,
							reason: m.reason,
							reasonNote: m.reasonNote,
						}))
					);
				}
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [variantId, branchId]);

	const qtyChanged = String(currentQty) !== newQty;
	const limitsChanged =
		String(initial?.minQty ?? 0) !== minQty ||
		String(initial?.reorderPoint ?? 0) !== reorderPoint;

	function status(): "critical" | "reorder" | "ok" | "none" {
		if (!initial || initial.reorderPoint <= 0) {
			return "none";
		}
		if (initial.minQty > 0 && initial.quantity <= initial.minQty) {
			return "critical";
		}
		if (initial.quantity <= initial.reorderPoint) {
			return "reorder";
		}
		return "ok";
	}

	function handleAdjust() {
		startAdjust(async () => {
			const result = await adjustStock({
				variantId,
				branchId,
				newQty: Number(newQty),
				reason,
				reasonNote: reasonNote.trim() === "" ? undefined : reasonNote.trim(),
			});
			if (result.ok) {
				toast.success("Estoque ajustado");
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleLimits() {
		startLimits(async () => {
			const result = await updateStockThresholds({
				variantId,
				branchId,
				minQty: Number(minQty),
				reorderPoint: Number(reorderPoint),
			});
			if (result.ok) {
				toast.success("Limites atualizados");
			} else {
				toast.error(result.error);
			}
		});
	}

	const st = status();
	const statusBadgeClass =
		st === "critical"
			? "bg-destructive/15 text-destructive"
			: st === "reorder"
				? "bg-warning/15 text-warning"
				: st === "ok"
					? "bg-success/15 text-success"
					: "bg-muted text-muted-foreground";
	const statusLabel =
		st === "critical"
			? "Crítico"
			: st === "reorder"
				? "Repor"
				: st === "ok"
					? "OK"
					: "Sem limites";

	return (
		<Sheet onOpenChange={(open) => !open && onClose()} open={true}>
			<SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Ajustar estoque</SheetTitle>
					<p className="text-muted-foreground text-xs">
						<span className="font-mono">{variantSku}</span>
						{variantVoltage ? ` · ${variantVoltage}` : ""} · {branchName}
					</p>
				</SheetHeader>

				<div className="rounded-md border border-border p-3">
					<div className="flex items-baseline justify-between">
						<span className="font-semibold text-2xl tabular-nums">
							{currentQty}
						</span>
						<span
							className={`rounded-md px-2 py-0.5 text-xs ${statusBadgeClass}`}
						>
							{statusLabel}
						</span>
					</div>
					<p className="text-[11px] text-muted-foreground">atual</p>
				</div>

				{canMutate && (
					<>
						<div className="flex flex-col gap-2">
							<Label className="text-xs uppercase">Nova quantidade</Label>
							<Input
								inputMode="numeric"
								onChange={(e) => setNewQty(e.target.value)}
								value={newQty}
							/>
						</div>

						<div className="flex flex-col gap-2">
							<Label className="text-xs uppercase">Motivo</Label>
							<div className="grid grid-cols-2 gap-2">
								{(Object.keys(REASON_LABEL) as Reason[]).map((r) => (
									<Button
										key={r}
										onClick={() => setReason(r)}
										size="sm"
										variant={reason === r ? "default" : "outline"}
									>
										{REASON_LABEL[r]}
									</Button>
								))}
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<Label className="text-xs uppercase">Nota (opcional)</Label>
							<Input
								onChange={(e) => setReasonNote(e.target.value)}
								placeholder="NF #1234, fornecedor X…"
								value={reasonNote}
							/>
						</div>

						<Button
							disabled={!qtyChanged || pendingAdjust}
							onClick={handleAdjust}
						>
							{pendingAdjust ? "Salvando…" : "Salvar ajuste"}
						</Button>

						<Separator />

						<div>
							<Label className="text-xs uppercase">Limites de alerta</Label>
							<div className="mt-2 grid grid-cols-2 gap-2">
								<div>
									<Label className="text-[10px]">Mínimo</Label>
									<Input
										inputMode="numeric"
										onChange={(e) => setMinQty(e.target.value)}
										value={minQty}
									/>
								</div>
								<div>
									<Label className="text-[10px]">Ponto de repor</Label>
									<Input
										inputMode="numeric"
										onChange={(e) => setReorderPoint(e.target.value)}
										value={reorderPoint}
									/>
								</div>
							</div>
							<Button
								className="mt-2 w-full"
								disabled={!limitsChanged || pendingLimits}
								onClick={handleLimits}
								size="sm"
								variant="outline"
							>
								{pendingLimits ? "Salvando…" : "Salvar limites"}
							</Button>
						</div>
					</>
				)}

				<Separator />

				<div>
					<Label className="text-xs uppercase">Últimos movimentos</Label>
					{movements.length === 0 ? (
						<p className="mt-2 text-muted-foreground text-xs">
							Sem movimentos recentes.
						</p>
					) : (
						<ul className="mt-2 flex flex-col gap-1.5 text-xs">
							{movements.map((m, i) => (
								<li
									className="flex items-center justify-between border-border border-b py-1.5 last:border-b-0"
									key={i}
								>
									<span>
										<span
											className={
												m.delta < 0 ? "text-destructive" : "text-success"
											}
										>
											{m.delta > 0 ? `+${m.delta}` : m.delta}
										</span>
										{" · "}
										{m.reason?.replace("_", " ") ?? "—"}
										{m.reasonNote && (
											<span className="text-muted-foreground">
												{" "}
												— {m.reasonNote}
											</span>
										)}
									</span>
									<span className="text-muted-foreground">
										{m.createdAt.toLocaleDateString("pt-BR")}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
