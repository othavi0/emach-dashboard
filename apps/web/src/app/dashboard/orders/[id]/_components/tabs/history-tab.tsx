import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import type { OrderDetail } from "../../../data";
import { OrderHistoryFeed } from "../order-history-feed";

interface HistoryTabProps {
	order: OrderDetail;
}

export function HistoryTab({ order }: HistoryTabProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Histórico &amp; auditoria</CardTitle>
				<CardDescription>
					Tudo que aconteceu no pedido, em ordem. Filtre por tipo.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<OrderHistoryFeed order={order} />
			</CardContent>
		</Card>
	);
}
