"use client";

import type { OrderPicking, OrderPickingItem } from "@emach/db/schema/orders";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@emach/ui/components/alert-dialog";
import { Button, buttonVariants } from "@emach/ui/components/button";
import { Textarea } from "@emach/ui/components/textarea";
import {
	ArrowLeftIcon,
	BanIcon,
	CheckIcon,
	ImageIcon,
	LockIcon,
	MapPinIcon,
	TriangleAlertIcon,
	XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { notify } from "@/lib/notify";
import { isPickingComplete, summarizePicking } from "../_lib/picking-logic";
import {
	cancelPicking,
	completePicking,
	reportMissing,
	scanItem,
} from "../actions";
import { ScanInput } from "./scan-input";

// ─── tipos ──────────────────────────────────────────────────────────────────

interface VariantSnapshot {
	barcode?: string | null;
	name?: string;
	sku?: string | null;
	voltage?: string | null;
}

interface LocalItem {
	barcode: string | null;
	id: string;
	name: string;
	notFound: boolean;
	qtyExpected: number;
	qtyPicked: number;
	variantId: string | null;
	voltage: string | null;
}

type FeedbackKind = "accepted" | "already_complete" | "not_in_order" | null;
type ItemState = "cur" | "done" | "exc" | "pending";

// ─── helpers puros ──────────────────────────────────────────────────────────

function toLocalItem(item: OrderPickingItem): LocalItem {
	const snap = (item.variantSnapshot ?? {}) as VariantSnapshot;
	return {
		id: item.id,
		variantId: item.variantId ?? null,
		name: snap.name ?? "Item",
		barcode: snap.barcode ?? null,
		voltage: snap.voltage ?? null,
		qtyExpected: item.qtyExpected,
		qtyPicked: item.qtyPicked,
		notFound: item.notFound,
	};
}

function getItemState(item: LocalItem, focusedId: string | null): ItemState {
	if (item.notFound) {
		return "exc";
	}
	if (item.qtyPicked === item.qtyExpected) {
		return "done";
	}
	if (item.id === focusedId) {
		return "cur";
	}
	return "pending";
}

function firstIncompleteId(items: LocalItem[]): string | null {
	return (
		items.find((it) => !it.notFound && it.qtyPicked < it.qtyExpected)?.id ??
		null
	);
}

function getFocusCountColor(f: FeedbackKind): string {
	if (f === "accepted") {
		return "text-success";
	}
	if (f === "already_complete") {
		return "text-warning";
	}
	if (f === "not_in_order") {
		return "text-destructive";
	}
	return "text-foreground";
}

function getFocusBarColor(f: FeedbackKind): string {
	if (f === "accepted") {
		return "bg-success";
	}
	if (f === "already_complete") {
		return "bg-warning";
	}
	if (f === "not_in_order") {
		return "bg-destructive";
	}
	return "bg-primary";
}

const FEEDBACK_STRIP_META = {
	accepted: { label: "Aceito", cls: "bg-success/14 text-success" },
	already_complete: { label: "Já completo", cls: "bg-warning/14 text-warning" },
	not_in_order: {
		label: "Fora do pedido",
		cls: "bg-destructive/14 text-destructive",
	},
} as const;

function FeedbackStrip({ feedback }: { feedback: FeedbackKind }) {
	if (!feedback) {
		return null;
	}
	const meta = FEEDBACK_STRIP_META[feedback];
	return (
		<div
			className={`flex items-center gap-2 px-5 py-2.5 font-semibold text-[13px] ${meta.cls}`}
		>
			{feedback === "accepted" && (
				<CheckIcon aria-hidden className="size-4" strokeWidth={2.6} />
			)}
			{feedback === "already_complete" && (
				<TriangleAlertIcon aria-hidden className="size-4" />
			)}
			{feedback === "not_in_order" && (
				<XIcon aria-hidden className="size-4" strokeWidth={2.6} />
			)}
			{meta.label}
		</div>
	);
}

function getCheckerClass(state: ItemState): string {
	if (state === "done") {
		return "border-success bg-success text-success-foreground";
	}
	if (state === "cur") {
		return "border-primary text-primary";
	}
	if (state === "exc") {
		return "border-destructive text-destructive";
	}
	return "border-border";
}

function getQtyClass(state: ItemState): string {
	if (state === "done") {
		return "text-success";
	}
	if (state === "exc") {
		return "text-destructive";
	}
	return "text-muted-foreground";
}

// ─── sub-componentes ────────────────────────────────────────────────────────

interface FocusCardProps {
	feedback: FeedbackKind;
	isReporting: boolean;
	item: LocalItem;
	onReportOpen: (id: string) => void;
}

function FocusCard({
	item,
	feedback,
	isReporting,
	onReportOpen,
}: FocusCardProps) {
	const countColor = getFocusCountColor(feedback);
	const barColor = getFocusBarColor(feedback);
	const progress = Math.round(
		(item.qtyPicked / Math.max(item.qtyExpected, 1)) * 100
	);

	return (
		<div className="flex gap-4">
			<div className="flex size-24 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
				<ImageIcon aria-hidden className="size-9" strokeWidth={1.5} />
			</div>

			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<p className="font-semibold text-[18px] leading-tight">{item.name}</p>

				<div className="flex flex-wrap items-center gap-2">
					{item.voltage && (
						<span className="rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
							{item.voltage}
						</span>
					)}
					{item.barcode && (
						<span className="font-mono text-[11px] text-muted-foreground">
							{item.barcode}
						</span>
					)}
				</div>

				<div className="mt-0.5 flex items-baseline gap-2">
					<span
						className={`font-semibold text-[34px] tabular-nums leading-none ${countColor}`}
					>
						{item.qtyPicked}
					</span>
					<span className="text-[13px] text-muted-foreground">
						de {item.qtyExpected}{" "}
						{item.qtyExpected === 1 ? "unidade" : "unidades"}
						{item.qtyPicked < item.qtyExpected &&
							` · falta ${item.qtyExpected - item.qtyPicked}`}
					</span>
				</div>

				<div className="h-2 overflow-hidden rounded-full bg-muted">
					<div
						className={`h-full transition-[width] ${barColor}`}
						style={{ width: `${progress}%` }}
					/>
				</div>

				<div className="flex justify-end">
					<Button
						className="mt-1 w-fit"
						disabled={item.notFound || isReporting}
						onClick={() => onReportOpen(item.id)}
						size="sm"
						variant="outline"
					>
						Item não encontrado
					</Button>
				</div>
			</div>
		</div>
	);
}

interface ChecklistItemRowProps {
	focusedId: string | null;
	item: LocalItem;
}

function ChecklistItemRow({ item, focusedId }: ChecklistItemRowProps) {
	const state = getItemState(item, focusedId);
	const checkerClass = getCheckerClass(state);
	const qtyClass = getQtyClass(state);

	return (
		<div
			className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${
				state === "cur" ? "border-primary/40 bg-muted" : "border-transparent"
			}`}
		>
			<div
				className={`flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] font-semibold text-[12px] ${checkerClass}`}
			>
				{state === "done" && (
					<CheckIcon aria-hidden className="size-3" strokeWidth={3} />
				)}
				{state === "cur" && "▸"}
				{state === "exc" && "!"}
			</div>

			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-[13px]">{item.name}</p>
				{state === "exc" ? (
					<p className="text-[11px] text-destructive">
						Falta reportada · em exceção
					</p>
				) : (
					<p className="text-[11px] text-muted-foreground">
						{item.voltage ? `${item.voltage} · ` : ""}
						{item.barcode ?? "—"}
					</p>
				)}
			</div>

			<span className={`shrink-0 text-[13px] tabular-nums ${qtyClass}`}>
				{item.qtyPicked} / {item.qtyExpected}
			</span>
		</div>
	);
}

// ─── hook de estado ─────────────────────────────────────────────────────────

function usePickingState(
	picking: OrderPicking,
	initialItems: OrderPickingItem[]
) {
	const router = useRouter();
	const init = initialItems.map(toLocalItem);

	const [localItems, setLocalItems] = useState<LocalItem[]>(init);
	const [focusedId, setFocusedId] = useState<string | null>(() =>
		firstIncompleteId(init)
	);
	const [feedback, setFeedback] = useState<FeedbackKind>(null);
	const [isScanning, setIsScanning] = useState(false);
	const [isCompleting, startCompleting] = useTransition();
	const [reportingItemId, setReportingItemId] = useState<string | null>(null);
	const [reportReason, setReportReason] = useState("");
	const [isReporting, startReporting] = useTransition();
	const [isCancelOpen, setIsCancelOpen] = useState(false);
	const [isCanceling, startCanceling] = useTransition();

	// Fila sequencial de scans: evita under-pick silencioso quando o operador
	// bipa rapidamente (ou bipa a mesma unidade N vezes em qty>1).
	const queueRef = useRef<string[]>([]);
	const drainingRef = useRef(false);

	function clearFeedback() {
		setTimeout(() => setFeedback(null), 3000);
	}

	async function handleScan(code: string) {
		queueRef.current.push(code);
		if (drainingRef.current) {
			return;
		}
		drainingRef.current = true;
		setIsScanning(true);
		try {
			while (queueRef.current.length > 0) {
				const next = queueRef.current.shift();
				if (next === undefined) {
					break;
				}
				const result = await scanItem(picking.id, next);
				if (!result.ok) {
					notify.error(result.error);
					setFeedback(null);
					continue;
				}
				const scan = result.data;
				if (scan.kind === "accepted") {
					setLocalItems((prev) =>
						prev.map((it) =>
							it.id === scan.pickingItemId
								? { ...it, qtyPicked: scan.qtyPicked }
								: it
						)
					);
					setFocusedId(scan.pickingItemId);
					setFeedback("accepted");
				} else {
					setFeedback(scan.kind);
				}
				clearFeedback();
			}
		} finally {
			drainingRef.current = false;
			setIsScanning(false);
		}
	}

	function handleComplete() {
		startCompleting(async () => {
			const result = await completePicking(picking.id);
			if (result.ok) {
				router.push("/dashboard/separacao");
			} else {
				notify.error(result.error);
			}
		});
	}

	function handleCancel() {
		startCanceling(async () => {
			const result = await cancelPicking(picking.id);
			if (result.ok) {
				router.push("/dashboard/separacao");
			} else {
				notify.error(result.error);
				setIsCancelOpen(false);
			}
		});
	}

	function handleReportOpen(itemId: string) {
		setReportingItemId(itemId);
		setReportReason("");
	}

	function handleReportConfirm() {
		if (!reportingItemId) {
			return;
		}
		const itemId = reportingItemId;
		const reason = reportReason;
		const snapshot = localItems;

		startReporting(async () => {
			const result = await reportMissing(itemId, reason);
			if (result.ok) {
				const updated = snapshot.map((it) =>
					it.id === itemId ? { ...it, notFound: true } : it
				);
				setLocalItems(updated);
				setFocusedId((prev) => {
					if (prev !== itemId) {
						return prev;
					}
					return (
						updated.find((it) => !it.notFound && it.qtyPicked < it.qtyExpected)
							?.id ?? null
					);
				});
			} else {
				notify.error(result.error);
			}
			setReportingItemId(null);
		});
	}

	return {
		localItems,
		focusedId,
		feedback,
		isScanning,
		isCompleting,
		reportingItemId,
		reportReason,
		isReporting,
		isCancelOpen,
		isCanceling,
		setIsCancelOpen,
		setReportingItemId,
		setReportReason,
		handleScan,
		handleComplete,
		handleCancel,
		handleReportOpen,
		handleReportConfirm,
	};
}

// ─── componente principal ────────────────────────────────────────────────────

interface PickingExecutionProps {
	items: OrderPickingItem[];
	picking: OrderPicking;
}

export function PickingExecution({ items, picking }: PickingExecutionProps) {
	const {
		localItems,
		focusedId,
		feedback,
		isScanning,
		isCompleting,
		reportingItemId,
		reportReason,
		isReporting,
		isCancelOpen,
		isCanceling,
		setIsCancelOpen,
		setReportingItemId,
		setReportReason,
		handleScan,
		handleComplete,
		handleCancel,
		handleReportOpen,
		handleReportConfirm,
	} = usePickingState(picking, items);

	const summary = summarizePicking(localItems);
	const allDone = isPickingComplete(localItems);
	const focusedItem = localItems.find((it) => it.id === focusedId) ?? null;
	const reportingItem =
		localItems.find((it) => it.id === reportingItemId) ?? null;
	const doneCount = localItems.filter(
		(it) => it.qtyPicked === it.qtyExpected && !it.notFound
	).length;
	const progressPct =
		summary.totalUnits > 0
			? Math.round((summary.pickedUnits / summary.totalUnits) * 100)
			: 0;
	const scanDisabled = isScanning || isCompleting || isReporting;
	const exceptionColor = summary.exceptions > 0 ? "text-destructive" : "";
	const gateText =
		summary.exceptions > 0
			? `Resolva ${summary.exceptions === 1 ? "a exceção" : "as exceções"} e bipe os ${summary.totalUnits - summary.pickedUnits} restantes`
			: `Bipe as ${summary.totalUnits - summary.pickedUnits} unidades restantes para liberar`;

	return (
		<>
			{/* Header da operação */}
			<div className="rounded-xl border border-border bg-card p-5">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h1 className="font-medium font-serif text-2xl tracking-tight">
							Separação em andamento
						</h1>
						<p className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
							<span>{picking.pickerName}</span>
							{picking.branchId && (
								<>
									<span aria-hidden className="size-1 rounded-full bg-border" />
									<span className="flex items-center gap-1">
										<MapPinIcon aria-hidden className="size-3 shrink-0" />
										Filial
									</span>
								</>
							)}
						</p>
					</div>

					<div className="flex shrink-0 items-center gap-3">
						<span className="inline-flex items-center gap-1 rounded-md bg-info/15 px-2.5 py-1 font-semibold text-[11px] text-info">
							Em separação
						</span>
						<Link
							className={buttonVariants({ size: "sm", variant: "outline" })}
							href="/dashboard/separacao"
						>
							<ArrowLeftIcon aria-hidden className="size-4" />
							Voltar à fila
						</Link>
						<Button
							className="text-destructive hover:bg-destructive/10 hover:text-destructive"
							disabled={isCanceling}
							onClick={() => setIsCancelOpen(true)}
							size="sm"
							variant="ghost"
						>
							<BanIcon aria-hidden className="size-3.5 shrink-0" />
							Cancelar
						</Button>
					</div>
				</div>

				<div className="mt-4 flex items-center gap-3">
					<div className="h-2.5 flex-1 overflow-hidden rounded-full bg-input">
						<div
							className="h-full bg-primary transition-[width]"
							style={{ width: `${progressPct}%` }}
						/>
					</div>
					<span className="shrink-0 text-[13px] tabular-nums">
						<span className="font-semibold text-foreground">
							{summary.pickedUnits}
						</span>{" "}
						<span className="text-muted-foreground">
							/ {summary.totalUnits} un · {doneCount} de {localItems.length}{" "}
							itens
						</span>
					</span>
				</div>
			</div>

			{/* Palco — 2 colunas */}
			<div className="mt-4 grid grid-cols-[1.45fr_1fr] overflow-hidden rounded-xl border border-border max-[900px]:grid-cols-1">
				{/* ESQUERDA — painel unificado */}
				<div className="border-border border-r p-5 max-[900px]:border-r-0 max-[900px]:border-b">
					<div className="overflow-hidden rounded-xl border border-border bg-card">
						<FeedbackStrip feedback={feedback} />
						<div className="p-5">
							<ScanInput disabled={scanDisabled} onScan={handleScan} />
						</div>
						<div className="h-px bg-border" />
						<div className="p-5">
							{focusedItem ? (
								<FocusCard
									feedback={feedback}
									isReporting={isReporting}
									item={focusedItem}
									onReportOpen={handleReportOpen}
								/>
							) : (
								<div className="flex items-center justify-center rounded-lg border border-border border-dashed p-8">
									<p className="text-[13px] text-muted-foreground">
										Todos os itens foram conferidos
									</p>
								</div>
							)}
						</div>
					</div>
				</div>

				{/* DIREITA */}
				<div className="flex flex-col gap-4 bg-sidebar p-5">
					<p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[.09em]">
						Itens do pedido · {doneCount} de {localItems.length} concluídos
					</p>

					<div className="flex flex-col gap-1">
						{localItems.map((item) => (
							<ChecklistItemRow
								focusedId={focusedId}
								item={item}
								key={item.id}
							/>
						))}
					</div>

					<div className="h-px bg-border" />

					<div className="flex flex-col gap-2">
						<div className="flex justify-between text-[13px]">
							<span className="text-muted-foreground">Unidades bipadas</span>
							<span className="font-semibold tabular-nums">
								{summary.pickedUnits} / {summary.totalUnits}
							</span>
						</div>
						<div className="flex justify-between text-[13px]">
							<span className="text-muted-foreground">Itens em exceção</span>
							<span className={`font-semibold tabular-nums ${exceptionColor}`}>
								{summary.exceptions}
							</span>
						</div>
					</div>

					<Button
						className="w-full"
						disabled={!allDone || isCompleting}
						onClick={handleComplete}
					>
						{isCompleting ? "Concluindo…" : "Concluir separação"}
					</Button>

					{!allDone && (
						<p className="flex items-center justify-center gap-1.5 text-[12px] text-warning">
							<LockIcon aria-hidden className="size-3.5 shrink-0" />
							{gateText}
						</p>
					)}
				</div>
			</div>

			{/* Dialog — item não encontrado */}
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setReportingItemId(null);
					}
				}}
				open={reportingItemId !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Item não encontrado</AlertDialogTitle>
						<AlertDialogDescription>
							{reportingItem && (
								<span className="font-medium text-foreground">
									{reportingItem.name}
								</span>
							)}{" "}
							— informe o motivo para registrar a exceção.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="my-2">
						<Textarea
							className="resize-none"
							onChange={(e) => setReportReason(e.target.value)}
							placeholder="Descreva o motivo (ex: item ausente no estoque, embalagem danificada…)"
							rows={3}
							value={reportReason}
						/>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel
							disabled={isReporting}
							onClick={() => setReportingItemId(null)}
						>
							Cancelar
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={reportReason.trim().length < 1 || isReporting}
							onClick={handleReportConfirm}
						>
							{isReporting ? "Registrando…" : "Confirmar exceção"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Dialog — cancelar separação */}
			<AlertDialog
				onOpenChange={(open) => {
					if (!(open || isCanceling)) {
						setIsCancelOpen(false);
					}
				}}
				open={isCancelOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Cancelar separação?</AlertDialogTitle>
						<AlertDialogDescription>
							A sessão de separação será descartada e as bipagens registradas
							serão perdidas. O pedido permanece em preparação e pode ser
							separado novamente. Esta ação não pode ser desfeita.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							disabled={isCanceling}
							onClick={() => setIsCancelOpen(false)}
						>
							Voltar
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={isCanceling}
							onClick={handleCancel}
						>
							{isCanceling ? "Cancelando…" : "Cancelar separação"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
