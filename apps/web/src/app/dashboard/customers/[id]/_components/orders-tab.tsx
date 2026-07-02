import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Empty, EmptyHeader, EmptyTitle } from "@emach/ui/components/empty";

import type { InfiniteResult } from "@/lib/infinite";
import { CustomerOrdersInfinite } from "../../_components/customer-orders-infinite";
import type { CustomerOrderRow } from "../../data";

interface Props {
	clientId: string;
	first: InfiniteResult<CustomerOrderRow>;
}

export function OrdersTab({ clientId, first }: Props) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Pedidos</CardTitle>
			</CardHeader>
			<CardContent>
				{first.items.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>Nenhum pedido encontrado</EmptyTitle>
						</EmptyHeader>
					</Empty>
				) : (
					<CustomerOrdersInfinite
						clientId={clientId}
						initialCursor={first.nextCursor}
						initialItems={first.items}
					/>
				)}
			</CardContent>
		</Card>
	);
}
