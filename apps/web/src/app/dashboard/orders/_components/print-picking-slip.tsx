import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";

import type { OrderDetail } from "../data";

interface PrintPickingSlipProps {
	order: OrderDetail;
}

export function PrintPickingSlip({ order }: PrintPickingSlipProps) {
	return (
		<Card className="print:border-0 print:shadow-none">
			<CardHeader>
				<CardTitle className="font-serif text-2xl">
					Romaneio de separação • {order.number}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid gap-2 md:grid-cols-3">
					<div>
						<p className="text-muted-foreground text-xs uppercase tracking-wide">
							Cliente
						</p>
						<p className="text-sm">{order.clientName}</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs uppercase tracking-wide">
							Filial
						</p>
						<p className="text-sm">{order.branchName ?? "Não atribuída"}</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs uppercase tracking-wide">
							Notas do cliente
						</p>
						<p className="text-sm">
							Verifique endereço e embalagem antes do envio.
						</p>
					</div>
				</div>

				<div className="border border-border">
					<div className="grid grid-cols-[1.25fr_3fr_0.75fr] gap-2 border-border border-b px-3 py-2 font-medium text-xs uppercase tracking-wide">
						<span>SKU</span>
						<span>Item</span>
						<span className="text-right">Qtd</span>
					</div>
					{order.items.map((item) => (
						<div
							className="grid grid-cols-[1.25fr_3fr_0.75fr] gap-2 border-border border-b px-3 py-3 text-sm last:border-b-0"
							key={item.id}
						>
							<span className="font-mono text-xs">{item.sku ?? "—"}</span>
							<div className="space-y-1">
								<p className="font-medium">{item.name}</p>
								<p className="text-muted-foreground text-xs">
									{item.model ?? "Sem modelo"}{" "}
									{item.voltage ? `• ${item.voltage}` : ""}
								</p>
							</div>
							<span className="text-right">{item.quantity}</span>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
