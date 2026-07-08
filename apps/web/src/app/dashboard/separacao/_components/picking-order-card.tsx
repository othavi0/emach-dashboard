import { ArrowRightIcon, ClockIcon, MapPinIcon } from "lucide-react";
import Link from "next/link";

import { formatRelative } from "@/lib/format/datetime";
import { isPickingStale } from "../_lib/picking-logic";
import type { PickingQueueRow } from "../data";

/** Pedidos pagos há mais de 24h entram no modo urgente */
const URGENCY_THRESHOLD_MS = 24 * 60 * 60 * 1000;

type Tab = "a_separar" | "em_separacao" | "excecoes";

/** Estilo do CTA por aba: primário (a separar), laranja (em separação), neutro (exceções) */
const CTA_CLASS: Record<Tab, string> = {
	a_separar: "bg-primary text-primary-foreground",
	em_separacao: "bg-warning text-warning-foreground",
	excecoes: "border border-input text-foreground",
};

const CTA_LABEL: Record<Tab, string> = {
	a_separar: "Separar",
	em_separacao: "Retomar separação",
	excecoes: "Resolver",
};

interface PickingOrderCardProps {
	row: PickingQueueRow;
	tab: Tab;
}

function PaidAge({ paidAt }: { paidAt: Date | null }) {
	if (!paidAt) {
		return null;
	}
	const isUrgent = Date.now() - paidAt.getTime() > URGENCY_THRESHOLD_MS;
	return (
		<span
			className={`inline-flex items-center gap-1 ${isUrgent ? "font-semibold text-warning" : "text-muted-foreground"}`}
			title={paidAt.toISOString()}
		>
			<ClockIcon aria-hidden className="size-3 shrink-0" />
			{formatRelative(paidAt)}
		</span>
	);
}

function StatusBadge({ row, tab }: { row: PickingQueueRow; tab: Tab }) {
	if (tab === "excecoes") {
		return (
			<span className="inline-flex items-center rounded-md bg-destructive/15 px-2 py-0.5 font-semibold text-[10px] text-destructive">
				Exceção
			</span>
		);
	}
	if (tab === "em_separacao") {
		// A aba já diz o estado — badge redundante removido (spec 2026-07-08).
		// O slot de alerta útil ("Parada há X") é renderizado abaixo do meta.
		return null;
	}
	// a_separar
	const isUrgent =
		row.paidAt != null &&
		Date.now() - row.paidAt.getTime() > URGENCY_THRESHOLD_MS;
	return isUrgent ? (
		<span className="inline-flex items-center rounded-md bg-warning/15 px-2 py-0.5 font-semibold text-[10px] text-warning">
			Urgente
		</span>
	) : (
		<span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 font-semibold text-[10px] text-secondary-foreground">
			A separar
		</span>
	);
}

export function PickingOrderCard({ row, tab }: PickingOrderCardProps) {
	const progressPct =
		tab === "em_separacao" && row.pickedUnits !== undefined && row.unitCount > 0
			? Math.round((row.pickedUnits / row.unitCount) * 100)
			: null;

	const ctaLabel = CTA_LABEL[tab];

	return (
		<Link
			className="group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			href={`/dashboard/separacao/${row.orderId}`}
		>
			{/* Header */}
			<div className="flex items-start justify-between gap-3 px-4 pt-4 pb-1">
				<div className="min-w-0">
					<p className="truncate font-semibold text-base leading-tight tracking-tight">
						{row.number}
					</p>
					<p className="truncate text-[13px] text-muted-foreground">
						{row.clientName}
					</p>
				</div>
				<StatusBadge row={row} tab={tab} />
			</div>

			{/* Meta: filial + idade */}
			<div className="flex flex-wrap items-center gap-2 px-4 py-2 text-muted-foreground text-xs">
				{row.branchName && (
					<span className="inline-flex items-center gap-1">
						<MapPinIcon aria-hidden className="size-3 shrink-0" />
						{row.branchName}
					</span>
				)}
				{row.branchName && row.paidAt && (
					<span aria-hidden className="size-1 rounded-full bg-border" />
				)}
				<PaidAge paidAt={row.paidAt} />
				{tab === "em_separacao" && row.pickerName && (
					<>
						<span aria-hidden className="size-1 rounded-full bg-border" />
						<span>por {row.pickerName}</span>
					</>
				)}
			</div>

			{tab === "em_separacao" &&
				row.pickingStartedAt &&
				isPickingStale({
					lastScannedAt: row.lastScannedAt ?? null,
					startedAt: row.pickingStartedAt,
				}) && (
					<div className="px-4 pb-2">
						<span className="inline-flex items-center rounded-md bg-warning/15 px-2 py-0.5 font-semibold text-[10px] text-warning">
							Parada {formatRelative(row.lastScannedAt ?? row.pickingStartedAt)}
						</span>
					</div>
				)}

			{tab === "excecoes" && row.exceptionReason && (
				<div className="px-4 pb-2">
					<p className="max-w-full truncate text-[11px] text-warning">
						{row.exceptionReason}
					</p>
				</div>
			)}

			{/* Barra de progresso para "em separação" */}
			{progressPct !== null && (
				<div className="px-4 pb-2">
					<div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
						<span>
							{row.pickedUnits} de {row.unitCount} unidades
						</span>
						<span>{progressPct}%</span>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full bg-primary"
							style={{ width: `${progressPct}%` }}
						/>
					</div>
				</div>
			)}

			{/* Footer: métricas */}
			{progressPct === null && (
				<div className="mt-auto grid grid-cols-2 border-border border-t">
					<div className="flex flex-col items-center border-border border-r py-2.5">
						<span className="font-bold text-[17px] tabular-nums">
							{row.itemCount}
						</span>
						<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
							Itens
						</span>
					</div>
					<div className="flex flex-col items-center py-2.5">
						<span className="font-bold text-[17px] tabular-nums">
							{row.unitCount}
						</span>
						<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
							Unidades
						</span>
					</div>
				</div>
			)}

			{/* CTA */}
			<div className="border-border border-t bg-sidebar px-4 py-3">
				<div
					className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[13px] ${CTA_CLASS[tab]}`}
					// role="none": o <Link> pai já é o elemento interativo
					role="none"
				>
					{ctaLabel}
					{tab === "a_separar" && (
						<ArrowRightIcon aria-hidden className="size-4" />
					)}
				</div>
			</div>
		</Link>
	);
}
