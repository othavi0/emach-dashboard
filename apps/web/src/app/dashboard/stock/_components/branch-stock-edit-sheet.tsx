"use client";

import { Button } from "@emach/ui/components/button";
import { Label } from "@emach/ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";

import {
	adjustStock,
	getReservedQtyByVariantBranch,
	getStockMovementsByVariantBranch,
	type StockMovementRow,
	updateStockThresholds,
} from "../actions";
import type { BranchStockRow } from "../branch-stock-data";
import {
	STOCK_MOVEMENT_REASONS_UI,
	type StockAdjustmentUiInput,
	type StockMovementReasonUi,
	stockAdjustmentUiSchema,
} from "./stock-adjustment-schema";

// ─── Tipos e constantes ────────────────────────────────────────────────────

type StockStatus = "critical" | "none" | "ok" | "reorder";

function resolveStatus(row: BranchStockRow): StockStatus {
	if (row.minQty > 0 && row.quantity <= row.minQty) {
		return "critical";
	}
	if (
		row.reorderPoint > 0 &&
		row.quantity > row.minQty &&
		row.quantity <= row.reorderPoint
	) {
		return "reorder";
	}
	if (row.minQty === 0 && row.reorderPoint === 0) {
		return "none";
	}
	return "ok";
}

const STATUS_LABEL: Record<StockStatus, string | null> = {
	critical: "Crítico",
	reorder: "Repor",
	ok: "OK",
	none: null,
};

const STATUS_CLASS: Record<StockStatus, string> = {
	critical: "bg-destructive/15 text-destructive",
	reorder: "bg-warning/15 text-warning",
	ok: "bg-success/15 text-success",
	none: "bg-muted text-muted-foreground",
};

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

function MovementsList({ movements }: { movements: StockMovementRow[] }) {
	return (
		<ul className="flex flex-col gap-2.5">
			{movements.map((m) => (
				<li className="flex items-start gap-3 text-xs" key={m.id}>
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
							{m.actorName ?? "Sistema"}
							{" · "}
							{formatRelative(m.createdAt)}
						</p>
					</div>
				</li>
			))}
		</ul>
	);
}

// ─── Componente ────────────────────────────────────────────────────────────

interface BranchStockEditSheetProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	onClose: () => void;
	row: BranchStockRow | null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sheet de edição de estoque com múltiplos estados (carregando, editando limites, histórico); complexidade inerente ao domínio
export function BranchStockEditSheet({
	branchId,
	branchName,
	canMutate,
	onClose,
	row,
}: BranchStockEditSheetProps) {
	const router = useRouter();

	const [newQty, setNewQty] = useState<number | undefined>(undefined);
	const [reason, setReason] = useState<StockMovementReasonUi>("entrada_compra");
	const [reasonNote, setReasonNote] = useState("");
	const [errors, setErrors] = useState<
		Partial<Record<keyof StockAdjustmentUiInput, string>>
	>({});
	const [isAdjusting, startAdjustTransition] = useTransition();

	const [minQty, setMinQty] = useState<number | undefined>(undefined);
	const [reorderPoint, setReorderPoint] = useState<number | undefined>(
		undefined
	);
	const [isUpdatingLimits, startLimitsTransition] = useTransition();

	const [movements, setMovements] = useState<StockMovementRow[]>([]);
	const [isLoadingMovements, startMovementsTransition] = useTransition();
	const [reservedQty, setReservedQty] = useState<number | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: dependência intencional em row?.variantId — effect só re-executa quando a variante muda, não em cada mutação de row
	useEffect(() => {
		if (!row) {
			setMovements([]);
			setReservedQty(null);
			return;
		}
		setNewQty(row.quantity);
		setReason("entrada_compra");
		setReasonNote("");
		setMinQty(row.minQty);
		setReorderPoint(row.reorderPoint);
		setErrors({});
		setReservedQty(null);

		startMovementsTransition(async () => {
			const [data, reserved] = await Promise.all([
				getStockMovementsByVariantBranch(row.variantId, branchId),
				getReservedQtyByVariantBranch(row.variantId, branchId),
			]);
			setMovements(data);
			setReservedQty(reserved);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [row?.variantId, branchId]);

	function handleAdjustSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setErrors({});

		if (!row) {
			return;
		}

		const input: StockAdjustmentUiInput = {
			variantId: row.variantId,
			branchId,
			newQty: newQty ?? Number.NaN,
			reason,
			reasonNote: reasonNote.trim() === "" ? undefined : reasonNote.trim(),
		};

		const parsed = stockAdjustmentUiSchema.safeParse(input);
		if (!parsed.success) {
			setErrors(zodErrorsToMap(parsed.error));
			return;
		}

		startAdjustTransition(async () => {
			const result = await adjustStock(parsed.data);
			if (result.ok) {
				toast.success("Estoque atualizado");
				router.refresh();
				onClose();
			} else {
				toast.error(result.error || "Não foi possível ajustar o estoque");
			}
		});
	}

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
				toast.success("Limites atualizados");
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível atualizar os limites");
			}
		});
	}

	if (!row) {
		return null;
	}

	const status = resolveStatus(row);
	const statusLabel = STATUS_LABEL[status];
	const hasLimits = row.minQty > 0 || row.reorderPoint > 0;
	let quantityColor = "text-foreground";
	if (row.quantity === 0 || status === "critical") {
		quantityColor = "text-destructive";
	} else if (status === "reorder") {
		quantityColor = "text-warning";
	}
	const limitsDirty =
		minQty !== row.minQty || reorderPoint !== row.reorderPoint;

	let movementsContent: React.ReactNode;
	if (isLoadingMovements) {
		movementsContent = (
			<div className="flex justify-center py-4">
				<Spinner />
			</div>
		);
	} else if (movements.length === 0) {
		movementsContent = (
			<p className="text-muted-foreground text-sm italic">
				Nenhum movimento registrado.
			</p>
		);
	} else {
		movementsContent = <MovementsList movements={movements} />;
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
			<SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[580px]">
				{/* Header */}
				<SheetHeader className="border-border border-b px-6 py-5">
					<div className="flex items-start gap-3">
						<div className="size-14 flex-shrink-0 overflow-hidden rounded-[8px] bg-muted">
							{row.imageUrl ? (
								// biome-ignore lint/performance/noImgElement: Supabase public URL
								// biome-ignore lint/correctness/useImageSize: fixed size via Tailwind
								<img
									alt=""
									className="size-full object-cover"
									src={row.imageUrl}
								/>
							) : (
								<div className="flex size-full items-center justify-center font-semibold text-[18px] text-muted-foreground">
									{row.toolName.slice(0, 2).toUpperCase()}
								</div>
							)}
						</div>

						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-start gap-2">
								<SheetTitle className="text-[15px] leading-snug">
									{row.toolName}
								</SheetTitle>
								{statusLabel && (
									<span
										className={`inline-flex items-center rounded-md px-2 py-0.5 font-medium text-[11px] ${STATUS_CLASS[status]}`}
									>
										{statusLabel}
									</span>
								)}
							</div>
							<p className="mt-0.5 text-muted-foreground text-xs">
								SKU {row.sku}
								{row.voltage ? ` · ${row.voltage}` : ""}
								{" · "}
								{branchName}
							</p>
							<a
								className="mt-2 inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
								href={`/dashboard/tools/${row.toolId}`}
								rel="noopener noreferrer"
								target="_blank"
							>
								<ExternalLink aria-hidden className="size-3" />
								Editar ficha da ferramenta
							</a>
						</div>
					</div>
				</SheetHeader>

				{/* Estoque atual */}
				<div className="border-border border-b px-6 py-5">
					<p className="mb-3 text-muted-foreground text-xs uppercase tracking-wide">
						Estoque atual
					</p>
					<div className="flex items-end justify-between gap-4">
						<div>
							<span
								className={`font-bold text-[36px] tabular-nums leading-none ${quantityColor}`}
							>
								{row.quantity}
							</span>
							<span className="ml-2 text-muted-foreground text-sm">unid.</span>
						</div>
						<div className="text-right text-muted-foreground text-xs tabular-nums">
							{hasLimits ? (
								<>
									<p>Mínimo: {row.minQty}</p>
									<p>Reposição: {row.reorderPoint}</p>
								</>
							) : (
								<p className="italic">Sem limites</p>
							)}
						</div>
					</div>
					{reservedQty !== null && (
						<div className="mt-3 flex items-center gap-4 border-border border-t pt-3 text-xs">
							<div className="flex items-baseline gap-1.5">
								<span className="text-muted-foreground">Reservado:</span>
								<span
									className={`font-semibold tabular-nums ${
										reservedQty > 0 ? "text-warning" : "text-foreground"
									}`}
								>
									{reservedQty}
								</span>
							</div>
							<div className="flex items-baseline gap-1.5">
								<span className="text-muted-foreground">Disponível:</span>
								<span
									className={`font-semibold tabular-nums ${
										row.quantity - reservedQty <= 0
											? "text-destructive"
											: "text-success"
									}`}
								>
									{Math.max(0, row.quantity - reservedQty)}
								</span>
							</div>
							{reservedQty > 0 && (
								<span className="text-muted-foreground/70 italic">
									em pedidos pagos/em preparo
								</span>
							)}
						</div>
					)}
				</div>

				{/* Ajustar quantidade */}
				{canMutate && (
					<div className="border-border border-b px-6 py-5">
						<p className="mb-3 font-medium text-sm">Ajustar quantidade</p>
						<form className="flex flex-col gap-3" onSubmit={handleAdjustSubmit}>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="sheet-new-qty">
									Nova quantidade
									<span className="text-destructive"> *</span>
								</Label>
								<MaskedInput
									disabled={isAdjusting}
									id="sheet-new-qty"
									mask={integerMask}
									onChange={setNewQty}
									placeholder={`Atual: ${row.quantity}`}
									value={newQty}
								/>
								{errors.newQty && (
									<p className="text-destructive text-xs">{errors.newQty}</p>
								)}
							</div>

							<div className="flex flex-col gap-1.5">
								<Label>Motivo</Label>
								<div className="grid grid-cols-2 gap-2">
									{STOCK_MOVEMENT_REASONS_UI.map((r) => (
										<Button
											disabled={isAdjusting}
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

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="sheet-reason-note">
									Observação
									{reason === "outro" && (
										<span className="text-destructive"> *</span>
									)}
								</Label>
								<Textarea
									disabled={isAdjusting}
									id="sheet-reason-note"
									onChange={(e) => setReasonNote(e.target.value)}
									placeholder="NF #1234, fornecedor X…"
									rows={2}
									value={reasonNote}
								/>
								{errors.reasonNote && (
									<p className="text-destructive text-xs">
										{errors.reasonNote}
									</p>
								)}
							</div>

							<Button
								className="self-start"
								disabled={isAdjusting}
								size="sm"
								type="submit"
							>
								{isAdjusting ? (
									<>
										<Spinner /> Salvando…
									</>
								) : (
									"Salvar ajuste"
								)}
							</Button>
						</form>
					</div>
				)}

				{/* Limites de alerta */}
				{canMutate && (
					<div className="border-border border-b px-6 py-5">
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
				)}

				{/* Histórico */}
				<div className="px-6 py-5">
					<p className="mb-3 font-medium text-sm">Últimos movimentos</p>
					{movementsContent}
				</div>
			</SheetContent>
		</Sheet>
	);
}
