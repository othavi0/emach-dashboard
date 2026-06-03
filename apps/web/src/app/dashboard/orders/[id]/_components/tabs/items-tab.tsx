import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
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

import type { OrderDetail } from "../../../data";
import { formatCurrency } from "../../_lib/format-address";

export function ItemsTab({ order }: { order: OrderDetail }) {
	return (
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
							<TableHead className="text-right">Qtd</TableHead>
							<TableHead className="text-right">Unitário</TableHead>
							<TableHead className="text-right">Total</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{order.items.map((item) => (
							<TableRow key={item.id}>
								<TableCell>
									<div className="flex flex-col gap-0.5">
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
								<TableCell className="text-right tabular-nums">
									{item.quantity}
								</TableCell>
								<TableCell className="text-right font-mono text-xs tabular-nums">
									{formatCurrency.format(item.unitPrice)}
								</TableCell>
								<TableCell className="text-right font-mono text-xs tabular-nums">
									{formatCurrency.format(item.lineTotal)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>

			{/* Edge-to-edge metric footer — uses CardFooter which has border-t and -mx padding reset */}
			<CardFooter className="grid grid-cols-4 p-0">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[15px] tabular-nums">
						{formatCurrency.format(order.subtotalAmount)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Subtotal
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[15px] text-success tabular-nums">
						{order.discountAmount > 0
							? `− ${formatCurrency.format(order.discountAmount)}`
							: formatCurrency.format(0)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Desconto
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[15px] tabular-nums">
						{formatCurrency.format(order.shippingAmount)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Frete
					</span>
				</div>
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[15px] text-primary tabular-nums">
						{formatCurrency.format(order.totalAmount)}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Total
					</span>
				</div>
			</CardFooter>
		</Card>
	);
}
