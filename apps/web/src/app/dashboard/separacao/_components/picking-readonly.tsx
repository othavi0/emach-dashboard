"use client";

import type { OrderPicking, OrderPickingItem } from "@emach/db/schema/orders";
import { Button, buttonVariants } from "@emach/ui/components/button";
import { ArrowLeftIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatRelative, formatTime } from "@/lib/format/datetime";
import { notify } from "@/lib/notify";
import { isPickingStale, summarizePicking } from "../_lib/picking-logic";
import { cancelPicking, takeoverPicking } from "../actions";

type ConfirmKind = "cancel" | "takeover";

interface PickingReadonlyProps {
	canManage: boolean;
	items: OrderPickingItem[];
	picking: OrderPicking;
}

interface ManageActionsProps {
	confirming: ConfirmKind | null;
	isPending: boolean;
	onConfirm: () => void;
	onSelect: (kind: ConfirmKind | null) => void;
	pickerName: string;
}

const CONFIRM_COPY: Record<ConfirmKind, string> = {
	takeover:
		"A sessão de {pickerName} será cancelada e uma nova começa do zero no seu nome.",
	cancel: "A sessão de {pickerName} será cancelada e o pedido volta à fila.",
};

function ManageActions({
	confirming,
	isPending,
	onConfirm,
	onSelect,
	pickerName,
}: ManageActionsProps) {
	if (confirming === null) {
		return (
			<>
				<Button
					disabled={isPending}
					onClick={() => onSelect("takeover")}
					size="sm"
					variant="secondary"
				>
					Assumir separação
				</Button>
				<Button
					className="text-destructive hover:bg-destructive/10 hover:text-destructive"
					disabled={isPending}
					onClick={() => onSelect("cancel")}
					size="sm"
					variant="ghost"
				>
					Cancelar sessão
				</Button>
			</>
		);
	}

	return (
		<>
			<p className="w-full text-muted-foreground text-xs">
				{CONFIRM_COPY[confirming].replace("{pickerName}", pickerName)}
			</p>
			<Button
				disabled={isPending}
				onClick={onConfirm}
				size="sm"
				variant="warning"
			>
				{isPending ? "Aplicando…" : "Confirmar"}
			</Button>
			<Button
				disabled={isPending}
				onClick={() => onSelect(null)}
				size="sm"
				variant="ghost"
			>
				Voltar
			</Button>
		</>
	);
}

export function PickingReadonly({
	canManage,
	items,
	picking,
}: PickingReadonlyProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [confirming, setConfirming] = useState<ConfirmKind | null>(null);

	const summary = summarizePicking(
		items.map((it) => ({
			id: it.id,
			variantId: it.variantId,
			barcode: null,
			qtyExpected: it.qtyExpected,
			qtyPicked: it.qtyPicked,
			notFound: it.notFound,
		}))
	);
	const lastScan = items.reduce<Date | null>(
		(max, it) =>
			it.lastScannedAt && (!max || it.lastScannedAt > max)
				? it.lastScannedAt
				: max,
		null
	);
	const stale = isPickingStale({
		lastScannedAt: lastScan,
		startedAt: picking.startedAt,
	});
	const pct =
		summary.totalUnits > 0
			? Math.round((summary.pickedUnits / summary.totalUnits) * 100)
			: 0;

	function runAction(action: ConfirmKind) {
		startTransition(async () => {
			const result =
				action === "cancel"
					? await cancelPicking(
							picking.id,
							"Cancelada por admin (sessão parada)"
						)
					: await takeoverPicking(picking.id);
			if (result.ok) {
				notify.success(
					action === "cancel" ? "Separação cancelada" : "Separação assumida"
				);
				router.refresh();
			} else {
				notify.error(result.error);
				setConfirming(null);
			}
		});
	}

	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-medium font-serif text-2xl uppercase tracking-[0.015em]">
						Separação em andamento
					</h1>
					<p className="mt-1 text-[13px] text-muted-foreground">
						{picking.pickerName} está separando este pedido · desde{" "}
						{formatTime(picking.startedAt)}
					</p>
				</div>
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					<ArrowLeftIcon aria-hidden className="size-4" />
					Voltar à fila
				</Link>
			</div>

			<div className="mt-4 flex items-center gap-3">
				<div className="h-2.5 flex-1 overflow-hidden rounded-full bg-input">
					<div className="h-full bg-primary" style={{ width: `${pct}%` }} />
				</div>
				<span className="shrink-0 text-[13px] tabular-nums">
					{summary.pickedUnits} / {summary.totalUnits} un
				</span>
			</div>

			{stale && (
				<p className="mt-3 flex items-center gap-1.5 font-medium text-[13px] text-warning">
					<ClockIcon aria-hidden className="size-4" />
					Sem bipagem há {formatRelative(lastScan ?? picking.startedAt)}
				</p>
			)}

			{canManage && (
				<div className="mt-4 flex flex-wrap items-center gap-2 border-border border-t pt-4">
					<ManageActions
						confirming={confirming}
						isPending={isPending}
						onConfirm={() => confirming && runAction(confirming)}
						onSelect={setConfirming}
						pickerName={picking.pickerName}
					/>
				</div>
			)}
		</div>
	);
}
