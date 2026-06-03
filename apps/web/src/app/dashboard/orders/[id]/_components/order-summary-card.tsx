import { Badge } from "@emach/ui/components/badge";
import type { OrderDetail, OrderStatus } from "../../data";
import {
	formatCurrency as currencyFmt,
	formatDocument,
} from "../_lib/format-address";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
	return currencyFmt.format(value);
}

// ─── SLA helpers ──────────────────────────────────────────────────────────────

const STATUS_SLA_TIMESTAMP: Partial<Record<OrderStatus, keyof OrderDetail>> = {
	pending_payment: "createdAt",
	payment_failed: "createdAt",
	paid: "paidAt",
	preparing: "preparingAt",
	shipped: "shippedAt",
	delivered: "deliveredAt",
	returned: "canceledAt",
	canceled: "canceledAt",
	refunded: "canceledAt",
};

const STATUS_SLA_LABEL: Partial<Record<OrderStatus, string>> = {
	pending_payment: "Aguardando pagamento há",
	payment_failed: "Falha de pagamento há",
	paid: "Pago há",
	preparing: "Em preparação há",
	shipped: "Enviado há",
	delivered: "Entregue há",
	returned: "Devolvido há",
	canceled: "Cancelado há",
	refunded: "Reembolsado há",
};

function computeSlaDays(order: OrderDetail): {
	days: number | null;
	label: string;
} {
	const tsKey = STATUS_SLA_TIMESTAMP[order.status];
	const label = STATUS_SLA_LABEL[order.status] ?? "No estado há";
	if (!tsKey) {
		return { days: null, label };
	}

	const ts = order[tsKey] as Date | null;
	const ref = ts ?? order.createdAt;
	const diffMs = Date.now() - ref.getTime();
	const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	return { days, label };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
	order: OrderDetail;
}

export function OrderSummaryCard({ order }: Props) {
	const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
	const { days: slaDays, label: slaLabel } = computeSlaDays(order);

	return (
		<div className="overflow-hidden rounded-lg border border-border bg-card">
			{/* Top row */}
			<div className="flex flex-wrap gap-6 px-4 pt-4 pb-3">
				{/* Cliente */}
				<div className="flex flex-col gap-0.5">
					<span className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
						Cliente
					</span>
					<span className="text-sm">{order.clientName}</span>
					{(order.clientPhone ?? order.clientDocument) && (
						<span className="text-muted-foreground text-xs">
							{[order.clientPhone, formatDocument(order.clientDocument)]
								.filter(Boolean)
								.join(" · ")}
						</span>
					)}
				</div>

				{/* Filial */}
				<div className="flex flex-col gap-0.5">
					<span className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
						Filial responsável
					</span>
					<span className="text-sm">{order.branchName ?? "—"}</span>
				</div>

				{/* Pagamento */}
				<div className="flex flex-col gap-0.5">
					<span className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
						Pagamento
					</span>
					<span className="flex items-center gap-2 text-sm">
						{order.paymentMethod ?? "—"}
						{order.paidAt ? (
							<Badge variant="success">Pago</Badge>
						) : (
							<Badge variant="secondary">Não pago</Badge>
						)}
					</span>
				</div>

				{/* Observação do cliente */}
				{order.customerNotes && (
					<div className="flex min-w-[200px] flex-1 flex-col gap-0.5 rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
						<span className="font-medium text-[11px] text-amber-500">
							📝 Observação do cliente
						</span>
						<span className="text-xs">{order.customerNotes}</span>
					</div>
				)}
			</div>

			{/* Metric footer */}
			<div className="grid grid-cols-4 border-border border-t">
				{/* Itens */}
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] tabular-nums">
						{totalItems}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Itens
					</span>
				</div>

				{/* Total */}
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[15px] text-primary tabular-nums">
						{formatCurrency(order.totalAmount)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Total
					</span>
				</div>

				{/* Frete */}
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[15px] text-muted-foreground tabular-nums">
						{formatCurrency(order.shippingAmount)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Frete
					</span>
				</div>

				{/* SLA */}
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[18px] text-amber-500 tabular-nums">
						{slaDays === null ? "—" : `${slaDays}d`}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						{slaLabel}
					</span>
				</div>
			</div>
		</div>
	);
}
