import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";

import type { OrderDetail } from "../data";
import { OrderStatusBadge } from "./order-status-badge";

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatCurrency(value: number) {
	return CURRENCY_FORMATTER.format(value);
}

function formatDateTime(value: Date | null) {
	if (!value) {
		return "—";
	}
	return DATE_TIME_FORMATTER.format(value);
}

function formatAddress(order: OrderDetail) {
	const address = order.shippingAddress;
	const line1 = [address.street, address.number].filter(Boolean).join(", ");
	const line2 = [
		address.neighborhood,
		[address.city, address.state].filter(Boolean).join(" - "),
	]
		.filter(Boolean)
		.join(" • ");
	const line3 = [address.zipCode, address.country].filter(Boolean).join(" • ");
	return [address.recipient, line1, line2, line3].filter(Boolean);
}

export function OrderDetailInfo({ order }: { order: OrderDetail }) {
	const addressLines = formatAddress(order);

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-3">
						<span className="font-serif text-2xl">{order.number}</span>
						<OrderStatusBadge status={order.status} />
					</CardTitle>
					<CardDescription>
						Criado em {formatDateTime(order.createdAt)} por {order.clientName}
					</CardDescription>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Itens do pedido</CardTitle>
					<CardDescription>
						Snapshot fiscal imutável capturado no checkout.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Item</TableHead>
								<TableHead>SKU</TableHead>
								<TableHead className="text-right">Qtd</TableHead>
								<TableHead className="text-right">Unitário</TableHead>
								<TableHead className="text-right">Total</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{order.items.map((item) => (
								<TableRow key={item.id}>
									<TableCell>
										<div className="flex flex-col gap-1">
											<span className="font-medium">{item.name}</span>
											<div className="flex flex-wrap gap-2 text-muted-foreground text-xs">
												{item.model && <span>Modelo: {item.model}</span>}
												{item.voltage && <span>Voltagem: {item.voltage}</span>}
												{item.manufacturerName && (
													<span>Marca: {item.manufacturerName}</span>
												)}
											</div>
										</div>
									</TableCell>
									<TableCell className="font-mono text-xs">
										{item.sku ?? "—"}
									</TableCell>
									<TableCell className="text-right">{item.quantity}</TableCell>
									<TableCell className="text-right font-mono text-xs">
										{formatCurrency(item.unitPrice)}
									</TableCell>
									<TableCell className="text-right font-mono text-xs">
										{formatCurrency(item.lineTotal)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<div className="grid gap-4 xl:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Entrega</CardTitle>
						<CardDescription>
							Endereço congelado no momento do checkout.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						{addressLines.map((line) => (
							<p key={line}>{line}</p>
						))}
						<p className="text-muted-foreground">
							Frete: {order.shippingMethod ?? "—"} •{" "}
							{formatCurrency(order.shippingAmount)}
						</p>
						<p className="text-muted-foreground">
							Rastreio: {order.shippingTrackingCode ?? "—"}
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Pagamento</CardTitle>
						<CardDescription>
							Dados recebidos do site ecomerce, somente leitura no admin.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						<p>
							<strong>Status:</strong> {order.paymentStatus}
						</p>
						<p>
							<strong>Método:</strong> {order.paymentMethod ?? "—"}
						</p>
						<p>
							<strong>Ref. gateway:</strong> {order.paymentProviderRef ?? "—"}
						</p>
						<p>
							<strong>Subtotal:</strong> {formatCurrency(order.subtotalAmount)}
						</p>
						<p>
							<strong>Total:</strong> {formatCurrency(order.totalAmount)}
						</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
