import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";

import type { OrderDetail } from "../data";

interface PrintShippingLabelProps {
	order: OrderDetail;
}

export function PrintShippingLabel({ order }: PrintShippingLabelProps) {
	const address = order.shippingAddress;

	return (
		<Card className="mx-auto w-full max-w-xl print:max-w-none print:border-0 print:shadow-none">
			<CardHeader>
				<CardTitle className="font-serif text-2xl">Etiqueta de envio</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-1">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">
						Pedido
					</p>
					<p className="font-serif text-3xl">{order.number}</p>
				</div>

				<div className="space-y-2 text-sm">
					<p className="font-medium">{address.recipient ?? order.clientName}</p>
					<p>
						{address.street}, {address.number}
					</p>
					{address.complement && <p>{address.complement}</p>}
					<p>
						{address.neighborhood} • {address.city} - {address.state}
					</p>
					<p>
						{address.zipCode} • {address.country ?? "BR"}
					</p>
				</div>

				<div className="grid gap-2 border border-border p-3 text-sm">
					<div className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground">Rastreio</span>
						<span className="font-mono">
							{order.shippingTrackingCode ?? "Pendente"}
						</span>
					</div>
					<div className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground">Método</span>
						<span>{order.shippingMethod ?? "—"}</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
