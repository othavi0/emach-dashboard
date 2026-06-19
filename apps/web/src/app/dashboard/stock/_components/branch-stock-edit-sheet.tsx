"use client";

import { Button } from "@emach/ui/components/button";
import { Label } from "@emach/ui/components/label";
import { Sheet, SheetContent } from "@emach/ui/components/sheet";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";
import { notify } from "@/lib/notify";
import type { ActiveSupplierOption } from "@/lib/suppliers";

import {
	getReservedQtyByVariantBranchAction,
	updateStockThresholds,
} from "../actions";
import type { BranchStockRow } from "../branch-stock-data";
import { MovementsCard } from "./branch-stock-movements-card";
import { SheetHead } from "./branch-stock-sheet-head";
import { StatsPanel } from "./branch-stock-stats-panel";
import { StockEntryForm } from "./stock-entry-form";
import { StockRecountForm } from "./stock-recount-form";
import { type StockStatus, stockStatus } from "./stock-status";
import { StockWriteOffForm } from "./stock-write-off-form";

// ─── Tipos e constantes ────────────────────────────────────────────────────

type Mode = "entrada" | "baixa" | "ajuste";

const STATUS_LABEL: Record<StockStatus, string | null> = {
	critical: "Crítico",
	reorder: "Repor",
	ok: "OK",
	none: null,
};

const MODE_LABEL: Record<Mode, string> = {
	entrada: "Entrada",
	baixa: "Baixa",
	ajuste: "Ajuste",
};

// ─── Componente ────────────────────────────────────────────────────────────

interface BranchStockEditSheetProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	lead?: "branch" | "tool";
	onClose: () => void;
	row: BranchStockRow | null;
	suppliers: ActiveSupplierOption[];
}

export function BranchStockEditSheet({
	branchId,
	branchName,
	canMutate,
	lead = "tool",
	onClose,
	row,
	suppliers,
}: BranchStockEditSheetProps) {
	const router = useRouter();

	// ─── Estado do modo ───────────────────────────────────────────────────────
	const [mode, setMode] = useState<Mode>("entrada");

	// Limites
	const [minQty, setMinQty] = useState<number | undefined>(undefined);
	const [reorderPoint, setReorderPoint] = useState<number | undefined>(
		undefined
	);
	const [isUpdatingLimits, startLimitsTransition] = useTransition();

	const [reservedQty, setReservedQty] = useState<number | null>(null);
	const [isAdjusting, startAdjustTransition] = useTransition();

	// biome-ignore lint/correctness/useExhaustiveDependencies: reinicia os campos só quando a variante muda
	useEffect(() => {
		if (!row) {
			setReservedQty(null);
			return;
		}
		setMode("entrada");
		setMinQty(row.minQty);
		setReorderPoint(row.reorderPoint);
		setReservedQty(null);

		startAdjustTransition(async () => {
			const reserved = await getReservedQtyByVariantBranchAction(
				row.variantId,
				branchId
			);
			setReservedQty(reserved);
		});
	}, [row?.variantId, branchId]);

	function handleLimitsSubmit() {
		if (!row || minQty === undefined || reorderPoint === undefined) {
			return;
		}
		startLimitsTransition(async () => {
			const result = await updateStockThresholds({
				variantId: row.variantId,
				branchId,
				minQty,
				reorderPoint,
			});
			if (result.ok) {
				notify.success("Limites atualizados");
				router.refresh();
			} else {
				notify.error(result.error || "Não foi possível atualizar os limites");
			}
		});
	}

	if (!row) {
		return null;
	}

	const status = stockStatus({
		quantity: row.quantity,
		minQty: row.minQty,
		reorderPoint: row.reorderPoint,
	});
	const statusLabel = STATUS_LABEL[status];

	let quantityColor = "text-foreground";
	if (row.quantity === 0 || status === "critical") {
		quantityColor = "text-destructive";
	} else if (status === "reorder") {
		quantityColor = "text-warning";
	}
	const available =
		reservedQty === null ? null : Math.max(0, row.quantity - reservedQty);
	const limitsDirty =
		minQty !== row.minQty || reorderPoint !== row.reorderPoint;

	function handleSuccess() {
		router.refresh();
		onClose();
	}

	return (
		<Sheet
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open={row !== null}
		>
			<SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-4xl">
				<SheetHead
					branchName={branchName}
					lead={lead}
					row={row}
					status={status}
					statusLabel={statusLabel}
				/>

				<StatsPanel
					available={available}
					quantityColor={quantityColor}
					reservedQty={reservedQty}
					row={row}
				/>

				{/* Corpo: duas colunas */}
				{canMutate ? (
					<div className="grid min-h-0 flex-1 grid-cols-2">
						{/* Esquerda — operações de estoque */}
						<div className="overflow-y-auto border-border border-r px-6 py-5">
							<p className="mb-3 font-medium text-sm">Movimentar estoque</p>

							{/* Segmented control — padrão canônico: active coral preenchido
							    (espelha base Tabs / ActivityFilters / ledger-filters) */}
							<div className="mb-4 flex gap-1 rounded-md bg-muted p-[3px] ring-1 ring-border/60">
								{(["entrada", "baixa", "ajuste"] as Mode[]).map((m) => (
									<button
										className={`flex-1 rounded-sm px-2 py-1 font-medium text-xs transition-all ${
											mode === m
												? "bg-primary text-primary-foreground shadow-sm"
												: "text-muted-foreground hover:text-foreground"
										}`}
										key={m}
										onClick={() => setMode(m)}
										type="button"
									>
										{MODE_LABEL[m]}
									</button>
								))}
							</div>

							{/* key={mode} desmonta e remonta cada sub-form ao trocar de modo,
							    zerando o estado interno (qty, note, etc.) — replica o reset
							    explícito que existia no segmented control do monolítico. */}
							{mode === "entrada" && (
								<StockEntryForm
									branchId={branchId}
									isDisabled={isAdjusting}
									key="entrada"
									onSuccess={handleSuccess}
									suppliers={suppliers}
									variantId={row.variantId}
								/>
							)}
							{mode === "baixa" && (
								<StockWriteOffForm
									branchId={branchId}
									isDisabled={isAdjusting}
									key="baixa"
									onSuccess={handleSuccess}
									variantId={row.variantId}
								/>
							)}
							{mode === "ajuste" && (
								<StockRecountForm
									branchId={branchId}
									currentQty={row.quantity}
									isDisabled={isAdjusting}
									key="ajuste"
									onSuccess={handleSuccess}
									variantId={row.variantId}
								/>
							)}
						</div>

						{/* Direita — limites + movimentos */}
						<div className="flex min-h-0 flex-col gap-4 p-4">
							<div className="flex-none rounded-[10px] border border-border bg-card p-4">
								<p className="mb-3 font-medium text-sm">Limites de alerta</p>
								<div className="grid grid-cols-2 gap-3">
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="sheet-min-qty">Mínimo</Label>
										<MaskedInput
											disabled={isUpdatingLimits}
											id="sheet-min-qty"
											mask={integerMask}
											onChange={setMinQty}
											value={minQty}
										/>
									</div>
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="sheet-reorder-point">Reposição</Label>
										<MaskedInput
											disabled={isUpdatingLimits}
											id="sheet-reorder-point"
											mask={integerMask}
											onChange={setReorderPoint}
											value={reorderPoint}
										/>
									</div>
								</div>
								<Button
									className="mt-3"
									disabled={isUpdatingLimits || !limitsDirty}
									onClick={handleLimitsSubmit}
									size="sm"
									type="button"
									variant="outline"
								>
									{isUpdatingLimits ? (
										<>
											<Spinner /> Salvando…
										</>
									) : (
										"Salvar limites"
									)}
								</Button>
							</div>

							<MovementsCard
								branchId={branchId}
								key={row.variantId}
								toolId={row.toolId}
								variantId={row.variantId}
							/>
						</div>
					</div>
				) : (
					<div className="min-h-0 flex-1 p-4">
						<MovementsCard
							branchId={branchId}
							key={row.variantId}
							toolId={row.toolId}
							variantId={row.variantId}
						/>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
