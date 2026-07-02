import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Empty, EmptyHeader, EmptyTitle } from "@emach/ui/components/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { CalendarDays, Receipt, ShoppingCart, Wallet } from "lucide-react";

import {
	EntityKpisRow,
	type KpiItem,
} from "@/components/entity/entity-kpis-row";
import { SwitchTabButton } from "@/components/entity/switch-tab-button";
import { formatDocument } from "@/lib/cpf-cnpj";
import { formatDate, formatDateTime } from "@/lib/format/datetime";
import {
	CLIENT_STATUS_CONFIG,
	CLIENT_TYPE_CONFIG,
	COUNT,
	CURRENCY,
	ORDER_STATUS_LABELS,
} from "../_lib/customer-display";
import type { CustomerDetail, CustomerKpis, CustomerOrderRow } from "../data";

interface Props {
	customer: CustomerDetail;
	kpis: CustomerKpis;
	recentOrders: CustomerOrderRow[];
}

function Field({
	label,
	children,
}: {
	children: React.ReactNode;
	label: string;
}) {
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-muted-foreground text-xs uppercase tracking-wide">
				{label}
			</dt>
			<dd className="text-sm">{children}</dd>
		</div>
	);
}

function lastOrderHint(kpis: CustomerKpis): string | undefined {
	if (!kpis.lastOrderAt) {
		return "Sem pedidos";
	}
	if (kpis.lastOrderStatus) {
		return ORDER_STATUS_LABELS[kpis.lastOrderStatus] ?? kpis.lastOrderStatus;
	}
	return;
}

export function CustomerOverviewTab({ customer, kpis, recentOrders }: Props) {
	const status = CLIENT_STATUS_CONFIG[customer.status];
	const type = customer.clientType
		? CLIENT_TYPE_CONFIG[customer.clientType]
		: null;

	const kpiItems: KpiItem[] = [
		{
			label: "LTV total",
			value: CURRENCY.format(kpis.ltv),
			hint: "receita confirmada",
			icon: Wallet,
		},
		{
			label: "Pedidos",
			value: COUNT.format(kpis.ordersCount),
			hint: "total de pedidos",
			icon: ShoppingCart,
		},
		{
			label: "Ticket médio",
			value: CURRENCY.format(kpis.averageTicket),
			hint: "por pedido pago",
			icon: Receipt,
		},
		{
			label: "Último pedido",
			value: kpis.lastOrderAt ? formatDate(kpis.lastOrderAt) : "—",
			hint: lastOrderHint(kpis),
			icon: CalendarDays,
		},
	];

	return (
		<div className="flex flex-col gap-6">
			<EntityKpisRow items={kpiItems} />

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-sm">Identidade & contato</CardTitle>
					<Badge variant={status.variant}>{status.label}</Badge>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<Field label="Email">
							<span className="flex items-center gap-1.5">
								{customer.email}
								{customer.emailVerified ? (
									<Badge variant="success">Verificado</Badge>
								) : (
									<Badge variant="secondary">Não verificado</Badge>
								)}
							</span>
						</Field>
						<Field label="Telefone">{customer.phone ?? "—"}</Field>
						<Field label="Documento">
							<span className="font-mono">
								{customer.document ? formatDocument(customer.document) : "—"}
							</span>
						</Field>
						<Field label="Tipo">{type ? type.label : "—"}</Field>
						<Field label="Cliente desde">
							{formatDate(customer.createdAt)} · há {kpis.daysSinceCreated}{" "}
							{kpis.daysSinceCreated === 1 ? "dia" : "dias"}
						</Field>
						<Field label="Visto por último">
							{customer.lastSeenAt ? formatDateTime(customer.lastSeenAt) : "—"}
						</Field>
						<Field label="Notas internas">
							<span className="whitespace-pre-wrap">
								{customer.internalNotes ?? "—"}
							</span>
						</Field>
					</dl>
					<div className="-mx-4 mt-4 -mb-4 border-border border-t">
						<div className="flex flex-col items-center py-2.5">
							<span className="font-medium font-mono text-[13px] text-foreground">
								{customer.id}
							</span>
							<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
								ID do cliente
							</span>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-sm">Últimos pedidos</CardTitle>
					<SwitchTabButton
						className="text-primary text-xs hover:underline"
						tab="pedidos"
					>
						Ver tudo
					</SwitchTabButton>
				</CardHeader>
				<CardContent>
					{recentOrders.length === 0 ? (
						<Empty>
							<EmptyHeader>
								<EmptyTitle>Nenhum pedido ainda</EmptyTitle>
							</EmptyHeader>
						</Empty>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Número</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Total</TableHead>
									<TableHead className="text-right">Data</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{recentOrders.map((order) => (
									<TableRow key={order.id}>
										<TableCell className="font-mono text-sm">
											{order.number}
										</TableCell>
										<TableCell>
											<Badge variant="secondary">
												{ORDER_STATUS_LABELS[order.status] ?? order.status}
											</Badge>
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{CURRENCY.format(order.totalAmount)}
										</TableCell>
										<TableCell className="text-right text-muted-foreground text-sm">
											{formatDate(order.createdAt)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
