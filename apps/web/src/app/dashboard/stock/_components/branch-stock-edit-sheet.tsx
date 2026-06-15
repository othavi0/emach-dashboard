"use client";

import { Button } from "@emach/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@emach/ui/components/command";
import { Label } from "@emach/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { ArrowRight, ChevronsUpDown, ExternalLink, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";
import { notify } from "@/lib/notify";
import type { ActiveSupplierOption } from "@/lib/suppliers";
import { useFormErrors } from "@/lib/use-form-errors";

import {
	adjustStock,
	fetchVariantBranchMovementsPage,
	getReservedQtyByVariantBranch,
	recordStockEntry,
	recordStockWriteOff,
	type StockMovementRow,
	updateStockThresholds,
} from "../actions";
import type { BranchStockRow } from "../branch-stock-data";
import {
	STOCK_MOVEMENT_REASON_LABELS,
	type StockEntryInput,
	type StockRecountInput,
	type StockWriteOffInput,
	type StockWriteOffReason,
	stockEntrySchema,
	stockRecountSchema,
	stockWriteOffSchema,
} from "./stock-movement-schema";
import { type StockStatus, stockStatus } from "./stock-status";

// ─── Tipos e constantes ────────────────────────────────────────────────────

type Mode = "entrada" | "baixa" | "ajuste";

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

// Labels para os motivos de baixa (sem depender do schema antigo)
const WRITE_OFF_REASON_LABEL: Record<StockWriteOffReason, string> = {
	perda: "Perda",
	outro: "Outro",
};

const MODE_LABEL: Record<Mode, string> = {
	entrada: "Entrada",
	baixa: "Baixa",
	ajuste: "Ajuste",
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
					{m.reason
						? (STOCK_MOVEMENT_REASON_LABELS[
								m.reason as keyof typeof STOCK_MOVEMENT_REASON_LABELS
							] ?? m.reason)
						: "Sem motivo"}
					{m.supplierName ? (
						<span className="ml-1 text-muted-foreground">
							· {m.supplierName}
						</span>
					) : null}
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
	suppliers: ActiveSupplierOption[];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sheet de edição de estoque com três modos (entrada/baixa/ajuste), limites e histórico; complexidade inerente ao domínio
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

	// Entrada
	const [qty, setQty] = useState<number | undefined>(undefined);
	const [supplierId, setSupplierId] = useState<string>("");
	// Baixa
	const [writeOffReason, setWriteOffReason] =
		useState<StockWriteOffReason>("perda");
	// Ajuste
	const [targetQty, setTargetQty] = useState<number | undefined>(undefined);
	// Compartilhado
	const [note, setNote] = useState("");

	const {
		errors: entradaErrors,
		reportValidationError: reportEntradaError,
		clearErrors: clearEntradaErrors,
	} = useFormErrors<StockEntryInput>();
	const {
		errors: baixaErrors,
		reportValidationError: reportBaixaError,
		clearErrors: clearBaixaErrors,
	} = useFormErrors<StockWriteOffInput>();
	const {
		errors: ajusteErrors,
		reportValidationError: reportAjusteError,
		clearErrors: clearAjusteErrors,
	} = useFormErrors<StockRecountInput>();

	const [isAdjusting, startAdjustTransition] = useTransition();

	// Limites
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
		setMode("entrada");
		setQty(undefined);
		setTargetQty(row.quantity);
		setSupplierId("");
		setWriteOffReason("perda");
		setNote("");
		setMinQty(row.minQty);
		setReorderPoint(row.reorderPoint);
		clearEntradaErrors();
		clearBaixaErrors();
		clearAjusteErrors();
		setReservedQty(null);

		startAdjustTransition(async () => {
			const reserved = await getReservedQtyByVariantBranch(
				row.variantId,
				branchId
			);
			setReservedQty(reserved);
		});
	}, [row?.variantId, branchId]);

	// ─── Handlers de submit ───────────────────────────────────────────────────

	function handleEntradaSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		clearEntradaErrors();
		if (!row) {
			return;
		}

		const input: StockEntryInput = {
			variantId: row.variantId,
			branchId,
			quantity: qty ?? Number.NaN,
			supplierId,
			note: note.trim() === "" ? undefined : note.trim(),
		};

		const parsed = stockEntrySchema.safeParse(input);
		if (!parsed.success) {
			reportEntradaError(parsed.error);
			return;
		}

		startAdjustTransition(async () => {
			const result = await recordStockEntry(parsed.data);
			if (result.ok) {
				notify.success("Entrada registrada");
				router.refresh();
				onClose();
			} else {
				notify.error(result.error || "Não foi possível registrar a entrada");
			}
		});
	}

	function handleBaixaSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		clearBaixaErrors();
		if (!row) {
			return;
		}

		const input: StockWriteOffInput = {
			variantId: row.variantId,
			branchId,
			quantity: qty ?? Number.NaN,
			reason: writeOffReason,
			note: note.trim() === "" ? undefined : note.trim(),
		};

		const parsed = stockWriteOffSchema.safeParse(input);
		if (!parsed.success) {
			reportBaixaError(parsed.error);
			return;
		}

		startAdjustTransition(async () => {
			const result = await recordStockWriteOff(parsed.data);
			if (result.ok) {
				notify.success("Baixa registrada");
				router.refresh();
				onClose();
			} else {
				notify.error(result.error || "Não foi possível registrar a baixa");
			}
		});
	}

	function handleAjusteSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		clearAjusteErrors();
		if (!row) {
			return;
		}

		const input: StockRecountInput = {
			variantId: row.variantId,
			branchId,
			newQty: targetQty ?? Number.NaN,
			note: note.trim() === "" ? undefined : note.trim(),
		};

		const parsed = stockRecountSchema.safeParse(input);
		if (!parsed.success) {
			reportAjusteError(parsed.error);
			return;
		}

		startAdjustTransition(async () => {
			const result = await adjustStock(parsed.data);
			if (result.ok) {
				notify.success("Estoque ajustado");
				router.refresh();
				onClose();
			} else {
				notify.error(result.error || "Não foi possível ajustar o estoque");
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
										onClick={() => {
											setMode(m);
											setNote("");
											setQty(undefined);
											setSupplierId("");
										}}
										type="button"
									>
										{MODE_LABEL[m]}
									</button>
								))}
							</div>

							{/* ── Modo: Entrada ─────────────────────────────────────────── */}
							{mode === "entrada" && (
								<form
									className="flex flex-col gap-3"
									onSubmit={handleEntradaSubmit}
								>
									<LabeledField
										error={entradaErrors.quantity}
										id="sheet-entrada-qty"
										label="Quantidade a adicionar"
										required
									>
										{(field) => (
											<MaskedInput
												{...field}
												disabled={isAdjusting}
												mask={integerMask}
												onChange={setQty}
												placeholder="0"
												value={qty}
											/>
										)}
									</LabeledField>

									<LabeledField
										error={entradaErrors.supplierId}
										id="sheet-entrada-supplier"
										label="Fornecedor"
										required
									>
										{(field) => (
											<SupplierCombobox
												ariaInvalid={field["aria-invalid"]}
												disabled={isAdjusting}
												id={field.id}
												onChange={setSupplierId}
												suppliers={suppliers}
												value={supplierId}
											/>
										)}
									</LabeledField>

									<LabeledField
										error={entradaErrors.note}
										id="sheet-entrada-note"
										label="Observação"
									>
										{(field) => (
											<Textarea
												{...field}
												disabled={isAdjusting}
												onChange={(e) => setNote(e.target.value)}
												placeholder="NF #1234, lote X…"
												rows={2}
												value={note}
											/>
										)}
									</LabeledField>

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
											"Registrar entrada"
										)}
									</Button>
								</form>
							)}

							{/* ── Modo: Baixa ───────────────────────────────────────────── */}
							{mode === "baixa" && (
								<form
									className="flex flex-col gap-3"
									onSubmit={handleBaixaSubmit}
								>
									<LabeledField
										error={baixaErrors.quantity}
										id="sheet-baixa-qty"
										label="Quantidade a remover"
										required
									>
										{(field) => (
											<MaskedInput
												{...field}
												disabled={isAdjusting}
												mask={integerMask}
												onChange={setQty}
												placeholder="0"
												value={qty}
											/>
										)}
									</LabeledField>

									<div className="flex flex-col gap-1.5">
										<Label>Motivo</Label>
										<div className="flex gap-2">
											{(["perda", "outro"] as StockWriteOffReason[]).map(
												(r) => (
													<Button
														disabled={isAdjusting}
														key={r}
														onClick={() => setWriteOffReason(r)}
														size="sm"
														type="button"
														variant={
															writeOffReason === r ? "default" : "outline"
														}
													>
														{WRITE_OFF_REASON_LABEL[r]}
													</Button>
												)
											)}
										</div>
									</div>

									<LabeledField
										error={baixaErrors.note}
										id="sheet-baixa-note"
										label="Observação"
										required={writeOffReason === "outro"}
									>
										{(field) => (
											<Textarea
												{...field}
												disabled={isAdjusting}
												onChange={(e) => setNote(e.target.value)}
												placeholder={
													writeOffReason === "outro"
														? "Descreva o motivo da baixa…"
														: "Opcional"
												}
												rows={2}
												value={note}
											/>
										)}
									</LabeledField>

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
											"Registrar baixa"
										)}
									</Button>
								</form>
							)}

							{/* ── Modo: Ajuste ──────────────────────────────────────────── */}
							{mode === "ajuste" && (
								<form
									className="flex flex-col gap-3"
									onSubmit={handleAjusteSubmit}
								>
									<LabeledField
										error={ajusteErrors.newQty}
										id="sheet-ajuste-qty"
										label="Quantidade contada"
										required
									>
										{(field) => (
											<MaskedInput
												{...field}
												disabled={isAdjusting}
												mask={integerMask}
												onChange={setTargetQty}
												placeholder={`Atual: ${row.quantity}`}
												value={targetQty}
											/>
										)}
									</LabeledField>

									<LabeledField
										error={ajusteErrors.note}
										id="sheet-ajuste-note"
										label="Observação"
									>
										{(field) => (
											<Textarea
												{...field}
												disabled={isAdjusting}
												onChange={(e) => setNote(e.target.value)}
												placeholder="Recontagem física, data…"
												rows={2}
												value={note}
											/>
										)}
									</LabeledField>

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

// Picker de fornecedor com busca (Popover + Command) — fornecedor pode ser muitos;
// CommandList já traz altura máxima + scroll. Single-select (fecha ao escolher).
function SupplierCombobox({
	suppliers,
	value,
	onChange,
	disabled,
	id,
	ariaInvalid,
}: {
	ariaInvalid?: boolean;
	disabled?: boolean;
	id?: string;
	onChange: (id: string) => void;
	suppliers: ActiveSupplierOption[];
	value: string;
}) {
	const [open, setOpen] = useState(false);
	const selected = suppliers.find((s) => s.id === value);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				aria-invalid={ariaInvalid}
				className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
				disabled={disabled}
				id={id}
				render={<button type="button" />}
			>
				<span
					className={selected ? "text-foreground" : "text-muted-foreground"}
				>
					{selected ? selected.name : "Selecione o fornecedor"}
				</span>
				<ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-(--anchor-width) p-0">
				<Command>
					<CommandInput placeholder="Buscar fornecedor…" />
					<CommandList>
						<CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
						<CommandGroup>
							{suppliers.map((s) => (
								<CommandItem
									data-checked={s.id === value}
									key={s.id}
									onSelect={() => {
										onChange(s.id);
										setOpen(false);
									}}
									value={s.name}
								>
									{s.name}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
