import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Empty, EmptyHeader, EmptyTitle } from "@emach/ui/components/empty";

import { listCustomerOrders } from "../data";
import { CustomerOrdersInfinite } from "./customer-orders-infinite";

export async function CustomerOrdersTable({ clientId }: { clientId: string }) {
	const { items, nextCursor } = await listCustomerOrders({
		clientId,
		cursor: null,
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Pedidos</CardTitle>
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>Nenhum pedido encontrado</EmptyTitle>
						</EmptyHeader>
					</Empty>
				) : (
					<CustomerOrdersInfinite
						clientId={clientId}
						initialCursor={nextCursor}
						initialItems={items}
					/>
				)}
			</CardContent>
		</Card>
	);
}
