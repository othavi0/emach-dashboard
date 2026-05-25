"use client";

import { Button } from "@emach/ui/components/button";
import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";

import {
	adjustStock,
	getStockMovementsByVariantBranch,
	type StockMovementRow,
} from "../actions";
import type { BranchStockRow } from "../branch-stock-data";
import { BranchStockThresholdInputs } from "./branch-stock-threshold-inputs";
import {
	type StockAdjustmentInput,
	stockAdjustmentSchema,
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
	critical: "bg-red-950/60 text-red-400 border border-red-900/40",
	reorder: "bg-amber-950/60 text-amber-400 border border-amber-900/40",
	ok: "bg-green-950/60 text-green-400 border border-green-900/40",
	none: "",
};

const REASON_OPTIONS = [
	{ label: "Sem motivo", value: "__none__" },
	{ label: "Entrada de compra", value: "entrada_compra" },
	{ label: "Saída de venda", value: "saida_venda" },
	{ label: "Ajuste de inventário", value: "ajuste_inventario" },
	{ label: "Perda", value: "perda" },
	{ label: "Outro", value: "outro" },
] as const;

const REASON_LABELS: Record<string, string> = {
	entrada_compra: "Entrada de compra",
	saida_venda: "Saída de venda",
	ajuste_inventario: "Ajuste de inventário",
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

function zodErrorsToMap(
	error: Parameters<typeof stockAdjustmentSchema.safeParse>[0] extends never
		? never
		: ReturnType<typeof stockAdjustmentSchema.safeParse> extends {
					success: false;
					error: infer E;
				}
			? E
			: never
): Partial<Record<keyof StockAdjustmentInput, string>> {
	const map: Partial<Record<keyof StockAdjustmentInput, string>> = {};
	if ("issues" in error) {
		for (const issue of (
			error as { issues: { path: unknown[]; message: string }[] }
		).issues) {
			const key = issue.path[0] as keyof StockAdjustmentInput | undefined;
			if (key && !map[key]) {
				map[key] = issue.message;
			}
		}
	}
	return map;
}

// ─── Componente ────────────────────────────────────────────────────────────

interface BranchStockEditSheetProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	onClose: () => void;
	row: BranchStockRow | null;
}

export function BranchStockEditSheet({
	branchId,
	branchName,
	canMutate,
	onClose,
	row,
}: BranchStockEditSheetProps) {
	const router = useRouter();

	// ── Adjust form state ──────────────────────────────────────────────────
	const [newQty, setNewQty] = useState<number | undefined>(undefined);
	const [reason, setReason] = useState("__none__");
	const [reasonNote, setReasonNote] = useState("");
	const [errors, setErrors] = useState<
		Partial<Record<keyof StockAdjustmentInput, string>>
	>({});
	const [isAdjusting, startAdjustTransition] = useTransition();

	// ── Movements state ────────────────────────────────────────────────────
	const [movements, setMovements] = useState<StockMovementRow[]>([]);
	const [isLoadingMovements, startMovementsTransition] = useTransition();

	// Resetar form e buscar movimentos ao trocar de variante
	useEffect(() => {
		if (!row) {
			setMovements([]);
			return;
		}
		setNewQty(row.quantity);
		setReason("__none__");
		setReasonNote("");
		setErrors({});

		startMovementsTransition(async () => {
			const data = await getStockMovementsByVariantBranch(
				row.variantId,
				branchId
			);
			setMovements(data);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [row?.variantId, branchId]);

	function handleAdjustSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setErrors({});

		const resolvedReason =
			reason === "__none__"
				? undefined
				: (reason as StockAdjustmentInput["reason"]);
		const resolvedNote =
			reasonNote.trim() === "" ? undefined : reasonNote.trim();

		const input: StockAdjustmentInput = {
			variantId: row!.variantId,
			branchId,
			newQty: newQty ?? Number.NaN,
			reason: resolvedReason,
			reasonNote: resolvedNote,
		};

		const parsed = stockAdjustmentSchema.safeParse(input);
		if (!parsed.success) {
			setErrors(
				zodErrorsToMap(parsed.error as Parameters<typeof zodErrorsToMap>[0])
			);
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

	if (!row) {
		return null;
	}

	const status = resolveStatus(row);
	const statusLabel = STATUS_LABEL[status];
	const hasLimits = row.minQty > 0 || row.reorderPoint > 0;

	return (
		<Sheet
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open={row !== null}
		>
			<SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[440px]">
				{/* Header */}
				<SheetHeader className="border-border border-b px-6 py-5">
					<div className="flex items-start gap-3">
						{/* Imagem / monograma */}
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
								className={`font-bold text-[36px] tabular-nums leading-none ${
									row.quantity === 0
										? "text-destructive"
										: status === "critical"
											? "text-red-400"
											: status === "reorder"
												? "text-amber-400"
												: "text-foreground"
								}`}
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
								<Label htmlFor="sheet-reason">Motivo</Label>
								<Select
									disabled={isAdjusting}
									onValueChange={(v) => setReason(v ?? "__none__")}
									value={reason}
								>
									<SelectTrigger id="sheet-reason">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{REASON_OPTIONS.map((o) => (
												<SelectItem key={o.value} value={o.value}>
													{o.label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>

							{reason === "outro" && (
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="sheet-reason-note">Observação</Label>
									<Textarea
										disabled={isAdjusting}
										id="sheet-reason-note"
										onChange={(e) => setReasonNote(e.target.value)}
										placeholder="Descreva o motivo"
										rows={2}
										value={reasonNote}
									/>
									{errors.reasonNote && (
										<p className="text-destructive text-xs">
											{errors.reasonNote}
										</p>
									)}
								</div>
							)}

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
				<div className="border-border border-b px-6 py-5">
					<p className="mb-3 font-medium text-sm">Limites de alerta</p>
					{canMutate ? (
						<BranchStockThresholdInputs
							branchId={branchId}
							initialMinQty={row.minQty}
							initialReorderPoint={row.reorderPoint}
							variantId={row.variantId}
						/>
					) : (
						<p className="text-muted-foreground text-sm tabular-nums">
							{hasLimits
								? `Mínimo: ${row.minQty} · Reposição: ${row.reorderPoint}`
								: "Nenhum limite configurado."}
						</p>
					)}
				</div>

				{/* Histórico */}
				<div className="px-6 py-5">
					<p className="mb-3 font-medium text-sm">Últimos movimentos</p>
					{isLoadingMovements ? (
						<div className="flex justify-center py-4">
							<Spinner />
						</div>
					) : movements.length === 0 ? (
						<p className="text-muted-foreground text-sm italic">
							Nenhum movimento registrado.
						</p>
					) : (
						<ul className="flex flex-col gap-2.5">
							{movements.map((m) => (
								<li className="flex items-start gap-3 text-xs" key={m.id}>
									<span
										className={`flex-shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums ${
											m.delta >= 0
												? "bg-green-950/60 text-green-400"
												: "bg-red-950/60 text-destructive"
										}`}
									>
										{m.delta >= 0 ? "+" : ""}
										{m.delta}
									</span>
									<div className="min-w-0 flex-1">
										<p className="text-foreground">
											{m.reason
												? (REASON_LABELS[m.reason] ?? m.reason)
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
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
