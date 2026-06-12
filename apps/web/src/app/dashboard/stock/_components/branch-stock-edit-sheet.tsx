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
import { ArrowRight, ExternalLink, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";

import {
	adjustStock,
	fetchVariantBranchMovementsPage,
	getReservedQtyByVariantBranch,
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
import { type StockStatus, stockStatus } from "./stock-status";

// ─── Tipos e constantes ────────────────────────────────────────────────────

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

// ─── Movimento (linha) ───────────────────────────────────────────────────────

function MovementRow({ m }: { m: StockMovementRow }) {
	return (
		<li className="flex items-start gap-3 px-4 py-2.5 text-xs">
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
					{m.reason ? (REASON_LABEL_FULL[m.reason] ?? m.reason) : "Sem motivo"}
					{m.reasonNote ? (
						<span className="ml-1 text-muted-foreground">— {m.reasonNote}</span>
					) : null}
				</p>
				<p className="text-muted-foreground">
					{m.actorName ?? "Sistema"}
					{" · "}
					{formatRelative(m.createdAt)}
				</p>
			</div>
		</li>
	);
}

// ─── Card de movimentos (scroll interno + lazy load) ─────────────────────────

interface MovementsCardProps {
	branchId: string;
	toolId: string;
	variantId: string;
}

function MovementsCard({ branchId, toolId, variantId }: MovementsCardProps) {
	const [items, setItems] = useState<StockMovementRow[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [pending, startTransition] = useTransition();
	const scrollRef = useRef<HTMLDivElement>(null);

	// key={variantId} no caller remonta este card por variante → carrega a 1ª página.
	useEffect(() => {
		startTransition(async () => {
			const r = await fetchVariantBranchMovementsPage(
				variantId,
				branchId,
				null
			);
			setItems(r.items);
			setCursor(r.nextCursor);
			setLoaded(true);
		});
	}, [variantId, branchId]);

	const loadMore = useCallback(() => {
		if (!cursor) {
			return;
		}
		const current = cursor;
		startTransition(async () => {
			const r = await fetchVariantBranchMovementsPage(
				variantId,
				branchId,
				current
			);
			setItems((prev) => [...prev, ...r.items]);
			setCursor(r.nextCursor);
		});
	}, [cursor, variantId, branchId]);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
			<div className="border-border border-b px-4 py-3">
				<p className="font-medium text-sm">Movimentos recentes</p>
				<p className="text-muted-foreground text-xs">
					desta ferramenta nesta filial
				</p>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
				{loaded && items.length === 0 ? (
					<p className="px-4 py-6 text-center text-muted-foreground text-xs italic">
						Nenhum movimento registrado.
					</p>
				) : (
					<ul className="divide-y divide-border">
						{items.map((m) => (
							<MovementRow key={m.id} m={m} />
						))}
					</ul>
				)}
				<InfiniteSentinel
					error={null}
					hasMore={cursor !== null}
					onLoadMore={loadMore}
					pending={pending}
					root={scrollRef}
				/>
			</div>
			<Link
				className="flex items-center gap-1 border-border border-t px-4 py-3 font-medium text-primary text-xs transition-colors hover:bg-muted"
				href={`/dashboard/branches/${branchId}?tab=activity&type=stock&toolId=${toolId}`}
			>
				Ver atividade completa da filial
				<ArrowRight className="size-3" />
			</Link>
		</div>
	);
}

// ─── Componente ────────────────────────────────────────────────────────────

interface BranchStockEditSheetProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	lead?: "branch" | "tool";
	onClose: () => void;
	row: BranchStockRow | null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sheet de edição de estoque com múltiplos estados (ajuste, limites, reservado, histórico); complexidade inerente ao domínio
export function BranchStockEditSheet({
	branchId,
	branchName,
	canMutate,
	lead = "tool",
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

	const [reservedQty, setReservedQty] = useState<number | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reinicia os campos só quando a variante muda
	useEffect(() => {
		if (!row) {
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

		startAdjustTransition(async () => {
			const reserved = await getReservedQtyByVariantBranch(
				row.variantId,
				branchId
			);
			setReservedQty(reserved);
		});
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

	const status = stockStatus({
		quantity: row.quantity,
		minQty: row.minQty,
		reorderPoint: row.reorderPoint,
	});
	const statusLabel = STATUS_LABEL[status];

	const fallbackAvatar =
		lead === "branch" ? (
			<div className="flex size-full items-center justify-center text-muted-foreground">
				<Wrench aria-hidden className="size-6" />
			</div>
		) : (
			<div className="flex size-full items-center justify-center font-semibold text-[18px] text-muted-foreground">
				{row.toolName.slice(0, 2).toUpperCase()}
			</div>
		);
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
				{/* Header */}
				<SheetHeader className="flex-none border-border border-b px-6 py-5">
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
								fallbackAvatar
							)}
						</div>

						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-start gap-2">
								<SheetTitle className="text-[15px] leading-snug">
									{lead === "branch" ? branchName : row.toolName}
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
								{lead === "branch" ? (
									<>
										{row.toolName} · SKU {row.sku}
										{row.voltage ? ` · ${row.voltage}` : ""}
									</>
								) : (
									<>
										SKU {row.sku}
										{row.voltage ? ` · ${row.voltage}` : ""} · {branchName}
									</>
								)}
							</p>
							{lead === "tool" && (
								<a
									className="mt-2 inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
									href={`/dashboard/tools/${row.toolId}`}
									rel="noopener noreferrer"
									target="_blank"
								>
									<ExternalLink aria-hidden className="size-3" />
									Editar ficha da ferramenta
								</a>
							)}
						</div>
					</div>
				</SheetHeader>

				{/* Estoque atual — painel de métricas */}
				<div className="flex-none border-border border-b px-6 py-5">
					<p className="mb-3 text-muted-foreground text-xs uppercase tracking-wide">
						Estoque atual
					</p>
					<div className="grid grid-cols-4 gap-2">
						<StatCard
							colorClass={quantityColor}
							label="Atual"
							value={row.quantity}
						/>
						<StatCard label="Mínimo" value={row.minQty} />
						<StatCard label="Reposição" value={row.reorderPoint} />
						<StatCard
							colorClass={
								available !== null && available <= 0
									? "text-destructive"
									: "text-success"
							}
							label="Disponível"
							value={available ?? "—"}
						/>
					</div>
					{reservedQty !== null && reservedQty > 0 ? (
						<p className="mt-3 text-muted-foreground text-xs">
							<span className="font-semibold text-warning tabular-nums">
								{reservedQty}
							</span>{" "}
							reservado{reservedQty === 1 ? "" : "s"} em pedidos pagos/em
							preparo.
						</p>
					) : null}
				</div>

				{/* Corpo: duas colunas */}
				{canMutate ? (
					<div className="grid min-h-0 flex-1 grid-cols-2">
						{/* Esquerda — ajustar quantidade */}
						<div className="overflow-y-auto border-border border-r px-6 py-5">
							<p className="mb-3 font-medium text-sm">Ajustar quantidade</p>
							<form
								className="flex flex-col gap-3"
								onSubmit={handleAdjustSubmit}
							>
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

function StatCard({
	label,
	value,
	colorClass = "text-foreground",
}: {
	colorClass?: string;
	label: string;
	value: number | string;
}) {
	return (
		<div className="rounded-[9px] border border-border bg-card px-2 py-2.5 text-center">
			<div
				className={`font-bold text-[22px] tabular-nums leading-none ${colorClass}`}
			>
				{value}
			</div>
			<div className="mt-1.5 text-[9.5px] text-muted-foreground uppercase tracking-wider">
				{label}
			</div>
		</div>
	);
}
