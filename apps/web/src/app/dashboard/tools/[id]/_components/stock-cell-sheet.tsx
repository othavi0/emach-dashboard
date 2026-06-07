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
import { Textarea } from "@emach/ui/components/textarea";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	STOCK_MOVEMENT_REASONS_UI,
	type StockAdjustmentUiInput,
	type StockMovementReasonUi,
	stockAdjustmentUiSchema,
} from "@/app/dashboard/stock/_components/stock-adjustment-schema";
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

const REASON_LABEL_UI: Record<StockMovementReasonUi, string> = {
	entrada_compra: "Entrada compra",
	ajuste_inventario: "Ajuste inventário",
	perda: "Perda",
	outro: "Outro",
};

const REASON_LABEL_FULL: Record<string, string> = {
	entrada_compra: "Entrada compra",
	saida_venda: "Saída venda",
	ajuste_inventario: "Ajuste inventário",
	perda: "Perda",
	outro: "Outro",
};

const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

function formatRelative(date: Date): string {
	const diffMs = date.getTime() - Date.now();
	const absDays = Math.abs(diffMs) / 86_400_000;
	if (absDays < 1) {
		const absHours = Math.abs(diffMs) / 3_600_000;
		if (absHours < 1) {
			return RELATIVE.format(Math.round(diffMs / 60_000), "minute");
		}
		return RELATIVE.format(Math.round(diffMs / 3_600_000), "hour");
	}
	const diffDays = Math.round(diffMs / 86_400_000);
	if (absDays < 30) {
		return RELATIVE.format(diffDays, "day");
	}
	return RELATIVE.format(Math.round(diffDays / 30), "month");
}

function zodErrorsToMap(error: {
	issues: { path: unknown[]; message: string }[];
}): Partial<Record<keyof StockAdjustmentUiInput, string>> {
	const map: Partial<Record<keyof StockAdjustmentUiInput, string>> = {};
	for (const issue of error.issues) {
		const key = issue.path[0] as keyof StockAdjustmentUiInput | undefined;
		if (key && !map[key]) {
			map[key] = issue.message;
		}
	}
	return map;
}

interface Movement {
	actorName: string | null;
	createdAt: Date;
	delta: number;
	id: string;
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
	const [reason, setReason] = useState<StockMovementReasonUi>("entrada_compra");
	const [reasonNote, setReasonNote] = useState("");
	const [errors, setErrors] = useState<
		Partial<Record<keyof StockAdjustmentUiInput, string>>
	>({});
	const [minQty, setMinQty] = useState(String(initial?.minQty ?? 0));
	const [reorderPoint, setReorderPoint] = useState(
		String(initial?.reorderPoint ?? 0)
	);
	const [movements, setMovements] = useState<Movement[]>([]);
	const [pendingAdjust, startAdjust] = useTransition();
	const [pendingLimits, startLimits] = useTransition();

	useEffect(() => {
		let cancelled = false;
		getStockMovementsByVariantBranch(variantId, branchId, 5)
			.then((rows) => {
				if (!cancelled) {
					setMovements(
						rows.map((m) => ({
							actorName: m.actorName,
							createdAt: new Date(m.createdAt),
							delta: m.delta,
							id: m.id,
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
		setErrors({});

		const input: StockAdjustmentUiInput = {
			variantId,
			branchId,
			newQty: Number(newQty),
			reason,
			reasonNote: reasonNote.trim() === "" ? undefined : reasonNote.trim(),
		};

		const parsed = stockAdjustmentUiSchema.safeParse(input);
		if (!parsed.success) {
			setErrors(zodErrorsToMap(parsed.error));
			return;
		}

		startAdjust(async () => {
			const result = await adjustStock(parsed.data);
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
	let statusBadgeClass = "bg-muted text-muted-foreground";
	let statusLabel = "Sem limites";
	if (st === "critical") {
		statusBadgeClass = "bg-destructive/15 text-destructive";
		statusLabel = "Crítico";
	} else if (st === "reorder") {
		statusBadgeClass = "bg-warning/15 text-warning";
		statusLabel = "Repor";
	} else if (st === "ok") {
		statusBadgeClass = "bg-success/15 text-success";
		statusLabel = "OK";
	}

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
							{errors.newQty && (
								<p className="text-destructive text-xs">{errors.newQty}</p>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<Label className="text-xs uppercase">Motivo</Label>
							<div className="grid grid-cols-2 gap-2">
								{STOCK_MOVEMENT_REASONS_UI.map((r) => (
									<Button
										key={r}
										onClick={() => setReason(r)}
										size="sm"
										type="button"
										variant={reason === r ? "default" : "outline"}
									>
										{REASON_LABEL_UI[r]}
									</Button>
								))}
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<Label className="text-xs uppercase">
								Nota
								{reason === "outro" ? (
									<span className="text-destructive"> *</span>
								) : (
									<span className="text-muted-foreground"> (opcional)</span>
								)}
							</Label>
							<Textarea
								onChange={(e) => setReasonNote(e.target.value)}
								placeholder="NF #1234, fornecedor X…"
								rows={2}
								value={reasonNote}
							/>
							{errors.reasonNote && (
								<p className="text-destructive text-xs">{errors.reasonNote}</p>
							)}
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
						<ul className="mt-2 flex flex-col gap-2.5 text-xs">
							{movements.map((m) => (
								<li className="flex items-start gap-3" key={m.id}>
									<span
										className={`flex-shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums ${
											m.delta >= 0
												? "bg-success/15 text-success"
												: "bg-destructive/15 text-destructive"
										}`}
									>
										{m.delta >= 0 ? "+" : ""}
										{m.delta}
									</span>
									<div className="min-w-0 flex-1">
										<p className="text-foreground">
											{m.reason
												? (REASON_LABEL_FULL[m.reason] ?? m.reason)
												: "Sem motivo"}
											{m.reasonNote ? (
												<span className="ml-1 text-muted-foreground">
													— {m.reasonNote}
												</span>
											) : null}
										</p>
										<p className="text-muted-foreground">
											{m.actorName ?? "Sistema"} · {formatRelative(m.createdAt)}
										</p>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
