import { ArrowRightIcon, ClockIcon, MapPinIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatRelative } from "@/lib/format/datetime";
import { notify } from "@/lib/notify";
import {
	isPickingStale,
	isSelfPicker,
	type QueueCardCta,
	queueCardCta,
} from "../_lib/picking-logic";
import { startPicking } from "../actions";
import type { PickingQueueRow } from "../data";
import { fulfillmentBadgeLabel } from "../fulfillment-meta";

/** Pedidos pagos há mais de 24h entram no modo urgente */
const URGENCY_THRESHOLD_MS = 24 * 60 * 60 * 1000;

type Tab = "a_separar" | "em_separacao" | "excecoes";

/** Estilo do CTA por intenção (queueCardCta): primário (claim), warning
 * (retomar própria), outline (ação de admin/resolver), outline-muted
 * (somente-leitura). */
const CTA_KIND_CLASS: Record<QueueCardCta["kind"], string> = {
	primary: "bg-primary text-primary-foreground",
	warning: "bg-warning text-warning-foreground",
	outline: "border border-input text-foreground",
	"outline-muted": "border border-input text-muted-foreground",
};

interface PickingOrderCardProps {
	canManageOthers: boolean;
	row: PickingQueueRow;
	sessionUserId: string;
	tab: Tab;
}

function PaidAge({ paidAt }: { paidAt: Date | null }) {
	// "Agora" congelado por instância: Date.now() no corpo do render é impuro
	// (quebra memoização do Compiler); a fila re-busca com frequência.
	const [now] = useState(() => Date.now());
	if (!paidAt) {
		return null;
	}
	const isUrgent = now - paidAt.getTime() > URGENCY_THRESHOLD_MS;
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

function StatusBadge({
	row,
	sessionUserId,
	tab,
}: {
	row: PickingQueueRow;
	sessionUserId: string;
	tab: Tab;
}) {
	// Mesmo racional do PaidAge: congela o "agora" por instância.
	const [now] = useState(() => Date.now());
	if (tab === "excecoes") {
		return (
			<span className="inline-flex items-center rounded-md bg-destructive/15 px-2 py-0.5 font-semibold text-[10px] text-destructive">
				{fulfillmentBadgeLabel("picking_exception", row.pickerName ?? null)}
			</span>
		);
	}
	if (tab === "em_separacao") {
		// Dono do ator ganha tom primary + "Você" (D10); colega mantém o warning
		// com o nome (spec 2026-07-11, mockup B).
		if (isSelfPicker(row.pickerUserId, sessionUserId)) {
			return (
				<span className="inline-flex items-center rounded-md bg-primary/18 px-2 py-0.5 font-semibold text-[10px] text-primary">
					Separando · Você
				</span>
			);
		}
		return (
			<span className="inline-flex items-center rounded-md bg-warning/15 px-2 py-0.5 font-semibold text-[10px] text-warning">
				{fulfillmentBadgeLabel("picking_in_progress", row.pickerName ?? null)}
			</span>
		);
	}
	// a_separar
	const isUrgent =
		row.paidAt != null && now - row.paidAt.getTime() > URGENCY_THRESHOLD_MS;
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

export function PickingOrderCard({
	canManageOthers,
	row,
	sessionUserId,
	tab,
}: PickingOrderCardProps) {
	const progressPct =
		tab === "em_separacao" && row.pickedUnits !== undefined && row.unitCount > 0
			? Math.round((row.pickedUnits / row.unitCount) * 100)
			: null;

	const router = useRouter();
	const [isStarting, startTransition] = useTransition();

	// Card-Link continua navegando pro fallback (deep-link/reabertura, D9); o
	// CTA é um role="button" aninhado no Link (DESIGN.md §4 — nunca <button>
	// em âncora) cujo onClick/onKeyDown já cortam propagação antes de chamar
	// handleStart, que claima a sessão antes de navegar — corrida com outro
	// operador vira toast, sem navegar (startPicking já resolve "já é de
	// Fulano" via 23505).
	function handleStart() {
		if (isStarting) {
			return;
		}
		startTransition(async () => {
			const result = await startPicking(row.orderId);
			if (result.ok) {
				router.push(`/dashboard/separacao/${row.orderId}`);
			} else {
				notify.error(result.error);
			}
		});
	}

	const isSelf = isSelfPicker(row.pickerUserId, sessionUserId);
	const cta = queueCardCta(tab, isSelf, canManageOthers);
	// Cards de outros operadores ficam esmaecidos (mockup A) nas tabs com dono.
	const isForeign = tab !== "a_separar" && !isSelf;

	return (
		<Link
			className={`group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isForeign ? "opacity-60" : ""}`}
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
				<StatusBadge row={row} sessionUserId={sessionUserId} tab={tab} />
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

			{/* CTA — some quando queueCardCta retorna null (exceção alheia, role
			    user); o Link raiz continua navegando pro detalhe. */}
			{cta && (
				<div className="border-border border-t bg-sidebar px-4 py-3">
					{tab === "a_separar" ? (
						// biome-ignore lint/a11y/useSemanticElements: role="button" aninhado no Link (padrão DESIGN.md §4, não usar <button> em âncora)
						<div
							aria-disabled={isStarting}
							className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[13px] transition-opacity aria-disabled:cursor-not-allowed aria-disabled:opacity-70 ${CTA_KIND_CLASS[cta.kind]}`}
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleStart();
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									e.stopPropagation();
									handleStart();
								}
							}}
							role="button"
							tabIndex={0}
						>
							{isStarting ? "Iniciando…" : cta.label}
							<ArrowRightIcon aria-hidden className="size-4" />
						</div>
					) : (
						<div
							className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[13px] ${CTA_KIND_CLASS[cta.kind]}`}
							// role="none": o <Link> pai já é o elemento interativo
							role="none"
						>
							{cta.label}
						</div>
					)}
				</div>
			)}
		</Link>
	);
}
